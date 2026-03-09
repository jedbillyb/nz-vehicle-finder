import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { SearchField } from "@/components/SearchField";
import { RangeField } from "@/components/RangeField";
import { Pagination } from "@/components/Pagination";
import { ResultStats } from "@/components/ResultStats";
import { searchVehicles, SearchFilters, checkHealth, API_BASE, preloadModelsForMake } from "@/lib/vehicleApi";
import { exportToCsv } from "@/lib/csvExport";
import { Vehicle } from "@/lib/mockData";
import { toast } from "sonner";
import { Search, RotateCcw, ChevronUp, ChevronDown, Download, Link2 } from "lucide-react";
import { preloadSuggestions } from "@/lib/vehicleApi";

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

type SavedSearch = {
  id: string;
  label: string;
  params: Record<string, string>;
};

const RECENT_SEARCHES_KEY = "nz-fleet-search:recent";

const VehicleDetail = lazy(() =>
  import("@/components/VehicleDetail").then((m) => ({ default: m.VehicleDetail }))
);

// Parse URL search params into filters
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
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<SavedSearch[]>([]);
  const initialLoad = useRef(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [apiReachable, setApiReachable] = useState<boolean | null>(null);

  useEffect(() => {
    preloadSuggestions();
  }, []);

  const updateFilter = (key: keyof SearchFilters, value: string) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "MAKE") {
        next.MODEL = "";
        if (value) preloadModelsForMake(value); // add this
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

  const persistRecentSearch = useCallback(
    (currentFilters: SearchFilters) => {
      const params = filtersToParams(currentFilters);
      if (Object.keys(params).length === 0) return;

      const label = Object.entries(params)
        .slice(0, 3)
        .map(([k, v]) => `${k}=${v}`)
        .join(" · ");

      const id = JSON.stringify(params);

      setRecentSearches((prev) => {
        const existing = prev.filter((s) => s.id !== id);
        const next: SavedSearch[] = [{ id, label, params }, ...existing].slice(0, 5);
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
        return next;
      });
    },
    []
  );

  const doSearch = useCallback(
    async (f: SearchFilters, p: number) => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const data = await searchVehicles(f, p);
        setResults(data.vehicles);
        setTotal(data.total);
        setPages(data.pages);
        setSort(null);
        if (data.total === 0) {
          toast("No records found", {
            description: "Try broadening your search filters.",
          });
        } else {
          persistRecentSearch(f);
        }
      } catch (err) {
        console.error(err);
        const message =
          err instanceof Error ? err.message : "An unexpected error occurred while searching.";
        setErrorMessage(message);
        toast.error("Search failed", {
          description:
            "We couldn’t reach the vehicle database. Please check your connection and try again.",
        });
      } finally {
        setLoading(false);
      }
    },
    [persistRecentSearch]
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as SavedSearch[];
      setRecentSearches(parsed);
    } catch {
      // ignore parse errors
    }
  }, []);

  useEffect(() => {
    if (!initialLoad.current) return;
    initialLoad.current = false;
    const hasFilters = Object.values(filters).some((v) => v && v?.trim());
    if (hasFilters) {
      doSearch(filters, 1);
    }
  }, [filters, doSearch]);

  // Sync filters to URL
  useEffect(() => {
    const p = filtersToParams(filters);
    setSearchParams(p, { replace: true });
  }, [filters, setSearchParams]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    doSearch(filters, newPage);
  };

  const handleClear = () => {
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
      toast("Search link copied", {
        description: "You can paste this URL to share the current filters.",
      });
      setTimeout(() => setCopiedLink(false), 1500);
    } catch (err) {
      console.error(err);
      toast.error("Could not copy link", {
        description: "Your browser blocked clipboard access.",
      });
    }
  };

  const handleSort = (key: keyof Vehicle) => {
    setSort((prev) => {
      if (prev?.key === key) return prev.dir === "asc" ? { key, dir: "desc" } : null;
      return { key, dir: "asc" };
    });
  };

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

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#f3f4f6",
        fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        color: "#111827",
        overflow: "hidden",
      }}
    >
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
      {/* Header */}
      <header style={{ borderBottom: "1px solid #e5e7eb", background: "#ffffff", position: "sticky", top: 0, zIndex: 40 }}>
        <div style={{ background: "#0ea5e9", padding: "4px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "10px", color: "#f9fafb", fontWeight: 600, letterSpacing: "0.16em" }}>
            WAKA KOTAHI · MOTOR VEHICLE REGISTER · PUBLIC ACCESS TERMINAL
          </span>
          <span style={{ fontSize: "10px", color: "#e0f2fe", letterSpacing: "0.1em" }}>
            {new Date().toISOString().split("T")[0]}
          </span>
        </div>
        <div style={{ padding: "10px 24px", display: "flex", alignItems: "center", gap: 16, background: "#ffffff" }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "2px solid #0ea5e9",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#0ea5e9",
              fontSize: 18,
              flexShrink: 0,
              background: "#f0f9ff",
            }}
          >
            ⊞
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", letterSpacing: "0.02em", margin: 0 }}>NZ Fleet Search</h1>
            <p style={{ fontSize: 11, color: "#6b7280", letterSpacing: "0.12em", margin: 0, textTransform: "uppercase" }}>
              Motor Vehicle Register · 5,879,915 records
            </p>
          </div>
          {total !== null && (
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
              {loading && (
                <span style={{ fontSize: 10, color: "#0ea5e9", letterSpacing: "0.15em", opacity: 0.8 }}>
                  ▋ QUERYING...
                </span>
              )}
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#0f766e", lineHeight: 1 }}>{total.toLocaleString()}</div>
                <div style={{ fontSize: 9, color: "#6b7280", letterSpacing: "0.15em" }}>MATCHES FOUND</div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Filters */}
      <div style={{ borderBottom: "1px solid #e5e7eb", background: "#f3f4f6" }}>
        <button
          onClick={() => setFiltersExpanded(!filtersExpanded)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 24px",
            background: "#f9fafb",
            border: "none",
            borderBottom: filtersExpanded ? "1px solid #e5e7eb" : "none",
            cursor: "pointer",
            color: "#4b5563",
          }}
        >
          <span style={{ fontSize: 10, letterSpacing: "0.2em", display: "flex", alignItems: "center", gap: 8 }}>
            <Search size={11} color="#0ea5e9" />
            <span style={{ color: "#0f172a" }}>SEARCH FILTERS</span>
            <span style={{ color: "#d1d5db" }}>·</span>
            <span>{filterFields.length + 7} PARAMETERS</span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "#6b7280" }}>
            <span>{filtersExpanded ? "CLICK TO HIDE" : "CLICK TO SHOW"}</span>
            {filtersExpanded ? <ChevronUp size={13} color="#444" /> : <ChevronDown size={13} color="#444" />}
          </span>
        </button>

        {filtersExpanded && (
          <div
            style={{
              padding: "16px 24px 20px",
              background: "#f9fafb",
            }}
          >
            <div
              style={{
                padding: 16,
                borderRadius: 12,
                background: "#ffffff",
                boxShadow: "0 10px 25px -15px rgba(15,23,42,0.25)",
                border: "1px solid #e5e7eb",
              }}
            >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "12px 16px" }}>
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
              <RangeField label="GROSS MASS" fieldMin="GROSS_VEHICLE_MASS_MIN" fieldMax="GROSS_VEHICLE_MASS_MAX" valueMin={filters.GROSS_VEHICLE_MASS_MIN || ""} valueMax={filters.GROSS_VEHICLE_MASS_MAX || ""} onChangeMin={(v) => updateFilter("GROSS_VEHICLE_MASS_MIN", v)} onChangeMax={(v) => updateFilter("GROSS_VEHICLE_MASS_MAX", v)} min={0} max={50000} />
              <RangeField label="WIDTH (MM)" fieldMin="WIDTH_MIN" fieldMax="WIDTH_MAX" valueMin={filters.WIDTH_MIN || ""} valueMax={filters.WIDTH_MAX || ""} onChangeMin={(v) => updateFilter("WIDTH_MIN", v)} onChangeMax={(v) => updateFilter("WIDTH_MAX", v)} min={0} max={3500} />
              <RangeField label="SEATS (MIN)" fieldMin="NUMBER_OF_SEATS_MIN" fieldMax="NUMBER_OF_SEATS_MIN" valueMin={filters.NUMBER_OF_SEATS_MIN || ""} valueMax="" onChangeMin={(v) => updateFilter("NUMBER_OF_SEATS_MIN", v)} onChangeMax={() => {}} min={1} max={20} />
              <RangeField label="AXLES (MIN)" fieldMin="NUMBER_OF_AXLES_MIN" fieldMax="NUMBER_OF_AXLES_MIN" valueMin={filters.NUMBER_OF_AXLES_MIN || ""} valueMax="" onChangeMin={(v) => updateFilter("NUMBER_OF_AXLES_MIN", v)} onChangeMax={() => {}} min={1} max={9} />
            </div>

            {recentSearches.length > 0 && (
              <div
                style={{
                  marginTop: 16,
                  paddingTop: 12,
                  borderTop: "1px dashed #F0F0F0",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    color: "#s",
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                  }}
                >
                  RECENT QUERIES
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  {recentSearches.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        const nextFilters: SearchFilters = { ...filters };
                        for (const key of Object.keys(nextFilters) as (keyof SearchFilters)[]) {
                          delete nextFilters[key];
                        }
                        for (const [k, v] of Object.entries(s.params)) {
                          (nextFilters as any)[k] = v;
                        }
                        setFilters(nextFilters);
                      }}
                      style={{
                        borderRadius: 999,
                        border: "1px solid #D9D9D9",
                        padding: "4px 10px",
                        fontSize: 10,
                        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                        background: "#F0F0F0",
                        color: "#9ca3af",
                        cursor: "pointer",
                        maxWidth: "100%",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                        overflow: "hidden",
                      }}
                      title={s.label}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 20, paddingTop: 16, borderTop: "1px solid #e5e7eb" }}>
              <button
                onClick={handleClear}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 16px",
                  background: "transparent",
                  color: "#6b7280",
                  border: "1px solid #d1d5db",
                  borderRadius: 999,
                  cursor: "pointer",
                  fontSize: 11,
                  fontFamily: "inherit",
                  letterSpacing: "0.12em",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#9ca3af")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#d1d5db")}
              >
                <RotateCcw size={11} />
                CLEAR
              </button>
              <button
                onClick={() => {
                  const hasFilters = Object.values(filters).some((v) => v && v.trim());
                  if (!hasFilters) {
                    toast("No filters set", {
                      description: "Enter at least one parameter before running a search.",
                    });
                    return;
                  }
                  setPage(1);
                  doSearch(filters, 1);
                }}
                disabled={loading}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 18px",
                  background: loading ? "#bae6fd" : "#0ea5e9",
                  color: "#ffffff",
                  border: "1px solid #0ea5e9",
                  borderRadius: 999,
                  cursor: loading ? "default" : "pointer",
                  fontSize: 11,
                  fontFamily: "inherit",
                  letterSpacing: "0.15em",
                  fontWeight: 700,
                  textTransform: "uppercase",
                }}
              >
                <Search size={11} />
                {loading ? "SEARCHING..." : "RUN SEARCH"}
              </button>
              {results.length > 0 && (
                <button
                  onClick={() => exportToCsv(results)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 16px",
                    background: "transparent",
                    color: "#4b5563",
                    border: "1px solid #d1d5db",
                    borderRadius: 999,
                    cursor: "pointer",
                    fontSize: 11,
                    fontFamily: "inherit",
                    letterSpacing: "0.15em",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#9ca3af")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#d1d5db")}
                >
                  <Download size={11} />
                  EXPORT CSV
                </button>
              )}
              {total !== null && (
                <button
                  onClick={handleCopyLink}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 16px",
                    background: copiedLink ? "#dcfce7" : "transparent",
                    color: copiedLink ? "#15803d" : "#4b5563",
                    border: copiedLink ? "1px solid #22c55e" : "1px solid #d1d5db",
                    borderRadius: 999,
                    cursor: "pointer",
                    fontSize: 11,
                    fontFamily: "inherit",
                    letterSpacing: "0.15em",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#9ca3af")}
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.borderColor = copiedLink ? "#22c55e" : "#d1d5db")
                  }
                >
                  <Link2 size={11} />
                  {copiedLink ? "LINK COPIED" : "COPY LINK"}
                </button>
              )}
              {loading && (
                <span style={{ fontSize: 10, color: "#0ea5e9", letterSpacing: "0.15em", opacity: 0.8 }}>
                  ▋ QUERYING DATABASE...
                </span>
              )}
            </div>

            {errorMessage && (
              <div
                style={{
                  marginTop: 16,
                  padding: "10px 12px",
                  borderRadius: 4,
                  border: "1px solid #3b1f1f",
                  background: "#140909",
                  color: "#fda4a4",
                  fontSize: 11,
                  fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                }}
              >
                <div style={{ fontWeight: 700, letterSpacing: "0.12em", marginBottom: 4 }}>
                  SEARCH ERROR
                </div>
                <div style={{ color: "#fca5a5" }}>{errorMessage}</div>
              </div>
            )}
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {total !== null && (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            overflow: "hidden",
            background: "#f3f4f6",
          }}
        >
          <ResultStats vehicles={results} />

          <div
            style={{
              padding: "6px 24px",
              background: "#ffffff",
              borderBottom: "1px solid #e5e7eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: 10, color: "#6b7280", letterSpacing: "0.1em" }}>
              SHOWING <span style={{ color: "#111827" }}>{sortedResults.length.toLocaleString()}</span> OF{" "}
              <span style={{ color: "#0f766e" }}>{total.toLocaleString()}</span> RECORDS
              {pages > 1 && (
                <>
                  {" "}
                  · PAGE <span style={{ color: "#111827" }}>{page}</span>/
                  <span style={{ color: "#4b5563" }}>{pages}</span>
                </>
              )}
            </span>
            {sort && (
              <span style={{ fontSize: 10, color: "#6b7280", letterSpacing: "0.1em" }}>
                SORT: <span style={{ color: "#0ea5e9" }}>{sort.key}</span>{" "}
                <span style={{ color: "#4b5563" }}>{sort.dir === "asc" ? "↑" : "↓"}</span>
              </span>
            )}
          </div>

          <div style={{ overflowX: "auto", flex: 1, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, tableLayout: "fixed", background: "#ffffff" }}>
              <thead style={{ position: "sticky", top: 0, background: "#f9fafb", zIndex: 10 }}>
                <tr>
                  {resultColumns.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      style={{
                        padding: "8px 16px",
                        textAlign: "left",
                        fontSize: 9,
                        letterSpacing: "0.2em",
                        color: sort?.key === col.key ? "#0ea5e9" : "#6b7280",
                        cursor: "pointer",
                        borderBottom: "1px solid #e5e7eb",
                        whiteSpace: "nowrap",
                        fontWeight: 700,
                        userSelect: "none",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        width: `${100 / resultColumns.length}%`,
                      }}
                    >
                      {col.label}
                      {sort?.key === col.key && (
                        <span style={{ marginLeft: 4, color: "#0ea5e9" }}>{sort.dir === "asc" ? "↑" : "↓"}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedResults.length === 0 ? (
                  <tr>
                    <td
                      colSpan={resultColumns.length}
                      style={{
                        padding: "60px 24px",
                        textAlign: "center",
                        color: "#9ca3af",
                        fontSize: 11,
                        letterSpacing: "0.1em",
                      }}
                    >
                      NO RECORDS MATCH YOUR QUERY
                    </td>
                  </tr>
                ) : (
                  sortedResults.map((v, i) => (
                    <tr
                      key={i}
                      onClick={() => setSelectedVehicle(v)}
                      style={{
                        cursor: "pointer",
                        borderBottom: "1px solid #e5e7eb",
                        background: i % 2 === 0 ? "#ffffff" : "#f9fafb",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#eff6ff")}
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = i % 2 === 0 ? "#ffffff" : "#f9fafb")
                      }
                    >
                      {resultColumns.map((col, ci) => (
                        <td
                          key={col.key}
                          style={{
                            padding: "7px 16px",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            color: ci === 0 ? "#111827" : ci === 8 ? "#9ca3af" : "#4b5563",
                            fontWeight: ci === 0 ? 600 : 400,
                            fontSize: 11,
                          }}
                        >
                          {v[col.key] || <span style={{ color: "#d1d5db" }}>—</span>}
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
        <div style={{ textAlign: "center", padding: "80px 24px" }}>
          <div style={{ fontSize: 48, color: "#1a1a1a", marginBottom: 24 }}>⊞</div>
          <p style={{ fontSize: 11, color: "#333", letterSpacing: "0.2em", margin: "0 0 8px" }}>ENTER SEARCH PARAMETERS ABOVE</p>
          <p style={{ fontSize: 10, color: "#222", letterSpacing: "0.15em", margin: 0 }}>SET FILTERS ABOVE, THEN CLICK RUN SEARCH</p>
        </div>
      )}

      {selectedVehicle && (
        <Suspense fallback={null}>
          <VehicleDetail vehicle={selectedVehicle} onClose={() => setSelectedVehicle(null)} />
        </Suspense>
      )}
    </div>
  );
}
