import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AbilityFactory } from '../common/casl/ability.factory.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';
import type { CreateFlipbookDto } from './dto/create-flipbook.dto.js';
import type { UpdateFlipbookDto } from './dto/update-flipbook.dto.js';

const FORBIDDEN_MSG = 'Apenas perfis ilm ou administrador podem gerenciar flipbooks.';

@Injectable()
export class FlipbookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  private isAdmin(user: AuthenticatedUser) {
    return this.abilityFactory.createForUser(user).can('manage', 'flipbook');
  }

  /** Não-admin só enxerga os flipbooks ativos listados em usuario.flipbooks. */
  private async allowedWhere(user: AuthenticatedUser): Promise<Prisma.flipbookWhereInput> {
    if (this.isAdmin(user)) return {};
    const u = await this.prisma.usuario.findUnique({
      where: { id: user.id },
      select: { flipbooks: true },
    });
    return { ativo: true, id: { in: u?.flipbooks ?? [] } };
  }

  async findAll(user: AuthenticatedUser) {
    const where = await this.allowedWhere(user);
    const data = await this.prisma.flipbook.findMany({ where, orderBy: { titulo: 'asc' } });
    return { data };
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const where = await this.allowedWhere(user);
    const flipbook = await this.prisma.flipbook.findFirst({ where: { AND: [where, { id }] } });
    if (!flipbook) throw new NotFoundException('Flipbook não encontrado');
    return { data: flipbook };
  }

  async create(user: AuthenticatedUser, dto: CreateFlipbookDto) {
    if (!this.isAdmin(user)) throw new ForbiddenException(FORBIDDEN_MSG);
    const data = await this.prisma.flipbook.create({
      data: { titulo: dto.titulo.trim(), url: dto.url.trim(), ativo: dto.ativo ?? true },
    });
    return { data };
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateFlipbookDto) {
    if (!this.isAdmin(user)) throw new ForbiddenException(FORBIDDEN_MSG);
    const existing = await this.prisma.flipbook.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Flipbook não encontrado');

    const data: Prisma.flipbookUpdateInput = {};
    if (dto.titulo !== undefined) data.titulo = dto.titulo.trim();
    if (dto.url !== undefined) data.url = dto.url.trim();
    if (dto.ativo !== undefined) data.ativo = dto.ativo;

    const updated = await this.prisma.flipbook.update({ where: { id }, data });
    return { data: updated };
  }

  async remove(user: AuthenticatedUser, id: string) {
    if (!this.isAdmin(user)) throw new ForbiddenException(FORBIDDEN_MSG);
    const existing = await this.prisma.flipbook.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Flipbook não encontrado');
    await this.prisma.flipbook.delete({ where: { id } });
    return { data: { count: 1 } };
  }
}
