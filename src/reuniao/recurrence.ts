// Server-side authoritative recurrence expansion (mirrors frontend MeetingDialog logic).

export type RecorrenciaRegra = 'semanal' | 'quinzenal' | 'mensal' | 'mensal-semana';

export interface ExpandRecurrenceInput {
  diasSemana: number[];     // 0=Sunday … 6=Saturday
  horaInicio: string;       // HH:MM (wall-clock in `timezone`)
  regra: RecorrenciaRegra;
  ate: string;              // YYYY-MM-DD inclusive
  semanaDoMes?: 1 | 2 | 3 | 4 | 5; // only for mensal-semana
  startFrom?: Date;         // defaults to today (start of day, local-to-timezone)
  /**
   * IANA timezone the wall-clock fields (horaInicio, ate, startFrom date parts)
   * should be interpreted in. Defaults to UTC, which preserves the legacy
   * behavior for callers that don't pass it. Production callers should pass
   * the município's timezone — e.g. "America/Sao_Paulo" — so a user picking
   * "08:00" in São Paulo gets stored as 11:00 UTC instead of 08:00 UTC
   * (which is 05:00 BRT — the 3-hour bug).
   */
  timezone?: string;
}

export function expandRecurrence(input: ExpandRecurrenceInput): string[] {
  const { diasSemana, horaInicio, regra, ate, semanaDoMes = 1, timezone } = input;
  if (diasSemana.length === 0) return [];

  const [hh, mm] = horaInicio.split(':').map(Number);

  // "today (start of day) in the target timezone" = the wall-clock midnight that
  // the user perceives. We compute that as a UTC instant via wallTimeToUtc, then
  // walk forward in 24h hops which is safe across DST because we recompute the
  // wall-time → UTC conversion for every occurrence rather than adding raw ms.
  const startBase = input.startFrom ?? nowInZone(timezone);
  const startWall = readWallParts(startBase, timezone);
  const start = wallTimeToUtc(startWall.year, startWall.month, startWall.day, 0, 0, timezone);

  const endWall = parseDateOnly(ate);
  const end = wallTimeToUtc(endWall.year, endWall.month, endWall.day, 23, 59, timezone);
  if (end.getTime() < start.getTime()) return [];

  const occurrences: string[] = [];
  const cap = 200;

  if (regra === 'mensal-semana') {
    let cursorY = startWall.year;
    let cursorM = startWall.month;
    while (occurrences.length < cap) {
      const cursorStartUtc = wallTimeToUtc(cursorY, cursorM, 1, 0, 0, timezone);
      if (cursorStartUtc.getTime() > end.getTime()) break;
      for (const dow of diasSemana) {
        const date = nthWeekdayOfMonth(cursorY, cursorM, dow, semanaDoMes);
        if (!date) continue;
        const occ = wallTimeToUtc(date.getFullYear(), date.getMonth(), date.getDate(), hh, mm, timezone);
        if (occ.getTime() >= start.getTime() && occ.getTime() <= end.getTime()) {
          occurrences.push(occ.toISOString());
        }
      }
      cursorM += 1;
      if (cursorM > 11) { cursorM = 0; cursorY += 1; }
    }
  } else {
    const stepWeeks = regra === 'semanal' ? 1 : regra === 'quinzenal' ? 2 : 4;
    const stepDays = stepWeeks * 7;

    for (const dow of diasSemana) {
      // Walk day-by-day from the start to find the first occurrence on the
      // requested DOW, in the target timezone. We use addDaysWall so DST flips
      // can't silently shift the wall-clock hour.
      let dayParts: { year: number; month: number; day: number } = {
        year: startWall.year,
        month: startWall.month,
        day: startWall.day,
      };
      let occUtc = wallTimeToUtc(dayParts.year, dayParts.month, dayParts.day, hh, mm, timezone);
      while (zoneDayOfWeek(occUtc, timezone) !== dow) {
        dayParts = addDaysWall(dayParts, 1);
        occUtc = wallTimeToUtc(dayParts.year, dayParts.month, dayParts.day, hh, mm, timezone);
      }

      while (occUtc.getTime() <= end.getTime() && occurrences.length < cap) {
        occurrences.push(occUtc.toISOString());
        dayParts = addDaysWall(dayParts, stepDays);
        occUtc = wallTimeToUtc(dayParts.year, dayParts.month, dayParts.day, hh, mm, timezone);
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

/* -------- timezone helpers -------- */

interface WallParts {
  year: number;
  month: number; // 0-indexed
  day: number;
  hour: number;
  minute: number;
}

/**
 * Convert a wall-clock moment in the given IANA timezone to the corresponding
 * UTC instant. Handles DST correctly. When `tz` is undefined, falls back to
 * server-local interpretation (legacy behavior).
 */
export function wallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz?: string,
): Date {
  if (!tz) {
    const d = new Date(year, month, day, hour, minute, 0, 0);
    return d;
  }
  // First guess: treat the wall components as if they were UTC.
  const guessUtcMs = Date.UTC(year, month, day, hour, minute, 0);
  // What does that UTC instant look like in the target zone?
  const observed = readWallParts(new Date(guessUtcMs), tz);
  // The desired wall time in UTC ms (treating as UTC) minus observed wall time
  // in UTC ms (treating as UTC) is exactly the timezone offset we need to shift
  // back by to make the guess land on the target wall time.
  const observedUtcMs = Date.UTC(
    observed.year,
    observed.month,
    observed.day,
    observed.hour,
    observed.minute,
    0,
  );
  const deltaMs = guessUtcMs - observedUtcMs;
  return new Date(guessUtcMs + deltaMs);
}

/**
 * Read the wall-clock components of a Date in the given IANA timezone.
 * Returns server-local components when tz is undefined.
 */
export function readWallParts(date: Date, tz?: string): WallParts {
  if (!tz) {
    return {
      year: date.getFullYear(),
      month: date.getMonth(),
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
    };
  }
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  // Intl can return "24" for the hour just past midnight; normalize to 0.
  const hour = Number(parts.hour) % 24;
  return {
    year: Number(parts.year),
    month: Number(parts.month) - 1,
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
  };
}

function nowInZone(tz?: string): Date {
  // The Date itself is the same UTC instant; the helpers that consume it know
  // how to read its wall-clock components in `tz`.
  return new Date();
}

function parseDateOnly(yyyyMmDd: string): { year: number; month: number; day: number } {
  // YYYY-MM-DD — treat as a calendar date, no timezone semantics on its own.
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  return { year: y, month: m - 1, day: d };
}

function addDaysWall(
  parts: { year: number; month: number; day: number },
  days: number,
): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(parts.year, parts.month, parts.day));
  d.setUTCDate(d.getUTCDate() + days);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
}

function zoneDayOfWeek(date: Date, tz?: string): number {
  if (!tz) return date.getDay();
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' });
  const w = fmt.format(date);
  // Sun..Sat → 0..6
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[w] ?? date.getUTCDay();
}
