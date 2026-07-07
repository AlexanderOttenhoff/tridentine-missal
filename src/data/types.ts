// Data model for the Missale Romanum (1962 / Tridentine Rite).
//
// The model separates the *Ordinary* (the fixed text of the Mass, contained in
// this repo today) from the *Propers* (texts that change with the liturgical
// day). Sections flagged `proper: true` are placeholders whose `blocks` can be
// swapped for day-specific content once a propers dataset is added — that is the
// path to a full missal without reshaping the Ordinary.

/** Who speaks or sings a given line. */
export type Role = "priest" | "server" | "faithful" | "all" | "choir";

/** A spoken/sung line, optionally attributed to a role. */
export interface VerseBlock {
  type: "verse";
  role?: Role;
  latin: string;
  english: string;
  /** A response spoken by the congregation (highlighted in the source missal). */
  congregation?: boolean;
}

/** A rubric: an instruction (traditionally printed in red), not a prayer. */
export interface RubricBlock {
  type: "rubric";
  english: string;
  latin?: string;
}

export type Block = VerseBlock | RubricBlock;

export interface Section {
  /** Stable id, used for anchors and navigation. */
  id: string;
  /** Common/liturgical title, e.g. "Kyrie". */
  title: string;
  /** Optional gloss, e.g. "Lord, have mercy". */
  subtitle?: string;
  /** True when the content varies by liturgical day (a Proper). */
  proper?: boolean;
  blocks: Block[];
}

export interface MassPart {
  id: string;
  title: string;
  /** Optional short description shown under the part heading. */
  note?: string;
  sections: Section[];
}

export interface Missal {
  title: string;
  subtitle: string;
  parts: MassPart[];
}

// --- Propers (Proprium Missæ) ---------------------------------------------
// Parsed from the ExtraordinaryForm.org proper PDFs by scripts/parse_propers.py
// into src/data/propers.json. Each proper carries a `tag` (its place in the
// liturgical year) and the day-specific `sections` that fill the Ordinary's
// `proper: true` slots.

/** Where a proper sits in the liturgical year, parsed from its filename. */
export type ProperTag =
  | {
      cycle: "temporal";
      season: string;
      week: number | null;
      /** "sunday" | "sun" | "mon" … "sat" | "feria" | null */
      day: string | null;
      special: string | null;
      /** A commemorated fixed feast on this feria, as "MMDD". */
      commem: string | null;
      flags: string[];
    }
  | {
      cycle: "sanctoral";
      month: number;
      day: number;
      feast: string;
      flags: string[];
    }
  | { cycle: "unknown"; raw: string; flags: string[] };

/** One proper text (Introit, Collect, …); `key` matches an Ordinary slot id. */
export interface ProperSection {
  name?: string;
  key: string;
  citation?: string;
  latin: string;
  english: string;
}

/** A complete Mass Proper for one liturgical day. */
export interface Proper {
  id: string;
  file: string;
  title: string;
  mass?: string;
  color?: string;
  dates: string[];
  tag: ProperTag;
  sections: ProperSection[];
}

/** A proper offered for a chosen date, with its computed precedence class. */
export interface RankedProper {
  proper: Proper;
  /** Pragmatic precedence class, I (1) = highest … IV (4) = feria. */
  klass: number;
  /** How well the proper matches the day (higher = better); default sort key. */
  score: number;
}

/** The Masses appropriate to a given date, best (default) first. */
export interface DayResolution {
  /** ISO date "YYYY-MM-DD". */
  date: string;
  candidates: RankedProper[];
  /** The proper id preselected as the day's default (candidates[0]). */
  defaultId: string | null;
}
