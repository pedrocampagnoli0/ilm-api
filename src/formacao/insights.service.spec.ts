import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { InsightsService } from './insights.service';
import { PrismaService } from '../prisma/prisma.service';
import { AbilityFactory } from '../common/casl/ability.factory';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface';

function makeUser(perfil: string): AuthenticatedUser {
  return {
    id: `${perfil}-id`,
    authUserId: `auth-${perfil}`,
    nome: perfil,
    email: `${perfil}@x.com`,
    perfil,
    municipioId: null,
    escolaIds: [],
    turmaIds: [],
    assessoraMunicipioIds: [],
    ativo: true,
  } as AuthenticatedUser;
}

const admin = makeUser('administrador');

function createMockPrisma() {
  return {
    $queryRaw: jest.fn().mockResolvedValue([]),
    formacao_venda: { count: jest.fn().mockResolvedValue(0) },
    formacao_lote: { count: jest.fn().mockResolvedValue(0) },
    formacao_evento: { count: jest.fn().mockResolvedValue(0) },
  };
}

const RECORTE = "origem <> 'cortesia'";

describe('InsightsService — recorte de cortesias', () => {
  let service: InsightsService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InsightsService,
        AbilityFactory,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get<InsightsService>(InsightsService);
  });

  /** Todo SQL gerado numa chamada, como texto — para procurar o recorte dentro. */
  function sqlGerado(): string[] {
    return prisma.$queryRaw.mock.calls.map((c) => String(c[0]?.text ?? ''));
  }

  /** O SQL de uma consulta específica, achado por um trecho que só ela tem. */
  function sqlDe(assinatura: string): string {
    const achado = sqlGerado().find((s) => s.includes(assinatura));
    if (!achado) throw new Error(`nenhuma query contém "${assinatura}"`);
    return achado;
  }

  it('recusa quem não é administrador', async () => {
    await expect(service.gerar(makeUser('ilm'))).rejects.toThrow(ForbiddenException);
  });

  it('inclui cortesias por padrão, sem query nenhuma recortada', async () => {
    const r = await service.gerar(admin);
    expect(r.incluir_cortesias).toBe(true);
    expect(sqlGerado().some((s) => s.includes(RECORTE))).toBe(false);
  });

  it('devolve a base usada, para a tela declarar o que mostra', async () => {
    const r = await service.gerar(admin, { incluir_cortesias: false });
    expect(r.incluir_cortesias).toBe(false);
  });

  // Uma a uma: um recorte que esquece de uma consulta produz uma tela onde o ticket
  // médio some as cortesias e o painel de preços continua mostrando a faixa de R$ 0.
  it.each([
    ['resumo', 'AS inscricoes'],
    ['série semanal', "date_trunc('week'"],
    ['antecedência', 'AS faixa'],
    ['métodos', 'metodo_pagamento AS metodo'],
    ['preços', 'valor_centavos AS preco'],
  ])('recorta a consulta de %s quando pedido', async (_nome, assinatura) => {
    await service.gerar(admin, { incluir_cortesias: false });
    expect(sqlDe(assinatura)).toContain(RECORTE);
  });

  /**
   * A regra que o resto do recorte não pode quebrar.
   *
   * Cortesia ocupa cadeira. Se `vendidas` a escondesse, a tela anunciaria vaga livre
   * que não existe — erro pior do que o ticket médio distorcido que o recorte conserta.
   */
  it('nunca recorta a ocupação da turma, nem com o recorte ligado', async () => {
    await service.gerar(admin, { incluir_cortesias: false });
    const turmas = sqlDe('AS vendidas');

    const linhaVendidas = turmas
      .split('\n')
      .find((l) => l.includes('AS vendidas')) as string;
    expect(linhaVendidas).not.toContain(RECORTE);
  });

  // O ritmo é projeção de venda futura: cortesia lançada hoje faria uma turma parada
  // parecer que voltou a vender.
  it('recorta o ritmo e a última venda da turma', async () => {
    await service.gerar(admin, { incluir_cortesias: false });
    const turmas = sqlDe('AS vendidas');
    expect(turmas).toContain(RECORTE);
    // Duas vezes: uma no filtro de "recentes", outra no de "ultima".
    expect(turmas.split(RECORTE).length - 1).toBe(2);
  });

  it('mantém o alerta de venda órfã fora do recorte', async () => {
    await service.gerar(admin, { incluir_cortesias: false });
    // Cortesia não tem lote por definição; ela é excluída do alerta sempre, via
    // Prisma e não via SQL cru — o recorte não deve encostar nisso.
    expect(prisma.formacao_venda.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          origem: { notIn: ['manual', 'cortesia'] },
        }),
      }),
    );
  });
});
