#!/usr/bin/env python3
"""Download and parse the Mass Propers (texts that change with the liturgical
day) from https://extraordinaryform.org/propersprint.html into a structured
JSON dataset that can later fill the Ordinary's `proper: true` slots.

Each proper is a landscape PDF imposed as a saddle-stitch booklet (two logical
pages per physical page, exactly like source/handmissal.pdf). Within a logical
half-page, a section is a bold heading (name + optional scripture citation)
followed by two row-aligned sub-columns: Latin (left) | English (right). Long
sections (e.g. the Sequence Dies Iræ) run onto the next heading-less half-page.

We reconstruct the booklet reading order via the standard imposition, walk the
half-pages in that order, split each into Latin/English, and segment on headings
(heading-less leading text continues the previous section).

Scope: the temporal cycle plus a curated set of major feasts (see SELECT). The
PDFs are cached under source/propers/ (git-ignored); this script writes the
committed link manifest (source/propers/index.json) and dataset
(src/data/propers.json).

Requires PyMuPDF; run with an interpreter that has it, e.g.
    ~/.pyenv/versions/3.14.3/bin/python scripts/parse_propers.py
"""
import json
import re
import time
import urllib.request
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parent.parent
PDF_DIR = ROOT / "source" / "propers"
INDEX_URL = "https://extraordinaryform.org/propersprint.html"
BASE_URL = "https://extraordinaryform.org/"
UA = "Mozilla/5.0 (X11; Linux x86_64) missal-propers-fetch/1.0"

# --- section vocabulary -----------------------------------------------------
# Heading keyword -> (display name, slot key). The slot key maps a section to
# the Ordinary's proper placeholder ids (src/data/ordinary.json); Gradual /
# Alleluia / Tract / Sequence all fill the single `gradual` slot, so they share
# a key but keep their own display name.
SECTION_KEYS = {
    "INTROIT": ("Introit", "introit"),
    "COLLECT": ("Collect", "collect"),
    "COLLECTS": ("Collect", "collect"),
    "EPISTLE": ("Epistle", "epistle"),
    "LESSON": ("Lesson", "epistle"),
    "PROPHECY": ("Prophecy", "epistle"),
    "GRADUAL": ("Gradual", "gradual"),
    "ALLELUIA": ("Alleluia", "gradual"),
    "TRACT": ("Tract", "gradual"),
    "SEQUENCE": ("Sequence", "gradual"),
    "GOSPEL": ("Gospel", "gospel"),
    "OFFERTORY": ("Offertory", "offertory"),
    "SECRET": ("Secret", "secret"),
    "SECRETS": ("Secret", "secret"),
    "PREFACE": ("Preface", "preface"),
    "COMMUNION": ("Communion", "communion-verse"),
    "POSTCOMMUNION": ("Postcommunion", "postcommunion"),
    "POST-COMMUNION": ("Postcommunion", "postcommunion"),
}

COLORS =("green", "violet", "purple", "white", "red", "black", "rose", "gold")

# Curated major (1st/2nd class) sanctoral feasts to include alongside the
# temporal cycle. Matched as a filename prefix (stem before ".pdf").
MAJOR_FEASTS = {
    "0202Purification", "0319StJoseph", "0325Annunciation",
    "0624NativityStJohnBaptist", "0629StsPeter", "0815Assumption",
    "0908NativityBVM", "1101AllSaints", "1208ImmaculateConception",
    "PentecostChristusRex",
}


def _is_selected(fname):
    """Temporal-cycle files (letter-initial, not Votive/BVM/Requiem/*FORM) plus
    the curated major feasts."""
    stem = fname[:-4] if fname.lower().endswith(".pdf") else fname
    if "AnteMissam" in fname:  # pre-Mass blessing rites, not Mass propers
        return False
    if any(stem.startswith(f) for f in MAJOR_FEASTS):
        return True
    if fname[:1].isdigit():
        return False
    if re.match(r"^(Votive|BVM|Requiem)", fname) or fname.endswith("FORM.pdf"):
        return False
    return True


# --- link manifest ----------------------------------------------------------

