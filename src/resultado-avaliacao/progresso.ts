/**
 * "% Conclusão" da avaliação, proporcional aos campos preenchidos.
 *
 * Espelha `calcularCoorte` + `pctConclusao` do frontend
 * (lermais-auth `src/domain/avaliacao/elegibilidade.ts`), que continua sendo a
 * referência nas telas de turma. A LISTA DE CAMPOS e a ESCALA abaixo têm de
 * acompanhar `camposObrigatorios` de lá — mudou um lado, mude o outro.
 *
 * Regras (as mesmas do frontend):
 *  - cada aluno vale de 0 a `PONTOS_POR_ALUNO`, na proporção dos campos
 *    obrigatórios do ciclo da turma que já têm valor (`false` e `0` contam);
 *  - ausente sai do numerador e do denominador;
 *  - transferido só conta se respondeu ESTA avaliação antes de sair;
 *  - avaliação fechada ignora quem foi matriculado depois do fechamento;
 *  - o resultado só vale para a turma em que o aluno está hoje.
 */

/** mmc(7, 5, 4): pontos de um aluno com a avaliação completa. */
export const PONTOS_POR_ALUNO = 140;

export interface ProgressoTurma {
  avaliacao_id: string;
  turma_id: string;
  /** Alunos que entram na avaliação (inclui ausentes). */
  avaliaveis: number;
  ausentes: number;
  /** Transferidos que seguem na conta por terem respondido antes de sair. */
  transferidos_contabilizados: number;
  /** Denominador: avaliáveis − ausentes. */
  considerados: number;
  /** Considerados com pelo menos um campo lançado. */
  enviados: number;
  /** Considerados com todos os campos obrigatórios. */
  completos: number;
  /** Numerador, de 0 a `pontos_max`. */
  pontos: number;
  /** `considerados × PONTOS_POR_ALUNO`. */
  pontos_max: number;
}

/**
 * $1 = avaliações (uuid[]); $2 = turmas (uuid[] ou NULL).
 * Com $2 NULL entram as turmas ativas de escolas ativas do município da avaliação.
 */
export const PROGRESSO_POR_TURMA_SQL = `
  WITH linhas AS (
    SELECT
      av.id AS avaliacao_id,
      t.id AS turma_id,
      a.is_transferido AS transferido,
      COALESCE(r.ausente, false) AS ausente,
      r.respondido_em IS NOT NULL AS enviado,
      CASE
        WHEN c.nome LIKE 'ed_infantil%' THEN 20 * num_nonnulls(
          r.ei2_escreve_nome, r.ei2_sons_letras, r.ei2_nomes_letras, r.ei2_nivel_leitura,
          r.ei2_nivel_escrita, r.ei2_consciencia_fonologica, r.ei2_consciencia_fonemica)
        WHEN c.nome = 'fundamental_1' THEN 28 * num_nonnulls(
          r.f1_nivel_leitura, r.f1_nivel_escrita, r.f1_consciencia_fonologica,
          r.f1_consciencia_fonemica, r.f1_compreensao_frases)
        ELSE 35 * num_nonnulls(
          r.f2_nivel_leitura, r.f2_nivel_escrita, r.f2_compreensao_frases, r.f2_compreensao_texto)
      END AS pontos
    FROM avaliacao av
    JOIN escola e ON e.municipio_id = av.municipio_id
    JOIN turma t ON t.escola_id = e.id
    JOIN ciclo c ON c.id = t.ciclo_id
    JOIN aluno a ON a.turma_id = t.id
    LEFT JOIN resultado_avaliacao r
      ON r.avaliacao_id = av.id AND r.aluno_id = a.id AND r.turma_id = t.id
    WHERE av.id = ANY($1::uuid[])
      AND CASE WHEN $2::uuid[] IS NULL THEN t.ativo AND e.ativo ELSE t.id = ANY($2::uuid[]) END
      AND (c.nome LIKE 'ed_infantil%' OR c.nome IN ('fundamental_1', 'fundamental_2'))
      AND (av.ativo IS DISTINCT FROM false OR av.closed_at IS NULL OR a.created_at <= av.closed_at)
      AND (NOT a.is_transferido
           OR (a.transferido_em IS NOT NULL AND r.respondido_em < a.transferido_em))
  )
  SELECT
    avaliacao_id,
    turma_id,
    count(*) AS avaliaveis,
    count(*) FILTER (WHERE ausente) AS ausentes,
    count(*) FILTER (WHERE transferido) AS transferidos_contabilizados,
    count(*) FILTER (WHERE NOT ausente) AS considerados,
    count(*) FILTER (WHERE NOT ausente AND enviado) AS enviados,
    count(*) FILTER (WHERE NOT ausente AND pontos = ${PONTOS_POR_ALUNO}) AS completos,
    COALESCE(sum(pontos) FILTER (WHERE NOT ausente), 0) AS pontos
  FROM linhas
  GROUP BY avaliacao_id, turma_id
`;

