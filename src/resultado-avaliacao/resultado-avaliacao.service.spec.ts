import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ResultadoAvaliacaoService } from './resultado-avaliacao.service';
import { PrismaService } from '../prisma/prisma.service';
import { AbilityFactory } from '../common/casl/ability.factory';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface';

function makeAdmin(): AuthenticatedUser {
  return {
    id: 'admin-uuid', authUserId: 'auth-admin', nome: 'Admin', email: 'admin@test.com',
    perfil: 'administrador', municipioId: null, escolaIds: [], turmaIds: [], ativo: true,
  };
}

function makeProfessor(): AuthenticatedUser {
  return {
    id: 'prof-uuid', authUserId: 'auth-prof', nome: 'Prof', email: 'prof@test.com',
    perfil: 'professor', municipioId: 'muni', escolaIds: ['esc'], turmaIds: ['turma-uuid'],
    ativo: true,
  };
}

const mockResultado = {
  id: 'res-uuid', aluno_id: 'aluno-uuid', avaliacao_id: 'av-uuid', turma_id: 'turma-uuid',
  ciclo_id: 'ciclo-uuid', ausente: false, respondido_em: new Date(),
  aluno: { id: 'aluno-uuid', nome: 'Aluno', is_transferido: false },
  turma: { id: 'turma-uuid', nome: 'Turma A', escola_id: 'esc', professora_id: 'prof', ciclo_id: 'ciclo' },
};

function createMockPrisma() {
  // Shared spy so tests can assert on $queryRawUnsafe calls whether they
  // happen on the Prisma client or inside a $transaction(tx => ...) callback.
  const queryRawUnsafe = jest.fn().mockResolvedValue([
    { upsert_resultados_avaliacao_batch: { saved_count: 1 } },
  ]);
  return {
    resultado_avaliacao: {
      findMany: jest.fn().mockResolvedValue([mockResultado]),
      count: jest.fn().mockResolvedValue(1),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    turma: {
      findUnique: jest.fn().mockResolvedValue({ id: 'turma-uuid', escola_id: 'esc' }),
      count: jest.fn().mockResolvedValue(1),
    },
    aluno: {
      count: jest.fn().mockResolvedValue(1),
    },
    $queryRawUnsafe: queryRawUnsafe,
    $transaction: jest.fn().mockImplementation((argOrCallback: unknown) => {
      if (typeof argOrCallback === 'function') {
        const tx = {
          $executeRawUnsafe: jest.fn().mockResolvedValue(1),
          $queryRawUnsafe: queryRawUnsafe,
        };
        return (argOrCallback as (tx: unknown) => Promise<unknown>)(tx);
      }
      return Promise.all(argOrCallback as unknown[]);
    }),
  };
}

describe('ResultadoAvaliacaoService', () => {
  let service: ResultadoAvaliacaoService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResultadoAvaliacaoService,
        { provide: PrismaService, useValue: prisma },
        AbilityFactory,
      ],
    }).compile();
    service = module.get<ResultadoAvaliacaoService>(ResultadoAvaliacaoService);
  });

  describe('findAll', () => {
    it('should return paginated resultados', async () => {
      const result = await service.findAll(makeAdmin(), { page: 1, limit: 20, skip: 0 } as any);
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('should apply avaliacao_id filter', async () => {
      await service.findAll(makeAdmin(), { page: 1, limit: 20, skip: 0, avaliacao_id: 'av-uuid' } as any);
      expect(prisma.resultado_avaliacao.findMany).toHaveBeenCalled();
    });

    it('should apply turma_id + aluno_id filters', async () => {
      await service.findAll(makeAdmin(), { page: 1, limit: 20, skip: 0, turma_id: 't', aluno_id: 'a' } as any);
      expect(prisma.resultado_avaliacao.findMany).toHaveBeenCalled();
    });

    it('should apply avaliacao_ids filter', async () => {
      await service.findAll(makeAdmin(), { page: 1, limit: 20, skip: 0, avaliacao_ids: 'id1,id2' } as any);
      expect(prisma.resultado_avaliacao.findMany).toHaveBeenCalled();
    });
  });

  describe('upsertBatch', () => {
    it('should call the DB function for admin', async () => {
      const dto = {
        avaliacao_id: 'av-uuid',
        turma_id: 'turma-uuid',
        resultados: [{ aluno_id: 'a1', ausente: false }],
      };
      await service.upsertBatch(makeAdmin(), dto);
      expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('upsert_resultados_avaliacao_batch'),
        'av-uuid',
        'turma-uuid',
        expect.any(String),
      );
    });

    it('should allow professor to upsert for their turma', async () => {
      const dto = {
        avaliacao_id: 'av-uuid',
        turma_id: 'turma-uuid',
        resultados: [{ aluno_id: 'a1' }],
      };
      await service.upsertBatch(makeProfessor(), dto);
      expect(prisma.$queryRawUnsafe).toHaveBeenCalled();
    });

    it('should throw ForbiddenException for professor on other turma', async () => {
      const dto = {
        avaliacao_id: 'av-uuid',
        turma_id: 'other-turma',
        resultados: [{ aluno_id: 'a1' }],
      };
      await expect(service.upsertBatch(makeProfessor(), dto)).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for invalid turma', async () => {
      prisma.turma.findUnique.mockResolvedValue(null);
      const dto = { avaliacao_id: 'av', turma_id: 'bad', resultados: [{ aluno_id: 'a' }] };
      await expect(service.upsertBatch(makeAdmin(), dto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getChangeHistory', () => {
    it('should call the DB function', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([
        { id: 'h1', usuario_nome: 'Admin', change_action: 'upsert', changed_at: '2026-01-01', resultado_count: 5 },
      ]);
      const result = await service.getChangeHistory(makeAdmin(), 'turma-uuid', 'av-uuid');
      expect(result.data).toHaveLength(1);
      expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('get_avaliacao_change_history'),
        'turma-uuid',
        'av-uuid',
      );
    });
  });

  describe('deleteBlankForAluno', () => {
    it('should delete blank resultados for admin', async () => {
      const result = await service.deleteBlankForAluno(makeAdmin(), 'aluno-uuid');
      expect(result.data.count).toBe(1);
      expect(prisma.resultado_avaliacao.deleteMany).toHaveBeenCalledWith({
        where: { aluno_id: 'aluno-uuid', respondido_em: null },
      });
    });

    it('should throw NotFoundException when admin targets a non-existent aluno', async () => {
      prisma.aluno.count.mockResolvedValueOnce(0);
      await expect(service.deleteBlankForAluno(makeAdmin(), 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when a professor targets an aluno they cannot delete', async () => {
      prisma.aluno.count.mockResolvedValueOnce(0);
      await expect(service.deleteBlankForAluno(makeProfessor(), 'aluno-uuid')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('deleteForAlunoAvaliacao', () => {
    it('should delete resultados for aluno + avaliacao when admin', async () => {
      const result = await service.deleteForAlunoAvaliacao(makeAdmin(), 'av-uuid', 'aluno-uuid');
      expect(result.data.count).toBe(1);
      expect(prisma.resultado_avaliacao.deleteMany).toHaveBeenCalledWith({
        where: { avaliacao_id: 'av-uuid', aluno_id: 'aluno-uuid' },
      });
    });

    it('should throw ForbiddenException when a professor targets an aluno they cannot delete', async () => {
      prisma.aluno.count.mockResolvedValueOnce(0);
      await expect(
        service.deleteForAlunoAvaliacao(makeProfessor(), 'av-uuid', 'other-aluno'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
