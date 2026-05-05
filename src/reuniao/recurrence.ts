// Server-side authoritative recurrence expansion (mirrors frontend MeetingDialog logic).

export type RecorrenciaRegra = 'semanal' | 'quinzenal' | 'mensal' | 'mensal-semana';

export interface ExpandRecurrenceInput {
  diasSemana: number[];     // 0=Sunday … 6=Saturday
  horaInicio: string;       // HH:MM
  regra: RecorrenciaRegra;
  ate: string;              // YYYY-MM-DD inclusive
  semanaDoMes?: 1 | 2 | 3 | 4 | 5; // only for mensal-semana
  startFrom?: Date;         // defaults to today (start of day)
}

export function expandRecurrence(input: ExpandRecurrenceInput): string[] {
  const { diasSemana, horaInicio, regra, ate, semanaDoMes = 1 } = input;
  if (diasSemana.length === 0) return [];

  const [hh, mm] = horaInicio.split(':').map(Number);
  const start = input.startFrom ? new Date(input.startFrom) : new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(ate);
  end.setHours(23, 59, 59, 999);
  if (end < start) return [];

  const occurrences: string[] = [];
  const cap = 200;

  if (regra === 'mensal-semana') {
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= end && occurrences.length < cap) {
      for (const dow of diasSemana) {
        const date = nthWeekdayOfMonth(
          cursor.getFullYear(),
          cursor.getMonth(),
          dow,
          semanaDoMes,
        );
        if (!date) continue;
        date.setHours(hh, mm, 0, 0);
        if (date >= start && date <= end) {
          occurrences.push(date.toISOString());
        }
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else {
    const stepWeeks = regra === 'semanal' ? 1 : regra === 'quinzenal' ? 2 : 4;
    const stepDays = stepWeeks * 7;

    for (const dow of diasSemana) {
      const first = new Date(start);
      const diff = (dow - first.getDay() + 7) % 7;
      first.setDate(first.getDate() + diff);
      first.setHours(hh, mm, 0, 0);

      let cursor = new Date(first);
      while (cursor <= end && occurrences.length < cap) {
        occurrences.push(cursor.toISOString());
        cursor = new Date(cursor.getTime() + stepDays * 24 * 60 * 60 * 1000);
      }
    }
  }

  occurrences.sort();
  return occurrences;
}

export function nthWeekdayOfMonth(
  year: number,
  month: number,
  dow: number,
  semana: 1 | 2 | 3 | 4 | 5,
): Date | null {
  if (semana === 5) {
    const last = new Date(year, month + 1, 0);
    const diff = (last.getDay() - dow + 7) % 7;
    return new Date(year, month, last.getDate() - diff);
  }
  const first = new Date(year, month, 1);
  const offset = (dow - first.getDay() + 7) % 7;
  const day = 1 + offset + (semana - 1) * 7;
  const candidate = new Date(year, month, day);
  if (candidate.getMonth() !== month) return null;
  return candidate;
}
