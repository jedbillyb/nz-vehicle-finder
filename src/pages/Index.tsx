import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { SearchField } from "@/components/SearchField";
import { RangeField } from "@/components/RangeField";
import { Pagination } from "@/components/Pagination";
import { ResultStats } from "@/components/ResultStats";
import { SaveSearchButton, SavedSearchLinks } from "@/components/SaveSearchButton";
import {
  API_BASE,
  checkHealth,
  fetchBreakdown,
  fetchFleetOverview,
  preloadModelsForMake,
  preloadSuggestions,
  type BreakdownData,
  type SearchFilters,
  searchVehicles,
} from "@/lib/vehicleApi";
import { clampPageSize, DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "../../shared/pagination";
import { hasTerms } from "../../shared/filterTerms";
import { canonicalQuery } from "../../shared/savedSearch";
import { exportToCsv } from "@/lib/csvExport";
import { applySeo } from "@/lib/seo";
import { captureEvent, summarizeFilters } from "@/lib/posthog";
import { sharePage } from "@/lib/share";
import { Vehicle } from "@/lib/mockData";
import { resultColumns } from "@/lib/resultColumns";
import { toast } from "sonner";
import { Search, RotateCcw, Download, Share2, LoaderCircle, ChevronDown } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { POPULAR_MAKES } from "@/lib/popularMakes";
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

const primaryFilterFields: { key: keyof SearchFilters; label: string; helpText?: string }[] = [
  { key: "MAKE", label: "Make" },
  { key: "MODEL", label: "Model" },
  { key: "SUBMODEL", label: "Submodel" },
  { key: "BASIC_COLOUR", label: "Colour" },
  { key: "MOTIVE_POWER", label: "Fuel Type" },
  { key: "BODY_TYPE", label: "Body Type" },
  { key: "TRANSMISSION_TYPE", label: "Transmission" },
  { key: "TLA", label: "Registered Region", helpText: "The Territorial Local Authority (TLA) associated with the vehicle owner's current registered address. This is not necessarily where the vehicle was first registered or manufactured." },
  { key: "IMPORT_STATUS", label: "Import Status", helpText: "Whether the vehicle was first registered new in New Zealand or imported used from overseas." },
];

const advancedFilterFields: { key: keyof SearchFilters; label: string; helpText?: string }[] = [
  { key: "POSTCODE", label: "Postcode" },
  { key: "ORIGINAL_COUNTRY", label: "Country of Manufacture" },
  { key: "CLASS", label: "Class" },
  { key: "INDUSTRY_CLASS", label: "Industry Class" },
  { key: "ROAD_TRANSPORT_CODE", label: "Road Code" },
  { key: "VEHICLE_USAGE", label: "Usage" },
  { key: "NZ_ASSEMBLED", label: "NZ Assembled" },
];

const advancedFilterKeySet = new Set([
  "POSTCODE", "ORIGINAL_COUNTRY", "CLASS", "INDUSTRY_CLASS",
  "ROAD_TRANSPORT_CODE", "VEHICLE_USAGE", "NZ_ASSEMBLED",
  "GROSS_VEHICLE_MASS_MIN", "GROSS_VEHICLE_MASS_MAX", "WIDTH_MIN", "WIDTH_MAX",
  "NUMBER_OF_SEATS_MIN", "NUMBER_OF_AXLES_MIN",
]);

/** Widths are shares of the table, sized to what each column usually holds. */

type SortConfig = { key: keyof Vehicle; dir: "asc" | "desc" } | null;

const emptyFilters = (): SearchFilters => ({});

const VehicleDetail = lazy(() =>
  import("@/components/VehicleDetail").then((m) => ({ default: m.VehicleDetail }))
);

function filtersFromParams(params: URLSearchParams): SearchFilters {
  const filters: SearchFilters = {};
  const validKeys = new Set([
    ...primaryFilterFields.map((f) => f.key),
    ...advancedFilterFields.map((f) => f.key),
    "VEHICLE_YEAR_MIN", "VEHICLE_YEAR_MAX", "CC_RATING_MIN", "CC_RATING_MAX",
    "POWER_RATING_MIN", "POWER_RATING_MAX", "GROSS_VEHICLE_MASS_MIN", "GROSS_VEHICLE_MASS_MAX",
    "WIDTH_MIN", "WIDTH_MAX", "NUMBER_OF_SEATS_MIN", "NUMBER_OF_AXLES_MIN",
  ]);
  for (const [k, v] of params.entries()) {
    if (!v || !validKeys.has(k)) continue;
    filters[k as keyof SearchFilters] = v;
  }
  return filters;
}

/** Shown until /api/fleet-overview answers; matches the July 2026 NZTA snapshot. */
const FLEET_TOTAL_FALLBACK = 5_902_186;

/** "2026-07-31" -> "31 JUL 2026" */
function formatSnapshot(iso: string): string | null {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date
    .toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .toUpperCase();
}

const PAGE_SIZE_STORAGE_KEY = "nzvf.pageSize";

/** A shared link wins over the local preference, which wins over the default. */
function readInitialPageSize(params: URLSearchParams): number {
  const fromUrl = params.get("limit");
  if (fromUrl) return clampPageSize(fromUrl);
  try {
    const stored = localStorage.getItem(PAGE_SIZE_STORAGE_KEY);
    if (stored) return clampPageSize(stored);
  } catch {
    // localStorage can be blocked; the default is fine.
  }
  return DEFAULT_PAGE_SIZE;
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
  const [pageSize, setPageSize] = useState(() => readInitialPageSize(searchParams));
  const [fleetTotal, setFleetTotal] = useState(FLEET_TOTAL_FALLBACK);
  const [dataSnapshot, setDataSnapshot] = useState<string | null>(null);
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
  const [validity, setValidity] = useState<Record<string, boolean>>({});
  const isSearching = useRef(false);
  const [showAdvanced, setShowAdvanced] = useState(() => [...searchParams.keys()].some(k => advancedFilterKeySet.has(k)));
  const advancedActiveCount = useMemo(() => [...advancedFilterKeySet].filter(k => (filters[k as keyof SearchFilters] as string | undefined)?.trim()).length, [filters]);

  useEffect(() => { preloadSuggestions(); }, []);

  // The register grows every month, so read the size rather than hard-coding it.
  useEffect(() => {
    fetchFleetOverview()
      .then((overview) => {
        if (overview?.total) setFleetTotal(overview.total);
        if (overview?.snapshotDate) setDataSnapshot(formatSnapshot(overview.snapshotDate));
      })
      .catch(() => { /* the fallback figure stays on screen */ });
  }, []);

  useEffect(() => {
    applySeo({
      title: "NZ Vehicle Finder - Search the NZ Motor Vehicle Register",
      description:
        "Free fleet search for the NZ Motor Vehicle Register with 5.9 million records. Filter by make, model, colour, fuel type, year, region and more. Free public access.",
      keywords: "fleet search, NZ vehicle register, motor vehicle register, NZ vehicle finder, car registration search NZ",
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

  /**
   * The filters a given field's suggestions must respect: every other active
   * filter, ranges included. This is what makes a mismatched combination
   * unselectable - a value only appears in a dropdown if rows still exist for it
   * alongside everything else that is set. A field never constrains itself, or
   * picking one make would leave that make as the only one you could add.
   */
  const suggestionContextFor = useCallback(
    (field: string): Record<string, string> | undefined => {
      const context: Record<string, string> = {};
      for (const [key, value] of Object.entries(filters)) {
        if (!value || !value.trim()) continue;
        const base = key.endsWith("_MIN") || key.endsWith("_MAX") ? key.slice(0, -4) : key;
        if (base === field) continue;
        context[key] = value.trim();
      }
      return Object.keys(context).length > 0 ? context : undefined;
    },
    [filters]
  );

  const updateValidity = (key: string, isValid: boolean) => {
    // Bail out when nothing changed: the fields report on every render, so a
    // fresh object here would re-render the page forever.
    setValidity(prev => (prev[key] === isValid ? prev : { ...prev, [key]: isValid }));
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
    async (f: SearchFilters, p: number, trigger: "button" | "page" | "auto" | "page_size" = "button", size: number = pageSize) => {
      if (isSearching.current) return;
      isSearching.current = true;
      const startedAt = Date.now();
      setLoading(true);
      setErrorMessage(null);

      const searchMeta = {
        trigger,
        page: p,
        page_size: size,
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
        const data = await searchVehicles(f, p, size);
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
          latency_ms: Date.now() - startedAt,
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
        isSearching.current = false;
      }
    },
    [pageSize]
  );

  useEffect(() => {
    if (!initialLoad.current) return;
    initialLoad.current = false;
    const hasFilters = Object.values(filters).some((v) => v && v?.trim());
    if (hasFilters) doSearch(filters, 1, "auto");
  }, [filters, doSearch]);

  useEffect(() => {
    const p = filtersToParams(filters);
    if (pageSize !== DEFAULT_PAGE_SIZE) p.limit = String(pageSize);
    setSearchParams(p, { replace: true });
  }, [filters, pageSize, setSearchParams]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    captureEvent("page_changed", {
      page: newPage,
      result_count: total ?? 0,
      source: "home_page",
    });
    doSearch(filters, newPage, "page");
  };

  const handlePageSizeChange = (nextSize: number) => {
    const size = clampPageSize(nextSize);
    setPageSize(size);
    try {
      localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(size));
    } catch {
      // Preference just won't persist.
    }
    captureEvent("page_size_changed", { page_size: size, result_count: total ?? 0 });
    // Row 1 of the old page is no longer row 1 of the new one, so start over.
    if (total !== null) {
      setPage(1);
      doSearch(filters, 1, "page_size", size);
    }
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


  // Share sheet on phones, copy elsewhere; the link keeps the filters and carries UTM tags.
  const handleShare = async () => {
    const result = await sharePage("search");
    if (result === "native" || result === "copy") {
      captureEvent("share_clicked", {
        method: result,
        source: "search",
        ...summarizeFilters(filters as Record<string, string | undefined>),
        result_count: total ?? 0,
      });
    }
    if (result === "copy") {
      setCopiedLink(true);
      toast("Search link copied", { description: "Paste it anywhere to share these filters." });
      setTimeout(() => setCopiedLink(false), 1500);
    } else if (result === "failed") {
      toast.error("Could not copy link", { description: "Your browser blocked clipboard access." });
    }
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

  const displayResults = sortedResults;

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

      <SiteHeader
        source="index"
        subtitle="NZ Motor Vehicle Register · Fleet search"
        onLogoClick={handleClear}
        {...(total !== null ? { count: total, countLabel: "MATCHES FOUND" } : {})}
      />

      <div style={{ borderBottom: "1px solid #e5e7eb", background: "#ffffff" }}>
        {/* Filter panel */}
        <div className="filters-panel" style={{ padding: "20px 24px", background: "#ffffff" }}>
          {/* Primary Filters */}
          {/* Column counts live in responsive.css (.filters-grid): 2, 4 or 6, so the 12 fields fill whole rows. */}
          <div className="main-filters-grid filters-grid" style={{ display: "grid", gap: "12px 16px" }}>
            {primaryFilterFields.map((f) => (
              <SearchField
                key={f.key}
                label={f.label}
                helpText={f.helpText}
                field={f.key as keyof Vehicle}
                value={(filters[f.key] as string) || ""}
                onChange={(v) => updateFilter(f.key, v)}
                onValidationChange={(isValid) => updateValidity(f.key, isValid)}
                filterBy={suggestionContextFor(f.key)}
              />
            ))}
            <RangeField label="Year" fieldMin="VEHICLE_YEAR_MIN" fieldMax="VEHICLE_YEAR_MAX" valueMin={filters.VEHICLE_YEAR_MIN || ""} valueMax={filters.VEHICLE_YEAR_MAX || ""} onChangeMin={(v) => updateFilter("VEHICLE_YEAR_MIN", v)} onChangeMax={(v) => updateFilter("VEHICLE_YEAR_MAX", v)} min={1950} max={2026} />
            <RangeField label="CC rating" fieldMin="CC_RATING_MIN" fieldMax="CC_RATING_MAX" valueMin={filters.CC_RATING_MIN || ""} valueMax={filters.CC_RATING_MAX || ""} onChangeMin={(v) => updateFilter("CC_RATING_MIN", v)} onChangeMax={(v) => updateFilter("CC_RATING_MAX", v)} min={0} max={8000} />
            <RangeField label="Power (kW)" fieldMin="POWER_RATING_MIN" fieldMax="POWER_RATING_MAX" valueMin={filters.POWER_RATING_MIN || ""} valueMax={filters.POWER_RATING_MAX || ""} onChangeMin={(v) => updateFilter("POWER_RATING_MIN", v)} onChangeMax={(v) => updateFilter("POWER_RATING_MAX", v)} min={0} max={500} />
          </div>

          {/* More filters toggle + advanced section */}
          <div style={{ marginTop: 16, paddingBottom: 16, borderBottom: "1px solid #f3f4f6" }}>
            <button
              onClick={() => {
              const next = !showAdvanced;
              setShowAdvanced(next);
              captureEvent("advanced_filters_toggled", {
                expanded: next,
                active_advanced_filter_count: advancedActiveCount,
              });
            }}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", border: "none", cursor: "pointer", padding: 0, fontSize: 11, fontWeight: 600, color: advancedActiveCount > 0 ? "#0ea5e9" : "#6b7280", letterSpacing: "0.05em", fontFamily: "inherit" }}
            >
              <ChevronDown size={13} style={{ transform: showAdvanced ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease", flexShrink: 0 }} />
              More filters
              {advancedActiveCount > 0 && (
                <span style={{ background: "#0ea5e9", color: "#ffffff", fontSize: 9, fontWeight: 700, borderRadius: 999, padding: "1px 6px", letterSpacing: "0.05em" }}>
                  {advancedActiveCount}
                </span>
              )}
            </button>

            {showAdvanced && (
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, marginTop: 12 }}>
                <div className="filters-grid" style={{ display: "grid", gap: "12px 16px" }}>
                  {advancedFilterFields.map((f) => (
                    <SearchField
                      key={f.key}
                      label={f.label}
                      helpText={f.helpText}
                      field={f.key as keyof Vehicle}
                      value={(filters[f.key] as string) || ""}
                      onChange={(v) => updateFilter(f.key, v)}
                      onValidationChange={(isValid) => updateValidity(f.key, isValid)}
                      filterBy={suggestionContextFor(f.key)}
                    />
                  ))}
                  <RangeField label="Gross mass" fieldMin="GROSS_VEHICLE_MASS_MIN" fieldMax="GROSS_VEHICLE_MASS_MAX" valueMin={filters.GROSS_VEHICLE_MASS_MIN || ""} valueMax={filters.GROSS_VEHICLE_MASS_MAX || ""} onChangeMin={(v) => updateFilter("GROSS_VEHICLE_MASS_MIN", v)} onChangeMax={(v) => updateFilter("GROSS_VEHICLE_MASS_MAX", v)} min={0} max={50000} />
                  <RangeField label="Width (mm)" fieldMin="WIDTH_MIN" fieldMax="WIDTH_MAX" valueMin={filters.WIDTH_MIN || ""} valueMax={filters.WIDTH_MAX || ""} onChangeMin={(v) => updateFilter("WIDTH_MIN", v)} onChangeMax={(v) => updateFilter("WIDTH_MAX", v)} min={0} max={3500} />
                  <RangeField label="Seats (min)" fieldMin="NUMBER_OF_SEATS_MIN" fieldMax="NUMBER_OF_SEATS_MIN" valueMin={filters.NUMBER_OF_SEATS_MIN || ""} valueMax="" onChangeMin={(v) => updateFilter("NUMBER_OF_SEATS_MIN", v)} onChangeMax={() => {}} min={1} max={20} />
                  <RangeField label="Axles (min)" fieldMin="NUMBER_OF_AXLES_MIN" fieldMax="NUMBER_OF_AXLES_MIN" valueMin={filters.NUMBER_OF_AXLES_MIN || ""} valueMax="" onChangeMin={(v) => updateFilter("NUMBER_OF_AXLES_MIN", v)} onChangeMax={() => {}} min={1} max={9} />
                </div>
              </div>
            )}
          </div>

          {/* Actions, then the breakdown full width below */}
          <div className="filters-bottom" style={{ minWidth: 0 }}>
            <div className="filters-left-col" style={{ minWidth: 0 }}>
              <div className="action-buttons" style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", minWidth: 0, flexWrap: "nowrap" }}>
                <div className="action-buttons-primary" style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: isMobile ? "1 1 auto" : "0 0 auto" }}>
                  <button onClick={handleClear}
                    style={{ flex: isMobile ? "0 0 34%" : "0 0 auto", minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "8px 16px", background: "transparent", color: "#6b7280", border: "1px solid #d1d5db", borderRadius: 999, cursor: "pointer", fontSize: 11, fontFamily: "inherit", letterSpacing: "0.02em", whiteSpace: "nowrap" }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#9ca3af")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#d1d5db")}
                  >
                    <RotateCcw size={11} />
                    Clear
                  </button>
                  <button
                    onClick={() => {
                      const hasFilters = Object.values(filters).some((v) => v && v.trim());
                      if (!hasFilters) { toast("No filters set", { description: "Enter at least one parameter before running a search." }); return; }

                      const allValid = Object.values(validity).every(v => v !== false);
                      if (!allValid) {
                        toast("Invalid search parameters", { description: "Please correct the highlighted fields before searching." });
                        return;
                      }

                      setPage(1);
                      doSearch(filters, 1, "button");
                    }}
                    disabled={loading}
                    style={{ flex: isMobile ? "1 1 0" : "0 0 auto", minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "8px 18px", background: loading ? "#bae6fd" : "#0ea5e9", color: "#ffffff", border: "1px solid #0ea5e9", borderRadius: 999, cursor: loading ? "default" : "pointer", fontSize: 11, fontFamily: "inherit", letterSpacing: "0.02em", fontWeight: 700, whiteSpace: "nowrap" }}
                  >
                    {loading ? <LoaderCircle size={11} className="animate-spin" /> : <Search size={11} />}
                    {loading ? "Searching…" : "Run search"}
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
                      style={{ flex: isMobile ? "1 1 0" : "0 0 auto", minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "8px 16px", background: "transparent", color: "#4b5563", border: "1px solid #d1d5db", borderRadius: 999, cursor: "pointer", fontSize: 11, fontFamily: "inherit", letterSpacing: "0.02em", whiteSpace: "nowrap" }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#9ca3af")}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#d1d5db")}
                    >
                      <Download size={11} />
                      Export CSV
                    </button>
                  )}
                  {total !== null && (
                    <SaveSearchButton
                      query={canonicalQuery(filtersToParams(filters))}
                      style={{ flex: isMobile ? "1 1 0" : "0 0 auto", minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "8px 16px", borderRadius: 999, fontSize: 11, fontFamily: "inherit", letterSpacing: "0.02em", whiteSpace: "nowrap" }}
                    />
                  )}
                  {total !== null && (
                    <button onClick={handleShare}
                      style={{ flex: isMobile ? "1 1 0" : "0 0 auto", minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "8px 16px", background: copiedLink ? "#dcfce7" : "transparent", color: copiedLink ? "#15803d" : "#4b5563", border: copiedLink ? "1px solid #22c55e" : "1px solid #d1d5db", borderRadius: 999, cursor: "pointer", fontSize: 11, fontFamily: "inherit", letterSpacing: "0.02em", whiteSpace: "nowrap" }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#9ca3af")}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = copiedLink ? "#22c55e" : "#d1d5db")}
                    >
                      <Share2 size={11} />
                      {copiedLink ? "Copied!" : "Share"}
                    </button>
                  )}
                  {total !== null && (
                    <Link
                      to="/developers"
                      onClick={() => captureEvent("api_cta_clicked", { location: "results_actions", source: "index" })}
                      style={{ flex: isMobile ? "1 1 0" : "0 0 auto", minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "8px 16px", background: "#f0f9ff", color: "#0369a1", border: "1px solid #bae6fd", borderRadius: 999, fontSize: 11, letterSpacing: "0.02em", whiteSpace: "nowrap", textDecoration: "none", fontWeight: 600 }}
                    >
                      Get via API
                    </Link>
                  )}
                </div>
              </div>
            </div>

            {(breakdownLoading || Object.keys(breakdown).length > 0) && (
              <div className="filters-right-col" style={{ minWidth: 0 }}>
                <ResultStats data={breakdown} loading={breakdownLoading} hideHeader isInline />
              </div>
            )}
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
              SHOWING <span style={{ color: "#111827" }}>{displayResults.length.toLocaleString('en-NZ')}</span> OF{" "}
              <span style={{ color: "#0f766e" }}>{total.toLocaleString('en-NZ')}</span> RECORDS
              {pages > 1 && <> · PAGE <span style={{ color: "#111827" }}>{page}</span>/<span style={{ color: "#4b5563" }}>{pages}</span></>}
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {sort && (
                <span style={{ fontSize: 10, color: "#6b7280", letterSpacing: "0.1em" }}>
                  SORT: <span style={{ color: "#0ea5e9" }}>{sort.key}</span>{" "}
                  <span style={{ color: "#4b5563" }}>{sort.dir === "asc" ? "↑" : "↓"}</span>
                </span>
              )}
              <label style={{ fontSize: 10, color: "#6b7280", letterSpacing: "0.1em", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                PER PAGE
                <select
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  disabled={loading}
                  style={{ fontSize: 10, color: "#111827", background: "#ffffff", border: "1px solid #d1d5db", borderRadius: 4, padding: "2px 4px", fontFamily: "inherit", cursor: loading ? "default" : "pointer" }}
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div style={{ overflowX: "auto", flex: 1, overflowY: "auto" }}>
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
                        source: "home_page",
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
        <div className="empty-state" style={{ padding: "60px 24px", maxWidth: 800, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            {/* A first search (e.g. opened from a link) has no total yet, so say it's running rather than asking for filters. */}
            <div style={{ marginBottom: 16, display: "flex", justifyContent: "center" }}>
              {loading ? <LoaderCircle size={36} color="#0ea5e9" className="animate-spin" /> : <Search size={36} color="#94a3b8" />}
            </div>
            <h2 style={{ fontSize: 14, color: "#374151", letterSpacing: 0, margin: "0 0 8px", fontWeight: 500 }}>
              {loading ? "Searching the register..." : "Use the filters above to search"}
            </h2>
            <p style={{ fontSize: 12, color: "#6b7280", letterSpacing: 0, margin: 0 }}>
              {loading ? "Broad searches can take a few seconds" : "Set at least one filter, then click Run Search"}
            </p>
          </div>
          <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 40, color: "#374151", fontSize: 13, lineHeight: 1.8 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: "#111827" }}>Search the NZ Motor Vehicle Register</h2>
            <p style={{ marginBottom: 12 }}>NZ Vehicle Finder gives you free public access to New Zealand's Motor Vehicle Register - the same database maintained by Waka Kotahi. Our fleet search tool allows you to search across 5.9 million registered vehicles by make, model, colour, fuel type, region, and more.</p>
            <p style={{ marginBottom: 12 }}>Common uses include checking how many vehicles of a specific make and model are registered in New Zealand (fleet search), researching a used car before buying, or finding registration statistics from the motor vehicle register by region.</p>
            <p style={{ marginBottom: 24 }}>The data is sourced directly from Waka Kotahi NZ Transport Agency's publicly available Motor Vehicle Register dataset, which covers all vehicles currently registered in New Zealand. This comprehensive NZ vehicle register index includes passenger vehicles, motorcycles, trucks, trailers, and more.</p>

            <SavedSearchLinks />
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: "#111827" }}>Popular Searches</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
              {[
                ["Toyota vehicles", "?MAKE=TOYOTA"],
                ["Ford vehicles", "?MAKE=FORD"],
                ["BMW vehicles", "?MAKE=BMW"],
                ["Electric vehicles", "?MOTIVE_POWER=ELECTRIC"],
                ["Vehicles in Auckland", "?TLA=AUCKLAND"],
                ["Vehicles in Wellington", "?TLA=WELLINGTON+CITY"],
                ["Utes in NZ", "?BODY_TYPE=UTILITY"],
                ["Japanese imports", "?ORIGINAL_COUNTRY=JAPAN"],
              ].map(([label, params]) => (
                <a key={label} href={params}
                  style={{ fontSize: 11, color: "#0ea5e9", textDecoration: "none", padding: "4px 10px", border: "1px solid #bae6fd", borderRadius: 999, letterSpacing: "0.08em" }}
                >
                  {label}
                </a>
              ))}
            </div>

            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: "#111827" }}>Browse by Make</h3>
            <div style={{ marginBottom: 24 }}>
              <LinkTiles
                items={POPULAR_MAKES.map((m) => ({
                  key: m.slug,
                  to: `/stats/${m.slug}`,
                  label: m.name,
                  count: m.count,
                  onClick: () => captureEvent("popular_make_clicked", { make: m.upper, source: "home" }),
                }))}
              />
            </div>

            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: "#111827" }}>Frequently Asked Questions</h3>
            {[
              ["Is this free?", "Yes, completely free. The data is publicly available from Waka Kotahi and this tool is open source."],
              ["How current is the data?", "The dataset is updated periodically from Waka Kotahi's public data releases."],
              ["Can I filter by import status?", "Yes - use the Import Status field to filter between vehicles registered new in New Zealand and used imports."],
              ["Can I search by region?", "Yes - use the Registered Region field to filter by Territorial Local Authority (TLA)."],
              ["Can I export results?", "Yes - after running a search, use the Export CSV button to download your results."],
              ["Is there an API?", "Yes - the NZ Vehicle Register API gives you the same data as JSON for your own apps and spreadsheets. The free plan includes 500 requests a month; see vehiclefinder.co.nz/developers."],
              ["Can I share a search?", "Yes - use the Share button to send a link with your current filters applied (or copy it, on a computer)."],
              ["How many vehicles are in the register?", "The register currently contains 5.9 million vehicle records covering all registered vehicles in New Zealand."],
            ].map(([q, a]) => (
              <div key={q} style={{ marginBottom: 12 }}>
                <strong style={{ color: "#111827" }}>{q}</strong> {a}
              </div>
            ))}
            {/* Same rule as the one above this section, so the API card reads as its own block. */}
            <div style={{ borderTop: "1px solid #e5e7eb", marginTop: 32 }} />
            <div style={{ background: "#ffffff", border: "2px solid #0ea5e9", borderRadius: 8, padding: "18px 20px", marginTop: 32, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 320px" }}>
                <div style={{ fontSize: 9, color: "#0369a1", letterSpacing: "0.18em", fontWeight: 700, marginBottom: 6 }}>DEVELOPER API</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Put this data in your own app</div>
                <div style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.6 }}>
                  Every vehicle on the register as JSON, refreshed monthly from NZTA. 500 requests a month free, no card needed.
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Link to="/account" onClick={() => captureEvent("api_cta_clicked", { location: "home_callout", source: "index" })} style={{ padding: "8px 18px", background: "#0ea5e9", color: "#ffffff", border: "1px solid #0ea5e9", borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: "0.02em", textDecoration: "none", whiteSpace: "nowrap" }}>
                  Get a free API key
                </Link>
                <Link to="/developers" onClick={() => captureEvent("api_docs_link_clicked", { location: "home_callout", source: "index" })} style={{ padding: "8px 16px", background: "transparent", color: "#4b5563", border: "1px solid #d1d5db", borderRadius: 999, fontSize: 11, letterSpacing: "0.02em", textDecoration: "none", whiteSpace: "nowrap" }}>
                  Read the docs
                </Link>
              </div>
            </div>
          </div>
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
      <SiteFooter source="index" />
    </div>
  );
}
