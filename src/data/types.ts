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
