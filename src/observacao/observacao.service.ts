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
import type { CreateObservacaoDto } from './dto/create-observacao.dto.js';
import type { UpdateObservacaoDto } from './dto/update-observacao.dto.js';
import type { ListObservacoesQueryDto } from './dto/list-observacoes-query.dto.js';

@Injectable()
export class ObservacaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  async findAll(user: AuthenticatedUser, query: ListObservacoesQueryDto) {
    const ability = this.abilityFactory.createForUser(user);
    const caslWhere = accessibleBy(ability, 'read').observacao_assessora;

    const filters: Prisma.observacao_assessoraWhereInput[] = [caslWhere];
    if (query.municipio_id) filters.push({ municipio_id: query.municipio_id });
    if (query.usuario_id) filters.push({ usuario_id: query.usuario_id });
    if (query.pessoa_perfil) filters.push({ pessoa_perfil: query.pessoa_perfil });

    const observacoes = await this.prisma.observacao_assessora.findMany({
      where: { AND: filters },
      orderBy: [{ data: 'desc' }, { created_at: 'desc' }],
      take: 200,
      include: {
        usuario: { select: { id: true, nome: true, email: true, perfil: { select: { nome: true } } } },
      },
    });
    return { data: observacoes };
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const ability = this.abilityFactory.createForUser(user);
    const obs = await this.prisma.observacao_assessora.findUnique({ where: { id } });
    if (!obs) throw new NotFoundException('Observação não encontrada');
    if (!ability.can('read', subject('observacao_assessora', obs))) {
      throw new ForbiddenException('Acesso negado');
    }
    return { data: obs };
  }

  async create(user: AuthenticatedUser, dto: CreateObservacaoDto) {
    const ability = this.abilityFactory.createForUser(user);
    if (!ability.can('create', subject('observacao_assessora', { municipio_id: dto.municipio_id } as any))) {
      throw new ForbiddenException('Acesso negado');
    }

    if (!dto.usuario_id && (!dto.pessoa_nome || !dto.pessoa_perfil)) {
      throw new BadRequestException('Pessoa externa exige pessoa_nome e pessoa_perfil');
    }

    const obs = await this.prisma.observacao_assessora.create({
      data: {
        municipio_id: dto.municipio_id,
        usuario_id: dto.usuario_id ?? null,
        pessoa_nome: dto.usuario_id ? null : (dto.pessoa_nome ?? null),
        pessoa_perfil: dto.usuario_id ? null : (dto.pessoa_perfil ?? null),
        data: new Date(dto.data),
        conteudo: dto.conteudo,
        criado_por: user.id,
      },
    });
    return { data: obs };
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateObservacaoDto) {
    const ability = this.abilityFactory.createForUser(user);
    const existing = await this.prisma.observacao_assessora.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Observação não encontrada');
    if (!ability.can('update', subject('observacao_assessora', existing))) {
      throw new ForbiddenException('Acesso negado');
    }

    const data: Prisma.observacao_assessoraUncheckedUpdateInput = {};
    if (dto.usuario_id !== undefined) data.usuario_id = dto.usuario_id;
    if (dto.pessoa_nome !== undefined) data.pessoa_nome = dto.pessoa_nome;
    if (dto.pessoa_perfil !== undefined) data.pessoa_perfil = dto.pessoa_perfil;
    if (dto.data !== undefined) data.data = new Date(dto.data);
    if (dto.conteudo !== undefined) data.conteudo = dto.conteudo;

    const updated = await this.prisma.observacao_assessora.update({ where: { id }, data });
    return { data: updated };
  }

  async remove(user: AuthenticatedUser, id: string) {
    const ability = this.abilityFactory.createForUser(user);
    const existing = await this.prisma.observacao_assessora.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Observação não encontrada');
    if (!ability.can('delete', subject('observacao_assessora', existing))) {
      throw new ForbiddenException('Acesso negado');
    }
    await this.prisma.observacao_assessora.delete({ where: { id } });
    return { data: { count: 1 } };
  }
}
