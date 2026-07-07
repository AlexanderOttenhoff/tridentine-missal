// Pragmatic precedence: assign each proper a coarse class I–IV so the resolver
// can order a date's candidates and preselect a sensible default. This is a
// deliberately compact approximation of the 1962 rubrics' precedence tables —
// isolated here behind `rankClass()` so fidelity can be raised later without
// touching the resolver or the UI.

import type { Proper, ProperTag } from "../../data/types.ts";

const CLASS_I = 1;
const CLASS_II = 2;
const CLASS_III = 3;
const CLASS_IV = 4;

const PRIVILEGED_SUNDAY_SEASONS = new Set(["advent", "lent"]);

// Distinguishing "special" days whose class is fixed regardless of weekday.
const SPECIAL_CLASS: Record<string, number> = {
  "corpus-christi": CLASS_I,
  "christ-the-king": CLASS_I,
  trinity: CLASS_I,
  "sacred-heart": CLASS_II,
  "holy-family": CLASS_II,
  "holy-name": CLASS_II,
  octave: CLASS_III, // Holy Innocents (Dec 28)
  ash: CLASS_IV,
  ember: CLASS_IV,
  rogation: CLASS_IV,
  whit: CLASS_IV,
  vigil: CLASS_IV,
};

function isSunday(day: string | null): boolean {
  return day === "sunday" || day === "sun";
}

function temporalClass(tag: Extract<ProperTag, { cycle: "temporal" }>): number {
  if (tag.special && tag.special in SPECIAL_CLASS) return SPECIAL_CLASS[tag.special];
  if (isSunday(tag.day)) {
    // Great Sundays of the Lord and the privileged penitential Sundays.
    if (tag.season === "easter" && tag.week === null) return CLASS_I; // Easter
    if (tag.season === "pentecost" && tag.week === null) return CLASS_I; // Pentecost
    if (tag.season === "ascension") return CLASS_I; // Sunday after Ascension
    if (PRIVILEGED_SUNDAY_SEASONS.has(tag.season)) return CLASS_I;
    // Per-annum green Sundays (Epiphany- and Pentecost-numbered) yield to a
    // coinciding major feast; the older penitential/paschal Sundays don't.
    if (tag.week !== null && (tag.season === "epiphany" || tag.season === "pentecost"))
      return CLASS_III;
    return CLASS_II; // Gesima, Eastertide Sundays, Epiphany feast, etc.
  }
  if (tag.season === "ascension") return CLASS_I; // Ascension Thursday
  return CLASS_IV; // ferias and weekday Masses
}

export function rankClass(proper: Proper): number {
  const tag = proper.tag;
  if (tag.cycle === "temporal") return temporalClass(tag);
  if (tag.cycle === "sanctoral") return CLASS_II; // major fixed feasts
  return CLASS_IV;
}

export { CLASS_I, CLASS_II, CLASS_III, CLASS_IV };
