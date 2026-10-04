import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { useParams, Link } from "react-router-dom";
import { Pagination } from "@/components/Pagination";
import { ResultStats } from "@/components/ResultStats";
import {
  fetchBreakdown,
  fetchTopRegions,
  searchVehicles,
  type BreakdownData,
} from "@/lib/vehicleApi";
import { applySeo } from "@/lib/seo";
import { captureEvent, summarizeFilters } from "@/lib/posthog";
import { Vehicle } from "@/lib/mockData";
import { tlaToSlug, slugToTla, titleCaseRegion, titleCaseMake } from "@/lib/slugs";
import { getRegionBlurb } from "@/lib/regionContent";
import { HeroAside, SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { resultColumns } from "@/lib/resultColumns";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isMobile;
}

const VehicleDetail = lazy(() =>
  import("@/components/VehicleDetail").then((m) => ({ default: m.VehicleDetail }))
);

type SortConfig = { key: keyof Vehicle; dir: "asc" | "desc" } | null;

export default function RegionStats() {
  const { tla } = useParams<{ tla: string }>();
  const tlaUpper = slugToTla(tla || "");
  const tlaDisplay = titleCaseRegion(tlaUpper);

  const [results, setResults] = useState<Vehicle[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [sort, setSort] = useState<SortConfig>(null);
  const [breakdown, setBreakdown] = useState<BreakdownData>({});
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [otherRegions, setOtherRegions] = useState<{ value: string; count: number }[]>([]);
  const breakdownAbortRef = useRef<AbortController | null>(null);
  const initialLoad = useRef(true);
  const isSearching = useRef(false);

  const filters = useMemo(() => ({ TLA: tlaUpper }), [tlaUpper]);

  const doSearch = useCallback(async (f: Record<string, string | undefined>, p: number) => {
    if (isSearching.current) return;
    isSearching.current = true;
    setLoading(true);
    const startedAt = Date.now();

    const searchMeta = {
      trigger: "region_stats_page",
      page: p,
      device: window.innerWidth < 768 ? "mobile" : "desktop",
      ...summarizeFilters(f),
    };
    captureEvent("search_started", searchMeta);

    try {
      const data = await searchVehicles(f, p);
      setResults(data.vehicles);
      setTotal(data.total);
      setPages(data.pages);
      setSort(null);

      captureEvent("search_completed", { ...searchMeta, result_count: data.total, page_count: data.pages, latency_ms: Date.now() - startedAt });

      if (p === 1) {
        breakdownAbortRef.current?.abort();
        const controller = new AbortController();
        breakdownAbortRef.current = controller;
        setBreakdownLoading(true);
        fetchBreakdown(f, controller.signal)
          .then((bd) => { if (breakdownAbortRef.current === controller) setBreakdown(bd); })
          .catch((err) => { if (err instanceof Error && err.name === "AbortError") return; })
          .finally(() => {
            if (breakdownAbortRef.current === controller) {
              breakdownAbortRef.current = null;
              setBreakdownLoading(false);
            }
          });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      isSearching.current = false;
    }
  }, []);

  useEffect(() => {
    if (!initialLoad.current) return;
    initialLoad.current = false;
    doSearch(filters, 1);
    fetchTopRegions().then((regions) => {
      setOtherRegions(regions.filter((r) => r.value.toUpperCase() !== tlaUpper));
    });
    return () => breakdownAbortRef.current?.abort();
  }, [filters, doSearch, tlaUpper]);

  const top = useMemo(() => {
    const pick = (key: string) => breakdown[key]?.[0];
    return {
      make: pick("MAKE"),
      fuel: pick("MOTIVE_POWER"),
      colour: pick("BASIC_COLOUR"),
      bodyType: pick("BODY_TYPE"),
    };
  }, [breakdown]);

  const blurb = useMemo(() => getRegionBlurb(tlaUpper), [tlaUpper]);
  const canonical = `https://vehiclefinder.co.nz/region/${encodeURIComponent(tla || "")}`;

  useEffect(() => {
    const totalText = total !== null ? total.toLocaleString("en-NZ") : "";
    const title =
      total !== null
        ? `${tlaDisplay}: ${totalText} vehicles registered | NZ Vehicle Finder`
        : `${tlaDisplay} vehicle statistics | NZ Vehicle Finder`;
    const description =
      total !== null
        ? `${totalText} vehicles are registered in ${tlaDisplay}, New Zealand.${top.make ? ` Most popular make is ${titleCaseMake(top.make.value)}.` : ""} View full breakdowns from the Motor Vehicle Register.`
        : `Browse vehicles registered in ${tlaDisplay}, New Zealand. View counts, breakdowns and full listings from the Motor Vehicle Register.`;

    const jsonLd: object[] = [
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://vehiclefinder.co.nz/" },
          { "@type": "ListItem", position: 2, name: "NZ Fleet Overview", item: "https://vehiclefinder.co.nz/nz-fleet" },
          { "@type": "ListItem", position: 3, name: tlaDisplay, item: canonical },
        ],
      },
    ];

    if (total !== null) {
      jsonLd.push({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: `How many vehicles are registered in ${tlaDisplay}?`,
            acceptedAnswer: {
              "@type": "Answer",
              text: `There are ${totalText} vehicles registered in ${tlaDisplay} with the New Zealand Motor Vehicle Register.`,
            },
          },
          ...(top.make
            ? [{
                "@type": "Question",
                name: `What is the most popular car brand in ${tlaDisplay}?`,
                acceptedAnswer: {
                  "@type": "Answer",
                  text: `The most registered vehicle brand in ${tlaDisplay} is ${top.make.value} with ${top.make.count.toLocaleString("en-NZ")} registrations.`,
                },
              }]
            : []),
          ...(top.fuel
            ? [{
                "@type": "Question",
                name: `What is the most common fuel type in ${tlaDisplay}?`,
                acceptedAnswer: {
                  "@type": "Answer",
                  text: `The most common fuel type for vehicles registered in ${tlaDisplay} is ${top.fuel.value.toLowerCase()}, with ${top.fuel.count.toLocaleString("en-NZ")} registered vehicles.`,
                },
              }]
            : []),
        ],
      });
    }

    applySeo({
      title,
      description,
      keywords: `${tlaDisplay} vehicle register, how many cars in ${tlaDisplay}, ${tlaDisplay} vehicle statistics, NZ vehicle register`,
      canonical,
      jsonLd,
    });
  }, [tla, tlaDisplay, canonical, total, top.make, top.fuel]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    captureEvent("page_changed", {
      page: newPage,
      result_count: total ?? 0,
      source: "region_stats_page",
    });
    doSearch(filters, newPage);
  };

  const handleSort = (key: keyof Vehicle) => {
    setSort((prev) => {
      const next: SortConfig =
        prev?.key === key ? (prev.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" };
      captureEvent("results_sorted", { column: key, direction: next?.dir || "none", result_count: total ?? 0, source: "region_stats_page" });
      return next;
    });
  };

  const isMobile = useIsMobile();

  const sortedResults = useMemo(
    () =>
      sort
        ? [...results].sort((a, b) => {
            const av = a[sort.key] || "";
            const bv = b[sort.key] || "";
            const cmp = av.localeCompare(bv, undefined, { numeric: true });
            return sort.dir === "asc" ? cmp : -cmp;
          })
        : results,
    [results, sort]
  );

  const displayResults = isMobile ? sortedResults.slice(0, Math.ceil(sortedResults.length / 2)) : sortedResults;

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
        <SiteHeader
          source="region_stats_page"
          count={total}
          subtitle={
            <>
              <Link to="/nz-fleet" style={{ color: "#0ea5e9", textDecoration: "none" }} onClick={() => captureEvent("breadcrumb_fleet_clicked", { tla: tlaUpper })}>
                NZ Fleet
              </Link>
              {" "}· {tlaUpper} Statistics
            </>
          }
        />

        <div className="stats-hero" style={{ padding: "20px 24px 32px", background: "#ffffff", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 32 }}>
          <div style={{ flex: 1 }}>
            <nav style={{ fontSize: 11, color: "#9ca3af", marginBottom: 10, letterSpacing: "0.05em" }}>
              <Link to="/" style={{ color: "#6b7280", textDecoration: "none" }}>Home</Link>
              <span style={{ margin: "0 6px" }}>/</span>
              <Link to="/nz-fleet" style={{ color: "#6b7280", textDecoration: "none" }}>NZ Fleet</Link>
              <span style={{ margin: "0 6px" }}>/</span>
              <span style={{ color: "#111827" }}>{tlaDisplay}</span>
            </nav>
            <h2 style={{ fontSize: 48, fontWeight: 800, color: "#0f172a", margin: "0 0 12px", letterSpacing: "-0.03em", lineHeight: 1.1 }}>
              {total !== null ? total.toLocaleString("en-NZ") : "..."} vehicles registered in {tlaDisplay}
            </h2>
            <p style={{ fontSize: 16, color: "#374151", margin: 0, maxWidth: 800 }}>
              Breakdown and full listing of all vehicles registered in {tlaDisplay} on the New Zealand Motor Vehicle Register.
            </p>
            {blurb.blurb && (
              <p style={{ fontSize: 12, color: "#6b7280", margin: "8px 0 0", lineHeight: 1.7, maxWidth: 800 }}>
                {blurb.blurb}
              </p>
            )}
            <Link
              to={`/?TLA=${encodeURIComponent(tlaUpper)}`}
              onClick={() => captureEvent("refine_further_clicked", { source: "region_stats_page", tla: tlaUpper })}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 16, fontSize: 13, fontWeight: 600, color: "#0ea5e9", textDecoration: "none", padding: "8px 16px", border: "1px solid #bae6fd", borderRadius: 8, background: "#f0f9ff", letterSpacing: "0.02em" }}
            >
              Refine further <span aria-hidden>→</span>
            </Link>
          </div>
          <HeroAside source="region_stats_page" />
        </div>

        {/* Skeleton from the first paint, not only once the totals are back. */}
        <ResultStats data={breakdown} loading={breakdownLoading || (loading && total === null)} />

        {total !== null && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden", background: "#f3f4f6" }}>
            <div className="results-bar" style={{ padding: "6px 24px", background: "#ffffff", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ fontSize: 10, color: "#6b7280", letterSpacing: "0.1em", margin: 0, fontWeight: 400 }}>
                SHOWING <span style={{ color: "#111827" }}>{displayResults.length.toLocaleString("en-NZ")}</span> OF{" "}
                <span style={{ color: "#0f766e" }}>{total.toLocaleString("en-NZ")}</span> RECORDS
                {pages > 1 && <> · PAGE <span style={{ color: "#111827" }}>{page}</span>/<span style={{ color: "#4b5563" }}>{pages}</span></>}
              </h2>
              {sort && (
                <span style={{ fontSize: 10, color: "#6b7280", letterSpacing: "0.1em" }}>
                  SORT: <span style={{ color: "#0ea5e9" }}>{sort.key}</span>{" "}
                  <span style={{ color: "#4b5563" }}>{sort.dir === "asc" ? "↑" : "↓"}</span>
                </span>
              )}
            </div>

            <div style={{ overflowX: "auto", flex: 1, overflowY: "auto" }}>
              <table className="results-table" style={{ width: "100%", minWidth: 1000, borderCollapse: "collapse", fontSize: 11, tableLayout: "fixed", background: "#ffffff" }}>
                <thead style={{ position: "sticky", top: 0, background: "#f9fafb", zIndex: 10 }}>
                  <tr>
                    {resultColumns.map((col) => (
                      <th
                        key={col.key}
                        onClick={() => handleSort(col.key)}
                        style={{ padding: "8px 16px", textAlign: "left", fontSize: 9, letterSpacing: "0.2em", color: sort?.key === col.key ? "#0ea5e9" : "#6b7280", cursor: "pointer", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap", fontWeight: 700, userSelect: "none", overflow: "hidden", textOverflow: "ellipsis", width: col.width }}
                      >
                        {col.label}
                        {sort?.key === col.key && <span style={{ marginLeft: 4, color: "#0ea5e9" }}>{sort.dir === "asc" ? "↑" : "↓"}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading && results.length === 0 ? (
                    <tr><td colSpan={resultColumns.length} style={{ padding: "60px 24px", textAlign: "center", color: "#9ca3af", fontSize: 11, letterSpacing: "0.1em" }}>LOADING...</td></tr>
                  ) : sortedResults.length === 0 ? (
                    <tr><td colSpan={resultColumns.length} style={{ padding: "60px 24px", textAlign: "center", color: "#9ca3af", fontSize: 11, letterSpacing: "0.1em" }}>NO RECORDS FOUND</td></tr>
                  ) : (
                    displayResults.map((v, i) => (
                      <tr
                        key={i}
                        onClick={() => {
                          setSelectedVehicle(v);
                          captureEvent("vehicle_detail_viewed", { make: v.MAKE, model: v.MODEL, year: v.VEHICLE_YEAR, vin11: v.VIN11, source: "region_stats_page" });
                        }}
                        style={{ cursor: "pointer", borderBottom: "1px solid #e5e7eb", background: i % 2 === 0 ? "#ffffff" : "#f9fafb" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#eff6ff")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? "#ffffff" : "#f9fafb")}
                      >
                        {resultColumns.map((col, ci) => (
                          <td key={col.key} style={{ padding: "7px 16px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: ci === 0 ? "#111827" : ci === 8 ? "#9ca3af" : "#4b5563", fontWeight: ci === 0 ? 600 : 400, fontSize: 11 }}>
                            {v[col.key] || <span style={{ color: "#d1d5db" }}>-</span>}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <Pagination page={page} pages={pages} onPageChange={handlePageChange} />
          </div>
        )}

        {otherRegions.length > 0 && (
          <section className="page-band" style={{ padding: "24px 24px 32px", background: "#ffffff", borderTop: "1px solid #e5e7eb" }}>
            <div style={{ maxWidth: 1200, margin: "0 auto" }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: "0 0 12px", letterSpacing: "-0.01em" }}>
                Other regions
              </h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {otherRegions.map((r) => (
                  <Link
                    key={r.value}
                    to={`/region/${tlaToSlug(r.value)}`}
                    onClick={() => captureEvent("related_region_clicked", { from: tlaUpper, to: r.value })}
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
            </div>
          </section>
        )}

        {selectedVehicle && (
          <Suspense fallback={null}>
            <VehicleDetail vehicle={selectedVehicle} onClose={() => setSelectedVehicle(null)} />
          </Suspense>
        )}
      </div>

      <SiteFooter source="region_stats_page" eventProps={{ tla: tlaUpper }} />
    </div>
  );
}
