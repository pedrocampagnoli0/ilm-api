import {
  extrairCelular,
  extrairCpf,
  loteDaReferencia,
  texto,
  valorLiquido,
} from './extrair.js';

describe('valorLiquido', () => {
  it('desconta os juros do parcelamento — o caso real de 20/08/2026', () => {
    // R$ 100,00 em 10x chegou como 12018, com 2018 de juros do comprador.
    expect(
      valorLiquido({
        value: 12018,
        fees: { buyer: { interest: { total: 2018 } } },
      }),
    ).toBe(10000);
  });

  it('à vista, devolve o valor cru', () => {
    expect(valorLiquido({ value: 10000 })).toBe(10000);
  });

  it('sem valor, devolve null', () => {
    expect(valorLiquido(undefined)).toBeNull();
    expect(valorLiquido({})).toBeNull();
  });

  it('juros absurdos não geram negativo (quebraria o CHECK da coluna)', () => {
    expect(
      valorLiquido({ value: 100, fees: { buyer: { interest: { total: 9999 } } } }),
    ).toBe(100);
  });
});

describe('extrairCelular', () => {
  it('aceita `phones` (array), a forma das notificações de pagamento', () => {
    expect(
      extrairCelular({
        phones: [{ country: 55, area: 62, number: 999998888, type: 'MOBILE' }],
      }),
    ).toBe('+5562999998888');
  });

  it('aceita `phone` (objeto), a forma da notificação de checkout', () => {
    expect(
      extrairCelular({ phone: { country: 55, area: 11, number: 988887777 } }),
    ).toBe('+5511988887777');
  });

  it('prefere o MOBILE quando há mais de um', () => {
    expect(
      extrairCelular({
        phones: [
          { country: 55, area: 62, number: 32334444, type: 'HOME' },
          { country: 55, area: 62, number: 999998888, type: 'MOBILE' },
        ],
      }),
    ).toBe('+5562999998888');
  });

  it('assume 55 quando o país não vem', () => {
    expect(extrairCelular({ phone: { area: 62, number: 999998888 } })).toBe(
      '+5562999998888',
    );
  });

  it('null quando não há telefone', () => {
    expect(extrairCelular(undefined)).toBeNull();
    expect(extrairCelular({})).toBeNull();
    expect(extrairCelular({ phones: [] })).toBeNull();
  });
});

describe('extrairCpf', () => {
  it('tira a máscara', () => {
    expect(extrairCpf({ tax_id: '123.456.789-09' })).toBe('12345678909');
  });

  it('aceita CNPJ', () => {
    expect(extrairCpf({ tax_id: '12345678000199' })).toBe('12345678000199');
  });

  it('recusa tamanho inválido em vez de gravar lixo', () => {
    expect(extrairCpf({ tax_id: '123' })).toBeNull();
    expect(extrairCpf({ tax_id: '' })).toBeNull();
    expect(extrairCpf(undefined)).toBeNull();
  });
});

describe('loteDaReferencia', () => {
  const uuid = '98bdcb77-59be-4ace-9796-2465fc09720d';

  it('extrai o uuid de `lote:<uuid>`', () => {
    expect(loteDaReferencia(`lote:${uuid}`)).toBe(uuid);
  });

  it('tolera sufixo depois de |', () => {
    expect(loteDaReferencia(`lote:${uuid}|qualquer`)).toBe(uuid);
  });

  it('recusa o formato antigo `turma:<slug>` e lixo', () => {
    expect(loteDaReferencia('turma:goiania-2026-10-03')).toBeNull();
    expect(loteDaReferencia('lote:nao-e-uuid')).toBeNull();
    expect(loteDaReferencia(null)).toBeNull();
    expect(loteDaReferencia(123)).toBeNull();
  });
});

describe('texto', () => {
  it('apara e limita', () => {
    expect(texto('  Maria Silva  ')).toBe('Maria Silva');
    expect(texto('a'.repeat(300))).toHaveLength(255);
  });

  it('vazio vira null', () => {
    expect(texto('   ')).toBeNull();
    expect(texto(undefined)).toBeNull();
    expect(texto(42)).toBeNull();
  });
});
