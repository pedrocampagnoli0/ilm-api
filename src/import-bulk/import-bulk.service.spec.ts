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
  return {
    import_batch: {
      findMany: jest.fn().mockResolvedValue([mockBatch]),
      count: jest.fn().mockResolvedValue(1),
    },
    import_batch_log: {
      findMany: jest.fn().mockResolvedValue([{ id: 'l1', row_index: 0, status: 'ok', message: 'imported' }]),
    },
    $transaction: jest.fn().mockImplementation((args: unknown[]) => Promise.all(args)),
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ escola_turma_import: 'b1' }]),
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
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('escola_turma_import'), 'm1', expect.any(String));
    expect(result.data).toBeDefined();
  });

  it('should deny execute for professor', async () => {
    await expect(service.execute(makeProf(), { municipio_id: 'm1', rows: [] })).rejects.toThrow(ForbiddenException);
  });

  it('should undo import for admin', async () => {
    const result = await service.undo(makeAdmin(), 'b1');
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('escola_turma_import_undo'), 'b1');
    expect(result.data).toBeDefined();
  });

  it('should deny undo for professor', async () => {
    await expect(service.undo(makeProf(), 'b1')).rejects.toThrow(ForbiddenException);
  });
});
