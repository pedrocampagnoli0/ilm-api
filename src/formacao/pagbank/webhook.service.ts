import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PagbankService } from './pagbank.service.js';
import {
  extrairCelular,
  extrairCpf,
  loteDaReferencia,
  metodoDaCobranca,
  pagoEm,
  texto,
  valorLiquido,
} from './extrair.js';
import {
  STATUS_CANCELA,
  STATUS_CONFIRMA,
  type PagbankCobranca,
  type PagbankNotificacao,
} from './tipos.js';

export interface ResultadoCobranca {
  cobranca: string;
  /** Status que ficou GRAVADO, que nem sempre é o que o evento pediu. */
  status: string | null;
  observacao?: string;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pagbank: PagbankService,
  ) {}

  /**
   * Processa uma notificação do PagBank.
   *
   * Lança em falha de banco de propósito: o controller devolve 500 e o reenvio do
   * PagBank vira a rede de segurança. Engolir a notificação perderia a venda para
   * sempre — não há tela de reenvio no PagBank.
   */
  async processar(corpo: PagbankNotificacao): Promise<ResultadoCobranca[]> {
    // Notificação de checkout (EXPIRED, por exemplo) não tem `charges` e não move venda.
    const cobrancas = Array.isArray(corpo?.charges) ? corpo.charges : [];
    if (cobrancas.length === 0) return [];

    const resultados: ResultadoCobranca[] = [];
    for (const cobranca of cobrancas) {
      resultados.push(await this.processarCobranca(corpo, cobranca));
    }
    return resultados;
  }

  private async processarCobranca(
    corpo: PagbankNotificacao,
    cobranca: PagbankCobranca,
  ): Promise<ResultadoCobranca> {
    const cobrancaId = cobranca?.id;
    const status = cobranca?.status ?? '';
    if (!cobrancaId) return { cobranca: '(sem id)', status: null };

    const confirma = status === STATUS_CONFIRMA;
    const cancela = STATUS_CANCELA.has(status);
    if (!confirma && !cancela) {
      // WAITING / IN_ANALYSIS / AUTHORIZED são passagem: não mexem em vaga.
      return { cobranca: cobrancaId, status: null, observacao: `ignorado ${status}` };
    }

    // Idempotência: a entrega é at-least-once e o payload NÃO tem id de evento. A chave
    // é a cobrança mais o status, que é o que de fato muda o banco.
    const eventoChave = `${cobrancaId}:${status}`;
    const jaVisto = await this.prisma.formacao_webhook_evento.findUnique({
      where: { evento_id: eventoChave },
      select: { evento_id: true },
    });
    if (jaVisto) {
      return { cobranca: cobrancaId, status: 'repetido' };
    }

    // O reference_id da COBRANÇA tem precedência sobre o do pedido: numa compra com
    // mais de um item, é ele que diz de qual lote esta cobrança é.
    const loteId =
      loteDaReferencia(cobranca?.reference_id) ??
      loteDaReferencia(corpo?.reference_id);

    const lote = loteId
      ? await this.prisma.formacao_lote.findUnique({
          where: { id: loteId },
          select: {
            id: true,
            evento_id: true,
            vagas_por_compra: true,
            preco_centavos: true,
            nome: true,
          },
        })
      : null;

    if (!lote && confirma) {
      // Venda de verdade que entrou sem dar para saber de qual lote é. Registrar órfã é
      // melhor que perder: dá para reconciliar depois olhando o extrato.
      this.logger.warn(
        `sem lote para a cobrança ${cobrancaId} — ref ${cobranca?.reference_id ?? corpo?.reference_id ?? '(nenhuma)'}`,
      );
    }

    const valor = valorLiquido(cobranca?.amount);

    // Divergência de valor é sinal de que alguém mexeu na quantidade na tela do PagBank
    // ou de que o lote foi editado depois do link criado. Grava a venda de qualquer
    // jeito — o dinheiro entrou — mas deixa rastro no log para revisão.
    if (lote && confirma && valor !== null && valor !== lote.preco_centavos) {
      this.logger.warn(
        `valor divergente na cobrança ${cobrancaId}: recebido ${valor}, lote "${lote.nome}" vale ${lote.preco_centavos}`,
      );
    }

    const cliente = corpo?.customer;
    const gravado = await this.gravarVenda({
      cobrancaId,
      pedidoId: texto(corpo?.id, 120),
      loteId: lote?.id ?? null,
      eventoId: lote?.evento_id ?? null,
      vagas: lote?.vagas_por_compra ?? 1,
      valorCentavos: valor,
      status: confirma ? 'confirmada' : 'cancelada',
      compradorNome: texto(cliente?.name, 120),
      compradorEmail: texto(cliente?.email, 255),
      compradorCelular: extrairCelular(cliente),
      compradorCpf: extrairCpf(cliente),
      // Mesmo vocabulário do sync legado: o painel de insights lê a coluna sem saber
      // por qual caminho a venda entrou.
      metodo: metodoDaCobranca(cobranca),
      parcelas: cobranca?.payment_method?.installments ?? null,
      pagoEm: confirma ? pagoEm(cobranca) : null,
    });

    // O registro de idempotência vem DEPOIS de gravar a venda: se algo falhar no meio,
    // o reenvio reprocessa em vez de sumir com a venda.
    await this.prisma.formacao_webhook_evento.create({
      data: { evento_id: eventoChave, evento: status },
    });

    // Fecha a porta assim que a turma lota. Existe uma janela de segundos entre o
    // último pagamento e a inativação — tratada como operacional, via flag `excedente`
    // na listagem administrativa.
    if (confirma && lote?.evento_id) {
      await this.inativarSeLotou(lote.evento_id);
    }

    return { cobranca: cobrancaId, status: gravado };
  }

  /**
   * Upsert da venda.
   *
   * SQL cru porque o `ON CONFLICT` precisa de dois comportamentos que o `upsert` do
   * Prisma não expressa:
   *
   * - **`CASE` no status:** `CANCELED` pode chegar ANTES de `PAID` (boleto vencido,
   *   entrega fora de ordem). Uma vez cancelada, a venda não reabre.
   * - **`COALESCE` nos dados do comprador e do lote:** a notificação de cancelamento
   *   frequentemente não traz `customer`. Sem o coalesce, ela apagaria o nome e o
   *   e-mail que a de pagamento tinha gravado.
   */
  private async gravarVenda(v: {
    cobrancaId: string;
    pedidoId: string | null;
    loteId: string | null;
    eventoId: string | null;
    vagas: number;
    valorCentavos: number | null;
    status: 'confirmada' | 'cancelada';
    compradorNome: string | null;
    compradorEmail: string | null;
    compradorCelular: string | null;
    compradorCpf: string | null;
    metodo: string | null;
    parcelas: number | null;
    pagoEm: Date | null;
  }): Promise<string | null> {
    const ambiente = this.pagbank.ambiente;

    const linhas = await this.prisma.$queryRaw<Array<{ status: string }>>(
      Prisma.sql`
        INSERT INTO public.formacao_venda (
          cobranca_id, pedido_id, lote_id, evento_id, vagas, valor_centavos,
          origem, ambiente, status,
          comprador_nome, comprador_email, comprador_celular, comprador_cpf,
          metodo_pagamento, parcelas, pago_em,
          updated_at
        ) VALUES (
          ${v.cobrancaId}, ${v.pedidoId},
          ${v.loteId}::uuid, ${v.eventoId}::uuid,
          ${v.vagas}, ${v.valorCentavos},
          'pagbank', ${ambiente}, ${v.status},
          ${v.compradorNome}, ${v.compradorEmail}, ${v.compradorCelular}, ${v.compradorCpf},
          ${v.metodo}, ${v.parcelas}, ${v.pagoEm},
          now()
        )
        ON CONFLICT (cobranca_id) DO UPDATE SET
          pedido_id      = COALESCE(excluded.pedido_id, formacao_venda.pedido_id),
          lote_id        = COALESCE(excluded.lote_id, formacao_venda.lote_id),
          evento_id      = COALESCE(excluded.evento_id, formacao_venda.evento_id),
          vagas          = excluded.vagas,
          valor_centavos = COALESCE(excluded.valor_centavos, formacao_venda.valor_centavos),
          status         = CASE
                             WHEN formacao_venda.status = 'cancelada' THEN 'cancelada'
                             ELSE excluded.status
                           END,
          comprador_nome    = COALESCE(excluded.comprador_nome, formacao_venda.comprador_nome),
          comprador_email   = COALESCE(excluded.comprador_email, formacao_venda.comprador_email),
          comprador_celular = COALESCE(excluded.comprador_celular, formacao_venda.comprador_celular),
          comprador_cpf     = COALESCE(excluded.comprador_cpf, formacao_venda.comprador_cpf),
          metodo_pagamento  = COALESCE(excluded.metodo_pagamento, formacao_venda.metodo_pagamento),
          parcelas          = COALESCE(excluded.parcelas, formacao_venda.parcelas),
          -- Cancelamento não traz paid_at: sem o COALESCE, um estorno apagaria a data
          -- do pagamento e a venda sumiria da série temporal.
          pago_em           = COALESCE(excluded.pago_em, formacao_venda.pago_em),
          updated_at        = now()
        RETURNING status
      `,
    );

    return linhas[0]?.status ?? null;
  }

  /**
   * Inativa todos os checkouts do evento quando as vagas acabam.
   *
   * Nunca deixa a inativação derrubar o webhook: se o PagBank recusar, a venda já está
   * gravada e o log registra. Devolver 500 aqui faria o PagBank reenviar uma
   * notificação que já foi processada com sucesso.
   */
  private async inativarSeLotou(eventoId: string): Promise<void> {
    try {
      const evento = await this.prisma.formacao_evento.findUnique({
        where: { id: eventoId },
        select: { vagas: true, slug: true },
      });
      if (!evento?.vagas) return; // sem capacidade definida, nunca esgota sozinho

      const agregado = await this.prisma.formacao_venda.aggregate({
        where: { evento_id: eventoId, status: 'confirmada', ambiente: 'producao' },
        _sum: { vagas: true },
      });
      const vendidas = agregado._sum.vagas ?? 0;
      if (vendidas < evento.vagas) return;

      const lotes = await this.prisma.formacao_lote.findMany({
        where: { evento_id: eventoId, checkout_id: { not: null } },
        select: { id: true, checkout_id: true, nome: true },
      });
      if (lotes.length === 0) return;

      this.logger.warn(
        `evento ${evento.slug} lotou (${vendidas}/${evento.vagas}) — inativando ${lotes.length} checkout(s)`,
      );

      for (const lote of lotes) {
        try {
          await this.pagbank.inativar(lote.checkout_id as string);
          await this.prisma.formacao_lote.update({
            where: { id: lote.id },
            data: { checkout_id: null, checkout_url: null, checkout_ambiente: null },
          });
        } catch (e) {
          this.logger.error(
            `falha ao inativar o checkout do lote "${lote.nome}": ${(e as Error).message}`,
          );
        }
      }
    } catch (e) {
      this.logger.error(
        `falha na inativação automática do evento ${eventoId}: ${(e as Error).message}`,
      );
    }
  }
}
