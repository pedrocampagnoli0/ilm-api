/**
 * Leitura do XML da API legada do PagSeguro (`ws.pagseguro.uol.com.br`).
 *
 * Por que existe: a API de Checkout v4 está bloqueada em produção
 * (`allowlist_access_required`), e as turmas que já vendem usam links `pag.ae` criados à
 * mão no painel — que não carregam `reference_id` de lote e nunca notificam o webhook.
 * A API antiga, com o MESMO token, responde `?reference=LINK_PAGAE=<código>` e devolve o
 * histórico inteiro daquele link, sem janela de data. É o que liga a venda à turma:
 * o código do link já está em `formacao_lote.checkout_url`.
 *
 * Regex em vez de parser de XML de propósito. O payload é raso, os campos que
 * interessam são únicos por transação, e trazer uma dependência de XML para ler oito
 * tags custaria mais do que resolve. O que NÃO dá para relaxar é o encoding: a resposta
 * é ISO-8859-1, e ler como UTF-8 transforma "São Luís" em lixo — quem decodifica é o
 * cliente, com `latin1`.
 */

/** Estados do PagSeguro clássico. Só 3 e 4 significam dinheiro na conta. */
export const STATUS_LEGADO: Record<string, string> = {
  '1': 'aguardando pagamento',
  '2': 'em análise',
  '3': 'paga',
  '4': 'disponível',
  '5': 'em disputa',
  '6': 'devolvida',
  '7': 'cancelada',
  '8': 'debitado',
  '9': 'retenção temporária',
};

/**
 * Traduz o status do PagSeguro para o do portal.
 *
 * `null` é "não mexe na vaga", e é o caso mais comum de todos: boleto emitido e não
 * pago fica em `1` para sempre. Contar isso como venda encheria turma com quem nunca
 * pagou — mais da metade dos boletos desta conta nunca virou pagamento.
 *
 * `5` (disputa) e `9` (retenção) também não mexem: o dinheiro entrou, a vaga já foi
 * contada quando passou por `3`, e uma disputa em aberto não é cancelamento.
 */
export function classificarStatus(status: string): 'confirmada' | 'cancelada' | null {
  if (status === '3' || status === '4') return 'confirmada';
  if (status === '6' || status === '7' || status === '8') return 'cancelada';
  return null;
}

/** `paymentMethod.type` do legado → vocabulário do portal. */
export function metodoDoTipo(tipo: string | null): string | null {
  switch (tipo) {
    case '1':
      return 'credito';
    case '2':
      return 'boleto';
    case '3':
    case '13':
      return 'debito';
    case '4':
      return 'saldo';
    case '11':
      return 'pix';
    case null:
    case undefined:
      return null;
    default:
      return 'outro';
  }
}

/**
 * `'130.00'` → `13000`.
 *
 * Aritmética em string porque `Math.round(parseFloat(v) * 100)` erra em valores que o
 * binário não representa — o clássico `1.005 * 100 = 100.49999`. Aqui o formato é
 * sempre `\d+\.\d{2}`, então basta juntar as duas metades.
 */
export function reaisParaCentavos(valor: string | null | undefined): number | null {
  if (!valor) return null;
  const m = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(valor.trim());
  if (!m) return null;
  const centavos = (m[2] ?? '0').padEnd(2, '0');
  return Number(m[1]) * 100 + Number(centavos);
}

/** Primeira ocorrência de `<tag>…</tag>`, com as entidades XML desfeitas. */
export function tag(xml: string, nome: string): string | null {
  const m = new RegExp(`<${nome}>([\\s\\S]*?)</${nome}>`).exec(xml);
  if (!m) return null;
  const v = m[1]
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
  return v || null;
}

/** Bloco `<nome>…</nome>` inteiro, para buscar dentro dele sem pegar campo de fora. */
function bloco(xml: string, nome: string): string {
  return new RegExp(`<${nome}>([\\s\\S]*?)</${nome}>`).exec(xml)?.[1] ?? '';
}

