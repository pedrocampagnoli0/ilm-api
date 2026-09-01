/**
 * Recortes do payload do PagBank que o portal usa.
 *
 * Deliberadamente parciais e tolerantes: só os campos que importam, todos opcionais. A
 * notificação chega de fora e não tem contrato versionado — tratar tudo como garantido
 * transforma mudança silenciosa deles em erro 500 nosso, e o PagBank não tem tela para
 * reenviar o que falhou.
 */

/** Estados de cobrança que movem venda. Ver a regra em WebhookService. */
export const STATUS_CONFIRMA = 'PAID';

/**
 * Cancelamento e estorno chegam os dois como CANCELED. DECLINED é recusa na origem.
 * `AUTHORIZED` NÃO entra: é valor reservado no cartão que ainda pode não ser capturado,
 * e contar isso venderia vaga que não existe.
 * `WAITING` e `IN_ANALYSIS` são passagem — a cobrança volta como PAID ou não volta.
 */
export const STATUS_CANCELA = new Set(['CANCELED', 'DECLINED']);

export interface PagbankTelefone {
  country?: number | string;
  area?: number | string;
  number?: number | string;
  type?: string;
}

export interface PagbankCliente {
  name?: string;
  email?: string;
  /** CPF (11) ou CNPJ (14). */
  tax_id?: string;
  /** Notificação de checkout manda objeto único… */
  phone?: PagbankTelefone;
  /** …e as de pagamento mandam array. As duas formas existem. */
  phones?: PagbankTelefone[];
}

export interface PagbankValor {
  value?: number;
  fees?: {
    buyer?: {
      interest?: {
        /** Juros que o COMPRADOR pagou pelo parcelamento — não é receita do ILM. */
        total?: number;
      };
    };
  };
}

export interface PagbankMeioPagamento {
  /** CREDIT_CARD | DEBIT_CARD | PIX | BOLETO */
  type?: string;
  installments?: number;
}

export interface PagbankCobranca {
  /** CHAR_... */
  id?: string;
  reference_id?: string;
  status?: string;
  amount?: PagbankValor;
  payment_method?: PagbankMeioPagamento;
  /** ISO do momento do pagamento; ausente enquanto a cobrança não foi paga. */
  paid_at?: string;
  created_at?: string;
}

export interface PagbankNotificacao {
  /** ORDE_... no pedido, CHEC_... na notificação de checkout. */
  id?: string;
  reference_id?: string;
  status?: string;
  customer?: PagbankCliente;
  charges?: PagbankCobranca[];
}

export interface PagbankCheckoutCriado {
  id?: string;
  status?: string;
  links?: Array<{ rel?: string; href?: string; method?: string }>;
}
