import { useState, useCallback, useEffect, useRef } from "react";
import { SearchField } from "@/components/SearchField";
import { VehicleDetail } from "@/components/VehicleDetail";
import { searchVehicles, SearchFilters } from "@/lib/vehicleApi";
import { Vehicle } from "@/lib/mockData";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, RotateCcw, ChevronUp, ChevronDown, Car } from "lucide-react";

const filterFields: { key: keyof SearchFilters; label: string }[] = [
  { key: "MAKE", label: "Make" },
  { key: "MODEL", label: "Model" },
  { key: "SUBMODEL", label: "Submodel" },
  { key: "BASIC_COLOUR", label: "Colour" },
  { key: "VEHICLE_YEAR", label: "Year" },
  { key: "MOTIVE_POWER", label: "Fuel Type" },
  { key: "BODY_TYPE", label: "Body Type" },
  { key: "TRANSMISSION_TYPE", label: "Transmission" },
  { key: "TLA", label: "Region" },
  { key: "POSTCODE", label: "Postcode" },
  { key: "IMPORT_STATUS", label: "Import Status" },
  { key: "ORIGINAL_COUNTRY", label: "Origin Country" },
  { key: "NUMBER_OF_SEATS", label: "Seats" },
  { key: "NUMBER_OF_AXLES", label: "Axles" },
  { key: "CLASS", label: "Class" },
  { key: "INDUSTRY_CLASS", label: "Industry Class" },
  { key: "ROAD_TRANSPORT_CODE", label: "Road Code" },
  { key: "VEHICLE_USAGE", label: "Usage" },
  { key: "NZ_ASSEMBLED", label: "NZ Assembled" },
  { key: "GROSS_VEHICLE_MASS", label: "Gross Mass" },
  { key: "WIDTH", label: "Width" },
  { key: "CC_RATING", label: "CC Rating" },
  { key: "POWER_RATING", label: "Power (kW)" },
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

const emptyFilters = (): SearchFilters =>
  Object.fromEntries(filterFields.map((f) => [f.key, ""])) as SearchFilters;

export default function Index() {
  const [filters, setFilters] = useState<SearchFilters>(emptyFilters());
  const [results, setResults] = useState<Vehicle[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [sort, setSort] = useState<SortConfig>(null);
  const [filtersExpanded, setFiltersExpanded] = useState(true);

  const debounceRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await searchVehicles(filters);
        setResults(data.vehicles);
        setTotal(data.total);
        setSort(null);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [filters]);

  const handleClear = () => {
    setFilters(emptyFilters());
    setResults([]);
    setTotal(null);
    setSort(null);
  };

  const handleSort = (key: keyof Vehicle) => {
    setSort((prev) => {
      if (prev?.key === key) {
        return prev.dir === "asc" ? { key, dir: "desc" } : null;
      }
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
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
              <Car className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-bold text-foreground font-mono tracking-tight">NZ Fleet Search</h1>
              <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">
                Motor Vehicle Register
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent text-accent-foreground font-mono">
              MOCK DATA
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        {/* Search Form */}
        <section className="bg-card border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => setFiltersExpanded(!filtersExpanded)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
          >
            <span className="text-sm font-semibold text-foreground font-mono flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-primary" />
              Search Filters
              {total !== null && (
                <span className="text-xs font-normal text-muted-foreground">
                  — {total.toLocaleString()} result{total !== 1 ? "s" : ""}
                </span>
              )}
            </span>
            {filtersExpanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </button>

          {filtersExpanded && (
            <div className="px-4 pb-4 border-t border-border/50">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 pt-4">
                {filterFields.map((f) => (
                  <SearchField
                    key={f.key}
                    label={f.label}
                    field={f.key as keyof Vehicle}
                    value={filters[f.key] || ""}
                    onChange={(v) => updateFilter(f.key, v)}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border/30">
                <Button onClick={handleClear} variant="outline" className="font-mono text-xs gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5" />
                  Clear
                </Button>
                {loading && <span className="text-xs text-muted-foreground font-mono animate-pulse">Searching...</span>}
              </div>
            </div>
          )}
        </section>

        {/* Results */}
        {total !== null && (
          <section className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border/50 flex items-center justify-between">
              <span className="text-xs font-mono text-muted-foreground">
                Showing {sortedResults.length.toLocaleString()} of {total.toLocaleString()} vehicles
              </span>
              {sort && (
                <span className="text-[10px] font-mono text-primary">
                  Sorted by {sort.key} ({sort.dir})
                </span>
              )}
            </div>
            <div className="overflow-auto max-h-[60vh]">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    {resultColumns.map((col) => (
                      <TableHead
                        key={col.key}
                        className="cursor-pointer select-none font-mono text-[10px] uppercase tracking-wider whitespace-nowrap hover:text-foreground transition-colors"
                        onClick={() => handleSort(col.key)}
                      >
                        <span className="flex items-center gap-1">
                          {col.label}
                          {sort?.key === col.key && (
                            <span className="text-primary">
                              {sort.dir === "asc" ? "↑" : "↓"}
                            </span>
                          )}
                        </span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedResults.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={resultColumns.length} className="text-center text-muted-foreground py-12 font-mono text-sm">
                        No vehicles found matching your criteria
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedResults.map((v, i) => (
                      <TableRow
                        key={i}
                        className="cursor-pointer hover:bg-accent/40 transition-colors"
                        onClick={() => setSelectedVehicle(v)}
                      >
                        {resultColumns.map((col) => (
                          <TableCell key={col.key} className="font-mono text-xs whitespace-nowrap py-2">
                            {v[col.key] || "—"}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>
        )}

        {/* Empty state */}
        {total === null && (
          <div className="text-center py-20">
            <Car className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-sm text-muted-foreground font-mono">
              Fill in any filters above and hit Search
            </p>
            <p className="text-xs text-muted-foreground/60 font-mono mt-1">
              Leave fields blank to match anything
            </p>
          </div>
        )}
      </main>

      {/* Detail modal */}
      {selectedVehicle && (
        <VehicleDetail vehicle={selectedVehicle} onClose={() => setSelectedVehicle(null)} />
      )}
    </div>
  );
}
