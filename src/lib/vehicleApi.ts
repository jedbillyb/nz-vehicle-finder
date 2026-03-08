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
  GROSS_VEHICLE_MASS_MIN?: string;
  GROSS_VEHICLE_MASS_MAX?: string;
  WIDTH_MIN?: string;
  WIDTH_MAX?: string;
  CC_RATING_MIN?: string;
  CC_RATING_MAX?: string;
  POWER_RATING_MIN?: string;
  POWER_RATING_MAX?: string;
}

const API =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "") || "http://localhost:3001";

export async function searchVehicles(
  filters: SearchFilters,
  page = 1
): Promise<{ vehicles: Vehicle[]; total: number; pages: number }> {
  const params = new URLSearchParams({ page: String(page) });
  for (const [k, v] of Object.entries(filters)) {
    if (v && v.trim()) params.set(k, v.trim());
  }

  const res = await fetch(`${API}/api/vehicles?${params}`);

  if (!res.ok) {
    throw new Error(`Search failed with status ${res.status}`);
  }

  return res.json();
}

export async function getSuggestions(
  field: keyof Vehicle,
  query: string,
  filterBy?: Partial<Record<keyof Vehicle, string>>
): Promise<string[]> {
  const params = new URLSearchParams({ q: query });
  if (filterBy) {
    for (const [k, v] of Object.entries(filterBy)) {
      if (v) params.set(k, v);
    }
  }

  const res = await fetch(`${API}/api/suggestions/${field}?${params}`);

  if (!res.ok) {
    throw new Error(`Suggestions failed with status ${res.status}`);
  }

  return res.json();
}
