import {
  classificarStatus,
  codigoPagAe,
  lerBusca,
  lerTransacao,
  metodoDoTipo,
  reaisParaCentavos,
} from './parse.js';

// Recorte real de `/v3/transactions/{code}` (24/08/2026), com os dados trocados.
// Mantido literal de propósito: é o contrato de verdade da API antiga, incluindo o
// `<items>` fora de ordem e a taxa dentro de `<creditorFees>`.
const DETALHE = `<?xml version="1.0" encoding="ISO-8859-1" standalone="yes"?>
<transaction><date>2026-04-14T13:25:51.000-03:00</date>
<code>DD29CA4A-663E-46F8-A2B8-1573963B3039</code>
<reference>LINK_PAGAE=81DswvwcH</reference><type>1</type><status>4</status>
<paymentMethod><type>11</type><code>402</code></paymentMethod>
<grossAmount>100.00</grossAmount><discountAmount>0.00</discountAmount>
<creditorFees><intermediationRateAmount>0.00</intermediationRateAmount>
<intermediationFeeAmount>1.89</intermediationFeeAmount></creditorFees>
<netAmount>98.11</netAmount><installmentCount>1</installmentCount><itemCount>1</itemCount>
<items><item><id>AUTO_ID 0</id><description>São Paulo lote 1</description>
<quantity>1</quantity><amount>100.00</amount></item></items>
<sender><name>Fulana de Tal</name><email>fulana@exemplo.com.br</email>
<phone><areaCode>11</areaCode><number>970000000</number></phone></sender>
</transaction>`;

const BUSCA = `<?xml version="1.0" encoding="ISO-8859-1" standalone="yes"?>
<transactionSearchResult><date>2026-08-24T13:13:50.000-03:00</date>
<resultsInThisPage>2</resultsInThisPage><totalPages>1</totalPages>
<transactions>
<transaction><date>2026-08-23T23:31:47.000-03:00</date><reference>LINK_PAGAE=823iNngga</reference>
<code>3CE82439-3730-4238-BE23-0990AA59EB11</code><type>1</type><status>4</status>
<paymentMethod><type>11</type></paymentMethod><grossAmount>100.00</grossAmount>
<feeAmount>1.89</feeAmount><netAmount>98.11</netAmount></transaction>
<transaction><date>2026-08-20T10:00:00.000-03:00</date><reference>LINK_PAGAE=823iNngga</reference>
<code>AAAA1111-0000-0000-0000-000000000000</code><type>1</type><status>1</status>
<paymentMethod><type>2</type></paymentMethod><grossAmount>130.00</grossAmount>
<feeAmount>0.00</feeAmount><netAmount>130.00</netAmount></transaction>
</transactions></transactionSearchResult>`;

describe('classificarStatus', () => {
  it('conta como venda só o que virou dinheiro (3 paga, 4 disponível)', () => {
    expect(classificarStatus('3')).toBe('confirmada');
    expect(classificarStatus('4')).toBe('confirmada');
  });

  it('devolve a vaga em devolução, cancelamento e débito', () => {
    expect(classificarStatus('6')).toBe('cancelada');
    expect(classificarStatus('7')).toBe('cancelada');
    expect(classificarStatus('8')).toBe('cancelada');
  });

  it('NÃO mexe na vaga em boleto aguardando — mais da metade nunca é pago', () => {
    expect(classificarStatus('1')).toBeNull();
    expect(classificarStatus('2')).toBeNull();
  });

  it('disputa e retenção não são cancelamento: o dinheiro entrou', () => {
    expect(classificarStatus('5')).toBeNull();
    expect(classificarStatus('9')).toBeNull();
  });
});

