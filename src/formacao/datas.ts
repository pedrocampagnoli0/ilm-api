/**
 * Serialização de datas do domínio de formações.
 *
 * As colunas `formacao_evento.data` e `formacao_lote.ate` são `date` no Postgres, sem
 * hora. O Prisma as devolve como `Date` de JavaScript, e o `JSON.stringify` do Nest as
 * serializa como ISO completo — `"2026-08-08T00:00:00.000Z"`.
 *
 * Isso é ruim por dois motivos: carrega uma hora que não existe (e que o fuso do cliente
 * pode empurrar para o dia anterior), e diverge do que a superfície pública já entrega,
 * que é `"2026-08-08"`. As duas superfícies devem falar a mesma língua — foi essa
 * divergência que gerou "Invalid Date" no dashboard.
 */

/** `Date` → `'2026-08-08'`. Usa UTC porque a coluna é `date` pura, sem fuso. */
export function soData(d: Date): string;
export function soData(d: Date | null | undefined): string | null;
export function soData(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

/** Aplica `soData` em `ate`, preservando o resto do lote. */
export function serializarLote<T extends { ate: Date }>(
  lote: T,
): Omit<T, 'ate'> & { ate: string } {
  return { ...lote, ate: soData(lote.ate) };
}

/** Aplica `soData` em `data` e nos `lotes[].ate`, quando houver. */
export function serializarEvento<
  T extends { data: Date; lotes?: Array<{ ate: Date }> },
>(evento: T) {
  return {
    ...evento,
    data: soData(evento.data),
    ...(evento.lotes ? { lotes: evento.lotes.map(serializarLote) } : {}),
  };
}
