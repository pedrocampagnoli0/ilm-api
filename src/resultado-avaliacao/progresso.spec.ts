import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ResultadoAvaliacaoService } from './resultado-avaliacao.service';
import { PrismaService } from '../prisma/prisma.service';
import { AbilityFactory } from '../common/casl/ability.factory';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface';
import {
  PONTOS_POR_ALUNO,
  PROGRESSO_POR_TURMA_SQL,
  escolherAvaliacaoAtual,
  mapProgressoTurma,
  pctProgresso,
  type AvaliacaoDoMunicipio,
} from './progresso';

const usuario = (
  extra: Partial<AuthenticatedUser> = {},
): AuthenticatedUser => ({
  id: 'u',
  authUserId: 'au',
  nome: 'U',
  email: 'u@test.com',
  perfil: 'administrador',
  municipioId: null,
  escolaIds: [],
  turmaIds: [],
  assessoraMunicipioIds: [],
  ativo: true,
  ...extra,
});

/** Linha como o Postgres devolve: contagens em bigint. */
const linha = (
  avaliacao_id: string,
  turma_id: string,
  considerados: number,
  pontos: number,
  extra = {},
) => ({
  avaliacao_id,
  turma_id,
  avaliaveis: BigInt(considerados),
  ausentes: 0n,
  transferidos_contabilizados: 0n,
  considerados: BigInt(considerados),
  enviados: BigInt(considerados),
  completos: BigInt(Math.floor(pontos / PONTOS_POR_ALUNO)),
  pontos: BigInt(pontos),
  ...extra,
});

/** `where` da primeira chamada do mock, tipado o bastante para inspecionar. */
const whereDaConsulta = (mock: jest.Mock) =>
  (mock.mock.calls[0] as [{ where: { AND: unknown[] } }])[0].where;

describe('pctProgresso', () => {
  it('arredonda para baixo: um campo em branco nunca vira 100%', () => {
    const max = 3000 * PONTOS_POR_ALUNO;
    expect(pctProgresso(max - 20, max)).toBe(99.9);
    expect(pctProgresso(max, max)).toBe(100);
  });

  it('uma coluna de sete vale 14,2%, não 100%', () => {
    expect(pctProgresso(23 * 20, 23 * PONTOS_POR_ALUNO)).toBe(14.2);
  });

  it('devolve null sem base e nunca sai de 0–100', () => {
    expect(pctProgresso(0, 0)).toBeNull();
    expect(pctProgresso(0, 140)).toBe(0);
    expect(pctProgresso(999, 140)).toBe(100);
    expect(pctProgresso(-1, 140)).toBe(0);
  });
});

describe('PROGRESSO_POR_TURMA_SQL', () => {
  // Os pesos precisam fechar 140 por aluno completo em qualquer ciclo; a lista
  // de campos espelha `camposObrigatorios` do frontend.
  it.each([
    ['ed_infantil', 20, 7],
    ['fundamental_1', 28, 5],
    ['fundamental_2', 35, 4],
  ])('%s: peso %i × %i campos = 140', (prefixo, peso, campos) => {
    const trecho = PROGRESSO_POR_TURMA_SQL.split(
      `${peso} * num_nonnulls(`,
    )[1].split(')')[0];
    const lista = trecho.split(',').map((c) => c.trim());
    expect(lista).toHaveLength(campos);
    expect(peso * campos).toBe(PONTOS_POR_ALUNO);
    const coluna =
      prefixo === 'ed_infantil'
        ? 'r.ei2_'
        : prefixo === 'fundamental_1'
          ? 'r.f1_'
          : 'r.f2_';
    expect(lista.every((c) => c.startsWith(coluna))).toBe(true);
  });

  it('não conta colunas fora da base de cálculo', () => {
    for (const coluna of [
      'f1_escreve_nome',
      'f2_consciencia_fonemica',
      'ppm',
    ]) {
      expect(PROGRESSO_POR_TURMA_SQL).not.toContain(coluna);
    }
  });
});

describe('mapProgressoTurma', () => {
  it('converte bigint e fecha o denominador em pontos', () => {
    expect(mapProgressoTurma(linha('av', 't', 23, 460))).toEqual({
      avaliacao_id: 'av',
      turma_id: 't',
      avaliaveis: 23,
      ausentes: 0,
      transferidos_contabilizados: 0,
      considerados: 23,
      enviados: 23,
      completos: 3,
      pontos: 460,
      pontos_max: 23 * PONTOS_POR_ALUNO,
    });
  });
});

