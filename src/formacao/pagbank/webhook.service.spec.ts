import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WebhookService } from './webhook.service';
import { PagbankService } from './pagbank.service';
import { PrismaService } from '../../prisma/prisma.service';

const LOTE_ID = '98bdcb77-59be-4ace-9796-2465fc09720d';
const EVENTO_ID = '11111111-2222-3333-4444-555555555555';

const lote = {
  id: LOTE_ID,
  evento_id: EVENTO_ID,
  vagas_por_compra: 1,
  preco_centavos: 10000,
  nome: '1º lote',
};

function notificacao(over: Record<string, unknown> = {}) {
  return {
    id: 'ORDE_1',
    reference_id: `lote:${LOTE_ID}`,
    customer: {
      name: 'Maria Silva',
      email: 'maria@exemplo.com',
      tax_id: '123.456.789-09',
      phones: [{ country: 55, area: 62, number: 999998888, type: 'MOBILE' }],
    },
    charges: [
      {
        id: 'CHAR_1',
        reference_id: `lote:${LOTE_ID}`,
        status: 'PAID',
        amount: { value: 10000 },
      },
    ],
    ...over,
  };
}

function createMockPrisma() {
  return {
    formacao_webhook_evento: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
    formacao_lote: {
      findUnique: jest.fn().mockResolvedValue(lote),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    formacao_evento: {
      findUnique: jest.fn().mockResolvedValue({ vagas: null, slug: 'x' }),
    },
    formacao_venda: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { vagas: 0 } }),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ status: 'confirmada' }]),
  };
}