export interface TransacaoLegada {
  /** `code` do PagSeguro — vira o `cobranca_id` da venda. */
  codigo: string;
  /** ISO do momento do pagamento. */
  data: string | null;
  /** `LINK_PAGAE=<código>` nos links do painel. */
  referencia: string | null;
  status: string;
  /** Bruto cobrado, incluindo juros de parcelamento pagos pelo comprador. */
  brutoCentavos: number | null;
  /** Soma dos itens: o preço do lote, sem os juros. */
  itensCentavos: number | null;
  taxaCentavos: number | null;
  metodo: string | null;
  parcelas: number | null;
  descricao: string | null;
  nome: string | null;
  email: string | null;
  celular: string | null;
  cpf: string | null;
}

/** Uma `<transaction>` — serve tanto para o resultado de busca quanto para o detalhe. */
export function lerTransacao(xml: string): TransacaoLegada | null {
  const codigo = tag(xml, 'code');
  if (!codigo) return null;

  const metodoXml = bloco(xml, 'paymentMethod');
  const remetente = bloco(xml, 'sender');
  const itens = bloco(xml, 'items');

  // A taxa aparece com dois nomes: `feeAmount` na busca, `intermediationFeeAmount`
  // dentro de `creditorFees` no detalhe.
  const taxa =
    tag(xml, 'feeAmount') ??
    tag(bloco(xml, 'creditorFees'), 'intermediationFeeAmount');

  let itensCentavos: number | null = null;
  for (const item of itens.match(/<item>[\s\S]*?<\/item>/g) ?? []) {
    const unitario = reaisParaCentavos(tag(item, 'amount'));
    if (unitario === null) continue;
    const qtd = Number(tag(item, 'quantity') ?? '1') || 1;
    itensCentavos = (itensCentavos ?? 0) + unitario * qtd;
  }

  const ddd = tag(bloco(remetente, 'phone'), 'areaCode');
  const numero = tag(bloco(remetente, 'phone'), 'number');

  const documentos = bloco(remetente, 'documents');
  const cpf = (tag(documentos, 'value') ?? '').replace(/\D/g, '');

  return {
    codigo,
    data: tag(xml, 'date'),
    referencia: tag(xml, 'reference'),
    status: tag(xml, 'status') ?? '',
    brutoCentavos: reaisParaCentavos(tag(xml, 'grossAmount')),
    itensCentavos,
    taxaCentavos: reaisParaCentavos(taxa),
    metodo: metodoDoTipo(tag(metodoXml, 'type')),
    parcelas: Number(tag(xml, 'installmentCount') ?? '') || null,
    descricao: tag(itens, 'description'),
    nome: tag(remetente, 'name'),
    email: tag(remetente, 'email'),
    celular: numero ? `+55${ddd ?? ''}${numero}`.replace(/\s/g, '') : null,
    cpf: cpf.length === 11 || cpf.length === 14 ? cpf : null,
  };
}

/** Todas as `<transaction>` de um `<transactionSearchResult>`. */
export function lerBusca(xml: string): TransacaoLegada[] {
  const blocos = xml.match(/<transaction>[\s\S]*?<\/transaction>/g) ?? [];
  return blocos
    .map(lerTransacao)
    .filter((t): t is TransacaoLegada => t !== null);
}

/**
 * Extrai o código do link a partir da URL guardada no lote.
 *
 * `https://pag.ae/81DsGV19n` → `81DsGV19n`. Aceita barra final e query, e devolve
 * `null` para qualquer coisa que não seja `pag.ae` — checkout novo (`CHEC_...`) e link
 * de sandbox não têm transação na API antiga.
 */
export function codigoPagAe(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /(?:^|\/\/)(?:www\.)?pag\.ae\/([A-Za-z0-9_\-]+)/.exec(url.trim());
  return m ? m[1] : null;
}

/** O `reference` que a API legada usa para os links do painel. */
export function referenciaDoCodigo(codigo: string): string {
  return `LINK_PAGAE=${codigo}`;
}
