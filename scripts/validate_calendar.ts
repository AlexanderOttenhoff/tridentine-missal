// Validate the calendar engine against the site's own scraped calendar.
//
//   node --experimental-strip-types scripts/validate_calendar.ts
//
// source/propers/index.json maps this liturgical year's dates (DD/MM) to the
// files the site itself chose. We resolve every one of those dates and check
// that (a) the site's file appears among our candidates, and (b) for Sundays
// and major feasts our default is the site's primary file. Ferias/commemorations
// are reported but not gated (pragmatic scope).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createResolver } from "../src/lib/calendar/resolve.ts";
import { dayNum, weekday } from "../src/lib/calendar/computus.ts";
import type { Proper } from "../src/data/types.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const propers: Proper[] = JSON.parse(
  readFileSync(join(ROOT, "src/data/propers.json"), "utf8"),
).propers;
const index: { file: string; label: string; dates: string[] }[] = JSON.parse(
  readFileSync(join(ROOT, "source/propers/index.json"), "utf8"),
);

// The scraped year: Advent 2025 → 28 Nov 2026 (Easter 5 Apr 2026). Dec dates are
// 2025; Jan–Nov are 2026.
const properById = new Map(propers.map((p) => [p.file, p]));
const selected = new Set(propers.map((p) => p.file));

// date "DD/MM" → ordered list of site files (primary first, per the label order).
const siteByDate = new Map<string, string[]>();
for (const e of index) {
  if (!selected.has(e.file)) continue;
  for (const d of e.dates) {
    const list = siteByDate.get(d) ?? [];
    list.push(e.file);
    siteByDate.set(d, list);
  }
}

function toDayNum(ddmm: string): number {
  const [dd, mm] = ddmm.split("/").map(Number);
  // The scraped year runs from Advent 1 (30 Nov 2025) to 28 Nov 2026: December
  // and the very end of November are 2025; everything else is 2026.
  const year = mm === 12 || (mm === 11 && dd >= 29) ? 2025 : 2026;
  return dayNum(year, mm, dd);
}

const { resolveDay } = createResolver(propers);

// We gate on the high-value, reliable cases: the actual Sundays and the major
// feasts. Weekday ferias share one PDF across a whole week and index.json's
// per-file `dates` lists are noisy for them (an earlier Sunday's Mass is reused
// on later ferias), so those are reported but not gated. External solemnities
// (transferred) are excluded too.
const FEAST_SPECIALS = new Set([
  "corpus-christi",
  "sacred-heart",
  "christ-the-king",
  "trinity",
  "holy-family",
  "holy-name",
]);
function isGated(file: string, n: number): boolean {
  const p = properById.get(file);
  if (!p) return false;
  if (p.tag.flags?.includes("external-solemnity")) return false;
  if (p.tag.cycle === "sanctoral") return true; // major fixed feast, any weekday
  if (weekday(n) === 0) return true; // an actual Sunday
  if (p.tag.cycle === "temporal") {
    const t = p.tag;
    if (t.special && FEAST_SPECIALS.has(t.special)) return true;
    if (t.season === "ascension" && t.day === "thu") return true; // Ascension Thursday
  }
  return false;
}

let gated = 0;
let gatedOk = 0;
const gatedMiss: string[] = [];
const feriaMiss: string[] = [];

for (const [ddmm, siteFiles] of [...siteByDate].sort()) {
  const n = toDayNum(ddmm);
  const res = resolveDay(n);
  const defFile = res.candidates[0]?.proper.file ?? null;
  const sitePrimary = siteFiles[0];
  const line = `${ddmm}: default=${defFile ?? "∅"} site=${sitePrimary} | cands [${res.candidates
    .map((c) => `${c.proper.file}(c${c.klass}/${c.score})`)
    .join(", ")}]`;

  if (isGated(sitePrimary, n)) {
    gated++;
    if (defFile === sitePrimary) gatedOk++;
    else gatedMiss.push(line);
  } else if (defFile !== sitePrimary) {
    feriaMiss.push(line);
  }
}

console.log(`Sundays & feasts (gated): ${gatedOk}/${gated} defaults correct`);
console.log(`\n--- gated mismatches (${gatedMiss.length}) ---`);
for (const m of gatedMiss) console.log(m);
console.log(`\n--- feria/other mismatches (${feriaMiss.length}, not gated) ---`);
for (const m of feriaMiss) console.log(m);
