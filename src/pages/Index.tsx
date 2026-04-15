import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { SearchField } from "@/components/SearchField";
import { RangeField } from "@/components/RangeField";
import { Pagination } from "@/components/Pagination";
import { ResultStats } from "@/components/ResultStats";
import {
  API_BASE,
  checkHealth,
  fetchBreakdown,
  preloadModelsForMake,
  preloadSuggestions,
  type BreakdownData,
  type SearchFilters,
  searchVehicles,
} from "@/lib/vehicleApi";
import { exportToCsv } from "@/lib/csvExport";
import { applySeo } from "@/lib/seo";
import { captureEvent, summarizeFilters } from "@/lib/posthog";
import { Vehicle } from "@/lib/mockData";
import { toast } from "sonner";
import { Search, RotateCcw, Download, Link2, LoaderCircle } from "lucide-react";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isMobile;
}

const filterFields: { key: keyof SearchFilters; label: string }[] = [
  { key: "MAKE", label: "Make" },
  { key: "MODEL", label: "Model" },
  { key: "SUBMODEL", label: "Submodel" },
  { key: "BASIC_COLOUR", label: "Colour" },
  { key: "MOTIVE_POWER", label: "Fuel Type" },
  { key: "BODY_TYPE", label: "Body Type" },
  { key: "TRANSMISSION_TYPE", label: "Transmission" },
  { key: "TLA", label: "Region" },
  { key: "POSTCODE", label: "Postcode" },
  { key: "IMPORT_STATUS", label: "Import Status" },
  { key: "ORIGINAL_COUNTRY", label: "Origin Country" },
  { key: "CLASS", label: "Class" },
  { key: "INDUSTRY_CLASS", label: "Industry Class" },
  { key: "ROAD_TRANSPORT_CODE", label: "Road Code" },
  { key: "VEHICLE_USAGE", label: "Usage" },
  { key: "NZ_ASSEMBLED", label: "NZ Assembled" },
  { key: "VIN11", label: "VIN" },
];

const resultColumns: { key: keyof Vehicle; label: string }[] = [
  { key: "MAKE", label: "Make" },
  { key: "MODEL", label: "Model" },
  { key: "VEHICLE_YEAR", label: "Year" },
  { key: "BASIC_COLOUR", label: "Colour" },
  { key: "BODY_TYPE", label: "Body" },
  { key: "MOTIVE_POWER", label: "Fuel" },
  { key: "TRANSMISSION_TYPE", label: "Trans" },
  { key: "TLA", label: "Region" },
  { key: "VIN11", label: "VIN11" },
];

type SortConfig = { key: keyof Vehicle; dir: "asc" | "desc" } | null;

const emptyFilters = (): SearchFilters => ({});

const VehicleDetail = lazy(() =>
  import("@/components/VehicleDetail").then((m) => ({ default: m.VehicleDetail }))
);

function filtersFromParams(params: URLSearchParams): SearchFilters {
  const filters: SearchFilters = {};
  const validKeys = new Set([
    ...filterFields.map((f) => f.key),
    "VEHICLE_YEAR_MIN", "VEHICLE_YEAR_MAX", "CC_RATING_MIN", "CC_RATING_MAX",
    "POWER_RATING_MIN", "POWER_RATING_MAX", "GROSS_VEHICLE_MASS_MIN", "GROSS_VEHICLE_MASS_MAX",
    "WIDTH_MIN", "WIDTH_MAX", "NUMBER_OF_SEATS_MIN", "NUMBER_OF_AXLES_MIN",
  ]);
  for (const [k, v] of params.entries()) {
    if (validKeys.has(k) && v) (filters as any)[k] = v;
  }
  return filters;
}

function filtersToParams(filters: SearchFilters): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (v && v.trim()) out[k] = v.trim();
  }
  return out;
}

