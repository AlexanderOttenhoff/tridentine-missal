import type { Missal } from "./types.ts";
import data from "./ordinary.json";

// The Ordinary is generated from the source PDF by scripts/parse.py; do not edit
// ordinary.json by hand — re-run the parser instead.
export const missal = data as Missal;
