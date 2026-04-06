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
import type { CreateAlunoDto } from './dto/create-aluno.dto.js';
import type { UpdateAlunoDto } from './dto/update-aluno.dto.js';
import type { ListAlunosQueryDto } from './dto/list-alunos-query.dto.js';
import type { ImportAlunosDto } from './dto/import-alunos.dto.js';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto.js';
import { buildPrismaSelect } from '../common/utils/build-prisma-select.js';
import { getCaslWhere } from '../common/utils/paginated-query.js';

const ALUNO_INCLUDE = {
  turma: { select: { id: true, nome: true } },
  escola: { select: { id: true, nome: true } },
  municipio: { select: { id: true, nome: true } },
} as const;

@Injectable()
export class AlunoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  async findAll(user: AuthenticatedUser, query: ListAlunosQueryDto) {
    const ability = this.abilityFactory.createForUser(user);
    const caslWhere = getCaslWhere(user, ability, 'read', 'aluno');

    const filters: Prisma.alunoWhereInput[] = [caslWhere];

    if (query.turma_id) {
      filters.push({ turma_id: query.turma_id });
    }
    if (query.escola_id) {
      filters.push({ escola_id: query.escola_id });
    }
    if (query.municipio_id) {
      filters.push({ municipio_id: query.municipio_id });
    }
    if (query.is_inclusao !== undefined) {
      filters.push({ is_inclusao: query.is_inclusao });
    }
    if (query.is_transferido !== undefined) {
      filters.push({ is_transferido: query.is_transferido });
    }
    if (query.search) {
      filters.push({
        nome: { contains: query.search, mode: 'insensitive' },
      });
    }
    if (query.ids) {
      const idList = query.ids.split(',').map((s) => s.trim()).filter(Boolean);
      if (idList.length > 0) {
        filters.push({ id: { in: idList } });
      }
    }
    if (query.turma_ids) {
      const idList = query.turma_ids.split(',').map((s) => s.trim()).filter(Boolean);
      if (idList.length > 0) {
        filters.push({ turma_id: { in: idList } });
      }
    }

    const where: Prisma.alunoWhereInput = { AND: filters };

    const customSelect = query.fields
      ? buildPrismaSelect(query.fields)
      : null;

    const findArgs: Prisma.alunoFindManyArgs = {
      where,
      orderBy: { nome: 'asc' },
      skip: query.skip,
      take: query.limit,
      ...(customSelect ? { select: customSelect } : { include: ALUNO_INCLUDE }),
    };

