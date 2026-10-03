import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { SiteFooter, SiteTopbar } from "@/components/SiteChrome";

/**
 * Frame for the API pages (account, developer docs), built the same way as
 * the fleet and stats pages: site header, a white hero with breadcrumb and a
 * large heading, then full-width bands, then the site footer.
 */
export function PageShell({
  subtitle,
  crumb,
  title,
  intro,
  heroAside,
  source,
  children,
}: {
  subtitle: string;
  crumb: string;
  title: ReactNode;
  intro?: ReactNode;
  heroAside?: ReactNode;
  /** Analytics source tag for the footer links. */
  source: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#f3f4f6",
        fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        color: "#111827",
      }}
    >
      <div style={{ flex: 1 }}>
        <header style={{ borderBottom: "1px solid #e5e7eb", background: "#ffffff" }}>
          <SiteTopbar right={new Date().toISOString().split("T")[0]} />
          <div className="header-main" style={{ padding: "10px 24px", display: "flex", alignItems: "center", gap: 16, background: "#ffffff" }}>
            <Link to="/" style={{ textDecoration: "none" }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: "1px solid #d1d5db" }}>
                <img src="/favicon.svg" alt="Logo" style={{ width: "100%", height: "100%" }} />
              </div>
            </Link>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", letterSpacing: "0.02em", margin: 0 }}>NZ Vehicle Finder</h1>
              <p style={{ fontSize: 11, color: "#6b7280", letterSpacing: "0.12em", margin: 0, textTransform: "uppercase" }}>{subtitle}</p>
            </div>
          </div>
        </header>

        <div style={{ padding: "20px 24px 32px", background: "#ffffff", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 32, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 420px", minWidth: 0 }}>
            <nav style={{ fontSize: 11, color: "#9ca3af", marginBottom: 10, letterSpacing: "0.05em" }}>
              <Link to="/" style={{ color: "#6b7280", textDecoration: "none" }}>Home</Link>
              <span style={{ margin: "0 6px" }}>/</span>
              <span style={{ color: "#111827" }}>{crumb}</span>
            </nav>
            <h2 style={{ fontSize: "clamp(32px, 6vw, 48px)", fontWeight: 800, color: "#0f172a", margin: "0 0 12px", letterSpacing: "-0.03em", lineHeight: 1.1 }}>
              {title}
            </h2>
            {intro && <p style={{ fontSize: 16, color: "#374151", margin: 0, maxWidth: 800 }}>{intro}</p>}
          </div>
          {heroAside}
        </div>

        {children}
      </div>
      <SiteFooter source={source} />
    </div>
  );
}

/** A full-width section, alternating white and grey like the fleet page. */
export function Band({ tone = "white", title, children }: { tone?: "white" | "grey"; title?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ padding: "24px 24px 32px", background: tone === "grey" ? "#f9fafb" : "#ffffff", borderBottom: "1px solid #e5e7eb" }}>
      {title && <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: "0 0 12px", letterSpacing: "-0.01em" }}>{title}</h2>}
      {children}
    </section>
  );
}

/** Same card as the fleet page's headline numbers. */
export function StatCard({ label, value, sub, children }: { label: string; value: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "16px 20px", minWidth: 140 }}>
      <div style={{ fontSize: 9, color: "#6b7280", letterSpacing: "0.18em", marginBottom: 6, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#6b7280", marginTop: 4 }}>{sub}</div>}
      {children}
    </div>
  );
}

/** Big outlined call-to-action, the same shape as the fleet page's sponsor box. */
export function HeroAction({ to, onClick, children, sub }: { to?: string; onClick?: () => void; children: ReactNode; sub?: ReactNode }) {
  const style: React.CSSProperties = {
    fontSize: 13, fontWeight: 700, color: "#0369a1", textDecoration: "none", padding: "10px 24px",
    border: "2px solid #0ea5e9", borderRadius: 8, letterSpacing: "0.1em", display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", lineHeight: 1.2, marginTop: 8, minWidth: 160, background: "#ffffff",
    cursor: "pointer", fontFamily: "inherit",
  };
  const inner = (
    <>
      <span>{children}</span>
      {sub && <span style={{ fontSize: 9, marginTop: 3 }}>{sub}</span>}
    </>
  );
  return to ? <Link to={to} onClick={onClick} style={style}>{inner}</Link> : <button onClick={onClick} style={style}>{inner}</button>;
}
