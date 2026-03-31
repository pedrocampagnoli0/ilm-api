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
import type { CreateMunicipioDto } from './dto/create-municipio.dto.js';
import type { UpdateMunicipioDto } from './dto/update-municipio.dto.js';
import type { ListMunicipiosQueryDto } from './dto/list-municipios-query.dto.js';
import type { UpdateLivrosAtivosDto } from './dto/update-livros-ativos.dto.js';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto.js';

@Injectable()
export class MunicipioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  async findAll(user: AuthenticatedUser, query: ListMunicipiosQueryDto) {
    const ability = this.abilityFactory.createForUser(user);
    const caslWhere = accessibleBy(ability, 'read').municipio;

    const filters: Prisma.municipioWhereInput[] = [caslWhere];

    if (query.uf_sigla) {
      filters.push({ uf_sigla: query.uf_sigla.toUpperCase() });
    }
    if (query.ativo !== undefined) {
      filters.push({ ativo: query.ativo });
    }
    if (query.search) {
      filters.push({
        nome: { contains: query.search, mode: 'insensitive' },
      });
    }

    const where: Prisma.municipioWhereInput = { AND: filters };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.municipio.findMany({
        where,
        orderBy: { nome: 'asc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.municipio.count({ where }),
    ]);

    return new PaginatedResponseDto(data, total, query.page, query.limit);
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const ability = this.abilityFactory.createForUser(user);

    const municipio = await this.prisma.municipio.findUnique({
      where: { id },
      include: {
        _count: { select: { escolas: true, usuarios: true } },
      },
    });

    if (!municipio) {
      throw new NotFoundException('Município não encontrado');
    }

    if (!ability.can('read', subject('municipio', municipio))) {
      throw new ForbiddenException('Acesso negado');
    }

    return { data: municipio };
  }

  async create(user: AuthenticatedUser, dto: CreateMunicipioDto) {
    const ability = this.abilityFactory.createForUser(user);

    if (!ability.can('create', 'municipio')) {
      throw new ForbiddenException('Acesso negado');
    }

    const nome = dto.nome.trim().replace(/\s+/g, ' ');
    const uf_sigla = dto.uf_sigla.toUpperCase();

    // Check duplicate name in same UF
    const existing = await this.prisma.municipio.findFirst({
      where: {
        nome: { equals: nome, mode: 'insensitive' },
        uf_sigla,
      },
    });
    if (existing) {
      throw new ConflictException(
        'Já existe um município com esse nome neste estado',
      );
    }

    const municipio = await this.prisma.municipio.create({
      data: {
        nome,
        uf_sigla,
        ativo: dto.ativo ?? true,
        logo_municipio_url: dto.logo_municipio_url ?? null,
      },
    });

    return { data: municipio };
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateMunicipioDto) {
    const ability = this.abilityFactory.createForUser(user);

    const municipio = await this.prisma.municipio.findUnique({ where: { id } });
    if (!municipio) {
      throw new NotFoundException('Município não encontrado');
    }

    if (!ability.can('update', subject('municipio', municipio))) {
      throw new ForbiddenException('Acesso negado');
    }

    const data: Prisma.municipioUncheckedUpdateInput = {};
    if (dto.nome) data.nome = dto.nome.trim().replace(/\s+/g, ' ');
    if (dto.uf_sigla) data.uf_sigla = dto.uf_sigla.toUpperCase();
    if (dto.ativo !== undefined) data.ativo = dto.ativo;
    if ('logo_municipio_url' in dto) data.logo_municipio_url = dto.logo_municipio_url ?? null;

    // Check duplicate name if nome or uf changed
    if (dto.nome || dto.uf_sigla) {
      const checkNome = (data.nome as string) ?? municipio.nome;
      const checkUf = dto.uf_sigla?.toUpperCase() ?? municipio.uf_sigla;
      const existing = await this.prisma.municipio.findFirst({
        where: {
          nome: { equals: checkNome, mode: 'insensitive' },
          uf_sigla: checkUf,
          id: { not: id },
        },
      });
      if (existing) {
        throw new ConflictException(
          'Já existe um município com esse nome neste estado',
        );
      }
    }

    const updated = await this.prisma.municipio.update({
      where: { id },
      data,
    });

    return { data: updated };
  }

  async bulkInactivate(user: AuthenticatedUser, ids: string[]) {
    const ability = this.abilityFactory.createForUser(user);

    const municipios = await this.prisma.municipio.findMany({
      where: { id: { in: ids } },
    });

    for (const m of municipios) {
      if (!ability.can('update', subject('municipio', m))) {
        throw new ForbiddenException(
          `Acesso negado para o município "${m.nome}"`,
        );
      }
    }

    const result = await this.prisma.municipio.updateMany({
      where: { id: { in: ids } },
      data: { ativo: false },
    });

    return { data: { count: result.count } };
  }

  // ─── Livros Ativos sub-resource ─────────────────────────

  async getLivrosAtivos(user: AuthenticatedUser, municipioId: string) {
    const ability = this.abilityFactory.createForUser(user);

    const municipio = await this.prisma.municipio.findUnique({
      where: { id: municipioId },
    });
    if (!municipio) {
      throw new NotFoundException('Município não encontrado');
    }
    if (!ability.can('read', subject('municipio', municipio))) {
      throw new ForbiddenException('Acesso negado');
    }

    const livrosAtivos = await this.prisma.municipio_livros_ativos.findMany({
      where: { municipio_id: municipioId },
      include: { livro: { select: { id: true, titulo: true } } },
    });

    return { data: livrosAtivos.map((la) => la.livro) };
  }

  async updateLivrosAtivos(
    user: AuthenticatedUser,
    municipioId: string,
    dto: UpdateLivrosAtivosDto,
  ) {
    const ability = this.abilityFactory.createForUser(user);

    const municipio = await this.prisma.municipio.findUnique({
      where: { id: municipioId },
    });
    if (!municipio) {
      throw new NotFoundException('Município não encontrado');
    }
    if (!ability.can('update', subject('municipio', municipio))) {
      throw new ForbiddenException('Acesso negado');
    }

    // Delete all existing, then insert new, then read — all inside one transaction
    const livrosAtivos = await this.prisma.$transaction(async (tx) => {
      await tx.municipio_livros_ativos.deleteMany({
        where: { municipio_id: municipioId },
      });
      if (dto.livro_ids.length > 0) {
        await tx.municipio_livros_ativos.createMany({
          data: dto.livro_ids.map((livro_id) => ({
            municipio_id: municipioId,
            livro_id,
          })),
        });
      }
      return tx.municipio_livros_ativos.findMany({
        where: { municipio_id: municipioId },
        include: { livro: { select: { id: true, titulo: true } } },
      });
    });

    return { data: livrosAtivos.map((la) => la.livro) };
  }

  // ─── UF list (static reference data) ───────────────────

  async listUfs() {
    const ufs = await this.prisma.uf.findMany({ orderBy: { nome: 'asc' } });
    return { data: ufs };
  }
}