    if (query.skip_count) {
      const data = await this.prisma.aluno.findMany(findArgs);
      return new PaginatedResponseDto(data, -1, query.page, query.limit);
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.aluno.findMany(findArgs),
      this.prisma.aluno.count({ where }),
    ]);

    return new PaginatedResponseDto(data, total, query.page, query.limit);
  }

  async count(user: AuthenticatedUser, query: ListAlunosQueryDto) {
    const ability = this.abilityFactory.createForUser(user);
    const caslWhere = accessibleBy(ability, 'read').aluno;

    const filters: Prisma.alunoWhereInput[] = [caslWhere];

    if (query.turma_id) filters.push({ turma_id: query.turma_id });
    if (query.escola_id) filters.push({ escola_id: query.escola_id });
    if (query.municipio_id) filters.push({ municipio_id: query.municipio_id });
    if (query.is_inclusao !== undefined) filters.push({ is_inclusao: query.is_inclusao });
    if (query.is_transferido !== undefined) filters.push({ is_transferido: query.is_transferido });
    if (query.turma_ids) {
      const idList = query.turma_ids.split(',').map((s) => s.trim()).filter(Boolean);
      if (idList.length > 0) filters.push({ turma_id: { in: idList } });
    }

    const where: Prisma.alunoWhereInput = { AND: filters };
    const total = await this.prisma.aluno.count({ where });

    return { data: { count: total } };
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const ability = this.abilityFactory.createForUser(user);

    const aluno = await this.prisma.aluno.findUnique({
      where: { id },
      include: ALUNO_INCLUDE,
    });

    if (!aluno) {
      throw new NotFoundException('Aluno não encontrado');
    }

    if (!ability.can('read', subject('aluno', aluno))) {
      throw new ForbiddenException('Acesso negado');
    }

    return { data: aluno };
  }

  async create(user: AuthenticatedUser, dto: CreateAlunoDto) {
    const ability = this.abilityFactory.createForUser(user);

    // Check permission based on the turma's escola
    const turma = await this.prisma.turma.findUnique({
      where: { id: dto.turma_id },
      select: { escola_id: true },
    });
    if (!turma) {
      throw new NotFoundException('Turma não encontrada');
    }

    const testAluno = { turma_id: dto.turma_id, escola_id: turma.escola_id, municipio_id: dto.municipio_id } as Prisma.alunoGetPayload<object>;
    if (!ability.can('create', subject('aluno', testAluno))) {
      throw new ForbiddenException('Acesso negado');
    }

    const nome = dto.nome.trim().replace(/\s+/g, ' ');

    const aluno = await this.prisma.aluno.create({
      data: {
        nome,
        turma_id: dto.turma_id,
        escola_id: dto.escola_id ?? turma.escola_id,
        municipio_id: dto.municipio_id,
        is_inclusao: dto.is_inclusao ?? false,
      },
      include: ALUNO_INCLUDE,
    });

    return { data: aluno };
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateAlunoDto) {
    const ability = this.abilityFactory.createForUser(user);

    const aluno = await this.prisma.aluno.findUnique({ where: { id } });
    if (!aluno) {
      throw new NotFoundException('Aluno não encontrado');
    }

    if (!ability.can('update', subject('aluno', aluno))) {
      throw new ForbiddenException('Acesso negado');
    }

    const data: Prisma.alunoUncheckedUpdateInput = {};

    if (dto.nome) data.nome = dto.nome.trim().replace(/\s+/g, ' ');
    if (dto.turma_id) data.turma_id = dto.turma_id;
    if ('escola_id' in dto) data.escola_id = dto.escola_id ?? null;
    if (dto.municipio_id) data.municipio_id = dto.municipio_id;
    if (dto.is_inclusao !== undefined) data.is_inclusao = dto.is_inclusao;
    if (dto.is_transferido !== undefined) {
      data.is_transferido = dto.is_transferido;
      data.transferido_em = dto.is_transferido ? new Date() : null;
    }

    const updated = await this.prisma.aluno.update({
      where: { id },
      data,
      include: ALUNO_INCLUDE,
    });

    return { data: updated };
  }

  async delete(user: AuthenticatedUser, id: string) {
    const ability = this.abilityFactory.createForUser(user);

    const aluno = await this.prisma.aluno.findUnique({ where: { id } });
    if (!aluno) {
      throw new NotFoundException('Aluno não encontrado');
    }

    if (!ability.can('delete', subject('aluno', aluno))) {
      throw new ForbiddenException('Acesso negado');
    }

    await this.prisma.aluno.delete({ where: { id } });

    return { data: { id } };
  }

  async bulkDelete(user: AuthenticatedUser, ids: string[]) {
    const ability = this.abilityFactory.createForUser(user);

    const alunos = await this.prisma.aluno.findMany({
      where: { id: { in: ids } },
    });

    if (alunos.length !== ids.length) {
      const found = new Set(alunos.map((a) => a.id));
      const missing = ids.filter((id) => !found.has(id));
      throw new NotFoundException(
        `Alunos não encontrados: ${missing.join(', ')}`,
      );
    }

    for (const a of alunos) {
      if (!ability.can('delete', subject('aluno', a))) {
        throw new ForbiddenException(
          `Acesso negado para o aluno "${a.nome}"`,
        );
      }
    }

    const result = await this.prisma.aluno.deleteMany({
      where: { id: { in: ids } },
    });

    return { data: { count: result.count } };
  }

  async import(user: AuthenticatedUser, dto: ImportAlunosDto) {
    const ability = this.abilityFactory.createForUser(user);

    // Check permission
    const turma = await this.prisma.turma.findUnique({
      where: { id: dto.turma_id },
      select: { escola_id: true },
    });
    if (!turma) {
      throw new NotFoundException('Turma não encontrada');
    }

    const testAluno = { turma_id: dto.turma_id, escola_id: turma.escola_id, municipio_id: dto.municipio_id } as Prisma.alunoGetPayload<object>;
    if (!ability.can('create', subject('aluno', testAluno))) {
      throw new ForbiddenException('Acesso negado');
    }

    // Get existing names in this turma to skip duplicates
    const existing = await this.prisma.aluno.findMany({
      where: { turma_id: dto.turma_id },
      select: { nome: true },
    });
    const existingNames = new Set(
      existing.map((a) => a.nome.trim().toLowerCase()),
    );

    const toInsert: Prisma.alunoCreateManyInput[] = [];
    let totalIgnorados = 0;

    for (const row of dto.rows) {
      const nome = row.nome.trim().replace(/\s+/g, ' ');
      if (!nome) {
        totalIgnorados++;
        continue;
      }
      if (existingNames.has(nome.toLowerCase())) {
        totalIgnorados++;
        continue;
      }
      existingNames.add(nome.toLowerCase());
      toInsert.push({
        nome,
        turma_id: dto.turma_id,
        escola_id: dto.escola_id,
        municipio_id: dto.municipio_id,
        is_inclusao: row.inclusao ?? false,
      });
    }

    if (toInsert.length > 0) {
      await this.prisma.aluno.createMany({ data: toInsert });
    }

    return {
      data: {
        total_importados: toInsert.length,
        total_ignorados: totalIgnorados,
      },
    };
  }
}
