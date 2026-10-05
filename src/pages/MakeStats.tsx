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
import { getMakeBlurb } from "@/lib/makeContent";
import { modelToSlug, slugToMakeUpper, titleCaseModel, titleCaseMake } from "@/lib/slugs";
import { HeroAside, SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { resultColumns } from "@/lib/resultColumns";
import { LoadingDots } from "@/components/LoadingDots";
import { SkeletonRows } from "@/components/SkeletonRows";
import { LinkTiles } from "@/components/LinkTiles";
import { AnimatedNumber, NumberSlot, Reserve } from "@/components/NumberSlot";
import { TableScroll } from "@/components/TableScroll";
import { POPULAR_MAKES } from "@/lib/popularMakes";

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

export default function MakeStats() {
  const { make } = useParams<{ make: string }>();
  const makeUpper = slugToMakeUpper(make || "");
  const makeDisplay = titleCaseMake(makeUpper);
  // Rough size of the count, so the loading slot in the heading is about the right width.
  const estimate = (POPULAR_MAKES.find((m) => m.upper === makeUpper)?.count ?? 10_000).toLocaleString("en-NZ");

  const [results, setResults] = useState<Vehicle[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [sort, setSort] = useState<SortConfig>(null);
  const [breakdown, setBreakdown] = useState<BreakdownData>({});
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [topModels, setTopModels] = useState<{ model: string; count: number }[]>([]);
  const breakdownAbortRef = useRef<AbortController | null>(null);
  const initialLoad = useRef(true);
  const isSearching = useRef(false);

  const filters = useMemo(() => ({ MAKE: makeUpper }), [makeUpper]);

  const doSearch = useCallback(async (f: Record<string, string | undefined>, p: number) => {
    if (isSearching.current) return;
    isSearching.current = true;
    setLoading(true);
    const startedAt = Date.now();

    const searchMeta = {
      trigger: "stats_page",
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
    fetchTopModels(makeUpper).then(setTopModels);
    return () => breakdownAbortRef.current?.abort();
  }, [filters, doSearch, makeUpper]);

  // Derive top values from the breakdown for content + FAQ.
  const top = useMemo(() => {
    const pick = (key: string) => breakdown[key]?.[0];
    return {
      model: pick("MODEL"),
      year: pick("VEHICLE_YEAR"),
      bodyType: pick("BODY_TYPE"),
      fuel: pick("MOTIVE_POWER"),
      colour: pick("BASIC_COLOUR"),
      region: pick("TLA"),
    };
  }, [breakdown]);

  const blurb = useMemo(() => getMakeBlurb(makeUpper), [makeUpper]);
  const canonical = `https://vehiclefinder.co.nz/stats/${encodeURIComponent(make || "")}`;

  useEffect(() => {
    const totalText = total !== null ? total.toLocaleString('en-NZ') : "";
    const title =
      total !== null
        ? `${makeDisplay} in NZ: ${totalText} vehicles registered | NZ Vehicle Finder`
        : `${makeDisplay} vehicle statistics in New Zealand | NZ Vehicle Finder`;
    const description =
      total !== null
        ? `${totalText} ${makeDisplay} vehicles are registered in New Zealand.${top.model ? ` The most popular model is ${top.model.value}.` : ""} View counts, breakdowns and full listings from the Motor Vehicle Register.`
        : `Browse ${makeDisplay} vehicles registered in New Zealand. View counts, breakdowns and full listings from the Motor Vehicle Register.`;

    const jsonLd: object[] = [
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://vehiclefinder.co.nz/" },
          { "@type": "ListItem", position: 2, name: makeDisplay, item: canonical },
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
            name: `How many ${makeDisplay} vehicles are registered in New Zealand?`,
            acceptedAnswer: {
              "@type": "Answer",
              text: `There are ${totalText} ${makeDisplay} vehicles currently registered with the New Zealand Motor Vehicle Register.`,
            },
          },
          ...(top.model
            ? [
                {
                  "@type": "Question",
                  name: `What is the most popular ${makeDisplay} model in New Zealand?`,
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: `The most popular ${makeDisplay} model in New Zealand is the ${top.model.value} with ${top.model.count.toLocaleString('en-NZ')} registrations.`,
                  },
                },
              ]
            : []),
          ...(top.region
            ? [
                {
                  "@type": "Question",
                  name: `Which region in New Zealand has the most ${makeDisplay} vehicles?`,
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: `${top.region.value} has the highest number of registered ${makeDisplay} vehicles in New Zealand, with ${top.region.count.toLocaleString('en-NZ')} on the register.`,
                  },
                },
              ]
            : []),
        ],
      });
    }

    const keywords = `fleet search, NZ vehicle register, motor vehicle register, ${makeDisplay} NZ, ${makeDisplay} registrations NZ`;

    applySeo({ title, description, keywords, canonical, jsonLd });
  }, [make, makeDisplay, canonical, total, top.model, top.region]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    captureEvent("page_changed", {
      page: newPage,
      result_count: total ?? 0,
      source: "stats_page",
    });
    doSearch(filters, newPage);
  };

  const handleSort = (key: keyof Vehicle) => {
    setSort((prev) => {
      const next: SortConfig =
        prev?.key === key
          ? prev.dir === "asc"
            ? { key, dir: "desc" }
            : null
          : { key, dir: "asc" };

      captureEvent("results_sorted", {
        column: key,
        direction: next?.dir || "none",
        ...summarizeFilters(filters as Record<string, string | undefined>),
        result_count: total ?? 0,
        source: "stats_page",
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
        fontFamily: "'Inter', 'Inter Fallback', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        color: "#111827",
      }}
    >
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <SiteHeader source="stats_page" subtitle={<>NZ Motor Vehicle Register · {makeUpper} Statistics</>} count={total} />
        
        {/* Hero heading */}
        <div className="stats-hero" style={{ padding: "20px 24px 32px", background: "#ffffff", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 32 }}>
          <div style={{ flex: 1 }}>
            <nav style={{ fontSize: 11, color: "#9ca3af", marginBottom: 10, letterSpacing: "0.05em" }}>
              <Link to="/" style={{ color: "#6b7280", textDecoration: "none" }}>Home</Link>
              <span style={{ margin: "0 6px" }}>/</span>
              <Link to="/nz-fleet" style={{ color: "#6b7280", textDecoration: "none" }}>NZ Fleet</Link>
              <span style={{ margin: "0 6px" }}>/</span>
              <span style={{ color: "#111827" }}>{makeDisplay}</span>
            </nav>
            <h2 style={{ fontSize: 48, fontWeight: 800, color: "#0f172a", margin: "0 0 12px", letterSpacing: "-0.03em", lineHeight: 1.1 }}>
              <NumberSlot value={total} placeholder={estimate} /> {makeDisplay} {total === 1 ? "vehicle" : "vehicles"} registered in NZ
            </h2>
            <p style={{ fontSize: 16, color: "#374151", margin: 0, letterSpacing: "0.01em", maxWidth: 800 }}>
              Breakdown and full listing of all {makeDisplay} vehicles on the New Zealand Motor Vehicle Register.
            </p>
              {blurb.blurb && (
                <p style={{ fontSize: 12, color: "#6b7280", margin: "8px 0 0", lineHeight: 1.7, maxWidth: 800 }}>
                  <Reserve
                    ready={total !== null && !breakdownLoading}
                    standIn={`0,000,000 ${makeDisplay} vehicles are registered on the NZ Motor Vehicle Register - most are station wagon body types running on petrol. Most common colour is silver. `}
                  >
                    {total !== null && <><AnimatedNumber value={total} /> {makeDisplay} {total === 1 ? "vehicle is" : "vehicles are"} registered on the NZ Motor Vehicle Register{total > 1 && top.bodyType && top.fuel ? ` - most are ${top.bodyType.value.toLowerCase()} body types running on ${top.fuel.value.toLowerCase()}` : ""}. </>}
                    {top.colour && total !== 1 && <>Most common colour is {top.colour.value.toLowerCase()}. </>}
                  </Reserve>
                  {blurb.blurb}
                </p>
              )}
            <Link
              to={`/?MAKE=${encodeURIComponent(makeUpper)}`}
              onClick={() => captureEvent("refine_further_clicked", { source: "stats_page", make: makeUpper })}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 16, fontSize: 13, fontWeight: 600, color: "#0ea5e9", textDecoration: "none", padding: "8px 16px", border: "1px solid #bae6fd", borderRadius: 8, background: "#f0f9ff", letterSpacing: "0.02em" }}
            >
              Refine further <span aria-hidden>→</span>
            </Link>
          </div>
          <HeroAside source="stats_page" share />
        </div>

        {/* Breakdown */}
        {/* Skeleton from the first paint, not only once the totals are back. */}
        <ResultStats data={breakdown} loading={breakdownLoading || (loading && total === null)} />

        {/* Results table */}
        {total !== null && (
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden", background: "#ffffff" }}>
            <div className="results-bar content-col" style={{ padding: "6px 24px", background: "#ffffff", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ fontSize: 10, color: "#6b7280", letterSpacing: "0.1em", margin: 0, fontWeight: 400 }}>
                SHOWING <span style={{ color: "#111827" }}><AnimatedNumber value={displayResults.length} /></span> OF{" "}
                <span style={{ color: "#0f766e" }}><AnimatedNumber value={total} /></span> RECORDS
                {pages > 1 && <> · PAGE <span style={{ color: "#111827" }}>{page}</span>/<span style={{ color: "#4b5563" }}>{pages}</span></>}
              </h2>
              {sort && (
                <span style={{ fontSize: 10, color: "#6b7280", letterSpacing: "0.1em" }}>
                  SORT: <span style={{ color: "#0ea5e9" }}>{sort.key}</span>{" "}
                  <span style={{ color: "#4b5563" }}>{sort.dir === "asc" ? "↑" : "↓"}</span>
                </span>
              )}
            </div>

            <TableScroll>
              <table className="results-table" style={{ width: "100%", minWidth: 1000, borderCollapse: "collapse", fontSize: 11, tableLayout: "fixed", background: "#ffffff" }}>
                <thead style={{ position: "sticky", top: 0, background: "#f9fafb", zIndex: 10 }}>
                  <tr>
                    {resultColumns.map((col) => (
                      <th key={col.key} onClick={() => handleSort(col.key)}
                        style={{ padding: "8px 16px", textAlign: "left", fontSize: 9, letterSpacing: "0.2em", color: sort?.key === col.key ? "#0ea5e9" : "#6b7280", cursor: "pointer", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap", fontWeight: 700, userSelect: "none", overflow: "hidden", textOverflow: "ellipsis", width: col.width }}
                      >
                        {col.label}
                        {sort?.key === col.key && <span style={{ marginLeft: 4, color: "#0ea5e9" }}>{sort.dir === "asc" ? "↑" : "↓"}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="rows-in">
                  {loading && results.length === 0 ? (
                    <SkeletonRows columns={resultColumns.length} />
                  ) : sortedResults.length === 0 ? (
                    <tr>
                      <td colSpan={resultColumns.length} style={{ padding: "60px 24px", textAlign: "center", color: "#9ca3af", fontSize: 11, letterSpacing: "0.1em" }}>
                        NO RECORDS FOUND
                      </td>
                    </tr>
                  ) : (
                    displayResults.map((v, i) => (
                      <tr key={i} onClick={() => {
                        setSelectedVehicle(v);
                        captureEvent("vehicle_detail_viewed", {
                          make: v.MAKE,
                          model: v.MODEL,
                          year: v.VEHICLE_YEAR,
                          vin11: v.VIN11,
                          source: "stats_page"
                        });
                      }}
                        style={{ cursor: "pointer", borderBottom: "1px solid #e5e7eb", background: i % 2 === 0 ? "#ffffff" : "#f9fafb" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#eff6ff")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? "#ffffff" : "#f9fafb")}
                      >
                        {resultColumns.map((col, ci) => (
                          <td key={col.key}
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
            </TableScroll>

            <Pagination page={page} pages={pages} onPageChange={handlePageChange} className="content-col" />
          </div>
        )}

        {/* Push the link bands down to the footer when the listing is short. */}
        <div aria-hidden style={{ flex: 1 }} />

        {topModels.length > 0 && (
          <section className="page-band" style={{ padding: "24px 24px 32px", background: "#ffffff", borderTop: "1px solid #e5e7eb" }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: "0 0 12px", letterSpacing: "-0.01em" }}>
                Top {makeDisplay} models
              </h2>
              <LinkTiles
                items={topModels.map((m) => ({
                  key: m.model,
                  to: `/stats/${make}/${modelToSlug(m.model)}`,
                  label: titleCaseModel(m.model),
                  count: m.count,
                  onClick: () => captureEvent("top_model_clicked", { make: makeUpper, model: m.model }),
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

      <SiteFooter source="stats_page" eventProps={{ make: makeUpper }} />
    </div>
  );
}
