import { useEffect, useMemo, useRef, useState } from "react";
import { missal } from "./data/missal.ts";
import type { Block, Role } from "./data/types.ts";

type Lang = "la" | "en" | "both";

const LANGS: { id: Lang; label: string; short: string }[] = [
  { id: "la", label: "Latin", short: "LA" },
  { id: "en", label: "English", short: "EN" },
  { id: "both", label: "Both", short: "LA·EN" },
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

function usePersistentLang(): [Lang, (l: Lang) => void] {
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem("missal-lang");
    return saved === "la" || saved === "en" || saved === "both" ? saved : "both";
  });
  useEffect(() => {
    localStorage.setItem("missal-lang", lang);
  }, [lang]);
  return [lang, setLang];
}

function VerseView({ block, lang }: { block: Extract<Block, { type: "verse" }>; lang: Lang }) {
  const badge = block.role ? ROLE_BADGE[block.role] : null;
  return (
    <div className="verse">
      {badge ? (
        <span className="role" data-role={block.role} title={ROLE_NAME[block.role!]}>
          {badge}
        </span>
      ) : (
        <span className="role role-empty" aria-hidden="true" />
      )}
      <div className="verse-text">
        {(lang === "la" || lang === "both") && (
          <p className="la" lang="la">
            {block.latin}
          </p>
        )}
        {(lang === "en" || lang === "both") && (
          <p className="en" lang="en">
            {block.english}
          </p>
        )}
      </div>
    </div>
  );
}

function BlockView({ block, lang }: { block: Block; lang: Lang }) {
  if (block.type === "rubric") {
    return <p className="rubric">{block.english}</p>;
  }
  return <VerseView block={block} lang={lang} />;
}

export function App() {
  const [lang, setLang] = usePersistentLang();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeId, setActiveId] = useState<string>(missal.parts[0]?.sections[0]?.id ?? "");
  const contentRef = useRef<HTMLDivElement>(null);

  const sections = useMemo(
    () => missal.parts.flatMap((p) => p.sections.map((s) => ({ ...s, part: p.title }))),
    [],
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
    for (const el of document.querySelectorAll("[data-section]")) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const goto = (id: string) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="app">
      <header className="topbar">
        <button
          className="menu-btn"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Table of contents"
          aria-expanded={menuOpen}
        >
          <span className="menu-icon" aria-hidden="true">
            ☰
          </span>
        </button>
        <div className="titles">
          <h1>{missal.title}</h1>
          <p>{missal.subtitle}</p>
        </div>
        <div className="lang-toggle" role="radiogroup" aria-label="Language">
          {LANGS.map((l) => (
            <button
              key={l.id}
              role="radio"
              aria-checked={lang === l.id}
              className={lang === l.id ? "active" : ""}
              onClick={() => setLang(l.id)}
            >
              {l.short}
            </button>
          ))}
        </div>
      </header>

      {menuOpen && (
        <div className="drawer-backdrop" onClick={() => setMenuOpen(false)}>
          <nav className="drawer" onClick={(e) => e.stopPropagation()} aria-label="Contents">
            <div className="drawer-head">Contents</div>
            {missal.parts.map((part) => (
              <div key={part.id} className="drawer-part">
                <div className="drawer-part-title">{part.title}</div>
                {part.sections.map((s) => (
                  <button
                    key={s.id}
                    className={"drawer-link" + (activeId === s.id ? " active" : "")}
                    onClick={() => goto(s.id)}
                  >
                    {s.title}
                  </button>
                ))}
              </div>
            ))}
            <div className="drawer-foot">
              Text: 1962 Missale Romanum · Extraordinary Form
            </div>
          </nav>
        </div>
      )}

      <main className="content" ref={contentRef}>
        {missal.parts.map((part) => (
          <section key={part.id} className="part">
            <h2 className="part-title">{part.title}</h2>
            {part.note && <p className="part-note">{part.note}</p>}
            {part.sections.map((s) => (
              <article key={s.id} id={s.id} data-section className="section">
                <header className="section-head">
                  <h3>
                    {s.title}
                    {s.proper && <span className="proper-tag">proper</span>}
                  </h3>
                  {s.subtitle && <p className="section-sub">{s.subtitle}</p>}
                </header>
                {s.blocks.map((b, i) => (
                  <BlockView key={i} block={b} lang={lang} />
                ))}
              </article>
            ))}
          </section>
        ))}
        <footer className="colophon">
          <p>
            The Order of Mass according to the 1962 <em>Missale Romanum</em> (the
            Extraordinary Form / Traditional Latin Mass).
          </p>
          <p>
            Sections marked <span className="proper-tag">proper</span> change with
            the liturgical day and are read from the Mass Proper.
          </p>
        </footer>
      </main>
    </div>
  );
}
