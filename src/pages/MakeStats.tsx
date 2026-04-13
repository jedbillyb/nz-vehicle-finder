import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { useParams, Link } from "react-router-dom";
import { Pagination } from "@/components/Pagination";
import { ResultStats } from "@/components/ResultStats";
import {
  fetchBreakdown,
  searchVehicles,
  type BreakdownData,
} from "@/lib/vehicleApi";
import { Vehicle } from "@/lib/mockData";
import { ArrowRight } from "lucide-react";

const VehicleDetail = lazy(() =>
  import("@/components/VehicleDetail").then((m) => ({ default: m.VehicleDetail }))
);

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

export default function MakeStats() {
  const { make } = useParams<{ make: string }>();
  const makeUpper = (make || "").toUpperCase();
  const makeDisplay = makeUpper.charAt(0) + makeUpper.slice(1).toLowerCase();

  const [results, setResults] = useState<Vehicle[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [sort, setSort] = useState<SortConfig>(null);
  const [breakdown, setBreakdown] = useState<BreakdownData>({});
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const breakdownAbortRef = useRef<AbortController | null>(null);

  const filters = useMemo(() => ({ MAKE: makeUpper }), [makeUpper]);

  const doSearch = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const data = await searchVehicles(filters, p);
      setResults(data.vehicles);
      setTotal(data.total);
      setPages(data.pages);
      setSort(null);

      if (p === 1) {
        breakdownAbortRef.current?.abort();
        const controller = new AbortController();
        breakdownAbortRef.current = controller;
        setBreakdownLoading(true);
        fetchBreakdown(filters, controller.signal)
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
    }
  }, [filters]);

  useEffect(() => {
    doSearch(1);
    return () => breakdownAbortRef.current?.abort();
  }, [doSearch]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    doSearch(newPage);
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
          <div style={{ background: "#0ea5e9", padding: "4px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "10px", color: "#f9fafb", fontWeight: 600, letterSpacing: "0.16em" }}>
              WAKA KOTAHI · MOTOR VEHICLE REGISTER · PUBLIC ACCESS TERMINAL
            </span>
            <span style={{ fontSize: "10px", color: "#e0f2fe", letterSpacing: "0.1em" }}>
              {new Date().toISOString().split("T")[0]}
            </span>
          </div>
          <div style={{ padding: "10px 24px", display: "flex", alignItems: "center", gap: 16, background: "#ffffff" }}>
            <Link to="/" style={{ textDecoration: "none" }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: "1px solid #d1d5db" }}>
                <img src="/favicon.svg" alt="Logo" style={{ width: "100%", height: "100%" }} />
              </div>
            </Link>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", letterSpacing: "0.02em", margin: 0 }}>
                NZ Vehicle Finder
              </h1>
              <p style={{ fontSize: 11, color: "#6b7280", letterSpacing: "0.12em", margin: 0, textTransform: "uppercase" }}>
                Motor Vehicle Register · {makeUpper} Statistics
              </p>
            </div>
            {total !== null && (
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#0f766e", lineHeight: 1 }}>{total.toLocaleString()}</div>
                  <div style={{ fontSize: 9, color: "#6b7280", letterSpacing: "0.15em" }}>VEHICLES REGISTERED</div>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Hero heading */}
        <div style={{ padding: "32px 24px 24px", background: "#ffffff", borderBottom: "1px solid #e5e7eb" }}>
          <h2 style={{ fontSize: 48, fontWeight: 800, color: "#0f172a", margin: "0 0 12px", letterSpacing: "-0.03em", lineHeight: 1.1 }}>
            {total !== null ? total.toLocaleString() : "..."} {makeDisplay} vehicles registered in NZ
          </h2>
          <p style={{ fontSize: 16, color: "#374151", margin: 0, letterSpacing: "0.01em" }}>
            Breakdown and full listing of all Toyota vehicles on the New Zealand Motor Vehicle Register.
          </p>
        </div>

        {/* Breakdown */}
        <ResultStats data={breakdown} loading={breakdownLoading} />

        {/* Results table */}
        {total !== null && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden", background: "#f3f4f6" }}>
            <div style={{ padding: "6px 24px", background: "#ffffff", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ fontSize: 10, color: "#6b7280", letterSpacing: "0.1em", margin: 0, fontWeight: 400 }}>
                SHOWING <span style={{ color: "#111827" }}>{sortedResults.length.toLocaleString()}</span> OF{" "}
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
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, tableLayout: "fixed", background: "#ffffff" }}>
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
                    sortedResults.map((v, i) => (
                      <tr key={i} onClick={() => setSelectedVehicle(v)}
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

        {selectedVehicle && (
          <Suspense fallback={null}>
            <VehicleDetail vehicle={selectedVehicle} onClose={() => setSelectedVehicle(null)} />
          </Suspense>
        )}
      </div>

      <footer style={{ padding: "12px 24px", background: "#ffffff", borderTop: "1px solid #e5e7eb", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, fontSize: 10, fontFamily: "'JetBrains Mono', 'Courier New', monospace", color: "#6b7280", letterSpacing: "0.1em" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span>DEVELOPED BY <a href="https://jedbillyb.com" target="_blank" rel="noopener noreferrer" style={{ color: "#0ea5e9", textDecoration: "none", fontWeight: 700 }}>JED BLENKHORN</a></span>
          <span style={{ color: "#d1d5db" }}>·</span>
          <a href="https://github.com/jedbillyb/nz-vehicle-finder" target="_blank" rel="noopener noreferrer" style={{ color: "#111827", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
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