describe('escolherAvaliacaoAtual', () => {
  const hoje = new Date('2026-11-16T15:00:00Z');
  const av = (
    id: string,
    extra: Partial<AvaliacaoDoMunicipio>,
  ): AvaliacaoDoMunicipio => ({
    id,
    municipio_id: 'm',
    ativo: false,
    data_inicio: new Date('2026-04-01'),
    data_termino: new Date('2026-06-15'),
    created_at: new Date('2026-03-20T00:00:00Z'),
    tipo_nome: 'Avaliação 1',
    ...extra,
  });

  it('prefere a aberta à fechada mais recente', () => {
    const aberta = av('aberta', {
      ativo: true,
      data_inicio: new Date('2026-02-01'),
    });
    const fechada = av('fechada', {
      tipo_nome: 'Avaliação 3',
      data_inicio: new Date('2026-10-01'),
    });
    expect(escolherAvaliacaoAtual([fechada, aberta], hoje)?.id).toBe('aberta');
  });

  it('entre abertas, a que ainda não venceu vem antes; depois a mais recente', () => {
    const vencida = av('vencida', {
      ativo: true,
      data_inicio: new Date('2026-10-20'),
      data_termino: new Date('2026-10-31'),
    });
    const vigente = av('vigente', {
      ativo: true,
      data_inicio: new Date('2026-08-01'),
      data_termino: new Date('2026-11-16'),
    });
    const semPrazo = av('sem-prazo', {
      ativo: true,
      data_inicio: new Date('2026-09-01'),
      data_termino: null,
    });
    expect(escolherAvaliacaoAtual([vencida, vigente], hoje)?.id).toBe(
      'vigente',
    );
    expect(escolherAvaliacaoAtual([vencida, vigente, semPrazo], hoje)?.id).toBe(
      'sem-prazo',
    );
  });

  it('sem aberta, usa a fechada de tipo "maior" e, no empate, a mais recente', () => {
    const a1 = av('a1', {
      tipo_nome: 'Avaliação 1',
      data_inicio: new Date('2026-09-01'),
    });
    const a2 = av('a2', {
      tipo_nome: 'Avaliação 2',
      data_inicio: new Date('2026-05-01'),
    });
    const a2b = av('a2b', {
      tipo_nome: 'Avaliação 2',
      data_inicio: new Date('2026-06-01'),
    });
    const semTipo = av('sem-tipo', {
      tipo_nome: null,
      data_inicio: new Date('2026-12-01'),
    });
    expect(escolherAvaliacaoAtual([a1, a2, semTipo], hoje)?.id).toBe('a2');
    expect(escolherAvaliacaoAtual([a1, a2, a2b], hoje)?.id).toBe('a2b');
  });

  it('devolve null sem avaliações', () => {
    expect(escolherAvaliacaoAtual([], hoje)).toBeNull();
  });
});

