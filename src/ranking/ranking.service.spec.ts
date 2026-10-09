import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { RankingService } from './ranking.service';
import { PrismaService } from '../prisma/prisma.service';
import { AbilityFactory } from '../common/casl/ability.factory';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface';

function makeAdmin(): AuthenticatedUser {
  return { id: 'a', authUserId: 'a', nome: 'A', email: 'a@t.com', perfil: 'administrador', municipioId: null, escolaIds: [], turmaIds: [], assessoraMunicipioIds: [], ativo: true };
}
function makeProf(): AuthenticatedUser {
  return { id: 'p', authUserId: 'p', nome: 'P', email: 'p@t.com', perfil: 'professor', municipioId: 'm', escolaIds: ['e'], turmaIds: ['t'], assessoraMunicipioIds: [], ativo: true };
}

const mockRankingProf = { id: 'r1', professor_id: 'p1', pontuacao_total_avg: 85 };
const mockRankingEscola = { id: 'r2', escola_id: 'e1', pontuacao_total_avg: 90 };

function createMockPrisma() {
  return {
    avaliacao: {
      findMany: jest.fn().mockResolvedValue([
        { tipo_id: 't1', data_inicio: new Date('2026-05-01'), tipo_avaliacao: { nome: 'Avaliação 1' } },
        { tipo_id: 't1', data_inicio: new Date('2026-03-01'), tipo_avaliacao: { nome: 'Avaliação 1' } },
        { tipo_id: 't2', data_inicio: new Date('2026-08-01'), tipo_avaliacao: { nome: 'Avaliação 2' } },
      ]),
    },
    ranking_professor_diario: {
      groupBy: jest.fn().mockResolvedValue([
        { tipo_avaliacao_id: 't1', _max: { data_referencia: new Date('2026-06-10') } },
      ]),
      findMany: jest.fn().mockResolvedValue([mockRankingProf]),
      count: jest.fn().mockResolvedValue(1),
      deleteMany: jest.fn().mockResolvedValue({ count: 5 }),
    },
    ranking_escola_diario: {
      findMany: jest.fn().mockResolvedValue([mockRankingEscola]),
      count: jest.fn().mockResolvedValue(1),
      deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
    },
    $transaction: jest.fn().mockImplementation((args: unknown[]) => Promise.all(args)),
  };
}

describe('RankingService', () => {
  let service: RankingService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [RankingService, { provide: PrismaService, useValue: prisma }, AbilityFactory],
    }).compile();
    service = module.get<RankingService>(RankingService);
  });

  it('should list professor rankings', async () => {
    const result = await service.findProfessores(makeAdmin(), { page: 1, limit: 20, skip: 0 } as any);
    expect(result.data).toHaveLength(1);
  });

  it('should list escola rankings', async () => {
    const result = await service.findEscolas(makeAdmin(), { page: 1, limit: 20, skip: 0 } as any);
    expect(result.data).toHaveLength(1);
  });

  it('should apply filters', async () => {
    await service.findProfessores(makeAdmin(), { page: 1, limit: 20, skip: 0, municipio_id: 'm', ciclo_id: 'c' } as any);
    expect(prisma.ranking_professor_diario.findMany).toHaveBeenCalled();
  });

  it('should delete rankings for municipio (admin)', async () => {
    const result = await service.deleteForMunicipio(makeAdmin(), 'muni-uuid');
    expect(result.data.professores).toBe(5);
    expect(result.data.escolas).toBe(3);
  });

  it('should deny delete for professor', async () => {
    await expect(service.deleteForMunicipio(makeProf(), 'muni-uuid')).rejects.toThrow(ForbiddenException);
  });

  it('should return last updates', async () => {
    prisma.ranking_professor_diario.findMany.mockResolvedValue([
      { municipio_id: 'm1', updated_at: new Date('2026-04-01') },
    ]);
    const result = await service.getLastUpdates();
    expect(result.data.m1).toBeDefined();
  });

  describe('findProfessoresPorAvaliacao', () => {
    const q = { municipio_id: 'm', ciclo_id: 'c', ano: 2026 };

    it('agrupa por tipo (menor data_inicio) e busca só o snapshot mais recente >= data_inicio', async () => {
      prisma.ranking_professor_diario.findMany.mockResolvedValue([
        { tipo_avaliacao_id: 't1', professor_id: 'p', escola_id: 'e', professor: { nome: 'Ana' }, escola: { nome: 'Esc' } },
      ]);
      const r = await service.findProfessoresPorAvaliacao(q);
      expect(r.avaliacoes).toEqual([
        { id: 't1', nome: 'Avaliação 1', data_inicio: '2026-03-01' },
        { id: 't2', nome: 'Avaliação 2', data_inicio: '2026-08-01' },
      ]);
      const gb = prisma.ranking_professor_diario.groupBy.mock.calls[0][0];
      expect(gb.where.OR).toEqual([
        { tipo_avaliacao_id: 't1', data_referencia: { gte: new Date('2026-03-01') } },
        { tipo_avaliacao_id: 't2', data_referencia: { gte: new Date('2026-08-01') } },
      ]);
      const fm = prisma.ranking_professor_diario.findMany.mock.calls[0][0];
      expect(fm.where.OR).toEqual([{ tipo_avaliacao_id: 't1', data_referencia: new Date('2026-06-10') }]);
      expect(r.rows[0]).toMatchObject({ professor_nome: 'Ana', escola_nome: 'Esc' });
    });

    it('retorna vazio sem avaliações no ano', async () => {
      prisma.avaliacao.findMany.mockResolvedValue([]);
      expect(await service.findProfessoresPorAvaliacao(q)).toEqual({ avaliacoes: [], rows: [] });
    });

    it('aplica escola_id só nas linhas', async () => {
      prisma.ranking_professor_diario.findMany.mockResolvedValue([]);
      await service.findProfessoresPorAvaliacao({ ...q, escola_id: 'e' });
      expect(prisma.ranking_professor_diario.groupBy.mock.calls[0][0].where.escola_id).toBeUndefined();
      expect(prisma.ranking_professor_diario.findMany.mock.calls[0][0].where.escola_id).toBe('e');
    });
  });
});
