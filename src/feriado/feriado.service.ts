import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { subject } from '@casl/ability';
import { PrismaService } from '../prisma/prisma.service.js';
import { AbilityFactory } from '../common/casl/ability.factory.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';
import type { CreateFeriadoDto } from './dto/create-feriado.dto.js';
import type { UpdateFeriadoDto } from './dto/update-feriado.dto.js';
import type { ListFeriadosQueryDto } from './dto/list-feriados-query.dto.js';

@Injectable()
export class FeriadoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  async findAll(_user: AuthenticatedUser, query: ListFeriadosQueryDto) {
    const filters: Prisma.feriadoWhereInput[] = [];

    if (query.ano) {
      const start = new Date(query.ano, 0, 1);
      const end = new Date(query.ano + 1, 0, 1);
      filters.push({ data: { gte: start, lt: end } });
    }

    if (query.municipio_id) {
      const muni = await this.prisma.municipio.findUnique({
        where: { id: query.municipio_id },
        select: { uf_sigla: true },
      });
      if (!muni) throw new NotFoundException('Município não encontrado');
      // nacional (NULL,NULL) | estadual (uf_sigla=muni.uf) | municipal (municipio_id=muni)
      filters.push({
        OR: [
          { municipio_id: null, uf_sigla: null },
          { uf_sigla: muni.uf_sigla },
          { municipio_id: query.municipio_id },
        ],
      });
    }

    const feriados = await this.prisma.feriado.findMany({
      where: { AND: filters },
      orderBy: [{ data: 'asc' }, { nome: 'asc' }],
    });
    return { data: feriados };
  }

  async create(user: AuthenticatedUser, dto: CreateFeriadoDto) {
    const ability = this.abilityFactory.createForUser(user);
    if (!ability.can('create', 'feriado')) {
      throw new ForbiddenException('Acesso negado');
    }
    if (dto.municipio_id && dto.uf_sigla) {
      throw new BadRequestException('Use apenas um: municipio_id ou uf_sigla');
    }

    const feriado = await this.prisma.feriado.create({
      data: {
        nome: dto.nome,
        data: new Date(dto.data),
        municipio_id: dto.municipio_id ?? null,
        uf_sigla: dto.uf_sigla ?? null,
      },
    });
    return { data: feriado };
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateFeriadoDto) {
    const ability = this.abilityFactory.createForUser(user);
    const existing = await this.prisma.feriado.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Feriado não encontrado');
    if (!ability.can('update', subject('feriado', existing))) {
      throw new ForbiddenException('Acesso negado');
    }

    const data: Prisma.feriadoUncheckedUpdateInput = {};
    if (dto.nome !== undefined) data.nome = dto.nome;
    if (dto.data !== undefined) data.data = new Date(dto.data);
    if (dto.municipio_id !== undefined) data.municipio_id = dto.municipio_id;
    if (dto.uf_sigla !== undefined) data.uf_sigla = dto.uf_sigla;

    const willHaveMuni = data.municipio_id ?? existing.municipio_id;
    const willHaveUf = data.uf_sigla ?? existing.uf_sigla;
    if (willHaveMuni && willHaveUf) {
      throw new BadRequestException('Use apenas um: municipio_id ou uf_sigla');
    }

    const updated = await this.prisma.feriado.update({ where: { id }, data });
    return { data: updated };
  }

  async remove(user: AuthenticatedUser, id: string) {
    const ability = this.abilityFactory.createForUser(user);
    const existing = await this.prisma.feriado.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Feriado não encontrado');
    if (!ability.can('delete', subject('feriado', existing))) {
      throw new ForbiddenException('Acesso negado');
    }
    await this.prisma.feriado.delete({ where: { id } });
    return { data: { count: 1 } };
  }
}
