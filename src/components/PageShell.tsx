import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { HeroAside, SiteFooter, SiteHeader } from "@/components/SiteChrome";

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
  heroApi,
  source,
  children,
}: {
  subtitle: string;
  crumb: string;
  title: ReactNode;
  intro?: ReactNode;
  /** Where the hero's API box points; see HeroAside. */
  heroApi?: { to: string; title: string; sub: string };
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
        <SiteHeader source={source} subtitle={subtitle} />

        <div className="stats-hero" style={{ padding: "20px 24px 32px", background: "#ffffff", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 32 }}>
          <div style={{ flex: 1 }}>
            <nav style={{ fontSize: 11, color: "#9ca3af", marginBottom: 10, letterSpacing: "0.05em" }}>
              <Link to="/" style={{ color: "#6b7280", textDecoration: "none" }}>Home</Link>
              <span style={{ margin: "0 6px" }}>/</span>
              <span style={{ color: "#111827" }}>{crumb}</span>
            </nav>
            <h2 style={{ fontSize: 48, fontWeight: 800, color: "#0f172a", margin: "0 0 12px", letterSpacing: "-0.03em", lineHeight: 1.1 }}>
              {title}
            </h2>
            {intro && <p style={{ fontSize: 16, color: "#374151", margin: 0, maxWidth: 800 }}>{intro}</p>}
          </div>
          <HeroAside source={source} api={heroApi} />
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
    <section className="page-band" style={{ padding: "24px 24px 32px", background: tone === "grey" ? "#f9fafb" : "#ffffff", borderBottom: "1px solid #e5e7eb" }}>
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
