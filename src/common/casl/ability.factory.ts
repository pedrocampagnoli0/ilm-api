import { AbilityBuilder } from '@casl/ability';
import {
  createPrismaAbility,
  type PrismaAbility,
  type Subjects,
} from '@casl/prisma';
import type {
  aluno as Aluno,
  escola as Escola,
  municipio as Municipio,
  turma as Turma,
  usuario as Usuario,
  reuniao as Reuniao,
  observacao_assessora as ObservacaoAssessora,
  tentativa_contato as TentativaContato,
  feriado as Feriado,
  contato_principal as ContatoPrincipal,
} from '@prisma/client';
import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface.js';

type AppSubjects =
  | Subjects<{
      aluno: Aluno;
      escola: Escola;
      municipio: Municipio;
      turma: Turma;
      usuario: Usuario;
      reuniao: Reuniao;
      observacao_assessora: ObservacaoAssessora;
      tentativa_contato: TentativaContato;
      feriado: Feriado;
      contato_principal: ContatoPrincipal;
    }>
  | 'all';

type AppAction = 'manage' | 'create' | 'read' | 'update' | 'delete';

export type AppAbility = PrismaAbility<[AppAction, AppSubjects]>;

type Can = AbilityBuilder<AppAbility>['can'];
type Cannot = AbilityBuilder<AppAbility>['cannot'];

// ─── Per-entity rule definitions ────────────────────────

function defineEscolaRules(
  can: Can,
  cannot: Cannot,
  user: AuthenticatedUser,
) {
  switch (user.perfil) {
    case 'administrador':
    case 'ilm':
      can('manage', 'escola');
      break;

    case 'secretaria':
      if (user.municipioId) {
        can('read', 'escola', { municipio_id: user.municipioId });
        can('create', 'escola', { municipio_id: user.municipioId });
        can('update', 'escola', { municipio_id: user.municipioId });
      }
      break;

    case 'diretor':
      if (user.escolaIds.length > 0) {
        can('read', 'escola', { id: { in: user.escolaIds } });
        can('update', 'escola', { id: { in: user.escolaIds } });
      }
      break;

    case 'coordenacao':
      if (user.escolaIds.length > 0) {
        can('read', 'escola', { id: { in: user.escolaIds } });
      }
      break;

    case 'professor':
      if (user.escolaIds.length > 0) {
        can('read', 'escola', { id: { in: user.escolaIds } });
      }
      break;

    default:
      cannot('manage', 'escola');
      break;
  }
}

function defineMunicipioRules(
  can: Can,
  cannot: Cannot,
  user: AuthenticatedUser,
) {
  switch (user.perfil) {
    case 'administrador':
    case 'ilm':
      can('manage', 'municipio');
      break;

    case 'secretaria':
      if (user.municipioId) {
        can('read', 'municipio', { id: user.municipioId });
        can('update', 'municipio', { id: user.municipioId });
      }
      break;

    case 'diretor':
    case 'coordenacao':
    case 'professor':
      if (user.municipioId) {
        can('read', 'municipio', { id: user.municipioId });
      }
      break;

    default:
      cannot('manage', 'municipio');
      break;
  }
}

function defineTurmaRules(
  can: Can,
  cannot: Cannot,
  user: AuthenticatedUser,
) {
  switch (user.perfil) {
    case 'administrador':
    case 'ilm':
      can('manage', 'turma');
      break;

    case 'secretaria':
      // Secretaria can read/create/update turmas in their municipio's escolas
      if (user.escolaIds.length > 0) {
        can('read', 'turma', { escola_id: { in: user.escolaIds } });
        can('create', 'turma', { escola_id: { in: user.escolaIds } });
        can('update', 'turma', { escola_id: { in: user.escolaIds } });
      }
      break;

    case 'diretor':
      // Diretor can read/update turmas in their escola
      if (user.escolaIds.length > 0) {
        can('read', 'turma', { escola_id: { in: user.escolaIds } });
        can('update', 'turma', { escola_id: { in: user.escolaIds } });
      }
      break;

    case 'coordenacao':
      // Coordenador can read/update turmas in their coordinated escolas
      if (user.escolaIds.length > 0) {
        can('read', 'turma', { escola_id: { in: user.escolaIds } });
        can('update', 'turma', { escola_id: { in: user.escolaIds } });
      }
      break;

    case 'professor':
      // Professor can only read their own turmas (assigned as professora or auxiliar)
      if (user.turmaIds.length > 0) {
        can('read', 'turma', { id: { in: user.turmaIds } });
        can('update', 'turma', { id: { in: user.turmaIds } });
      }
      break;

    default:
      cannot('manage', 'turma');
      break;
  }
}

