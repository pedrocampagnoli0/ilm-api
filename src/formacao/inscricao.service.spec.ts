import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InscricaoService } from './inscricao.service';
import { PrismaService } from '../prisma/prisma.service';
import { AbilityFactory } from '../common/casl/ability.factory';
import type { AuthenticatedUser } from '../common/auth/interfaces/authenticated-user.interface';
import type { CreateInscricaoDto } from './dto/create-inscricao.dto';

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

const mockEvento = { id: 'e-1', cidade: 'Goiânia – GO', vagas: 50 };

function dto(over: Partial<CreateInscricaoDto> = {}): CreateInscricaoDto {
  return {
    nome: 'Maria da Silva',
    email: 'maria@escola.com.br',
    celular: '(62) 99999-8888',
    gratuidade_origem: 'voucher',
    ...over,
  } as CreateInscricaoDto;
}

function createMockPrisma() {
  return {
    formacao_evento: {
      findUnique: jest.fn().mockResolvedValue(mockEvento),
    },
    formacao_lote: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'l-1',
        evento_id: 'e-1',
        nome: '1º lote',
      }),
    },
    formacao_venda: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue({
        cobranca_id: 'cortesia:abc',
        evento_id: 'e-1',
        origem: 'cortesia',
        comprador_nome: 'Maria da Silva',
      }),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
      delete: jest.fn().mockResolvedValue({}),
      aggregate: jest.fn().mockResolvedValue({ _sum: { vagas: 10 } }),
    },
  };
}

