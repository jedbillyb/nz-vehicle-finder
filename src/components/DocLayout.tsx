import { useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * The API docs layout, shared with the account page: a sticky menu on the
 * left (a row of chips on phones) and full-width sections on the right.
 */

export type DocNavGroup = { group: string; items: [string, ReactNode][] };

/** Which section is on screen, so the menu can highlight it. */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  const key = ids.join(",");
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id);
      },
      // A section counts once its top passes just under the sticky header.
      { rootMargin: "-120px 0px -60% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands in for the ids array
  }, [key]);
  return active;
}

export function DocLayout({ label, groups, onNav, navTop, children }: {
  /** Accessible name for the menu. */
  label: string;
  groups: DocNavGroup[];
  onNav?: (id: string) => void;
  /** Shown above the menu groups, e.g. who is signed in. */
  navTop?: ReactNode;
  children: ReactNode;
}) {
  const ids = useMemo(() => groups.flatMap((g) => g.items.map(([id]) => id)), [groups]);
  const active = useActiveSection(ids);
  return (
    <div className="doc-layout">
      <nav className="fade-late doc-nav" aria-label={label}>
        {navTop}
        {groups.map((g) => (
          <div key={g.group} className="doc-nav-group">
            <div className="doc-nav-heading">{g.group}</div>
            {g.items.map(([id, text]) => (
              <a
                key={id}
                href={`#${id}`}
                className={id === active ? "doc-nav-link is-active" : "doc-nav-link"}
                onClick={() => onNav?.(id)}
              >
                {text}
              </a>
            ))}
          </div>
        ))}
      </nav>
      <div className="stagger-in doc-main">{children}</div>
    </div>
  );
}

/** One section, with an anchor the menu links to. */
export function DocSection({ id, title, children }: { id: string; title?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="doc-section">
      {/* 8px, not more: most sections open on a paragraph, whose line spacing
          already adds a few px above the first line. */}
      {title && <h2 style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", margin: "0 0 8px", letterSpacing: "-0.01em" }}>{title}</h2>}
      {children}
    </section>
  );
}

/** Text on the left, code (or a list) on the right; stacked on narrower screens. */
export function Split({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="doc-split">
      <div style={{ minWidth: 0 }}>{left}</div>
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>{right}</div>
    </div>
  );
}
