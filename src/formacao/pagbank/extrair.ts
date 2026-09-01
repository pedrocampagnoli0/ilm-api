import type { PagbankCliente, PagbankCobranca, PagbankValor } from './tipos.js';

/**
 * Valor da venda em centavos, **sem os juros do parcelamento**.
 *
 * `amount.value` NÃO é o preço do lote: quando o comprador parcela, o PagBank soma os
 * juros que ele pagou. Um lote de R$ 100,00 em 10x chega como `12018`, com os R$ 20,18
 * em `fees.buyer.interest.total`. Guardar o número cru inflaria o faturamento por turma
 * com dinheiro que nunca foi do ILM.
 *
 * Isso não está documentado em lugar nenhum do PagBank — apareceu só porque o pagamento
 * de teste de 20/08/2026 foi parcelado. Se tivesse sido à vista, teria ido para produção
 * sem ninguém notar.
 */
export function valorLiquido(amount: PagbankValor | undefined): number | null {
  const bruto = amount?.value;
  if (typeof bruto !== 'number') return null;

  const juros = amount?.fees?.buyer?.interest?.total;
  const liquido = bruto - (typeof juros === 'number' ? juros : 0);

  // Juros maiores que o valor seria payload corrompido; melhor gravar o bruto do que
  // um negativo que quebraria o CHECK da coluna.
  return liquido >= 0 ? liquido : bruto;
}

/**
 * Telefone em formato único, a partir das duas formas que o PagBank usa: `phone`
 * (objeto) na notificação de checkout e `phones` (array) nas de pagamento.
 *
 * Devolve algo como `+5562999998888`. Não é garantidamente um WhatsApp — é o telefone
 * informado na compra; `type: MOBILE` só diz que é celular.
 */
export function extrairCelular(cliente: PagbankCliente | undefined): string | null {
  const candidatos = [
    ...(Array.isArray(cliente?.phones) ? cliente.phones : []),
    ...(cliente?.phone ? [cliente.phone] : []),
  ];
  if (candidatos.length === 0) return null;

  // Prefere o celular; sem MOBILE, fica o primeiro que veio.
  const escolhido =
    candidatos.find((t) => String(t?.type ?? '').toUpperCase() === 'MOBILE') ??
    candidatos[0];

  const digitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');
  const pais = digitos(escolhido?.country) || '55';
  const ddd = digitos(escolhido?.area);
  const numero = digitos(escolhido?.number);

  if (!numero) return null;
  return `+${pais}${ddd}${numero}`;
}

/** `customer.tax_id` só com dígitos; null se não tiver 11 (CPF) ou 14 (CNPJ). */
export function extrairCpf(cliente: PagbankCliente | undefined): string | null {
  const digitos = String(cliente?.tax_id ?? '').replace(/\D/g, '');
  return digitos.length === 11 || digitos.length === 14 ? digitos : null;
}

/**
 * Meio de pagamento no vocabulário do portal.
 *
 * O mesmo conjunto de valores que o sync legado grava (`pix`, `credito`, `boleto`,
 * `debito`, `saldo`, `outro`) — sem isso, o painel de insights teria duas taxonomias
 * para a mesma coluna, uma por origem, e nenhum gráfico fecharia.
 */
export function metodoDaCobranca(cobranca: PagbankCobranca | undefined): string | null {
  switch (String(cobranca?.payment_method?.type ?? '').toUpperCase()) {
    case 'CREDIT_CARD':
      return 'credito';
    case 'DEBIT_CARD':
      return 'debito';
    case 'PIX':
      return 'pix';
    case 'BOLETO':
      return 'boleto';
    case '':
      return null;
    default:
      return 'outro';
  }
}

/** Momento do pagamento; `null` quando a data não veio ou veio ilegível. */
export function pagoEm(cobranca: PagbankCobranca | undefined): Date | null {
  const iso = cobranca?.paid_at ?? cobranca?.created_at;
  if (typeof iso !== 'string') return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Texto do payload, aparado e limitado; null quando vazio. */
export function texto(valor: unknown, max = 255): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo ? limpo.slice(0, max) : null;
}

/**
 * Extrai o UUID de um `reference_id` no formato `lote:<uuid>`.
 *
 * Substitui o parsing de `turma:<slug>` do site: com banco próprio, o webhook faz
 * lookup do lote e daí tira evento, vagas e preço esperado. Sem semântica codificada em
 * string, e mudar o slug do evento não quebra vendas antigas.
 */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function loteDaReferencia(referencia: unknown): string | null {
  if (typeof referencia !== 'string') return null;
  if (!referencia.startsWith('lote:')) return null;

  // Corta em '|' para tolerar sufixos futuros sem quebrar.
  const candidato = referencia.slice('lote:'.length).split('|')[0].trim();
  return UUID.test(candidato) ? candidato.toLowerCase() : null;
}
