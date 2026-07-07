// Resolver: given a date, return the Masses that may be said that day, ordered
// so the pragmatic default comes first. Built via `createResolver(propers)` so
// the proper dataset is injected — the engine is pure and testable outside the
// browser (see scripts/validate_calendar.ts).

import type { DayResolution, Proper, RankedProper } from "../../data/types.ts";
import { fromDayNum, iso } from "./computus.ts";
import { rankClass } from "./rank.ts";
import { temporalDay, type TemporalSig } from "./temporal.ts";

const WD_ABBR = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// "Floating" feasts whose class is defined by their character, not their place
// in a season — matched by `special` alone so they resolve across the
// Christmas/Epiphany and Pentecost-season seams (e.g. Holy Family after Epiphany
// is tagged in the Christmas cycle).
const FLOATING = new Set([
  "holy-family",
  "holy-name",
  "christ-the-king",
  "corpus-christi",
  "sacred-heart",
  "trinity",
]);

function mmdd(n: number): string {
  const { m, d } = fromDayNum(n);
  return `${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`;
}

/** Score a temporal proper against the day's signature; null = not applicable. */
function scoreTemporal(proper: Proper, sig: TemporalSig): number | null {
  if (proper.tag.cycle !== "temporal") return null;
  const tag = proper.tag;

  // Floating feasts short-circuit the seasonal match.
  if (tag.special && FLOATING.has(tag.special))
    return tag.special === sig.special ? 20 : null;
  // The numbered Sunday displaced by a floating feast, offered as an alternate.
  if (sig.alt.includes("epiphany-1") && tag.season === "epiphany" && tag.week === 1)
    return 5;

  if (tag.season !== sig.season) return null;

  let s = 0;
  if (tag.week !== null) {
    // A week-numbered proper needs its own week; the week's ferias reuse it via
    // the lower weekday scores below (still within that week). Its `special`, when
    // present, is a positional label ("last"/"2nd-last") the day carries only
    // implicitly, so it is not gated on here.
    if (tag.week === sig.week) s += 3;
    else return null;
  } else if (tag.special !== null) {
    // A null-week proper is placed by the special it names (Ember, Vigil, Whit,
    // Octave, Rogation…), which applies only on a day carrying that same special.
    // Without this gate a season's null-week specials cross-match every other
    // null-week day of the season — the day signatures for these seams also carry
    // week: null, so the old `tag.week === sig.week` fired as `null === null`,
    // surfacing e.g. the Vigil of Pentecost as a phantom throughout Paschaltide.
    if (tag.special !== sig.special) return null;
  } else if (sig.week !== null || sig.special !== null) {
    // A plain null-week day-proper (Easter Sunday, Pentecost, the Ascension
    // octave) must not bleed onto the season's numbered-week days, nor onto days
    // that carry their own special (Whit/Ember/Corpus/Christ-the-King) — only onto
    // plain null-week days of the season (its own day and any bare ferias, below).
    return null;
  }

  if (sig.weekday === 0) {
    // A Sunday date needs a Sunday Mass. "sun" marks the day's own Sunday Mass;
    // "sunday" is the more generic form (also repeated on the following ferias);
    // Sunday specials (resumed sentinels, vigils) are tagged with a null weekday.
    if (tag.day === "sun") s += 4;
    else if (tag.day === "sunday") s += 3;
    else if (tag.day === null && tag.special !== null) s += 3;
    else return null;
  } else {
    if (tag.day === WD_ABBR[sig.weekday]) s += 4; // exact weekday file
    else if (tag.day === "feria") s += 3; // the week's own ferial Mass
    else if (tag.day === null && tag.special !== null && tag.special === sig.special)
      s += 2; // Rogation/Vigil block days (null weekday)
    else if (tag.day === "sunday") s += 2; // ferias repeat the Sunday Mass
    else if (tag.day === "sun") s += 1;
    else if (tag.day === null && tag.special !== null) s += 0; // Sunday special repeated on its ferias
    else return null;
  }

  if (tag.special === sig.special) s += 2;
  else s -= 3; // a special day still surfaces the generic feria, lower down

  return s;
}

export function createResolver(propers: Proper[]) {
  const sanctoralByDate = new Map<string, Proper[]>();
  for (const p of propers) {
    if (p.tag.cycle !== "sanctoral") continue;
    if (p.tag.flags.includes("external-solemnity")) continue; // transferred duplicate
    const key = `${String(p.tag.month).padStart(2, "0")}${String(p.tag.day).padStart(2, "0")}`;
    const list = sanctoralByDate.get(key) ?? [];
    list.push(p);
    sanctoralByDate.set(key, list);
  }

  function resolveDay(n: number): DayResolution {
    const sig = temporalDay(n);
    const key = mmdd(n);
    const seen = new Set<string>();
    const ranked: RankedProper[] = [];

    const add = (proper: Proper, score: number) => {
      if (seen.has(proper.id)) return;
      seen.add(proper.id);
      ranked.push({ proper, klass: rankClass(proper), score });
    };

    for (const p of propers) {
      if (p.tag.cycle !== "temporal") continue;
      const score = scoreTemporal(p, sig);
      if (score === null) continue;
      // Commemoration variants: bonus on the saint's date, penalty off it.
      const commem = p.tag.commem;
      const adj = commem ? (commem === key ? 3 : -2) : 0;
      add(p, score + adj);
    }

    for (const p of sanctoralByDate.get(key) ?? []) add(p, 15);

    // Match quality leads (how well the proper fits this exact day); the
    // precedence class only breaks ties between equally-good matches (e.g. a
    // major feast coinciding with a Sunday, where both score high).
    ranked.sort((a, b) => b.score - a.score || a.klass - b.klass);

    // Collapse candidates that are the same underlying Mass. A feria reprints its
    // Sunday's Mass, and commemoration variants ("… W/ St X") repeat one Mass
    // under different files — all identical text. Keyed by Introit incipit +
    // vestment colour, keeping the best-scored representative, so the picker only
    // ever offers genuinely distinct Masses (the day's Mass + any coinciding
    // feast), never the same Mass twice.
    const byMass = new Set<string>();
    const distinct = ranked.filter((c) => {
      const key = `${c.proper.mass ?? c.proper.title}|${c.proper.color ?? ""}`;
      if (byMass.has(key)) return false;
      byMass.add(key);
      return true;
    });

    return {
      date: iso(n),
      candidates: distinct,
      defaultId: distinct[0]?.proper.id ?? null,
    };
  }

  return { resolveDay };
}
