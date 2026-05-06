import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { accessibleBy } from '@casl/prisma';
import { subject } from '@casl/ability';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { AbilityFactory } from '../common/casl/ability.factory.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';
import type { CreateReuniaoDto, ReuniaoPessoaInputDto } from './dto/create-reuniao.dto.js';
import type { UpdateReuniaoDto } from './dto/update-reuniao.dto.js';
import type { ListReunioesQueryDto } from './dto/list-reunioes-query.dto.js';
import { expandRecurrence } from './recurrence.js';

// Prisma enum @map: client uses these identifiers, DB stores the @map values.
// We have to translate at the service boundary because the DB strings contain
// characters that aren't valid Prisma identifiers ("1:1-professor", "mensal-semana").
const TIPO_DB_TO_PRISMA: Record<string, 'professor_1_1' | 'gestao' | 'generica'> = {
  '1:1-professor': 'professor_1_1',
  gestao: 'gestao',
  generica: 'generica',
};
const TIPO_PRISMA_TO_DB: Record<string, '1:1-professor' | 'gestao' | 'generica'> = {
  professor_1_1: '1:1-professor',
  gestao: 'gestao',
  generica: 'generica',
};
const REGRA_DB_TO_PRISMA: Record<string, 'semanal' | 'quinzenal' | 'mensal' | 'mensal_semana'> = {
  semanal: 'semanal',
  quinzenal: 'quinzenal',
  mensal: 'mensal',
  'mensal-semana': 'mensal_semana',
};
const REGRA_PRISMA_TO_DB: Record<string, 'semanal' | 'quinzenal' | 'mensal' | 'mensal-semana'> = {
  semanal: 'semanal',
  quinzenal: 'quinzenal',
  mensal: 'mensal',
  mensal_semana: 'mensal-semana',
};

function normalizeReuniao<T extends { tipo: string; recorrencia_regra?: string | null; pessoas?: unknown }>(r: T): T {
  return {
    ...r,
    tipo: TIPO_PRISMA_TO_DB[r.tipo] ?? r.tipo,
    recorrencia_regra: r.recorrencia_regra ? (REGRA_PRISMA_TO_DB[r.recorrencia_regra] ?? r.recorrencia_regra) : r.recorrencia_regra,
  } as T;
}

@Injectable()
export class ReuniaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  async findAll(user: AuthenticatedUser, query: ListReunioesQueryDto) {
    const ability = this.abilityFactory.createForUser(user);
    // accessibleBy throws ForbiddenError when no rules exist for the subject
    // (e.g. ilm/admin with empty assessora_municipio assignments). Treat as empty list.
    let caslWhere: Prisma.reuniaoWhereInput;
    try {
      caslWhere = accessibleBy(ability, 'read').reuniao;
    } catch {
      return { data: [] };
    }

    const filters: Prisma.reuniaoWhereInput[] = [caslWhere];
    if (query.municipio_id) filters.push({ municipio_id: query.municipio_id });
    if (query.serie_id) filters.push({ serie_id: query.serie_id });
    if (query.inicio_de) filters.push({ inicio: { gte: new Date(query.inicio_de) } });
    if (query.inicio_ate) filters.push({ inicio: { lte: new Date(query.inicio_ate) } });
    if (query.include_canceladas === false) filters.push({ cancelada: false });

    const reunioes = await this.prisma.reuniao.findMany({
      where: { AND: filters },
      orderBy: [{ inicio: 'asc' }],
      include: {
        pessoas: {
          include: { usuario: { select: { id: true, nome: true, email: true, perfil: { select: { nome: true } } } } },
        },
      },
      // Cap large to support assessoras with many municípios + wide windows. A
      // typical assessora year has < 1000 reuniões; 10000 is comfortably above
      // any realistic single-fetch result while preventing unbounded memory.
      take: 10_000,
    });

    return { data: reunioes.map((r) => normalizeReuniao(r as any)) };
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const ability = this.abilityFactory.createForUser(user);

    const reuniao = await this.prisma.reuniao.findUnique({
      where: { id },
      include: {
        pessoas: {
          include: { usuario: { select: { id: true, nome: true, email: true, perfil: { select: { nome: true } } } } },
        },
      },
    });
    if (!reuniao) throw new NotFoundException('Reunião não encontrada');