describe('InscricaoService', () => {
  let service: InscricaoService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InscricaoService,
        AbilityFactory,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get<InscricaoService>(InscricaoService);
  });

  describe('autorização', () => {
    it('administrador lança', async () => {
      await expect(service.create(admin, 'e-1', dto())).resolves.toBeDefined();
    });

    // Mesmo corte do resto do módulo: formação movimenta dinheiro e o perfil 'ilm'
    // não entra, ao contrário do resto da API.
    it.each(['ilm', 'secretaria', 'diretor', 'coordenacao', 'professor'])(
      'perfil %s é recusado',
      async (perfil) => {
        await expect(service.create(makeUser(perfil), 'e-1', dto())).rejects.toThrow(
          ForbiddenException,
        );
      },
    );
  });

  describe('create', () => {
    it('grava como cortesia de valor zero, confirmada e em produção', async () => {
      await service.create(admin, 'e-1', dto());

      const { data } = prisma.formacao_venda.create.mock.calls[0][0];
      expect(data.origem).toBe('cortesia');
      expect(data.valor_centavos).toBe(0);
      expect(data.status).toBe('confirmada');
      expect(data.ambiente).toBe('producao');
      expect(data.metodo_pagamento).toBe('cortesia');
      expect(data.gratuidade_origem).toBe('voucher');
      expect(data.cobranca_id).toMatch(/^cortesia:/);
    });

    // Valor zero e não nulo: nulo significaria "não sabemos quanto foi".
    it('nunca grava valor nulo', async () => {
      await service.create(admin, 'e-1', dto());
      expect(prisma.formacao_venda.create.mock.calls[0][0].data.valor_centavos).not
        .toBeNull();
    });

    // `pago_em` é o que põe a linha na semana certa da série do painel. Sem ele, a
    // consulta cai no `created_at` e a inscrição some das séries que filtram por data.
    it('preenche pago_em com a data do lançamento', async () => {
      await service.create(admin, 'e-1', dto());
      expect(prisma.formacao_venda.create.mock.calls[0][0].data.pago_em).toBeInstanceOf(
        Date,
      );
    });

    it('ocupa uma vaga por padrão e respeita a quantidade pedida', async () => {
      await service.create(admin, 'e-1', dto());
      expect(prisma.formacao_venda.create.mock.calls[0][0].data.vagas).toBe(1);

      await service.create(admin, 'e-1', dto({ vagas: 5, email: 'outra@x.com' }));
      expect(prisma.formacao_venda.create.mock.calls[1][0].data.vagas).toBe(5);
    });

    it('recusa evento inexistente', async () => {
      prisma.formacao_evento.findUnique.mockResolvedValue(null);
      await expect(service.create(admin, 'e-404', dto())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('recusa origem "outro" sem detalhe', async () => {
      await expect(
        service.create(admin, 'e-1', dto({ gratuidade_origem: 'outro' })),
      ).rejects.toThrow(ConflictException);
    });

    it('aceita origem "outro" com detalhe', async () => {
      await expect(
        service.create(
          admin,
          'e-1',
          dto({ gratuidade_origem: 'outro', observacao: 'permuta de divulgação' }),
        ),
      ).resolves.toBeDefined();
    });

    it('recusa lote de outra turma', async () => {
      prisma.formacao_lote.findUnique.mockResolvedValue({
        id: 'l-9',
        evento_id: 'e-2',
        nome: '2º lote',
      });
      await expect(
        service.create(admin, 'e-1', dto({ lote_id: 'l-9' })),
      ).rejects.toThrow(ConflictException);
    });

    // Duas linhas para a mesma pessoa somariam duas vagas para uma cadeira só.
    it('recusa e-mail já inscrito na turma', async () => {
      prisma.formacao_venda.findFirst.mockResolvedValue({
        cobranca_id: 'cortesia:x',
        origem: 'cortesia',
      });
      await expect(service.create(admin, 'e-1', dto())).rejects.toThrow(
        ConflictException,
      );
    });

    it('explica o caminho quando a duplicata é uma compra paga', async () => {
      prisma.formacao_venda.findFirst.mockResolvedValue({
        cobranca_id: 'CHAR_1',
        origem: 'pagbank',
      });
      await expect(service.create(admin, 'e-1', dto())).rejects.toThrow(
        /Cancele a compra/,
      );
    });

    it('avisa quando a turma passa da capacidade, sem bloquear', async () => {
      prisma.formacao_venda.aggregate.mockResolvedValue({ _sum: { vagas: 51 } });
      const criada = await service.create(admin, 'e-1', dto());
      expect(criada.aviso).toMatch(/passou da capacidade/);
    });

    it('não avisa quando ainda cabe', async () => {
      const criada = await service.create(admin, 'e-1', dto());
      expect(criada.aviso).toBeNull();
    });

    // Turma sem capacidade cadastrada não tem contra o que comparar.
    it('não consulta a ocupação quando o evento não tem capacidade', async () => {
      prisma.formacao_evento.findUnique.mockResolvedValue({ ...mockEvento, vagas: null });
      const criada = await service.create(admin, 'e-1', dto());
      expect(criada.aviso).toBeNull();
      expect(prisma.formacao_venda.aggregate).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('apaga cortesia', async () => {
      await expect(service.remove(admin, 'e-1', 'cortesia:abc')).resolves.toEqual({
        deleted: true,
        nome: 'Maria da Silva',
      });
      expect(prisma.formacao_venda.delete).toHaveBeenCalled();
    });

    // Venda paga é histórico financeiro — não some por clique no painel.
    it.each(['pagbank', 'pagbank_legado', 'manual'])(
      'recusa apagar venda de origem %s',
      async (origem) => {
        prisma.formacao_venda.findUnique.mockResolvedValue({
          cobranca_id: 'CHAR_1',
          evento_id: 'e-1',
          origem,
          comprador_nome: 'João',
        });
        await expect(service.remove(admin, 'e-1', 'CHAR_1')).rejects.toThrow(
          ConflictException,
        );
        expect(prisma.formacao_venda.delete).not.toHaveBeenCalled();
      },
    );

    // Sem a conferência de turma, um id de outra turma seria apagado pela rota errada.
    it('recusa inscrição de outra turma', async () => {
      prisma.formacao_venda.findUnique.mockResolvedValue({
        cobranca_id: 'cortesia:abc',
        evento_id: 'e-2',
        origem: 'cortesia',
        comprador_nome: 'Maria',
      });
      await expect(service.remove(admin, 'e-1', 'cortesia:abc')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('recusa inscrição inexistente', async () => {
      prisma.formacao_venda.findUnique.mockResolvedValue(null);
      await expect(service.remove(admin, 'e-1', 'nada')).rejects.toThrow(
        NotFoundException,
      );
    });

    it.each(['ilm', 'professor'])('perfil %s não apaga', async (perfil) => {
      await expect(
        service.remove(makeUser(perfil), 'e-1', 'cortesia:abc'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
