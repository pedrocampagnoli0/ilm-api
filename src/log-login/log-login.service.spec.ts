import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { LogLoginService } from './log-login.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface';

function makeAdmin(): AuthenticatedUser {
  return { id: 'a', authUserId: 'a', nome: 'A', email: 'a@t.com', perfil: 'administrador', municipioId: null, escolaIds: [], turmaIds: [], ativo: true };
}
function makeProf(): AuthenticatedUser {
  return { id: 'p', authUserId: 'p', nome: 'P', email: 'p@t.com', perfil: 'professor', municipioId: 'm', escolaIds: ['e'], turmaIds: ['t'], ativo: true };
}

const mockLog = { id: 'log1', email: 'x@y.com', resultado: 'sucesso', criado_em: new Date() };

function createMockPrisma() {
  return {
    log_tentativa_login: {
      findMany: jest.fn().mockResolvedValue([mockLog]),
      create: jest.fn().mockResolvedValue(mockLog),
      count: jest.fn().mockResolvedValue(1),
    },
    usuario: { findMany: jest.fn().mockResolvedValue([{ email: 'x@y.com' }]) },
    $transaction: jest.fn().mockImplementation((args: unknown[]) => Promise.all(args)),
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ dia: '2026-04-01', total: 5, sucesso: 3, falha: 2 }]),
  };
}

describe('LogLoginService', () => {
  let service: LogLoginService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [LogLoginService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<LogLoginService>(LogLoginService);
  });

  it('should list logs for admin', async () => {
    const result = await service.findAll(makeAdmin(), { page: 1, limit: 20, skip: 0 } as any);
    expect(result.data).toHaveLength(1);
  });

  it('should deny list for professor', async () => {
    await expect(service.findAll(makeProf(), { page: 1, limit: 20, skip: 0 } as any)).rejects.toThrow(ForbiddenException);
  });

  it('should apply email filter', async () => {
    await service.findAll(makeAdmin(), { page: 1, limit: 20, skip: 0, email: 'test' } as any);
    expect(prisma.log_tentativa_login.findMany).toHaveBeenCalled();
  });

  it('should resolve municipio_id via usuario emails', async () => {
    await service.findAll(makeAdmin(), { page: 1, limit: 20, skip: 0, municipio_id: 'muni' } as any);
    expect(prisma.usuario.findMany).toHaveBeenCalled();
  });

  it('should return stats', async () => {
    const result = await service.stats(makeAdmin(), { page: 1, limit: 20, skip: 0 } as any);
    expect(result.data.total).toBe(1);
    expect(result.data.byDay).toHaveLength(1);
  });

  it('should create log', async () => {
    const result = await service.create({ email: 'x@y.com', resultado: 'sucesso' });
    expect(result.data).toBeDefined();
    expect(prisma.log_tentativa_login.create).toHaveBeenCalled();
  });
});
