import { Vehicle } from "@/lib/mockData";
import { clampPageSize, DEFAULT_PAGE_SIZE } from "../../shared/pagination";

/**
 * Every text filter below holds an encoded term list (see shared/filterTerms.ts),
 * not a bare value. A plain single value is still a valid encoding, so links
 * shared before multi-select existed keep working.
 */
export interface SearchFilters {
  MAKE?: string;
  MODEL?: string;
  SUBMODEL?: string;
  BASIC_COLOUR?: string;
  VEHICLE_YEAR_MIN?: string;
  VEHICLE_YEAR_MAX?: string;
  MOTIVE_POWER?: string;
  BODY_TYPE?: string;
  TRANSMISSION_TYPE?: string;
  TLA?: string;
  POSTCODE?: string;
  IMPORT_STATUS?: string;
  ORIGINAL_COUNTRY?: string;
  NUMBER_OF_SEATS_MIN?: string;
  NUMBER_OF_AXLES_MIN?: string;
  CLASS?: string;
  INDUSTRY_CLASS?: string;
  ROAD_TRANSPORT_CODE?: string;
  VEHICLE_USAGE?: string;
  NZ_ASSEMBLED?: string;
  VIN11?: string;
  GROSS_VEHICLE_MASS_MIN?: string;
  GROSS_VEHICLE_MASS_MAX?: string;
  WIDTH_MIN?: string;
  WIDTH_MAX?: string;
  CC_RATING_MIN?: string;
  CC_RATING_MAX?: string;
  POWER_RATING_MIN?: string;
  POWER_RATING_MAX?: string;
}

export type BreakdownData = Record<string, { value: string; count: number }[]>;

// Unset in development: requests stay on the page's own origin and Vite passes
// /api to the local server, so a phone on the same wifi works too.
export const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "") ?? "";

