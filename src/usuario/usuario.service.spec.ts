import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UsuarioService } from './usuario.service';
import { PrismaService } from '../prisma/prisma.service';
import { AbilityFactory } from '../common/casl/ability.factory';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface';
import type { ListUsuariosQueryDto } from './dto/list-usuarios-query.dto';

// ─── Helpers ────────────────────────────────────────────

function makeAdmin(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'admin-uuid',
    authUserId: 'auth-admin-uuid',
    nome: 'Admin',
    email: 'admin@test.com',
    perfil: 'administrador',
    municipioId: null,
    escolaIds: [],
    turmaIds: [],
    ativo: true,
    ...overrides,
  };
}

function makeProfessor(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'prof-uuid',
    authUserId: 'auth-prof-uuid',
    nome: 'Professor',
    email: 'prof@test.com',
    perfil: 'professor',
    municipioId: 'muni-uuid',
    escolaIds: ['escola-uuid'],
    turmaIds: ['turma-uuid'],
    ativo: true,
    ...overrides,
  };
}

function makeSecretaria(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'sec-uuid',
    authUserId: 'auth-sec-uuid',
    nome: 'Secretaria',
    email: 'sec@test.com',
    perfil: 'secretaria',
    municipioId: 'muni-uuid',
    escolaIds: [],
    turmaIds: [],
    ativo: true,
    ...overrides,
  };
}

const mockUsuario = {
  id: 'user-uuid',
  nome: 'Test User',
  email: 'test@test.com',
  auth_user_id: 'auth-uuid',
  perfil_id: 'perfil-uuid',
  municipio_id: 'muni-uuid',
  ativo: true,
  tamanho_camiseta: null,
  created_at: new Date(),
  updated_at: new Date(),
};

const mockUsuarioWithIncludes = {
  ...mockUsuario,
  perfil: { id: 'perfil-uuid', nome: 'professor' },
  municipio: { id: 'muni-uuid', nome: 'Test Municipio', uf_sigla: 'SP' },
};

// ─── Mock PrismaService ─────────────────────────────────

function createMockPrisma() {
  return {
    usuario: {
      findMany: jest.fn().mockResolvedValue([mockUsuarioWithIncludes]),
      findUnique: jest.fn().mockResolvedValue(mockUsuarioWithIncludes),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(mockUsuarioWithIncludes),
      update: jest.fn().mockResolvedValue(mockUsuarioWithIncludes),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      delete: jest.fn().mockResolvedValue(mockUsuario),
      count: jest.fn().mockResolvedValue(1),
    },
    perfil: {
      // Default mock returns 'professor' perfil; individual tests override as needed.
      findUnique: jest.fn().mockResolvedValue({ nome: 'professor' }),
    },
    $transaction: jest.fn().mockImplementation((args: unknown[]) =>
      Promise.all(args),
    ),
  };
}

// ─── Tests ──────────────────────────────────────────────