def build_index():
    """Fetch the index page and return a deduped list of proper links:
    {file, label, dates:[...]}. `dates` are the occurrences in the current
    liturgical-year calendar, normalized to DD/MM (the source page prints them
    American-style MM/DD); may be empty for votive/common forms."""
    req = urllib.request.Request(INDEX_URL, headers={"User-Agent": UA})
    html = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
    entries = {}
    for m in re.finditer(r'href="propers/([^"]+?\.pdf)"[^>]*>(.*?)</a>',
                          html, re.I | re.S):
        fname = m.group(1)
        label = re.sub(r"<[^>]+>", " ", m.group(2))
        label = re.sub(r"\s+", " ", label).strip()
        # Rewrite any leading American MM/DD in the label to DD/MM too.
        label = re.sub(r"^(\d{1,2})/(\d{1,2})\b",
                       lambda x: f"{int(x.group(2)):02d}/{int(x.group(1)):02d}",
                       label)
        e = entries.setdefault(fname, {"file": fname, "label": label, "dates": []})
        d = re.match(r"(\d{1,2}/\d{1,2})\b", label)  # already DD/MM
        if d and d.group(1) not in e["dates"]:
            e["dates"].append(d.group(1))
        if len(label) > len(e["label"]):  # keep the most descriptive label
            e["label"] = label
    return sorted(entries.values(), key=lambda e: e["file"].lower())


def download(fname):
    dest = PDF_DIR / fname
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    req = urllib.request.Request(BASE_URL + "propers/" + fname,
                                 headers={"User-Agent": UA})
    data = urllib.request.urlopen(req, timeout=60).read()
    dest.write_bytes(data)
    time.sleep(0.25)  # be polite
    return dest


# --- PDF geometry -----------------------------------------------------------

