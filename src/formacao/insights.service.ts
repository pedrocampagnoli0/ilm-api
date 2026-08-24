import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AbilityFactory } from '../common/casl/ability.factory.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';

/**
 * Números de venda das formações, para a aba de insights do painel.
 *
 * Tudo aqui sai de `formacao_venda` — nada é consultado no PagBank em tempo de tela. O
 * que enche essa tabela é o webhook (venda nova) e o sync legado (links `pag.ae`).
 *
 * Duas regras que valem para TODA consulta deste arquivo:
 *
 * 1. **`ambiente = 'producao'`.** Venda de sandbox mora na mesma tabela de propósito;
 *    sem o filtro, um teste de R$ 5,00 entra no ticket médio e fecha turma real.
 * 2. **`coalesce(pago_em, created_at)`.** `created_at` é quando a linha foi gravada —
 *    para venda importada isso é o dia da importação. Usar `created_at` numa série
 *    temporal mostraria centenas de vendas num único dia. `pago_em` é a data real.
 */
@Injectable()
export class InsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  private assertPode(user: AuthenticatedUser) {
    const ability = this.abilityFactory.createForUser(user);
    if (!ability.can('read', 'formacao_evento')) {
      throw new ForbiddenException('Apenas o perfil administrador vê os insights.');
    }
  }

  async gerar(user: AuthenticatedUser) {
    this.assertPode(user);

    const [resumo, turmas, serie, antecedencia, metodos, precos, alertas] =
      await Promise.all([
        this.resumo(),
        this.turmas(),
        this.serie(),
        this.antecedencia(),
        this.metodos(),
        this.precos(),
        this.alertas(),
      ]);

    return { gerado_em: new Date().toISOString(), resumo, turmas, serie, antecedencia, metodos, precos, alertas };
  }

  private async resumo() {
    const [r] = await this.prisma.$queryRaw<
      Array<{
        inscricoes: bigint | null;
        receita: bigint | null;
        taxas: bigint | null;
        compradores: bigint | null;
        vendas: bigint | null;
      }>
    >(Prisma.sql`
      SELECT sum(vagas)                             AS inscricoes,
             sum(valor_centavos)                    AS receita,
             sum(taxa_centavos)                     AS taxas,
             count(DISTINCT lower(comprador_email)) AS compradores,
             count(*)                               AS vendas
      FROM public.formacao_venda
      WHERE status = 'confirmada' AND ambiente = 'producao'
    `);

    const inscricoes = Number(r?.inscricoes ?? 0);
    const receita = Number(r?.receita ?? 0);

    return {
      inscricoes,
      vendas: Number(r?.vendas ?? 0),
      receita_centavos: receita,
      taxas_centavos: Number(r?.taxas ?? 0),
      // Por inscrição, não por transação: um pacote em grupo é uma venda e N vagas.
      ticket_medio_centavos: inscricoes > 0 ? Math.round(receita / inscricoes) : 0,
      compradores: Number(r?.compradores ?? 0),
    };
  }

  /**
   * Uma linha por turma, com ritmo e projeção.
   *
   * A projeção é deliberadamente ingênua — média das últimas 4 semanas estendida até a
   * data do evento. Não é previsão: é "se continuar assim, termina em tanto", que é o
   * suficiente para decidir capacidade e para enxergar turma que parou de vender.
   */
  private async turmas() {
    const linhas = await this.prisma.$queryRaw<
      Array<{
        id: string;
        cidade: string;
        data: Date;
        vagas: number | null;
        vendidas: bigint | null;
        receita: bigint | null;
        recentes: bigint | null;
        ultima: Date | null;
      }>
    >(Prisma.sql`
      SELECT e.id, e.cidade, e.data, e.vagas,
             sum(v.vagas)          FILTER (WHERE v.status = 'confirmada') AS vendidas,
             sum(v.valor_centavos) FILTER (WHERE v.status = 'confirmada') AS receita,
             sum(v.vagas)          FILTER (WHERE v.status = 'confirmada'
                                    AND coalesce(v.pago_em, v.created_at) >= now() - interval '28 days') AS recentes,
             max(coalesce(v.pago_em, v.created_at)) FILTER (WHERE v.status = 'confirmada') AS ultima
      FROM public.formacao_evento e
      LEFT JOIN public.formacao_venda v
             ON v.evento_id = e.id AND v.ambiente = 'producao'
      GROUP BY e.id, e.cidade, e.data, e.vagas
      ORDER BY e.data
    `);

    const hoje = new Date();

    return linhas.map((l) => {
      const vendidas = Number(l.vendidas ?? 0);
      const porSemana = Number(l.recentes ?? 0) / 4;
      const dias = Math.round(
        (new Date(l.data).getTime() - hoje.getTime()) / (24 * 3600 * 1000),
      );

      return {
        evento_id: l.id,
        cidade: l.cidade,
        data: new Date(l.data).toISOString().slice(0, 10),
        vagas: l.vagas,
        vendidas,
        restantes: l.vagas === null ? null : l.vagas - vendidas,
        receita_centavos: Number(l.receita ?? 0),
        dias_para_evento: dias,
        por_semana: Math.round(porSemana * 10) / 10,
        // Evento passado não projeta: o número dele já é final.
        projecao: dias > 0 ? Math.round(vendidas + porSemana * (dias / 7)) : null,
        ultima_venda: l.ultima ? new Date(l.ultima).toISOString() : null,
      };
    });
  }

  /** Vendas por semana nas últimas 16 — a curva que mostra aceleração e parada. */
  private async serie() {
    const linhas = await this.prisma.$queryRaw<
      Array<{ semana: Date; vendas: bigint | null; receita: bigint | null }>
    >(Prisma.sql`
      SELECT date_trunc('week', coalesce(pago_em, created_at))::date AS semana,
             sum(vagas)                                              AS vendas,
             sum(valor_centavos)                                     AS receita
      FROM public.formacao_venda
      WHERE status = 'confirmada' AND ambiente = 'producao'
        AND coalesce(pago_em, created_at) >= now() - interval '16 weeks'
      GROUP BY 1
      ORDER BY 1
    `);

    return linhas.map((l) => ({
      semana: new Date(l.semana).toISOString().slice(0, 10),
      vendas: Number(l.vendas ?? 0),
      receita_centavos: Number(l.receita ?? 0),
    }));
  }

  /**
   * Quantos dias antes do evento a pessoa comprou.
   *
   * É o que responde "ainda dá tempo de encher esta turma?": se 90% das vendas de toda
   * turma acontecem com mais de 30 dias de antecedência, uma turma a 20 dias com metade
   * das vagas não enche mais — e o que resolve é preço ou divulgação, não esperar.
   */
  private async antecedencia() {
    const linhas = await this.prisma.$queryRaw<Array<{ faixa: string; vendas: bigint | null }>>(
      Prisma.sql`
        SELECT CASE
                 WHEN dias > 90 THEN '90+'
                 WHEN dias > 60 THEN '61-90'
                 WHEN dias > 30 THEN '31-60'
                 WHEN dias > 14 THEN '15-30'
                 WHEN dias > 7  THEN '8-14'
                 WHEN dias >= 0 THEN '0-7'
                 ELSE 'após'
               END AS faixa,
               sum(vagas) AS vendas
        FROM (
          SELECT v.vagas,
                 (e.data - coalesce(v.pago_em, v.created_at)::date) AS dias
          FROM public.formacao_venda v
          JOIN public.formacao_evento e ON e.id = v.evento_id
          WHERE v.status = 'confirmada' AND v.ambiente = 'producao'
        ) t
        GROUP BY 1
      `,
    );

    const ordem = ['90+', '61-90', '31-60', '15-30', '8-14', '0-7', 'após'];
    const mapa = new Map(linhas.map((l) => [l.faixa, Number(l.vendas ?? 0)]));
    return ordem
      .map((faixa) => ({ faixa, vendas: mapa.get(faixa) ?? 0 }))
      .filter((f) => f.vendas > 0);
  }

  /**
   * Distribuição por meio de pagamento, com taxa e cancelamento.
   *
   * O cancelamento por método é o número mais acionável daqui: boleto emitido e não
   * pago some da conta como "cancelada", e a proporção disso decide se vale continuar
   * oferecendo boleto no checkout.
   */
  private async metodos() {
    const linhas = await this.prisma.$queryRaw<
      Array<{
        metodo: string | null;
        vendas: bigint | null;
        receita: bigint | null;
        taxa: bigint | null;
        canceladas: bigint | null;
      }>
    >(Prisma.sql`
      SELECT metodo_pagamento AS metodo,
             count(*)              FILTER (WHERE status = 'confirmada') AS vendas,
             sum(valor_centavos)   FILTER (WHERE status = 'confirmada') AS receita,
             sum(taxa_centavos)    FILTER (WHERE status = 'confirmada') AS taxa,
             count(*)              FILTER (WHERE status = 'cancelada')  AS canceladas
      FROM public.formacao_venda
      WHERE ambiente = 'producao'
      GROUP BY 1
    `);

    return linhas
      .map((l) => {
        const vendas = Number(l.vendas ?? 0);
        const canceladas = Number(l.canceladas ?? 0);
        const total = vendas + canceladas;
        return {
          metodo: l.metodo ?? 'não informado',
          vendas,
          canceladas,
          receita_centavos: Number(l.receita ?? 0),
          taxa_centavos: Number(l.taxa ?? 0),
          taxa_cancelamento: total > 0 ? Math.round((canceladas / total) * 1000) / 10 : 0,
        };
      })
      .filter((m) => m.vendas > 0 || m.canceladas > 0)
      .sort((a, b) => b.vendas - a.vendas);
  }

  /**
   * Preço praticado × velocidade de venda.
   *
   * Agrupa pelo valor efetivamente pago, não pelo preço cadastrado no lote: o que
   * interessa é o que o comprador desembolsou. `por_dia` divide pelas datas em que
   * aquele preço esteve vendendo — é o número que deixa comparável um lote que ficou
   * 90 dias no ar com outro que ficou 3.
   */
  private async precos() {
    const linhas = await this.prisma.$queryRaw<
      Array<{
        preco: number | null;
        vendas: bigint | null;
        primeira: Date | null;
        ultima: Date | null;
      }>
    >(Prisma.sql`
      SELECT valor_centavos AS preco,
             sum(vagas)     AS vendas,
             min(coalesce(pago_em, created_at)) AS primeira,
             max(coalesce(pago_em, created_at)) AS ultima
      FROM public.formacao_venda
      WHERE status = 'confirmada' AND ambiente = 'producao' AND valor_centavos IS NOT NULL
      GROUP BY 1
      ORDER BY 1
    `);

    return linhas.map((l) => {
      const primeira = l.primeira ? new Date(l.primeira) : null;
      const ultima = l.ultima ? new Date(l.ultima) : null;
      const dias =
        primeira && ultima
          ? Math.max(1, Math.round((ultima.getTime() - primeira.getTime()) / (24 * 3600 * 1000)))
          : 1;
      const vendas = Number(l.vendas ?? 0);

      return {
        preco_centavos: Number(l.preco ?? 0),
        vendas,
        dias,
        por_dia: Math.round((vendas / dias) * 100) / 100,
        primeira: primeira ? primeira.toISOString().slice(0, 10) : null,
        ultima: ultima ? ultima.toISOString().slice(0, 10) : null,
      };
    });
  }

  /** O que está errado agora e dá para consertar hoje. */
  private async alertas() {
    const [orfas, semLink, semCapacidade, escadaQuebrada, repetidos, suspeitos] =
      await Promise.all([
        this.prisma.formacao_venda.count({
          where: { status: 'confirmada', ambiente: 'producao', lote_id: null },
        }),

        this.prisma.formacao_lote.count({ where: { checkout_url: null, checkout_id: null } }),

        this.prisma.formacao_evento.count({ where: { publicado: true, vagas: null } }),

        // Mais de um link vivo no mesmo evento: quem tiver o link antigo compra pelo
        // preço antigo, e a escada de lotes deixa de existir na prática. Foi o que
        // aconteceu em Goiânia — 44 vendas a R$100 depois que o lote 2 já valia R$130.
        this.prisma.$queryRaw<Array<{ cidade: string; links: bigint }>>(Prisma.sql`
          SELECT e.cidade, count(*) AS links
          FROM public.formacao_lote l
          JOIN public.formacao_evento e ON e.id = l.evento_id
          WHERE l.checkout_url IS NOT NULL AND e.data >= current_date
          GROUP BY e.cidade
          HAVING count(*) > 1
          ORDER BY 2 DESC
        `),

        this.prisma.$queryRaw<Array<{ email: string; compras: bigint }>>(Prisma.sql`
          SELECT lower(comprador_email) AS email, count(*) AS compras
          FROM public.formacao_venda
          WHERE status = 'confirmada' AND ambiente = 'producao' AND comprador_email IS NOT NULL
          GROUP BY 1
          HAVING count(*) > 1
          ORDER BY 2 DESC
          LIMIT 20
        `),

        // E-mail que o comprador digitou errado: domínio que se parece com um provedor
        // conhecido sem ser ele ("gmail.coml", "gmail.comil.com"). Enquanto o portal não
        // manda confirmação ninguém percebe — no dia em que mandar, essa gente fica sem.
        this.prisma.$queryRaw<Array<{ dominio: string; quantos: bigint }>>(Prisma.sql`
          SELECT split_part(lower(comprador_email), '@', 2) AS dominio, count(*) AS quantos
          FROM public.formacao_venda
          WHERE ambiente = 'producao' AND comprador_email IS NOT NULL
          GROUP BY 1
          HAVING split_part(lower(comprador_email), '@', 2) NOT IN (
                   'gmail.com','hotmail.com','outlook.com','yahoo.com.br','yahoo.com',
                   'icloud.com','bol.com.br','uol.com.br','terra.com.br','live.com',
                   'msn.com','globo.com','me.com','ymail.com','hotmail.com.br','outlook.com.br'
                 )
             AND (split_part(lower(comprador_email), '@', 2) LIKE '%gmail%'
               OR split_part(lower(comprador_email), '@', 2) LIKE '%hotmail%'
               OR split_part(lower(comprador_email), '@', 2) LIKE '%outlook%'
               OR split_part(lower(comprador_email), '@', 2) LIKE '%yahoo%'
               OR split_part(lower(comprador_email), '@', 2) NOT LIKE '%.%')
          ORDER BY 2 DESC
          LIMIT 20
        `),
      ]);

    return {
      vendas_orfas: orfas,
      lotes_sem_link: semLink,
      eventos_publicados_sem_capacidade: semCapacidade,
      escada_quebrada: escadaQuebrada.map((e) => ({
        cidade: e.cidade,
        links: Number(e.links),
      })),
      compradores_repetidos: repetidos.map((r) => ({
        email: r.email,
        compras: Number(r.compras),
      })),
      emails_suspeitos: suspeitos.map((s) => ({
        dominio: s.dominio,
        quantos: Number(s.quantos),
      })),
    };
  }
}
