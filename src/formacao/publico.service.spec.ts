import { Test, TestingModule } from '@nestjs/testing';
import { PublicoService } from './publico.service';
import { PrismaService } from '../prisma/prisma.service';

const eventoPublicado = {
  id: 'e-1',
  slug: 'goiania-2026-10-03',
  cidade: 'Goiânia – GO',
  data: new Date('2026-10-03T00:00:00.000Z'),
  local: 'Auditório da CDL Goiânia',
  endereco: 'Rua 8, 624 – Setor Oeste, Goiânia – GO',
  como_chegar: null,
  vagas: null,
  status_manual: 'abertas',
  publicado: true,
  created_at: new Date(),
  updated_at: new Date(),
  lotes: [
    {
      id: 'l-1',
      ordem: 1,
      nome: '1º lote',
      preco_centavos: 10000,
      ate: new Date('2026-08-23T00:00:00.000Z'),
      visivel_no_site: true,
      checkout_url: 'https://pag.ae/823iNngga',
    },
    {
      id: 'l-2',
      ordem: 2,
      nome: 'Pacote institucional',
      preco_centavos: 500000,
      ate: new Date('2026-10-03T00:00:00.000Z'),
      visivel_no_site: false, // negociado por fora — não vai para o site
      checkout_url: 'https://pag.ae/xxx',
    },
    {
      id: 'l-3',
      ordem: 3,
      nome: '3º lote',
      preco_centavos: 15000,
      ate: new Date('2026-10-03T00:00:00.000Z'),
      visivel_no_site: true,
      checkout_url: null, // ainda sem checkout criado
    },
  ],
};

function createMockPrisma() {
  return {
    formacao_evento: {
      findMany: jest.fn().mockResolvedValue([eventoPublicado]),
    },
    formacao_venda: {
      groupBy: jest.fn().mockResolvedValue([]),
    },
  };
}

describe('PublicoService', () => {
  let service: PublicoService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [PublicoService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<PublicoService>(PublicoService);
  });

  describe('eventos', () => {
    it('não vaza vagas, contagem de vendas nem receita', async () => {
      prisma.formacao_venda.groupBy.mockResolvedValue([
        { evento_id: 'e-1', _sum: { vagas: 40 } },
      ]);

      const r = await service.eventos();
      const serializado = JSON.stringify(r);

      expect(serializado).not.toMatch(/vagas/);
      expect(serializado).not.toMatch(/vendidas/);
      expect(serializado).not.toMatch(/receita/);
      expect(serializado).not.toMatch(/preco_centavos/);
      expect(Object.keys(r.eventos[0])).toEqual([
        'slug', 'cidade', 'data', 'local', 'endereco', 'comoChegar', 'status', 'lotes',
      ]);
    });

    it('só devolve eventos publicados', async () => {
      await service.eventos();

      expect(prisma.formacao_evento.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { publicado: true } }),
      );
    });

    it('esconde lote invisível e lote sem link', async () => {
      const r = await service.eventos();

      expect(r.eventos[0].lotes).toHaveLength(1);
      expect(r.eventos[0].lotes[0].nome).toBe('1º lote');
    });

    it('formata preço no padrão do site, com espaço comum', async () => {
      const r = await service.eventos();

      expect(r.eventos[0].lotes[0].preco).toBe('R$ 100,00');
      // Sem espaço não-quebrável (U+00A0), que é o que o Intl produziria.
      expect(r.eventos[0].lotes[0].preco).not.toMatch(/ /);
    });

    it('formata milhar do pacote em grupo', async () => {
      prisma.formacao_evento.findMany.mockResolvedValue([
        {
          ...eventoPublicado,
          lotes: [
            {
              ...eventoPublicado.lotes[1],
              visivel_no_site: true,
            },
          ],
        },
      ]);

      const r = await service.eventos();

      expect(r.eventos[0].lotes[0].preco).toBe('R$ 5.000,00');
    });

    it('datas saem como YYYY-MM-DD', async () => {
      const r = await service.eventos();

      expect(r.eventos[0].data).toBe('2026-10-03');
      expect(r.eventos[0].lotes[0].ate).toBe('2026-08-23');
    });

    it('ignora venda de sandbox e cancelada ao apertar o selo', async () => {
      await service.eventos();

      expect(prisma.formacao_venda.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'confirmada', ambiente: 'producao' }),
        }),
      );
    });

    it('carimba gerado_em', async () => {
      const r = await service.eventos();

      expect(r.gerado_em).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('status', () => {
    it('só devolve turmas publicadas COM capacidade definida', async () => {
      prisma.formacao_evento.findMany.mockResolvedValue([]);

      await service.status();

      expect(prisma.formacao_evento.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { publicado: true, vagas: { not: null } },
        }),
      );
    });

    it('devolve só slug e status — nada de número', async () => {
      prisma.formacao_evento.findMany.mockResolvedValue([
        { id: 'e-1', slug: 'goiania-2026-10-03', vagas: 50, status_manual: null },
      ]);
      prisma.formacao_venda.groupBy.mockResolvedValue([
        { evento_id: 'e-1', _sum: { vagas: 45 } },
      ]);

      const r = await service.status();

      expect(r.turmas).toEqual([
        { slug: 'goiania-2026-10-03', status: 'ultimas' },
      ]);
      expect(JSON.stringify(r)).not.toMatch(/45|50/);
    });

    it('a contagem aperta o selo até esgotar', async () => {
      prisma.formacao_evento.findMany.mockResolvedValue([
        { id: 'e-1', slug: 'x', vagas: 50, status_manual: null },
      ]);
      prisma.formacao_venda.groupBy.mockResolvedValue([
        { evento_id: 'e-1', _sum: { vagas: 50 } },
      ]);

      const r = await service.status();

      expect(r.turmas[0].status).toBe('esgotado');
    });

    // Regra de 24/08/2026: com capacidade preenchida o selo é sempre automático.
    // Antes, `status_manual` funcionava como piso e só podia ser apertado.
    it('com capacidade, o selo é automático e ignora o status_manual', async () => {
      prisma.formacao_evento.findMany.mockResolvedValue([
        { id: 'e-1', slug: 'x', vagas: 1000, status_manual: 'esgotado' },
      ]);

      const r = await service.status();

      expect(r.turmas[0].status).toBe('abertas');
    });

    it('30% livres já é "últimas vagas"', async () => {
      prisma.formacao_evento.findMany.mockResolvedValue([
        { id: 'e-1', slug: 'x', vagas: 100, status_manual: null },
      ]);
      prisma.formacao_venda.groupBy.mockResolvedValue([
        { evento_id: 'e-1', _sum: { vagas: 70 } },
      ]);

      const r = await service.status();

      expect(r.turmas[0].status).toBe('ultimas');
    });
  });
});
