import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AvaliacaoService } from './avaliacao.service';
import { PrismaService } from '../prisma/prisma.service';
import { AbilityFactory } from '../common/casl/ability.factory';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface';

function makeAdmin(): AuthenticatedUser {
  return {
    id: 'admin-uuid', authUserId: 'auth-admin', nome: 'Admin', email: 'admin@test.com',
    perfil: 'administrador', municipioId: null, escolaIds: [], turmaIds: [], assessoraMunicipioIds: [], ativo: true,
  };
}

function makeProfessor(): AuthenticatedUser {
  return {
    id: 'prof-uuid', authUserId: 'auth-prof', nome: 'Prof', email: 'prof@test.com',
    perfil: 'professor', municipioId: 'muni', escolaIds: ['esc'], turmaIds: ['tur'], assessoraMunicipioIds: [], ativo: true,
  };
}

const mockAvaliacao = {
  id: 'av-uuid', municipio_id: 'muni', tipo_id: 'tipo', data_inicio: new Date(), data_termino: new Date(),
  ativo: true, created_at: new Date(), updated_at: new Date(),
  municipio: { id: 'muni', nome: 'Test', uf_sigla: 'SP', ativo: true },
  tipo_avaliacao: { id: 'tipo', nome: 'Avaliação 1' },
};

function createMockPrisma() {
  return {
    avaliacao: {
      findMany: jest.fn().mockResolvedValue([mockAvaliacao]),
      findUnique: jest.fn().mockResolvedValue(mockAvaliacao),
      // Nenhuma outra avaliação ativa no município — o caminho feliz de
      // `assertNenhumaOutraAtiva`. Testes de conflito sobrescrevem este mock.
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(mockAvaliacao),
      update: jest.fn().mockResolvedValue(mockAvaliacao),
      delete: jest.fn().mockResolvedValue(mockAvaliacao),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(1),
    },
    resultado_avaliacao: {
      deleteMany: jest.fn().mockResolvedValue({ count: 5 }),
    },
    tipo_avaliacao: {
      findMany: jest.fn().mockResolvedValue([{ id: 'tipo', nome: 'Avaliação 1' }]),
    },
    $transaction: jest.fn().mockImplementation((args: unknown[]) => Promise.all(args)),
  };
}

describe('AvaliacaoService', () => {
  let service: AvaliacaoService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvaliacaoService,
        { provide: PrismaService, useValue: prisma },
        AbilityFactory,
      ],
    }).compile();
    service = module.get<AvaliacaoService>(AvaliacaoService);
  });

  it('should list avaliacoes', async () => {
    const result = await service.findAll(makeAdmin(), { page: 1, limit: 20, skip: 0 } as any);
    expect(result.data).toHaveLength(1);
  });

  it('should find one avaliacao (admin)', async () => {
    const result = await service.findOne(makeAdmin(), 'av-uuid');
    expect(result.data.id).toBe('av-uuid');
  });

  it('should throw NotFoundException', async () => {
    prisma.avaliacao.findUnique.mockResolvedValue(null);
    await expect(service.findOne(makeAdmin(), 'missing')).rejects.toThrow(NotFoundException);
  });

  it('should deny findOne when professor is in a different municipio (F-10)', async () => {
    // mockAvaliacao.municipio.id === 'muni'; this professor has municipioId === 'other'
    const professorOtherMuni: AuthenticatedUser = {
      id: 'prof2-uuid', authUserId: 'auth-prof2', nome: 'Prof2', email: 'prof2@test.com',
      perfil: 'professor', municipioId: 'other', escolaIds: [], turmaIds: [], assessoraMunicipioIds: [], ativo: true,
    };
    await expect(service.findOne(professorOtherMuni, 'av-uuid')).rejects.toThrow(ForbiddenException);
  });

  it('should deny findAll when professor supplies a different municipio_id (F-09)', async () => {
    const professorOtherMuni: AuthenticatedUser = {
      id: 'prof3-uuid', authUserId: 'auth-prof3', nome: 'Prof3', email: 'prof3@test.com',
      perfil: 'professor', municipioId: 'mine', escolaIds: [], turmaIds: [], assessoraMunicipioIds: [], ativo: true,
    };
    await expect(
      service.findAll(professorOtherMuni, { page: 1, limit: 20, skip: 0, municipio_id: 'other' } as any),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should create avaliacao for admin', async () => {
    const dto = { municipio_id: 'muni', tipo_id: 'tipo', data_inicio: '2026-03-01', data_termino: '2026-03-31' };
    const result = await service.create(makeAdmin(), dto);
    expect(result.data).toBeDefined();
  });

  it('should deny create for professor', async () => {
    const dto = { municipio_id: 'muni', tipo_id: 'tipo' };
    await expect(service.create(makeProfessor(), dto)).rejects.toThrow(ForbiddenException);
  });

  it('should reject create when the município already has an open avaliação', async () => {
    prisma.avaliacao.findFirst.mockResolvedValue({
      id: 'outra-uuid',
      tipo_avaliacao: { nome: 'Avaliação 1' },
    });
    const dto = { municipio_id: 'muni', tipo_id: 'tipo', ativo: true };
    await expect(service.create(makeAdmin(), dto)).rejects.toThrow(ConflictException);
  });

  it('should allow create when the new avaliação comes in closed', async () => {
    prisma.avaliacao.findFirst.mockResolvedValue({
      id: 'outra-uuid',
      tipo_avaliacao: { nome: 'Avaliação 1' },
    });
    const dto = { municipio_id: 'muni', tipo_id: 'tipo', ativo: false };
    const result = await service.create(makeAdmin(), dto);
    expect(result.data).toBeDefined();
  });

  it('should update avaliacao', async () => {
    const result = await service.update(makeAdmin(), 'av-uuid', { ativo: false });
    expect(result.data).toBeDefined();
  });

  it('should reject reopening an avaliação while another is open in the município', async () => {
    // A avaliação editada está fechada; outra do mesmo município está aberta.
    prisma.avaliacao.findUnique.mockResolvedValue({ ...mockAvaliacao, ativo: false });
    prisma.avaliacao.findFirst.mockResolvedValue({
      id: 'outra-uuid',
      tipo_avaliacao: { nome: 'Avaliação 2' },
    });
    await expect(
      service.update(makeAdmin(), 'av-uuid', { ativo: true }),
    ).rejects.toThrow(ConflictException);
  });

  it('should allow saving an avaliação that was already open (legacy rows stay editable)', async () => {
    prisma.avaliacao.findUnique.mockResolvedValue({ ...mockAvaliacao, ativo: true });
    prisma.avaliacao.findFirst.mockResolvedValue({
      id: 'outra-uuid',
      tipo_avaliacao: { nome: 'Avaliação 2' },
    });
    const result = await service.update(makeAdmin(), 'av-uuid', {
      ativo: true,
      data_termino: '2026-04-30',
    });
    expect(result.data).toBeDefined();
  });

  it('should delete avaliacao with cascade', async () => {
    const result = await service.delete(makeAdmin(), 'av-uuid');
    expect(result.data.id).toBe('av-uuid');
  });

  it('should bulk delete', async () => {
    const result = await service.bulkDelete(makeAdmin(), ['av-uuid']);
    expect(result.data.count).toBe(1);
  });

  it('should list tipos', async () => {
    const result = await service.listTipos();
    expect(result.data).toHaveLength(1);
  });
});