type Contagem = bigint | number;

export interface ProgressoTurmaRow {
  avaliacao_id: string;
  turma_id: string;
  avaliaveis: Contagem;
  ausentes: Contagem;
  transferidos_contabilizados: Contagem;
  considerados: Contagem;
  enviados: Contagem;
  completos: Contagem;
  pontos: Contagem;
}

/** Converte os bigint do Postgres e fecha o denominador em pontos. */
export function mapProgressoTurma(row: ProgressoTurmaRow): ProgressoTurma {
  const considerados = Number(row.considerados);
  return {
    avaliacao_id: row.avaliacao_id,
    turma_id: row.turma_id,
    avaliaveis: Number(row.avaliaveis),
    ausentes: Number(row.ausentes),
    transferidos_contabilizados: Number(row.transferidos_contabilizados),
    considerados,
    enviados: Number(row.enviados),
    completos: Number(row.completos),
    pontos: Number(row.pontos),
    pontos_max: considerados * PONTOS_POR_ALUNO,
  };
}

/**
 * Percentual com uma casa decimal arredondada PARA BAIXO: 99,96% vira 99,9%,
 * nunca 100%. `null` sem denominador (a UI mostra "—", não 0%).
 */
export function pctProgresso(pontos: number, pontosMax: number): number | null {
  if (!(pontosMax > 0)) return null;
  return Math.min(
    100,
    Math.max(0, Math.floor((pontos * 1000) / pontosMax) / 10),
  );
}

export interface AvaliacaoDoMunicipio {
  id: string;
  municipio_id: string;
  ativo: boolean;
  data_inicio: Date | null;
  data_termino: Date | null;
  created_at: Date;
  tipo_nome: string | null;
}

const tempo = (d: Date | null) => (d ? d.getTime() : -Infinity);

/**
 * Avaliação que representa o município no Painel da Assessora — mesma escolha
 * que `recompute_municipio_avaliacao_pct` fazia: a aberta (preferindo a que
 * ainda não venceu, depois a mais recente); sem aberta, a fechada de tipo
 * "maior" e mais recente.
 */
export function escolherAvaliacaoAtual<T extends AvaliacaoDoMunicipio>(
  avaliacoes: T[],
  hoje: Date = new Date(),
): T | null {
  const maisRecente = (a: T, b: T) =>
    tempo(b.data_inicio) - tempo(a.data_inicio) ||
    b.created_at.getTime() - a.created_at.getTime();

  const abertas = avaliacoes.filter((a) => a.ativo);
  if (abertas.length > 0) {
    // `data_termino` é DATE (meia-noite UTC): compara só o dia.
    const dia = Date.UTC(
      hoje.getUTCFullYear(),
      hoje.getUTCMonth(),
      hoje.getUTCDate(),
    );
    const vencida = (a: T) =>
      a.data_termino !== null && a.data_termino.getTime() < dia ? 1 : 0;
    return [...abertas].sort(
      (a, b) => vencida(a) - vencida(b) || maisRecente(a, b),
    )[0];
  }

  const fechadas = [...avaliacoes].sort((a, b) => {
    if (a.tipo_nome !== b.tipo_nome) {
      if (a.tipo_nome === null) return 1;
      if (b.tipo_nome === null) return -1;
      return a.tipo_nome < b.tipo_nome ? 1 : -1;
    }
    return maisRecente(a, b);
  });
  return fechadas[0] ?? null;
}