def logical_order(n_pages):
    """Reading order of (page_index, 'L'|'R') half-pages for a saddle-stitch
    booklet with `n_pages` physical pages. Even page counts fold as a booklet;
    an odd count (non-booklet) falls back to natural left-to-right order."""
    if n_pages % 2 != 0:
        return [(p, s) for p in range(n_pages) for s in ("L", "R")]
    n = 2 * n_pages  # logical pages
    num = {}
    for s in range(n_pages // 2):
        fp, bp = 2 * s, 2 * s + 1
        num[(fp, "L")] = n - 2 * s
        num[(fp, "R")] = 1 + 2 * s
        num[(bp, "L")] = 2 + 2 * s
        num[(bp, "R")] = n - 1 - 2 * s
    return [half for half, _ in sorted(num.items(), key=lambda kv: kv[1])]


def half_lines(page, side):
    """Ordered line dicts {x0, y0, text, bold} whose horizontal centre lies in
    the requested half ('L' or 'R') of the page."""
    mid = page.rect.width / 2
    lo, hi = (0, mid) if side == "L" else (mid, page.rect.width)
    rows = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            spans = [s for s in line["spans"] if s["text"].strip()]
            if not spans:
                continue
            x0 = min(s["bbox"][0] for s in spans)
            x1 = max(s["bbox"][2] for s in spans)
            y0 = min(s["bbox"][1] for s in spans)
            if not (lo <= (x0 + x1) / 2 < hi):
                continue
            text = "".join(s["text"] for s in spans).strip()
            bold = any("Bold" in s["font"] for s in spans)
            rows.append({"x0": x0, "y0": round(y0, 1), "text": text, "bold": bold})
    rows.sort(key=lambda r: (r["y0"], r["x0"]))
    return rows, lo, hi


def sub_split(rows, lo, hi):
    """Return the x threshold separating the Latin (left) and English (right)
    sub-columns. Found as the midpoint of the widest gap between line-start x's;
    falls back to the half midline when the two columns can't be distinguished."""
    xs = sorted(r["x0"] for r in rows)
    best_gap, split = 0, (lo + hi) / 2
    for a, b in zip(xs, xs[1:]):
        if b - a > best_gap:
            best_gap, split = b - a, (a + b) / 2
    return split if best_gap >= 60 else (lo + hi) / 2


# --- header / footer / heading classification -------------------------------

DROP_RE = re.compile(
    r"^TRADITIONAL LATIN MASS$|Errors\?|extraordinaryform\.org"
    r"|^\d{1,2}/\d{1,2}/\d{2,4}$|^Page \d+$|^\d+$", re.I)


def classify(text, bold):
    """Classify a line: ('title', txt) | ('mass', incipit, color) | ('drop',) |
    ('heading', name, key, citation) | ('body',). Titles, the Mass incipit, and
    section headings are all set in bold in the source (Arial-BoldMT); requiring
    bold keeps ordinary body words like "Gospel which..." or "Alleluia." — which
    start with a heading keyword but are plain text — from being read as
    headings."""
    if DROP_RE.search(text):
        return ("drop",)
    # The "MASS PROPER:" title and "MASS <incipit> (<color>)" line are identified
    # by their uppercase MASS prefix, not bold (the incipit line isn't bold).
    if text.startswith("MASS PROPER"):
        return ("title", re.sub(r"^MASS PROPER:?\s*", "", text).strip())
    if re.match(r"^MASS\b", text) and "(" in text:
        color = None
        cm = re.search(r"\(([^)]*)\)", text)
        if cm:
            for c in COLORS:
                if c in cm.group(1).lower():
                    color = c
        incipit = re.sub(r"\s*\([^)]*\)\s*", " ", text)
        incipit = re.sub(r"^MASS\s*", "", incipit).strip()
        return ("mass", incipit, color)
    # Section headings must be bold, so plain body words that happen to start with
    # a heading keyword ("Gospel which...", "Alleluia.") aren't mistaken for one.
    if not bold:
        return ("body",)
    word = re.match(r"^([A-Za-z][A-Za-z-]+)", text)
    key = word.group(1).upper() if word else ""
    if key in SECTION_KEYS:
        name, slot = SECTION_KEYS[key]
        citation = text[len(word.group(1)):].strip() or None
        return ("heading", name, slot, citation)
    return ("body",)


def _clean(s):
    return re.sub(r"\s+", " ", s).strip()


# --- parse one proper -------------------------------------------------------

def parse_proper(path):
    doc = pymupdf.open(path)
    meta = {"title": None, "mass": None, "color": None}
    sections = []  # each: {name, key, citation, _la:[], _en:[]}
    cur = None

    for pi, side in logical_order(doc.page_count):
        rows, lo, hi = half_lines(doc[pi], side)
        if not rows:
            continue
        split = sub_split(rows, lo, hi)
        for r in rows:
            kind = classify(r["text"], r["bold"])
            tag = kind[0]
            if tag == "title":
                meta["title"] = meta["title"] or kind[1]
            elif tag == "mass":
                meta["mass"] = meta["mass"] or kind[1]
                meta["color"] = meta["color"] or kind[2]
            elif tag == "drop":
                continue
            elif tag == "heading":
                cur = {"name": kind[1], "key": kind[2], "citation": kind[3],
                       "_la": [], "_en": []}
                sections.append(cur)
            elif cur is not None:  # body; append to current section's column
                (cur["_la"] if r["x0"] < split else cur["_en"]).append(r["text"])

    out = []
    for s in sections:
        out.append({"name": s["name"], "key": s["key"], "citation": s["citation"],
                    "latin": _clean(" ".join(s["_la"])),
                    "english": _clean(" ".join(s["_en"]))})
    return meta, out


def slugify(fname):
    stem = re.sub(r"\.pdf$", "", fname, flags=re.I)
    stem = re.sub(r"(?<!^)(?=[A-Z])", "-", stem)  # camelCase -> dashes
    return re.sub(r"[^a-z0-9]+", "-", stem.lower()).strip("-")


# --- liturgical tag ---------------------------------------------------------
# Parse a filename into a structured liturgical identity that the client-side
# calendar engine (src/lib/calendar) can match a computed date against. Temporal
# files encode season + week ordinal + weekday/special; sanctoral files start
# with an MMDD prefix. Incidental parts (a `_MMDD` commemoration, an `ES_n`
# external-solemnity suffix, and this-year temporal-coincidence suffixes on
# sanctoral files) are stripped but the commemoration date is kept.
TAG_SEASONS = ["Advent", "Christmas", "Epiphany", "Septuagesima", "Sexagesima",
               "Quinquagesima", "Lent", "Easter", "Ascension", "Pentecost"]
TAG_WEEKDAYS = {"Sunday": "sun", "Monday": "mon", "Tuesday": "tue",
                "Wednesday": "wed", "Thursday": "thu", "Friday": "fri",
                "Saturday": "sat"}
TAG_WD_RE = "|".join(TAG_WEEKDAYS)
TAG_FLAGS = ["Brevior", "Abbrev", "NoCredo", "-Good", "-Holy"]
TAG_SPECIALS = {
    "trinity": "trinity", "corpuschristi": "corpus-christi",
    "sacredheartofjesus": "sacred-heart", "christusrex": "christ-the-king",
    "mostholyrosary": "holy-rosary", "holyfamily": "holy-family",
    "holynameofjesus": "holy-name", "rogationmtw": "rogation",
    "vigil": "vigil", "last": "last", "2ndlast": "2nd-last",
    "3rdlast": "3rd-last", "holyinnocents": "holy-innocents",
}


def _special(raw):
    raw = re.sub(r"[^a-z0-9]", "", raw.lower())
    return TAG_SPECIALS.get(raw, raw or None)


def parse_tag(fname):
    stem = re.sub(r"\.pdf$", "", fname, flags=re.I)
    flags = []
    for fl in TAG_FLAGS:
        if fl in stem:
            flags.append(fl.strip("-").lower())
            stem = stem.replace(fl, "")
    m = re.search(r"ES_?\d+(?:st|nd|rd|th)?$", stem)
    if m:
        flags.append("external-solemnity")
        stem = stem[:m.start()]

    ms = re.match(r"^(\d{2})(\d{2})(.*)$", stem)  # sanctoral: leading MMDD
    if ms:
        feast = re.sub(r"_.*$", "", ms.group(3))           # drop _coincidence
        feast = re.sub(r"(\d+)(st|nd|rd|th)$", "", feast)  # drop trailing ord
        return {"cycle": "sanctoral", "month": int(ms.group(1)),
                "day": int(ms.group(2)), "feast": feast, "flags": flags}

    for s in TAG_SEASONS:
        if not stem.startswith(s):
            continue
        rem = stem[len(s):]
        week = None
        wm = re.match(r"^0?(\d+)(?:st|nd|rd|th)", rem)
        if wm:
            week = int(wm.group(1))
            rem = rem[wm.end():]
        commem = None
        cm = re.search(r"_?(\d{4})", rem)
        if cm:
            commem = cm.group(1)
            rem = rem[:cm.start()]
        day, special = None, None
        if rem in ("", "ofOurLordFeria"):
            day = "feria" if rem else "sunday"
        elif rem == "Feria":
            day = "feria"
        else:
            if rem.endswith("Feria"):
                day, rem = "feria", rem[:-5]
            wd = re.search(rf"({TAG_WD_RE})$", rem)
            if wd:
                day = TAG_WEEKDAYS[wd.group(1)]
                rem = rem[:wd.start()]
            if rem.startswith("Ember"):
                special = "ember"
            elif rem.startswith("Whit"):
                special = "whit"
            elif rem.startswith("Ash"):
                special = "ash"
            elif rem:
                special = _special(rem)
        return {"cycle": "temporal", "season": s.lower(), "week": week,
                "day": day, "special": special, "commem": commem, "flags": flags}
    return {"cycle": "unknown", "raw": stem, "flags": flags}


# --- validation -------------------------------------------------------------

def validate(fname, sections):
    # Surfaces files that likely need manual review. Note: several temporal days
    # legitimately repeat sections (Ember Wednesdays/Saturdays have multiple
    # Lessons/Collects; Easter Vigil/Good Friday/Holy Saturday are unique
    # liturgies), so we do NOT flag section repetition/order — only genuinely
    # missing or one-sided content.
    warns = []
    keys = {s["key"] for s in sections}
    if "introit" not in keys or "collect" not in keys:
        warns.append("missing Introit/Collect")
    for s in sections:
        if not s["latin"] and not s["english"]:
            warns.append(f"empty section {s['name']!r}")
        elif not s["latin"] or not s["english"]:
            side = "Latin" if not s["latin"] else "English"
            warns.append(f"{s['name']!r} missing {side}")
    return warns


def main():
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    index = build_index()
    (PDF_DIR / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"manifest: {len(index)} unique proper links")

    selected = [e for e in index if _is_selected(e["file"])]
    print(f"selected: {len(selected)} temporal + major-feast files\n")

    propers, anomalies = [], []
    for e in selected:
        fname = e["file"]
        path = download(fname)
        meta, sections = parse_proper(path)
        warns = validate(fname, sections)
        propers.append({
            "id": slugify(fname),
            "file": fname,
            "title": meta["title"] or e["label"],
            "mass": meta["mass"],
            "color": meta["color"],
            "dates": e["dates"],
            "tag": parse_tag(fname),
            "sections": sections,
        })
        flag = "  ⚠ " + "; ".join(warns) if warns else ""
        if warns:
            anomalies.append(fname)
        print(f"  {fname:52} {len(sections):2} sec{flag}")

    dest = ROOT / "src" / "data" / "propers.json"
    dest.write_text(json.dumps(
        {"coverage": "temporal cycle + major feasts", "propers": propers},
        ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nwrote {dest}: {len(propers)} propers"
          f" ({len(anomalies)} with warnings)")
    if anomalies:
        print("review:", ", ".join(anomalies))


if __name__ == "__main__":
    main()
