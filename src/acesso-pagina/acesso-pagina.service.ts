import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';
import type { ResumoAcessoPaginaQueryDto } from './dto/acesso-pagina.dto.js';

const PERFIS_LEITURA = ['administrador', 'ilm'];

@Injectable()
export class AcessoPaginaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Uma linha por (usuário, dia, página); cada navegação soma um hit. */
  async registrar(user: AuthenticatedUser, pagina: string) {
    if (!user.ativo) return { ok: true };
    await this.prisma.$executeRaw`
      INSERT INTO usuario_acesso_pagina (usuario_id, data, pagina, primeiro_acesso, ultimo_acesso, hits)
      VALUES (${user.id}::uuid, (now() AT TIME ZONE 'America/Sao_Paulo')::date, ${pagina}, now(), now(), 1)
      ON CONFLICT (usuario_id, data, pagina) DO UPDATE
        SET ultimo_acesso = EXCLUDED.ultimo_acesso,
            hits = usuario_acesso_pagina.hits + 1`;
    return { ok: true };
  }

  async resumo(user: AuthenticatedUser, q: ResumoAcessoPaginaQueryDto) {
    if (!PERFIS_LEITURA.includes(user.perfil))
      throw new ForbiddenException('Acesso negado');

    const hoje = new Date();
    const de =
      q.date_from ??
      new Date(hoje.getTime() - 29 * 86400000).toISOString().slice(0, 10);
    const ate = q.date_to ?? hoje.toISOString().slice(0, 10);

    const conds: Prisma.Sql[] = [
      Prisma.sql`a.data BETWEEN ${de}::date AND ${ate}::date`,
    ];
    if (q.municipio_id)
      conds.push(Prisma.sql`u.municipio_id = ${q.municipio_id}::uuid`);
    if (q.perfil) conds.push(Prisma.sql`p.nome = ${q.perfil}`);
    if (q.pagina) conds.push(Prisma.sql`a.pagina = ${q.pagina}`);
    const where = Prisma.join(conds, ' AND ');
    const base = Prisma.sql`
      FROM usuario_acesso_pagina a
      JOIN usuario u ON u.id = a.usuario_id
      JOIN perfil p ON p.id = u.perfil_id
      LEFT JOIN municipio m ON m.id = u.municipio_id
      WHERE ${where}`;

    const [totais, porPagina, porMunicipio, porUsuario, porDia] =
      await Promise.all([
        this.prisma.$queryRaw<
          { usuarios: number; acessos: number; paginas: number }[]
        >`
        SELECT count(DISTINCT a.usuario_id)::int AS usuarios, coalesce(sum(a.hits), 0)::int AS acessos,
               count(DISTINCT a.pagina)::int AS paginas ${base}`,
        this.prisma.$queryRaw`
        SELECT a.pagina, count(DISTINCT a.usuario_id)::int AS usuarios, sum(a.hits)::int AS acessos,
               count(DISTINCT u.municipio_id)::int AS municipios
        ${base} GROUP BY a.pagina ORDER BY usuarios DESC, acessos DESC`,
        this.prisma.$queryRaw`
        SELECT u.municipio_id, coalesce(m.nome, '(sem município)') AS municipio_nome,
               count(DISTINCT a.usuario_id)::int AS usuarios, sum(a.hits)::int AS acessos,
               count(DISTINCT a.pagina)::int AS paginas
        ${base} GROUP BY u.municipio_id, m.nome ORDER BY usuarios DESC`,
        // ponytail: até 5000 usuários por consulta; paginar no servidor se o painel passar disso.
        this.prisma.$queryRaw`
        SELECT u.id AS usuario_id, u.nome, u.email, p.nome AS perfil, m.nome AS municipio_nome,
               count(DISTINCT a.pagina)::int AS paginas, sum(a.hits)::int AS acessos,
               count(DISTINCT a.data)::int AS dias, max(a.ultimo_acesso) AS ultimo_acesso
        ${base} GROUP BY u.id, u.nome, u.email, p.nome, m.nome ORDER BY acessos DESC LIMIT 5000`,
        this.prisma.$queryRaw`
        SELECT a.data::text AS dia, count(DISTINCT a.usuario_id)::int AS usuarios, sum(a.hits)::int AS acessos
        ${base} GROUP BY a.data ORDER BY a.data`,
      ]);

    return {
      data: {
        periodo: { de, ate },
        totais: totais[0],
        porPagina,
        porMunicipio,
        porUsuario,
        porDia,
      },
    };
  }
}
