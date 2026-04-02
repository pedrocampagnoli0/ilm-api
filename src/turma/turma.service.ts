import {
  ConflictException,
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
import type { CreateTurmaDto } from './dto/create-turma.dto.js';
import type { UpdateTurmaDto } from './dto/update-turma.dto.js';
import type { ListTurmasQueryDto } from './dto/list-turmas-query.dto.js';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto.js';

const TURMA_INCLUDE = {
  escola: { select: { id: true, nome: true, municipio_id: true, municipio: { select: { nome: true, uf_sigla: true } } } },
  ciclo: { select: { id: true, nome: true } },
  professora: { select: { id: true, nome: true } },
  auxiliar: { select: { id: true, nome: true } },
} as const;

@Injectable()
export class TurmaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  async findAll(user: AuthenticatedUser, query: ListTurmasQueryDto) {
    const ability = this.abilityFactory.createForUser(user);
    const caslWhere = accessibleBy(ability, 'read').turma;

    const filters: Prisma.turmaWhereInput[] = [caslWhere];

    if (query.escola_id) {
      filters.push({ escola_id: query.escola_id });
    }
    if (query.ciclo_id) {
      filters.push({ ciclo_id: query.ciclo_id });
    }
    if (query.professora_id) {
      filters.push({ professora_id: query.professora_id });
    }
    if (query.ativo !== undefined) {
      filters.push({ ativo: query.ativo });
    }
    if (query.search) {
      filters.push({
        nome: { contains: query.search, mode: 'insensitive' },
      });
    }
    if (query.escola_ids) {
      const idList = query.escola_ids.split(',').map((s) => s.trim()).filter(Boolean);
      if (idList.length > 0) {
        filters.push({ escola_id: { in: idList } });
      }
    }
    if (query.ids) {
      const idList = query.ids.split(',').map((s) => s.trim()).filter(Boolean);
      if (idList.length > 0) {
        filters.push({ id: { in: idList } });
      }
    }
    // municipio_id: two-step filter via escola
    if (query.municipio_id) {
      const escolas = await this.prisma.escola.findMany({
        where: { municipio_id: query.municipio_id },
        select: { id: true },
      });
      const escolaIds = escolas.map((e) => e.id);
      if (escolaIds.length === 0) {
        return new PaginatedResponseDto([], 0, query.page, query.limit);
      }
      filters.push({ escola_id: { in: escolaIds } });
    }

    const where: Prisma.turmaWhereInput = { AND: filters };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.turma.findMany({
        where,
        include: TURMA_INCLUDE,
        orderBy: { nome: 'asc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.turma.count({ where }),
    ]);

    return new PaginatedResponseDto(data, total, query.page, query.limit);
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const ability = this.abilityFactory.createForUser(user);

    const turma = await this.prisma.turma.findUnique({
      where: { id },
      include: TURMA_INCLUDE,
    });

    if (!turma) {
      throw new NotFoundException('Turma não encontrada');
    }

    if (!ability.can('read', subject('turma', turma))) {
      throw new ForbiddenException('Acesso negado');
    }

    return { data: turma };
  }

  async create(user: AuthenticatedUser, dto: CreateTurmaDto) {
    const ability = this.abilityFactory.createForUser(user);

    const testTurma = { escola_id: dto.escola_id } as Prisma.turmaGetPayload<object>;
    if (!ability.can('create', subject('turma', testTurma))) {
      throw new ForbiddenException('Acesso negado');
    }

    const nome = dto.nome.trim().replace(/\s+/g, ' ');

    // Check duplicate name in same escola + ciclo
    const existing = await this.prisma.turma.findFirst({
      where: {
        nome: { equals: nome, mode: 'insensitive' },
        escola_id: dto.escola_id,
        ciclo_id: dto.ciclo_id,
      },
    });
    if (existing) {
      throw new ConflictException(
        'Já existe uma turma com este nome nesta escola e ciclo',
      );
    }

    const turma = await this.prisma.turma.create({
      data: {
        nome,
        escola_id: dto.escola_id,
        ciclo_id: dto.ciclo_id,
        professora_id: dto.professora_id,
        auxiliar_id: dto.auxiliar_id ?? null,
        ativo: dto.ativo ?? true,
      },
      include: TURMA_INCLUDE,
    });

    return { data: turma };
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateTurmaDto) {
    const ability = this.abilityFactory.createForUser(user);

    const turma = await this.prisma.turma.findUnique({ where: { id } });
    if (!turma) {
      throw new NotFoundException('Turma não encontrada');
    }

    if (!ability.can('update', subject('turma', turma))) {
      throw new ForbiddenException('Acesso negado');
    }

    // If changing escola, check no alunos exist
    if (dto.escola_id && dto.escola_id !== turma.escola_id) {
      // aluno table not yet in schema — will be enforced when aluno module is added
    }

    const data: Prisma.turmaUncheckedUpdateInput = {};

    // Professor can only update auxiliar_id
    const isTeacher = user.perfil === 'professor';
    if (isTeacher) {
      if (dto.escola_id || dto.ciclo_id || dto.professora_id || dto.ativo !== undefined || dto.nome) {
        throw new ForbiddenException(
          'Professores só podem alterar a professora auxiliar',
        );
      }
    }

    if (dto.nome) data.nome = dto.nome.trim().replace(/\s+/g, ' ');
    if (dto.escola_id) data.escola_id = dto.escola_id;
    if (dto.ciclo_id) data.ciclo_id = dto.ciclo_id;
    if (dto.professora_id) data.professora_id = dto.professora_id;
    if ('auxiliar_id' in dto) data.auxiliar_id = dto.auxiliar_id ?? null;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;

    const updated = await this.prisma.turma.update({
      where: { id },
      data,
      include: TURMA_INCLUDE,
    });

    return { data: updated };
  }

  async bulkInactivate(user: AuthenticatedUser, ids: string[]) {
    const ability = this.abilityFactory.createForUser(user);

    const result = await this.prisma.$transaction(async (tx) => {
      const turmas = await tx.turma.findMany({
        where: { id: { in: ids } },
      });

      if (turmas.length !== ids.length) {
        const found = new Set(turmas.map((t) => t.id));
        const missing = ids.filter((id) => !found.has(id));
        throw new NotFoundException(
          `Turmas não encontradas: ${missing.join(', ')}`,
        );
      }

      for (const t of turmas) {
        if (!ability.can('update', subject('turma', t))) {
          throw new ForbiddenException(
            `Acesso negado para a turma "${t.nome}"`,
          );
        }
      }

      return tx.turma.updateMany({
        where: { id: { in: ids } },
        data: { ativo: false },
      });
    });

    return { data: { count: result.count } };
  }
}
