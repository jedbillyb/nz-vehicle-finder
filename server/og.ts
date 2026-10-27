import type Database from "better-sqlite3";
import type express from "express";
import { Resvg } from "@resvg/resvg-js";
import path from "path";
import { fileURLToPath } from "url";
import { slugToMakeUpper, slugToModel, titleCaseMake, titleCaseModel } from "../src/lib/slugs.js";

/**
 * Social preview cards for /stats pages: the same white card as the site-wide
 * og-image, with the make (or make + model) and its live registration count.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontDir = path.resolve(__dirname, "fonts");
const fontFiles = ["Inter-ExtraBold.ttf", "Inter-Bold.ttf", "Inter-SemiBold.ttf", "Inter-Medium.ttf"].map((f) => path.join(fontDir, f));

// Rendered PNGs, keyed by URL path. The register only changes monthly, so a
// card is good until the server restarts after a refresh.
const cache = new Map<string, Buffer>();
const CACHE_MAX = 3000;

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Shrink the subtitle so long names ("Mitsubishi Fuso Canter") stay on one line.
function subSize(text: string): number {
  return Math.max(24, Math.min(34, Math.floor(2000 / Math.max(text.length, 1))));
}

// "Bugatti" -> "Bugattis". Names already ending in s/x/z ("Lexus", "Hilux") are left as they are.
function plural(name: string, count: number): string {
  return count === 1 || /[sxz]$/i.test(name) ? name : `${name}s`;
}

// Same layout as the site-wide og-image, with the tagline swapped for the vehicle and its count.
function cardSvg(name: string, count: number): string {
  const sub = `Breakdown of the ${count.toLocaleString("en-NZ")} registered ${plural(name, count)} in NZ`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#ffffff"/>
  <g transform="translate(532 151)">
    <rect width="136" height="136" rx="30" fill="#0ea5a0"/>
    <g transform="translate(23 23) scale(1.40625)">
      <circle cx="27" cy="27" r="13" fill="none" stroke="#ffffff" stroke-width="5"/>
      <line x1="36" y1="36" x2="50" y2="50" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/>
      <circle cx="27" cy="27" r="7" fill="#ffffff" opacity="0.25"/>
    </g>
  </g>
  <text x="602" y="403" text-anchor="middle" font-family="Inter" font-weight="800" font-size="92" letter-spacing="-3" fill="#0f172a">NZ Vehicle Finder</text>
  <text x="600" y="472" text-anchor="middle" font-family="Inter" font-weight="500" font-size="${subSize(sub)}" fill="#64748b">${escapeXml(sub)}</text>
  <text x="600" y="588" text-anchor="middle" font-family="Inter" font-weight="600" font-size="24" fill="#0f172a">vehiclefinder.co.nz</text>
</svg>`;
}

function render(svg: string): Buffer {
  const resvg = new Resvg(svg, { font: { fontFiles, loadSystemFonts: false, defaultFontFamily: "Inter" } });
  return resvg.render().asPng();
}

export function registerOgRoutes(app: express.Express, getDb: () => Database.Database | null) {
  const send = (req: express.Request, res: express.Response, build: () => { headline: string; count: number } | null) => {
    const key = req.path;
    let png = cache.get(key);
    if (!png) {
      const card = build();
      if (!card) return res.status(404).end();
      png = render(cardSvg(card.headline, card.count));
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
      cache.set(key, png);
    }
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=86400");
    res.send(png);
  };

  app.get("/api/og/stats/:make.png", (req, res) =>
    send(req, res, () => {
      const db = getDb();
      if (!db) return null;
      const make = slugToMakeUpper(String(req.params.make));
      const { n } = db.prepare(`SELECT COUNT(*) as n FROM fleet WHERE UPPER(MAKE) = ?`).get(make) as { n: number };
      return n ? { headline: titleCaseMake(make), count: n } : null;
    })
  );

  app.get("/api/og/stats/:make/:model.png", (req, res) =>
    send(req, res, () => {
      const db = getDb();
      if (!db) return null;
      const make = slugToMakeUpper(String(req.params.make));
      const model = slugToModel(String(req.params.model));
      const { n } = db
        .prepare(`SELECT COUNT(*) as n FROM fleet WHERE UPPER(MAKE) = ? AND UPPER(TRIM(MODEL)) = ?`)
        .get(make, model) as { n: number };
      return n ? { headline: `${titleCaseMake(make)} ${titleCaseModel(model)}`, count: n } : null;
    })
  );
}
