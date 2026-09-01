import {
  aperta,
  eventoRealizado,
  LIMIAR_ULTIMAS,
  statusDoEvento,
  vagasRestantes,
} from './status.js';

describe('aperta', () => {
  it('devolve o mais restritivo', () => {
    expect(aperta('abertas', 'ultimas')).toBe('ultimas');
    expect(aperta('ultimas', 'abertas')).toBe('ultimas');
    expect(aperta('esgotado', 'abertas')).toBe('esgotado');
    expect(aperta('abertas', 'abertas')).toBe('abertas');
  });
});

describe('statusDoEvento — regra de 30%', () => {
  it('mais de 30% das vagas livres → inscrições abertas', () => {
    // 100 vagas, 60 vendidas → 40% livres
    expect(statusDoEvento({ status_manual: null, vagas: 100 }, 60)).toBe('abertas');
    // exatamente acima do limiar: 31 de 100
    expect(statusDoEvento({ status_manual: null, vagas: 100 }, 69)).toBe('abertas');
  });

  it('30% ou menos → últimas vagas', () => {
    // exatamente 30% → já é "últimas"
    expect(statusDoEvento({ status_manual: null, vagas: 100 }, 70)).toBe('ultimas');
    expect(statusDoEvento({ status_manual: null, vagas: 100 }, 90)).toBe('ultimas');
    expect(statusDoEvento({ status_manual: null, vagas: 100 }, 99)).toBe('ultimas');
  });

  it('zero vagas livres → esgotado', () => {
    expect(statusDoEvento({ status_manual: null, vagas: 100 }, 100)).toBe('esgotado');
  });

  it('vendeu além da capacidade continua esgotado, não negativo', () => {
    expect(statusDoEvento({ status_manual: null, vagas: 50 }, 53)).toBe('esgotado');
  });

  it('o limiar é 30%', () => {
    expect(LIMIAR_ULTIMAS).toBe(0.3);
  });

  it('funciona com capacidades pequenas', () => {
    // 10 vagas: 3 livres = 30% → últimas; 4 livres = 40% → abertas
    expect(statusDoEvento({ status_manual: null, vagas: 10 }, 7)).toBe('ultimas');
    expect(statusDoEvento({ status_manual: null, vagas: 10 }, 6)).toBe('abertas');
  });

  it('com capacidade, o selo é SEMPRE automático — status_manual é ignorado', () => {
    // Admin marcou "esgotado" à mão, mas há 100% das vagas livres.
    expect(statusDoEvento({ status_manual: 'esgotado', vagas: 100 }, 0)).toBe('abertas');
    // E o contrário: marcou "abertas", mas lotou.
    expect(statusDoEvento({ status_manual: 'abertas', vagas: 100 }, 100)).toBe('esgotado');
  });

  describe('evento legado, sem capacidade', () => {
    it('vale o status_manual — não há denominador para o percentual', () => {
      expect(statusDoEvento({ status_manual: 'esgotado', vagas: null }, 0)).toBe('esgotado');
      expect(statusDoEvento({ status_manual: 'ultimas', vagas: null }, 0)).toBe('ultimas');
    });

    it('sem manual nenhum, cai em "abertas"', () => {
      expect(statusDoEvento({ status_manual: null, vagas: null })).toBe('abertas');
      expect(statusDoEvento({ status_manual: 'lixo', vagas: null })).toBe('abertas');
    });
  });
});

describe('vagasRestantes', () => {
  it('null quando não há capacidade definida', () => {
    expect(vagasRestantes({ vagas: null }, 10)).toBeNull();
  });

  it('nunca devolve negativo (overbooking)', () => {
    expect(vagasRestantes({ vagas: 50 }, 53)).toBe(0);
    expect(vagasRestantes({ vagas: 50 }, 20)).toBe(30);
  });
});

describe('eventoRealizado', () => {
  // Meio-dia UTC de 24/08 é 09h em São Paulo — mesmo dia nos dois fusos.
  const meioDia = new Date('2026-08-24T12:00:00Z');

  it('turma de ontem já foi realizada', () => {
    expect(eventoRealizado('2026-08-23', meioDia)).toBe(true);
  });

  it('turma de HOJE ainda não: vale o dia inteiro, há inscrição na porta', () => {
    expect(eventoRealizado('2026-08-24', meioDia)).toBe(false);
  });

  it('turma futura não foi realizada', () => {
    expect(eventoRealizado('2026-08-25', meioDia)).toBe(false);
  });

  it('aceita Date, não só string', () => {
    expect(eventoRealizado(new Date('2026-08-23T00:00:00Z'), meioDia)).toBe(true);
  });

  it('sem data, não presume nada', () => {
    expect(eventoRealizado(null, meioDia)).toBe(false);
    expect(eventoRealizado(undefined, meioDia)).toBe(false);
  });

  it('usa o fuso de São Paulo, não o do servidor', () => {
    // 02:00 UTC de 25/08 ainda é 23h de 24/08 no Brasil: a turma de hoje (24/08) não
    // pode virar "realizada" porque o relógio da máquina já passou da meia-noite.
    const madrugadaUtc = new Date('2026-08-25T02:00:00Z');
    expect(eventoRealizado('2026-08-24', madrugadaUtc)).toBe(false);
    expect(eventoRealizado('2026-08-23', madrugadaUtc)).toBe(true);
  });
});

describe('statusDoEvento — turma realizada', () => {
  const meioDia = new Date('2026-08-24T12:00:00Z');
  // Congela o relógio: statusDoEvento consulta a data de hoje internamente.
  beforeAll(() => jest.useFakeTimers().setSystemTime(meioDia));
  afterAll(() => jest.useRealTimers());

  it('nunca anuncia vaga, mesmo com metade da turma livre', () => {
    // O caso real de São Paulo: 280 vagas, 268 vendidas, evento em 08/08.
    expect(
      statusDoEvento({ status_manual: null, vagas: 280, data: '2026-08-08' }, 268),
    ).toBe('esgotado');
    // E mesmo com folga grande.
    expect(
      statusDoEvento({ status_manual: 'abertas', vagas: 100, data: '2026-08-08' }, 10),
    ).toBe('esgotado');
  });

  it('turma de hoje continua com o selo normal', () => {
    expect(
      statusDoEvento({ status_manual: null, vagas: 100, data: '2026-08-24' }, 10),
    ).toBe('abertas');
  });

  it('sem data no objeto, decide só pelas vagas — nada muda para quem não passa a data', () => {
    expect(statusDoEvento({ status_manual: null, vagas: 100 }, 10)).toBe('abertas');
  });
});
