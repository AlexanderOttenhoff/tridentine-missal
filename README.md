# Missale Romanum · Tridentine Mass

A mobile-first web missal for the **Traditional Latin Mass** (Tridentine Rite,
1962 *Missale Romanum*). It presents the Order of Mass in Latin and English side
by side, and — for **any date, past or future** — computes which Mass(es) may be
said that day and injects the chosen proper into the Ordinary.

**Live site:** https://alexanderottenhoff.github.io/tridentine-missal/

## Features

- **Latin / English / both** toggle across the whole Order of Mass.
- **Perpetual liturgical calendar.** A pure-TypeScript engine computes the 1962
  calendar from scratch (Gregorian computus → the temporal cycle → the sanctoral
  overlay) rather than re-scraping a fixed year. Pick any date; the missal fills
  the day's propers.
- **Mass-of-the-day picker.** The resolver returns every valid Mass for the
  selected date (the day's Mass plus any coinciding feast), ranked with a sensible
  default preselected, each with its vestment colour.
- **Dark mode** that follows the system preference or a manual override, including
  the native date picker.
- No backend, no tracking — a static single-page app.

## Tech stack

Vite + React 19 + TypeScript, Tailwind v4 (CSS-first `@theme` tokens), pnpm.

## Getting started

```sh
pnpm install
pnpm dev        # dev server at http://localhost:5173
pnpm build      # type-check + production build into dist/
pnpm preview    # serve the production build locally
```

## Project layout

```
src/
  App.tsx                 UI: Order of Mass, date control, Mass picker, proper injection
  main.tsx, styles.css    entry + Tailwind theme tokens (light/dark)
  data/                   parsed liturgical data (committed JSON) + composition
    ordinary.json           the fixed Order of Mass
    propers.json            temporal + major-feast propers, each tagged for the engine
    appendix.json           Leonine Prayers after Low Mass
  lib/calendar/           the perpetual calendar engine (pure, framework-free)
    computus.ts             date of Easter + movable-feast helpers
    temporal.ts             temporal day → season / week / weekday signature
    sanctoral.ts            fixed-date feast overlay
    rank.ts                 pragmatic precedence class per candidate
    resolve.ts              resolveDay(date) → ranked candidate Masses
scripts/
  parse_propers.py        downloads + parses the proper PDFs → propers.json (PyMuPDF)
  parse_appendix.py       parses the appendix (Leonine Prayers) → appendix.json
  validate_calendar.ts    checks the engine against the site's own scraped calendar
source/                   scraped/cached source texts (the proper PDFs are git-ignored)
```

## The calendar engine

The core is `createResolver(propers).resolveDay(dayNumber)`, which returns
`{ date, candidates, defaultId }`. Candidates are scored by how well each proper
fits the day's temporal signature; the sanctoral cycle is overlaid on fixed dates;
matches that resolve to the same underlying Mass are de-duplicated so the picker
only ever offers genuinely distinct options.

Run the validator (requires a Node with `--experimental-strip-types`, i.e. Node 22+):

```sh
node --experimental-strip-types scripts/validate_calendar.ts
```

It resolves every date in `source/propers/index.json` (the site's own scraped
liturgical year) and asserts the engine's default matches the site's primary
choice for all Sundays and major feasts.

### Scope / known limitation

Coverage is the **temporal cycle plus the feasts of the Lord** (Christmas,
Epiphany and their octaves, etc.). The general sanctoral cycle (~200 saints) is
deliberately deferred: adding it correctly requires 1962 class-based precedence so
that minor feasts are *commemorated* rather than displacing the Sunday.

The "resumed" Sundays after Epiphany also carry current-year text only — their
proper text exists in the source as this year's baked sentinel files, so producing
correct resumed-Sunday text for an arbitrary future year would need an additional
source.

## Regenerating the data

The parsed JSON under `src/data/` is committed, so you don't need to run the
parsers to build the app. To regenerate them you need Python with PyMuPDF:

```sh
~/.pyenv/versions/3.14.3/bin/python scripts/parse_propers.py
```

(The parser re-downloads the proper PDFs into `source/propers/` — git-ignored — and
rewrites `src/data/propers.json`.)

## Deployment

Pushing to `master` triggers `.github/workflows/deploy.yml`, which builds the site
and publishes it to GitHub Pages. To enable it once:

**Settings → Pages → Build and deployment → Source: GitHub Actions.**

The workflow sets `GITHUB_PAGES=true` so Vite emits the `/tridentine-missal/` base
path the project site needs; local dev and preview stay at the root. You can also
run it on demand from the **Actions** tab (*workflow_dispatch*).

## Sources

The Latin and English texts are extracted from public hand-missal PDFs and the
propers published at extraordinaryform.org; nothing liturgical is hand-authored.
