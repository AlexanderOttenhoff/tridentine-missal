import { useEffect, useMemo, useState } from "react";
import { missal } from "./data/missal.ts";
import { composeMissal } from "./data/compose.ts";
import propersData from "./data/propers.json";
import type { Block, DayResolution, Proper, Role } from "./data/types.ts";
import { createResolver } from "./lib/calendar/resolve.ts";
import { fromDayNum, fromIso, iso, today, weekday } from "./lib/calendar/computus.ts";

const PROPERS = propersData.propers as Proper[];

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Vestment colours → a swatch fill for the Mass-of-the-day picker.
const VESTMENT: Record<string, string> = {
  white: "#f4efe3",
  gold: "#c9a227",
  red: "#a12b2b",
  green: "#4a6b57",
  violet: "#6b4a86",
  purple: "#6b4a86",
  rose: "#d19bb0",
  black: "#333130",
};

function formatDay(n: number): string {
  const { y, m, d } = fromDayNum(n);
  return `${WEEKDAY_NAMES[weekday(n)]} ${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

type Lang = "la" | "en" | "both";

type Theme = "auto" | "light" | "dark";

const LANGS: { id: Lang; short: string }[] = [
  { id: "la", short: "LA" },
  { id: "en", short: "EN" },
  { id: "both", short: "LA·EN" },
];

const THEMES: { id: Theme; label: string; icon: string }[] = [
  { id: "auto", label: "Auto", icon: "◐" },
  { id: "light", label: "Light", icon: "☀" },
  { id: "dark", label: "Dark", icon: "☾" },
];

const ROLE_BADGE: Record<Role, string> = {
  priest: "P",
  server: "S",
  choir: "C",
  faithful: "F",
  all: "A",
};

const ROLE_NAME: Record<Role, string> = {
  priest: "Priest",
  server: "Server",
  choir: "Choir",
  faithful: "Faithful",
  all: "All",
};

const ROLE_STYLES: Record<Role, string> = {
  priest: "bg-liturgical text-white",
  server: "bg-gold text-[#241a05]",
  choir: "bg-[#4a6b57] text-white",
  faithful: "bg-ink-soft text-white",
  all: "bg-[#4a6b57] text-white",
};

const badgeBase =
  "inline-grid place-items-center shrink-0 w-5 h-5 mt-[3px] rounded-full " +
  "font-sans text-[0.62rem] font-bold leading-none select-none";

function usePersistentLang(): [Lang, (l: Lang) => void] {
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem("missal-lang");
    return saved === "la" || saved === "en" || saved === "both"
      ? saved
      : "both";
  });
  useEffect(() => {
    localStorage.setItem("missal-lang", lang);
  }, [lang]);
  return [lang, setLang];
}

function usePersistentTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("missal-theme");
    return saved === "light" || saved === "dark" ? saved : "auto";
  });
  useEffect(() => {
    // "auto" leaves data-theme unset so prefers-color-scheme governs; a manual
    // choice forces the palette via data-theme on <html> (see styles.css).
    const root = document.documentElement;
    if (theme === "auto") {
      root.removeAttribute("data-theme");
      localStorage.removeItem("missal-theme");
    } else {
      root.setAttribute("data-theme", theme);
      localStorage.setItem("missal-theme", theme);
    }
  }, [theme]);
  return [theme, setTheme];
}

// The sign-of-the-cross markers in the source text (🕇 U+1F547, ☩ U+2629,
// ✠ U+2720, ✝ U+271D) all live in sparsely-supported font blocks and render as
// tofu (▯) on many phones. Draw them as an inline SVG cross instead — it inherits
// the surrounding text's colour and size, so it renders identically everywhere.
const CROSS_MARKERS = new Set(["🕇", "☩", "✠", "✝"]);
const CROSS_SPLIT = /(🕇|☩|✠|✝)/u;

function Cross() {
  return (
    <svg
      viewBox="0 0 10 10"
      className="inline-block h-[0.85em] w-[0.85em] align-[-0.06em]"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="4.15" y="0.6" width="1.7" height="8.8" rx="0.5" />
      <rect x="1.5" y="2.7" width="7" height="1.7" rx="0.5" />
    </svg>
  );
}

// Split liturgical text on cross markers, rendering each as <Cross/> and leaving
// the rest as plain text (whitespace-pre-line on the parent preserves spacing).
function withCrosses(text: string) {
  if (!CROSS_SPLIT.test(text)) return text;
  return text
    .split(CROSS_SPLIT)
    .map((part, i) => (CROSS_MARKERS.has(part) ? <Cross key={i} /> : part));
}

function VerseView({
  block,
  lang,
}: {
  block: Extract<Block, { type: "verse" }>;
  lang: Lang;
}) {
  // Some appendix devotions (Leonine Prayers, Divine Praises) are English-only:
  // show the English regardless of the toggle so nothing renders blank, and
  // promote it to the primary style when there is no Latin beside it.
  const hasLatin = block.latin.trim() !== "";
  const showLatin = hasLatin && lang !== "en";
  const showEnglish = lang !== "la" || !hasLatin;
  return (
    <div className="flex gap-2.5 py-1.5">
      {block.role ? (
        <span
          className={`${badgeBase} ${ROLE_STYLES[block.role]}`}
          title={block.congregation ? "Spoken by all (congregation)" : ROLE_NAME[block.role]}
        >
          {ROLE_BADGE[block.role]}
        </span>
      ) : (
        <span className="shrink-0 w-5" aria-hidden="true" />
      )}
      <div
        className={
          "min-w-0 flex-1" +
          (block.congregation
            ? " bg-highlight rounded-md px-2 -mx-0.5 py-0.5"
            : "")
        }
        title={block.congregation ? "Spoken by all (congregation)" : undefined}
      >
        {showLatin && (
          <p
            className="m-0 font-serif text-[1.12rem] leading-relaxed text-ink whitespace-pre-line"
            lang="la"
          >
            {withCrosses(block.latin)}
          </p>
        )}
        {showEnglish && (
          <p
            className={
              "m-0 font-serif leading-relaxed whitespace-pre-line" +
              (showLatin
                ? " mt-0.5 text-[1rem] text-ink-soft"
                : " text-[1.12rem] text-ink")
            }
            lang="en"
          >
            {withCrosses(block.english)}
          </p>
        )}
      </div>
    </div>
  );
}

function BlockView({ block, lang }: { block: Block; lang: Lang }) {
  if (block.type === "rubric") {
    return (
      <p className="my-2 px-2 text-center font-serif italic text-[0.92rem] text-rubric">
        {withCrosses(block.english)}
      </p>
    );
  }
  return <VerseView block={block} lang={lang} />;
}

function ColorDot({ color }: { color?: string }) {
  const fill = (color && VESTMENT[color.toLowerCase()]) || "#b9b2a3";
  return (
    <span
      className="inline-block w-3 h-3 rounded-full shrink-0 border border-black/15"
      style={{ background: fill }}
      title={color ? `${color} vestments` : undefined}
      aria-hidden="true"
    />
  );
}

// The date selector: previous/next-day steppers around a native date input.
// Lives at the top of the contents drawer (the Mass picker in MassBar stays on
// the page). The input is localised en-GB so the week starts on Monday and the
// value reads dd/mm/yyyy.
function DateControl({
  day,
  setDay,
}: {
  day: number;
  setDay: (n: number) => void;
}) {
  return (
    <div className="flex items-center rounded-lg bg-paper border border-line">
      <button
        className="w-9 h-9 grid place-items-center text-ink-soft active:bg-liturgical/10 rounded-l-lg"
        onClick={() => setDay(day - 1)}
        aria-label="Previous day"
      >
        ‹
      </button>
      <input
        type="date"
        lang="en-GB"
        value={iso(day)}
        onChange={(e) => e.target.value && setDay(fromIso(e.target.value))}
        className="flex-1 min-w-0 bg-transparent text-center font-sans text-[0.82rem] text-ink
          outline-none tabular-nums"
        aria-label="Select date"
      />
      <button
        className="w-9 h-9 grid place-items-center text-ink-soft active:bg-liturgical/10 rounded-r-lg"
        onClick={() => setDay(day + 1)}
        aria-label="Next day"
      >
        ›
      </button>
    </div>
  );
}

function MassBar({
  day,
  resolution,
  activeProper,
  onPick,
}: {
  day: number;
  resolution: DayResolution;
  activeProper: Proper | null;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const candidates = resolution.candidates;
  const title = activeProper?.title ?? "No proper for this date";

  return (
    <div
      className="sticky top-14 z-10 flex items-center gap-2 px-3 py-1.5
        bg-paper-2/95 backdrop-blur-md border-b border-line
        shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
    >
      <button
        className="flex-1 min-w-0 flex items-center gap-2.5 px-2.5 py-1 rounded-lg
          bg-paper border border-line text-left active:bg-liturgical/10"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Choose the Mass for this date"
        disabled={candidates.length === 0}
      >
        <ColorDot color={activeProper?.color} />
        <span className="flex-1 min-w-0">
          <span className="block truncate font-serif text-[0.92rem] leading-tight text-ink capitalize">
            {title.toLowerCase()}
          </span>
          <span className="block truncate font-sans text-[0.62rem] text-ink-soft">
            {formatDay(day)}
          </span>
        </span>
        {candidates.length > 1 && (
          <span className="shrink-0 font-sans text-[0.6rem] text-ink-soft">
            {candidates.length} ▾
          </span>
        )}
      </button>

      {open && candidates.length > 0 && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute right-3 top-11 z-20 w-[min(88vw,22rem)] max-h-[60vh] overflow-y-auto
              rounded-xl bg-card border border-line shadow-[0_6px_24px_rgba(0,0,0,0.22)] py-1"
            role="listbox"
          >
            <div className="px-3 pt-1.5 pb-1 font-sans text-[0.6rem] uppercase tracking-widest text-ink-soft">
              Mass for {formatDay(day)}
            </div>
            {candidates.map((c) => {
              const selected = c.proper.id === activeProper?.id;
              return (
                <button
                  key={c.proper.id}
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onPick(c.proper.id);
                    setOpen(false);
                  }}
                  className={
                    "w-full flex items-center gap-2.5 px-3 py-2 text-left active:bg-liturgical/10 " +
                    (selected ? "bg-liturgical/8" : "")
                  }
                >
                  <ColorDot color={c.proper.color} />
                  <span className="flex-1 min-w-0">
                    <span className="block truncate font-serif text-[0.95rem] text-ink capitalize">
                      {c.proper.title.toLowerCase()}
                    </span>
                    {c.proper.mass && (
                      <span className="block truncate font-serif italic text-[0.76rem] text-ink-soft">
                        {c.proper.mass}
                      </span>
                    )}
                  </span>
                  {selected && <span className="shrink-0 text-gold text-sm">✓</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export function App() {
  const [lang, setLang] = usePersistentLang();
  const [theme, setTheme] = usePersistentTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  // The liturgical day and the chosen Mass Proper for it.
  const [day, setDayRaw] = useState<number>(() => today());
  const [override, setOverride] = useState<string | null>(null);
  const resolver = useMemo(() => createResolver(PROPERS), []);
  const resolution = useMemo(() => resolver.resolveDay(day), [resolver, day]);
  const activeProperId = override ?? resolution.defaultId;
  const activeProper = useMemo(
    () => PROPERS.find((p) => p.id === activeProperId) ?? null,
    [activeProperId],
  );
  const composed = useMemo(() => composeMissal(missal, activeProper), [activeProper]);

  // Changing the date drops any manual override so the new day's default shows.
  const setDay = (n: number) => {
    setOverride(null);
    setDayRaw(n);
  };

  const [activeId, setActiveId] = useState<string>(
    missal.parts[0]?.sections[0]?.id ?? "",
  );

  // Highlight the section nearest the top of the viewport. Re-observed when the
  // composed sections change (a different Mass adds/removes the Secret).
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 },
    );
    for (const el of document.querySelectorAll("[data-section]"))
      observer.observe(el);
    return () => observer.disconnect();
  }, [composed]);

  const goto = (id: string) => {
    setMenuOpen(false);
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="mx-auto max-w-190">
      <header
        className="sticky top-0 z-20 flex items-center gap-2 min-h-14 px-3 pb-1.5
          pt-[max(0.375rem,env(safe-area-inset-top))]
          bg-liturgical/90 backdrop-blur-md text-[#fdf3e3]
          shadow-[0_2px_10px_rgba(0,0,0,0.2)]"
      >
        <button
          className="shrink-0 w-10 h-10 grid place-items-center rounded-lg bg-white/10
            active:bg-white/25 text-[#fdf3e3] text-xl transition-colors"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Table of contents"
          aria-expanded={menuOpen}
        >
          ☰
        </button>
        <div className="flex-1 min-w-0 leading-tight">
          <h1 className="m-0 font-serif text-[1.2rem] font-semibold tracking-wide">
            {missal.title}
          </h1>
          <p className="m-0 mt-0.5 font-sans text-[0.62rem] opacity-80 truncate">
            {missal.subtitle}
          </p>
        </div>
        <div
          className="shrink-0 flex bg-black/25 rounded-lg p-0.5 font-sans"
          role="radiogroup"
          aria-label="Language"
        >
          {LANGS.map((l) => (
            <button
              key={l.id}
              role="radio"
              aria-checked={lang === l.id}
              onClick={() => setLang(l.id)}
              className={
                "px-1.5 py-1.5 rounded-md text-[0.62rem] font-semibold tracking-wide transition-colors " +
                (lang === l.id ? "bg-gold text-[#241a05]" : "text-[#f2e2c8]")
              }
            >
              {l.short}
            </button>
          ))}
        </div>
      </header>

      <MassBar
        day={day}
        resolution={resolution}
        activeProper={activeProper}
        onPick={setOverride}
      />

      {menuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/45 animate-drawer-fade"
          onClick={() => setMenuOpen(false)}
        >
          <nav
            className="w-[min(82vw,340px)] h-full overflow-y-auto bg-paper-2 pb-8
              pt-[max(0.5rem,env(safe-area-inset-top))]
              shadow-[2px_0_16px_rgba(0,0,0,0.3)] animate-drawer-slide"
            onClick={(e) => e.stopPropagation()}
            aria-label="Contents"
          >
            <div className="px-4 pt-3 pb-2">
              <div className="mb-1.5 font-sans text-[0.68rem] tracking-wider uppercase text-ink-soft">
                Date
              </div>
              <DateControl day={day} setDay={setDay} />
              <div className="mt-1.5 font-serif text-[0.9rem] text-ink capitalize">
                {formatDay(day)}
              </div>
            </div>
            <div className="mx-4 border-t border-line" />
            <div className="px-4 pt-3 pb-2 font-sans font-bold text-[0.8rem] tracking-widest uppercase text-liturgical">
              Contents
            </div>
            {composed.parts.map((part) => (
              <div key={part.id} className="py-1.5">
                <div className="px-4 py-1.5 font-sans text-[0.68rem] tracking-wider uppercase text-ink-soft">
                  {part.title}
                </div>
                {part.sections.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => goto(s.id)}
                    className={
                      "block w-full text-left py-2 pl-6 pr-4 font-serif text-base " +
                      "border-l-[3px] transition-colors active:bg-liturgical/10 " +
                      (activeId === s.id
                        ? "text-liturgical border-gold font-semibold"
                        : "text-ink border-transparent")
                    }
                  >
                    {s.title}
                  </button>
                ))}
              </div>
            ))}
            <div className="mx-4 mt-2 pt-4 border-t border-line">
              <div className="mb-1.5 font-sans text-[0.68rem] tracking-wider uppercase text-ink-soft">
                Appearance
              </div>
              <div
                className="flex gap-1 bg-paper rounded-lg p-0.5 font-sans"
                role="radiogroup"
                aria-label="Theme"
              >
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    role="radio"
                    aria-checked={theme === t.id}
                    onClick={() => setTheme(t.id)}
                    className={
                      "flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md " +
                      "text-[0.72rem] font-semibold transition-colors " +
                      (theme === t.id
                        ? "bg-liturgical text-white"
                        : "text-ink-soft")
                    }
                  >
                    <span aria-hidden="true">{t.icon}</span>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mx-4 mt-4 font-sans text-[0.68rem] text-ink-soft">
              Text: 1962 Missale Romanum · Extraordinary Form
            </div>
          </nav>
        </div>
      )}

      <main className="px-3 pt-2 pb-16">
        {composed.parts.map((part) => (
          <section key={part.id}>
            <h2 className="flex items-center justify-center gap-2 mt-8 mb-1 font-sans text-[0.78rem] font-bold uppercase tracking-[0.14em] text-liturgical">
              <span className="text-gold text-[0.7rem]" aria-hidden="true">
                ✦
              </span>
              {part.title}
              <span className="text-gold text-[0.7rem]" aria-hidden="true">
                ✦
              </span>
            </h2>
            {part.note && (
              <p className="mb-2 text-center font-serif italic text-[0.9rem] text-ink-soft">
                {part.note}
              </p>
            )}
            {part.sections.map((s) => (
              <article
                key={s.id}
                id={s.id}
                data-section
                className="scroll-mt-20 mt-4 rounded-2xl border border-line bg-card px-4 py-4
                  shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
              >
                <header className="mb-2">
                  <h3 className="m-0 flex items-baseline gap-2 font-serif text-[1.5rem] font-semibold text-ink">
                    {s.title}
                    {s.proper && (
                      <span className="font-sans text-[0.58rem] font-bold uppercase tracking-wide text-gold border border-gold rounded-full px-1.5 py-0.5">
                        proper
                      </span>
                    )}
                  </h3>
                  {s.subtitle && (
                    <p className="m-0 mt-0.5 font-sans text-[0.82rem] text-ink-soft">
                      {s.subtitle}
                    </p>
                  )}
                </header>
                {s.blocks.map((b, i) => (
                  <BlockView key={i} block={b} lang={lang} />
                ))}
              </article>
            ))}
          </section>
        ))}
        <footer className="mt-10 pt-4 px-1 border-t border-line font-sans text-[0.78rem] text-ink-soft leading-relaxed">
          <p>
            The Order of Mass according to the 1962 <em>Missale Romanum</em>{" "}
            (the Extraordinary Form / Traditional Latin Mass).
          </p>
          <p className="mt-2">
            Sections marked{" "}
            <span className="font-bold uppercase tracking-wide text-gold">
              proper
            </span>{" "}
            change with the liturgical day and are read from the Mass Proper.
          </p>
          <p className="mt-2">
            <span className="bg-highlight rounded px-1 text-ink">Highlighted</span>{" "}
            responses are spoken by all — the congregation, together with the
            servers.
          </p>
        </footer>
      </main>
    </div>
  );
}
