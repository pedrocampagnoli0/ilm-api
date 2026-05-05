import {
  BadRequestException,
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
import type { CreateContatoPrincipalDto } from './dto/create-contato-principal.dto.js';
import type { UpdateContatoPrincipalDto } from './dto/update-contato-principal.dto.js';
import type { ListContatosPrincipaisQueryDto } from './dto/list-contatos-query.dto.js';

@Injectable()
export class ContatoPrincipalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  async findAll(user: AuthenticatedUser, query: ListContatosPrincipaisQueryDto) {
    const ability = this.abilityFactory.createForUser(user);
    let caslWhere: Prisma.contato_principalWhereInput;
    try {
      caslWhere = accessibleBy(ability, 'read').contato_principal;
    } catch {
      return { data: [] };
    }

    const filters: Prisma.contato_principalWhereInput[] = [caslWhere];
    if (query.municipio_id) filters.push({ municipio_id: query.municipio_id });

    const contatos = await this.prisma.contato_principal.findMany({
      where: { AND: filters },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
      include: {
        usuario: { select: { id: true, nome: true, email: true, perfil: { select: { nome: true } } } },
      },
    });
    return { data: contatos };
  }

  async create(user: AuthenticatedUser, dto: CreateContatoPrincipalDto) {
    const ability = this.abilityFactory.createForUser(user);
    if (!ability.can('create', subject('contato_principal', { municipio_id: dto.municipio_id } as any))) {
      throw new ForbiddenException('Você não tem permissão para criar contatos neste município.');
    }

    if (!dto.usuario_id && (!dto.nome || !dto.perfil)) {
      throw new BadRequestException(
        'Para registrar contato externo (sem usuario_id), forneça nome e perfil.',
      );
    }

    const contato = await this.prisma.contato_principal.create({
      data: {
        municipio_id: dto.municipio_id,
        usuario_id: dto.usuario_id ?? null,
        // Identity fields denormalized only when no portal user is referenced.
        nome: dto.usuario_id ? null : (dto.nome ?? null),
        email: dto.usuario_id ? null : (dto.email ?? null),
        perfil: dto.usuario_id ? null : (dto.perfil ?? null),
        // telefone stays even with usuario_id (usuario table has no telefone column).
        telefone: dto.telefone ?? null,
        cargo: dto.cargo ?? null,
        ordem: dto.ordem ?? 0,
      },
    });
    return { data: contato };
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateContatoPrincipalDto) {
    const ability = this.abilityFactory.createForUser(user);
    const existing = await this.prisma.contato_principal.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Contato não encontrado');
    if (!ability.can('update', subject('contato_principal', existing))) {
      throw new ForbiddenException('Você não pode editar contatos deste município.');
    }

    const data: Prisma.contato_principalUncheckedUpdateInput = {};
    if (dto.usuario_id !== undefined) data.usuario_id = dto.usuario_id;
    if (dto.nome !== undefined) data.nome = dto.nome;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.telefone !== undefined) data.telefone = dto.telefone;
    if (dto.perfil !== undefined) data.perfil = dto.perfil;
    if (dto.cargo !== undefined) data.cargo = dto.cargo;
    if (dto.ordem !== undefined) data.ordem = dto.ordem;

    const updated = await this.prisma.contato_principal.update({ where: { id }, data });
    return { data: updated };
  }

  async remove(user: AuthenticatedUser, id: string) {
    const ability = this.abilityFactory.createForUser(user);
    const existing = await this.prisma.contato_principal.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Contato não encontrado');
    if (!ability.can('delete', subject('contato_principal', existing))) {
      throw new ForbiddenException('Você não pode excluir contatos deste município.');
    }
    await this.prisma.contato_principal.delete({ where: { id } });
    return { data: { count: 1 } };
  }
}
