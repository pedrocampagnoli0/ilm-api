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
import { AbilityFactory, type AppAbility } from '../common/casl/ability.factory.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';
import type { CreateEscolaDto } from './dto/create-escola.dto.js';
import type { UpdateEscolaDto } from './dto/update-escola.dto.js';
import type { ListEscolasQueryDto } from './dto/list-escolas-query.dto.js';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto.js';

const ESCOLA_INCLUDE = {
  municipio: { select: { id: true, nome: true, uf_sigla: true } },
  coord_inf: { select: { id: true, nome: true } },
  coord_fund: { select: { id: true, nome: true } },
  diretor: { select: { id: true, nome: true } },
} as const;

@Injectable()
export class EscolaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  async findAll(user: AuthenticatedUser, query: ListEscolasQueryDto) {
    const ability = this.abilityFactory.createForUser(user);
    const caslWhere = accessibleBy(ability, 'read').escola;

    const filters: Prisma.escolaWhereInput[] = [caslWhere];

    if (query.municipio_id) {
      filters.push({ municipio_id: query.municipio_id });
    }
    if (query.ativo !== undefined) {
      filters.push({ ativo: query.ativo });
    }
    if (query.search) {
      filters.push({
        nome: { contains: query.search, mode: 'insensitive' },
      });
    }

    const where: Prisma.escolaWhereInput = { AND: filters };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.escola.findMany({
        where,
        include: ESCOLA_INCLUDE,
        orderBy: { nome: 'asc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.escola.count({ where }),
    ]);

    return new PaginatedResponseDto(data, total, query.page, query.limit);
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const ability = this.abilityFactory.createForUser(user);

    const escola = await this.prisma.escola.findUnique({
      where: { id },
      include: {
        ...ESCOLA_INCLUDE,
        turmas: {
          select: { id: true, nome: true, ativo: true },
          orderBy: { nome: 'asc' },
        },
      },
    });

    if (!escola) {
      throw new NotFoundException('Escola não encontrada');
    }

    if (!ability.can('read', subject('escola', escola))) {
      throw new ForbiddenException('Acesso negado');
    }

    return { data: escola };
  }

  async create(user: AuthenticatedUser, dto: CreateEscolaDto) {
    const ability = this.abilityFactory.createForUser(user);

    // Check create permission for this municipio
    const testEscola = { municipio_id: dto.municipio_id } as Prisma.escolaGetPayload<object>;
    if (!ability.can('create', subject('escola', testEscola))) {
      throw new ForbiddenException('Acesso negado');
    }

    // Normalize name
    const nome = dto.nome.trim().replace(/\s+/g, ' ');

    // Check duplicate name in same municipio
    const existing = await this.prisma.escola.findFirst({
      where: { nome: { equals: nome, mode: 'insensitive' }, municipio_id: dto.municipio_id },
    });
    if (existing) {
      throw new ConflictException('Já existe uma escola com este nome neste município');
    }

    const escola = await this.prisma.escola.create({
      data: {
        nome,
        municipio_id: dto.municipio_id,
        coord_inf_id: dto.coord_inf_id ?? null,
        coord_fund_id: dto.coord_fund_id ?? null,
        diretor_id: dto.diretor_id ?? null,
        ativo: dto.ativo ?? true,
      },
      include: ESCOLA_INCLUDE,
    });

    return { data: escola };
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateEscolaDto) {
    const ability = this.abilityFactory.createForUser(user);

    const escola = await this.prisma.escola.findUnique({ where: { id } });
    if (!escola) {
      throw new NotFoundException('Escola não encontrada');
    }

    if (!ability.can('update', subject('escola', escola))) {
      throw new ForbiddenException('Acesso negado');
    }

    // If changing municipio, check no turmas/alunos exist
    if (dto.municipio_id && dto.municipio_id !== escola.municipio_id) {
      const turmaCount = await this.prisma.turma.count({
        where: { escola_id: id },
      });
      if (turmaCount > 0) {
        throw new ConflictException(
          'Não é possível alterar o município desta escola pois ela possui turmas vinculadas',
        );
      }
    }

    // Build update input explicitly (no spread-then-delete)
    const data: Prisma.escolaUpdateInput = {};
    if (dto.nome) data.nome = dto.nome.trim().replace(/\s+/g, ' ');
    if (dto.ativo !== undefined) data.ativo = dto.ativo;
    if ('municipio_id' in dto) {
      data.municipio = { connect: { id: dto.municipio_id } };
    }
    if ('coord_inf_id' in dto) {
      data.coord_inf = dto.coord_inf_id
        ? { connect: { id: dto.coord_inf_id } }
        : { disconnect: true };
    }
    if ('coord_fund_id' in dto) {
      data.coord_fund = dto.coord_fund_id
        ? { connect: { id: dto.coord_fund_id } }
        : { disconnect: true };
    }
    if ('diretor_id' in dto) {
      data.diretor = dto.diretor_id
        ? { connect: { id: dto.diretor_id } }
        : { disconnect: true };
    }

    const updated = await this.prisma.escola.update({
      where: { id },
      data,
      include: ESCOLA_INCLUDE,
    });

    return { data: updated };
  }

  async bulkInactivate(user: AuthenticatedUser, ids: string[]) {
    const ability = this.abilityFactory.createForUser(user);

    // Verify the user can update all requested escolas
    const escolas = await this.prisma.escola.findMany({
      where: { id: { in: ids } },
    });

    for (const escola of escolas) {
      if (!ability.can('update', subject('escola', escola))) {
        throw new ForbiddenException(
          `Acesso negado para a escola "${escola.nome}"`,
        );
      }
    }

    const result = await this.prisma.escola.updateMany({
      where: { id: { in: ids } },
      data: { ativo: false },
    });

    return { data: { count: result.count } };
  }
}