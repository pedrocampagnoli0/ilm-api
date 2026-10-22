import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { FluenciaService } from './fluencia.service';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface';
import type { CriarAplicacaoDto } from './dto/criar-aplicacao.dto';

const ID = '11111111-1111-4111-8111-111111111111';
const ALUNO = '22222222-2222-4222-8222-222222222222';

const user: AuthenticatedUser = {
  id: 'prof',
  authUserId: 'auth-prof',
  nome: 'Prof',
  email: 'p@test.com',
  perfil: 'professor',
  municipioId: 'muni',
  escolaIds: ['esc'],
  turmaIds: ['tur'],
  assessoraMunicipioIds: [],
  ativo: true,
};

function dto(over: Partial<CriarAplicacaoDto> = {}): CriarAplicacaoDto {
  return {
    id: ID,
    aluno_id: ALUNO,
    forma_numero: 3,
    iniciada_em: '2026-10-01T10:00:00Z',
    concluida_em: '2026-10-01T10:05:00Z',
    pseudopalavras: { total: 20, ultima: 12, erros: [2, 5] },
    palavras: { total: 20, ultima: 15, erros: [] },
    texto: { total: 100, ultima: 70, erros: [10], segundos: 46 },
    prosodia: 2,
    ...over,
  };
}

function setup(
  opts: {
    flag?: boolean;
    ciclo?: string;
    transferido?: boolean;
    aberta?: boolean;
    fazAvaliacao?: boolean;
    fluencia1ano?: boolean;
  } = {},
) {
  const {
    flag = true,
    ciclo = 'fundamental_2',
    transferido = false,
    aberta = true,
    fazAvaliacao = true,
    fluencia1ano = false,
  } = opts;
  const prisma = {
    fluencia_aplicacao: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    aluno: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ turma_id: 'tur', is_transferido: transferido }),
    },
    turma: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'tur',
        escola_id: 'esc',
        ciclo: { nome: ciclo },
        escola: {
          municipio_id: 'muni',
          municipio: {
            avaliacao_online_ativa: flag,
            faz_avaliacao: fazAvaliacao,
            fluencia_1ano_ativa: fluencia1ano,
          },
        },
      }),
    },
    avaliacao: {
      findFirst: jest.fn().mockResolvedValue(aberta ? { id: 'av' } : null),
    },
    resultado_avaliacao: {
      findUnique: jest.fn().mockResolvedValue({
        ausente: true,
        f2_nivel_leitura: 3,
        f2_nivel_escrita: 2,
        f2_compreensao_frases: 0,
        f2_compreensao_texto: 5,
      }),
    },
  };
  const resultado = {
    upsertBatch: jest.fn().mockResolvedValue({ data: { saved_count: 1 } }),
  };
  const ability = { createForUser: () => ({}) };
  const service = new FluenciaService(
    prisma as never,
    resultado as never,
    ability as never,
  );
  return { service, prisma, resultado };
}

