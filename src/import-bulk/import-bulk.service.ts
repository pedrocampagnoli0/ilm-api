import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';
import type { ListBatchesQueryDto } from './dto/list-batches-query.dto.js';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto.js';

const BATCH_INCLUDE = {
  municipio: { select: { id: true, nome: true } },
  usuario: { select: { id: true, nome: true } },
} as const;

@Injectable()
export class ImportBulkService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: AuthenticatedUser, query: ListBatchesQueryDto) {
    if (!['administrador', 'ilm'].includes(user.perfil)) {
      throw new ForbiddenException('Acesso negado');
    }

    const filters: Prisma.import_batchWhereInput[] = [];
    if (query.municipio_id) filters.push({ municipio_id: query.municipio_id });

    const where: Prisma.import_batchWhereInput = filters.length > 0 ? { AND: filters } : {};

    const [data, total] = await this.prisma.$transaction([
      this.prisma.import_batch.findMany({
        where,
        include: BATCH_INCLUDE,
        orderBy: { created_at: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.import_batch.count({ where }),
    ]);

    return new PaginatedResponseDto(data, total, query.page, query.limit);
  }

  async findOneLogs(batchId: string) {
    const logs = await this.prisma.import_batch_log.findMany({
      where: { batch_id: batchId },
      orderBy: { row_index: 'asc' },
    });
    return { data: logs };
  }

  /**
   * Execute bulk import — wraps the `escola_turma_import` DB function.
   */
  async execute(user: AuthenticatedUser, data: {
    municipio_id: string;
    rows: Record<string, unknown>[];
  }) {
    if (!['administrador', 'ilm'].includes(user.perfil)) {
      throw new ForbiddenException('Acesso negado');
    }

    const result = await this.prisma.$queryRawUnsafe(
      `SELECT escola_turma_import($1::uuid, $2::jsonb)`,
      data.municipio_id,
      JSON.stringify(data.rows),
    );

    return { data: result };
  }

  /**
   * Undo bulk import — wraps the `escola_turma_import_undo` DB function.
   */
  async undo(user: AuthenticatedUser, batchId: string) {
    if (!['administrador', 'ilm'].includes(user.perfil)) {
      throw new ForbiddenException('Acesso negado');
    }

    const result = await this.prisma.$queryRawUnsafe(
      `SELECT escola_turma_import_undo($1::uuid)`,
      batchId,
    );

    return { data: result };
  }
}