describe('reaisParaCentavos', () => {
  it('converte sem passar por float', () => {
    expect(reaisParaCentavos('100.00')).toBe(10000);
    expect(reaisParaCentavos('1.05')).toBe(105);
    expect(reaisParaCentavos('0.01')).toBe(1);
    expect(reaisParaCentavos('1800.00')).toBe(180000);
  });

  it('aceita vírgula e valor sem centavos', () => {
    expect(reaisParaCentavos('26,50')).toBe(2650);
    expect(reaisParaCentavos('130')).toBe(13000);
  });

  it('devolve null para lixo', () => {
    expect(reaisParaCentavos('')).toBeNull();
    expect(reaisParaCentavos(null)).toBeNull();
    expect(reaisParaCentavos('R$ 100')).toBeNull();
  });
});

describe('metodoDoTipo', () => {
  it('mapeia os tipos que a conta usa', () => {
    expect(metodoDoTipo('11')).toBe('pix');
    expect(metodoDoTipo('1')).toBe('credito');
    expect(metodoDoTipo('2')).toBe('boleto');
    expect(metodoDoTipo('3')).toBe('debito');
    expect(metodoDoTipo('4')).toBe('saldo');
  });

  it('tipo desconhecido vira "outro", ausente vira null', () => {
    expect(metodoDoTipo('99')).toBe('outro');
    expect(metodoDoTipo(null)).toBeNull();
  });
});

describe('lerTransacao', () => {
  const t = lerTransacao(DETALHE)!;

  it('lê os campos que viram venda', () => {
    expect(t.codigo).toBe('DD29CA4A-663E-46F8-A2B8-1573963B3039');
    expect(t.referencia).toBe('LINK_PAGAE=81DswvwcH');
    expect(t.status).toBe('4');
    expect(t.metodo).toBe('pix');
    expect(t.parcelas).toBe(1);
  });

  it('pega a taxa de dentro de creditorFees', () => {
    expect(t.taxaCentavos).toBe(189);
  });

  it('usa o item, não o bruto — no parcelado o bruto traz os juros do comprador', () => {
    expect(t.itensCentavos).toBe(10000);
    expect(t.brutoCentavos).toBe(10000);
  });

  it('traz o comprador e monta o celular com o DDD', () => {
    expect(t.nome).toBe('Fulana de Tal');
    expect(t.email).toBe('fulana@exemplo.com.br');
    expect(t.celular).toBe('+5511970000000');
  });

  it('guarda a descrição do item — é o que identifica a turma', () => {
    expect(t.descricao).toBe('São Paulo lote 1');
  });

  it('não inventa CPF quando o remetente não manda documento', () => {
    expect(t.cpf).toBeNull();
  });
});

describe('lerBusca', () => {
  const lista = lerBusca(BUSCA);

  it('lê todas as transações da página', () => {
    expect(lista).toHaveLength(2);
  });

  it('soma quantidade × valor unitário quando há itens, e cai no bruto quando não há', () => {
    // A busca não traz <items>: sobra o grossAmount.
    expect(lista[0].itensCentavos).toBeNull();
    expect(lista[0].brutoCentavos).toBe(10000);
  });

  it('preserva o status para o chamador decidir — o boleto pendente continua "1"', () => {
    expect(lista[1].status).toBe('1');
    expect(classificarStatus(lista[1].status)).toBeNull();
  });
});

describe('codigoPagAe', () => {
  it('extrai o código do link do painel', () => {
    expect(codigoPagAe('https://pag.ae/81DsGV19n')).toBe('81DsGV19n');
    expect(codigoPagAe('https://pag.ae/823iNngga/')).toBe('823iNngga');
    expect(codigoPagAe('  http://www.pag.ae/81Vu_dqem  ')).toBe('81Vu_dqem');
  });

  it('ignora o que não é pag.ae — checkout novo não existe na API antiga', () => {
    expect(codigoPagAe('https://pagamento.pagbank.com.br/pagamento?code=abc')).toBeNull();
    expect(codigoPagAe('https://pagamento.sandbox.pagbank.com.br/x')).toBeNull();
    expect(codigoPagAe(null)).toBeNull();
    expect(codigoPagAe('')).toBeNull();
  });
});
