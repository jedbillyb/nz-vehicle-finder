// Top makes by NZ Motor Vehicle Register registrations, skipping trailers,
// caravans and homebuilts. Counts are from the live register on 2026-10-04;
// the order matters more than the exact numbers, refresh when it changes.
// Slugs match the lowercase, hyphenated form used in /stats/:make routes.

export type PopularMake = {
  name: string; // Display name (Title Case)
  slug: string; // URL slug
  upper: string; // Original uppercase MAKE value (matches DB)
  count?: number; // Registrations at the snapshot date
};

export const POPULAR_MAKES: PopularMake[] = [
  { name: "Toyota", slug: "toyota", upper: "TOYOTA", count: 1_175_098 },
  { name: "Nissan", slug: "nissan", upper: "NISSAN", count: 445_298 },
  { name: "Mazda", slug: "mazda", upper: "MAZDA", count: 396_064 },
  { name: "Ford", slug: "ford", upper: "FORD", count: 366_003 },
  { name: "Mitsubishi", slug: "mitsubishi", upper: "MITSUBISHI", count: 303_728 },
  { name: "Honda", slug: "honda", upper: "HONDA", count: 269_319 },
  { name: "Suzuki", slug: "suzuki", upper: "SUZUKI", count: 214_811 },
  { name: "Holden", slug: "holden", upper: "HOLDEN", count: 197_125 },
  { name: "Subaru", slug: "subaru", upper: "SUBARU", count: 148_822 },
  { name: "Hyundai", slug: "hyundai", upper: "HYUNDAI", count: 133_235 },
  { name: "Volkswagen", slug: "volkswagen", upper: "VOLKSWAGEN", count: 128_817 },
  { name: "Kia", slug: "kia", upper: "KIA", count: 110_014 },
  { name: "BMW", slug: "bmw", upper: "BMW", count: 108_550 },
  { name: "Mercedes-Benz", slug: "mercedes-benz", upper: "MERCEDES-BENZ", count: 86_858 },
  { name: "Isuzu", slug: "isuzu", upper: "ISUZU", count: 73_696 },
  { name: "Audi", slug: "audi", upper: "AUDI", count: 60_352 },
  { name: "Lexus", slug: "lexus", upper: "LEXUS", count: 33_959 },
  { name: "Land Rover", slug: "land-rover", upper: "LAND ROVER", count: 32_460 },
  { name: "MG", slug: "mg", upper: "MG", count: 31_144 },
  { name: "Tesla", slug: "tesla", upper: "TESLA", count: 23_221 },
];

export function relatedMakes(currentUpper: string, limit = 10): PopularMake[] {
  const cur = currentUpper.toUpperCase();
  return POPULAR_MAKES.filter((m) => m.upper !== cur).slice(0, limit);
}
