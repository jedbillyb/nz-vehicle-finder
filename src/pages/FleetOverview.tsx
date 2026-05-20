import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { fetchFleetOverview, type FleetOverview } from "@/lib/vehicleApi";
import { applySeo } from "@/lib/seo";
import { captureEvent } from "@/lib/posthog";
import { makeToSlug } from "@/lib/slugs";
import { tlaToSlug, titleCaseRegion } from "@/lib/slugs";

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "16px 20px", minWidth: 140 }}>
      <div style={{ fontSize: 9, color: "#6b7280", letterSpacing: "0.18em", marginBottom: 6, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#6b7280", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function BreakdownBars({ items, max }: { items: { value: string; count: number }[]; max: number }) {
  const total = items.reduce((s, i) => s + i.count, 0) || 1;
  return (
    <div>
      {items.filter(d => d.value && d.value !== "UNKNOWN").map((d) => (
        <div key={d.value} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <div style={{ width: 130, fontSize: 10, color: "#4b5563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.value}>
            {d.value}
          </div>
          <div style={{ flex: 1, height: 8, background: "#f3f4f6", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(d.count / max) * 100}%`, background: "linear-gradient(90deg,#0ea5e9,#22c55e)" }} />
          </div>
          <div style={{ fontSize: 9, color: "#6b7280", minWidth: 70, textAlign: "right" }}>
            {d.count.toLocaleString("en-NZ")} ({((d.count / total) * 100).toFixed(1)}%)
          </div>
        </div>
      ))}
    </div>
  );
}

export default function FleetOverview() {
  const [data, setData] = useState<FleetOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFleetOverview().then((d) => {
      setData(d);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    applySeo({
      title: "NZ Vehicle Register: 5.9 million vehicles in New Zealand | NZ Vehicle Finder",
      description:
        "Complete statistics for the New Zealand Motor Vehicle Register. Total fleet size, EV count, top makes, fuel types, body styles and regional breakdowns across 5.9 million registered vehicles.",
      keywords:
        "NZ vehicle statistics, NZ fleet size, how many cars in New Zealand, NZ vehicle register statistics, NZ EV count, most popular car NZ",
      canonical: "https://vehiclefinder.co.nz/nz-fleet",
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://vehiclefinder.co.nz/" },
            { "@type": "ListItem", position: 2, name: "NZ Fleet Overview", item: "https://vehiclefinder.co.nz/nz-fleet" },
          ],
        },
        ...(data
          ? [
              {
                "@context": "https://schema.org",
                "@type": "FAQPage",
                mainEntity: [
                  {
                    "@type": "Question",
                    name: "How many vehicles are registered in New Zealand?",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: `There are ${data.total.toLocaleString("en-NZ")} vehicles currently registered with the New Zealand Motor Vehicle Register.`,
                    },
                  },
                  {
                    "@type": "Question",
                    name: "How many electric vehicles are registered in New Zealand?",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: `There are ${(data.fuelTypes.find((f) => f.value === "ELECTRIC")?.count ?? 0).toLocaleString("en-NZ")} battery electric vehicles registered in New Zealand, plus additional plug-in and full hybrids.`,
                    },
                  },
                  {
                    "@type": "Question",
                    name: "What is the most popular car brand in New Zealand?",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: `${data.topMakes[0]?.value ?? "Toyota"} is the most registered vehicle brand in New Zealand with ${data.topMakes[0]?.count.toLocaleString("en-NZ") ?? ""} vehicles on the register.`,
                    },
                  },
                  {
                    "@type": "Question",
                    name: "What percentage of NZ vehicles are used imports?",
                    acceptedAnswer: {
                      "@type": "Answer",
                      text: `${(((data.importStatus.find((s) => s.value === "USED")?.count ?? 0) / data.total) * 100).toFixed(1)}% of registered vehicles in New Zealand are used imports.`,
                    },
                  },
                ],
              },
            ]
          : []),
      ],
    });
  }, [data]);

  const evCount = data?.fuelTypes.find((f) => f.value === "ELECTRIC")?.count ?? 0;
  const usedCount = data?.importStatus.find((s) => s.value === "USED")?.count ?? 0;
  const topMake = data?.topMakes[0];
  const fuelMax = data?.fuelTypes[0]?.count ?? 1;
  const bodyMax = data?.bodyTypes[0]?.count ?? 1;

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
          <div className="header-topbar" style={{ background: "#0ea5e9", padding: "4px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span className="header-topbar-subtitle" style={{ fontSize: "10px", color: "#f9fafb", fontWeight: 600, letterSpacing: "0.16em" }}>
              WAKA KOTAHI · NZ MOTOR VEHICLE REGISTER · PUBLIC ACCESS TERMINAL
            </span>
            <span style={{ fontSize: "10px", color: "#e0f2fe", letterSpacing: "0.1em" }}>
              {new Date().toISOString().split("T")[0]}
            </span>
          </div>
          <div className="header-main" style={{ padding: "10px 24px", display: "flex", alignItems: "center", gap: 16, background: "#ffffff" }}>
            <Link to="/" style={{ textDecoration: "none" }} onClick={() => captureEvent("logo_home_clicked", { source: "fleet_overview" })}>
              <div style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: "1px solid #d1d5db" }}>
                <img src="/favicon.svg" alt="Logo" style={{ width: "100%", height: "100%" }} />
              </div>
            </Link>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", letterSpacing: "0.02em", margin: 0 }}>NZ Vehicle Finder</h1>
              <p style={{ fontSize: 11, color: "#6b7280", letterSpacing: "0.12em", margin: 0, textTransform: "uppercase" }}>
                NZ Fleet Overview
              </p>
            </div>
            {data && (
              <div className="header-count" style={{ marginLeft: "auto", display: "flex", alignItems: "baseline", gap: 6 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#0f766e", lineHeight: 1 }}>{data.total.toLocaleString("en-NZ")}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#6b7280", letterSpacing: "0.05em" }}>VEHICLES REGISTERED</div>
              </div>
            )}
          </div>
        </header>

        {/* Hero */}
        <div style={{ padding: "20px 24px 32px", background: "#ffffff", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 32 }}>
          <div style={{ flex: 1 }}>
            <nav style={{ fontSize: 11, color: "#9ca3af", marginBottom: 10, letterSpacing: "0.05em" }}>
              <Link to="/" style={{ color: "#6b7280", textDecoration: "none" }}>Home</Link>
              <span style={{ margin: "0 6px" }}>/</span>
              <span style={{ color: "#111827" }}>NZ Fleet Overview</span>
            </nav>
            <h2 style={{ fontSize: 48, fontWeight: 800, color: "#0f172a", margin: "0 0 12px", letterSpacing: "-0.03em", lineHeight: 1.1 }}>
              {loading ? "..." : data?.total.toLocaleString("en-NZ")} vehicles on the NZ register
            </h2>
            <p style={{ fontSize: 16, color: "#374151", margin: 0, maxWidth: 800 }}>
              Fleet-wide statistics from the New Zealand Motor Vehicle Register. Fuel types, top makes, body styles, import status and regional breakdowns across every registered vehicle in the country.
            </p>
          </div>
          <a
            onClick={() => captureEvent("sponsor_link_clicked", { location: "hero_fleet_overview" })}
            href="https://buymeacoffee.com/jedbillyb"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 13, fontWeight: 700, color: "#ef4444", textDecoration: "none", padding: "10px 24px", border: "2px solid #ef4444", borderRadius: 8, letterSpacing: "0.1em", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", lineHeight: 1.2, marginTop: 8, minWidth: 160 }}
          >
            <span>SPONSOR</span>
            <span style={{ fontSize: 9, marginTop: 3 }}>THIS PROJECT</span>
          </a>
        </div>

        {/* Stat cards */}
        {data && (
          <div style={{ padding: "20px 24px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb", display: "flex", flexWrap: "wrap", gap: 12 }}>
            <StatCard
              label="TOTAL REGISTERED"
              value={data.total.toLocaleString("en-NZ")}
              sub="Motor Vehicle Register"
            />
            <StatCard
              label="BATTERY ELECTRIC"
              value={evCount.toLocaleString("en-NZ")}
              sub={`${((evCount / data.total) * 100).toFixed(1)}% of fleet`}
            />
            <StatCard
              label="USED IMPORTS"
              value={usedCount.toLocaleString("en-NZ")}
              sub={`${((usedCount / data.total) * 100).toFixed(1)}% of fleet`}
            />
            <StatCard
              label="TOP MAKE"
              value={topMake ? topMake.value.charAt(0) + topMake.value.slice(1).toLowerCase() : "-"}
              sub={topMake ? `${topMake.count.toLocaleString("en-NZ")} registered` : undefined}
            />
            <StatCard
              label="REGIONS"
              value={data.regions.length.toString()}
              sub="Territorial Local Authorities"
            />
          </div>
        )}

        {/* Breakdowns */}
        {data && (
          <div style={{ padding: "24px 24px", background: "#ffffff", borderBottom: "1px solid #e5e7eb" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 32 }}>
              <div>
                <h2 style={{ fontSize: 9, color: "#6b7280", letterSpacing: "0.18em", marginBottom: 12, fontWeight: 700 }}>FUEL TYPE</h2>
                <BreakdownBars items={data.fuelTypes} max={fuelMax} />
              </div>
              <div>
                <h2 style={{ fontSize: 9, color: "#6b7280", letterSpacing: "0.18em", marginBottom: 12, fontWeight: 700 }}>BODY TYPE</h2>
                <BreakdownBars items={data.bodyTypes} max={bodyMax} />
              </div>
              <div>
                <h2 style={{ fontSize: 9, color: "#6b7280", letterSpacing: "0.18em", marginBottom: 12, fontWeight: 700 }}>IMPORT STATUS</h2>
                <BreakdownBars items={data.importStatus} max={data.importStatus[0]?.count ?? 1} />
              </div>
            </div>
          </div>
        )}

        {/* Top makes */}
        {data && (
          <section style={{ padding: "24px 24px 32px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: "0 0 12px", letterSpacing: "-0.01em" }}>
              Top makes by registrations
            </h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {data.topMakes
                .filter((m) => !["TRAILER", "HOMEBUILT", "CARAVAN"].includes(m.value))
                .map((m) => (
                  <Link
                    key={m.value}
                    to={`/stats/${makeToSlug(m.value)}`}
                    onClick={() => captureEvent("fleet_overview_make_clicked", { make: m.value })}
                    style={{ fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 999, border: "1px solid #e5e7eb", background: "#ffffff", color: "#0f172a", textDecoration: "none" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#eff6ff"; e.currentTarget.style.borderColor = "#bfdbfe"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "#ffffff"; e.currentTarget.style.borderColor = "#e5e7eb"; }}
                  >
                    {m.value.charAt(0) + m.value.slice(1).toLowerCase()}
                    <span style={{ fontSize: 10, color: "#9ca3af", fontWeight: 400, marginLeft: 6 }}>
                      {m.count.toLocaleString("en-NZ")}
                    </span>
                  </Link>
                ))}
            </div>
          </section>
        )}

        {/* Regions */}
        {data && (
          <section style={{ padding: "24px 24px 32px", background: "#ffffff", borderBottom: "1px solid #e5e7eb" }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: "0 0 12px", letterSpacing: "-0.01em" }}>
              Browse by region
            </h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {data.regions.map((r) => (
                <Link
                  key={r.value}
                  to={`/region/${tlaToSlug(r.value)}`}
                  onClick={() => captureEvent("fleet_overview_region_clicked", { region: r.value })}
                  style={{ fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 999, border: "1px solid #e5e7eb", background: "#f9fafb", color: "#0f172a", textDecoration: "none" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#eff6ff"; e.currentTarget.style.borderColor = "#bfdbfe"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#f9fafb"; e.currentTarget.style.borderColor = "#e5e7eb"; }}
                >
                  {titleCaseRegion(r.value)}
                  <span style={{ fontSize: 10, color: "#9ca3af", fontWeight: 400, marginLeft: 6 }}>
                    {r.count.toLocaleString("en-NZ")}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {loading && (
          <div style={{ padding: "60px 24px", textAlign: "center", color: "#9ca3af", fontSize: 11, letterSpacing: "0.1em" }}>
            LOADING...
          </div>
        )}
      </div>

      <footer className="footer-root" style={{ padding: "12px 24px", background: "#ffffff", borderTop: "1px solid #e5e7eb", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, fontSize: 10, fontFamily: "'JetBrains Mono', 'Courier New', monospace", color: "#6b7280", letterSpacing: "0.1em" }}>
        <div className="footer-links" style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span>DEVELOPED BY <a href="https://jedbillyb.com" target="_blank" rel="noopener noreferrer" style={{ color: "#0ea5e9", textDecoration: "none", fontWeight: 700 }}>JED BLENKHORN</a></span>
          <span style={{ color: "#d1d5db" }}>·</span>
          <a href="https://github.com/jedbillyb/nz-vehicle-finder" target="_blank" rel="noopener noreferrer" onClick={() => captureEvent("github_link_clicked", { location: "footer", source: "fleet_overview" })} style={{ color: "#111827", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
            SOURCE
          </a>
          <span style={{ color: "#d1d5db" }}>·</span>
          <a href="https://buymeacoffee.com/jedbillyb" target="_blank" rel="noopener noreferrer" style={{ color: "#ef4444", textDecoration: "none", fontWeight: 700 }}>SPONSOR THIS PROJECT</a>
          <span style={{ color: "#d1d5db" }}>·</span>
          <span>© {new Date().getFullYear()}</span>
        </div>
        <div style={{ color: "#9ca3af", fontSize: 9, letterSpacing: "0.08em", textAlign: "center" }}>
          vehiclefinder.co.nz is not affiliated with, endorsed by, or operated by Waka Kotahi NZ Transport Agency. Data sourced from the publicly available Motor Vehicle Register.
        </div>
      </footer>
    </div>
  );
}
