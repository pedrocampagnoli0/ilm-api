import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';
import type { ListRankingsQueryDto } from './dto/list-rankings-query.dto.js';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto.js';
import type { PorAvaliacaoQueryDto } from './dto/por-avaliacao-query.dto.js';
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

  /** Avaliações do ano agrupadas por tipo (menor data_inicio por tipo). */
  private async avaliacoesDoAno(query: PorAvaliacaoQueryDto) {
    const ano = query.ano ?? new Date().getFullYear();
    const avals = await this.prisma.avaliacao.findMany({
      where: {
        municipio_id: query.municipio_id,
        data_inicio: { gte: new Date(`${ano}-01-01`), lte: new Date(`${ano}-12-31`) },
      },
      select: { tipo_id: true, data_inicio: true, tipo_avaliacao: { select: { nome: true } } },
    });

    const porTipo = new Map<string, { id: string; nome: string; data_inicio: Date }>();
    for (const a of avals) {
      if (!a.data_inicio) continue;
      const cur = porTipo.get(a.tipo_id);
      if (!cur || a.data_inicio < cur.data_inicio) {
        porTipo.set(a.tipo_id, { id: a.tipo_id, nome: a.tipo_avaliacao.nome, data_inicio: a.data_inicio });
      }
    }
    const tipos = [...porTipo.values()];
    const avaliacoes = tipos.map((t) => ({ id: t.id, nome: t.nome, data_inicio: t.data_inicio.toISOString().slice(0, 10) }));
    return { avaliacoes, tipos };

  }

  /**
   * Por tipo de avaliação do ano (menor data_inicio por tipo), o snapshot mais recente
   * (data_referencia >= data_inicio). Mesmo escopo de acesso de findProfessores (sem filtro extra).
   */
  async findProfessoresPorAvaliacao(query: PorAvaliacaoQueryDto) {
    const { avaliacoes, tipos } = await this.avaliacoesDoAno(query);
    if (tipos.length === 0) return { avaliacoes, rows: [] };

    const base = { municipio_id: query.municipio_id, ciclo_id: query.ciclo_id };
    const latest = await this.prisma.ranking_professor_diario.groupBy({
      by: ['tipo_avaliacao_id'],
      where: {
        ...base,
        OR: tipos.map((t) => ({ tipo_avaliacao_id: t.id, data_referencia: { gte: t.data_inicio } })),
      },
      _max: { data_referencia: true },
    });
    const datas = latest.filter((l) => l._max.data_referencia);
    if (datas.length === 0) return { avaliacoes, rows: [] };

    const data = await this.prisma.ranking_professor_diario.findMany({
      where: {
        ...base,
        ...(query.escola_id ? { escola_id: query.escola_id } : {}),
        OR: datas.map((l) => ({ tipo_avaliacao_id: l.tipo_avaliacao_id, data_referencia: l._max.data_referencia! })),
      },
      select: {
        tipo_avaliacao_id: true,
        professor_id: true,
        escola_id: true,
        ciclo_nome: true,
        pontuacao_total_avg: true,
        total_alunos: true,
        posicao_municipio: true,
        posicao_escola: true,
        professor: { select: { nome: true } },
        escola: { select: { nome: true } },
      },
      orderBy: [{ tipo_avaliacao_id: 'asc' }, { id: 'asc' }],
    });

    const rows = data.map(({ professor, escola, ...r }) => ({
      ...r,
      professor_nome: professor.nome,
      escola_nome: escola.nome,
    }));
    return { avaliacoes, rows };
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

  /** Igual a findProfessoresPorAvaliacao, sobre ranking_escola_diario. */
  async findEscolasPorAvaliacao(query: PorAvaliacaoQueryDto) {
    const { avaliacoes, tipos } = await this.avaliacoesDoAno(query);
    if (tipos.length === 0) return { avaliacoes, rows: [] };

    const base = { municipio_id: query.municipio_id, ciclo_id: query.ciclo_id };
    const latest = await this.prisma.ranking_escola_diario.groupBy({
      by: ['tipo_avaliacao_id'],
      where: {
        ...base,
        OR: tipos.map((t) => ({ tipo_avaliacao_id: t.id, data_referencia: { gte: t.data_inicio } })),
      },
      _max: { data_referencia: true },
    });
    const datas = latest.filter((l) => l._max.data_referencia);
    if (datas.length === 0) return { avaliacoes, rows: [] };

    const data = await this.prisma.ranking_escola_diario.findMany({
      where: {
        ...base,
        ...(query.escola_id ? { escola_id: query.escola_id } : {}),
        OR: datas.map((l) => ({ tipo_avaliacao_id: l.tipo_avaliacao_id, data_referencia: l._max.data_referencia! })),
      },
      select: {
        tipo_avaliacao_id: true,
        escola_id: true,
        ciclo_nome: true,
        pontuacao_total_avg: true,
        total_alunos: true,
        total_professores: true,
        posicao_municipio: true,
        escola: { select: { nome: true } },
      },
      orderBy: [{ tipo_avaliacao_id: 'asc' }, { id: 'asc' }],
    });

    const rows = data.map(({ escola, ...r }) => ({ ...r, escola_nome: escola.nome }));
    return { avaliacoes, rows };
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
