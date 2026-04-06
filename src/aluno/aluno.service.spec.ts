import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AlunoService } from './aluno.service';
import { PrismaService } from '../prisma/prisma.service';
import { AbilityFactory } from '../common/casl/ability.factory';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface';
import type { ListAlunosQueryDto } from './dto/list-alunos-query.dto';

function makeAdmin(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'admin-uuid', authUserId: 'auth-admin', nome: 'Admin', email: 'admin@test.com',
    perfil: 'administrador', municipioId: null, escolaIds: [], turmaIds: [], ativo: true,
    ...overrides,
  };
}

function makeProfessor(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'prof-uuid', authUserId: 'auth-prof', nome: 'Prof', email: 'prof@test.com',
    perfil: 'professor', municipioId: 'muni-uuid', escolaIds: ['escola-uuid'], turmaIds: ['turma-uuid'],
    ativo: true, ...overrides,
  };
}

const mockAluno = {
  id: 'aluno-uuid', nome: 'Test Aluno', turma_id: 'turma-uuid', escola_id: 'escola-uuid',
  municipio_id: 'muni-uuid', is_inclusao: false, is_transferido: false, transferido_em: null,
  created_at: new Date(), updated_at: new Date(),
};

const mockAlunoWithIncludes = {
  ...mockAluno,
  turma: { id: 'turma-uuid', nome: 'Turma A' },
  escola: { id: 'escola-uuid', nome: 'Escola X' },
  municipio: { id: 'muni-uuid', nome: 'Municipio Y' },
};

function createMockPrisma() {
  return {
    aluno: {
      findMany: jest.fn().mockResolvedValue([mockAlunoWithIncludes]),
      findUnique: jest.fn().mockResolvedValue(mockAlunoWithIncludes),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(mockAlunoWithIncludes),
      createMany: jest.fn().mockResolvedValue({ count: 5 }),
      update: jest.fn().mockResolvedValue(mockAlunoWithIncludes),
      delete: jest.fn().mockResolvedValue(mockAluno),
      deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      count: jest.fn().mockResolvedValue(1),
    },
    turma: {
      findUnique: jest.fn().mockResolvedValue({ escola_id: 'escola-uuid' }),
    },
    $transaction: jest.fn().mockImplementation((args: unknown[]) => Promise.all(args)),
  };
}