function defineUsuarioRules(
  can: Can,
  cannot: Cannot,
  user: AuthenticatedUser,
) {
  switch (user.perfil) {
    case 'administrador':
    case 'ilm':
      can('manage', 'usuario');
      break;

    case 'secretaria':
      // Secretaria can read/create/update usuarios in their municipio
      if (user.municipioId) {
        can('read', 'usuario', { municipio_id: user.municipioId });
        can('create', 'usuario', { municipio_id: user.municipioId });
        can('update', 'usuario', { municipio_id: user.municipioId });
      }
      break;

    case 'diretor':
      // Diretor can read usuarios in their escolas (teachers/coordinators)
      // and always read themselves
      can('read', 'usuario', { id: user.id });
      if (user.municipioId) {
        can('read', 'usuario', { municipio_id: user.municipioId });
      }
      break;

    case 'coordenacao':
      // Coordenador can read usuarios in their municipio
      can('read', 'usuario', { id: user.id });
      if (user.municipioId) {
        can('read', 'usuario', { municipio_id: user.municipioId });
      }
      break;

    case 'professor':
      // Professor can only read themselves
      can('read', 'usuario', { id: user.id });
      break;

    default:
      cannot('manage', 'usuario');
      break;
  }
}

function defineAlunoRules(
  can: Can,
  cannot: Cannot,
  user: AuthenticatedUser,
) {
  switch (user.perfil) {
    case 'administrador':
    case 'ilm':
      can('manage', 'aluno');
      break;

    case 'secretaria':
      if (user.escolaIds.length > 0) {
        can('manage', 'aluno', { escola_id: { in: user.escolaIds } });
      }
      break;

    case 'diretor':
      if (user.escolaIds.length > 0) {
        can('read', 'aluno', { escola_id: { in: user.escolaIds } });
        can('create', 'aluno', { escola_id: { in: user.escolaIds } });
        can('update', 'aluno', { escola_id: { in: user.escolaIds } });
        can('delete', 'aluno', { escola_id: { in: user.escolaIds } });
      }
      break;

    case 'coordenacao':
      if (user.escolaIds.length > 0) {
        can('read', 'aluno', { escola_id: { in: user.escolaIds } });
        can('create', 'aluno', { escola_id: { in: user.escolaIds } });
        can('update', 'aluno', { escola_id: { in: user.escolaIds } });
        can('delete', 'aluno', { escola_id: { in: user.escolaIds } });
      }
      break;

    case 'professor':
      if (user.turmaIds.length > 0) {
        can('read', 'aluno', { turma_id: { in: user.turmaIds } });
        can('create', 'aluno', { turma_id: { in: user.turmaIds } });
        can('update', 'aluno', { turma_id: { in: user.turmaIds } });
        can('delete', 'aluno', { turma_id: { in: user.turmaIds } });
      }
      break;

    default:
      cannot('manage', 'aluno');
      break;
  }
}

function defineReuniaoRules(
  can: Can,
  cannot: Cannot,
  user: AuthenticatedUser,
) {
  switch (user.perfil) {
    case 'administrador':
    case 'ilm':
      // Scoped to municípios assigned via assessora_municipio. Empty list = no access.
      if (user.assessoraMunicipioIds.length > 0) {
        can('manage', 'reuniao', { municipio_id: { in: user.assessoraMunicipioIds } });
      }
      break;

    case 'secretaria':
      if (user.municipioId) {
        can('read', 'reuniao', { municipio_id: user.municipioId });
      }
      break;

    default:
      cannot('manage', 'reuniao');
      break;
  }
}