    if (!ability.can('read', subject('reuniao', reuniao))) {
      throw new ForbiddenException('Você não pode acessar esta reunião — verifique se este município está nas suas atribuições.');
    }
    return { data: normalizeReuniao(reuniao as any) };
  }

  async create(user: AuthenticatedUser, dto: CreateReuniaoDto) {
    const ability = this.abilityFactory.createForUser(user);

    // Authorize against the resource shape
    if (!ability.can('create', subject('reuniao', { municipio_id: dto.municipio_id } as any))) {
      throw new ForbiddenException('Você não tem permissão para criar reuniões neste município.');
    }

    if (dto.recorrencia) {
      return this.createSeries(user, dto);
    }
    return this.createSingle(user, dto);
  }

  private async createSingle(user: AuthenticatedUser, dto: CreateReuniaoDto) {
    if (!dto.inicio) {
      throw new BadRequestException('Campo "inicio" é obrigatório para reuniões sem recorrência.');
    }
    const reuniao = await this.prisma.reuniao.create({
      data: {
        municipio_id: dto.municipio_id,
        tipo: TIPO_DB_TO_PRISMA[dto.tipo] as any,
        inicio: new Date(dto.inicio),
        duracao_min: dto.duracao_min,
        link: dto.link ?? null,
        observacao: dto.observacao ?? null,
        aconteceu: dto.aconteceu ?? false,
        criado_por: user.id,
        pessoas: {
          create: dto.pessoas.map((p) => this.toPessoaCreate(p)),
        },
      },
      include: { pessoas: { include: { usuario: { select: { id: true, nome: true, email: true, perfil: { select: { nome: true } } } } } } },
    });
    return { data: [normalizeReuniao(reuniao as any)] };
  }

  private async createSeries(user: AuthenticatedUser, dto: CreateReuniaoDto) {
    const rec = dto.recorrencia!;
    // Look up the município's IANA timezone so the wall-clock hora_inicio is
    // interpreted in the user's local zone, not the server's UTC. Without this
    // every "08:00" would land at 08:00 UTC = 05:00 BRT (the 3-hour offset bug).
    const muni = await this.prisma.municipio.findUnique({
      where: { id: dto.municipio_id },
      select: { timezone: true },
    });
    const startsAtIso = expandRecurrence({
      diasSemana: rec.dias_semana,
      horaInicio: rec.hora_inicio,
      regra: rec.regra,
      ate: rec.ate,
      semanaDoMes: rec.semana_do_mes,
      timezone: muni?.timezone ?? undefined,
    });
    if (startsAtIso.length === 0) {
      throw new BadRequestException(
        'Recorrência inválida: verifique se a data "ate" é posterior a hoje, se há ao menos um dia da semana selecionado, e — para regra "mensal-semana" — se "semana_do_mes" está entre 1 e 5.',
      );
    }

    const serieId = randomUUID();
    const created = await this.prisma.$transaction(
      startsAtIso.map((iso) =>
        this.prisma.reuniao.create({
          data: {
            municipio_id: dto.municipio_id,
            tipo: TIPO_DB_TO_PRISMA[dto.tipo] as any,
            inicio: new Date(iso),
            duracao_min: dto.duracao_min,
            link: dto.link ?? null,
            observacao: dto.observacao ?? null,
            aconteceu: dto.aconteceu ?? false,
            criado_por: user.id,
            serie_id: serieId,
            recorrencia_regra: REGRA_DB_TO_PRISMA[rec.regra] as any,
            recorrencia_ate: new Date(rec.ate),
            recorrencia_semana_do_mes: rec.semana_do_mes ?? null,
            pessoas: {
              create: dto.pessoas.map((p) => this.toPessoaCreate(p)),
            },
          },
          include: { pessoas: { include: { usuario: { select: { id: true, nome: true, email: true, perfil: { select: { nome: true } } } } } } },
        }),
      ),
    );
    return { data: created.map((r) => normalizeReuniao(r as any)) };
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateReuniaoDto,
    scope: 'this' | 'series' = 'this',
  ) {
    const ability = this.abilityFactory.createForUser(user);

    const existing = await this.prisma.reuniao.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Reunião não encontrada');
    if (!ability.can('update', subject('reuniao', existing))) {
      throw new ForbiddenException('Você não pode editar reuniões deste município.');
    }

    if (scope === 'series') {
      if (!existing.serie_id) {
        throw new BadRequestException(
          'Não é possível atualizar a série inteira: esta reunião é única, não recorrente. Use scope=this.',
        );
      }
      // Series-scoped updates: only metadata fields (not inicio/duracao). Pessoas are replaced per-row.
      const data: Prisma.reuniaoUncheckedUpdateInput = {};
      if (dto.tipo !== undefined) data.tipo = TIPO_DB_TO_PRISMA[dto.tipo] as any;
      if (dto.link !== undefined) data.link = dto.link;
      if (dto.observacao !== undefined) data.observacao = dto.observacao;
      if (dto.aconteceu !== undefined) data.aconteceu = dto.aconteceu;
      if (dto.cancelada !== undefined) data.cancelada = dto.cancelada;
      if (dto.duracao_min !== undefined) data.duracao_min = dto.duracao_min;

      const result = await this.prisma.$transaction(async (tx) => {
        await tx.reuniao.updateMany({
          where: { serie_id: existing.serie_id! },
          data,
        });
        if (dto.pessoas) {
          const ids = (
            await tx.reuniao.findMany({
              where: { serie_id: existing.serie_id! },
              select: { id: true },
            })
          ).map((r) => r.id);
          await tx.reuniao_pessoa.deleteMany({ where: { reuniao_id: { in: ids } } });
          for (const rid of ids) {
            await tx.reuniao_pessoa.createMany({
              data: dto.pessoas.map((p) => ({ ...this.toPessoaCreate(p), reuniao_id: rid })),
            });
          }
        }
        return tx.reuniao.findMany({
          where: { serie_id: existing.serie_id! },
          orderBy: { inicio: 'asc' },
          include: { pessoas: { include: { usuario: { select: { id: true, nome: true, email: true, perfil: { select: { nome: true } } } } } } },
        });
      });
      return { data: result.map((r) => normalizeReuniao(r as any)) };
    }

    const data: Prisma.reuniaoUncheckedUpdateInput = {};
    if (dto.tipo !== undefined) data.tipo = TIPO_DB_TO_PRISMA[dto.tipo] as any;
    if (dto.inicio !== undefined) data.inicio = new Date(dto.inicio);
    if (dto.duracao_min !== undefined) data.duracao_min = dto.duracao_min;
    if (dto.link !== undefined) data.link = dto.link;
    if (dto.observacao !== undefined) data.observacao = dto.observacao;
    if (dto.aconteceu !== undefined) data.aconteceu = dto.aconteceu;
    if (dto.cancelada !== undefined) data.cancelada = dto.cancelada;

    const updated = await this.prisma.$transaction(async (tx) => {
      const r = await tx.reuniao.update({ where: { id }, data });
      if (dto.pessoas) {
        await tx.reuniao_pessoa.deleteMany({ where: { reuniao_id: id } });
        if (dto.pessoas.length > 0) {
          await tx.reuniao_pessoa.createMany({
            data: dto.pessoas.map((p) => ({ ...this.toPessoaCreate(p), reuniao_id: id })),
          });
        }
      }
      return tx.reuniao.findUnique({ where: { id }, include: { pessoas: { include: { usuario: { select: { id: true, nome: true, email: true, perfil: { select: { nome: true } } } } } } } });
    });
    return { data: updated ? normalizeReuniao(updated as any) : updated };
  }

  async remove(
    user: AuthenticatedUser,
    id: string,
    scope: 'this' | 'series' = 'this',
  ) {
    const ability = this.abilityFactory.createForUser(user);
    const existing = await this.prisma.reuniao.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Reunião não encontrada');
    if (!ability.can('delete', subject('reuniao', existing))) {
      throw new ForbiddenException('Você não pode excluir reuniões deste município.');
    }

    if (scope === 'series' && existing.serie_id) {
      const result = await this.prisma.reuniao.deleteMany({
        where: { serie_id: existing.serie_id },
      });
      return { data: { count: result.count } };
    }

    await this.prisma.reuniao.delete({ where: { id } });
    return { data: { count: 1 } };
  }

  private toPessoaCreate(p: ReuniaoPessoaInputDto) {
    // When portal user is referenced, store only the FK + meeting-specific fields.
    // nome/email/perfil are read from joined usuario row to avoid drift on rename.
    if (p.usuario_id) {
      return {
        usuario_id: p.usuario_id,
        nome: null,
        email: null,
        perfil: null,
        presente: p.presente ?? null,
      };
    }
    // External contact (no portal account) — denorm fields required by XOR check.
    if (!p.nome || !p.perfil) {
      throw new BadRequestException(
        'Para registrar pessoa externa (sem usuario_id), forneça nome e perfil.',
      );
    }
    return {
      usuario_id: null,
      nome: p.nome,
      email: p.email ?? null,
      perfil: p.perfil,
      presente: p.presente ?? null,
    };
  }
}