describe('WebhookService', () => {
  let service: WebhookService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let pagbank: { ambiente: string; inativar: jest.Mock };

  beforeEach(async () => {
    prisma = createMockPrisma();
    pagbank = { ambiente: 'sandbox', inativar: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: PrismaService, useValue: prisma },
        { provide: PagbankService, useValue: pagbank },
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    }).compile();
    service = module.get<WebhookService>(WebhookService);
  });

  /** Valores posicionais passados ao $queryRaw (Prisma.sql). */
  const valoresGravados = () => prisma.$queryRaw.mock.calls[0][0].values;

  describe('quais status movem venda', () => {
    it('PAID confirma', async () => {
      const r = await service.processar(notificacao());
      expect(r[0].status).toBe('confirmada');
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it.each(['CANCELED', 'DECLINED'])('%s cancela', async (status) => {
      prisma.$queryRaw.mockResolvedValue([{ status: 'cancelada' }]);
      const r = await service.processar(
        notificacao({ charges: [{ id: 'CHAR_1', status, amount: { value: 10000 } }] }),
      );
      expect(r[0].status).toBe('cancelada');
    });

    it.each(['WAITING', 'IN_ANALYSIS', 'AUTHORIZED'])(
      '%s é passagem e NÃO grava (AUTHORIZED venderia vaga que não existe)',
      async (status) => {
        const r = await service.processar(
          notificacao({ charges: [{ id: 'CHAR_1', status, amount: { value: 10000 } }] }),
        );
        expect(r[0].status).toBeNull();
        expect(prisma.$queryRaw).not.toHaveBeenCalled();
      },
    );
  });

  describe('idempotência', () => {
    it('evento já visto não grava de novo', async () => {
      prisma.formacao_webhook_evento.findUnique.mockResolvedValue({
        evento_id: 'CHAR_1:PAID',
      });

      const r = await service.processar(notificacao());

      expect(r[0].status).toBe('repetido');
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('a chave é <cobranca>:<status> — o payload não traz id de evento', async () => {
      await service.processar(notificacao());

      expect(prisma.formacao_webhook_evento.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { evento_id: 'CHAR_1:PAID' } }),
      );
      expect(prisma.formacao_webhook_evento.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { evento_id: 'CHAR_1:PAID', evento: 'PAID' } }),
      );
    });

    it('a mesma cobrança com OUTRO status é processada (PAID depois de CANCELED)', async () => {
      prisma.formacao_webhook_evento.findUnique.mockResolvedValue(null);
      await service.processar(
        notificacao({
          charges: [{ id: 'CHAR_1', status: 'CANCELED', amount: { value: 10000 } }],
        }),
      );
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it('grava o evento DEPOIS da venda — se falhar no meio, o reenvio reprocessa', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('banco fora'));

      await expect(service.processar(notificacao())).rejects.toThrow('banco fora');
      expect(prisma.formacao_webhook_evento.create).not.toHaveBeenCalled();
    });
  });

  describe('dinheiro', () => {
    it('parcelado grava o preço do lote, não o total com juros', async () => {
      await service.processar(
        notificacao({
          charges: [
            {
              id: 'CHAR_1',
              reference_id: `lote:${LOTE_ID}`,
              status: 'PAID',
              amount: { value: 12018, fees: { buyer: { interest: { total: 2018 } } } },
            },
          ],
        }),
      );

      expect(valoresGravados()).toContain(10000);
      expect(valoresGravados()).not.toContain(12018);
    });
  });

  describe('lookup do lote', () => {
    it('usa o reference_id da COBRANÇA com precedência sobre o do pedido', async () => {
      const outro = '99999999-9999-4999-8999-999999999999';
      await service.processar(
        notificacao({
          reference_id: `lote:${outro}`,
          charges: [
            {
              id: 'CHAR_1',
              reference_id: `lote:${LOTE_ID}`,
              status: 'PAID',
              amount: { value: 10000 },
            },
          ],
        }),
      );

      expect(prisma.formacao_lote.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: LOTE_ID } }),
      );
    });

    it('cai para o reference_id do pedido quando a cobrança não tem', async () => {
      await service.processar(
        notificacao({
          charges: [{ id: 'CHAR_1', status: 'PAID', amount: { value: 10000 } }],
        }),
      );

      expect(prisma.formacao_lote.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: LOTE_ID } }),
      );
    });

    it('venda órfã é gravada mesmo assim — perder é pior que registrar sem lote', async () => {
      prisma.formacao_lote.findUnique.mockResolvedValue(null);

      const r = await service.processar(
        notificacao({
          reference_id: 'turma:formato-antigo',
          charges: [{ id: 'CHAR_1', status: 'PAID', amount: { value: 10000 } }],
        }),
      );

      expect(r[0].status).toBe('confirmada');
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it('copia vagas_por_compra do lote (compra em grupo)', async () => {
      prisma.formacao_lote.findUnique.mockResolvedValue({
        ...lote,
        vagas_por_compra: 50,
        preco_centavos: 500000,
      });

      await service.processar(
        notificacao({
          charges: [
            {
              id: 'CHAR_1',
              reference_id: `lote:${LOTE_ID}`,
              status: 'PAID',
              amount: { value: 500000 },
            },
          ],
        }),
      );

      expect(valoresGravados()).toContain(50);
    });
  });

  describe('dados do comprador', () => {
    it('grava nome, e-mail, celular e CPF', async () => {
      await service.processar(notificacao());
      const v = valoresGravados();

      expect(v).toContain('Maria Silva');
      expect(v).toContain('maria@exemplo.com');
      expect(v).toContain('+5562999998888');
      expect(v).toContain('12345678909');
    });

    it('notificação sem customer grava nulos (o COALESCE do SQL preserva o que havia)', async () => {
      await service.processar(notificacao({ customer: undefined }));
      const v = valoresGravados();

      expect(v).not.toContain('Maria Silva');
      expect(v.filter((x: unknown) => x === null).length).toBeGreaterThan(0);
    });
  });

  describe('notificações que não movem venda', () => {
    it('sem charges devolve vazio (notificação de checkout EXPIRED)', async () => {
      const r = await service.processar({ id: 'CHEC_1', status: 'EXPIRED' });
      expect(r).toEqual([]);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('inativação automática ao lotar', () => {
    it('não faz nada quando o evento não tem capacidade', async () => {
      await service.processar(notificacao());
      expect(pagbank.inativar).not.toHaveBeenCalled();
    });

    it('inativa todos os checkouts do evento quando as vagas acabam', async () => {
      prisma.formacao_evento.findUnique.mockResolvedValue({ vagas: 50, slug: 'goiania' });
      prisma.formacao_venda.aggregate.mockResolvedValue({ _sum: { vagas: 50 } });
      prisma.formacao_lote.findMany.mockResolvedValue([
        { id: 'l-1', checkout_id: 'CHEC_A', nome: '1º lote' },
        { id: 'l-2', checkout_id: 'CHEC_B', nome: '2º lote' },
      ]);

      await service.processar(notificacao());

      expect(pagbank.inativar).toHaveBeenCalledWith('CHEC_A');
      expect(pagbank.inativar).toHaveBeenCalledWith('CHEC_B');
      expect(prisma.formacao_lote.update).toHaveBeenCalledTimes(2);
    });

    it('não inativa enquanto ainda há vaga', async () => {
      prisma.formacao_evento.findUnique.mockResolvedValue({ vagas: 50, slug: 'goiania' });
      prisma.formacao_venda.aggregate.mockResolvedValue({ _sum: { vagas: 49 } });

      await service.processar(notificacao());

      expect(pagbank.inativar).not.toHaveBeenCalled();
    });

    it('conta só vendas de produção ao decidir se lotou', async () => {
      prisma.formacao_evento.findUnique.mockResolvedValue({ vagas: 50, slug: 'x' });

      await service.processar(notificacao());

      expect(prisma.formacao_venda.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'confirmada', ambiente: 'producao' }),
        }),
      );
    });

    it('falha ao inativar NÃO derruba o webhook — a venda já está gravada', async () => {
      prisma.formacao_evento.findUnique.mockResolvedValue({ vagas: 50, slug: 'x' });
      prisma.formacao_venda.aggregate.mockResolvedValue({ _sum: { vagas: 50 } });
      prisma.formacao_lote.findMany.mockResolvedValue([
        { id: 'l-1', checkout_id: 'CHEC_A', nome: '1º lote' },
      ]);
      pagbank.inativar.mockRejectedValue(new Error('PagBank fora'));

      const r = await service.processar(notificacao());

      expect(r[0].status).toBe('confirmada');
    });
  });

  describe('ambiente', () => {
    it('carimba o ambiente do PagBank na venda', async () => {
      await service.processar(notificacao());
      expect(valoresGravados()).toContain('sandbox');
    });
  });
});