describe('UsuarioService', () => {
  let service: UsuarioService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsuarioService,
        { provide: PrismaService, useValue: prisma },
        AbilityFactory,
      ],
    }).compile();

    service = module.get<UsuarioService>(UsuarioService);
  });

  // ─── findAll ────────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated usuarios for admin', async () => {
      const query = { page: 1, limit: 20, skip: 0 } as ListUsuariosQueryDto;
      const result = await service.findAll(makeAdmin(), query);

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
    });

    it('should apply perfil_id filter', async () => {
      const query = { page: 1, limit: 20, skip: 0, perfil_id: 'perfil-uuid' } as ListUsuariosQueryDto;
      await service.findAll(makeAdmin(), query);

      const txArgs = prisma.$transaction.mock.calls[0][0];
      // findMany is the first call in the transaction
      expect(prisma.usuario.findMany).toHaveBeenCalled();
    });

    it('should apply search filter', async () => {
      const query = { page: 1, limit: 20, skip: 0, search: 'maria' } as ListUsuariosQueryDto;
      await service.findAll(makeAdmin(), query);

      expect(prisma.usuario.findMany).toHaveBeenCalled();
    });

    it('should apply search_email filter', async () => {
      const query = { page: 1, limit: 20, skip: 0, search_email: 'test@' } as ListUsuariosQueryDto;
      await service.findAll(makeAdmin(), query);

      expect(prisma.usuario.findMany).toHaveBeenCalled();
    });

    it('should apply ids filter', async () => {
      const query = { page: 1, limit: 20, skip: 0, ids: 'id1,id2' } as ListUsuariosQueryDto;
      await service.findAll(makeAdmin(), query);

      expect(prisma.usuario.findMany).toHaveBeenCalled();
    });
  });

  // ─── findOne ────────────────────────────────────────────

  describe('findOne', () => {
    it('should return a usuario by ID for admin', async () => {
      const result = await service.findOne(makeAdmin(), 'user-uuid');
      expect(result.data.id).toBe('user-uuid');
    });

    it('should throw NotFoundException for non-existent usuario', async () => {
      prisma.usuario.findUnique.mockResolvedValue(null);
      await expect(service.findOne(makeAdmin(), 'missing-uuid'))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when professor reads another user', async () => {
      // Professor can only read themselves
      const otherUser = { ...mockUsuarioWithIncludes, id: 'other-uuid', municipio_id: 'other-muni' };
      prisma.usuario.findUnique.mockResolvedValue(otherUser);
      await expect(service.findOne(makeProfessor(), 'other-uuid'))
        .rejects.toThrow(ForbiddenException);
    });
  });

  // ─── findByAuthUserId ───────────────────────────────────

  describe('findByAuthUserId', () => {
    it('should return usuario by auth_user_id', async () => {
      prisma.usuario.findFirst.mockResolvedValue(mockUsuarioWithIncludes);
      const result = await service.findByAuthUserId('auth-uuid');
      expect(result.data.id).toBe('user-uuid');
    });

    it('should throw NotFoundException when not found', async () => {
      prisma.usuario.findFirst.mockResolvedValue(null);
      await expect(service.findByAuthUserId('missing-auth'))
        .rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ─────────────────────────────────────────────

  describe('create', () => {
    it('should create a usuario', async () => {
      const dto = { nome: 'New User', email: 'new@test.com', perfil_id: 'perfil-uuid' };
      const result = await service.create(makeAdmin(), dto);
      expect(result.data).toBeDefined();
      expect(prisma.usuario.create).toHaveBeenCalled();
    });

    it('should throw ConflictException for duplicate email', async () => {
      prisma.usuario.findFirst.mockResolvedValue(mockUsuario);
      const dto = { nome: 'Dup', email: 'test@test.com', perfil_id: 'perfil-uuid' };
      await expect(service.create(makeAdmin(), dto))
        .rejects.toThrow(ConflictException);
    });

    it('should throw ForbiddenException for professor', async () => {
      const dto = { nome: 'New', email: 'new@test.com', perfil_id: 'perfil-uuid' };
      await expect(service.create(makeProfessor(), dto))
        .rejects.toThrow(ForbiddenException);
    });

    it('should normalize email to lowercase', async () => {
      const dto = { nome: 'User', email: 'TEST@EMAIL.COM', perfil_id: 'perfil-uuid' };
      await service.create(makeAdmin(), dto);
      const createCall = prisma.usuario.create.mock.calls[0][0];
      expect(createCall.data.email).toBe('test@email.com');
    });

    // F-12 regression tests
    it('should allow secretaria to create a professor in their own municipio', async () => {
      prisma.perfil.findUnique.mockResolvedValue({ nome: 'professor' });
      const dto = {
        nome: 'New Professor',
        email: 'np@test.com',
        perfil_id: 'perfil-prof-uuid',
        municipio_id: 'muni-uuid', // same as secretaria.municipioId
      };
      const result = await service.create(makeSecretaria(), dto);
      expect(result.data).toBeDefined();
      expect(prisma.usuario.create).toHaveBeenCalled();
    });

    it('F-12: should deny secretaria creating a usuario with administrador perfil', async () => {
      prisma.perfil.findUnique.mockResolvedValue({ nome: 'administrador' });
      const dto = {
        nome: 'Escalation',
        email: 'esc@test.com',
        perfil_id: 'perfil-admin-uuid',
        municipio_id: 'muni-uuid', // same as secretaria.municipioId
      };
      await expect(service.create(makeSecretaria(), dto))
        .rejects.toThrow(ForbiddenException);
      expect(prisma.usuario.create).not.toHaveBeenCalled();
    });

    it('F-12: should deny secretaria creating a usuario with ilm perfil', async () => {
      prisma.perfil.findUnique.mockResolvedValue({ nome: 'ilm' });
      const dto = {
        nome: 'Escalation ILM',
        email: 'esc-ilm@test.com',
        perfil_id: 'perfil-ilm-uuid',
        municipio_id: 'muni-uuid',
      };
      await expect(service.create(makeSecretaria(), dto))
        .rejects.toThrow(ForbiddenException);
      expect(prisma.usuario.create).not.toHaveBeenCalled();
    });

    it('F-12: should deny secretaria creating a usuario in a different municipio', async () => {
      const dto = {
        nome: 'Cross Tenant',
        email: 'xt@test.com',
        perfil_id: 'perfil-prof-uuid',
        municipio_id: 'other-muni-uuid', // different from secretaria.municipioId
      };
      await expect(service.create(makeSecretaria(), dto))
        .rejects.toThrow(ForbiddenException);
      expect(prisma.usuario.create).not.toHaveBeenCalled();
    });

    it('should still allow admin to create a usuario with administrador perfil', async () => {
      // Admins bypass the perfil whitelist; the perfil lookup should not even run.
      const dto = {
        nome: 'New Admin',
        email: 'na@test.com',
        perfil_id: 'perfil-admin-uuid',
        municipio_id: 'any-muni',
      };
      const result = await service.create(makeAdmin(), dto);
      expect(result.data).toBeDefined();
      expect(prisma.perfil.findUnique).not.toHaveBeenCalled();
    });
  });

  // ─── update ─────────────────────────────────────────────

  describe('update', () => {
    it('should update a usuario', async () => {
      const dto = { nome: 'Updated Name' };
      const result = await service.update(makeAdmin(), 'user-uuid', dto);
      expect(result.data).toBeDefined();
      expect(prisma.usuario.update).toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent usuario', async () => {
      prisma.usuario.findUnique.mockResolvedValue(null);
      await expect(service.update(makeAdmin(), 'missing-uuid', { nome: 'X' }))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException for duplicate email on update', async () => {
      prisma.usuario.findFirst.mockResolvedValue({ ...mockUsuario, id: 'other-uuid' });
      await expect(service.update(makeAdmin(), 'user-uuid', { email: 'other@test.com' }))
        .rejects.toThrow(ConflictException);
    });
  });

  // ─── delete ─────────────────────────────────────────────

  describe('delete', () => {
    it('should delete a usuario', async () => {
      const result = await service.delete(makeAdmin(), 'user-uuid');
      expect(result.data.id).toBe('user-uuid');
      expect(prisma.usuario.delete).toHaveBeenCalledWith({ where: { id: 'user-uuid' } });
    });

    it('should throw NotFoundException for non-existent usuario', async () => {
      prisma.usuario.findUnique.mockResolvedValue(null);
      await expect(service.delete(makeAdmin(), 'missing-uuid'))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for professor', async () => {
      const otherUser = { ...mockUsuario, id: 'other-uuid', municipio_id: 'other-muni' };
      prisma.usuario.findUnique.mockResolvedValue(otherUser);
      await expect(service.delete(makeProfessor(), 'other-uuid'))
        .rejects.toThrow(ForbiddenException);
    });
  });

  // ─── bulkInactivate ─────────────────────────────────────

  describe('bulkInactivate', () => {
    it('should inactivate multiple usuarios', async () => {
      prisma.usuario.findMany.mockResolvedValue([mockUsuario]);
      const result = await service.bulkInactivate(makeAdmin(), ['user-uuid']);
      expect(result.data.count).toBe(1);
    });

    it('should throw NotFoundException for missing IDs', async () => {
      prisma.usuario.findMany.mockResolvedValue([]);
      await expect(service.bulkInactivate(makeAdmin(), ['missing-uuid']))
        .rejects.toThrow(NotFoundException);
    });
  });
});
