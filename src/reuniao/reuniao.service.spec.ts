import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ReuniaoService } from './reuniao.service';
import { PrismaService } from '../prisma/prisma.service';
import { AbilityFactory } from '../common/casl/ability.factory';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface';
import type { CreateReuniaoDto } from './dto/create-reuniao.dto';

function makeAdmin(assessoraMunicipioIds: string[] = ['m-1', 'other-muni']): AuthenticatedUser {
  return {
    id: 'admin-id', authUserId: 'auth-admin', nome: 'Admin', email: 'a@x.com',
    perfil: 'administrador', municipioId: null, escolaIds: [], turmaIds: [],
    assessoraMunicipioIds, ativo: true,
  };
}
function makeSecretaria(municipioId = 'm-1'): AuthenticatedUser {
  return {
    id: 'sec-id', authUserId: 'auth-sec', nome: 'Sec', email: 's@x.com',
    perfil: 'secretaria', municipioId, escolaIds: [], turmaIds: [],
    assessoraMunicipioIds: [], ativo: true,
  };
}
function makeProfessor(): AuthenticatedUser {
  return {
    id: 'prof-id', authUserId: 'auth-prof', nome: 'P', email: 'p@x.com',
    perfil: 'professor', municipioId: 'm-1', escolaIds: [], turmaIds: [],
    assessoraMunicipioIds: [], ativo: true,
  };
}

const mockReuniao = {
  id: 'r-1', municipio_id: 'm-1', tipo: '1:1-professor', inicio: new Date('2026-05-10T13:00:00Z'),
  duracao_min: 30, link: null, observacao: null, aconteceu: false, cancelada: false,
  serie_id: null, recorrencia_regra: null, recorrencia_ate: null, recorrencia_semana_do_mes: null,
  criado_por: 'admin-id', created_at: new Date(), updated_at: new Date(),
  pessoas: [],
};

function createMockPrisma() {
  return {
    reuniao: {
      findMany: jest.fn().mockResolvedValue([mockReuniao]),
      findUnique: jest.fn().mockResolvedValue(mockReuniao),
      create: jest.fn().mockResolvedValue(mockReuniao),
      update: jest.fn().mockResolvedValue(mockReuniao),
      delete: jest.fn().mockResolvedValue(mockReuniao),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(1),
    },
    reuniao_pessoa: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn().mockImplementation((arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: unknown) => unknown)({
          reuniao: {
            create: jest.fn().mockResolvedValue(mockReuniao),
            update: jest.fn().mockResolvedValue(mockReuniao),
            findUnique: jest.fn().mockResolvedValue(mockReuniao),
            findMany: jest.fn().mockResolvedValue([mockReuniao]),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
          reuniao_pessoa: {
            deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
            createMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
        });
      }
      return Promise.all(arg as unknown[]);
    }),
  };
}

describe('ReuniaoService', () => {
  let service: ReuniaoService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReuniaoService,
        { provide: PrismaService, useValue: prisma },
        AbilityFactory,
      ],
    }).compile();
    service = module.get<ReuniaoService>(ReuniaoService);
  });

  describe('findAll', () => {
    it('admin sees results filtered by window', async () => {
      const result = await service.findAll(makeAdmin(), { inicio_de: '2026-01-01T00:00:00Z' });
      expect(result.data).toHaveLength(1);
      expect(prisma.reuniao.findMany).toHaveBeenCalled();
    });

    it('professor with no CASL rules gets empty list (graceful)', async () => {
      const r = await service.findAll(makeProfessor(), {});
      expect(r.data).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('admin can read any reunião', async () => {
      const r = await service.findOne(makeAdmin(), 'r-1');
      expect(r.data.id).toBe('r-1');
    });

    it('throws NotFound when missing', async () => {
      prisma.reuniao.findUnique.mockResolvedValueOnce(null);
      await expect(service.findOne(makeAdmin(), 'missing')).rejects.toThrow(NotFoundException);
    });

    it('secretaria cannot read other municípios reuniões', async () => {
      prisma.reuniao.findUnique.mockResolvedValueOnce({ ...mockReuniao, municipio_id: 'other-muni' });
      await expect(service.findOne(makeSecretaria('m-1'), 'r-1')).rejects.toThrow(ForbiddenException);
    });

    it('professor blocked', async () => {
      await expect(service.findOne(makeProfessor(), 'r-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('create', () => {
    const baseDto: CreateReuniaoDto = {
      municipio_id: 'm-1',
      tipo: '1:1-professor',
      inicio: '2026-05-10T13:00:00Z',
      duracao_min: 30,
      pessoas: [{ nome: 'Joana', perfil: 'professor' }],
    };

    it('admin creates single', async () => {
      const r = await service.create(makeAdmin(), baseDto);
      expect(r.data).toHaveLength(1);
    });

    it('rejects missing inicio when not recorrente', async () => {
      const dto = { ...baseDto, inicio: undefined };
      await expect(service.create(makeAdmin(), dto)).rejects.toThrow(BadRequestException);
    });

    it('secretaria forbidden from create', async () => {
      await expect(service.create(makeSecretaria('m-1'), baseDto)).rejects.toThrow(ForbiddenException);
    });

    it('professor forbidden from create', async () => {
      await expect(service.create(makeProfessor(), baseDto)).rejects.toThrow(ForbiddenException);
    });

    it('series creation expands recurrence', async () => {
      const dto: CreateReuniaoDto = {
        ...baseDto,
        inicio: undefined,
        recorrencia: {
          regra: 'semanal',
          ate: '2026-05-31',
          dias_semana: [1],
          hora_inicio: '09:00',
        },
      };
      const r = await service.create(makeAdmin(), dto);
      expect(Array.isArray(r.data)).toBe(true);
      expect(r.data.length).toBeGreaterThan(0);
    });
  });

  describe('update', () => {
    it('admin updates single', async () => {
      const r = await service.update(makeAdmin(), 'r-1', { aconteceu: true }, 'this');
      expect(r).toBeDefined();
    });

    it('NotFound when missing', async () => {
      prisma.reuniao.findUnique.mockResolvedValueOnce(null);
      await expect(service.update(makeAdmin(), 'missing', {})).rejects.toThrow(NotFoundException);
    });

    it('series update requires serie_id', async () => {
      // existing has no serie_id
      await expect(service.update(makeAdmin(), 'r-1', {}, 'series'))
        .rejects.toThrow(BadRequestException);
    });

    it('professor forbidden from update', async () => {
      await expect(service.update(makeProfessor(), 'r-1', { aconteceu: true })).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('admin deletes single', async () => {
      const r = await service.remove(makeAdmin(), 'r-1', 'this');
      expect(r.data.count).toBe(1);
    });

    it('professor forbidden', async () => {
      await expect(service.remove(makeProfessor(), 'r-1')).rejects.toThrow(ForbiddenException);
    });

    it('admin deletes whole series via deleteMany', async () => {
      prisma.reuniao.findUnique.mockResolvedValueOnce({ ...mockReuniao, serie_id: 'series-1' });
      const r = await service.remove(makeAdmin(), 'r-1', 'series');
      expect(prisma.reuniao.deleteMany).toHaveBeenCalledWith({ where: { serie_id: 'series-1' } });
      expect(r.data.count).toBe(1);
    });
  });
});
