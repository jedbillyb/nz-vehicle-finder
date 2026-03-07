import { Vehicle, mockVehicles, getDistinctValues } from "./mockData";

export interface SearchFilters {
  MAKE?: string;
  MODEL?: string;
  SUBMODEL?: string;
  BASIC_COLOUR?: string;
  VEHICLE_YEAR?: string;
  MOTIVE_POWER?: string;
  BODY_TYPE?: string;
  TRANSMISSION_TYPE?: string;
  TLA?: string;
  POSTCODE?: string;
  IMPORT_STATUS?: string;
  ORIGINAL_COUNTRY?: string;
  NUMBER_OF_SEATS?: string;
  NUMBER_OF_AXLES?: string;
  CLASS?: string;
  INDUSTRY_CLASS?: string;
  ROAD_TRANSPORT_CODE?: string;
  VEHICLE_USAGE?: string;
  NZ_ASSEMBLED?: string;
  GROSS_VEHICLE_MASS?: string;
  WIDTH?: string;
  CC_RATING?: string;
  POWER_RATING?: string;
}

// ─── MOCK IMPLEMENTATION ───
// Replace these functions with real API calls when you have a backend.
// e.g. const res = await fetch(`https://your-api.com/vehicles?make=TOYOTA&...`);

export async function searchVehicles(filters: SearchFilters): Promise<{ vehicles: Vehicle[]; total: number }> {
  // Simulate network delay
  await new Promise((r) => setTimeout(r, 150));

  const activeFilters = Object.entries(filters).filter(([, v]) => v && v.trim() !== "");

  const results = mockVehicles.filter((vehicle) =>
    activeFilters.every(([key, value]) => {
      const vehicleValue = vehicle[key as keyof Vehicle]?.toUpperCase() || "";
      const searchValue = value!.toUpperCase();
      return vehicleValue.includes(searchValue);
    })
  );

  return { vehicles: results, total: results.length };
}

export async function getSuggestions(field: keyof Vehicle, query: string): Promise<string[]> {
  await new Promise((r) => setTimeout(r, 50));
  const all = getDistinctValues(field);
  if (!query) return all.slice(0, 20);
  return all.filter((v) => v.toUpperCase().includes(query.toUpperCase())).slice(0, 20);
}