describe('AlunoService', () => {
  let service: AlunoService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlunoService,
        { provide: PrismaService, useValue: prisma },
        AbilityFactory,
      ],
    }).compile();
    service = module.get<AlunoService>(AlunoService);
  });

  describe('findAll', () => {
    it('should return paginated alunos for admin', async () => {
      const query = { page: 1, limit: 20, skip: 0 } as ListAlunosQueryDto;
      const result = await service.findAll(makeAdmin(), query);
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('should apply turma_id filter', async () => {
      const query = { page: 1, limit: 20, skip: 0, turma_id: 'turma-uuid' } as ListAlunosQueryDto;
      await service.findAll(makeAdmin(), query);
      expect(prisma.aluno.findMany).toHaveBeenCalled();
    });

    it('should apply is_transferido filter', async () => {
      const query = { page: 1, limit: 20, skip: 0, is_transferido: false } as ListAlunosQueryDto;
      await service.findAll(makeAdmin(), query);
      expect(prisma.aluno.findMany).toHaveBeenCalled();
    });

    it('should apply turma_ids filter', async () => {
      const query = { page: 1, limit: 20, skip: 0, turma_ids: 'id1,id2' } as ListAlunosQueryDto;
      await service.findAll(makeAdmin(), query);
      expect(prisma.aluno.findMany).toHaveBeenCalled();
    });

    it('should apply search filter', async () => {
      const query = { page: 1, limit: 20, skip: 0, search: 'João' } as ListAlunosQueryDto;
      await service.findAll(makeAdmin(), query);
      expect(prisma.aluno.findMany).toHaveBeenCalled();
    });
  });

  describe('count', () => {
    it('should return count with filters', async () => {
      const query = { page: 1, limit: 20, skip: 0, is_transferido: false } as ListAlunosQueryDto;
      const result = await service.count(makeAdmin(), query);
      expect(result.data.count).toBe(1);
    });
  });

  describe('findOne', () => {
    it('should return an aluno by ID', async () => {
      const result = await service.findOne(makeAdmin(), 'aluno-uuid');
      expect(result.data.id).toBe('aluno-uuid');
    });

    it('should throw NotFoundException', async () => {
      prisma.aluno.findUnique.mockResolvedValue(null);
      await expect(service.findOne(makeAdmin(), 'missing')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for professor reading other turma', async () => {
      const other = { ...mockAlunoWithIncludes, turma_id: 'other-turma', escola_id: 'other-escola' };
      prisma.aluno.findUnique.mockResolvedValue(other);
      await expect(service.findOne(makeProfessor(), 'aluno-uuid')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('create', () => {
    it('should create an aluno', async () => {
      const dto = { nome: 'New Aluno', turma_id: 'turma-uuid', municipio_id: 'muni-uuid' };
      const result = await service.create(makeAdmin(), dto);
      expect(result.data).toBeDefined();
      expect(prisma.aluno.create).toHaveBeenCalled();
    });

    it('should throw NotFoundException for invalid turma', async () => {
      prisma.turma.findUnique.mockResolvedValue(null);
      const dto = { nome: 'New', turma_id: 'bad-turma', municipio_id: 'muni-uuid' };
      await expect(service.create(makeAdmin(), dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for professor creating in other turma', async () => {
      const dto = { nome: 'New', turma_id: 'other-turma', municipio_id: 'muni-uuid' };
      prisma.turma.findUnique.mockResolvedValue({ escola_id: 'other-escola' });
      await expect(service.create(makeProfessor(), dto)).rejects.toThrow(ForbiddenException);
    });

    it('should normalize nome', async () => {
      const dto = { nome: '  João   Silva  ', turma_id: 'turma-uuid', municipio_id: 'muni-uuid' };
      await service.create(makeAdmin(), dto);
      const call = prisma.aluno.create.mock.calls[0][0];
      expect(call.data.nome).toBe('João Silva');
    });
  });

  describe('update', () => {
    it('should update an aluno', async () => {
      const result = await service.update(makeAdmin(), 'aluno-uuid', { nome: 'Updated' });
      expect(result.data).toBeDefined();
    });

    it('should set transferido_em when marking as transferred', async () => {
      await service.update(makeAdmin(), 'aluno-uuid', { is_transferido: true });
      const call = prisma.aluno.update.mock.calls[0][0];
      expect(call.data.is_transferido).toBe(true);
      expect(call.data.transferido_em).toBeInstanceOf(Date);
    });

    it('should clear transferido_em when unmarking transfer', async () => {
      await service.update(makeAdmin(), 'aluno-uuid', { is_transferido: false });
      const call = prisma.aluno.update.mock.calls[0][0];
      expect(call.data.is_transferido).toBe(false);
      expect(call.data.transferido_em).toBeNull();
    });

    it('should throw NotFoundException', async () => {
      prisma.aluno.findUnique.mockResolvedValue(null);
      await expect(service.update(makeAdmin(), 'missing', { nome: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('should delete an aluno', async () => {
      const result = await service.delete(makeAdmin(), 'aluno-uuid');
      expect(result.data.id).toBe('aluno-uuid');
    });

    it('should throw NotFoundException', async () => {
      prisma.aluno.findUnique.mockResolvedValue(null);
      await expect(service.delete(makeAdmin(), 'missing')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for professor deleting other turma', async () => {
      const other = { ...mockAluno, turma_id: 'other-turma', escola_id: 'other-escola' };
      prisma.aluno.findUnique.mockResolvedValue(other);
      await expect(service.delete(makeProfessor(), 'aluno-uuid')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('bulkDelete', () => {
    it('should delete multiple alunos', async () => {
      prisma.aluno.findMany.mockResolvedValue([mockAluno, { ...mockAluno, id: 'aluno-2' }]);
      const result = await service.bulkDelete(makeAdmin(), ['aluno-uuid', 'aluno-2']);
      expect(result.data.count).toBe(2);
    });

    it('should throw NotFoundException for missing IDs', async () => {
      prisma.aluno.findMany.mockResolvedValue([]);
      await expect(service.bulkDelete(makeAdmin(), ['missing'])).rejects.toThrow(NotFoundException);
    });
  });

  describe('import', () => {
    it('should import alunos skipping duplicates', async () => {
      prisma.aluno.findMany.mockResolvedValue([{ nome: 'Existing' }]);
      const dto = {
        rows: [{ nome: 'New Student' }, { nome: 'Existing' }, { nome: '' }],
        municipio_id: 'muni-uuid', escola_id: 'escola-uuid', turma_id: 'turma-uuid',
      };
      const result = await service.import(makeAdmin(), dto);
      expect(result.data.total_importados).toBe(1);
      expect(result.data.total_ignorados).toBe(2);
    });

    it('should throw NotFoundException for invalid turma', async () => {
      prisma.turma.findUnique.mockResolvedValue(null);
      const dto = { rows: [{ nome: 'X' }], municipio_id: 'muni', escola_id: 'esc', turma_id: 'bad' };
      await expect(service.import(makeAdmin(), dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for professor importing to other turma', async () => {
      prisma.turma.findUnique.mockResolvedValue({ escola_id: 'other-escola' });
      prisma.aluno.findMany.mockResolvedValue([]);
      const dto = { rows: [{ nome: 'X' }], municipio_id: 'muni', escola_id: 'esc', turma_id: 'other-turma' };
      await expect(service.import(makeProfessor(), dto)).rejects.toThrow(ForbiddenException);
    });
  });
});