export default function Index() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<SearchFilters>(() => filtersFromParams(searchParams));
  const [results, setResults] = useState<Vehicle[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [sort, setSort] = useState<SortConfig>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const initialLoad = useRef(true);
  const breakdownAbortRef = useRef<AbortController | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [apiReachable, setApiReachable] = useState<boolean | null>(null);
  const [breakdown, setBreakdown] = useState<BreakdownData>({});
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [breakdownSheetOpen, setBreakdownSheetOpen] = useState(false);

  useEffect(() => { preloadSuggestions(); }, []);

  useEffect(() => {
    applySeo({
      title: "NZ Vehicle Finder - Search the Motor Vehicle Register",
      description:
        "Search New Zealand's Motor Vehicle Register with 5.9 million records. Filter by make, model, colour, region and more.",
      canonical: "https://vehiclefinder.co.nz/",
    });
  }, []);

  const updateFilter = (key: keyof SearchFilters, value: string) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "MAKE") {
        next.MODEL = "";
        if (value) preloadModelsForMake(value);
      }
      if (key === "MAKE" || key === "MODEL") next.SUBMODEL = "";
      return next;
    });
  };

  useEffect(() => {
    checkHealth()
      .then(({ ok }) => setApiReachable(ok))
      .catch(() => setApiReachable(false));
  }, []);

  useEffect(() => {
    return () => breakdownAbortRef.current?.abort();
  }, []);

  const doSearch = useCallback(
    async (f: SearchFilters, p: number, trigger: "button" | "page" | "auto" = "button") => {
      const startTime = performance.now();
      setLoading(true);
    setErrorMessage(null);

      const searchMeta = {
        trigger,
        page: p,
        device: window.innerWidth < 768 ? "mobile" : "desktop",
        ...summarizeFilters(f as Record<string, string | undefined>),
      };
      captureEvent("search_started", searchMeta);

      if (p === 1) {
        breakdownAbortRef.current?.abort();
        breakdownAbortRef.current = null;
        setBreakdown({});
        setBreakdownLoading(false);
      }

      try {
        const data = await searchVehicles(f, p);
        setResults(data.vehicles);
        setTotal(data.total);
        setPages(data.pages);
        setSort(null);

        if (data.total === 0) {
          toast("No records found", { description: "Try broadening your search filters." });
          captureEvent("search_zero_results", {
            ...searchMeta,
            result_count: 0,
          });
        }

        captureEvent("search_completed", {
          ...searchMeta,
          result_count: data.total,
          page_count: data.pages,
          latency_ms: Math.round(performance.now() - startTime),
        });

        if (p === 1) {
          const controller = new AbortController();
          breakdownAbortRef.current = controller;
          setBreakdownLoading(true);

          fetchBreakdown(f, controller.signal)
            .then((nextBreakdown) => {
              if (breakdownAbortRef.current === controller) {
                setBreakdown(nextBreakdown);
              }
            })
            .catch((err) => {
              if (err instanceof Error && err.name === "AbortError") return;
              console.error("Failed to fetch breakdown:", err);
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
        const message = err instanceof Error ? err.message : "An unexpected error occurred while searching.";
        captureEvent("search_failed", {
          ...searchMeta,
          error_message: message,
        });
        setErrorMessage(message);
        toast.error("Search failed", {
          description: "We couldn't reach the vehicle database. Please check your connection and try again.",
        });
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!initialLoad.current) return;
    initialLoad.current = false;
    const hasFilters = Object.values(filters).some((v) => v && v?.trim());
    if (hasFilters) doSearch(filters, 1, "auto");
  }, [filters, doSearch]);

  useEffect(() => {
    const p = filtersToParams(filters);
    setSearchParams(p, { replace: true });
  }, [filters, setSearchParams]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    doSearch(filters, newPage, "page");
  };

  const handleClear = () => {
    captureEvent("search_cleared");
    breakdownAbortRef.current?.abort();
    breakdownAbortRef.current = null;
    setBreakdown({});
    setBreakdownLoading(false);
    setFilters(emptyFilters());
    setResults([]);
    setTotal(null);
    setPage(1);
    setSort(null);
    setErrorMessage(null);
  };


  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      captureEvent("copy_link_clicked", {
        ...summarizeFilters(filters as Record<string, string | undefined>),
        result_count: total ?? 0,
      });
      toast("Search link copied", { description: "You can paste this URL to share the current filters." });
      setTimeout(() => setCopiedLink(false), 1500);
    } catch (err) {
      console.error(err);
      toast.error("Could not copy link", { description: "Your browser blocked clipboard access." });
    }
  };

  const handleSort = (key: keyof Vehicle) => {
    setSort((prev) => {
      const next = prev?.key === key ? (prev.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" };

      captureEvent("results_sorted", {
        column: key,
        direction: next?.dir || "none",
        ...summarizeFilters(filters as Record<string, string | undefined>),
        result_count: total ?? 0,
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
        background: "#f3f4f6",
        fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        color: "#111827",
      }}
    >
      <div style={{ flex: 1 }}>
      {apiReachable === false && (
        <div
          style={{
            background: "#fef2f2",
            borderBottom: "1px solid #fecaca",
            padding: "10px 24px",
            fontSize: 11,
            color: "#b91c1c",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <strong style={{ letterSpacing: "0.1em" }}>BACKEND NOT REACHABLE</strong>
          <span>
            Start the API server in another terminal:{" "}
            <code style={{ background: "#fee2e2", padding: "2px 6px", borderRadius: 4 }}>npm run server</code>
          </span>
          <span style={{ color: "#6b7280" }}>API: {API_BASE}</span>
        </div>
      )}

      <header style={{ borderBottom: "1px solid #e5e7eb", background: "#ffffff", position: "sticky", top: 0, zIndex: 40 }}>
        {/* Blue top bar */}
        <div className="header-topbar" style={{ background: "#0ea5e9", padding: "4px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="header-topbar-subtitle" style={{ fontSize: "10px", color: "#f9fafb", fontWeight: 600, letterSpacing: "0.16em" }}>
            WAKA KOTAHI · MOTOR VEHICLE REGISTER · PUBLIC ACCESS TERMINAL
          </span>
          <span style={{ fontSize: "10px", color: "#e0f2fe", letterSpacing: "0.1em" }}>
            {new Date().toISOString().split("T")[0]}
          </span>
        </div>
        {/* Main header row */}
        <div className="header-main" style={{ padding: "10px 24px", display: "flex", alignItems: "center", gap: 16, background: "#ffffff" }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer", border: '1px solid #d1d5db', borderColor: '#d1d5db' }} onClick={() => handleClear("logo")} title="Clear filters" onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#9ca3af")} onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#d1d5db")}>
            <img src="/favicon.svg" alt="Logo" style={{ width: "100%", height: "100%" }} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", letterSpacing: "0.02em", margin: 0 }}>NZ Vehicle Finder</h1>
            <p style={{ fontSize: 11, color: "#6b7280", letterSpacing: "0.12em", margin: 0, textTransform: "uppercase" }}>
              Motor Vehicle Register · 5,879,915 records
            </p>
          </div>
          {total === null && (
            <div style={{ marginLeft: "auto" }}>
              <a className="header-sponsor" onClick={() => captureEvent("sponsor_link_clicked", { location: "header" })} href="https://buymeacoffee.com/jedbillyb" target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 10, fontWeight: 700, color: "#ef4444", textDecoration: "none",
                  padding: "5px 12px", border: "1px solid #ef4444", borderRadius: 6,
                  letterSpacing: "0.1em", display: "flex", flexDirection: "column",
                  alignItems: "center", lineHeight: 1.4, marginLeft: "auto" }}>
                <span>SPONSOR</span>
                <span>THIS PROJECT</span>
              </a>
            </div>
          )}
          {total !== null && (
            <div className="header-count" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#0f766e", lineHeight: 1 }}>{total.toLocaleString()}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#6b7280", letterSpacing: "0.05em" }}>MATCHES FOUND</div>
              </div>
              <a className="header-sponsor" onClick={() => captureEvent("sponsor_link_clicked", { location: "header_with_results" })} href="https://buymeacoffee.com/jedbillyb" target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", textDecoration: "none", padding: "6px 12px", border: "1px solid #ef4444", borderRadius: 6, letterSpacing: "0.1em", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", lineHeight: 1.2 }}>
                <span>SPONSOR</span>
                <span style={{ fontSize: 8, marginTop: 2 }}>THIS PROJECT</span>
              </a>
            </div>
          )}
        </div>
      </header>

      <div style={{ borderBottom: "1px solid #e5e7eb", background: "#ffffff" }}>
        {/* Filter panel */}
        <div className="filters-panel" style={{ padding: "20px 24px", background: "#ffffff" }}>
          {/* Top Section: Main Filters */}
          <div className="main-filters-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "12px 16px", paddingBottom: 20, borderBottom: "1px solid #f3f4f6" }}>
            {filterFields.map((f) => (
              <SearchField
                key={f.key}
                label={f.label}
                field={f.key as keyof Vehicle}
                value={(filters[f.key] as string) || ""}
                onChange={(v) => updateFilter(f.key, v)}
                filterBy={
                  f.key === "MODEL" && filters.MAKE
                    ? { MAKE: filters.MAKE }
                    : f.key === "SUBMODEL" && filters.MAKE
                    ? { MAKE: filters.MAKE, ...(filters.MODEL ? { MODEL: filters.MODEL } : {}) }
                    : undefined
                }
              />
            ))}
            <RangeField label="YEAR" fieldMin="VEHICLE_YEAR_MIN" fieldMax="VEHICLE_YEAR_MAX" valueMin={filters.VEHICLE_YEAR_MIN || ""} valueMax={filters.VEHICLE_YEAR_MAX || ""} onChangeMin={(v) => updateFilter("VEHICLE_YEAR_MIN", v)} onChangeMax={(v) => updateFilter("VEHICLE_YEAR_MAX", v)} min={1950} max={2026} />
            <RangeField label="CC RATING" fieldMin="CC_RATING_MIN" fieldMax="CC_RATING_MAX" valueMin={filters.CC_RATING_MIN || ""} valueMax={filters.CC_RATING_MAX || ""} onChangeMin={(v) => updateFilter("CC_RATING_MIN", v)} onChangeMax={(v) => updateFilter("CC_RATING_MAX", v)} min={0} max={8000} />
            <RangeField label="POWER (KW)" fieldMin="POWER_RATING_MIN" fieldMax="POWER_RATING_MAX" valueMin={filters.POWER_RATING_MIN || ""} valueMax={filters.POWER_RATING_MAX || ""} onChangeMin={(v) => updateFilter("POWER_RATING_MIN", v)} onChangeMax={(v) => updateFilter("POWER_RATING_MAX", v)} min={0} max={500} />
          </div>

          {/* Bottom Section: Two Columns */}
          <div className="filters-bottom" style={{ display: "flex", gap: 48, marginTop: 20, alignItems: "stretch", minWidth: 0 }}>
            {/* Left Column: Physical Params + Actions */}
            <div className="filters-left-col" style={{ flex: "0 1 560px", maxWidth: 560, width: "100%", display: "flex", flexDirection: "column", justifyContent: isMobile ? "flex-start" : "space-between", minWidth: 0 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px 24px", width: "100%", minWidth: 0 }}>
                <RangeField label="GROSS MASS" fieldMin="GROSS_VEHICLE_MASS_MIN" fieldMax="GROSS_VEHICLE_MASS_MAX" valueMin={filters.GROSS_VEHICLE_MASS_MIN || ""} valueMax={filters.GROSS_VEHICLE_MASS_MAX || ""} onChangeMin={(v) => updateFilter("GROSS_VEHICLE_MASS_MIN", v)} onChangeMax={(v) => updateFilter("GROSS_VEHICLE_MASS_MAX", v)} min={0} max={50000} />
                <RangeField label="WIDTH (MM)" fieldMin="WIDTH_MIN" fieldMax="WIDTH_MAX" valueMin={filters.WIDTH_MIN || ""} valueMax={filters.WIDTH_MAX || ""} onChangeMin={(v) => updateFilter("WIDTH_MIN", v)} onChangeMax={(v) => updateFilter("WIDTH_MAX", v)} min={0} max={3500} />
                <RangeField label="SEATS (MIN)" fieldMin="NUMBER_OF_SEATS_MIN" fieldMax="NUMBER_OF_SEATS_MIN" valueMin={filters.NUMBER_OF_SEATS_MIN || ""} valueMax="" onChangeMin={(v) => updateFilter("NUMBER_OF_SEATS_MIN", v)} onChangeMax={() => {}} min={1} max={20} />
                <RangeField label="AXLES (MIN)" fieldMin="NUMBER_OF_AXLES_MIN" fieldMax="NUMBER_OF_AXLES_MIN" valueMin={filters.NUMBER_OF_AXLES_MIN || ""} valueMax="" onChangeMin={(v) => updateFilter("NUMBER_OF_AXLES_MIN", v)} onChangeMax={() => {}} min={1} max={9} />
              </div>

              <div className="action-buttons" style={{ display: "flex", alignItems: "center", gap: 12, marginTop: isMobile ? 10 : 24, width: "100%", minWidth: 0, flexWrap: "nowrap" }}>
                <div className="action-buttons-primary" style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: isMobile ? "1 1 auto" : "0 0 auto" }}>
                  <button onClick={handleClear}
                    style={{ flex: isMobile ? "0 0 34%" : "0 0 auto", minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "8px 16px", background: "transparent", color: "#6b7280", border: "1px solid #d1d5db", borderRadius: 999, cursor: "pointer", fontSize: 11, fontFamily: "inherit", letterSpacing: "0.12em", whiteSpace: "nowrap" }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#9ca3af")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#d1d5db")}
                  >
                    <RotateCcw size={11} />
                    CLEAR
                  </button>
                  <button
                    onClick={() => {
                      const hasFilters = Object.values(filters).some((v) => v && v.trim());
                      if (!hasFilters) { toast("No filters set", { description: "Enter at least one parameter before running a search." }); return; }
                      setPage(1);
                      doSearch(filters, 1, "button");
                    }}
                    disabled={loading}
                    style={{ flex: isMobile ? "1 1 0" : "0 0 auto", minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "8px 18px", background: loading ? "#bae6fd" : "#0ea5e9", color: "#ffffff", border: "1px solid #0ea5e9", borderRadius: 999, cursor: loading ? "default" : "pointer", fontSize: 11, fontFamily: "inherit", letterSpacing: "0.15em", fontWeight: 700, textTransform: "uppercase", whiteSpace: "nowrap" }}
                  >
                    {loading ? <LoaderCircle size={11} className="animate-spin" /> : <Search size={11} />}
                    {loading ? "SEARCHING..." : "RUN SEARCH"}
                  </button>
                </div>
                <div className="action-buttons-secondary" style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: isMobile ? "1 1 auto" : "0 0 auto" }}>
                  {results.length > 0 && (
                    <button onClick={() => {
                      captureEvent("export_csv_clicked", {
                        ...summarizeFilters(filters as Record<string, string | undefined>),
                        result_count: results.length,
                      });
                      exportToCsv(results);
                    }}
                      style={{ flex: isMobile ? "1 1 0" : "0 0 auto", minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "8px 16px", background: "transparent", color: "#4b5563", border: "1px solid #d1d5db", borderRadius: 999, cursor: "pointer", fontSize: 11, fontFamily: "inherit", letterSpacing: "0.15em", whiteSpace: "nowrap" }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#9ca3af")}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#d1d5db")}
                    >
                      <Download size={11} />
                      EXPORT CSV
                    </button>
                  )}
                  {total !== null && (
                    <button onClick={handleCopyLink}
                      style={{ flex: isMobile ? "1 1 0" : "0 0 auto", minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "8px 16px", background: copiedLink ? "#dcfce7" : "transparent", color: copiedLink ? "#15803d" : "#4b5563", border: copiedLink ? "1px solid #22c55e" : "1px solid #d1d5db", borderRadius: 999, cursor: "pointer", fontSize: 11, fontFamily: "inherit", letterSpacing: "0.15em", whiteSpace: "nowrap" }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#9ca3af")}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = copiedLink ? "#22c55e" : "#d1d5db")}
                    >
                      <Link2 size={11} />
                      {copiedLink ? "LINK COPIED" : "COPY LINK"}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Result Breakdown */}
            <div className="filters-right-col" style={{ flex: "1 1 0", minWidth: 0, borderLeft: "1px solid #f3f4f6", paddingLeft: 32, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div style={{ flex: 1, overflow: "auto", minWidth: 0 }}>
                <ResultStats data={breakdown} loading={breakdownLoading} hideHeader isInline />
              </div>
            </div>
          </div>

          {errorMessage && (
            <div style={{ marginTop: 16, padding: "10px 12px", borderRadius: 4, border: "1px solid #3b1f1f", background: "#140909", color: "#fda4a4", fontSize: 11, fontFamily: "'JetBrains Mono', 'Courier New', monospace" }}>
              <h3 style={{ fontWeight: 700, letterSpacing: "0.12em", marginBottom: 4, margin: "0 0 4px", fontSize: "inherit" }}>SEARCH ERROR</h3>
              <div style={{ color: "#fca5a5" }}>{errorMessage}</div>
            </div>
          )}
        </div>
      </div>


      {total !== null && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden", background: "#f3f4f6" }}>
          <div className="results-bar" style={{ padding: "6px 24px", background: "#ffffff", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ fontSize: 10, color: "#6b7280", letterSpacing: "0.1em", margin: 0, fontWeight: 400 }}>
              SHOWING <span style={{ color: "#111827" }}>{displayResults.length.toLocaleString()}</span> OF{" "}
              <span style={{ color: "#0f766e" }}>{total.toLocaleString()}</span> RECORDS
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
            <table className="results-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, tableLayout: "fixed", background: "#ffffff" }}>
              <thead style={{ position: "sticky", top: 0, background: "#f9fafb", zIndex: 10 }}>
                <tr>
                  {resultColumns.map((col) => (
                    <th key={col.key} onClick={() => handleSort(col.key)}
                      style={{ padding: "8px 16px", textAlign: "left", fontSize: 9, letterSpacing: "0.2em", color: sort?.key === col.key ? "#0ea5e9" : "#6b7280", cursor: "pointer", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap", fontWeight: 700, userSelect: "none", overflow: "hidden", textOverflow: "ellipsis", width: `${100 / resultColumns.length}%` }}
                    >
                      {col.label}
                      {sort?.key === col.key && <span style={{ marginLeft: 4, color: "#0ea5e9" }}>{sort.dir === "asc" ? "↑" : "↓"}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedResults.length === 0 ? (
                  <tr>
                    <td colSpan={resultColumns.length} style={{ padding: "60px 24px", textAlign: "center", color: "#9ca3af", fontSize: 11, letterSpacing: "0.1em" }}>
                      NO RECORDS MATCH YOUR QUERY
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
          </div>

          <Pagination page={page} pages={pages} onPageChange={handlePageChange} />
        </div>
      )}

      {total === null && (
        <div className="empty-state" style={{ textAlign: "center", padding: "80px 24px" }}>
          <div style={{ fontSize: 48, color: "#1a1a1a", marginBottom: 24 }}>⊞</div>
          <h2 style={{ fontSize: 11, color: "#333", letterSpacing: "0.2em", margin: "0 0 8px", fontWeight: 400 }}>ENTER SEARCH PARAMETERS ABOVE</h2>
          <p style={{ fontSize: 10, color: "#222", letterSpacing: "0.15em", margin: 0 }}>SET FILTERS ABOVE, THEN CLICK RUN SEARCH</p>
        </div>
      )}

      {selectedVehicle && (
        <Suspense fallback={null}>
          <VehicleDetail vehicle={selectedVehicle} onClose={() => setSelectedVehicle(null)} />
        </Suspense>
      )}

      {/* ── Mobile breakdown bottom sheet ── */}
      {total !== null && (
        <>
          {/* Floating trigger */}
          <button
            className="breakdown-trigger"
            onClick={() => setBreakdownSheetOpen(true)}
            style={{
              position: "fixed",
              left: 16,
              right: 16,
              bottom: "calc(env(safe-area-inset-bottom, 0px) + 10px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "11px 14px",
              background: "rgba(15, 23, 42, 0.96)",
              color: "#ffffff",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.15em",
              cursor: "pointer",
              zIndex: 30,
              boxShadow: "0 10px 24px rgba(15, 23, 42, 0.22)",
              backdropFilter: "blur(10px)",
              fontFamily: "inherit",
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em" }}>RESULT BREAKDOWN</span>
            <span style={{ fontSize: 10, color: "#7dd3fc", letterSpacing: "0.16em" }}>OPEN</span>
          </button>

          {/* Overlay */}
          <div
            onClick={() => setBreakdownSheetOpen(false)}
            style={{
              position: "fixed", inset: 0,
              background: "rgba(0,0,0,0.45)",
              zIndex: 50,
              opacity: breakdownSheetOpen ? 1 : 0,
              pointerEvents: breakdownSheetOpen ? "auto" : "none",
              transition: "opacity 0.25s ease",
            }}
          />

          {/* Sheet */}
          <div
            style={{
              position: "fixed", bottom: 0, left: 0, right: 0,
              height: "70vh",
              background: "#ffffff",
              borderRadius: "16px 16px 0 0",
              zIndex: 51,
              transform: breakdownSheetOpen ? "translateY(0)" : "translateY(100%)",
              transition: "transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
              display: "flex", flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "#d1d5db" }} />
            </div>
            <div style={{
              padding: "8px 16px 12px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              borderBottom: "1px solid #e5e7eb",
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", color: "#0f172a" }}>
                RESULT BREAKDOWN
              </span>
              <button
                onClick={() => setBreakdownSheetOpen(false)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 16, color: "#6b7280", lineHeight: 1, padding: 4,
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              <ResultStats data={breakdown} loading={breakdownLoading} hideHeader />
            </div>
          </div>
        </>
      )}

      </div>

      <footer className="footer-root" style={{ padding: "12px 24px", background: "#ffffff", borderTop: "1px solid #e5e7eb", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, fontSize: 10, fontFamily: "'JetBrains Mono', 'Courier New', monospace", color: "#6b7280", letterSpacing: "0.1em" }}>
        <div className="footer-links" style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span>DEVELOPED BY <a href="https://jedbillyb.com" target="_blank" rel="noopener noreferrer" style={{ color: "#0ea5e9", textDecoration: "none", fontWeight: 700 }}>JED BLENKHORN</a></span>
          <span style={{ color: "#d1d5db" }}>·</span>
          <a href="https://github.com/jedbillyb/nz-vehicle-finder" target="_blank" rel="noopener noreferrer" style={{ color: "#111827", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
            SOURCE
          </a>
          <span style={{ color: "#d1d5db" }}>·</span>
          <a href="https://buymeacoffee.com/jedbillyb" target="_blank" rel="noopener noreferrer" onClick={() => captureEvent("sponsor_link_clicked", { location: "footer" })} style={{ color: "#ef4444", textDecoration: "none", fontWeight: 700 }}>SPONSOR THIS PROJECT</a>
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
