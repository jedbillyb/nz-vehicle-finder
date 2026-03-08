import { useState } from "react";
import { SearchField } from "@/components/SearchField";
import { RangeField } from "@/components/RangeField";
import { VehicleDetail } from "@/components/VehicleDetail";
import { searchVehicles, SearchFilters } from "@/lib/vehicleApi";
import { Vehicle } from "@/lib/mockData";
import { Search, RotateCcw, ChevronUp, ChevronDown } from "lucide-react";

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

export default function Index() {
  const [filters, setFilters] = useState<SearchFilters>(emptyFilters());
  const [results, setResults] = useState<Vehicle[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [sort, setSort] = useState<SortConfig>(null);
  const [filtersExpanded, setFiltersExpanded] = useState(true);

  const handleSearch = async () => {
    setLoading(true);
    try {
      const data = await searchVehicles(filters);
      setResults(data.vehicles);
      setTotal(data.total);
      setSort(null);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setFilters(emptyFilters());
    setResults([]);
    setTotal(null);
    setSort(null);
  };

  const handleSort = (key: keyof Vehicle) => {
    setSort((prev) => {
      if (prev?.key === key) return prev.dir === "asc" ? { key, dir: "desc" } : null;
      return { key, dir: "asc" };
    });
  };

  const sortedResults = sort
    ? [...results].sort((a, b) => {
        const av = a[sort.key] || "";
        const bv = b[sort.key] || "";
        const cmp = av.localeCompare(bv, undefined, { numeric: true });
        return sort.dir === "asc" ? cmp : -cmp;
      })
    : results;

  const updateFilter = (key: keyof SearchFilters, value: string) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "MAKE") next.MODEL = "";
      if (key === "MAKE" || key === "MODEL") next.SUBMODEL = "";
      return next;
    });
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0a",
      fontFamily: "'JetBrains Mono', 'Courier New', monospace",
      color: "#e0e0e0",
    }}>
      {/* Header */}
      <header style={{ borderBottom: "1px solid #1a1a1a", background: "#0a0a0a", position: "sticky", top: 0, zIndex: 40 }}>
        <div style={{ background: "#3bff7e", padding: "2px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "10px", color: "#000", fontWeight: 700, letterSpacing: "0.15em" }}>
            WAKA KOTAHI · MOTOR VEHICLE REGISTER · PUBLIC ACCESS TERMINAL
          </span>
          <span style={{ fontSize: "10px", color: "#000", letterSpacing: "0.1em" }}>
            {new Date().toISOString().split("T")[0]}
          </span>
        </div>
        <div style={{ padding: "12px 24px", display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 36, height: 36, border: "1px solid #3bff7e", display: "flex", alignItems: "center", justifyContent: "center", color: "#3bff7e", fontSize: 18, flexShrink: 0 }}>⊞</div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: "#fff", letterSpacing: "0.05em", margin: 0 }}>NZ FLEET SEARCH</h1>
            <p style={{ fontSize: 10, color: "#555", letterSpacing: "0.2em", margin: 0 }}>MOTOR VEHICLE REGISTER · 5,879,915 RECORDS</p>
          </div>
          {total !== null && (
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#3bff7e", lineHeight: 1 }}>{total.toLocaleString()}</div>
              <div style={{ fontSize: 9, color: "#555", letterSpacing: "0.15em" }}>MATCHES FOUND</div>
            </div>
          )}
        </div>
      </header>

      {/* Filters */}
      <div style={{ borderBottom: "1px solid #1a1a1a" }}>
        <button
          onClick={() => setFiltersExpanded(!filtersExpanded)}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 24px", background: "#111", border: "none", borderBottom: filtersExpanded ? "1px solid #1a1a1a" : "none", cursor: "pointer", color: "#888" }}
        >
          <span style={{ fontSize: 10, letterSpacing: "0.2em", display: "flex", alignItems: "center", gap: 8 }}>
            <Search size={11} color="#3bff7e" />
            <span style={{ color: "#3bff7e" }}>SEARCH FILTERS</span>
            <span style={{ color: "#333" }}>·</span>
            <span>{filterFields.length + 7} PARAMETERS</span>
          </span>
          {filtersExpanded ? <ChevronUp size={13} color="#444" /> : <ChevronDown size={13} color="#444" />}
        </button>

        {filtersExpanded && (
          <div style={{ padding: "16px 24px 20px", background: "#0d0d0d" }}>
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

              <RangeField
                label="YEAR"
                fieldMin="VEHICLE_YEAR_MIN" fieldMax="VEHICLE_YEAR_MAX"
                valueMin={filters.VEHICLE_YEAR_MIN || ""} valueMax={filters.VEHICLE_YEAR_MAX || ""}
                onChangeMin={(v) => updateFilter("VEHICLE_YEAR_MIN", v)}
                onChangeMax={(v) => updateFilter("VEHICLE_YEAR_MAX", v)}
                min={1950} max={2026}
              />
              <RangeField
                label="CC RATING"
                fieldMin="CC_RATING_MIN" fieldMax="CC_RATING_MAX"
                valueMin={filters.CC_RATING_MIN || ""} valueMax={filters.CC_RATING_MAX || ""}
                onChangeMin={(v) => updateFilter("CC_RATING_MIN", v)}
                onChangeMax={(v) => updateFilter("CC_RATING_MAX", v)}
                min={0} max={8000}
              />
              <RangeField
                label="POWER (KW)"
                fieldMin="POWER_RATING_MIN" fieldMax="POWER_RATING_MAX"
                valueMin={filters.POWER_RATING_MIN || ""} valueMax={filters.POWER_RATING_MAX || ""}
                onChangeMin={(v) => updateFilter("POWER_RATING_MIN", v)}
                onChangeMax={(v) => updateFilter("POWER_RATING_MAX", v)}
                min={0} max={500}
              />
              <RangeField
                label="GROSS MASS"
                fieldMin="GROSS_VEHICLE_MASS_MIN" fieldMax="GROSS_VEHICLE_MASS_MAX"
                valueMin={filters.GROSS_VEHICLE_MASS_MIN || ""} valueMax={filters.GROSS_VEHICLE_MASS_MAX || ""}
                onChangeMin={(v) => updateFilter("GROSS_VEHICLE_MASS_MIN", v)}
                onChangeMax={(v) => updateFilter("GROSS_VEHICLE_MASS_MAX", v)}
                min={0} max={50000}
              />
              <RangeField
                label="WIDTH (MM)"
                fieldMin="WIDTH_MIN" fieldMax="WIDTH_MAX"
                valueMin={filters.WIDTH_MIN || ""} valueMax={filters.WIDTH_MAX || ""}
                onChangeMin={(v) => updateFilter("WIDTH_MIN", v)}
                onChangeMax={(v) => updateFilter("WIDTH_MAX", v)}
                min={0} max={3500}
              />
              <RangeField
                label="SEATS (MIN)"
                fieldMin="NUMBER_OF_SEATS_MIN" fieldMax="NUMBER_OF_SEATS_MIN"
                valueMin={filters.NUMBER_OF_SEATS_MIN || ""} valueMax=""
                onChangeMin={(v) => updateFilter("NUMBER_OF_SEATS_MIN", v)}
                onChangeMax={() => {}}
                min={1} max={20}
              />
              <RangeField
                label="AXLES (MIN)"
                fieldMin="NUMBER_OF_AXLES_MIN" fieldMax="NUMBER_OF_AXLES_MIN"
                valueMin={filters.NUMBER_OF_AXLES_MIN || ""} valueMax=""
                onChangeMin={(v) => updateFilter("NUMBER_OF_AXLES_MIN", v)}
                onChangeMax={() => {}}
                min={1} max={9}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 20, paddingTop: 16, borderTop: "1px solid #1a1a1a" }}>
              <button
                onClick={handleSearch}
                disabled={loading}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 20px", background: loading ? "#1a3a2a" : "#3bff7e", color: loading ? "#3bff7e" : "#000", border: "none", cursor: loading ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 800, fontFamily: "inherit", letterSpacing: "0.15em" }}
              >
                <Search size={12} />
                {loading ? "SEARCHING..." : "SEARCH"}
              </button>
              <button
                onClick={handleClear}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", background: "transparent", color: "#555", border: "1px solid #222", cursor: "pointer", fontSize: 11, fontFamily: "inherit", letterSpacing: "0.15em" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "#444")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "#222")}
              >
                <RotateCcw size={11} />
                CLEAR
              </button>
              {loading && <span style={{ fontSize: 10, color: "#3bff7e", letterSpacing: "0.15em", opacity: 0.7 }}>▋ QUERYING DATABASE...</span>}
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {total !== null && (
        <div>
          <div style={{ padding: "6px 24px", background: "#0d0d0d", borderBottom: "1px solid #1a1a1a", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 10, color: "#555", letterSpacing: "0.1em" }}>
              SHOWING <span style={{ color: "#888" }}>{sortedResults.length.toLocaleString()}</span> OF <span style={{ color: "#3bff7e" }}>{total.toLocaleString()}</span> RECORDS
            </span>
            {sort && <span style={{ fontSize: 10, color: "#555", letterSpacing: "0.1em" }}>SORT: <span style={{ color: "#3bff7e" }}>{sort.key}</span> <span style={{ color: "#888" }}>{sort.dir === "asc" ? "↑" : "↓"}</span></span>}
          </div>
          <div style={{ overflowX: "auto", maxHeight: "calc(100vh - 320px)", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, tableLayout: "fixed" }}>
              <thead style={{ position: "sticky", top: 0, background: "#111", zIndex: 10 }}>
                <tr>
                  {resultColumns.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      style={{ padding: "8px 16px", textAlign: "left", fontSize: 9, letterSpacing: "0.2em", color: sort?.key === col.key ? "#3bff7e" : "#444", cursor: "pointer", borderBottom: "1px solid #1a1a1a", whiteSpace: "nowrap", fontWeight: 700, userSelect: "none", overflow: "hidden", textOverflow: "ellipsis", width: `${100 / resultColumns.length}%` }}
                    >
                      {col.label}{sort?.key === col.key && <span style={{ marginLeft: 4, color: "#3bff7e" }}>{sort.dir === "asc" ? "↑" : "↓"}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedResults.length === 0 ? (
                  <tr><td colSpan={resultColumns.length} style={{ padding: "60px 24px", textAlign: "center", color: "#333", fontSize: 11, letterSpacing: "0.1em" }}>NO RECORDS MATCH YOUR QUERY</td></tr>
                ) : (
                  sortedResults.map((v, i) => (
                    <tr
                      key={i}
                      onClick={() => setSelectedVehicle(v)}
                      style={{ cursor: "pointer", borderBottom: "1px solid #111", background: i % 2 === 0 ? "#0a0a0a" : "#0d0d0d" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#141a14")}
                      onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? "#0a0a0a" : "#0d0d0d")}
                    >
                      {resultColumns.map((col, ci) => (
                        <td key={col.key} style={{ padding: "7px 16px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: ci === 0 ? "#e0e0e0" : ci === 8 ? "#555" : "#888", fontWeight: ci === 0 ? 600 : 400, fontSize: 11 }}>
                          {v[col.key] || <span style={{ color: "#2a2a2a" }}>—</span>}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {total === null && (
        <div style={{ textAlign: "center", padding: "80px 24px" }}>
          <div style={{ fontSize: 48, color: "#1a1a1a", marginBottom: 24 }}>⊞</div>
          <p style={{ fontSize: 11, color: "#333", letterSpacing: "0.2em", margin: "0 0 8px" }}>ENTER SEARCH PARAMETERS AND PRESS SEARCH</p>
          <p style={{ fontSize: 10, color: "#222", letterSpacing: "0.15em", margin: 0 }}>LEAVE FIELDS BLANK TO MATCH ANY VALUE</p>
        </div>
      )}

      {selectedVehicle && <VehicleDetail vehicle={selectedVehicle} onClose={() => setSelectedVehicle(null)} />}
    </div>
  );
}