describe('FluenciaService.criar', () => {
  it('re-POST do mesmo id devolve a linha salva sem inserir nem gravar de novo', async () => {
    const { service, prisma, resultado } = setup();
    prisma.fluencia_aplicacao.findUnique.mockResolvedValue({
      id: ID,
      aluno_id: ALUNO,
      ppm_gravado: 91,
      avaliacao_id: 'av',
    });
    const r = await service.criar(user, dto());
    expect(r).toEqual({
      created: false,
      data: { id: ID, ppm_gravado: 91, avaliacao_id: 'av' },
    });
    expect(prisma.fluencia_aplicacao.create).not.toHaveBeenCalled();
    expect(resultado.upsertBatch).not.toHaveBeenCalled();
  });

  it('id de outro aluno -> 409', async () => {
    const { service, prisma } = setup();
    prisma.fluencia_aplicacao.findUnique.mockResolvedValue({
      id: ID,
      aluno_id: 'outro',
      ppm_gravado: null,
      avaliacao_id: null,
    });
    await expect(service.criar(user, dto())).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('município sem a flag -> 403', async () => {
    const { service } = setup({ flag: false });
    await expect(service.criar(user, dto())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('município com faz_avaliacao = false -> 403', async () => {
    const { service, prisma } = setup({ fazAvaliacao: false });
    await expect(service.criar(user, dto())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.fluencia_aplicacao.create).not.toHaveBeenCalled();
  });

  it('1º ano sem fluencia_1ano_ativa -> 400', async () => {
    const { service, prisma } = setup({ ciclo: 'fundamental_1' });
    await expect(service.criar(user, dto())).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.fluencia_aplicacao.create).not.toHaveBeenCalled();
  });

  it('1º ano com fluencia_1ano_ativa: salva e preserva só os campos f1_*', async () => {
    const { service, prisma, resultado } = setup({
      ciclo: 'fundamental_1',
      fluencia1ano: true,
    });
    prisma.resultado_avaliacao.findUnique.mockResolvedValue({
      ausente: false,
      f1_nivel_leitura: 2,
      f1_nivel_escrita: 1,
      ppm: null,
    });
    const r = await service.criar(user, dto());
    expect(r.created).toBe(true);
    expect(resultado.upsertBatch).toHaveBeenCalledWith(user, {
      avaliacao_id: 'av',
      turma_id: 'tur',
      resultados: [
        {
          aluno_id: ALUNO,
          ausente: false,
          f1_nivel_leitura: 2,
          f1_nivel_escrita: 1,
          ppm: 91,
        },
      ],
    });
  });

  it('infantil -> 400 mesmo com fluencia_1ano_ativa', async () => {
    const { service } = setup({ ciclo: 'infantil_2', fluencia1ano: true });
    await expect(service.criar(user, dto())).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('aluno transferido -> 400', async () => {
    const { service } = setup({ transferido: true });
    await expect(service.criar(user, dto())).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('erro em posição maior que ultima -> 400', async () => {
    const { service, prisma } = setup();
    await expect(
      service.criar(
        user,
        dto({ palavras: { total: 20, ultima: 15, erros: [16] } }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.fluencia_aplicacao.create).not.toHaveBeenCalled();
  });

  it('sem avaliação aberta: salva a aplicação com ppm_gravado null e não chama upsertBatch', async () => {
    const { service, prisma, resultado } = setup({ aberta: false });
    const r = await service.criar(user, dto());
    expect(r).toEqual({
      created: true,
      data: { id: ID, ppm_gravado: null, avaliacao_id: null },
    });
    expect(prisma.fluencia_aplicacao.create).toHaveBeenCalledTimes(1);
    expect(resultado.upsertBatch).not.toHaveBeenCalled();
  });

  it('com avaliação aberta: preserva ausente/f2_* e grava ppm = round(70*60/46) = 91', async () => {
    const { service, prisma, resultado } = setup();
    const r = await service.criar(user, dto());
    expect(r).toEqual({
      created: true,
      data: { id: ID, ppm_gravado: 91, avaliacao_id: 'av' },
    });
    expect(resultado.upsertBatch).toHaveBeenCalledWith(user, {
      avaliacao_id: 'av',
      turma_id: 'tur',
      resultados: [
        {
          aluno_id: ALUNO,
          ausente: true,
          f2_nivel_leitura: 3,
          f2_nivel_escrita: 2,
          f2_compreensao_frases: 0,
          f2_compreensao_texto: 5,
          ppm: 91,
        },
      ],
    });
    expect(prisma.fluencia_aplicacao.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: { avaliacao_id: 'av', ppm_gravado: 91 },
    });
  });

  it('upsertBatch falhando: aplicação continua salva e resposta traz ppm_gravado null', async () => {
    const { service, prisma, resultado } = setup();
    resultado.upsertBatch.mockRejectedValue(new Error('boom'));
    const r = await service.criar(user, dto());
    expect(r.data.ppm_gravado).toBeNull();
    expect(prisma.fluencia_aplicacao.create).toHaveBeenCalledTimes(1);
    expect(prisma.fluencia_aplicacao.update).not.toHaveBeenCalled();
  });
});
