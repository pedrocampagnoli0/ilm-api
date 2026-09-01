import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { LoteService } from './lote.service';
import { PrismaService } from '../prisma/prisma.service';
import { AbilityFactory } from '../common/casl/ability.factory';
import { PagbankService } from './pagbank/pagbank.service';
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

/** Lote legado: link pag.ae criado à mão, sem checkout_id. */
const loteLegado = {
  id: 'l-1',
  evento_id: 'e-1',
  ordem: 1,
  nome: '1º lote',
  preco_centavos: 10000,
  ate: new Date('2026-08-23'),
  vagas_por_compra: 1,
  visivel_no_site: true,
  checkout_id: null,
  checkout_url: 'https://pag.ae/823iNngga',
  checkout_ambiente: null,
  checkout_criado_em: null,
  created_at: new Date(),
  updated_at: new Date(),
};

/** Lote com checkout criado pela API: preço e prazo estão congelados no PagBank. */
const loteComCheckout = { ...loteLegado, checkout_id: 'CHEC_ABC123' };

function createMockPrisma() {
  return {
    formacao_evento: {
      findUnique: jest.fn().mockResolvedValue({ id: 'e-1' }),
    },
    formacao_lote: {
      findUnique: jest.fn().mockResolvedValue(loteLegado),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(loteLegado),
      update: jest.fn().mockResolvedValue(loteLegado),
      delete: jest.fn().mockResolvedValue(loteLegado),
    },
    formacao_venda: {
      count: jest.fn().mockResolvedValue(0),
    },
  };
}

