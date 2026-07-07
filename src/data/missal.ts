import type { Missal, MassPart } from "./types.ts";
import ordinary from "./ordinary.json";
import appendix from "./appendix.json";

// The Ordinary is generated from the source PDF by scripts/parse.py and the
// appendix devotions (prayers after Low Mass, Benediction) by
// scripts/parse_appendix.py; do not edit the JSON by hand — re-run the parsers
// instead. The appendix parts are appended after the Ordinary.
//
// The Benediction of the Blessed Sacrament is parsed and kept in appendix.json
// but omitted from the rendered missal for now; only the Prayers after Low Mass
// are shown.
const HIDDEN_PARTS = new Set(["benediction"]);

export const missal: Missal = {
  ...(ordinary as Missal),
  parts: [
    ...(ordinary as Missal).parts,
    ...(appendix.parts as MassPart[]).filter((p) => !HIDDEN_PARTS.has(p.id)),
  ],
};