async function fetchApi(path: string, options?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_BASE}${path}`, options);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw err;
    }

    const msg =
      err instanceof TypeError && (err as TypeError).message?.includes("fetch")
        ? `Cannot reach the API at ${API_BASE || "/api"}. Start the backend with: npm run server (in another terminal).`
        : err instanceof Error
          ? err.message
          : "Network error";
    throw new Error(msg);
  }
}

export async function checkHealth(): Promise<{ ok: boolean; db: boolean }> {
  const res = await fetchApi("/api/health");
  if (!res.ok) return { ok: false, db: false };
  return res.json();
}

export async function searchVehicles(
  filters: SearchFilters,
  page = 1,
  pageSize: number = DEFAULT_PAGE_SIZE
): Promise<{ vehicles: Vehicle[]; total: number; pages: number; limit: number }> {
  const params = new URLSearchParams({ page: String(page), limit: String(clampPageSize(pageSize)) });
  for (const [k, v] of Object.entries(filters)) {
    if (v && v.trim()) params.set(k, v.trim());
  }

  const res = await fetchApi(`/api/vehicles?${params}`);

  if (res.status === 503) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || "Database not available. Check the server logs.");
  }
  if (!res.ok) {
    // 429 (rate limit) and 400 (past the free result depth) explain themselves.
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `Search failed with status ${res.status}`);
  }

  return res.json();
}

export async function fetchBreakdown(
  filters: SearchFilters,
  signal?: AbortSignal
): Promise<BreakdownData> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v && v.trim()) params.set(k, v.trim());
  }

  const res = await fetchApi(`/api/breakdown?${params}`, { signal });

  if (res.status === 503) {
    return {};
  }
  if (!res.ok) {
    throw new Error(`Breakdown failed with status ${res.status}`);
  }

  return res.json();
}

/**
 * How many values a dropdown asks for. The lists are meant to be complete -
 * every value that is still selectable, popularity-first - so this is only a
 * ceiling for fields like MODEL that have six figures of distinct values.
 */
export const SUGGESTION_LIMIT = 250;

const makeModelCache: Record<string, string[]> = {};

export async function preloadModelsForMake(make: string) {
  if (makeModelCache[make]) return;
  try {
    const res = await fetch(
      `${API_BASE}/api/suggestions/MODEL?limit=${SUGGESTION_LIMIT}&MAKE=${encodeURIComponent(make)}`
    );
    const data = await res.json();
    makeModelCache[make] = data;
  } catch {
    // API unavailable - fall through to static data
  }
}

/** Trimmed, de-duplicated values, built once per list instead of on every call. */
const cleanedLists = new WeakMap<string[], string[]>();
function cleaned(list: string[]): string[] {
  let vals = cleanedLists.get(list);
  if (!vals) {
    vals = Array.from(new Set(list.map(v => String(v || "").trim()).filter(Boolean)));
    cleanedLists.set(list, vals);
  }
  return vals;
}

export function getModelsForMake(make: string, prefix: string): string[] {
  const cached = makeModelCache[make];
  if (!cached) return [];
  const vals = cleaned(cached);
  const p = prefix.trim().toUpperCase();
  if (!p) return vals.slice(0, SUGGESTION_LIMIT);
  return vals.filter(v => v.toUpperCase().startsWith(p)).slice(0, SUGGESTION_LIMIT);
}

let suggestionCache: Record<string, string[]> = {};
let suggestionsLoading: Promise<void> | null = null;

/**
 * Loads autocomplete.json once. Every caller gets the same promise, so a
 * dropdown that mounts before the file arrives can wait for it and re-render,
 * instead of holding on to the empty list it saw first.
 */
export function preloadSuggestions(): Promise<void> {
  if (!suggestionsLoading) {
    suggestionsLoading = fetch("/autocomplete.json")
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (data) suggestionCache = data; })
      .catch(() => { suggestionsLoading = null; });
  }
  return suggestionsLoading;
}

export function getSuggestionsLocal(
  field: string, 
  prefix: string,
  _filterBy?: Partial<Record<string, string>>
): string[] {
  // We use the local cache (loaded from autocomplete.json) as a fast fallback.
  // Ranked the same way as the server: values starting with what was typed first.
  const list = suggestionCache[field];
  if (!list) return [];
  const vals = cleaned(list);
  const p = prefix.trim().toUpperCase();
  if (!p) return vals.slice(0, SUGGESTION_LIMIT);
  const starts = vals.filter(v => v.toUpperCase().startsWith(p));
  const contains = vals.filter(v => !v.toUpperCase().startsWith(p) && v.toUpperCase().includes(p));
  return starts.concat(contains).slice(0, SUGGESTION_LIMIT);
}

export interface FleetOverview {
  total: number;
  fuelTypes: { value: string; count: number }[];
  topMakes: { value: string; count: number }[];
  bodyTypes: { value: string; count: number }[];
  importStatus: { value: string; count: number }[];
  regions: { value: string; count: number }[];
  /** ISO date the NZTA register snapshot was taken. */
  snapshotDate?: string;
}

export async function fetchFleetOverview(): Promise<FleetOverview | null> {
  try {
    const res = await fetchApi("/api/fleet-overview");
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchTopRegions(): Promise<{ value: string; count: number }[]> {
  try {
    const res = await fetchApi("/api/top-regions");
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function fetchTopModels(
  makeUpper: string
): Promise<{ model: string; count: number }[]> {
  const slug = makeUpper.toLowerCase().replace(/\s+/g, "_");
  try {
    const res = await fetchApi(`/api/top-models/${encodeURIComponent(slug)}`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function getSuggestions(
  field: keyof Vehicle,
  query: string,
  /** Every other active filter, so the values offered are ones that still return rows. */
  filterBy?: Record<string, string | undefined>,
  signal?: AbortSignal
): Promise<string[]> {
  const params = new URLSearchParams({ q: query, limit: String(SUGGESTION_LIMIT) });
  if (filterBy) {
    for (const [k, v] of Object.entries(filterBy)) {
      if (v && v.trim()) params.set(k, v.trim());
    }
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/suggestions/${field}?${params}`, { signal });
  } catch (err) {
    const msg =
      err instanceof TypeError && (err as TypeError).message?.includes("fetch")
        ? `Cannot reach the API at ${API_BASE || "/api"}. Start the backend with: npm run server (in another terminal).`
        : err instanceof Error
          ? err.message
          : "Network error";
    throw new Error(msg);
  }

  if (res.status === 503) {
    throw new Error("Database not available. Search and filtered suggestions are disabled.");
  }
  if (!res.ok) {
    throw new Error(`Suggestions failed with status ${res.status}`);
  }

  return res.json();
}