describe('LoteService', () => {
  let service: LoteService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let pagbank: {
    ambiente: string;
    criarCheckout: jest.Mock;
    inativar: jest.Mock;
  };
  const admin = makeUser('administrador');

  beforeEach(async () => {
    prisma = createMockPrisma();
    pagbank = {
      ambiente: 'sandbox',
      criarCheckout: jest
        .fn()
        .mockResolvedValue({ id: 'CHEC_NOVO', url: 'https://pagseguro/pay?code=x' }),
      inativar: jest.fn().mockResolvedValue(undefined),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoteService,
        AbilityFactory,
        { provide: PrismaService, useValue: prisma },
        { provide: PagbankService, useValue: pagbank },
      ],
    }).compile();
    service = module.get<LoteService>(LoteService);
  });

  describe('autorização', () => {
    it.each(['ilm', 'secretaria', 'professor'])('perfil %s é recusado', async (perfil) => {
      await expect(
        service.update(makeUser(perfil), 'l-1', { nome: 'x' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('create', () => {
    it('recusa ordem já ocupada no mesmo evento', async () => {
      prisma.formacao_lote.findFirst.mockResolvedValue({ id: 'l-9', nome: '1º lote' });

      await expect(
        service.create(admin, {
          evento_id: 'e-1',
          ordem: 1,
          nome: '1º lote (bis)',
          preco_centavos: 10000,
          ate: '2026-08-23',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('404 quando o evento não existe', async () => {
      prisma.formacao_evento.findUnique.mockResolvedValue(null);

      await expect(
        service.create(admin, {
          evento_id: 'e-x',
          ordem: 1,
          nome: '1º lote',
          preco_centavos: 10000,
          ate: '2026-08-23',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('pacote em grupo é só um lote com vagas_por_compra > 1', async () => {
      await service.create(admin, {
        evento_id: 'e-1',
        ordem: 4,
        nome: 'Pacote institucional',
        preco_centavos: 500000,
        ate: '2026-10-03',
        vagas_por_compra: 50,
        visivel_no_site: false,
      });

      expect(prisma.formacao_lote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vagas_por_compra: 50,
            preco_centavos: 500000,
            visivel_no_site: false,
          }),
        }),
      );
    });
  });

  describe('update — preço e prazo congelados no checkout', () => {
    it('recusa mudar preço de lote com checkout ativo', async () => {
      prisma.formacao_lote.findUnique.mockResolvedValue(loteComCheckout);

      await expect(
        service.update(admin, 'l-1', { preco_centavos: 12000 }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.formacao_lote.update).not.toHaveBeenCalled();
    });

    it('recusa mudar data-limite de lote com checkout ativo', async () => {
      prisma.formacao_lote.findUnique.mockResolvedValue(loteComCheckout);

      await expect(service.update(admin, 'l-1', { ate: '2026-09-30' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('deixa passar quando o valor enviado é igual ao atual (não é edição de fato)', async () => {
      prisma.formacao_lote.findUnique.mockResolvedValue(loteComCheckout);

      await expect(
        service.update(admin, 'l-1', { preco_centavos: 10000, ate: '2026-08-23' }),
      ).resolves.toBeDefined();
    });

    it('deixa editar nome e visibilidade mesmo com checkout ativo', async () => {
      prisma.formacao_lote.findUnique.mockResolvedValue(loteComCheckout);

      await expect(
        service.update(admin, 'l-1', { nome: 'Lote promocional', visivel_no_site: false }),
      ).resolves.toBeDefined();
    });

    it('lote legado (sem checkout_id) pode ter preço editado livremente', async () => {
      await expect(
        service.update(admin, 'l-1', { preco_centavos: 12000 }),
      ).resolves.toBeDefined();
      expect(prisma.formacao_lote.update).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('recusa apagar lote com venda', async () => {
      prisma.formacao_venda.count.mockResolvedValue(2);

      await expect(service.remove(admin, 'l-1')).rejects.toThrow(ConflictException);
      expect(prisma.formacao_lote.delete).not.toHaveBeenCalled();
    });

    it('recusa apagar lote com checkout ativo — o link continuaria vendendo', async () => {
      prisma.formacao_lote.findUnique.mockResolvedValue(loteComCheckout);

      await expect(service.remove(admin, 'l-1')).rejects.toThrow(ConflictException);
      expect(prisma.formacao_lote.delete).not.toHaveBeenCalled();
    });

    it('apaga lote legado sem venda', async () => {
      await expect(service.remove(admin, 'l-1')).resolves.toEqual({
        deleted: true,
        nome: '1º lote',
      });
    });
  });

  describe('criarCheckout', () => {
    beforeEach(() => {
      prisma.formacao_lote.findUnique.mockResolvedValue({
        ...loteLegado,
        checkout_id: null,
        evento: { cidade: 'Goiânia – GO', slug: 'goiania-2026-10-03' },
      });
    });

    it('carimba o lote no checkout — é o que faz a venda contar vaga', async () => {
      await service.criarCheckout(admin, 'l-1');

      expect(pagbank.criarCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          loteId: 'l-1',
          precoCentavos: 10000,
          ate: '2026-08-23',
          nome: expect.stringContaining('Goiânia – GO'),
        }),
      );
    });

    it('grava id, url e ambiente do checkout', async () => {
      await service.criarCheckout(admin, 'l-1');

      expect(prisma.formacao_lote.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            checkout_id: 'CHEC_NOVO',
            checkout_url: 'https://pagseguro/pay?code=x',
            checkout_ambiente: 'sandbox',
          }),
        }),
      );
    });

    it('avisa que o site precisa ser republicado', async () => {
      const r = await service.criarCheckout(admin, 'l-1');
      expect(r.aviso).toMatch(/sync-eventos/);
    });

    it('recusa criar um segundo checkout — dobraria a contagem de vaga', async () => {
      prisma.formacao_lote.findUnique.mockResolvedValue({
        ...loteComCheckout,
        evento: { cidade: 'x', slug: 'x' },
      });

      await expect(service.criarCheckout(admin, 'l-1')).rejects.toThrow(
        ConflictException,
      );
      expect(pagbank.criarCheckout).not.toHaveBeenCalled();
    });

    it.each(['ilm', 'secretaria'])('perfil %s é recusado', async (perfil) => {
      await expect(service.criarCheckout(makeUser(perfil), 'l-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('inativarCheckout', () => {
    it('inativa no PagBank e limpa os campos', async () => {
      prisma.formacao_lote.findUnique.mockResolvedValue(loteComCheckout);

      await service.inativarCheckout(admin, 'l-1');

      expect(pagbank.inativar).toHaveBeenCalledWith('CHEC_ABC123');
      expect(prisma.formacao_lote.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ checkout_id: null, checkout_url: null }),
        }),
      );
    });

    it('recusa em lote legado (pag.ae não é gerenciado pelo portal)', async () => {
      await expect(service.inativarCheckout(admin, 'l-1')).rejects.toThrow(
        ConflictException,
      );
      expect(pagbank.inativar).not.toHaveBeenCalled();
    });
  });
});
