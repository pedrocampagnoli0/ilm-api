import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import { AbilityFactory } from '../../common/casl/ability.factory.js';
import type { AuthenticatedUser } from '../../common/auth/interfaces/authenticated-user.interface.js';
import { PagbankLegadoClient } from './legado.client.js';
import {
  classificarStatus,
  codigoPagAe,
  referenciaDoCodigo,
  type TransacaoLegada,
} from './parse.js';

export interface ResultadoLote {
  lote: string;
  cidade: string;
  link: string;
  encontradas: number;
  novas: number;
  atualizadas: number;
  /** Aguardando pagamento, em análise, disputa: não mexem em vaga. */
  ignoradas: number;
  erro?: string;
}

export interface ResultadoSync {
  executado: boolean;
  motivo?: string;
  links: number;
  novas: number;
  atualizadas: number;
  detalhes: ResultadoLote[];
}

export interface LinkDesconhecido {
  referencia: string;
  descricao: string | null;
  pagas: number;
  valor_centavos: number;
  primeira: string | null;
  ultima: string | null;
}

/**
 * Importa para o portal as vendas dos links `pag.ae` criados à mão no painel.
 *
 * Por que isso existe, em uma frase: sem a allowlist do Checkout não há link novo, e
 * sem link novo o webhook nunca dispara — mas as turmas estão vendendo hoje, e o portal
 * precisa contar essas vagas para o selo do site não mentir.
 *
 * O vínculo com a turma é o `checkout_url` do lote: o código do link `pag.ae` é o
 * `reference` de toda transação que aquele link gerou. Nenhuma heurística por valor ou
 * por data — se o link não estiver cadastrado num lote, a venda simplesmente não entra
 * (e aparece em `descobrir()` para alguém cadastrar).
 *
 * **Isto é polling, não notificação.** Uma venda leva até um ciclo de cron para
 * aparecer. É aceitável porque o número que importa — quantas vagas restam — tolera
 * meia hora de atraso; o que não toleraria é ficar sem número nenhum.
 */
@Injectable()
export class PagbankLegadoService {
  private readonly logger = new Logger(PagbankLegadoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly abilityFactory: AbilityFactory,
    private readonly cliente: PagbankLegadoClient,
  ) {}

  /**
   * Mesma porta das outras telas de formação: só `administrador`, nem `ilm`.
   *
   * Fica aqui, e não só no controller, porque a regra vive espelhada em três camadas
   * (CASL, RLS e rota) e é a checagem do serviço que sobrevive a alguém expor o método
   * por outro caminho. O cron chama `sincronizar()` direto — ele não tem usuário.
   */
  assertPode(user: AuthenticatedUser): void {
    const ability = this.abilityFactory.createForUser(user);
    if (!ability.can('update', 'formacao_lote')) {
      throw new ForbiddenException('Apenas o perfil administrador sincroniza vendas.');
    }
  }

  private get emProducao(): boolean {
    return this.config.get<string>('PAGBANK_AMBIENTE') === 'producao';
  }

  /** Por que o sync não pode rodar agora, ou `null` se pode. */
  private impedimento(): string | null {
    if (!this.emProducao) {
      return 'PAGBANK_AMBIENTE não é produção — links pag.ae só existem na conta real.';
    }
    if (!this.cliente.configurado) {
      return 'PAGBANK_EMAIL não configurado — a API legada autentica por e-mail + token.';
    }
    return null;
  }

