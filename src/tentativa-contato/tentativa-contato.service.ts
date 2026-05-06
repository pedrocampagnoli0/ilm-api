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
import type { CreateTentativaContatoDto } from './dto/create-tentativa-contato.dto.js';
import type { UpdateTentativaContatoDto } from './dto/update-tentativa-contato.dto.js';
import type { ListTentativasContatoQueryDto } from './dto/list-tentativas-query.dto.js';

@Injectable()
export class TentativaContatoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  async findAll(user: AuthenticatedUser, query: ListTentativasContatoQueryDto) {
    const ability = this.abilityFactory.createForUser(user);
    let caslWhere: Prisma.tentativa_contatoWhereInput;
    try {
      caslWhere = accessibleBy(ability, 'read').tentativa_contato;
    } catch {
      return { data: [] };
    }

    const filters: Prisma.tentativa_contatoWhereInput[] = [caslWhere];
    if (query.municipio_id) filters.push({ municipio_id: query.municipio_id });
    if (query.usuario_id) filters.push({ usuario_id: query.usuario_id });
    if (query.pessoa_perfil) filters.push({ pessoa_perfil: query.pessoa_perfil });

    const tentativas = await this.prisma.tentativa_contato.findMany({
      where: { AND: filters },
      orderBy: [{ data: 'desc' }, { created_at: 'desc' }],
      take: 200,
      include: {
        usuario: {
          select: { id: true, nome: true, email: true, perfil: { select: { nome: true } } },
        },
      },
    });
    return { data: tentativas };
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const ability = this.abilityFactory.createForUser(user);
    const t = await this.prisma.tentativa_contato.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Tentativa não encontrada');
    if (!ability.can('read', subject('tentativa_contato', t))) {
      throw new ForbiddenException(
        'Você não pode acessar esta tentativa — verifique se o município está nas suas atribuições.',
      );
    }
    return { data: t };
  }

  async create(user: AuthenticatedUser, dto: CreateTentativaContatoDto) {
    const ability = this.abilityFactory.createForUser(user);
    if (
      !ability.can(
        'create',
        subject('tentativa_contato', { municipio_id: dto.municipio_id } as any),
      )
    ) {
      throw new ForbiddenException(
        'Você não tem permissão para registrar tentativas neste município.',
      );
    }

    if (!dto.usuario_id && (!dto.pessoa_nome || !dto.pessoa_perfil)) {
      throw new BadRequestException(
        'Para registrar pessoa externa (sem usuario_id), forneça pessoa_nome e pessoa_perfil.',
      );
    }

    const t = await this.prisma.tentativa_contato.create({
      data: {
        municipio_id: dto.municipio_id,
        usuario_id: dto.usuario_id ?? null,
        pessoa_nome: dto.usuario_id ? null : (dto.pessoa_nome ?? null),
        pessoa_perfil: dto.usuario_id ? null : (dto.pessoa_perfil ?? null),
        data: new Date(dto.data),
        canal: dto.canal,
        resultado: dto.resultado,
        observacao: dto.observacao ?? null,
        criado_por: user.id,
      },
    });
    return { data: t };
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateTentativaContatoDto) {
    const ability = this.abilityFactory.createForUser(user);
    const existing = await this.prisma.tentativa_contato.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Tentativa não encontrada');
    if (!ability.can('update', subject('tentativa_contato', existing))) {
      throw new ForbiddenException('Você não pode editar tentativas deste município.');
    }

    const data: Prisma.tentativa_contatoUncheckedUpdateInput = {};
    if (dto.usuario_id !== undefined) data.usuario_id = dto.usuario_id;
    if (dto.pessoa_nome !== undefined) data.pessoa_nome = dto.pessoa_nome;
    if (dto.pessoa_perfil !== undefined) data.pessoa_perfil = dto.pessoa_perfil;
    if (dto.data !== undefined) data.data = new Date(dto.data);
    if (dto.canal !== undefined) data.canal = dto.canal;
    if (dto.resultado !== undefined) data.resultado = dto.resultado;
    if (dto.observacao !== undefined) data.observacao = dto.observacao;

    const updated = await this.prisma.tentativa_contato.update({ where: { id }, data });
    return { data: updated };
  }

  async remove(user: AuthenticatedUser, id: string) {
    const ability = this.abilityFactory.createForUser(user);
    const existing = await this.prisma.tentativa_contato.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Tentativa não encontrada');
    if (!ability.can('delete', subject('tentativa_contato', existing))) {
      throw new ForbiddenException('Você não pode excluir tentativas deste município.');
    }
    await this.prisma.tentativa_contato.delete({ where: { id } });
    return { data: { count: 1 } };
  }
}
