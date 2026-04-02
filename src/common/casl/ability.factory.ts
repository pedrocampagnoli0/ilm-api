import { AbilityBuilder } from '@casl/ability';
import {
  createPrismaAbility,
  type PrismaAbility,
  type Subjects,
} from '@casl/prisma';
import type {
  escola as Escola,
  municipio as Municipio,
  turma as Turma,
  usuario as Usuario,
} from '@prisma/client';
import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface.js';

type AppSubjects =
  | Subjects<{
      escola: Escola;
      municipio: Municipio;
      turma: Turma;
      usuario: Usuario;
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
      // Coordenador can read turmas in their coordinated escolas
      if (user.escolaIds.length > 0) {
        can('read', 'turma', { escola_id: { in: user.escolaIds } });
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

// Future: defineAlunoRules, defineAvaliacaoRules, etc.

// ─── Factory ────────────────────────────────────────────

@Injectable()
export class AbilityFactory {
  createForUser(user: AuthenticatedUser): AppAbility {
    const { can, cannot, build } = new AbilityBuilder<AppAbility>(
      createPrismaAbility,
    );

    defineEscolaRules(can, cannot, user);
    defineMunicipioRules(can, cannot, user);
    defineTurmaRules(can, cannot, user);
    // Future: defineAlunoRules(can, cannot, user);

    return build();
  }
}
