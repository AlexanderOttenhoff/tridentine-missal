// Compose a day's Mass: fill the Ordinary's `proper: true` slots (and the
// Secret / proper Preface) with the chosen Mass Proper's text.
//
// The Ordinary sections keep the fixed ritual framing (rubrics, the priest's
// prayers, the responses) and mark where the day's text belongs with a
// "see the Mass Proper for today's …" placeholder. We strip those placeholders
// and splice the proper's matching-`key` text in at the right anchor.

import type {
  Block,
  MassPart,
  Missal,
  Proper,
  ProperSection,
  Section,
} from "./types.ts";

const PLACEHOLDER = /^see the Mass Proper/i;
const SLOT_LABEL = /^(Introit|Collect|Epistle|Gradual|Gospel|Offertory|Communion|Postcommunion)$/i;
const CENTER = /At The Center Of The Altar/i;
const GLORIA_TIBI = /Gl[óo]ria tibi/i;
const PROPER_PREFACE = /Proper PREFACE/i;

// Slots whose proper text (an antiphon read at the centre) follows the
// "At The Center Of The Altar" rubric; the rest take their text at the top.
const AFTER_CENTER = new Set(["introit", "communion-verse"]);

/** Turn a proper's sections into renderable blocks (citation caption + verse). */
function properBlocks(sections: ProperSection[]): Block[] {
  const out: Block[] = [];
  for (const s of sections) {
    if (s.citation) out.push({ type: "rubric", english: s.citation });
    out.push({ type: "verse", latin: s.latin, english: s.english });
  }
  return out;
}

/** Remove the "see the Mass Proper …" pointer (and a following bare slot label). */
function stripPlaceholders(blocks: Block[]): Block[] {
  const out: Block[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === "rubric" && PLACEHOLDER.test(b.english)) {
      const next = blocks[i + 1];
      if (next && next.type === "rubric" && SLOT_LABEL.test(next.english.trim())) i++;
      continue;
    }
    out.push(b);
  }
  return out;
}

function spliceAfter(blocks: Block[], idx: number, inject: Block[]): Block[] {
  if (idx < 0) return [...inject, ...blocks];
  return [...blocks.slice(0, idx + 1), ...inject, ...blocks.slice(idx + 1)];
}

function injectSlot(sec: Section, byKey: Map<string, ProperSection[]>): Section {
  const sections = byKey.get(sec.id);
  if (!sections || sections.length === 0) return sec;
  const inject = properBlocks(sections);
  const blocks = stripPlaceholders(sec.blocks);

  if (sec.id === "gospel") {
    const idx = blocks.findIndex((b) => b.type === "verse" && GLORIA_TIBI.test(b.latin));
    return { ...sec, blocks: spliceAfter(blocks, idx, inject) };
  }
  if (AFTER_CENTER.has(sec.id)) {
    const idx = blocks.findIndex((b) => b.type === "rubric" && CENTER.test(b.english));
    return { ...sec, blocks: spliceAfter(blocks, idx, inject) };
  }
  // collect, epistle, gradual, offertory, postcommunion: text leads the section.
  return { ...sec, blocks: [...inject, ...blocks] };
}

/** Replace the Preface section's proper-preface placeholder with the day's Preface. */
function injectPreface(sec: Section, sections: ProperSection[]): Section {
  const inject = properBlocks(sections);
  const idx = sec.blocks.findIndex(
    (b) => b.type === "rubric" && PROPER_PREFACE.test(b.english),
  );
  if (idx < 0) return { ...sec, blocks: [...sec.blocks, ...inject] };
  return { ...sec, blocks: [...sec.blocks.slice(0, idx), ...inject, ...sec.blocks.slice(idx + 1)] };
}

export function composeMissal(base: Missal, proper: Proper | null): Missal {
  if (!proper) return base;

  const byKey = new Map<string, ProperSection[]>();
  for (const s of proper.sections) {
    const list = byKey.get(s.key) ?? [];
    list.push(s);
    byKey.set(s.key, list);
  }

  const parts: MassPart[] = base.parts.map((part) => {
    const sections: Section[] = [];
    for (const sec of part.sections) {
      if (sec.proper) sections.push(injectSlot(sec, byKey));
      else if (sec.id === "preface" && byKey.has("preface"))
        sections.push(injectPreface(sec, byKey.get("preface")!));
      else sections.push(sec);

      // The Secret has no Ordinary slot; add it right after the Offertory.
      if (sec.id === "offertory" && byKey.has("secret")) {
        sections.push({
          id: "secret",
          title: "Secret",
          subtitle: "The Secret (proper)",
          proper: true,
          blocks: properBlocks(byKey.get("secret")!),
        });
      }
    }
    return { ...part, sections };
  });

  return { ...base, parts };
}
