import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PagbankCheckoutCriado } from './tipos.js';

const BASES = {
  sandbox: 'https://sandbox.api.pagseguro.com',
  producao: 'https://api.pagseguro.com',
} as const;

export type AmbientePagbank = keyof typeof BASES;

/**
 * Cliente da API de Checkout do PagBank.
 *
 * Duas limitações da API deles moldam este serviço:
 *
 * 1. **Não existe cadastro central de webhook.** A URL de notificação vai dentro de
 *    cada checkout criado (`notification_urls` / `payment_notification_urls`), e não há
 *    endpoint para editar checkout. Se a URL mudar, TODOS os links precisam ser
 *    recriados. Por isso `PAGBANK_WEBHOOK_URL` é lida uma vez e usada em tudo.
 * 2. **Checkout não guarda quantidade máxima** e não recusa venda quando a turma lota.
 *    Quem conta vaga é o portal; a única defesa é inativar o link (ver `inativar`).
 */
@Injectable()
export class PagbankService {
  private readonly logger = new Logger(PagbankService.name);

  constructor(private readonly config: ConfigService) {}

  get ambiente(): AmbientePagbank {
    const v = this.config.get<string>('PAGBANK_AMBIENTE') ?? 'sandbox';
    return v === 'producao' ? 'producao' : 'sandbox';
  }

  private get base(): string {
    return BASES[this.ambiente];
  }

  private get token(): string {
    const token = this.config.get<string>('PAGBANK_TOKEN');
    if (!token) {
      this.logger.error('PAGBANK_TOKEN não configurado');
      throw new ServiceUnavailableException('PagBank não configurado');
    }
    return token;
  }

  private get webhookUrl(): string {
    const url = this.config.get<string>('PAGBANK_WEBHOOK_URL');
    if (!url) {
      this.logger.error('PAGBANK_WEBHOOK_URL não configurada');
      throw new ServiceUnavailableException('PagBank não configurado');
    }
    return url;
  }

  private async chamar<T>(
    caminho: string,
    init: RequestInit = {},
  ): Promise<T> {
    const resposta = await fetch(`${this.base}${caminho}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        accept: 'application/json',
        ...(init.headers ?? {}),
      },
    });

    const texto = await resposta.text();
    let corpo: unknown;
    try {
      corpo = texto ? JSON.parse(texto) : null;
    } catch {
      corpo = texto;
    }

    if (!resposta.ok) {
      // O PagBank devolve os erros de validação em `error_messages`, campo por campo:
      // logar o corpo inteiro vale mais que resumir, é o que diz qual campo recusou.
      this.logger.error(
        `PagBank ${resposta.status} em ${caminho}: ${JSON.stringify(corpo)}`,
      );
      throw new ServiceUnavailableException(
        `PagBank recusou a operação (${resposta.status})`,
      );
    }

    return corpo as T;
  }

  /**
   * Cria o checkout de um lote e devolve id e link de pagamento.
   *
   * `quantity: 1` com `unit_amount` = valor total é proposital, inclusive no pacote em
   * grupo: mandar `quantity: 50` deixaria o comprador alterar a quantidade na tela do
   * PagBank, e o total viraria outro. As vagas que a compra ocupa são do portal
   * (`vagas_por_compra`), não do PagBank.
   */
  async criarCheckout(params: {
    loteId: string;
    nome: string;
    precoCentavos: number;
    /** YYYY-MM-DD — o link para de vender sozinho no fim do lote. */
    ate: string;
  }): Promise<{ id: string; url: string | null }> {
    // O reference_id da cobrança tem precedência sobre o do pedido na hora de saber de
    // qual lote a venda é; carimbamos os dois com o mesmo valor.
    const referencia = `lote:${params.loteId}`;

    const criado = await this.chamar<PagbankCheckoutCriado>('/checkouts', {
      method: 'POST',
      body: JSON.stringify({
        reference_id: referencia,
        customer_modifiable: true,
        items: [
          {
            reference_id: referencia,
            name: params.nome.slice(0, 100),
            quantity: 1,
            unit_amount: params.precoCentavos,
          },
        ],
        payment_methods: [
          { type: 'CREDIT_CARD' },
          { type: 'DEBIT_CARD' },
          { type: 'PIX' },
          { type: 'BOLETO' },
        ],
        // Os dois: `notification_urls` avisa mudança do checkout (expiração),
        // `payment_notification_urls` avisa mudança da cobrança — que é o que conta vaga.
        notification_urls: [this.webhookUrl],
        payment_notification_urls: [this.webhookUrl],
        expiration_date: `${params.ate}T23:59:59-03:00`,
        soft_descriptor: 'ILM FORMACAO',
      }),
    });

    if (!criado?.id) {
      throw new ServiceUnavailableException(
        'PagBank não devolveu id do checkout',
      );
    }

    const pay = (criado.links ?? []).find((l) => l?.rel === 'PAY');
    return { id: criado.id, url: pay?.href ?? null };
  }

  /**
   * Inativa um checkout: o link para de vender.
   *
   * Usado em dois momentos — quando o admin apaga/reconfigura um lote, e
   * automaticamente quando uma venda zera as vagas do evento.
   */
  async inativar(checkoutId: string): Promise<void> {
    await this.chamar(`/checkouts/${checkoutId}/inactivate`, { method: 'POST' });
    this.logger.log(`checkout ${checkoutId} inativado`);
  }
}
