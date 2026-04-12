import { Vehicle } from "@/lib/mockData";

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

export const API_BASE =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "") || "http://localhost:3001";

async function fetchApi(path: string, options?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_BASE}${path}`, options);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw err;
    }

    const msg =
      err instanceof TypeError && (err as TypeError).message?.includes("fetch")
        ? `Cannot reach the API at ${API_BASE}. Start the backend with: npm run server (in another terminal).`
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
  page = 1
): Promise<{ vehicles: Vehicle[]; total: number; pages: number }> {
  const params = new URLSearchParams({ page: String(page) });
  for (const [k, v] of Object.entries(filters)) {
    if (v && v.trim()) params.set(k, v.trim());
  }

  const res = await fetchApi(`/api/vehicles?${params}`);

  if (res.status === 503) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || "Database not available. Check the server logs.");
  }
  if (!res.ok) {
    throw new Error(`Search failed with status ${res.status}`);
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

const makeModelCache: Record<string, string[]> = {};

export async function preloadModelsForMake(make: string) {
  if (makeModelCache[make]) return;
  try {
    const res = await fetch(`${API_BASE}/api/suggestions/MODEL?MAKE=${encodeURIComponent(make)}`);
    const data = await res.json();
    makeModelCache[make] = data;
  } catch {
    // API unavailable - fall through to static data
  }
}

export function getModelsForMake(make: string, prefix: string): string[] {
  const cached = makeModelCache[make];
  if (!cached) return [];
  const vals = Array.from(new Set(cached.map(v => String(v || "").trim()).filter(Boolean)));
  const p = prefix.trim().toUpperCase();
  if (!p) return vals.slice(0, 10);
  return vals.filter(v => v.toUpperCase().startsWith(p)).slice(0, 10);
}

let suggestionCache: Record<string, string[]> = {};
let suggestionsLoaded = false;

export async function preloadSuggestions(_field?: string) {
  if (suggestionsLoaded) return;
  suggestionsLoaded = true;
  try {
    const res = await fetch("/autocomplete.json");
    if (res.ok) {
      suggestionCache = await res.json();
    }
  } catch {
    suggestionsLoaded = false;
  }
}

export function getSuggestionsLocal(
  field: string, 
  prefix: string,
  _filterBy?: Partial<Record<string, string>>
): string[] {
  // We use the local cache (loaded from autocomplete.json) as a fast fallback.
  const all = (suggestionCache[field] || []).map(v => String(v || "").trim()).filter(Boolean);
  const vals = Array.from(new Set(all));
  const p = prefix.trim().toUpperCase();
  if (!p) return vals.slice(0, 10);
  return vals.filter(v => v.toUpperCase().startsWith(p)).slice(0, 10);
}

export async function getSuggestions(
  field: keyof Vehicle,
  query: string,
  filterBy?: Partial<Record<keyof Vehicle, string>>,
  signal?: AbortSignal
): Promise<string[]> {
  const params = new URLSearchParams({ q: query });
  if (filterBy) {
    for (const [k, v] of Object.entries(filterBy)) {
      if (v) params.set(k, v);
    }
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/suggestions/${field}?${params}`, { signal });
  } catch (err) {
    const msg =
      err instanceof TypeError && (err as TypeError).message?.includes("fetch")
        ? `Cannot reach the API at ${API_BASE}. Start the backend with: npm run server (in another terminal).`
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
