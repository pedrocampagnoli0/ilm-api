import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { accessibleBy } from '@casl/prisma';
import { PrismaService } from '../prisma/prisma.service.js';
import { AbilityFactory } from '../common/casl/ability.factory.js';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface.js';
import type { ListResultadosQueryDto } from './dto/list-resultados-query.dto.js';
import type { UpsertBatchDto } from './dto/upsert-batch.dto.js';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto.js';
import { buildPrismaSelect } from '../common/utils/build-prisma-select.js';

/**
 * Tenant-scope filter for resultado_avaliacao.
 *
 * CASL has no explicit rules for `resultado_avaliacao` (tracked as a "Future"
 * item in the AbilityFactory). We compose the scope via the `aluno` subject:
 * a user can see/touch a resultado iff they can see/touch the aluno it
 * belongs to. For administrador/ilm, getCaslWhere-style short-circuit returns
 * an unscoped filter.
 */
function resultadoAlunoScope(
  user: AuthenticatedUser,
  ability: ReturnType<AbilityFactory['createForUser']>,
  action: 'read' | 'delete',
): Prisma.resultado_avaliacaoWhereInput {
  if (user.perfil === 'administrador' || user.perfil === 'ilm') {
    return {};
  }
  return { aluno: accessibleBy(ability, action).aluno };
}

const RESULTADO_INCLUDE = {
  aluno: { select: { id: true, nome: true, is_transferido: true } },
  turma: { select: { id: true, nome: true, escola_id: true, professora_id: true, ciclo_id: true } },
} as const;

@Injectable()
export class ResultadoAvaliacaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  async findAll(user: AuthenticatedUser, query: ListResultadosQueryDto) {
    const ability = this.abilityFactory.createForUser(user);
    const filters: Prisma.resultado_avaliacaoWhereInput[] = [
      resultadoAlunoScope(user, ability, 'read'),
    ];

    if (query.avaliacao_id) {
      filters.push({ avaliacao_id: query.avaliacao_id });
    }
    if (query.turma_id) {
      filters.push({ turma_id: query.turma_id });
    }
    if (query.aluno_id) {
      filters.push({ aluno_id: query.aluno_id });
    }
    if (query.ciclo_id) {
      filters.push({ ciclo_id: query.ciclo_id });
    }
    if (query.ausente !== undefined) {
      filters.push({ ausente: query.ausente });
    }
    if (query.avaliacao_ids) {
      const idList = query.avaliacao_ids.split(',').map((s) => s.trim()).filter(Boolean);
      if (idList.length > 0) {
        filters.push({ avaliacao_id: { in: idList } });
      }
    }
    if (query.turma_ids) {
      const idList = query.turma_ids.split(',').map((s) => s.trim()).filter(Boolean);
      if (idList.length > 0) {
        filters.push({ turma_id: { in: idList } });
      }
    }
    if (query.aluno_ids) {
      const idList = query.aluno_ids.split(',').map((s) => s.trim()).filter(Boolean);
      if (idList.length > 0) {
        filters.push({ aluno_id: { in: idList } });
      }
    }

    const where: Prisma.resultado_avaliacaoWhereInput = filters.length > 0 ? { AND: filters } : {};

    const customSelect = query.fields
      ? buildPrismaSelect(query.fields)
      : null;

    const findArgs: Prisma.resultado_avaliacaoFindManyArgs = {
      where,
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      skip: query.skip,
      take: query.limit,
      ...(customSelect ? { select: customSelect } : { include: RESULTADO_INCLUDE }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.resultado_avaliacao.findMany(findArgs),
      this.prisma.resultado_avaliacao.count({ where }),
    ]);

