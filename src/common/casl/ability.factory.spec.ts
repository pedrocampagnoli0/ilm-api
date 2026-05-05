import { subject } from '@casl/ability';
import { AbilityFactory } from './ability.factory';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

function user(perfil: string, municipioId: string | null = 'm-1'): AuthenticatedUser {
  return {
    id: 'u-1', authUserId: 'auth-1', nome: 'U', email: 'u@test.com',
    perfil: perfil as AuthenticatedUser['perfil'],
    municipioId, escolaIds: [], turmaIds: [], ativo: true,
  };
}

describe('AbilityFactory — Painel da Assessora subjects', () => {
  let factory: AbilityFactory;
  beforeEach(() => { factory = new AbilityFactory(); });

  describe('reuniao', () => {
    it('ilm can manage all reuniões', () => {
      const ab = factory.createForUser(user('ilm'));
      expect(ab.can('create', subject('reuniao', { municipio_id: 'any' } as any))).toBe(true);
      expect(ab.can('update', subject('reuniao', { municipio_id: 'any' } as any))).toBe(true);
      expect(ab.can('delete', subject('reuniao', { municipio_id: 'any' } as any))).toBe(true);
    });

    it('administrador can manage all reuniões', () => {
      const ab = factory.createForUser(user('administrador'));
      expect(ab.can('create', subject('reuniao', { municipio_id: 'm-2' } as any))).toBe(true);
    });

    it('secretaria can read own município reuniões but not other', () => {
      const ab = factory.createForUser(user('secretaria', 'm-1'));
      expect(ab.can('read', subject('reuniao', { municipio_id: 'm-1' } as any))).toBe(true);
      expect(ab.can('read', subject('reuniao', { municipio_id: 'm-2' } as any))).toBe(false);
    });

    it('secretaria CANNOT create or update reuniões', () => {
      const ab = factory.createForUser(user('secretaria', 'm-1'));
      expect(ab.can('create', subject('reuniao', { municipio_id: 'm-1' } as any))).toBe(false);
      expect(ab.can('update', subject('reuniao', { municipio_id: 'm-1' } as any))).toBe(false);
    });

    it('professor cannot read or write reuniões', () => {
      const ab = factory.createForUser(user('professor'));
      expect(ab.can('read', subject('reuniao', { municipio_id: 'm-1' } as any))).toBe(false);
      expect(ab.can('create', subject('reuniao', { municipio_id: 'm-1' } as any))).toBe(false);
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

  describe('observacao_assessora', () => {
    it('ilm can manage', () => {
      const ab = factory.createForUser(user('ilm'));
      expect(ab.can('manage', 'observacao_assessora')).toBe(true);
    });
    it('secretaria reads own município only', () => {
      const ab = factory.createForUser(user('secretaria', 'm-1'));
      expect(ab.can('read', subject('observacao_assessora', { municipio_id: 'm-1' } as any))).toBe(true);
      expect(ab.can('read', subject('observacao_assessora', { municipio_id: 'm-2' } as any))).toBe(false);
      expect(ab.can('create', subject('observacao_assessora', { municipio_id: 'm-1' } as any))).toBe(false);
    });
    it('professor cannot read', () => {
      const ab = factory.createForUser(user('professor'));
      expect(ab.can('read', subject('observacao_assessora', { municipio_id: 'm-1' } as any))).toBe(false);
    });
  });

  describe('feriado', () => {
    it('any authenticated user can read feriados', () => {
      for (const p of ['ilm', 'administrador', 'secretaria', 'diretor', 'coordenacao', 'professor']) {
        const ab = factory.createForUser(user(p));
        expect(ab.can('read', 'feriado')).toBe(true);
      }
    });
    it('ilm/admin can manage feriados', () => {
      expect(factory.createForUser(user('ilm')).can('create', 'feriado')).toBe(true);
      expect(factory.createForUser(user('administrador')).can('delete', 'feriado')).toBe(true);
    });
    it('secretaria/professor CANNOT write feriados', () => {
      expect(factory.createForUser(user('secretaria')).can('create', 'feriado')).toBe(false);
      expect(factory.createForUser(user('professor')).can('update', 'feriado')).toBe(false);
    });
  });

  describe('contato_principal', () => {
    it('ilm can manage', () => {
      const ab = factory.createForUser(user('ilm'));
      expect(ab.can('create', subject('contato_principal', { municipio_id: 'any' } as any))).toBe(true);
    });
    it('secretaria reads own município but cannot write', () => {
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