  /**
   * Garante que só uma máquina rode o ciclo.
   *
   * O `ilm-api` roda em duas máquinas no Fly, e cada uma tem seu próprio agendador: no
   * primeiro ciclo real as duas dispararam juntas e bateram na API legada em dobro. Não
   * chega a corromper nada — o upsert é idempotente —, mas é o dobro de requisições numa
   * API lenta, e duas leituras concorrentes do mesmo link podem gravar a mesma venda
   * duas vezes com valores diferentes se o status mudar no meio.
   *
   * A eleição é o próprio banco: quem consegue inserir a chave do ciclo, roda. `INSERT
   * ... ON CONFLICT DO NOTHING` numa PK é atômico, não precisa de lock nem de sessão
   * presa — que é o problema de `pg_advisory_lock` com pool de conexões.
   *
   * Reaproveita `formacao_webhook_evento`, a tabela de "isto já foi processado". São 48
   * linhas por dia.
   */
  private async ganhouOCiclo(): Promise<boolean> {
    const marca = new Date();
    marca.setSeconds(0, 0);
    marca.setMinutes(marca.getMinutes() < 30 ? 0 : 30);
    const chave = `legado:ciclo:${marca.toISOString().slice(0, 16)}`;

    const inseridos = await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO public.formacao_webhook_evento (evento_id, evento)
      VALUES (${chave}, 'sync-legado')
      ON CONFLICT (evento_id) DO NOTHING
    `);

    return inseridos > 0;
  }

  /** Ciclo agendado: sai calado se outra máquina já pegou este. */
  async sincronizarAgendado(): Promise<ResultadoSync> {
    if (!(await this.ganhouOCiclo())) {
      return {
        executado: false,
        motivo: 'outra máquina já está rodando este ciclo',
        links: 0,
        novas: 0,
        atualizadas: 0,
        detalhes: [],
      };
    }
    return this.sincronizar();
  }

  async sincronizar(): Promise<ResultadoSync> {
    const impedimento = this.impedimento();
    if (impedimento) {
      return { executado: false, motivo: impedimento, links: 0, novas: 0, atualizadas: 0, detalhes: [] };
    }

    const lotes = await this.prisma.formacao_lote.findMany({
      where: { checkout_url: { contains: 'pag.ae' } },
      select: {
        id: true,
        nome: true,
        checkout_url: true,
        vagas_por_compra: true,
        evento_id: true,
        evento: { select: { cidade: true } },
      },
    });

    const detalhes: ResultadoLote[] = [];

    for (const lote of lotes) {
      const codigo = codigoPagAe(lote.checkout_url);
      if (!codigo) continue;

      try {
        detalhes.push(
          await this.sincronizarLote({
            loteId: lote.id,
            eventoId: lote.evento_id,
            nome: lote.nome,
            cidade: lote.evento.cidade,
            vagas: lote.vagas_por_compra,
            codigo,
          }),
        );
      } catch (e) {
        // Um link fora do ar não pode derrubar a sincronização dos outros dezoito.
        this.logger.error(
          `falha ao sincronizar o lote "${lote.nome}" (${codigo}): ${(e as Error).message}`,
        );
        detalhes.push({
          lote: lote.nome,
          cidade: lote.evento.cidade,
          link: codigo,
          encontradas: 0,
          novas: 0,
          atualizadas: 0,
          ignoradas: 0,
          erro: (e as Error).message,
        });
      }
    }

    const novas = detalhes.reduce((n, d) => n + d.novas, 0);
    const atualizadas = detalhes.reduce((n, d) => n + d.atualizadas, 0);

    if (novas || atualizadas) {
      this.logger.log(
        `sync legado: ${novas} venda(s) nova(s), ${atualizadas} atualizada(s) em ${detalhes.length} link(s)`,
      );
    }

    return { executado: true, links: detalhes.length, novas, atualizadas, detalhes };
  }

  private async sincronizarLote(lote: {
    loteId: string;
    eventoId: string;
    nome: string;
    cidade: string;
    vagas: number;
    codigo: string;
  }): Promise<ResultadoLote> {
    const transacoes = await this.cliente.porReferencia(referenciaDoCodigo(lote.codigo));

    // Uma consulta só para saber o que já está gravado: o detalhe de cada transação
    // custa uma requisição, e reprocessar 200 vendas paradas a cada meia hora seria
    // desperdício puro.
    const existentes = new Map(
      (
        await this.prisma.formacao_venda.findMany({
          where: { cobranca_id: { in: transacoes.map((t) => t.codigo) } },
          select: { cobranca_id: true, status: true },
        })
      ).map((v) => [v.cobranca_id, v.status]),
    );

    let novas = 0;
    let atualizadas = 0;
    let ignoradas = 0;

    for (const transacao of transacoes) {
      const destino = classificarStatus(transacao.status);
      if (!destino) {
        ignoradas++;
        continue;
      }

      const atual = existentes.get(transacao.codigo);
      if (atual === destino) continue;

      // A busca não traz comprador nem taxa; o detalhe traz. Se ele falhar, grava com o
      // que veio da busca: perder o nome do inscrito é ruim, perder a vaga é pior.
      let completa = transacao;
      try {
        completa = (await this.cliente.detalhe(transacao.codigo)) ?? transacao;
      } catch (e) {
        this.logger.warn(
          `detalhe indisponível para ${transacao.codigo}: ${(e as Error).message}`,
        );
      }

      await this.gravar(completa, destino, lote);
      if (atual === undefined) novas++;
      else atualizadas++;
    }

    return {
      lote: lote.nome,
      cidade: lote.cidade,
      link: lote.codigo,
      encontradas: transacoes.length,
      novas,
      atualizadas,
      ignoradas,
    };
  }

  /**
   * Upsert da venda importada.
   *
   * SQL cru pelo mesmo motivo do webhook: o `ON CONFLICT` precisa de `CASE` no status —
   * um estorno que chega e depois some do resultado da busca não pode reabrir a venda —
   * e de `COALESCE` nos dados do comprador, para uma releitura sem detalhe não apagar o
   * nome que já estava lá.
   */
  private async gravar(
    t: TransacaoLegada,
    status: 'confirmada' | 'cancelada',
    lote: { loteId: string; eventoId: string; vagas: number },
  ): Promise<void> {
    // Preferir a soma dos itens ao bruto: no parcelado, o bruto inclui os juros que o
    // comprador pagou ao PagBank, que nunca foram receita do ILM.
    const valor = t.itensCentavos ?? t.brutoCentavos;

    const pagoEm = t.data ? new Date(t.data) : null;
    const pagoValido = pagoEm && !Number.isNaN(pagoEm.getTime()) ? pagoEm : null;

    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO public.formacao_venda (
        cobranca_id, lote_id, evento_id, vagas, valor_centavos,
        origem, ambiente, status, observacao,
        comprador_nome, comprador_email, comprador_celular, comprador_cpf,
        pago_em, metodo_pagamento, parcelas, taxa_centavos, updated_at
      ) VALUES (
        ${t.codigo}, ${lote.loteId}::uuid, ${lote.eventoId}::uuid,
        ${lote.vagas}, ${valor},
        'pagbank_legado', 'producao', ${status}, ${t.descricao},
        ${t.nome}, ${t.email}, ${t.celular}, ${t.cpf},
        ${pagoValido}, ${t.metodo}, ${t.parcelas}, ${t.taxaCentavos}, now()
      )
      ON CONFLICT (cobranca_id) DO UPDATE SET
        lote_id        = COALESCE(excluded.lote_id, formacao_venda.lote_id),
        evento_id      = COALESCE(excluded.evento_id, formacao_venda.evento_id),
        vagas          = excluded.vagas,
        valor_centavos = COALESCE(excluded.valor_centavos, formacao_venda.valor_centavos),
        status         = CASE
                           WHEN formacao_venda.status = 'cancelada' THEN 'cancelada'
                           ELSE excluded.status
                         END,
        observacao        = COALESCE(excluded.observacao, formacao_venda.observacao),
        comprador_nome    = COALESCE(excluded.comprador_nome, formacao_venda.comprador_nome),
        comprador_email   = COALESCE(excluded.comprador_email, formacao_venda.comprador_email),
        comprador_celular = COALESCE(excluded.comprador_celular, formacao_venda.comprador_celular),
        comprador_cpf     = COALESCE(excluded.comprador_cpf, formacao_venda.comprador_cpf),
        pago_em           = COALESCE(excluded.pago_em, formacao_venda.pago_em),
        metodo_pagamento  = COALESCE(excluded.metodo_pagamento, formacao_venda.metodo_pagamento),
        parcelas          = COALESCE(excluded.parcelas, formacao_venda.parcelas),
        taxa_centavos     = COALESCE(excluded.taxa_centavos, formacao_venda.taxa_centavos),
        updated_at        = now()
    `);
  }

  /**
   * Links com venda na conta que NÃO estão cadastrados em nenhum lote.
   *
   * Existe porque a primeira leitura real da conta mostrou que isso não é exceção: São
   * Paulo vendeu por quatro links que o portal não conhece, e Goiânia teve um link de
   * lote 1 substituído por outro — 44 inscrições que ninguém contaria. Enquanto a venda
   * for por link criado à mão, essa lista é o inventário do que está fora do sistema.
   *
   * Varre por período porque não há como listar links: a busca por data é o único jeito
   * de descobrir referências que ainda não conhecemos. Janela de 25 dias por chamada
   * (a API recusa mais de 30) e no máximo ~6 meses para trás, que é o que ela guarda.
   */
  async descobrir(dias = 180): Promise<{ executado: boolean; motivo?: string; links: LinkDesconhecido[] }> {
    const impedimento = this.impedimento();
    if (impedimento) return { executado: false, motivo: impedimento, links: [] };

    const conhecidos = new Set(
      (
        await this.prisma.formacao_lote.findMany({
          where: { checkout_url: { contains: 'pag.ae' } },
          select: { checkout_url: true },
        })
      )
        .map((l) => codigoPagAe(l.checkout_url))
        .filter((c): c is string => c !== null)
        .map(referenciaDoCodigo),
    );

    const porReferencia = new Map<string, TransacaoLegada[]>();
    const fim = new Date();
    const inicio = new Date(fim.getTime() - dias * 24 * 3600 * 1000);

    for (let de = new Date(inicio); de < fim; de.setDate(de.getDate() + 25)) {
      const ate = new Date(Math.min(de.getTime() + 25 * 24 * 3600 * 1000, fim.getTime()));
      let transacoes: TransacaoLegada[];
      try {
        transacoes = await this.cliente.porPeriodo(de, ate);
      } catch (e) {
        // A API recusa janelas fora do retroativo que ela guarda; seguir é o certo.
        this.logger.warn(
          `descoberta: janela ${de.toISOString().slice(0, 10)} recusada — ${(e as Error).message}`,
        );
        continue;
      }
      for (const t of transacoes) {
        if (!t.referencia || conhecidos.has(t.referencia)) continue;
        const lista = porReferencia.get(t.referencia) ?? [];
        lista.push(t);
        porReferencia.set(t.referencia, lista);
      }
    }

    const links: LinkDesconhecido[] = [];
    for (const [referencia, lista] of porReferencia) {
      const pagas = lista.filter((t) => classificarStatus(t.status) === 'confirmada');
      if (pagas.length === 0) continue;

      const datas = pagas.map((t) => t.data ?? '').filter(Boolean).sort();

      // Uma consulta de detalhe por link, só para saber o nome do produto — é o que
      // permite a alguém reconhecer "São Paulo lote 1" e cadastrar no lote certo.
      let descricao: string | null = null;
      try {
        descricao = (await this.cliente.detalhe(pagas[0].codigo))?.descricao ?? null;
      } catch {
        descricao = null;
      }

      links.push({
        referencia,
        descricao,
        pagas: pagas.length,
        valor_centavos: pagas.reduce((n, t) => n + (t.itensCentavos ?? t.brutoCentavos ?? 0), 0),
        primeira: datas[0] ?? null,
        ultima: datas[datas.length - 1] ?? null,
      });
    }

    links.sort((a, b) => b.pagas - a.pagas);
    return { executado: true, links };
  }
}
