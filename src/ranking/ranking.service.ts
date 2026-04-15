import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';
import type { ListRankingsQueryDto } from './dto/list-rankings-query.dto.js';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto.js';
import { buildPrismaSelect } from '../common/utils/build-prisma-select.js';

const RANKING_PROF_INCLUDE = {
  professor: { select: { id: true, nome: true } },
  escola: { select: { id: true, nome: true } },
  municipio: { select: { id: true, nome: true } },
} as const;

const RANKING_ESCOLA_INCLUDE = {
  escola: { select: { id: true, nome: true } },
  municipio: { select: { id: true, nome: true } },
} as const;

@Injectable()
export class RankingService {
  constructor(private readonly prisma: PrismaService) {}

  async findProfessores(user: AuthenticatedUser, query: ListRankingsQueryDto) {
    const filters: Prisma.ranking_professor_diarioWhereInput[] = [];

    if (query.municipio_id) filters.push({ municipio_id: query.municipio_id });
    if (query.escola_id) filters.push({ escola_id: query.escola_id });
    if (query.ciclo_id) filters.push({ ciclo_id: query.ciclo_id });
    if (query.tipo_avaliacao_id) filters.push({ tipo_avaliacao_id: query.tipo_avaliacao_id });
    if (query.data_referencia) filters.push({ data_referencia: new Date(query.data_referencia) });

    const where: Prisma.ranking_professor_diarioWhereInput = filters.length > 0 ? { AND: filters } : {};

    const customSelect = query.fields ? buildPrismaSelect(query.fields) : null;

    const findArgs: Prisma.ranking_professor_diarioFindManyArgs = {
      where,
      orderBy: [{ pontuacao_total_avg: 'desc' }, { id: 'asc' }],
      skip: query.skip,
      take: query.limit,
      ...(customSelect ? { select: customSelect } : { include: RANKING_PROF_INCLUDE }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.ranking_professor_diario.findMany(findArgs),
      this.prisma.ranking_professor_diario.count({ where }),
    ]);

    return new PaginatedResponseDto(data, total, query.page, query.limit);
  }

  async findEscolas(user: AuthenticatedUser, query: ListRankingsQueryDto) {
    const filters: Prisma.ranking_escola_diarioWhereInput[] = [];

    if (query.municipio_id) filters.push({ municipio_id: query.municipio_id });
    if (query.escola_id) filters.push({ escola_id: query.escola_id });
    if (query.ciclo_id) filters.push({ ciclo_id: query.ciclo_id });
    if (query.tipo_avaliacao_id) filters.push({ tipo_avaliacao_id: query.tipo_avaliacao_id });
    if (query.data_referencia) filters.push({ data_referencia: new Date(query.data_referencia) });

    const where: Prisma.ranking_escola_diarioWhereInput = filters.length > 0 ? { AND: filters } : {};

    const customSelect = query.fields ? buildPrismaSelect(query.fields) : null;

    const findArgs: Prisma.ranking_escola_diarioFindManyArgs = {
      where,
      orderBy: [{ pontuacao_total_avg: 'desc' }, { id: 'asc' }],
      skip: query.skip,
      take: query.limit,
      ...(customSelect ? { select: customSelect } : { include: RANKING_ESCOLA_INCLUDE }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.ranking_escola_diario.findMany(findArgs),
      this.prisma.ranking_escola_diario.count({ where }),
    ]);

    return new PaginatedResponseDto(data, total, query.page, query.limit);
  }

  async deleteForMunicipio(user: AuthenticatedUser, municipioId: string) {
    if (!['administrador', 'ilm'].includes(user.perfil)) {
      throw new ForbiddenException('Acesso negado');
    }

    const [profResult, escolaResult] = await this.prisma.$transaction([
      this.prisma.ranking_professor_diario.deleteMany({ where: { municipio_id: municipioId } }),
      this.prisma.ranking_escola_diario.deleteMany({ where: { municipio_id: municipioId } }),
    ]);

    return { data: { professores: profResult.count, escolas: escolaResult.count } };
  }

  async getLastUpdates() {
    const data = await this.prisma.ranking_professor_diario.findMany({
      select: { municipio_id: true, updated_at: true },
      orderBy: [{ updated_at: 'desc' }, { id: 'asc' }],
    });

    const updates: Record<string, string> = {};
    for (const row of data) {
      if (!updates[row.municipio_id] && row.updated_at) {
        updates[row.municipio_id] = row.updated_at.toISOString();
      }
    }

    return { data: updates };
  }
}
