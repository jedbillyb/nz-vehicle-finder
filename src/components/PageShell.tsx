import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/** Header and page frame for the plain content pages (account, developer docs). */
export function PageShell({ subtitle, crumb, children }: { subtitle: string; crumb: string; children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f3f4f6",
        fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        color: "#111827",
      }}
    >
      <header style={{ borderBottom: "1px solid #e5e7eb", background: "#ffffff" }}>
        <div style={{ background: "#0ea5e9", padding: "4px 24px" }}>
          <span style={{ fontSize: 10, color: "#f9fafb", fontWeight: 600, letterSpacing: "0.16em" }}>
            NZ MOTOR VEHICLE REGISTER · DEVELOPER API
          </span>
        </div>
        <div style={{ padding: "10px 24px", display: "flex", alignItems: "center", gap: 16 }}>
          <Link to="/" style={{ textDecoration: "none" }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #d1d5db", overflow: "hidden" }}>
              <img src="/favicon.svg" alt="NZ Vehicle Finder" style={{ width: "100%", height: "100%" }} />
            </div>
          </Link>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", letterSpacing: "0.02em" }}>NZ Vehicle Finder</div>
            <div style={{ fontSize: 11, color: "#6b7280", letterSpacing: "0.12em", textTransform: "uppercase" }}>{subtitle}</div>
          </div>
          <nav style={{ marginLeft: "auto", display: "flex", gap: 16, fontSize: 12, fontWeight: 600 }}>
            <Link to="/developers" style={{ color: "#0369a1", textDecoration: "none" }}>Docs</Link>
            <Link to="/account" style={{ color: "#0369a1", textDecoration: "none" }}>Account</Link>
          </nav>
        </div>
      </header>
      <main style={{ maxWidth: 880, margin: "0 auto", padding: "20px 16px 48px" }}>
        <nav style={{ fontSize: 11, color: "#9ca3af", marginBottom: 12, letterSpacing: "0.05em" }}>
          <Link to="/" style={{ color: "#6b7280", textDecoration: "none" }}>Home</Link>
          <span style={{ margin: "0 6px" }}>/</span>
          <span style={{ color: "#111827" }}>{crumb}</span>
        </nav>
        {children}
      </main>
    </div>
  );
}
