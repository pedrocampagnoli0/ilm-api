/**
 * Regra do selo das formações presenciais.
 *
 * ATENÇÃO: esta regra existe em DOIS lugares e os dois precisam concordar —
 * aqui e em `siteilm/src/data/formacoes.ts`. O site calcula o selo no build a partir do
 * snapshot; o portal calcula a partir das vendas. Divergir faz a página mostrar um selo
 * no HTML e outro depois que o JavaScript consulta o status.
 *
 * Regra vigente desde 24/08/2026, definida pelo ILM:
 *
 *   restantes / vagas  >  30%   → INSCRIÇÕES ABERTAS
 *   restantes / vagas  <= 30%   → ÚLTIMAS VAGAS
 *   restantes          =  0     → ESGOTADO
 *
 * A regra anterior era `restantes <= max(10, 10% da capacidade)`, que misturava um piso
 * absoluto com um percentual. A de agora é só percentual, e por isso **exige capacidade
 * preenchida**: sem `vagas` não há denominador.
 */

export type StatusFormacao = 'abertas' | 'ultimas' | 'esgotado';

/** Do mais aberto ao mais restrito. */
export const ORDEM_STATUS: readonly StatusFormacao[] = [
  'abertas',
  'ultimas',
  'esgotado',
] as const;

/** Fração de vagas restantes a partir da qual o selo vira "últimas vagas". */
export const LIMIAR_ULTIMAS = 0.3;

export function isStatusFormacao(v: unknown): v is StatusFormacao {
  return typeof v === 'string' && (ORDEM_STATUS as readonly string[]).includes(v);
}

/**
 * O mais restritivo entre dois status.
 *
 * Continua existindo para o site: o HTML sai do build com um selo e a consulta de
 * runtime só pode apertá-lo, nunca reabrir uma turma que já esgotou.
 */
export function aperta(a: StatusFormacao, b: StatusFormacao): StatusFormacao {
  return ORDEM_STATUS.indexOf(a) >= ORDEM_STATUS.indexOf(b) ? a : b;
}

/**
 * Status calculado a partir das vendas confirmadas.
 *
 * Com `vagas` preenchido — que é o caso obrigatório para eventos novos — o selo é
 * **sempre automático**: `status_manual` é ignorado.
 *
 * `vagas = null` só existe em evento legado, anterior à capacidade virar obrigatória.
 * Nesse caso não há denominador para o percentual, e vale o `status_manual` para o selo
 * não sumir da página enquanto a capacidade não for preenchida.
 */
export function statusDoEvento(
  evento: { status_manual: string | null; vagas: number | null },
  vendidas = 0,
): StatusFormacao {
  if (evento.vagas === null || evento.vagas <= 0) {
    return isStatusFormacao(evento.status_manual) ? evento.status_manual : 'abertas';
  }

  const restantes = Math.max(0, evento.vagas - vendidas);
  if (restantes === 0) return 'esgotado';

  return restantes / evento.vagas <= LIMIAR_ULTIMAS ? 'ultimas' : 'abertas';
}

/** Vagas restantes, ou null quando o evento não tem capacidade definida. */
export function vagasRestantes(
  evento: { vagas: number | null },
  vendidas = 0,
): number | null {
  if (evento.vagas === null) return null;
  return Math.max(0, evento.vagas - vendidas);
}
