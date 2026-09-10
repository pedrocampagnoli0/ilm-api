import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { CheckoutLogService } from './checkout-log.service';
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

const linhaManual = {
  id: 'log-1',
  lote_id: 'l-1',
  evento_id: 'e-1',
  evento_slug: 'goiania-2026-10-03',
  evento_cidade: 'Goiânia – GO',
  lote_nome: '1º lote',
  acao: 'inativado',
  motivo: 'manual',
  ator_usuario_id: 'u-1',
  checkout_id: 'CHEC_A',
  checkout_url: 'https://pagseguro/pay?code=a',
  checkout_ambiente: 'producao',
  vendidas: null,
  vagas: null,
  erro: null,
  created_at: new Date(),
};

const linhaAutomatica = {
  ...linhaManual,
  id: 'log-2',
  motivo: 'lotou',
  ator_usuario_id: null,
  vendidas: 50,
  vagas: 50,
};

function createMockPrisma() {
  return {
    formacao_checkout_log: {
      create: jest.fn().mockResolvedValue(linhaManual),
      findMany: jest.fn().mockResolvedValue([linhaManual, linhaAutomatica]),
    },
    usuario: {
      findMany: jest.fn().mockResolvedValue([{ id: 'u-1', nome: 'Fulana Admin' }]),
    },
  };
}

describe('CheckoutLogService', () => {
  let service: CheckoutLogService;
  let prisma: ReturnType<typeof createMockPrisma>;
  const admin = makeUser('administrador');

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckoutLogService,
        AbilityFactory,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get<CheckoutLogService>(CheckoutLogService);
  });

  describe('registrar', () => {
    it('grava a linha com os campos desnormalizados', async () => {
      await service.registrar({
        loteId: 'l-1',
        eventoId: 'e-1',
        eventoSlug: 'goiania-2026-10-03',
        eventoCidade: 'Goiânia – GO',
        loteNome: '1º lote',
        acao: 'inativado',
        motivo: 'lotou',
        vendidas: 50,
        vagas: 50,
      });

      const [args] = prisma.formacao_checkout_log.create.mock.calls[0];
      expect(args.data).toEqual(
        expect.objectContaining({
          evento_slug: 'goiania-2026-10-03',
          motivo: 'lotou',
          ator_usuario_id: null,
          vendidas: 50,
        }),
      );
    });

    it('falha de gravação NÃO propaga: auditoria não derruba venda nem webhook', async () => {
      prisma.formacao_checkout_log.create.mockRejectedValue(new Error('banco fora'));

      await expect(
        service.registrar({
          loteId: 'l-1',
          eventoId: 'e-1',
          eventoSlug: 'x',
          eventoCidade: 'X',
          loteNome: '1º lote',
          acao: 'inativado',
          motivo: 'lotou',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('listar', () => {
    it.each(['ilm', 'secretaria', 'professor'])('perfil %s é recusado', async (perfil) => {
      await expect(service.listar(makeUser(perfil))).rejects.toThrow(ForbiddenException);
    });

    it('resolve o nome do ator e deixa null quando foi o sistema', async () => {
      const r = await service.listar(admin);

      expect(r.data[0].ator_nome).toBe('Fulana Admin');
      expect(r.data[1].ator_nome).toBeNull();
    });

    it('busca os atores numa consulta só, não uma por linha', async () => {
      await service.listar(admin);

      expect(prisma.usuario.findMany).toHaveBeenCalledTimes(1);
    });

    it('não consulta usuario quando nenhuma linha tem ator', async () => {
      prisma.formacao_checkout_log.findMany.mockResolvedValue([linhaAutomatica]);

      await service.listar(admin);

      expect(prisma.usuario.findMany).not.toHaveBeenCalled();
    });

    it('filtra por motivo — a pergunta "o sistema derrubou algo sozinho?"', async () => {
      await service.listar(admin, { motivo: 'lotou' });

      const [args] = prisma.formacao_checkout_log.findMany.mock.calls[0];
      expect(args.where).toEqual({ motivo: 'lotou' });
    });

    it('limita o take em 500 mesmo se pedirem mais', async () => {
      await service.listar(admin, { limit: 9000 });

      const [args] = prisma.formacao_checkout_log.findMany.mock.calls[0];
      expect(args.take).toBe(500);
    });
  });
});
