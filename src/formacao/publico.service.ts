import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { eventoRealizado, statusDoEvento, type StatusFormacao } from './status.js';
import { soData } from './datas.js';

/**
 * Superfície pública das formações — consumida pelo site estático `ilm.com.br`.
 *
 * Duas regras que valem para tudo aqui:
 *
 * 1. **Nada de número de venda.** Nem `vagas`, nem vendidas, nem receita. O selo é o
 *    único derivado que sai. O endpoint atual do site (`functions/api/turmas.ts`)
 *    omite isso de propósito e a migração mantém.
 * 2. **Só produção conta.** Vendas de sandbox convivem na mesma tabela; contá-las
 *    fecharia turma de verdade com pagamento de teste.
 */
@Injectable()
export class PublicoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `10000` → `'R$ 100,00'`, `500000` → `'R$ 5.000,00'`.
   *
   * Formatado à mão em vez de `Intl.NumberFormat` porque o ICU insere espaço
   * não-quebrável (U+00A0) depois do `R$`, e o site espera espaço comum — ver o
   * campo `preco` em `siteilm/src/data/formacoes.ts`.
   */
  private formatarPreco(centavos: number): string {
    const reais = Math.floor(centavos / 100);
    const cents = centavos % 100;
    return `R$ ${reais.toLocaleString('pt-BR')},${String(cents).padStart(2, '0')}`;
  }

  /** Vagas confirmadas por evento, só produção. Nunca sai na resposta — só aperta o selo. */
  private async vendidasPorEvento(eventoIds: string[]): Promise<Map<string, number>> {
    if (eventoIds.length === 0) return new Map();

    const agregado = await this.prisma.formacao_venda.groupBy({
      by: ['evento_id'],
      where: {
        status: 'confirmada',
        ambiente: 'producao',
        evento_id: { in: eventoIds },
      },
      _sum: { vagas: true },
    });

    return new Map(
      agregado
        .filter((a) => a.evento_id !== null)
        .map((a) => [a.evento_id as string, a._sum.vagas ?? 0]),
    );
  }

  /**
   * Tudo que o build do site precisa para gerar o HTML das formações.
   *
   * O site commita isso como snapshot (`src/data/eventos.json`) em vez de chamar a API
   * no build: se o Fly estiver fora na hora do deploy, o build não pode quebrar nem
   * publicar página vazia.
   */
  async eventos() {
    const eventos = await this.prisma.formacao_evento.findMany({
      where: { publicado: true },
      orderBy: [{ data: 'asc' }, { cidade: 'asc' }],
      include: { lotes: { orderBy: { ordem: 'asc' } } },
    });

    const vendidas = await this.vendidasPorEvento(eventos.map((e) => e.id));

    return {
      gerado_em: new Date().toISOString(),
      eventos: eventos.map((evento) => ({
        slug: evento.slug,
        cidade: evento.cidade,
        data: soData(evento.data),
        local: evento.local,
        endereco: evento.endereco,
        comoChegar: evento.como_chegar,
        status: statusDoEvento(evento, vendidas.get(evento.id) ?? 0),
        // Aditivo: o site já encerra turma pela data, no build e no navegador. Sai aqui
        // para quem consome a API direto não precisar refazer a conta de fuso.
        realizado: eventoRealizado(evento.data),
        lotes: evento.lotes
          // Sem link não há o que renderizar num card de compra. Lote invisível ou
          // ainda sem checkout criado simplesmente não existe para o site.
          .filter((lote) => lote.visivel_no_site && lote.checkout_url)
          .map((lote) => ({
            nome: lote.nome,
            preco: this.formatarPreco(lote.preco_centavos),
            ate: soData(lote.ate),
            link: lote.checkout_url as string,
          })),
      })),
    };
  }

  /**
   * Só o selo, para a página corrigir em runtime o que mudou desde o último deploy.
   *
   * Devolve apenas eventos com capacidade definida: sem `vagas`, o selo nunca muda
   * sozinho, e mandá-lo aqui só faria a página reescrever o que já veio do build.
   */
  async status(): Promise<{ turmas: Array<{ slug: string; status: StatusFormacao }> }> {
    const eventos = await this.prisma.formacao_evento.findMany({
      where: { publicado: true, vagas: { not: null } },
      // `data` entra no select porque o selo depende dela: turma realizada sai como
      // esgotada mesmo com vaga sobrando.
      select: { id: true, slug: true, vagas: true, status_manual: true, data: true },
    });

    const vendidas = await this.vendidasPorEvento(eventos.map((e) => e.id));

    return {
      turmas: eventos.map((evento) => ({
        slug: evento.slug,
        status: statusDoEvento(evento, vendidas.get(evento.id) ?? 0),
      })),
    };
  }
}
