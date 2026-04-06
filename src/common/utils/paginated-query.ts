import { accessibleBy } from '@casl/prisma';
import type { AppAbility } from '../casl/ability.factory.js';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface.js';
import { PaginatedResponseDto } from '../dto/paginated-response.dto.js';

/**
 * Returns the CASL WHERE clause for a given subject, or `{}` for admin/ilm
 * (skipping the expensive accessibleBy() call entirely).
 */
export function getCaslWhere<T extends string>(
  user: AuthenticatedUser,
  ability: AppAbility,
  action: 'read' | 'create' | 'update' | 'delete',
  subject: T,
): Record<string, unknown> {
  if (user.perfil === 'administrador' || user.perfil === 'ilm') {
    return {};
  }
  return (accessibleBy(ability, action) as Record<string, unknown>)[subject] as Record<string, unknown>;
}

/**
 * Runs findMany + optional count in a single transaction (or skips count).
 * Returns PaginatedResponseDto.
 */
export async function paginatedQuery<T>(
  prisma: { $transaction: (args: unknown[]) => Promise<unknown[]> },
  findManyPromise: Promise<T[]> | (() => Promise<T[]>),
  countPromise: Promise<number> | (() => Promise<number>),
  page: number,
  limit: number,
  skipCount?: boolean,
): Promise<PaginatedResponseDto<T>> {
  if (skipCount) {
    const fn = typeof findManyPromise === 'function' ? findManyPromise : () => findManyPromise;
    const data = await fn();
    return new PaginatedResponseDto(data, -1, page, limit);
  }

  const findFn = typeof findManyPromise === 'function' ? findManyPromise() : findManyPromise;
  const countFn = typeof countPromise === 'function' ? countPromise() : countPromise;

  const [data, total] = await prisma.$transaction([findFn, countFn]) as [T[], number];
  return new PaginatedResponseDto(data, total, page, limit);
}
