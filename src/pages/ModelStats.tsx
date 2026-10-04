import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { useParams, Link } from "react-router-dom";
import { Pagination } from "@/components/Pagination";
import { ResultStats } from "@/components/ResultStats";
import {
  fetchBreakdown,
  fetchTopModels,
  searchVehicles,
  type BreakdownData,
} from "@/lib/vehicleApi";
import { applySeo } from "@/lib/seo";
import { captureEvent, summarizeFilters } from "@/lib/posthog";
import { Vehicle } from "@/lib/mockData";
import { modelToSlug, slugToMakeUpper, slugToModel, titleCaseModel, titleCaseMake } from "@/lib/slugs";
import { HeroAside, SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { resultColumns } from "@/lib/resultColumns";
import { LoadingDots } from "@/components/LoadingDots";
import { LinkTiles } from "@/components/LinkTiles";

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

export default function ModelStats() {
  const { make, model } = useParams<{ make: string; model: string }>();
  const makeUpper = slugToMakeUpper(make || "");
  const modelUpper = slugToModel(model || "");
  const makeDisplay = titleCaseMake(makeUpper);
  const modelDisplay = titleCaseModel(modelUpper);

  const [results, setResults] = useState<Vehicle[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [sort, setSort] = useState<SortConfig>(null);
  const [breakdown, setBreakdown] = useState<BreakdownData>({});
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [otherModels, setOtherModels] = useState<{ model: string; count: number }[]>([]);
  const breakdownAbortRef = useRef<AbortController | null>(null);
  const initialLoad = useRef(true);
  const isSearching = useRef(false);

  const filters = useMemo(() => ({ MAKE: makeUpper, MODEL: modelUpper }), [makeUpper, modelUpper]);

  const doSearch = useCallback(async (f: Record<string, string | undefined>, p: number) => {
    if (isSearching.current) return;
    isSearching.current = true;
    setLoading(true);
    const startedAt = Date.now();

    const searchMeta = {
      trigger: "model_stats_page",
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

      captureEvent("search_completed", {
        ...searchMeta,
        result_count: data.total,
        page_count: data.pages,
        latency_ms: Date.now() - startedAt,
      });

      if (p === 1) {
        breakdownAbortRef.current?.abort();
        const controller = new AbortController();
        breakdownAbortRef.current = controller;
        setBreakdownLoading(true);
        fetchBreakdown(f, controller.signal)
          .then((bd) => {
            if (breakdownAbortRef.current === controller) setBreakdown(bd);
          })
          .catch((err) => {
            if (err instanceof Error && err.name === "AbortError") return;
          })
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
    fetchTopModels(makeUpper).then((rows) => {
      setOtherModels(rows.filter((r) => r.model.toUpperCase() !== modelUpper));
    });
    return () => breakdownAbortRef.current?.abort();
  }, [filters, doSearch, makeUpper, modelUpper]);

  const top = useMemo(() => {
    const pick = (key: string) => breakdown[key]?.[0];
    return {
      fuel: pick("MOTIVE_POWER"),
      colour: pick("BASIC_COLOUR"),
      region: pick("TLA"),
      bodyType: pick("BODY_TYPE"),
    };
  }, [breakdown]);

  const makeSlug = make || makeUpper.toLowerCase().replace(/\s+/g, "-");
  const canonical = `https://vehiclefinder.co.nz/stats/${encodeURIComponent(makeSlug)}/${encodeURIComponent(model || "")}`;

  useEffect(() => {
    const totalText = total !== null ? total.toLocaleString("en-NZ") : "";
    const title =
      total !== null
        ? `${makeDisplay} ${modelDisplay} in NZ: ${totalText} registered | NZ Vehicle Finder`
        : `${makeDisplay} ${modelDisplay} statistics in New Zealand | NZ Vehicle Finder`;
    const description =
      total !== null
        ? `${totalText} ${makeDisplay} ${modelDisplay} ${total === 1 ? "vehicle is" : "vehicles are"} registered in New Zealand.${top.colour && total > 1 ? ` Most common colour is ${top.colour.value.toLowerCase()}.` : ""} View full breakdowns and listings from the Motor Vehicle Register.`
        : `Browse ${makeDisplay} ${modelDisplay} vehicles registered in New Zealand. View counts, breakdowns and full listings from the Motor Vehicle Register.`;

    const jsonLd: object[] = [
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://vehiclefinder.co.nz/" },
          { "@type": "ListItem", position: 2, name: makeDisplay, item: `https://vehiclefinder.co.nz/stats/${makeSlug}` },
          { "@type": "ListItem", position: 3, name: modelDisplay, item: canonical },
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
            name: `How many ${makeDisplay} ${modelDisplay} are registered in New Zealand?`,
            acceptedAnswer: {
              "@type": "Answer",
              text: `There are ${totalText} ${makeDisplay} ${modelDisplay} vehicles currently registered with the New Zealand Motor Vehicle Register.`,
            },
          },
          ...(top.colour
            ? [
                {
                  "@type": "Question",
                  name: `What is the most popular colour for the ${makeDisplay} ${modelDisplay} in New Zealand?`,
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: `The most common colour for the ${makeDisplay} ${modelDisplay} in New Zealand is ${top.colour.value.toLowerCase()}, with ${top.colour.count.toLocaleString("en-NZ")} registered vehicles.`,
                  },
                },
              ]
            : []),
          ...(top.region
            ? [
                {
                  "@type": "Question",
                  name: `Which region in New Zealand has the most ${makeDisplay} ${modelDisplay} vehicles?`,
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: `${top.region.value} has the highest number of registered ${makeDisplay} ${modelDisplay} vehicles in New Zealand, with ${top.region.count.toLocaleString("en-NZ")} on the register.`,
                  },
                },
              ]
            : []),
          ...(top.fuel
            ? [
                {
                  "@type": "Question",
                  name: `What fuel type does the ${makeDisplay} ${modelDisplay} use in New Zealand?`,
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: `The most common fuel type for the ${makeDisplay} ${modelDisplay} in New Zealand is ${top.fuel.value.toLowerCase()}, representing ${top.fuel.count.toLocaleString("en-NZ")} registered vehicles.`,
                  },
                },
              ]
            : []),
        ],
      });
    }

    const keywords = `${makeDisplay} ${modelDisplay} NZ, ${makeDisplay} ${modelDisplay} registrations NZ, ${makeDisplay} ${modelDisplay} New Zealand, NZ vehicle register`;
    applySeo({ title, description, keywords, canonical, jsonLd });
  }, [make, makeDisplay, makeSlug, model, modelDisplay, canonical, total, top.colour, top.region, top.fuel]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    captureEvent("page_changed", {
      page: newPage,
      result_count: total ?? 0,
      source: "model_stats_page",
    });
    doSearch(filters, newPage);
  };

  const handleSort = (key: keyof Vehicle) => {
    setSort((prev) => {
      const next: SortConfig =
        prev?.key === key ? (prev.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" };
      captureEvent("results_sorted", {
        column: key,
        direction: next?.dir || "none",
        ...summarizeFilters(filters as Record<string, string | undefined>),
        result_count: total ?? 0,
        source: "model_stats_page",
      });
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
        background: "#ffffff",
        fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        color: "#111827",
      }}
    >
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <SiteHeader
          source="model_stats_page"
          count={total}
          subtitle={
            <>
              <Link to={`/stats/${makeSlug}`} style={{ color: "#0ea5e9", textDecoration: "none" }} onClick={() => captureEvent("breadcrumb_make_clicked", { make: makeUpper, model: modelUpper })}>
                {makeUpper} Statistics
              </Link>
              {" "}· {modelUpper}
            </>
          }
        />

        <div className="stats-hero" style={{ padding: "20px 24px 32px", background: "#ffffff", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 32 }}>
          <div style={{ flex: 1 }}>
            <nav style={{ fontSize: 11, color: "#9ca3af", marginBottom: 10, letterSpacing: "0.05em" }}>
              <Link to="/" style={{ color: "#6b7280", textDecoration: "none" }}>Home</Link>
              <span style={{ margin: "0 6px" }}>/</span>
              <Link to={`/stats/${makeSlug}`} style={{ color: "#6b7280", textDecoration: "none" }}>{makeDisplay}</Link>
              <span style={{ margin: "0 6px" }}>/</span>
              <span style={{ color: "#111827" }}>{modelDisplay}</span>
            </nav>
            <h2 style={{ fontSize: 48, fontWeight: 800, color: "#0f172a", margin: "0 0 12px", letterSpacing: "-0.03em", lineHeight: 1.1 }}>
              {total !== null ? total.toLocaleString("en-NZ") : <LoadingDots />} {makeDisplay} {modelDisplay} registered in NZ
            </h2>
            <p style={{ fontSize: 16, color: "#374151", margin: 0, letterSpacing: "0.01em", maxWidth: 800 }}>
              Breakdown and full listing of all {makeDisplay} {modelDisplay} vehicles on the New Zealand Motor Vehicle Register.
              {top.fuel && top.colour && (total === 1 ? (
                <> It is {top.fuel.value.toLowerCase()} powered and {top.colour.value.toLowerCase()}.</>
              ) : (
                <> Most are {top.fuel.value.toLowerCase()} powered, most common colour is {top.colour.value.toLowerCase()}.</>
              ))}
            </p>
            <Link
              to={`/?MAKE=${encodeURIComponent(makeUpper)}&MODEL=${encodeURIComponent(modelUpper)}`}
              onClick={() => captureEvent("refine_further_clicked", { source: "model_stats_page", make: makeUpper, model: modelUpper })}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 16, fontSize: 13, fontWeight: 600, color: "#0ea5e9", textDecoration: "none", padding: "8px 16px", border: "1px solid #bae6fd", borderRadius: 8, background: "#f0f9ff", letterSpacing: "0.02em" }}
            >
              Refine further <span aria-hidden>→</span>
            </Link>
          </div>
          <HeroAside source="model_stats_page" share />
        </div>

        {/* Skeleton from the first paint, not only once the totals are back. */}
        <ResultStats data={breakdown} loading={breakdownLoading || (loading && total === null)} />

        {total !== null && (
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden", background: "#ffffff" }}>
            <div className="results-bar content-col" style={{ padding: "6px 24px", background: "#ffffff", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
                    <tr>
                      <td colSpan={resultColumns.length} style={{ padding: "60px 24px", textAlign: "center", color: "#9ca3af", fontSize: 11, letterSpacing: "0.1em" }}>
                        LOADING...
                      </td>
                    </tr>
                  ) : sortedResults.length === 0 ? (
                    <tr>
                      <td colSpan={resultColumns.length} style={{ padding: "60px 24px", textAlign: "center", color: "#9ca3af", fontSize: 11, letterSpacing: "0.1em" }}>
                        NO RECORDS FOUND
                      </td>
                    </tr>
                  ) : (
                    displayResults.map((v, i) => (
                      <tr
                        key={i}
                        onClick={() => {
                          setSelectedVehicle(v);
                          captureEvent("vehicle_detail_viewed", {
                            make: v.MAKE,
                            model: v.MODEL,
                            year: v.VEHICLE_YEAR,
                            vin11: v.VIN11,
                            source: "model_stats_page",
                          });
                        }}
                        style={{ cursor: "pointer", borderBottom: "1px solid #e5e7eb", background: i % 2 === 0 ? "#ffffff" : "#f9fafb" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#eff6ff")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? "#ffffff" : "#f9fafb")}
                      >
                        {resultColumns.map((col, ci) => (
                          <td
                            key={col.key}
                            style={{ padding: "7px 16px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: ci === 0 ? "#111827" : ci === 8 ? "#9ca3af" : "#4b5563", fontWeight: ci === 0 ? 600 : 400, fontSize: 11 }}
                          >
                            {v[col.key] || <span style={{ color: "#d1d5db" }}>-</span>}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <Pagination page={page} pages={pages} onPageChange={handlePageChange} className="content-col" />
          </div>
        )}

        {/* Push the link bands down to the footer when the listing is short. */}
        <div aria-hidden style={{ flex: 1 }} />

        {otherModels.length > 0 && (
          <section className="page-band" style={{ padding: "24px 24px 32px", background: "#ffffff", borderTop: "1px solid #e5e7eb" }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: "0 0 12px", letterSpacing: "-0.01em" }}>
                Other {makeDisplay} models
              </h2>
              <LinkTiles
                items={otherModels.map((m) => ({
                  key: m.model,
                  to: `/stats/${makeSlug}/${modelToSlug(m.model)}`,
                  label: titleCaseModel(m.model),
                  count: m.count,
                  onClick: () => captureEvent("related_model_clicked", { from: modelUpper, to: m.model, make: makeUpper }),
                }))}
              />
            </div>
          </section>
        )}

        {selectedVehicle && (
          <Suspense fallback={null}>
            <VehicleDetail vehicle={selectedVehicle} onClose={() => setSelectedVehicle(null)} />
          </Suspense>
        )}
      </div>

      <SiteFooter source="model_stats_page" eventProps={{ make: makeUpper, model: modelUpper }} />
    </div>
  );
}
