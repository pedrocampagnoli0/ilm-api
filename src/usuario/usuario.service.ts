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
import type { CreateUsuarioDto } from './dto/create-usuario.dto.js';
import type { UpdateUsuarioDto } from './dto/update-usuario.dto.js';
import type { ListUsuariosQueryDto } from './dto/list-usuarios-query.dto.js';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto.js';
import { buildPrismaSelect } from '../common/utils/build-prisma-select.js';

const USUARIO_INCLUDE = {
  perfil: { select: { id: true, nome: true } },
  municipio: { select: { id: true, nome: true, uf_sigla: true } },
} as const;

@Injectable()
export class UsuarioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  async findAll(user: AuthenticatedUser, query: ListUsuariosQueryDto) {
    const ability = this.abilityFactory.createForUser(user);
    const caslWhere = accessibleBy(ability, 'read').usuario;

    const filters: Prisma.usuarioWhereInput[] = [caslWhere];

    if (query.perfil_id) {
      filters.push({ perfil_id: query.perfil_id });
    }
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
    if (query.search_email) {
      filters.push({
        email: { contains: query.search_email, mode: 'insensitive' },
      });
    }
    if (query.ids) {
      const idList = query.ids.split(',').map((s) => s.trim()).filter(Boolean);
      if (idList.length > 0) {
        filters.push({ id: { in: idList } });
      }
    }

    const where: Prisma.usuarioWhereInput = { AND: filters };

    const customSelect = query.fields
      ? buildPrismaSelect(query.fields)
      : null;

    const findArgs: Prisma.usuarioFindManyArgs = {
      where,
      orderBy: { nome: 'asc' },
      skip: query.skip,
      take: query.limit,
      ...(customSelect ? { select: customSelect } : { include: USUARIO_INCLUDE }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.usuario.findMany(findArgs),
      this.prisma.usuario.count({ where }),
    ]);

    return new PaginatedResponseDto(data, total, query.page, query.limit);
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const ability = this.abilityFactory.createForUser(user);

    const usuario = await this.prisma.usuario.findUnique({
      where: { id },
      include: USUARIO_INCLUDE,
    });

    if (!usuario) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (!ability.can('read', subject('usuario', usuario))) {
      throw new ForbiddenException('Acesso negado');
    }

    return { data: usuario };
  }

  async findByAuthUserId(authUserId: string) {
    const usuario = await this.prisma.usuario.findFirst({
      where: { auth_user_id: authUserId },
      include: USUARIO_INCLUDE,
    });

    if (!usuario) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return { data: usuario };
  }

  async create(user: AuthenticatedUser, dto: CreateUsuarioDto) {
    const ability = this.abilityFactory.createForUser(user);

    if (!ability.can('create', 'usuario')) {
      throw new ForbiddenException('Acesso negado');
    }

    const email = dto.email.trim().toLowerCase();
    const nome = dto.nome.trim().replace(/\s+/g, ' ');

    // Check duplicate email
    const existing = await this.prisma.usuario.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (existing) {
      throw new ConflictException('Já existe um usuário com este e-mail');
    }

    const usuario = await this.prisma.usuario.create({
      data: {
        nome,
        email,
        perfil_id: dto.perfil_id,
        municipio_id: dto.municipio_id ?? null,
        ativo: dto.ativo ?? true,
        tamanho_camiseta: dto.tamanho_camiseta ?? null,
      },
      include: USUARIO_INCLUDE,
    });

    return { data: usuario };
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateUsuarioDto) {
    const ability = this.abilityFactory.createForUser(user);

    const usuario = await this.prisma.usuario.findUnique({ where: { id } });
    if (!usuario) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (!ability.can('update', subject('usuario', usuario))) {
      throw new ForbiddenException('Acesso negado');
    }

    const data: Prisma.usuarioUncheckedUpdateInput = {};

    if (dto.nome) data.nome = dto.nome.trim().replace(/\s+/g, ' ');
    if (dto.email) {
      const newEmail = dto.email.trim().toLowerCase();
      if (newEmail !== usuario.email.toLowerCase()) {
        // Check duplicate email
        const existing = await this.prisma.usuario.findFirst({
          where: {
            email: { equals: newEmail, mode: 'insensitive' },
            id: { not: id },
          },
        });
        if (existing) {
          throw new ConflictException('Já existe um usuário com este e-mail');
        }
        data.email = newEmail;
      }
    }
    if (dto.perfil_id) data.perfil_id = dto.perfil_id;
    if ('municipio_id' in dto) data.municipio_id = dto.municipio_id ?? null;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;
    if ('tamanho_camiseta' in dto) data.tamanho_camiseta = dto.tamanho_camiseta ?? null;

    const updated = await this.prisma.usuario.update({
      where: { id },
      data,
      include: USUARIO_INCLUDE,
    });

    return { data: updated };
  }

  async delete(user: AuthenticatedUser, id: string) {
    const ability = this.abilityFactory.createForUser(user);

    const usuario = await this.prisma.usuario.findUnique({ where: { id } });
    if (!usuario) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (!ability.can('delete', subject('usuario', usuario))) {
      throw new ForbiddenException('Acesso negado');
    }

    await this.prisma.usuario.delete({ where: { id } });

    return { data: { id } };
  }

  async bulkInactivate(user: AuthenticatedUser, ids: string[]) {
    const ability = this.abilityFactory.createForUser(user);

    const usuarios = await this.prisma.usuario.findMany({
      where: { id: { in: ids } },
    });

    if (usuarios.length !== ids.length) {
      const found = new Set(usuarios.map((u) => u.id));
      const missing = ids.filter((id) => !found.has(id));
      throw new NotFoundException(
        `Usuários não encontrados: ${missing.join(', ')}`,
      );
    }

    for (const u of usuarios) {
      if (!ability.can('update', subject('usuario', u))) {
        throw new ForbiddenException(
          `Acesso negado para o usuário "${u.nome}"`,
        );
      }
    }

    const result = await this.prisma.usuario.updateMany({
      where: { id: { in: ids } },
      data: { ativo: false },
    });

    return { data: { count: result.count } };
  }
}
