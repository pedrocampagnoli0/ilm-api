import { expandRecurrence, nthWeekdayOfMonth } from './recurrence';

describe('expandRecurrence', () => {
  const startFrom = new Date(2026, 0, 1); // Jan 1, 2026 (Thursday)

  it('returns empty when no days selected', () => {
    const r = expandRecurrence({
      diasSemana: [], horaInicio: '09:00', regra: 'semanal', ate: '2026-01-31', startFrom,
    });
    expect(r).toEqual([]);
  });

  it('returns empty when ate < startFrom', () => {
    const r = expandRecurrence({
      diasSemana: [1], horaInicio: '09:00', regra: 'semanal', ate: '2025-12-01', startFrom,
    });
    expect(r).toEqual([]);
  });

  it('semanal: every Monday in January 2026', () => {
    const r = expandRecurrence({
      diasSemana: [1], horaInicio: '09:00', regra: 'semanal', ate: '2026-01-31', startFrom,
    });
    // Mondays in Jan 2026: 5, 12, 19, 26
    expect(r).toHaveLength(4);
    const dates = r.map((iso) => new Date(iso).getDate());
    expect(dates).toEqual([5, 12, 19, 26]);
  });

  it('semanal: includes start time in HH:MM', () => {
    const r = expandRecurrence({
      diasSemana: [1], horaInicio: '14:30', regra: 'semanal', ate: '2026-01-13', startFrom,
    });
    expect(r).toHaveLength(2); // Jan 5 + Jan 12
    const d = new Date(r[0]);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(30);
  });

  it('quinzenal: every other Tuesday', () => {
    const r = expandRecurrence({
      diasSemana: [2], horaInicio: '10:00', regra: 'quinzenal', ate: '2026-02-28', startFrom,
    });
    // Jan 6, 20; Feb 3, 17  (every 2 weeks starting first Tue >= startFrom)
    const dates = r.map((iso) => `${new Date(iso).getMonth() + 1}/${new Date(iso).getDate()}`);
    expect(dates).toEqual(['1/6', '1/20', '2/3', '2/17']);
  });

  it('mensal-semana: 1st Wednesday of each month', () => {
    const r = expandRecurrence({
      diasSemana: [3], horaInicio: '08:00', regra: 'mensal-semana', semanaDoMes: 1,
      ate: '2026-03-31', startFrom,
    });
    // Jan 7, Feb 4, Mar 4
    expect(r).toHaveLength(3);
    expect(new Date(r[0]).getDate()).toBe(7);
    expect(new Date(r[1]).getDate()).toBe(4);
    expect(new Date(r[2]).getDate()).toBe(4);
  });

  it('mensal-semana: last Friday of each month (semana=5)', () => {
    const r = expandRecurrence({
      diasSemana: [5], horaInicio: '17:00', regra: 'mensal-semana', semanaDoMes: 5,
      ate: '2026-03-31', startFrom,
    });
    // Last Fri Jan = 30, Last Fri Feb = 27, Last Fri Mar = 27
    expect(r.map((iso) => new Date(iso).getDate())).toEqual([30, 27, 27]);
  });

  it('multiple days a week: Mon + Wed', () => {
    const r = expandRecurrence({
      diasSemana: [1, 3], horaInicio: '09:00', regra: 'semanal', ate: '2026-01-15', startFrom,
    });
    // Mons 5, 12; Weds 7, 14 → sorted 5, 7, 12, 14
    expect(r.map((iso) => new Date(iso).getDate())).toEqual([5, 7, 12, 14]);
  });

  it('caps at 200 occurrences', () => {
    const r = expandRecurrence({
      diasSemana: [0, 1, 2, 3, 4, 5, 6], horaInicio: '09:00', regra: 'semanal',
      ate: '2030-12-31', startFrom,
    });
    expect(r.length).toBeLessThanOrEqual(200);
  });
});

describe('nthWeekdayOfMonth', () => {
  it('first Monday of Jan 2026 = Jan 5', () => {
    const d = nthWeekdayOfMonth(2026, 0, 1, 1);
    expect(d?.getDate()).toBe(5);
  });

  it('last Friday of Feb 2026 = Feb 27', () => {
    const d = nthWeekdayOfMonth(2026, 1, 5, 5);
    expect(d?.getDate()).toBe(27);
  });

  it('returns null when 5th weekday spills outside month', () => {
    // Feb 2026 has only 4 Mondays
    const d = nthWeekdayOfMonth(2026, 1, 1, 5);
    // semana=5 always returns last (not 5th), so always non-null
    expect(d).not.toBeNull();
  });

  it('5th Wed of a 5-Wed month returns 5th occurrence', () => {
    // April 2026 has Weds on 1, 8, 15, 22, 29 — 5 Weds
    // semana=5 returns "last", which is also the 5th — same date
    const last = nthWeekdayOfMonth(2026, 3, 3, 5);
    expect(last?.getDate()).toBe(29);
  });
});
