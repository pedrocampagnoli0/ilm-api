import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';
import type { ListLogsQueryDto } from './dto/list-logs-query.dto.js';
import type { CreateLogDto } from './dto/create-log.dto.js';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto.js';

@Injectable()
export class LogLoginService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: AuthenticatedUser, query: ListLogsQueryDto) {
    if (!['administrador', 'ilm'].includes(user.perfil)) {
      throw new ForbiddenException('Acesso negado');
    }

    const filters: Prisma.log_tentativa_loginWhereInput[] = [];

    if (query.email) {
      filters.push({ email: { contains: query.email, mode: 'insensitive' } });
    }
    if (query.resultado) {
      filters.push({ resultado: query.resultado });
    }
    if (query.date_from) {
      filters.push({ criado_em: { gte: new Date(query.date_from) } });
    }
    if (query.date_to) {
      filters.push({ criado_em: { lte: new Date(query.date_to) } });
    }

    // Filter by municipio or nome — resolve via usuario emails
    if (query.municipio_id || query.nome) {
      const userFilters: Prisma.usuarioWhereInput[] = [{ ativo: true }];
      if (query.municipio_id) userFilters.push({ municipio_id: query.municipio_id });
      if (query.nome) userFilters.push({ nome: { contains: query.nome, mode: 'insensitive' } });

      const usuarios = await this.prisma.usuario.findMany({
        where: { AND: userFilters },
        select: { email: true },
      });

      const emails = usuarios.map((u) => u.email);
      if (emails.length === 0) {
        return new PaginatedResponseDto([], 0, query.page, query.limit);
      }
      filters.push({ email: { in: emails } });
    }

    const where: Prisma.log_tentativa_loginWhereInput = filters.length > 0 ? { AND: filters } : {};

    const [data, total] = await this.prisma.$transaction([
      this.prisma.log_tentativa_login.findMany({
        where,
        orderBy: [{ criado_em: 'desc' }, { id: 'asc' }],
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.log_tentativa_login.count({ where }),
    ]);

    return new PaginatedResponseDto(data, total, query.page, query.limit);
  }

  /**
   * Aggregated stats: count per day + resultado breakdown.
   */
  async stats(user: AuthenticatedUser, query: ListLogsQueryDto) {
    if (!['administrador', 'ilm'].includes(user.perfil)) {
      throw new ForbiddenException('Acesso negado');
    }

    const filters: Prisma.log_tentativa_loginWhereInput[] = [];
    if (query.email) filters.push({ email: { contains: query.email, mode: 'insensitive' } });
    if (query.resultado) filters.push({ resultado: query.resultado });
    if (query.date_from) filters.push({ criado_em: { gte: new Date(query.date_from) } });
    if (query.date_to) filters.push({ criado_em: { lte: new Date(query.date_to) } });

    if (query.municipio_id || query.nome) {
      const userFilters: Prisma.usuarioWhereInput[] = [{ ativo: true }];
      if (query.municipio_id) userFilters.push({ municipio_id: query.municipio_id });
      if (query.nome) userFilters.push({ nome: { contains: query.nome, mode: 'insensitive' } });
      const usuarios = await this.prisma.usuario.findMany({
        where: { AND: userFilters },
        select: { email: true },
      });
      const emails = usuarios.map((u) => u.email);
      if (emails.length === 0) return { data: { total: 0, sucesso: 0, falha: 0, byDay: [] } };
      filters.push({ email: { in: emails } });
    }

    const where: Prisma.log_tentativa_loginWhereInput = filters.length > 0 ? { AND: filters } : {};

    const [total, sucesso, falha] = await this.prisma.$transaction([
      this.prisma.log_tentativa_login.count({ where }),
      this.prisma.log_tentativa_login.count({ where: { ...where, resultado: 'sucesso' } }),
      this.prisma.log_tentativa_login.count({ where: { ...where, resultado: 'falha' } }),
    ]);

    // Per-day breakdown via raw SQL for grouping
    const byDay = await this.prisma.$queryRawUnsafe<
      Array<{ dia: string; total: number; sucesso: number; falha: number }>
    >(
      `SELECT
        DATE(criado_em AT TIME ZONE 'America/Sao_Paulo') as dia,
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE resultado = 'sucesso')::int as sucesso,
        COUNT(*) FILTER (WHERE resultado = 'falha')::int as falha
      FROM log_tentativa_login
      WHERE criado_em >= $1 AND criado_em <= $2
      GROUP BY dia ORDER BY dia DESC LIMIT 30`,
      query.date_from ? new Date(query.date_from) : new Date(Date.now() - 30 * 86400000),
      query.date_to ? new Date(query.date_to) : new Date(),
    );

    return { data: { total, sucesso, falha, byDay } };
  }

  async create(dto: CreateLogDto) {
    const log = await this.prisma.log_tentativa_login.create({
      data: {
        email: dto.email,
        resultado: dto.resultado,
        erro_detalhe: dto.erro_detalhe ?? null,
        ip: dto.ip ?? null,
        user_agent: dto.user_agent ?? null,
      },
    });

    return { data: log };
  }
}
