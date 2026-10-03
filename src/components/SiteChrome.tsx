import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { captureEvent } from "@/lib/posthog";
import { APP_VERSION } from "@/lib/version";

const NAV_ITEMS = [
  { to: "/", label: "SEARCH", end: true },
  { to: "/nz-fleet", label: "NZ FLEET", end: false },
  { to: "/developers", label: "API", end: false },
  { to: "/account", label: "ACCOUNT", end: false },
];

function NavLinks({ location, gap }: { location: string; gap: number }) {
  return (
    <nav style={{ display: "flex", alignItems: "center", gap }}>
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={() => captureEvent("nav_link_clicked", { location, to: item.to })}
          style={({ isActive }) => ({
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.12em",
            color: "#ffffff",
            textDecoration: isActive ? "underline" : "none",
            textUnderlineOffset: 3,
            opacity: isActive ? 1 : 0.85,
          })}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

/**
 * The blue strip above every page header, carrying the site-wide links. The
 * full strip is hidden on phones (see responsive.css), so a slimmer one with
 * just the links takes its place there.
 */
export function SiteTopbar({ right }: { right?: ReactNode }) {
  return (
    <>
    <div className="site-nav-mobile" style={{ background: "#0ea5e9", padding: "6px 16px", justifyContent: "center" }}>
      <NavLinks location="topbar_mobile" gap={18} />
    </div>
    <div className="header-topbar" style={{ background: "#0ea5e9", padding: "4px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
      <span className="header-topbar-subtitle" style={{ fontSize: "10px", color: "#f9fafb", fontWeight: 600, letterSpacing: "0.16em" }}>
        WAKA KOTAHI · NZ MOTOR VEHICLE REGISTER · PUBLIC ACCESS TERMINAL
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <NavLinks location="topbar" gap={14} />
        {right && (
          <span style={{ fontSize: "10px", color: "#e0f2fe", letterSpacing: "0.1em", whiteSpace: "nowrap" }}>{right}</span>
        )}
      </div>
    </div>
    </>
  );
}

const sep = <span style={{ color: "#d1d5db" }}>·</span>;

/** Footer shared by every page. `source` and `eventProps` tag the analytics events with where they came from. */
export function SiteFooter({ source, eventProps }: { source: string; eventProps?: Record<string, unknown> }) {
  const track = (event: string) => captureEvent(event, { location: "footer", source, ...eventProps });
  return (
    <footer className="footer-root" style={{ padding: "12px 24px", background: "#ffffff", borderTop: "1px solid #e5e7eb", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, fontSize: 10, fontFamily: "'JetBrains Mono', 'Courier New', monospace", color: "#6b7280", letterSpacing: "0.1em" }}>
      <div className="footer-links" style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span>
          DEVELOPED BY{" "}
          <a href="https://jedbillyb.com" target="_blank" rel="noopener noreferrer" onClick={() => track("jedbillyb_link_clicked")} style={{ color: "#0ea5e9", textDecoration: "none", fontWeight: 700 }}>
            JED BLENKHORN
          </a>
        </span>
        {sep}
        <a
          href="https://github.com/jedbillyb/nz-vehicle-finder"
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track("github_link_clicked")}
          style={{ color: "#111827", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
          SOURCE
        </a>
        {sep}
        <Link to="/developers" onClick={() => track("api_docs_link_clicked")} style={{ color: "#0369a1", textDecoration: "none", fontWeight: 700 }}>
          API
        </Link>
        {sep}
        <Link to="/account" onClick={() => track("account_link_clicked")} style={{ color: "#0369a1", textDecoration: "none", fontWeight: 700 }}>
          ACCOUNT
        </Link>
        {sep}
        <a href="https://buymeacoffee.com/jedbillyb" target="_blank" rel="noopener noreferrer" onClick={() => track("sponsor_link_clicked")} style={{ color: "#ef4444", textDecoration: "none", fontWeight: 700 }}>
          SPONSOR THIS PROJECT
        </a>
        {sep}
        <span>© {new Date().getFullYear()}</span>
        {sep}
        <span style={{ fontWeight: 600 }}>V{APP_VERSION}</span>
      </div>
      <div style={{ color: "#9ca3af", fontSize: 9, letterSpacing: "0.08em", textAlign: "center" }}>
        vehiclefinder.co.nz is not affiliated with, endorsed by, or operated by Waka Kotahi NZ Transport Agency. Data sourced from the publicly available Motor Vehicle Register.
      </div>
    </footer>
  );
}
