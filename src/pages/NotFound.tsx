import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { applySeo } from "@/lib/seo";
import { captureEvent } from "@/lib/posthog";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";

const LINKS = [
  { to: "/", label: "Search the register", sub: "Filter 5.9 million vehicles by make, model, colour and more" },
  { to: "/nz-fleet", label: "NZ fleet overview", sub: "Top makes, fuel types and regions" },
  { to: "/developers", label: "API docs", sub: "The same data as JSON" },
];

const NotFound = () => {
  const location = useLocation();

  // Broken links show up in PostHog with where they came from.
  useEffect(() => {
    captureEvent("page_not_found", { path: location.pathname, search: location.search });
  }, [location.pathname, location.search]);

  useEffect(() => {
    applySeo({
      title: "NZ Vehicle Finder - Page not found",
      description: "The requested NZ Vehicle Finder page could not be found.",
      canonical: `https://vehiclefinder.co.nz${location.pathname}`,
      noindex: true,
    });
  }, [location.pathname]);

  return (
    <div className="error-page">
      <SiteHeader source="not_found" subtitle="Page not found" />
      <main className="error-page__main">
        <div className="error-page__code">404</div>
        <h2 className="error-page__title">Page not found</h2>
        <p className="error-page__intro">
          There's nothing at <code>{location.pathname}</code>. It may have moved, or the link has a typo.
        </p>
        <div className="error-page__links">
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to} onClick={() => captureEvent("not_found_link_clicked", { to: l.to, path: location.pathname })}>
              <strong>{l.label} →</strong>
              <small>{l.sub}</small>
            </Link>
          ))}
        </div>
      </main>
      <SiteFooter source="not_found" />
    </div>
  );
};

export default NotFound;
