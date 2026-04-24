import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { accessibleBy } from '@casl/prisma';
import { subject } from '@casl/ability';
import { PrismaService } from '../prisma/prisma.service.js';
import { AbilityFactory } from '../common/casl/ability.factory.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';
import type { CreateAvaliacaoDto } from './dto/create-avaliacao.dto.js';
import type { UpdateAvaliacaoDto } from './dto/update-avaliacao.dto.js';
import type { ListAvaliacoesQueryDto } from './dto/list-avaliacoes-query.dto.js';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto.js';
import { buildPrismaSelect } from '../common/utils/build-prisma-select.js';

const AVALIACAO_INCLUDE = {
  municipio: { select: { id: true, nome: true, uf_sigla: true, ativo: true } },
  tipo_avaliacao: { select: { id: true, nome: true } },
} as const;

function normalizeAvaliacaoDates<T extends Record<string, unknown>>(row: T): T {
  if ('data_inicio' in row && row.data_inicio instanceof Date) {
    (row as Record<string, unknown>).data_inicio = row.data_inicio.toISOString().slice(0, 10);
  }
  if ('data_termino' in row && row.data_termino instanceof Date) {
    (row as Record<string, unknown>).data_termino = row.data_termino.toISOString().slice(0, 10);
  }
  return row;
}

@Injectable()
export class AvaliacaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  async findAll(user: AuthenticatedUser, query: ListAvaliacoesQueryDto) {
    const ability = this.abilityFactory.createForUser(user);

    // Scope avaliacoes to municipios the caller can read. AbilityFactory has
    // no rules for 'avaliacao' yet, so use the municipio relation as proxy:
    // an avaliacao belongs to a municipio, and the caller can read it iff
    // they can read that municipio.
    const municipioWhere = accessibleBy(ability, 'read').municipio;
    const filters: Prisma.avaliacaoWhereInput[] = [{ municipio: municipioWhere }];

    if (query.municipio_id) {
      // If the caller provided an explicit municipio_id, verify they can
      // actually read that municipio; if not, reject outright so the
      // response is 403 instead of a silent empty list.
      if (!ability.can('read', subject('municipio', { id: query.municipio_id } as never))) {
        throw new ForbiddenException('Acesso negado');
      }
      filters.push({ municipio_id: query.municipio_id });
    }
    if (query.tipo_id) {
      filters.push({ tipo_id: query.tipo_id });
    }
    if (query.ativo !== undefined) {
      filters.push({ ativo: query.ativo });
    }
    if (query.ano) {
      filters.push({
        data_inicio: {
          gte: new Date(`${query.ano}-01-01`),
          lte: new Date(`${query.ano}-12-31`),
        },
      });
    }

    const where: Prisma.avaliacaoWhereInput = { AND: filters };

    const customSelect = query.fields
      ? buildPrismaSelect(query.fields)
      : null;

    const findArgs: Prisma.avaliacaoFindManyArgs = {
      where,
      orderBy: [{ data_inicio: 'desc' }, { id: 'asc' }],
      skip: query.skip,
      take: query.limit,
      ...(customSelect ? { select: customSelect } : { include: AVALIACAO_INCLUDE }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.avaliacao.findMany(findArgs),
      this.prisma.avaliacao.count({ where }),
    ]);

    const normalized = (data as Record<string, unknown>[]).map(normalizeAvaliacaoDates);

    return new PaginatedResponseDto(normalized, total, query.page, query.limit);
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const ability = this.abilityFactory.createForUser(user);

    const avaliacao = await this.prisma.avaliacao.findUnique({
      where: { id },
      include: AVALIACAO_INCLUDE,
    });

    if (!avaliacao) {
      throw new NotFoundException('Avaliação não encontrada');
    }

    // An avaliacao is readable by the caller iff they can read its municipio.
    if (!ability.can('read', subject('municipio', avaliacao.municipio as never))) {
      throw new ForbiddenException('Acesso negado');
    }

    return { data: normalizeAvaliacaoDates(avaliacao as Record<string, unknown>) };
  }

  async create(user: AuthenticatedUser, dto: CreateAvaliacaoDto) {
    if (!['administrador', 'ilm'].includes(user.perfil)) {
      throw new ForbiddenException('Acesso negado');
    }

    const avaliacao = await this.prisma.avaliacao.create({
      data: {
        municipio_id: dto.municipio_id,
        tipo_id: dto.tipo_id,
        data_inicio: dto.data_inicio ? new Date(dto.data_inicio) : null,
        data_termino: dto.data_termino ? new Date(dto.data_termino) : null,
        ativo: dto.ativo ?? true,
      },
      include: AVALIACAO_INCLUDE,
    });

    return { data: normalizeAvaliacaoDates(avaliacao as Record<string, unknown>) };
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateAvaliacaoDto) {
    if (!['administrador', 'ilm'].includes(user.perfil)) {
      throw new ForbiddenException('Acesso negado');
    }

    const existing = await this.prisma.avaliacao.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Avaliação não encontrada');
    }

    const data: Prisma.avaliacaoUncheckedUpdateInput = {};
    if (dto.municipio_id) data.municipio_id = dto.municipio_id;
    if (dto.tipo_id) data.tipo_id = dto.tipo_id;
    if (dto.data_inicio !== undefined) data.data_inicio = dto.data_inicio ? new Date(dto.data_inicio) : null;
    if (dto.data_termino !== undefined) data.data_termino = dto.data_termino ? new Date(dto.data_termino) : null;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;

    const updated = await this.prisma.avaliacao.update({
      where: { id },
      data,
      include: AVALIACAO_INCLUDE,
    });

    return { data: normalizeAvaliacaoDates(updated as Record<string, unknown>) };
  }

  async delete(user: AuthenticatedUser, id: string) {
    if (!['administrador', 'ilm'].includes(user.perfil)) {
      throw new ForbiddenException('Acesso negado');
    }

    const existing = await this.prisma.avaliacao.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Avaliação não encontrada');
    }

    // Delete resultados first (cascade)
    await this.prisma.$transaction([
      this.prisma.resultado_avaliacao.deleteMany({ where: { avaliacao_id: id } }),
      this.prisma.avaliacao.delete({ where: { id } }),
    ]);

    return { data: { id } };
  }

  async bulkDelete(user: AuthenticatedUser, ids: string[]) {
    if (!['administrador', 'ilm'].includes(user.perfil)) {
      throw new ForbiddenException('Acesso negado');
    }

    await this.prisma.$transaction([
      this.prisma.resultado_avaliacao.deleteMany({ where: { avaliacao_id: { in: ids } } }),
      this.prisma.avaliacao.deleteMany({ where: { id: { in: ids } } }),
    ]);

    return { data: { count: ids.length } };
  }

  // ─── Tipo Avaliação ─────────────────────────────────────

  async listTipos() {
    const data = await this.prisma.tipo_avaliacao.findMany({
      orderBy: { nome: 'asc' },
    });
    return { data };
  }
}
