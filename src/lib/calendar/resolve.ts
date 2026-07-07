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
  if (tag.week === sig.week) s += 3;
  // Ember/Rogation/Vigil propers carry a null week; their week is implied by the
  // special they name, so let a matching special stand in for the week.
  else if (tag.special !== null && tag.special === sig.special) s += 0;
  else return null;

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
    return {
      date: iso(n),
      candidates: ranked,
      defaultId: ranked[0]?.proper.id ?? null,
    };
  }

  return { resolveDay };
}
