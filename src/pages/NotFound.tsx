import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { applySeo } from "@/lib/seo";
import { Band, PageShell } from "@/components/PageShell";

const LINKS = [
  { to: "/", label: "Search the register", sub: "Filter 5.9 million vehicles by make, model, colour and more" },
  { to: "/nz-fleet", label: "NZ fleet overview", sub: "Top makes, fuel types and regions" },
  { to: "/developers", label: "API docs", sub: "The same data as JSON" },
];

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    applySeo({
      title: "NZ Vehicle Finder - Page not found",
      description: "The requested NZ Vehicle Finder page could not be found.",
      canonical: `https://vehiclefinder.co.nz${location.pathname}`,
      noindex: true,
    });
  }, [location.pathname]);

  return (
    <PageShell
      source="not_found"
      subtitle="Page not found"
      crumb="Not found"
      title="Page not found"
      intro={<>There's nothing at <code style={{ fontSize: 14, background: "#f3f4f6", padding: "1px 6px", borderRadius: 4, wordBreak: "break-all" }}>{location.pathname}</code>. It may have moved, or the link has a typo.</>}
    >
      <Band tone="grey" title="Try one of these">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(240px, 100%), 1fr))", gap: 12 }}>
          {LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              style={{ display: "block", textDecoration: "none", background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 16px" }}
            >
              <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "#0369a1" }}>{l.label} →</span>
              <span style={{ display: "block", fontSize: 12, color: "#6b7280", marginTop: 2 }}>{l.sub}</span>
            </Link>
          ))}
        </div>
      </Band>
    </PageShell>
  );
};

export default NotFound;