function defineObservacaoRules(
  can: Can,
  cannot: Cannot,
  user: AuthenticatedUser,
) {
  switch (user.perfil) {
    case 'administrador':
    case 'ilm':
      if (user.assessoraMunicipioIds.length > 0) {
        can('manage', 'observacao_assessora', { municipio_id: { in: user.assessoraMunicipioIds } });
      }
      break;

    case 'secretaria':
      if (user.municipioId) {
        can('read', 'observacao_assessora', { municipio_id: user.municipioId });
      }
      break;

    default:
      cannot('manage', 'observacao_assessora');
      break;
  }
}

function defineTentativaContatoRules(
  can: Can,
  cannot: Cannot,
  user: AuthenticatedUser,
) {
  switch (user.perfil) {
    case 'administrador':
    case 'ilm':
      if (user.assessoraMunicipioIds.length > 0) {
        can('manage', 'tentativa_contato', { municipio_id: { in: user.assessoraMunicipioIds } });
      }
      break;

    case 'secretaria':
      if (user.municipioId) {
        can('read', 'tentativa_contato', { municipio_id: user.municipioId });
      }
      break;

    default:
      cannot('manage', 'tentativa_contato');
      break;
  }
}

function defineFeriadoRules(
  can: Can,
  cannot: Cannot,
  user: AuthenticatedUser,
) {
  // Everyone can read feriados (used by Agenda calendar overlay)
  can('read', 'feriado');

  if (user.perfil === 'administrador' || user.perfil === 'ilm') {
    can('manage', 'feriado');
  }
}

function defineContatoPrincipalRules(
  can: Can,
  cannot: Cannot,
  user: AuthenticatedUser,
) {
  switch (user.perfil) {
    case 'administrador':
    case 'ilm':
      if (user.assessoraMunicipioIds.length > 0) {
        can('manage', 'contato_principal', { municipio_id: { in: user.assessoraMunicipioIds } });
      }
      break;

    case 'secretaria':
      if (user.municipioId) {
        can('read', 'contato_principal', { municipio_id: user.municipioId });
      }
      break;

    default:
      cannot('manage', 'contato_principal');
      break;
  }
}

// ─── Factory ────────────────────────────────────────────

@Injectable()
export class AbilityFactory {
  private cache = new Map<string, { ability: AppAbility; expiresAt: number }>();

  createForUser(user: AuthenticatedUser): AppAbility {
    // Cache key: user id + perfil (perfil determines all rules)
    const cacheKey = `${user.id}:${user.perfil}:${user.escolaIds.join(',')}:${user.turmaIds.join(',')}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.ability;
    }

    const { can, cannot, build } = new AbilityBuilder<AppAbility>(
      createPrismaAbility,
    );

    defineEscolaRules(can, cannot, user);
    defineMunicipioRules(can, cannot, user);
    defineTurmaRules(can, cannot, user);
    defineUsuarioRules(can, cannot, user);
    defineAlunoRules(can, cannot, user);
    defineReuniaoRules(can, cannot, user);
    defineObservacaoRules(can, cannot, user);
    defineTentativaContatoRules(can, cannot, user);
    defineFeriadoRules(can, cannot, user);
    defineContatoPrincipalRules(can, cannot, user);

    const ability = build();

    // Cache for 30 seconds (matches JWT strategy cache TTL)
    this.cache.set(cacheKey, { ability, expiresAt: Date.now() + 30_000 });

    // Evict stale entries periodically
    if (this.cache.size > 100) {
      const now = Date.now();
      for (const [key, entry] of this.cache) {
        if (entry.expiresAt <= now) this.cache.delete(key);
      }
    }

    return ability;
  }
}
