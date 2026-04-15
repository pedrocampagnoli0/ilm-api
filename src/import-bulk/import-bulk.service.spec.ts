import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ImportBulkService } from './import-bulk.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface';

function makeAdmin(): AuthenticatedUser {
  return { id: 'a', authUserId: 'a', nome: 'A', email: 'a@t.com', perfil: 'administrador', municipioId: null, escolaIds: [], turmaIds: [], ativo: true };
}
function makeProf(): AuthenticatedUser {
  return { id: 'p', authUserId: 'p', nome: 'P', email: 'p@t.com', perfil: 'professor', municipioId: 'm', escolaIds: ['e'], turmaIds: ['t'], ativo: true };
}

const mockBatch = { id: 'b1', municipio_id: 'm1', status: 'concluido', total_rows: 10 };

function createMockPrisma() {
  const queryRawUnsafe = jest.fn().mockImplementation((sql: string) => {
    if (sql.includes('escola_turma_import_undo')) {
      return Promise.resolve([{ escola_turma_import_undo: { batch_id: 'b1', undone: true } }]);
    }
    if (sql.includes('escola_turma_import')) {
      return Promise.resolve([{ escola_turma_import: { batch_id: 'b1', escolas_criadas: 1 } }]);
    }
    return Promise.resolve([]);
  });
  return {
    import_batch: {
      findMany: jest.fn().mockResolvedValue([mockBatch]),
      count: jest.fn().mockResolvedValue(1),
    },
    import_batch_log: {
      findMany: jest.fn().mockResolvedValue([{ id: 'l1', row_index: 0, status: 'ok', message: 'imported' }]),
    },
    $executeRawUnsafe: jest.fn().mockResolvedValue(1),
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

describe('ImportBulkService', () => {
  let service: ImportBulkService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ImportBulkService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<ImportBulkService>(ImportBulkService);
  });

  it('should list batches for admin', async () => {
    const result = await service.findAll(makeAdmin(), { page: 1, limit: 20, skip: 0 } as any);
    expect(result.data).toHaveLength(1);
  });

  it('should deny list for professor', async () => {
    await expect(service.findAll(makeProf(), { page: 1, limit: 20, skip: 0 } as any)).rejects.toThrow(ForbiddenException);
  });

  it('should return batch logs', async () => {
    const result = await service.findOneLogs('b1');
    expect(result.data).toHaveLength(1);
  });

  it('should execute import for admin', async () => {
    const result = await service.execute(makeAdmin(), { municipio_id: 'm1', rows: [{ escola: 'E1' }] });
    // rows (jsonb) first, municipio_id (uuid) second — matches DB function signature
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('escola_turma_import('),
      expect.any(String),
      'm1',
    );
    // Result is the unwrapped jsonb returned by the function, not the row array
    expect(result.data).toEqual({ batch_id: 'b1', escolas_criadas: 1 });
  });

  it('should deny execute for professor', async () => {
    await expect(service.execute(makeProf(), { municipio_id: 'm1', rows: [] })).rejects.toThrow(ForbiddenException);
  });

  it('should undo import for admin', async () => {
    const result = await service.undo(makeAdmin(), 'b1');
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('escola_turma_import_undo'), 'b1');
    expect(result.data).toEqual({ batch_id: 'b1', undone: true });
  });

  it('should deny undo for professor', async () => {
    await expect(service.undo(makeProf(), 'b1')).rejects.toThrow(ForbiddenException);
  });
});
