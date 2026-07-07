// Sanctoral overlay: fixed-date feasts (Proprium Sanctorum) that can fall on any
// weekday. Current scope is the ~11 major feasts carried in propers.json (see
// scripts/parse_propers.py MAJOR_FEASTS); a date is keyed by MMDD. The resolver
// pairs these with whatever temporal day the date also holds, and ranking (see
// rank.ts) decides which takes precedence.

/** A fixed-date feast keyed `MMDD` (e.g. "1101" = 1 November, All Saints). */
export function sanctoralKey(month: number, day: number): string {
  return `${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
}
