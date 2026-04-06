/**
 * Parses a comma-separated `fields` string into a Prisma `select` object.
 *
 * Supports dot notation for relations:
 *   "id,nome,ciclo.id,ciclo.nome,escola.municipio.nome"
 * →
 *   { id: true, nome: true, ciclo: { select: { id: true, nome: true } }, escola: { select: { municipio: { select: { nome: true } } } } }
 */
export function buildPrismaSelect(
  fields: string,
): Record<string, unknown> | null {
  const parts = fields
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);

  if (parts.length === 0) return null;

  const select: Record<string, unknown> = {};

  for (const field of parts) {
    const segments = field.split('.');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cursor: any = select;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const isLast = i === segments.length - 1;

      if (isLast) {
        // Leaf — mark as selected. Don't overwrite an existing relation object.
        if (cursor[seg] === undefined || cursor[seg] === true) {
          cursor[seg] = true;
        }
      } else {
        // Intermediate — ensure a relation select exists
        if (!cursor[seg] || cursor[seg] === true) {
          cursor[seg] = { select: {} };
        }
        cursor = cursor[seg].select;
      }
    }
  }

  return select;
}
