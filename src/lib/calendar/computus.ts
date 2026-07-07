// Computus: the arithmetic of the movable liturgical year.
//
// Dates are handled as integer *day numbers* (whole days since the Unix epoch,
// UTC) so that offsets and weekday math are exact and timezone-free. Convert to
// and from calendar {y, m, d} with `dayNum` / `fromDayNum`.

export interface YMD {
  y: number;
  m: number;
  d: number;
}

const MS_PER_DAY = 86_400_000;

/** Whole days from the Unix epoch to midnight UTC of the given calendar date. */
export function dayNum(y: number, m: number, d: number): number {
  return Math.floor(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

export function fromDayNum(n: number): YMD {
  const dt = new Date(n * MS_PER_DAY);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/** Day of week, 0 = Sunday … 6 = Saturday (epoch day 0 was a Thursday). */
export function weekday(n: number): number {
  return (((n + 4) % 7) + 7) % 7;
}

export function addDays(n: number, days: number): number {
  return n + days;
}

/** The Sunday on or immediately before `n`. */
export function sundayOnOrBefore(n: number): number {
  return n - weekday(n);
}

/** The Sunday on or immediately after `n`. */
export function sundayOnOrAfter(n: number): number {
  const wd = weekday(n);
  return wd === 0 ? n : n + (7 - wd);
}

/**
 * Easter Sunday (Gregorian) for `year`, as a day number — the "Anonymous
 * Gregorian" / Meeus-Jones-Butcher algorithm.
 */
export function easter(year: number): number {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return dayNum(year, month, day);
}

/**
 * First Sunday of Advent for the liturgical year that *ends* in `civilYear + 1`
 * — i.e. Advent that falls in December of `civilYear`. It is the fourth Sunday
 * before Christmas: the Sunday on or before Dec 24, minus three weeks.
 */
export function advent1(civilYear: number): number {
  const advent4 = sundayOnOrBefore(dayNum(civilYear, 12, 24));
  return advent4 - 21;
}

/** ISO `YYYY-MM-DD` for a day number (useful as a map key). */
export function iso(n: number): string {
  const { y, m, d } = fromDayNum(n);
  return `${y.toString().padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Parse an ISO `YYYY-MM-DD` string into a day number. */
export function fromIso(s: string): number {
  const [y, m, d] = s.split("-").map(Number);
  return dayNum(y, m, d);
}

/** Today's local date as a day number (local calendar day, not UTC instant). */
export function today(): number {
  const now = new Date();
  return dayNum(now.getFullYear(), now.getMonth() + 1, now.getDate());
}
