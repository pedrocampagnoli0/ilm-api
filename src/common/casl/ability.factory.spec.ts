import { subject } from '@casl/ability';
import { AbilityFactory } from './ability.factory';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

function user(
  perfil: string,
  municipioId: string | null = 'm-1',
  assessoraMunicipioIds: string[] = [],
): AuthenticatedUser {
  return {
    id: 'u-1', authUserId: 'auth-1', nome: 'U', email: 'u@test.com',
    perfil: perfil as AuthenticatedUser['perfil'],
    municipioId, escolaIds: [], turmaIds: [],
    assessoraMunicipioIds,
    ativo: true,
  };
}

describe('AbilityFactory — Painel da Assessora subjects', () => {
  let factory: AbilityFactory;
  beforeEach(() => { factory = new AbilityFactory(); });

  describe('reuniao (assessora-scoped)', () => {
    it('ilm with assignment can manage assigned municípios', () => {
      const ab = factory.createForUser(user('ilm', null, ['m-1', 'm-2']));
      expect(ab.can('create', subject('reuniao', { municipio_id: 'm-1' } as any))).toBe(true);
      expect(ab.can('update', subject('reuniao', { municipio_id: 'm-2' } as any))).toBe(true);
    });

    it('ilm CANNOT access unassigned município', () => {
      const ab = factory.createForUser(user('ilm', null, ['m-1']));
      expect(ab.can('read', subject('reuniao', { municipio_id: 'm-9' } as any))).toBe(false);
    });

    it('ilm with empty assignment list has no access', () => {
      const ab = factory.createForUser(user('ilm', null, []));
      expect(ab.can('read', subject('reuniao', { municipio_id: 'm-1' } as any))).toBe(false);
    });

    it('administrador with assignment is also scoped', () => {
      const ab = factory.createForUser(user('administrador', null, ['m-3']));
      expect(ab.can('create', subject('reuniao', { municipio_id: 'm-3' } as any))).toBe(true);
      expect(ab.can('create', subject('reuniao', { municipio_id: 'm-1' } as any))).toBe(false);
    });

    it('administrador with empty list has no access', () => {
      const ab = factory.createForUser(user('administrador', null, []));
      expect(ab.can('read', subject('reuniao', { municipio_id: 'm-3' } as any))).toBe(false);
    });

    it('secretaria can read own município (unchanged)', () => {
      const ab = factory.createForUser(user('secretaria', 'm-1'));
      expect(ab.can('read', subject('reuniao', { municipio_id: 'm-1' } as any))).toBe(true);
      expect(ab.can('read', subject('reuniao', { municipio_id: 'm-2' } as any))).toBe(false);
    });

    it('secretaria CANNOT create or update reuniões', () => {
      const ab = factory.createForUser(user('secretaria', 'm-1'));
      expect(ab.can('create', subject('reuniao', { municipio_id: 'm-1' } as any))).toBe(false);
      expect(ab.can('update', subject('reuniao', { municipio_id: 'm-1' } as any))).toBe(false);
    });

    it('professor cannot read reuniões', () => {
      const ab = factory.createForUser(user('professor'));
      expect(ab.can('read', subject('reuniao', { municipio_id: 'm-1' } as any))).toBe(false);
    });

    it('coordenacao cannot manage reuniões', () => {
      const ab = factory.createForUser(user('coordenacao'));
      expect(ab.can('read', subject('reuniao', { municipio_id: 'm-1' } as any))).toBe(false);
    });

    it('diretor cannot manage reuniões', () => {
      const ab = factory.createForUser(user('diretor'));
      expect(ab.can('read', subject('reuniao', { municipio_id: 'm-1' } as any))).toBe(false);
    });
  });

  describe('observacao_assessora (assessora-scoped)', () => {
    it('ilm with assignment can manage', () => {
      const ab = factory.createForUser(user('ilm', null, ['m-1']));
      expect(ab.can('create', subject('observacao_assessora', { municipio_id: 'm-1' } as any))).toBe(true);
    });
    it('ilm without assignment denied', () => {
      const ab = factory.createForUser(user('ilm', null, []));
      expect(ab.can('read', subject('observacao_assessora', { municipio_id: 'm-1' } as any))).toBe(false);
    });
    it('secretaria reads own município', () => {
      const ab = factory.createForUser(user('secretaria', 'm-1'));
      expect(ab.can('read', subject('observacao_assessora', { municipio_id: 'm-1' } as any))).toBe(true);
      expect(ab.can('read', subject('observacao_assessora', { municipio_id: 'm-2' } as any))).toBe(false);
    });
    it('professor cannot read', () => {
      const ab = factory.createForUser(user('professor'));
      expect(ab.can('read', subject('observacao_assessora', { municipio_id: 'm-1' } as any))).toBe(false);
    });
  });

  describe('feriado', () => {
    it('any authenticated user can read', () => {
      for (const p of ['ilm', 'administrador', 'secretaria', 'diretor', 'coordenacao', 'professor']) {
        const ab = factory.createForUser(user(p));
        expect(ab.can('read', 'feriado')).toBe(true);
      }
    });
    it('ilm/admin can manage feriados (NOT scoped to assessora list)', () => {
      expect(factory.createForUser(user('ilm', null, [])).can('create', 'feriado')).toBe(true);
      expect(factory.createForUser(user('administrador', null, [])).can('delete', 'feriado')).toBe(true);
    });
    it('secretaria/professor CANNOT write', () => {
      expect(factory.createForUser(user('secretaria')).can('create', 'feriado')).toBe(false);
      expect(factory.createForUser(user('professor')).can('update', 'feriado')).toBe(false);
    });
  });

  describe('contato_principal (assessora-scoped)', () => {
    it('ilm with assignment can manage', () => {
      const ab = factory.createForUser(user('ilm', null, ['m-1']));
      expect(ab.can('create', subject('contato_principal', { municipio_id: 'm-1' } as any))).toBe(true);
    });
    it('ilm without assignment denied', () => {
      const ab = factory.createForUser(user('ilm', null, []));
      expect(ab.can('read', subject('contato_principal', { municipio_id: 'm-1' } as any))).toBe(false);
    });
    it('ilm cannot reach unassigned município', () => {
      const ab = factory.createForUser(user('ilm', null, ['m-1']));
      expect(ab.can('read', subject('contato_principal', { municipio_id: 'm-9' } as any))).toBe(false);
    });
    it('secretaria reads own município', () => {
      const ab = factory.createForUser(user('secretaria', 'm-1'));
      expect(ab.can('read', subject('contato_principal', { municipio_id: 'm-1' } as any))).toBe(true);
      expect(ab.can('read', subject('contato_principal', { municipio_id: 'm-2' } as any))).toBe(false);
      expect(ab.can('create', subject('contato_principal', { municipio_id: 'm-1' } as any))).toBe(false);
    });
    it('professor cannot read', () => {
      const ab = factory.createForUser(user('professor'));
      expect(ab.can('read', subject('contato_principal', { municipio_id: 'm-1' } as any))).toBe(false);
    });
  });
});
