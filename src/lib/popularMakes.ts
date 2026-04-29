// Top makes by NZ Motor Vehicle Register registrations.
// Counts are approximate snapshots — refresh periodically.
// Slugs match the lowercase, hyphenated form used in /stats/:make routes.

export type PopularMake = {
  name: string; // Display name (Title Case)
  slug: string; // URL slug
  upper: string; // Original uppercase MAKE value (matches DB)
  count?: number; // Approximate registration count
};

export const POPULAR_MAKES: PopularMake[] = [
  { name: "Toyota", slug: "toyota", upper: "TOYOTA", count: 950000 },
  { name: "Ford", slug: "ford", upper: "FORD", count: 410000 },
  { name: "Holden", slug: "holden", upper: "HOLDEN", count: 405000 },
  { name: "Mazda", slug: "mazda", upper: "MAZDA", count: 380000 },
  { name: "Nissan", slug: "nissan", upper: "NISSAN", count: 370000 },
  { name: "Mitsubishi", slug: "mitsubishi", upper: "MITSUBISHI", count: 290000 },
  { name: "Honda", slug: "honda", upper: "HONDA", count: 270000 },
  { name: "Subaru", slug: "subaru", upper: "SUBARU", count: 230000 },
  { name: "Suzuki", slug: "suzuki", upper: "SUZUKI", count: 200000 },
  { name: "Hyundai", slug: "hyundai", upper: "HYUNDAI", count: 195000 },
  { name: "BMW", slug: "bmw", upper: "BMW", count: 110000 },
  { name: "Mercedes-Benz", slug: "mercedes-benz", upper: "MERCEDES-BENZ", count: 100000 },
  { name: "Volkswagen", slug: "volkswagen", upper: "VOLKSWAGEN", count: 95000 },
  { name: "Kia", slug: "kia", upper: "KIA", count: 90000 },
  { name: "Audi", slug: "audi", upper: "AUDI", count: 60000 },
  { name: "Isuzu", slug: "isuzu", upper: "ISUZU", count: 55000 },
  { name: "Land Rover", slug: "land-rover", upper: "LAND ROVER", count: 45000 },
  { name: "Tesla", slug: "tesla", upper: "TESLA", count: 25000 },
  { name: "Mini", slug: "mini", upper: "MINI", count: 22000 },
  { name: "Lexus", slug: "lexus", upper: "LEXUS", count: 20000 },
];

export function relatedMakes(currentUpper: string, limit = 10): PopularMake[] {
  const cur = currentUpper.toUpperCase();
  return POPULAR_MAKES.filter((m) => m.upper !== cur).slice(0, limit);
}
