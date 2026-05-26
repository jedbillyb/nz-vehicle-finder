/**
 * Post-build script: generates per-route index.html files in dist/ with
 * correct <title>, <meta description>, canonical and OG tags baked in.
 *
 * Without this, every URL serves the homepage's generic meta to crawlers
 * because the SPA only updates tags via JavaScript after page load.
 *
 * Run after `vite build`. Output: dist/{path}/index.html for every sitemap URL.
 */
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { resolve, join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const distDir = resolve(__dirname, "../dist");
const templatePath = resolve(__dirname, "../dist/index.html");
// Always use public/sitemap.xml — it's the authoritative source and Vite
// copies it to dist/ during build. dist/sitemap.xml may be stale from a
// previous build that predates the last sitemap regeneration.
const sitemapPath = resolve(__dirname, "../public/sitemap.xml");

// --- Slug helpers (mirrors src/lib/slugs.ts) ---

const MAKE_SLUG_LOOKUP: Record<string, string> = {
  "land-rover": "LAND ROVER",
  "harley-davidson": "HARLEY DAVIDSON",
  "john-deere": "JOHN DEERE",
  "great-wall": "GREAT WALL",
  "mitsubishi-fuso": "MITSUBISHI FUSO",
  "alfa-romeo": "ALFA ROMEO",
  "massey-ferguson": "MASSEY FERGUSON",
  "mobile-machine": "MOBILE MACHINE",
  "new-holland": "NEW HOLLAND",
  "royal-enfield": "ROYAL ENFIELD",
  "ud-trucks": "UD TRUCKS",
  "case-ih": "CASE IH",
  "moto-guzzi": "MOTO GUZZI",
  "tnt-motor": "TNT MOTOR",
  "transport-trailers": "TRANSPORT TRAILERS",
  "aakron-xpress": "AAKRON XPRESS",
  "ci-munro": "CI MUNRO",
  "chrysler-jeep": "CHRYSLER JEEP",
  "aston-martin": "ASTON MARTIN",
  "toko-trailers": "TOKO TRAILERS",
  "western-star": "WESTERN STAR",
  "range-rover": "RANGE ROVER",
  "alexander-dennis": "ALEXANDER DENNIS",
  "david-brown": "DAVID BROWN",
  "toyota-lexus": "TOYOTA LEXUS",
  "mv-agusta": "MV AGUSTA",
  "factory-built": "FACTORY BUILT",
};

function slugToMakeUpper(slug: string): string {
  return MAKE_SLUG_LOOKUP[slug] ?? slug.toUpperCase();
}

function titleCaseMake(make: string): string {
  return make
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function slugToModel(slug: string): string {
  return slug.replace(/_/g, " ").toUpperCase();
}

function titleCaseModel(model: string): string {
  return model
    .split(" ")
    .map((w) =>
      w.includes("-") ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    )
    .join(" ");
}

function slugToTla(slug: string): string {
  return slug.replace(/_/g, " ").toUpperCase();
}

function titleCaseRegion(tla: string): string {
  return tla
    .split(" ")
    .map((w) => {
      if (w.includes("-")) {
        return w
          .split("-")
          .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
          .join("-");
      }
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

// --- SEO derivation ---

function getSeoForUrl(fullUrl: string): { title: string; description: string } {
  const urlPath = fullUrl.replace("https://vehiclefinder.co.nz", "");

  const modelMatch = urlPath.match(/^\/stats\/([^/]+)\/([^/]+)$/);
  if (modelMatch) {
    const makeDisplay = titleCaseMake(slugToMakeUpper(modelMatch[1]));
    const modelDisplay = titleCaseModel(slugToModel(modelMatch[2]));
    return {
      title: `${makeDisplay} ${modelDisplay} registrations in NZ | NZ Vehicle Finder`,
      description: `Statistics and listings for the ${makeDisplay} ${modelDisplay} on the New Zealand Motor Vehicle Register. View registration counts, colours, fuel types and more.`,
    };
  }

  const makeMatch = urlPath.match(/^\/stats\/([^/]+)$/);
  if (makeMatch) {
    const makeDisplay = titleCaseMake(slugToMakeUpper(makeMatch[1]));
    return {
      title: `${makeDisplay} vehicles in NZ: registrations & stats | NZ Vehicle Finder`,
      description: `Statistics and full listings for all ${makeDisplay} vehicles on the New Zealand Motor Vehicle Register. View registration counts, top models, colours and more.`,
    };
  }

  const regionMatch = urlPath.match(/^\/region\/([^/]+)$/);
  if (regionMatch) {
    const regionDisplay = titleCaseRegion(slugToTla(regionMatch[1]));
    return {
      title: `${regionDisplay} registered vehicles | NZ Vehicle Finder`,
      description: `Browse all vehicles registered in ${regionDisplay} on the New Zealand Motor Vehicle Register. View statistics, top makes, fuel types and more.`,
    };
  }

  if (urlPath === "/nz-fleet") {
    return {
      title: "NZ Vehicle Register: 5.9 million vehicles in New Zealand | NZ Vehicle Finder",
      description:
        "Complete statistics for the New Zealand Motor Vehicle Register. Total fleet size, EV count, top makes, fuel types, body styles and regional breakdowns across 5.9 million registered vehicles.",
    };
  }

  return {
    title: "NZ Vehicle Finder - Search the NZ Motor Vehicle Register",
    description:
      "Free fleet search for the NZ Motor Vehicle Register with 5.9 million records. Filter by make, model, colour, fuel type, year, region and more. Free public access.",
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function patchHtml(
  html: string,
  title: string,
  description: string,
  canonical: string
): string {
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const c = escapeHtml(canonical);
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${t}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/,          `$1${d}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/,                 `$1${c}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/,         `$1${t}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/,   `$1${d}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/,           `$1${c}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/,        `$1${t}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/,  `$1${d}$2`);
}

// --- Main ---

const template = readFileSync(templatePath, "utf-8");
const sitemapContent = readFileSync(sitemapPath, "utf-8");
const urls = [...sitemapContent.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);

let generated = 0;
let skipped = 0;

for (const url of urls) {
  const urlPath = url.replace("https://vehiclefinder.co.nz", "") || "/";

  if (urlPath === "/") {
    skipped++;
    continue;
  }

  const { title, description } = getSeoForUrl(url);
  const patched = patchHtml(template, title, description, url);

  const dirPath = join(distDir, urlPath);
  mkdirSync(dirPath, { recursive: true });
  writeFileSync(join(dirPath, "index.html"), patched);
  generated++;

  if (generated % 200 === 0) {
    process.stdout.write(`\r  ${generated} / ${urls.length - skipped}...`);
  }
}

if (generated >= 200) process.stdout.write("\n");
console.log(
  `SEO pre-render complete: ${generated} pages generated, ${skipped} skipped`
);
