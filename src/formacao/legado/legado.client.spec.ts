import { ConfigService } from '@nestjs/config';
import { formatarDataBusca, PagbankLegadoClient } from './legado.client.js';

describe('formatarDataBusca', () => {
  it('converte UTC para horário de Brasília', () => {
    expect(formatarDataBusca(new Date('2026-09-21T14:52:00Z'))).toBe('2026-09-21T11:52');
  });

  it('atravessa a meia-noite para o dia anterior', () => {
    // 02:30 UTC ainda é 23:30 de ontem em Brasília.
    expect(formatarDataBusca(new Date('2026-09-21T02:30:00Z'))).toBe('2026-09-20T23:30');
  });

  it('trunca os segundos', () => {
    expect(formatarDataBusca(new Date('2026-09-21T14:52:59Z'))).toBe('2026-09-21T11:52');
  });
});

describe('PagbankLegadoClient.porPeriodo', () => {
  const VAZIA = `<?xml version="1.0" encoding="ISO-8859-1" standalone="yes"?>
<transactionSearchResult><date>2026-09-21T11:52:53.000-03:00</date>
<resultsInThisPage>0</resultsInThisPage><currentPage>1</currentPage><totalPages>1</totalPages>
</transactionSearchResult>`;

  const config = {
    get: (chave: string) =>
      ({
        PAGBANK_EMAIL: 'conta@exemplo.com.br',
        PAGBANK_TOKEN: 'token-de-teste',
        PAGBANK_AMBIENTE: 'producao',
      })[chave],
  } as unknown as ConfigService;

  afterEach(() => jest.restoreAllMocks());

  it('manda initialDate e finalDate em horário de Brasília, não em UTC', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(VAZIA, { status: 200 }));

    await new PagbankLegadoClient(config).porPeriodo(
      new Date('2026-09-14T14:52:00Z'),
      new Date('2026-09-21T14:52:00Z'),
    );

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    // Em UTC a data final ficaria 3 horas no futuro e a API recusa com 400 / 13009.
    expect(url.searchParams.get('initialDate')).toBe('2026-09-14T11:52');
    expect(url.searchParams.get('finalDate')).toBe('2026-09-21T11:52');
  });
});
