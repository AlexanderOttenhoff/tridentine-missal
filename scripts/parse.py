#!/usr/bin/env python3
"""Parse the two cropped columns of the Extraordinary Form PDF into a paired,
structured JSON dataset. Latin and English are parsed independently with the
*same* segmentation rules, then aligned positionally (the two columns are
parallel in the source).

Output: src/data/ordinary.generated.json
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "source"

# Named liturgical section headings (exact, trimmed, upper-case).
NAMED_HEADINGS = {
    "INTROIT",
    "COLLECT PRAYER",
    "EPISTLE OR LESSON",
    "GRADUAL",
    "GOSPEL",
    "OFFERTORY VERSE",
    "THE ROMAN CANON",
    "COMMUNION VERSE",
    "POSTCOMMUNION PRAYER",
}

# Position cues — where the priest stands. Treated as structural rubrics.
POSITION_HEADINGS = {
    "AT THE FOOT OF THE ALTAR",
    "AT THE CENTER OF THE ALTAR",
    "AT THE RIGHT SIDE OF THE ALTAR",
    "AT THE LEFT SIDE OF THE ALTAR",
    "AT THE COMMUNION RAIL",
}

ROLE = {"P": "priest", "S": "server", "C": "choir", "V": "priest", "R": "server"}
SPEAKER_RE = re.compile(r"^\s*(P|S|C|V|R):\s*(.*)$")

# Junk lines to drop (page furniture appearing at the top of each page column).
JUNK_RE = re.compile(
    r"(Errors\?|help@extraordinaryform|^\s*\d+/\d+/\d+\s*$"
    r"|EXTRAORDINARY FORM OF|THE MASS OF THE LATIN RITE)"
)


def is_heading(line: str) -> bool:
    return line.strip() in NAMED_HEADINGS


def is_position(line: str) -> bool:
    return line.strip() in POSITION_HEADINGS


def parse_column(path: Path) -> list[dict]:
    """Return an ordered list of blocks: {kind, role?, text}. kind in
    {heading, position, rubric, verse}."""
    blocks: list[dict] = []
    cur: dict | None = None
    open_paren = False  # inside a multi-line parenthetical rubric

    def flush():
        nonlocal cur
        if cur is not None:
            cur["text"] = re.sub(r"\s+", " ", cur["text"]).strip()
            if cur["text"]:
                blocks.append(cur)
        cur = None

    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.rstrip()
        stripped = line.strip()
        if not stripped or JUNK_RE.search(stripped):
            continue

        # Continuation of an unfinished parenthetical rubric.
        if open_paren:
            cur["text"] += " " + stripped
            if ")" in stripped:
                open_paren = False
                flush()
            continue

        if is_heading(stripped):
            flush()
            blocks.append({"kind": "heading", "text": stripped})
            continue
        if is_position(stripped):
            flush()
            blocks.append({"kind": "position", "text": stripped})
            continue

        m = SPEAKER_RE.match(line)
        if m:
            flush()
            cur = {"kind": "verse", "role": ROLE[m.group(1)], "text": m.group(2)}
            continue

        # A line beginning with "(" is a standalone rubric only when the
        # parenthetical is the whole line — i.e. it closes at the very end of
        # this line, or does not close at all (a multi-line rubric). If the
        # line has text *after* the closing ")", it is an inline stage
        # direction (e.g. "(strike breast) miserére nobis.") that belongs to
        # the current verse, so treat it as a continuation instead.
        if stripped.startswith("("):
            close = stripped.find(")")
            inline = close != -1 and stripped[close + 1 :].strip() != ""
            if not inline:
                flush()
                cur = {"kind": "rubric", "text": stripped}
                if close == -1:
                    open_paren = True
                else:
                    flush()
                continue
            # else: fall through and treat as continuation of current block

        # Otherwise: continuation of the current block (wrapped line, or an
        # emphasised all-caps prayer fragment such as the Consecration form).
        if cur is not None:
            cur["text"] += " " + stripped
        # If cur is None we are in stray text between blocks; ignore.

    flush()
    return blocks


def main() -> int:
    latin = parse_column(SRC / "latin.txt")
    english = parse_column(SRC / "english.txt")

    print(f"latin blocks:   {len(latin)}")
    print(f"english blocks: {len(english)}")

    # Align on ANCHORS only (verses + headings + positions). Rubrics are
    # English-language stage directions that wrap differently between the two
    # columns, so they are excluded from alignment and taken from Latin.
    def anchors(blocks):
        return [b for b in blocks if b["kind"] != "rubric"]

    la, ea = anchors(latin), anchors(english)
    print(f"latin anchors:   {len(la)}")
    print(f"english anchors: {len(ea)}")

    mismatches = 0
    for i in range(max(len(la), len(ea))):
        lk = la[i]["kind"] if i < len(la) else "—"
        ek = ea[i]["kind"] if i < len(ea) else "—"
        lr = la[i].get("role", "") if i < len(la) else ""
        er = ea[i].get("role", "") if i < len(ea) else ""
        if lk != ek or lr != er:
            mismatches += 1
            if mismatches <= 40:
                lt = la[i]["text"][:36] if i < len(la) else ""
                et = ea[i]["text"][:36] if i < len(ea) else ""
                print(f"  MISMATCH @{i}: L[{lk}/{lr}]={lt!r}  E[{ek}/{er}]={et!r}")
    print(f"anchor mismatches: {mismatches}")

    # Build paired blocks driven by the Latin structure.
    paired: list[dict] = []
    j = 0
    for b in latin:
        if b["kind"] == "rubric":
            paired.append({"kind": "rubric", "text": b["text"]})
            continue
        e = ea[j] if j < len(ea) else {"text": ""}
        j += 1
        entry = {"kind": b["kind"], "latin": b["text"], "english": e.get("text", "")}
        if b["kind"] == "verse":
            entry["role"] = b.get("role")
        paired.append(entry)

    dest = ROOT / "source" / "blocks.json"
    dest.write_text(
        json.dumps(paired, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    print(f"wrote {dest} ({len(paired)} blocks)")

    build_missal(paired)
    return 0


# --- Grouping the flat blocks into the app's part/section model -------------

# Each section is opened by the first block matching its trigger. `kind`:
#   "label"  -> a heading/position block; consumed as the title, not emitted.
#   "verse"  -> a prayer whose opening text starts the section; emitted.
# `proper` marks sections whose text changes with the liturgical day.
SECTIONS = [
    ("foot-of-altar", "Prayers at the Foot of the Altar",
     "Preparation before the altar", "label", "AT THE FOOT OF THE ALTAR", False),
    ("introit", "Introit", "Entrance antiphon (proper)",
     "label", "INTROIT", True),
    ("kyrie", "Kyrie", "Lord, have mercy", "verse", "Kýrie, eléison", False),
    ("gloria", "Gloria", "Glory to God in the highest",
     "verse", "Glória in excélsis", False),
    ("collect", "Collect", "The Collect (proper)",
     "label", "COLLECT PRAYER", True),
    ("epistle", "Epistle", "The Epistle (proper)",
     "label", "EPISTLE OR LESSON", True),
    ("gradual", "Gradual", "Gradual, Alleluia, or Tract (proper)",
     "label", "GRADUAL", True),
    ("gospel", "Gospel", "Preparation and Gospel (proper)",
     "verse", "Munda cor meum", True),
    ("credo", "Credo", "The Nicene Creed", "verse", "Credo in unum", False),
    ("offertory", "Offertory", "The Offertory (proper)",
     "label", "OFFERTORY VERSE", True),
    ("preface", "Preface", "Preface dialogue and Common Preface",
     "verse", "Sursum corda", False),
    ("sanctus", "Sanctus", "Holy, Holy, Holy",
     "verse", "Sanctus, Sanctus", False),
    ("canon", "The Roman Canon", "The Canon and Consecration",
     "label", "THE ROMAN CANON", False),
    ("pater-noster", "Pater Noster", "The Lord's Prayer",
     "verse", "Orémus. Præcéptis", False),
    ("communion", "Communion", "Agnus Dei and Communion",
     "verse", "Hæc commíxtio", False),
    ("communion-verse", "Communion Verse", "Communion antiphon (proper)",
     "label", "COMMUNION VERSE", True),
    ("postcommunion", "Postcommunion", "The Postcommunion (proper)",
     "label", "POSTCOMMUNION PRAYER", True),
    ("conclusion", "Conclusion", "Dismissal and Blessing",
     "verse", "Ite, Missa est", False),
    ("last-gospel", "The Last Gospel", "John 1:1–14",
     "verse", "Inítium sancti Evangélii", False),
]

PARTS = [
    ("catechumens", "Mass of the Catechumens", None,
     ["foot-of-altar", "introit", "kyrie", "gloria", "collect",
      "epistle", "gradual", "gospel", "credo"]),
    ("offertory-part", "The Offertory", None, ["offertory"]),
    ("canon-part", "The Canon of the Mass", None,
     ["preface", "sanctus", "canon", "pater-noster"]),
    ("communion-part", "The Communion", None,
     ["communion", "communion-verse", "postcommunion"]),
    ("conclusion-part", "Conclusion", None, ["conclusion", "last-gospel"]),
]


def _matches(block, kind, value):
    if kind == "label":
        return block["kind"] in ("heading", "position") and block["latin"].strip() == value
    return block["kind"] == "verse" and block["latin"].startswith(value)


def _strip_parens(text):
    t = text.strip()
    if t.startswith("(") and t.endswith(")"):
        t = t[1:-1].strip()
    return t


def build_missal(paired):
    # Walk the flat blocks, opening each section at its trigger (in order).
    sections = {}
    order = []
    ptr = 0
    cur = None
    for block in paired:
        if ptr < len(SECTIONS) and _matches(block, SECTIONS[ptr][3], SECTIONS[ptr][4]):
            sid, title, subtitle, kind, _val, proper = SECTIONS[ptr]
            cur = {"id": sid, "title": title, "subtitle": subtitle, "blocks": []}
            if proper:
                cur["proper"] = True
            sections[sid] = cur
            order.append(sid)
            ptr += 1
            if kind == "label":
                continue  # heading consumed as the title
        if cur is None:
            continue
        if block["kind"] == "verse":
            cur["blocks"].append({
                "type": "verse",
                "role": block.get("role"),
                "latin": block["latin"],
                "english": block["english"],
            })
        elif block["kind"] == "rubric":
            cur["blocks"].append({"type": "rubric", "english": _strip_parens(block["text"])})
        else:  # a heading/position block that is not a section trigger
            cur["blocks"].append({"type": "rubric", "english": block["latin"].title()})

    missal = {
        "title": "Ordo Missae",
        "subtitle": "The Order of Mass · 1962 Missale Romanum",
        "parts": [
            {
                "id": pid,
                "title": ptitle,
                **({"note": note} if note else {}),
                "sections": [sections[s] for s in sids if s in sections],
            }
            for pid, ptitle, note, sids in PARTS
        ],
    }

    dest = ROOT / "src" / "data" / "ordinary.json"
    dest.write_text(json.dumps(missal, ensure_ascii=False, indent=2), encoding="utf-8")
    n = sum(len(s["blocks"]) for s in sections.values())
    print(f"wrote {dest}: {len(order)} sections, {n} content blocks")
    if ptr != len(SECTIONS):
        print(f"  WARNING: only matched {ptr}/{len(SECTIONS)} section triggers")


if __name__ == "__main__":
    sys.exit(main())
