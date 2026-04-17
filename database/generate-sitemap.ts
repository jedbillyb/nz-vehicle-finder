import Database from "better-sqlite3";
import { writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, "vehicles.db");
const sitemapPath = path.resolve(__dirname, "../public/sitemap.xml");

function slugify(text: string) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")     // Replace spaces with -
    .replace(/[^\w-]+/g, "")   // Remove all non-word chars
    .replace(/--+/g, "-");     // Replace multiple - with single -
}

try {
  const db = new Database(dbPath, { readonly: true });
  console.log("Database opened for sitemap generation");

  const rows = db.prepare("SELECT DISTINCT MAKE as value FROM fleet WHERE MAKE IS NOT NULL AND MAKE != '' ORDER BY MAKE ASC").all() as { value: string }[];
  
  // To add models later, you can use:
  // const modelRows = db.prepare("SELECT DISTINCT MAKE, MODEL FROM fleet WHERE MODEL IS NOT NULL AND MODEL != ''").all();
  
  const urls = rows.map(row => {
    const slug = slugify(row.value);
    return `  <url>
    <loc>https://vehiclefinder.co.nz/stats/${slug}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://vehiclefinder.co.nz/</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}T00:00:00+00:00</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
${urls.join('\n')}
</urlset>`;

  writeFileSync(sitemapPath, xml);
  console.log(`Successfully generated sitemap with ${rows.length + 1} URLs at ${sitemapPath}`);

} catch (err) {
  console.error("Failed to generate sitemap:", err);
}