describe('ResultadoAvaliacaoService — progresso', () => {
  let service: ResultadoAvaliacaoService;
  let prisma: {
    turma: { findMany: jest.Mock };
    avaliacao: { findMany: jest.Mock };
    $queryRawUnsafe: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      turma: { findMany: jest.fn().mockResolvedValue([]) },
      avaliacao: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResultadoAvaliacaoService,
        { provide: PrismaService, useValue: prisma },
        AbilityFactory,
      ],
    }).compile();
    service = module.get(ResultadoAvaliacaoService);
  });

  describe('progressoPorTurma', () => {
    it('admin: não consulta turmas e pede só as ativas (turmas = null)', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([linha('av', 't1', 23, 460)]);
      const { data } = await service.progressoPorTurma(usuario(), ['av', 'av']);
      expect(prisma.turma.findMany).not.toHaveBeenCalled();
      expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
        PROGRESSO_POR_TURMA_SQL,
        ['av'],
        null,
      );
      expect(data).toEqual([
        expect.objectContaining({
          turma_id: 't1',
          considerados: 23,
          pontos: 460,
          pontos_max: 3220,
        }),
      ]);
    });

    it('admin com turma_ids: repassa as turmas pedidas, sem repetição', async () => {
      await service.progressoPorTurma(usuario(), ['av'], ['t1', 't2', 't1']);
      expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
        PROGRESSO_POR_TURMA_SQL,
        ['av'],
        ['t1', 't2'],
      );
    });

    it('sem avaliações não toca no banco', async () => {
      expect(await service.progressoPorTurma(usuario(), [])).toEqual({
        data: [],
      });
      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it('professor: só as turmas que o CASL libera, mesmo pedindo outras', async () => {
      prisma.turma.findMany.mockResolvedValue([{ id: 'minha' }]);
      const professor = usuario({ perfil: 'professor', turmaIds: ['minha'] });
      await service.progressoPorTurma(professor, ['av'], ['minha', 'de-outro']);

      const where = whereDaConsulta(prisma.turma.findMany);
      expect(JSON.stringify(where.AND[0])).toContain('minha');
      expect(where.AND[1]).toEqual({ id: { in: ['minha', 'de-outro'] } });
      expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
        PROGRESSO_POR_TURMA_SQL,
        ['av'],
        ['minha'],
      );
    });

    it('secretaria sem turma_ids: restringe às turmas ativas de escolas ativas do seu escopo', async () => {
      prisma.turma.findMany.mockResolvedValue([{ id: 't1' }, { id: 't2' }]);
      const secretaria = usuario({ perfil: 'secretaria', escolaIds: ['e1'] });
      await service.progressoPorTurma(secretaria, ['av']);

      const where = whereDaConsulta(prisma.turma.findMany);
      expect(JSON.stringify(where.AND[0])).toContain('e1');
      expect(where.AND[1]).toEqual({ ativo: true, escola: { ativo: true } });
      expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
        PROGRESSO_POR_TURMA_SQL,
        ['av'],
        ['t1', 't2'],
      );
    });

    it('quem não enxerga nenhuma das turmas recebe vazio, sem rodar o SQL', async () => {
      const professor = usuario({ perfil: 'professor', turmaIds: ['minha'] });
      expect(
        await service.progressoPorTurma(professor, ['av'], ['de-outro']),
      ).toEqual({ data: [] });
      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it('perfil sem regra de leitura de turma é barrado', async () => {
      await expect(
        service.progressoPorTurma(usuario({ perfil: 'visitante' }), ['av']),
      ).rejects.toThrow();
      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });
  });

  describe('progressoMunicipios', () => {
    const avaliacaoDb = (id: string, municipio_id: string, extra = {}) => ({
      id,
      municipio_id,
      ativo: false,
      closed_at: new Date('2026-06-30T12:00:00Z'),
      data_inicio: new Date('2026-04-01'),
      data_termino: new Date('2026-06-15'),
      created_at: new Date('2026-03-20T00:00:00Z'),
      tipo_avaliacao: { nome: 'Avaliação 1' },
      ...extra,
    });

    it('só administrador/ilm', async () => {
      await expect(
        service.progressoMunicipios(usuario({ perfil: 'secretaria' }), ['m1']),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.avaliacao.findMany).not.toHaveBeenCalled();
    });

    it('soma as turmas por avaliação e devolve só a que representa o município', async () => {
      prisma.avaliacao.findMany.mockResolvedValue([
        avaliacaoDb('fechada', 'm1'),
        avaliacaoDb('aberta', 'm1', {
          ativo: true,
          closed_at: null,
          data_inicio: new Date('2026-10-20'),
          data_termino: null,
          tipo_avaliacao: { nome: 'Avaliação 2' },
        }),
      ]);
      // 10 alunos completos + 10 alunos com 1 de 7 campos → (1400 + 200) de 2800
      prisma.$queryRawUnsafe.mockResolvedValue([
        linha('aberta', 't1', 10, 1400),
        linha('aberta', 't2', 10, 200, { completos: 0n }),
      ]);

      const { data } = await service.progressoMunicipios(
        usuario({ perfil: 'ilm' }),
        ['m1'],
      );

      expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
        PROGRESSO_POR_TURMA_SQL,
        ['aberta'],
        null,
      );
      expect(data).toEqual([
        expect.objectContaining({
          municipio_id: 'm1',
          avaliacao_id: 'aberta',
          tipo_nome: 'Avaliação 2',
          ativo: true,
          atual: true,
          data_inicio: '2026-10-20',
          data_termino: null,
          considerados: 20,
          enviados: 20,
          completos: 10,
          pontos: 1600,
          pontos_max: 2800,
          pct: 57.1,
        }),
      ]);
    });

    it('histórico: todas as avaliações, da mais recente para a mais antiga; sem alunos o pct é null', async () => {
      prisma.avaliacao.findMany.mockResolvedValue([
        avaliacaoDb('antiga', 'm1'),
        avaliacaoDb('nova', 'm1', {
          data_inicio: new Date('2026-08-01'),
          tipo_avaliacao: { nome: 'Avaliação 2' },
        }),
      ]);
      prisma.$queryRawUnsafe.mockResolvedValue([linha('antiga', 't1', 5, 700)]);

      const { data } = await service.progressoMunicipios(
        usuario(),
        ['m1'],
        true,
      );

      expect(data.map((a) => [a.avaliacao_id, a.pct, a.atual])).toEqual([
        ['nova', null, true],
        ['antiga', 100, false],
      ]);
    });

    it('município sem avaliação não aparece', async () => {
      expect(await service.progressoMunicipios(usuario(), ['m1'])).toEqual({
        data: [],
      });
      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });
  });
});
