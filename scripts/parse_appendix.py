#!/usr/bin/env python3
"""Parse the appendix devotions from the printable Hand Missal
(source/handmissal.pdf) that are absent from the main Ordinary source:

  - Leonine Prayers after Low Mass   (English; logical page 34)
  - Benediction of the Blessed Sacrament (Latin + facing English; pages 36-37)
  - The Divine Praises / Holy God We Praise Thy Name (English; page 38)

The PDF is imposed 2-up for booklet printing, so each physical (0-based) page
holds two logical pages side by side. LOGICAL maps a logical page number to
(physical_index, side). Congregation responses are yellow-highlighted (and, in
this booklet, sometimes prefixed "All:"); both are flagged `congregation`.

Requires PyMuPDF; run e.g.
    ~/.pyenv/versions/3.14.3/bin/python scripts/parse_appendix.py

Output: src/data/appendix.json
"""
import json
import re
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parent.parent
DOC = pymupdf.open(ROOT / "source" / "handmissal.pdf")

# logical page -> (physical page index, side): "L" = left half, "R" = right half
LOGICAL = {34: (8, "L"), 36: (6, "L"), 37: (5, "R"), 38: (4, "L")}

HIGHLIGHT = (1.0, 1.0, 0.0)
SPEAKER_RE = re.compile(r"^(P|S|All):\s*(.*)$")
ROLE = {"P": "priest", "S": "server", "All": "all"}
JUNK_RE = re.compile(r"^\((?:KNEEL|SIT|STAND)\)$|^Page \d+$|removes his cope")


def _yellow(page):
    return [
        pymupdf.Rect(d["rect"])
        for d in page.get_drawings()
        if d.get("fill") and tuple(round(c, 1) for c in d["fill"]) == HIGHLIGHT
    ]


def _hit(x0, y0, x1, y1, rects):
    h = y1 - y0
    return any(
        min(y1, r.y1) - max(y0, r.y0) >= 0.5 * h and min(x1, r.x1) - max(x0, r.x0) > 0
        for r in rects
    )


def get_lines(logical_page):
    """Ordered (text, highlighted) lines for one logical half-page."""
    di, side = LOGICAL[logical_page]
    page = DOC[di]
    rects = _yellow(page)
    xmin, xmax = (0, 396) if side == "L" else (396, 792)
    rows = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            spans = [s for s in line["spans"] if s["text"].strip()]
            if not spans:
                continue
            x0 = min(s["bbox"][0] for s in spans)
            y0 = min(s["bbox"][1] for s in spans)
            x1 = max(s["bbox"][2] for s in spans)
            y1 = max(s["bbox"][3] for s in spans)
            if not (xmin <= (x0 + x1) / 2 < xmax):
                continue
            text = "".join(s["text"] for s in spans).strip()
            if JUNK_RE.search(text):
                continue
            rows.append((round(y0), x0, text, _hit(x0, y0, x1, y1, rects)))
    rows.sort()
    return [(t, h) for _y, _x, t, h in rows]


# Obvious transcription typos in the source booklet, corrected for fidelity.
CORRECTIONS = {"her most chase spouse": "her most chaste spouse"}


def _clean(s):
    s = re.sub(r"\s+", " ", s).strip()
    for wrong, right in CORRECTIONS.items():
        s = s.replace(wrong, right)
    return s


# --- Leonine Prayers (English only) -----------------------------------------

def build_leonine():
    blocks = []
    cur = None

    def flush():
        nonlocal cur
        if cur:
            cur["english"] = _clean(cur["english"])
            blocks.append(cur)
        cur = None

    for text, hl in get_lines(34):
        if text.startswith("Leonine Prayers after Low Mass"):
            continue  # becomes the section title
        if text.startswith("Ave Maria"):
            flush()
            blocks.append({"type": "rubric", "english": "Ave Maria (3 times)"})
            continue
        if text.startswith("Salve Regina"):
            flush()
            blocks.append({"type": "rubric", "english": "Salve Regina"})
            continue
        m = SPEAKER_RE.match(text)
        if m:
            flush()
            cur = {"type": "verse", "role": ROLE[m.group(1)], "latin": "",
                   "english": m.group(2)}
            if hl or m.group(1) == "All":
                cur["congregation"] = True
            continue
        if text.startswith("(") and text.endswith(")"):
            flush()
            blocks.append({"type": "rubric", "english": text[1:-1].strip()})
            continue
        if cur is not None:  # wrapped continuation
            cur["english"] += " " + text
            if hl:
                cur["congregation"] = True
    flush()
    return {
        "id": "leonine",
        "title": "Leonine Prayers",
        "subtitle": "Prayers after Low Mass (Pope Leo XIII)",
        "blocks": blocks,
    }


