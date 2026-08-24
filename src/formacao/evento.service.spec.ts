import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventoService } from './evento.service';
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

const mockEvento = {
  id: 'e-1',
  slug: 'goiania-2026-10-03',
  cidade: 'Goiânia – GO',
  data: new Date('2026-10-03'),
  local: 'CDL',
  endereco: 'Rua 8',
  como_chegar: null,
  vagas: 50,
  status_manual: null,
  publicado: true,
  created_at: new Date(),
  updated_at: new Date(),
  lotes: [],
};

function createMockPrisma() {
  return {
    formacao_evento: {
      findMany: jest.fn().mockResolvedValue([mockEvento]),
      findUnique: jest.fn().mockResolvedValue(mockEvento),
      create: jest.fn().mockResolvedValue(mockEvento),
      update: jest.fn().mockResolvedValue(mockEvento),
      delete: jest.fn().mockResolvedValue(mockEvento),
    },
    formacao_venda: {
      groupBy: jest.fn().mockResolvedValue([]),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };
}

describe('EventoService', () => {
  let service: EventoService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventoService,
        AbilityFactory,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get<EventoService>(EventoService);
  });

  describe('autorização', () => {
    it('administrador entra', async () => {
      await expect(service.findAll(makeUser('administrador'), {})).resolves.toBeDefined();
    });

    // Formação movimenta dinheiro: o perfil 'ilm' NÃO entra, ao contrário do resto da API.
    it.each(['ilm', 'secretaria', 'diretor', 'coordenacao', 'professor'])(
      'perfil %s é recusado',
      async (perfil) => {
        await expect(service.findAll(makeUser(perfil), {})).rejects.toThrow(ForbiddenException);
      },
    );
  });

  describe('contagem de vagas', () => {
    it('soma vagas (não conta linhas) — é o que faz a compra em grupo funcionar', async () => {
      // Uma venda só, valendo 50 lugares: um pacote institucional.
      prisma.formacao_venda.groupBy.mockResolvedValue([
        { evento_id: 'e-1', _sum: { vagas: 50, valor_centavos: 500000 } },
      ]);

      const { data } = await service.findAll(makeUser('administrador'), {});

      expect(data[0].vendidas).toBe(50);
      expect(data[0].restantes).toBe(0);
      expect(data[0].status).toBe('esgotado');
      expect(data[0].receita_centavos).toBe(500000);
    });

    it('ignora vendas de sandbox e canceladas na contagem', async () => {
      await service.findAll(makeUser('administrador'), {});

      expect(prisma.formacao_venda.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'confirmada', ambiente: 'producao' }),
        }),
      );
    });

    it('sinaliza excedente quando vendeu mais que a capacidade', async () => {
      // O PagBank não recusa venda quando lota: a 51ª pessoa consegue pagar.
      prisma.formacao_venda.groupBy.mockResolvedValue([
        { evento_id: 'e-1', _sum: { vagas: 53, valor_centavos: 0 } },
      ]);

      const { data } = await service.findAll(makeUser('administrador'), {});

      expect(data[0].excedente).toBe(true);
      expect(data[0].restantes).toBe(0);
    });

    it('sem vendas, o evento fica aberto e sem excedente', async () => {
      const { data } = await service.findAll(makeUser('administrador'), {});

      expect(data[0].vendidas).toBe(0);
      expect(data[0].restantes).toBe(50);
      expect(data[0].excedente).toBe(false);
    });
  });

  describe('create', () => {
    it('recusa slug duplicado — o slug liga o evento às vendas', async () => {
      prisma.formacao_evento.findUnique.mockResolvedValue({ id: 'outro' });

      await expect(
        service.create(makeUser('administrador'), {
          slug: 'goiania-2026-10-03',
          cidade: 'Goiânia – GO',
          data: '2026-10-03',
          local: 'CDL',
          endereco: 'Rua 8',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('publicar', () => {
    it('recusa publicar evento sem lote vendável', async () => {
      prisma.formacao_evento.findUnique.mockResolvedValue({ ...mockEvento, lotes: [] });

      await expect(
        service.publicar(makeUser('administrador'), 'e-1', true),
      ).rejects.toThrow(ConflictException);
    });

    it('deixa publicar turma esgotada sem lote', async () => {
      prisma.formacao_evento.findUnique.mockResolvedValue({
        ...mockEvento,
        status_manual: 'esgotado',
        lotes: [],
      });

      await expect(
        service.publicar(makeUser('administrador'), 'e-1', true),
      ).resolves.toBeDefined();
    });

    it('despublicar nunca é bloqueado', async () => {
      prisma.formacao_evento.findUnique.mockResolvedValue({ ...mockEvento, lotes: [] });

      await expect(
        service.publicar(makeUser('administrador'), 'e-1', false),
      ).resolves.toBeDefined();
    });
  });

  describe('remove', () => {
    it('recusa apagar evento com venda registrada', async () => {
      prisma.formacao_venda.count.mockResolvedValue(3);

      await expect(service.remove(makeUser('administrador'), 'e-1')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.formacao_evento.delete).not.toHaveBeenCalled();
    });

    it('apaga evento sem venda', async () => {
      await expect(service.remove(makeUser('administrador'), 'e-1')).resolves.toEqual({
        deleted: true,
        slug: 'goiania-2026-10-03',
      });
    });

    it('404 em evento inexistente', async () => {
      prisma.formacao_evento.findUnique.mockResolvedValue(null);

      await expect(service.remove(makeUser('administrador'), 'e-x')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('vendas', () => {
    /**
     * A seleção precisa continuar explícita, campo a campo. Trocar por um `include`
     * solto passaria a devolver toda coluna nova da tabela sem ninguém decidir — é
     * assim que dado sensível vaza por descuido.
     */
    it('seleciona os campos um a um, sem `include` solto', async () => {
      await service.vendas(makeUser('administrador'), 'e-1');

      const [args] = prisma.formacao_venda.findMany.mock.calls[0];
      expect(args.select).toBeDefined();
      expect(args.include).toBeUndefined();
    });

    // Decisão do ILM em 24/08/2026: o extrato é a tela de conferência da turma, e o CPF
    // ajuda a identificar o inscrito. A rota exige perfil `administrador`.
    it('devolve os quatro dados do comprador, CPF incluído', async () => {
      await service.vendas(makeUser('administrador'), 'e-1');

      const [args] = prisma.formacao_venda.findMany.mock.calls[0];
      expect(args.select.comprador_nome).toBe(true);
      expect(args.select.comprador_email).toBe(true);
      expect(args.select.comprador_celular).toBe(true);
      expect(args.select.comprador_cpf).toBe(true);
    });

    it('separa confirmadas de sandbox e canceladas nos totais', async () => {
      prisma.formacao_venda.findMany.mockResolvedValue([
        { status: 'confirmada', ambiente: 'producao', vagas: 2, valor_centavos: 20000 },
        { status: 'confirmada', ambiente: 'sandbox', vagas: 10, valor_centavos: 99999 },
        { status: 'cancelada', ambiente: 'producao', vagas: 1, valor_centavos: 10000 },
      ]);

      const r = await service.vendas(makeUser('administrador'), 'e-1');

      expect(r.totais.confirmadas).toBe(1);
      expect(r.totais.sandbox).toBe(1);
      expect(r.totais.canceladas).toBe(1);
      // Só a venda confirmada de produção conta na receita e nas vagas.
      expect(r.totais.receita_centavos).toBe(20000);
      expect(r.evento.vendidas).toBe(2);
    });
  });
});