    return new PaginatedResponseDto(data, total, query.page, query.limit);
  }

  /**
   * Batch upsert — wraps the `upsert_resultados_avaliacao_batch` RPC.
   * Calls the existing DB function via raw SQL so all the trigger/logging
   * logic in the database is preserved.
   */
  async upsertBatch(user: AuthenticatedUser, dto: UpsertBatchDto) {
    // Permission check: user must be able to write to this turma
    const turma = await this.prisma.turma.findUnique({
      where: { id: dto.turma_id },
      select: { id: true, escola_id: true },
    });
    if (!turma) {
      throw new NotFoundException('Turma não encontrada');
    }

    // Permission: admin/ilm can always write. Others must own the turma.
    const isAdmin = ['administrador', 'ilm'].includes(user.perfil);
    if (!isAdmin) {
      if (user.perfil === 'coordenacao' && !user.escolaIds.includes(turma.escola_id)) {
        throw new ForbiddenException('Acesso negado');
      }
      if (user.perfil === 'professor' && !user.turmaIds.includes(dto.turma_id)) {
        throw new ForbiddenException('Acesso negado');
      }
      if (user.perfil === 'secretaria' && !user.escolaIds.includes(turma.escola_id)) {
        throw new ForbiddenException('Acesso negado');
      }
      if (user.perfil === 'diretor' && !user.escolaIds.includes(turma.escola_id)) {
        throw new ForbiddenException('Acesso negado');
      }
    }

    // Call the existing DB function — preserves all trigger logic
    // Set auth.uid() so the function can log who made the change
    const resultadosJson = JSON.stringify(dto.resultados);

    // Run in a transaction so set_config + function call share the same session
    const result = await this.prisma.$transaction(async (tx) => {
      // Set auth.uid() so the DB function can log who made the change
      await tx.$executeRawUnsafe(
        `SELECT set_config('request.jwt.claims', $1::text, true)`,
        JSON.stringify({ sub: user.authUserId }),
      );

      const rows = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM upsert_resultados_avaliacao_batch($1::uuid, $2::uuid, $3::jsonb)`,
        dto.avaliacao_id,
        dto.turma_id,
        resultadosJson,
      );

      return rows;
    });

    return { data: result?.[0] ?? result };
  }

  /**
   * Get change history — wraps the `get_avaliacao_change_history` RPC.
   * Verifies the caller can read the target turma before invoking the RPC
   * (the RPC's own body is not in the migration ledger, so we can't rely on
   * it for tenant scope).
   */
  async getChangeHistory(user: AuthenticatedUser, turmaId: string, avaliacaoId: string) {
    const ability = this.abilityFactory.createForUser(user);
    if (!(user.perfil === 'administrador' || user.perfil === 'ilm')) {
      const turmaWhere = accessibleBy(ability, 'read').turma;
      const visible = await this.prisma.turma.count({
        where: { AND: [turmaWhere, { id: turmaId }] },
      });
      if (visible === 0) {
        throw new ForbiddenException('Acesso negado');
      }
    }

    const result = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        usuario_nome: string;
        change_action: string;
        changed_at: string;
        // A RPC devolve bigint (Postgres COUNT/CAST) — $queryRawUnsafe mapeia
        // isso pra BigInt nativo do Node, não pra number. Express/JSON.stringify
        // não sabe serializar BigInt (TypeError em runtime, apesar do tipo
        // aqui dizer "number" — essa anotação só existe em tempo de compilação).
        resultado_count: bigint;
      }>
    >(
      `SELECT * FROM get_avaliacao_change_history(
        in_turma_id := $1::uuid,
        in_avaliacao_id := $2::uuid
      )`,
      turmaId,
      avaliacaoId,
    );

    return {
      data: result.map((row) => ({ ...row, resultado_count: Number(row.resultado_count) })),
    };
  }

  /**
   * Radar report — F2 students with nivel_leitura or nivel_escrita in (1,2).
   * Scoped to the students the caller is allowed to read.
   */
  async radar(user: AuthenticatedUser, avaliacaoIds: string[], cicloId: string) {
    const ability = this.abilityFactory.createForUser(user);
    const scope = resultadoAlunoScope(user, ability, 'read');

    const data = await this.prisma.resultado_avaliacao.findMany({
      where: {
        AND: [
          scope,
          {
            avaliacao_id: { in: avaliacaoIds },
            ciclo_id: cicloId,
            ausente: false,
            aluno: { is_transferido: false },
            OR: [
              { f2_nivel_leitura: { in: [1, 2] } },
              { f2_nivel_escrita: { in: [1, 2] } },
            ],
          },
        ],
      },
      select: {
        aluno_id: true,
        turma_id: true,
        f2_nivel_leitura: true,
        f2_nivel_escrita: true,
        aluno: { select: { id: true, nome: true, is_transferido: true, is_inclusao: true } },
        turma: { select: { id: true, nome: true, escola_id: true, professora_id: true, ciclo_id: true } },
      },
    });

    return { data };
  }

  /**
   * Radar (2º ano) de vários municípios para o Painel da Assessora.
   * Autorização: só administrador/ilm (únicos perfis com acesso ao painel); os
   * municípios vêm do corpo porque "visualizar como" outra assessora é decidido
   * no front. Demais perfis: 403. Uma única query (CTEs), sem RLS.
   */
  async radarAssessora(user: AuthenticatedUser, municipioIds: string[]) {
    if (user.perfil !== 'administrador' && user.perfil !== 'ilm') {
      throw new ForbiddenException('Acesso negado');
    }
    if (municipioIds.length === 0) return { data: [] };

    const ids = [...new Set(municipioIds)];
    const ano = new Date().getFullYear();
    const rows = await this.prisma.$queryRaw<
      Array<{
        municipio_id: string;
        nome: string;
        alunos: bigint | number;
        inclusao: bigint | number;
        total: bigint | number;
        avaliacao: string | null;
      }>
    >`
      WITH ciclo2 AS (SELECT id FROM ciclo WHERE nome = 'fundamental_2'),
      munis AS (
        SELECT id, nome FROM municipio WHERE id = ANY(${ids}::uuid[])
      ),
      tot AS (
        SELECT e.municipio_id, count(*) AS n
        FROM aluno a
        JOIN turma t ON t.id = a.turma_id
        JOIN escola e ON e.id = t.escola_id
        WHERE t.ativo AND NOT a.is_transferido
          AND t.ciclo_id = (SELECT id FROM ciclo2)
          AND e.municipio_id = ANY(${ids}::uuid[])
        GROUP BY e.municipio_id
      ),
      -- tipos do ano com ao menos um resultado do 2º ano; o de nome "maior" (natural) vence
      tipo_escolhido AS (
        SELECT DISTINCT ON (av.municipio_id) av.municipio_id, ta.id AS tipo_id, ta.nome
        FROM avaliacao av
        JOIN tipo_avaliacao ta ON ta.id = av.tipo_id
        WHERE av.municipio_id = ANY(${ids}::uuid[])
          AND av.data_inicio >= make_date(${ano}::int, 1, 1)
          AND av.data_inicio < make_date(${ano}::int + 1, 1, 1)
          AND EXISTS (
            SELECT 1 FROM resultado_avaliacao r
            WHERE r.avaliacao_id = av.id AND r.ciclo_id = (SELECT id FROM ciclo2)
          )
        ORDER BY av.municipio_id,
          (regexp_match(ta.nome, '[0-9]+'))[1]::int DESC NULLS LAST, ta.nome DESC
      ),
      radar AS (
        SELECT DISTINCT te.municipio_id, r.aluno_id, a.is_inclusao
        FROM tipo_escolhido te
        JOIN avaliacao av ON av.municipio_id = te.municipio_id AND av.tipo_id = te.tipo_id
          AND av.data_inicio >= make_date(${ano}::int, 1, 1)
          AND av.data_inicio < make_date(${ano}::int + 1, 1, 1)
        JOIN resultado_avaliacao r ON r.avaliacao_id = av.id
          AND r.ciclo_id = (SELECT id FROM ciclo2)
          AND r.ausente = false
          AND (r.f2_nivel_leitura IN (1, 2) OR r.f2_nivel_escrita IN (1, 2))
        JOIN aluno a ON a.id = r.aluno_id AND NOT a.is_transferido
      ),
      agg AS (
        SELECT municipio_id, count(*) AS alunos, count(*) FILTER (WHERE is_inclusao) AS inclusao
        FROM radar GROUP BY municipio_id
      )
      SELECT m.id AS municipio_id, m.nome,
        COALESCE(agg.alunos, 0) AS alunos,
        COALESCE(agg.inclusao, 0) AS inclusao,
        COALESCE(tot.n, 0) AS total,
        te.nome AS avaliacao
      FROM munis m
      LEFT JOIN agg ON agg.municipio_id = m.id
      LEFT JOIN tot ON tot.municipio_id = m.id
      LEFT JOIN tipo_escolhido te ON te.municipio_id = m.id
      ORDER BY m.nome
    `;

    return {
      data: rows.map((r) => {
        const alunos = Number(r.alunos);
        const total = Number(r.total);
        return {
          municipio_id: r.municipio_id,
          nome: r.nome,
          alunos,
          inclusao: Number(r.inclusao),
          total,
          pct: total > 0 ? (alunos / total) * 100 : 0,
          avaliacao: r.avaliacao,
        };
      }),
    };
  }

  /**
   * Delete resultados for a student (only blank ones — respondido_em IS NULL).
   * Verifies the caller can delete the target aluno before proceeding.
   */
  async deleteBlankForAluno(user: AuthenticatedUser, alunoId: string) {
    await this.assertCanDeleteAluno(user, alunoId);

    const result = await this.prisma.resultado_avaliacao.deleteMany({
      where: {
        aluno_id: alunoId,
        respondido_em: null,
      },
    });

    return { data: { count: result.count } };
  }

  /**
   * Delete resultados for a specific student + avaliacao.
   * Verifies the caller can delete the target aluno before proceeding.
   */
  async deleteForAlunoAvaliacao(user: AuthenticatedUser, avaliacaoId: string, alunoId: string) {
    await this.assertCanDeleteAluno(user, alunoId);

    const result = await this.prisma.resultado_avaliacao.deleteMany({
      where: {
        avaliacao_id: avaliacaoId,
        aluno_id: alunoId,
      },
    });

    return { data: { count: result.count } };
  }

  /**
   * Verifies the caller has `delete` permission on the target aluno under CASL.
   * Throws NotFound if the aluno doesn't exist, Forbidden if the caller lacks scope.
   */
  private async assertCanDeleteAluno(user: AuthenticatedUser, alunoId: string): Promise<void> {
    if (user.perfil === 'administrador' || user.perfil === 'ilm') {
      const exists = await this.prisma.aluno.count({ where: { id: alunoId } });
      if (exists === 0) throw new NotFoundException('Aluno não encontrado');
      return;
    }

    const ability = this.abilityFactory.createForUser(user);
    const alunoWhere = accessibleBy(ability, 'delete').aluno;
    const matched = await this.prisma.aluno.count({
      where: { AND: [alunoWhere, { id: alunoId }] },
    });
    if (matched === 0) {
      // Cannot distinguish "does not exist" from "not allowed" without leaking.
      // Return Forbidden to avoid ID enumeration.
      throw new ForbiddenException('Acesso negado');
    }
  }
}