# --- Benediction (Latin page 36 paired with facing English page 37) ---------

def _benediction_items(logical_page):
    """Return ordered items: ("hymn", text) or ("verse", role, text, cong)."""
    items = []
    hymn = []
    cur = None

    def flush_hymn():
        nonlocal hymn
        if hymn:
            items.append(("hymn", "\n".join(hymn)))
            hymn = []

    def flush_verse():
        nonlocal cur
        if cur:
            items.append(("verse", cur[1], _clean(cur[2]), cur[3]))
            cur = None

    for text, hl in get_lines(logical_page):
        if text in ("AT THE CENTER OF THE ALTAR", "AT THE FOOT OF THE ALTAR"):
            flush_verse()
            flush_hymn()
            continue
        if text == "BENEDICTION OF THE BLESSED SACRAMENT":
            continue
        m = SPEAKER_RE.match(text)
        if m:
            flush_hymn()
            flush_verse()
            cur = ["verse", ROLE[m.group(1)], m.group(2), hl or m.group(1) == "All"]
            continue
        if cur is not None:
            cur[2] += " " + text
            if hl:
                cur[3] = True
        else:
            hymn.append(text)
    flush_verse()
    flush_hymn()
    return items


def _pair_block(la, en):
    if la[0] == "hymn":
        return {"type": "verse", "latin": la[1], "english": en[1]}
    block = {"type": "verse", "role": la[1], "latin": la[2], "english": en[2]}
    if la[3] or en[3]:
        block["congregation"] = True
    return block


def build_benediction():
    la = _benediction_items(36)
    en = _benediction_items(37)
    assert len(la) == len(en), f"Benediction item mismatch: {len(la)} vs {len(en)}"
    blocks = [_pair_block(a, b) for a, b in zip(la, en)]
    # Items: 0 = O Salutaris hymn, 1 = Tantum Ergo hymn, 2.. = versicle/collect.
    return [
        {"id": "o-salutaris", "title": "O Salutaris Hostia",
         "subtitle": "Hymn at the exposition", "blocks": blocks[0:1]},
        {"id": "tantum-ergo", "title": "Tantum Ergo",
         "subtitle": "Hymn, versicle, and collect", "blocks": blocks[1:]},
    ]


# --- Divine Praises + Holy God We Praise Thy Name (English) ------------------

def build_divine_praises():
    drop = {"AT THE CENTER OF THE ALTAR", "AT THE FOOT OF THE ALTAR",
            "THE BLESSING", "THE DIVINE PRAISES"}
    praises, hymn = [], []
    for text, _hl in get_lines(38):
        if text in drop:
            continue
        (praises if text.startswith("Blessed be") else hymn).append(_clean(text))
    sections = [{
        "id": "divine-praises",
        "title": "The Divine Praises",
        "subtitle": "Said in reparation",
        "blocks": [{"type": "verse", "latin": "", "english": "\n".join(praises)}],
    }]
    if hymn:
        sections.append({
            "id": "holy-god",
            "title": "Holy God, We Praise Thy Name",
            "subtitle": "Hymn of thanksgiving",
            "blocks": [{"type": "verse", "latin": "", "english": "\n".join(hymn)}],
        })
    return sections


def main():
    appendix = {
        "parts": [
            {"id": "after-low-mass", "title": "Prayers after Low Mass",
             "note": "Recited kneeling after Low Mass.",
             "sections": [build_leonine()]},
            {"id": "benediction", "title": "Benediction of the Blessed Sacrament",
             "sections": build_benediction() + build_divine_praises()},
        ]
    }
    dest = ROOT / "src" / "data" / "appendix.json"
    dest.write_text(json.dumps(appendix, ensure_ascii=False, indent=2), encoding="utf-8")
    nsec = sum(len(p["sections"]) for p in appendix["parts"])
    nblk = sum(len(s["blocks"]) for p in appendix["parts"] for s in p["sections"])
    print(f"wrote {dest}: {len(appendix['parts'])} parts, {nsec} sections, {nblk} blocks")


if __name__ == "__main__":
    main()
