import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lerBusca, lerTransacao, type TransacaoLegada } from './parse.js';

const BASES = {
  sandbox: 'https://ws.sandbox.pagseguro.uol.com.br',
  producao: 'https://ws.pagseguro.uol.com.br',
} as const;

/** Teto por página da busca legada. Nenhum link nosso chega perto disso. */
const POR_PAGINA = 1000;

/** O host antigo é lento e responde em rajada; sem folga entre chamadas ele corta. */
const PAUSA_MS = 250;

const TIMEOUT_MS = 45_000;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Cliente da API de transações do PagSeguro clássico.
 *
 * Autenticação é `email` + `token` na query string — o esquema antigo, sem Bearer. O
 * token é o MESMO da API v4 (`PAGBANK_TOKEN`); o que falta é o e-mail da conta, em
 * `PAGBANK_EMAIL`. Sem ele o serviço não sobe o sync, e diz por quê.
 *
 * Esta API é declaradamente legada no PagBank. Ela é usada aqui como ponte enquanto a
 * allowlist do Checkout não sai, não como fundação: o dia em que ela cair, o sync para
 * e o webhook continua — por isso nada mais no portal depende dela.
 */
@Injectable()
export class PagbankLegadoClient {
  private readonly logger = new Logger(PagbankLegadoClient.name);

  constructor(private readonly config: ConfigService) {}

  get configurado(): boolean {
    return Boolean(
      this.config.get<string>('PAGBANK_TOKEN') &&
        this.config.get<string>('PAGBANK_EMAIL'),
    );
  }

  private get base(): string {
    const v = this.config.get<string>('PAGBANK_AMBIENTE') ?? 'sandbox';
    return v === 'producao' ? BASES.producao : BASES.sandbox;
  }

  private credenciais(): URLSearchParams {
    const email = this.config.get<string>('PAGBANK_EMAIL');
    const token = this.config.get<string>('PAGBANK_TOKEN');
    if (!email || !token) {
      throw new ServiceUnavailableException(
        'PAGBANK_EMAIL e PAGBANK_TOKEN são necessários para ler a API legada do PagBank.',
      );
    }
    return new URLSearchParams({ email, token });
  }

  /**
   * GET que devolve o XML já em texto legível.
   *
   * `latin1` não é detalhe: a resposta é ISO-8859-1 e o `fetch().text()` assume UTF-8,
   * o que corrompe todo acento — "São Luís" viraria "S?o Lu?s" no nome do inscrito.
   */
  private async buscarXml(caminho: string, params: URLSearchParams): Promise<string> {
    const url = `${this.base}${caminho}?${params.toString()}`;

    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      try {
        // Sem `Accept`. Não é descuido: `accept: application/xml` (e `text/xml`) faz esta
        // API responder 406 Not Acceptable, embora o corpo que ela devolve seja XML.
        // Verificado contra a conta real em 24/08/2026 — com `*/*` ou sem o header, 200.
        const resposta = await fetch(url, {
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });

        if (resposta.status === 401 || resposta.status === 403) {
          // Credencial errada não melhora com retry.
          throw new ServiceUnavailableException(
            `PagBank legado recusou as credenciais (${resposta.status}). Conferir PAGBANK_EMAIL e PAGBANK_TOKEN.`,
          );
        }
        if (!resposta.ok) {
          throw new Error(`HTTP ${resposta.status}`);
        }

        const bytes = Buffer.from(await resposta.arrayBuffer());
        return bytes.toString('latin1');
      } catch (e) {
        if (e instanceof ServiceUnavailableException) throw e;
        if (tentativa === 3) {
          throw new ServiceUnavailableException(
            `PagBank legado não respondeu em ${caminho}: ${(e as Error).message}`,
          );
        }
        await dormir(PAUSA_MS * tentativa * 4);
      }
    }

    /* istanbul ignore next — inalcançável: o laço acima sempre retorna ou lança. */
    throw new ServiceUnavailableException('PagBank legado indisponível');
  }

  /**
   * Histórico completo de um link, sem janela de data.
   *
   * É o que torna este caminho viável: a busca por período é limitada a 30 dias por
   * chamada e a 6 meses de retroatividade, mas a busca por `reference` devolve tudo o
   * que aquele link já vendeu, de uma vez.
   */
  async porReferencia(referencia: string): Promise<TransacaoLegada[]> {
    const encontradas: TransacaoLegada[] = [];

    for (let pagina = 1; pagina <= 20; pagina++) {
      const params = this.credenciais();
      params.set('reference', referencia);
      params.set('maxPageResults', String(POR_PAGINA));
      params.set('page', String(pagina));

      const xml = await this.buscarXml('/v2/transactions', params);
      encontradas.push(...lerBusca(xml));

      const total = Number(/<totalPages>(\d+)<\/totalPages>/.exec(xml)?.[1] ?? '1');
      if (pagina >= total) break;
      await dormir(PAUSA_MS);
    }

    return encontradas;
  }

  /**
   * Transações de um intervalo.
   *
   * Só serve para descobrir links que o portal ainda não conhece — para contar vaga, a
   * busca por `reference` é melhor em tudo. Duas limitações da API mandam no uso:
   * a janela não pode passar de 30 dias, e ela só guarda cerca de 6 meses para trás
   * (fora disso, responde 400).
   */
  async porPeriodo(de: Date, ate: Date): Promise<TransacaoLegada[]> {
    const iso = (d: Date) => d.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm
    const encontradas: TransacaoLegada[] = [];

    for (let pagina = 1; pagina <= 20; pagina++) {
      const params = this.credenciais();
      params.set('initialDate', iso(de));
      params.set('finalDate', iso(ate));
      params.set('maxPageResults', String(POR_PAGINA));
      params.set('page', String(pagina));

      const xml = await this.buscarXml('/v2/transactions', params);
      encontradas.push(...lerBusca(xml));

      const total = Number(/<totalPages>(\d+)<\/totalPages>/.exec(xml)?.[1] ?? '1');
      if (pagina >= total) break;
      await dormir(PAUSA_MS);
    }

    return encontradas;
  }

  /**
   * Detalhe de uma transação: comprador, itens e taxa.
   *
   * A busca não traz nada disso — só valor e status. Por isso o sync só chama aqui para
   * transação nova ou que mudou de status, e não para as centenas que já estão gravadas.
   */
  async detalhe(codigo: string): Promise<TransacaoLegada | null> {
    const xml = await this.buscarXml(`/v3/transactions/${codigo}`, this.credenciais());
    await dormir(PAUSA_MS);
    return lerTransacao(xml);
  }
}
