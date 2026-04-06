import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AbilityFactory } from '../common/casl/ability.factory.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';
import type { ListResultadosQueryDto } from './dto/list-resultados-query.dto.js';
import type { UpsertBatchDto } from './dto/upsert-batch.dto.js';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto.js';
import { buildPrismaSelect } from '../common/utils/build-prisma-select.js';

const RESULTADO_INCLUDE = {
  aluno: { select: { id: true, nome: true, is_transferido: true } },
  turma: { select: { id: true, nome: true, escola_id: true, professora_id: true, ciclo_id: true } },
} as const;

@Injectable()
export class ResultadoAvaliacaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  async findAll(user: AuthenticatedUser, query: ListResultadosQueryDto) {
    const filters: Prisma.resultado_avaliacaoWhereInput[] = [];

    if (query.avaliacao_id) {
      filters.push({ avaliacao_id: query.avaliacao_id });
    }
    if (query.turma_id) {
      filters.push({ turma_id: query.turma_id });
    }
    if (query.aluno_id) {
      filters.push({ aluno_id: query.aluno_id });
    }
    if (query.ciclo_id) {
      filters.push({ ciclo_id: query.ciclo_id });
    }
    if (query.ausente !== undefined) {
      filters.push({ ausente: query.ausente });
    }
    if (query.avaliacao_ids) {
      const idList = query.avaliacao_ids.split(',').map((s) => s.trim()).filter(Boolean);
      if (idList.length > 0) {
        filters.push({ avaliacao_id: { in: idList } });
      }
    }
    if (query.aluno_ids) {
      const idList = query.aluno_ids.split(',').map((s) => s.trim()).filter(Boolean);
      if (idList.length > 0) {
        filters.push({ aluno_id: { in: idList } });
      }
    }

    const where: Prisma.resultado_avaliacaoWhereInput = filters.length > 0 ? { AND: filters } : {};

    const customSelect = query.fields
      ? buildPrismaSelect(query.fields)
      : null;

    const findArgs: Prisma.resultado_avaliacaoFindManyArgs = {
      where,
      orderBy: { created_at: 'asc' },
      skip: query.skip,
      take: query.limit,
      ...(customSelect ? { select: customSelect } : { include: RESULTADO_INCLUDE }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.resultado_avaliacao.findMany(findArgs),
      this.prisma.resultado_avaliacao.count({ where }),
    ]);

    return new PaginatedResponseDto(data, total, query.page, query.limit);
  }

  /**
   * Batch upsert — wraps the `upsert_resultados_avaliacao_batch` RPC.
   * Calls the existing DB function via raw SQL so all the trigger/logging
   * logic in the database is preserved.
   */
  async upsertBatch(user: AuthenticatedUser, dto: UpsertBatchDto) {
    // Permission check: user must be able to write to this turma
    const turma = await this.prisma.turma.findUnique({
      where: { id: dto.turma_id },
      select: { id: true, escola_id: true },
    });
    if (!turma) {
      throw new NotFoundException('Turma não encontrada');
    }

    // Permission: admin/ilm can always write. Others must own the turma.
    const isAdmin = ['administrador', 'ilm'].includes(user.perfil);
    if (!isAdmin) {
      if (user.perfil === 'coordenacao') {
        throw new ForbiddenException('Coordenadores não podem editar avaliações');
      }
      if (user.perfil === 'professor' && !user.turmaIds.includes(dto.turma_id)) {
        throw new ForbiddenException('Acesso negado');
      }
      if (user.perfil === 'secretaria' && !user.escolaIds.includes(turma.escola_id)) {
        throw new ForbiddenException('Acesso negado');
      }
      if (user.perfil === 'diretor' && !user.escolaIds.includes(turma.escola_id)) {
        throw new ForbiddenException('Acesso negado');
      }
    }

    // Call the existing DB function — preserves all trigger logic
    // Use named parameters to match the function signature
    try {
      const result = await this.prisma.$queryRawUnsafe(
        `SELECT upsert_resultados_avaliacao_batch(
          in_avaliacao_id := $1::uuid,
          in_turma_id := $2::uuid,
          in_resultados := $3::jsonb
        )`,
        dto.avaliacao_id,
        dto.turma_id,
        JSON.stringify(dto.resultados),
      );
      return { data: result };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`upsert_resultados_avaliacao_batch failed: ${msg}`);
    }
  }

  /**
   * Get change history — wraps the `get_avaliacao_change_history` RPC.
   */
  async getChangeHistory(user: AuthenticatedUser, turmaId: string, avaliacaoId: string) {
    const result = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        usuario_nome: string;
        change_action: string;
        changed_at: string;
        resultado_count: number;
      }>
    >(
      `SELECT * FROM get_avaliacao_change_history(
        in_turma_id := $1::uuid,
        in_avaliacao_id := $2::uuid
      )`,
      turmaId,
      avaliacaoId,
    );

    return { data: result };
  }

  /**
   * Radar report — F2 students with nivel_leitura or nivel_escrita in (1,2).
   * Wraps the complex PostgREST inner-join query.
   */
  async radar(avaliacaoIds: string[], cicloId: string) {
    const data = await this.prisma.resultado_avaliacao.findMany({
      where: {
        avaliacao_id: { in: avaliacaoIds },
        ciclo_id: cicloId,
        ausente: false,
        aluno: { is_transferido: false },
        OR: [
          { f2_nivel_leitura: { in: [1, 2] } },
          { f2_nivel_escrita: { in: [1, 2] } },
        ],
      },
      select: {
        aluno_id: true,
        turma_id: true,
        f2_nivel_leitura: true,
        f2_nivel_escrita: true,
        aluno: { select: { id: true, nome: true, is_transferido: true } },
        turma: { select: { id: true, nome: true, escola_id: true, professora_id: true, ciclo_id: true } },
      },
    });

    return { data };
  }

  /**
   * Delete resultados for a student (only blank ones — respondido_em IS NULL).
   */
  async deleteBlankForAluno(alunoId: string) {
    const result = await this.prisma.resultado_avaliacao.deleteMany({
      where: {
        aluno_id: alunoId,
        respondido_em: null,
      },
    });

    return { data: { count: result.count } };
  }

  /**
   * Delete resultados for a specific student + avaliacao.
   */
  async deleteForAlunoAvaliacao(avaliacaoId: string, alunoId: string) {
    const result = await this.prisma.resultado_avaliacao.deleteMany({
      where: {
        avaliacao_id: avaliacaoId,
        aluno_id: alunoId,
      },
    });

    return { data: { count: result.count } };
  }
}
