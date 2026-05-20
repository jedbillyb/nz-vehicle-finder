import Database from "better-sqlite3";
import { writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, "vehicles.db");
const sitemapPath = path.resolve(__dirname, "../public/sitemap.xml");

// Make slugs use hyphens-for-spaces (existing convention - do not change
// without setting up 301 redirects, as these URLs are indexed by Google).
function makeSlugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-");
}

// Model slugs use underscores-for-spaces so the round-trip is unambiguous
// when the model name itself contains hyphens (e.g. CX-5, X-TRAIL).
function modelSlugify(text: string): string {
  return text.toString().toLowerCase().trim().replace(/\s+/g, "_");
}

// Model pages with fewer than this many registrations are excluded.
// Keeps the sitemap focused on pages with enough data to be useful.
const MIN_MODEL_COUNT = 500;

try {
  const db = new Database(dbPath, { readonly: true });
  console.log("Database opened for sitemap generation");

  const makes = db
    .prepare("SELECT DISTINCT MAKE as value FROM fleet WHERE MAKE IS NOT NULL AND MAKE != '' ORDER BY MAKE ASC")
    .all() as { value: string }[];

  const models = db
    .prepare(`
      SELECT MAKE, TRIM(MODEL) as MODEL, COUNT(*) as count
      FROM fleet
      WHERE MODEL IS NOT NULL AND LENGTH(TRIM(MODEL)) > 0
      GROUP BY MAKE, TRIM(MODEL)
      HAVING count >= ?
      ORDER BY MAKE ASC, count DESC
    `)
    .all(MIN_MODEL_COUNT) as { MAKE: string; MODEL: string; count: number }[];

  const today = new Date().toISOString().split("T")[0];

  const makeUrls = makes.map((row) => {
    const slug = makeSlugify(row.value);
    return `  <url>
    <loc>https://vehiclefinder.co.nz/stats/${slug}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
  });

  const modelUrls = models.map((row) => {
    const makeSlug = makeSlugify(row.MAKE);
    const modelSlug = modelSlugify(row.MODEL);
    const priority = row.count >= 10000 ? "0.8" : row.count >= 1000 ? "0.7" : "0.6";
    return `  <url>
    <loc>https://vehiclefinder.co.nz/stats/${makeSlug}/${modelSlug}</loc>
    <changefreq>monthly</changefreq>
    <priority>${priority}</priority>
  </url>`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://vehiclefinder.co.nz/</loc>
    <lastmod>${today}T00:00:00+00:00</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
${makeUrls.join("\n")}
${modelUrls.join("\n")}
</urlset>`;

  writeFileSync(sitemapPath, xml);
  console.log(`Sitemap generated:`);
  console.log(`  ${makes.length} make pages`);
  console.log(`  ${models.length} model pages (>= ${MIN_MODEL_COUNT} registrations)`);
  console.log(`  ${makes.length + models.length + 1} total URLs`);
  console.log(`  Written to: ${sitemapPath}`);

} catch (err) {
  console.error("Failed to generate sitemap:", err);
}
