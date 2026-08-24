import { serializarEvento, serializarLote, soData } from './datas.js';

describe('soData', () => {
  it('devolve só a data, sem hora', () => {
    expect(soData(new Date('2026-10-03T00:00:00.000Z'))).toBe('2026-10-03');
  });

  it('não escorrega de dia por causa do fuso', () => {
    // A coluna é `date` pura: o Prisma devolve meia-noite UTC. Formatar em fuso local
    // com getDate() daria 02/10 no Brasil (UTC-3).
    expect(soData(new Date('2026-10-03T00:00:00.000Z'))).toBe('2026-10-03');
    expect(soData(new Date(Date.UTC(2026, 0, 1)))).toBe('2026-01-01');
  });

  it('null passa como null', () => {
    expect(soData(null)).toBeNull();
    expect(soData(undefined)).toBeNull();
  });
});

describe('serializarLote', () => {
  it('converte `ate` e preserva o resto', () => {
    const lote = {
      id: 'l-1',
      nome: '1º lote',
      preco_centavos: 10000,
      ate: new Date('2026-08-23T00:00:00.000Z'),
    };

    const r = serializarLote(lote);

    expect(r.ate).toBe('2026-08-23');
    expect(r.id).toBe('l-1');
    expect(r.preco_centavos).toBe(10000);
  });
});

describe('serializarEvento', () => {
  const evento = {
    id: 'e-1',
    slug: 'goiania-2026-10-03',
    data: new Date('2026-10-03T00:00:00.000Z'),
    lotes: [
      { id: 'l-1', ate: new Date('2026-08-23T00:00:00.000Z') },
      { id: 'l-2', ate: new Date('2026-09-03T00:00:00.000Z') },
    ],
  };

  it('converte a data do evento e a de cada lote', () => {
    const r = serializarEvento(evento);

    expect(r.data).toBe('2026-10-03');
    expect(r.lotes.map((l) => l.ate)).toEqual(['2026-08-23', '2026-09-03']);
  });

  it('funciona sem lotes carregados', () => {
    const r = serializarEvento({ id: 'e-1', data: new Date('2026-10-03T00:00:00.000Z') });
    expect(r.data).toBe('2026-10-03');
  });

  /**
   * O bug que motivou este módulo: a superfície admin devolvia ISO completo e a pública
   * devolvia só a data. O dashboard concatenava `T12:00:00` e produzia `Invalid Date`.
   */
  it('o formato bate com o que a superfície pública entrega', () => {
    const admin = serializarEvento(evento);
    const publico = soData(evento.data);

    expect(admin.data).toBe(publico);
    expect(admin.data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(admin.data).not.toContain('T');
  });
});
