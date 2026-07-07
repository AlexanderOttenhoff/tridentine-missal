import { useEffect, useState } from "react";
import { missal } from "./data/missal.ts";
import type { Block, Role } from "./data/types.ts";

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

function VerseView({
  block,
  lang,
}: {
  block: Extract<Block, { type: "verse" }>;
  lang: Lang;
}) {
  return (
    <div className="flex gap-2.5 py-1.5">
      {block.role ? (
        <span
          className={`${badgeBase} ${ROLE_STYLES[block.role]}`}
          title={ROLE_NAME[block.role]}
        >
          {ROLE_BADGE[block.role]}
        </span>
      ) : (
        <span className="shrink-0 w-5" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        {(lang === "la" || lang === "both") && (
          <p
            className="m-0 font-serif text-[1.12rem] leading-relaxed text-ink"
            lang="la"
          >
            {block.latin}
          </p>
        )}
        {(lang === "en" || lang === "both") && (
          <p
            className={
              "m-0 font-serif text-[1rem] leading-relaxed text-ink-soft" +
              (lang === "both" ? " mt-0.5" : "")
            }
            lang="en"
          >
            {block.english}
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
        {block.english}
      </p>
    );
  }
  return <VerseView block={block} lang={lang} />;
}

export function App() {
  const [lang, setLang] = usePersistentLang();
  const [theme, setTheme] = usePersistentTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeId, setActiveId] = useState<string>(
    missal.parts[0]?.sections[0]?.id ?? "",
  );

  // Highlight the section nearest the top of the viewport.
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
  }, []);

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
            <div className="px-4 pt-3 pb-2 font-sans font-bold text-[0.8rem] tracking-widest uppercase text-liturgical">
              Contents
            </div>
            {missal.parts.map((part) => (
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
        {missal.parts.map((part) => (
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
        </footer>
      </main>
    </div>
  );
}
