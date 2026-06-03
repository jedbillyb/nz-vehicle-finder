import express from "express";
import Database from "better-sqlite3";
import cors from "cors";
import compression from "compression";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import { Resend } from "resend";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const dbPath = path.resolve(__dirname, "../database/vehicles.db");
const autocompletePath = path.resolve(__dirname, "../public/autocomplete.json");

// --- Database (must be declared before anything uses it) ---
let db: InstanceType<typeof Database> | null = null;
try {
  db = new Database(dbPath, { readonly: true });
  db.pragma("journal_mode = WAL");
  db.pragma("cache_size = -16000");
  db.pragma("temp_store = MEMORY");
  db.pragma("mmap_size = 268435456");
  console.log("Database opened:", dbPath);
} catch (err) {
  console.error("Database failed to open:", (err as Error).message);
  console.error("Expected database at:", dbPath);
}

// --- Feedback DB (writable, separate from vehicles.db) ---
const feedbackDbPath = path.resolve(__dirname, "../database/feedback.db");
let feedbackDb: InstanceType<typeof Database> | null = null;
try {
  feedbackDb = new Database(feedbackDbPath);
  feedbackDb.exec(`CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    rating INTEGER NOT NULL,
    comment TEXT,
    page_path TEXT,
    distinct_id TEXT
  )`);
  console.log("Feedback DB ready:", feedbackDbPath);
} catch (err) {
  console.error("Feedback DB failed to open:", (err as Error).message);
}

// --- Fleet overview: precomputed at startup ---
interface FleetOverviewData {
  total: number;
  fuelTypes: { value: string; count: number }[];
  topMakes: { value: string; count: number }[];
  bodyTypes: { value: string; count: number }[];
  importStatus: { value: string; count: number }[];
  regions: { value: string; count: number }[];
}

let fleetOverview: FleetOverviewData | null = null;

// --- Global breakdown: precomputed at startup from breakdown_cache table ---
let globalBreakdown: Record<string, { value: string; count: number }[]> = {};
if (db) {
  try {
    const rows = db
      .prepare(`SELECT field, value, count FROM breakdown_cache ORDER BY count DESC`)
      .all() as { field: string; value: string; count: number }[];
    for (const row of rows) {
      if (!globalBreakdown[row.field]) globalBreakdown[row.field] = [];
      globalBreakdown[row.field].push({ value: row.value, count: row.count });
    }
    console.log("Global breakdown loaded from breakdown_cache table");
  } catch {
    console.warn("breakdown_cache table not found - run build-breakdown-cache.ts to create it");
  }
}

// --- Autocomplete ---
const distinctCache: Record<string, string[]> = (() => {
  try {
    return JSON.parse(readFileSync(autocompletePath, "utf-8"));
  } catch (err) {
    console.error("Autocomplete file failed to load:", (err as Error).message);
    return {};
  }
})();

const ALLOWED_FIELDS = new Set([
  "MAKE", "MODEL", "SUBMODEL", "BASIC_COLOUR", "MOTIVE_POWER", "BODY_TYPE", "TRANSMISSION_TYPE",
  "TLA", "POSTCODE", "IMPORT_STATUS", "ORIGINAL_COUNTRY", "CLASS", "INDUSTRY_CLASS",
  "ROAD_TRANSPORT_CODE", "VEHICLE_USAGE", "NZ_ASSEMBLED", "VEHICLE_YEAR",
  "CC_RATING", "POWER_RATING", "GROSS_VEHICLE_MASS", "WIDTH", "NUMBER_OF_SEATS", "NUMBER_OF_AXLES",
  "VIN11",
]);

const stmtCache = new Map<string, any>();
function getStmt(sql: string) {
  if (!db) return null;
  let stmt = stmtCache.get(sql);
  if (!stmt) {
    stmt = db.prepare(sql);
    stmtCache.set(sql, stmt);
  }
  return stmt;
}

const suggestionResponseCache = new Map<string, { data: string[]; ts: number }>();
const SUGGESTION_TTL = 5 * 60 * 1000;
const SUGGESTION_CACHE_MAX = 500;

function getCachedSuggestion(key: string): string[] | null {
  const entry = suggestionResponseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > SUGGESTION_TTL) {
    suggestionResponseCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedSuggestion(key: string, data: string[]) {
  if (suggestionResponseCache.size >= SUGGESTION_CACHE_MAX) {
    const firstKey = suggestionResponseCache.keys().next().value;
    if (firstKey) suggestionResponseCache.delete(firstKey);
  }
  suggestionResponseCache.set(key, { data, ts: Date.now() });
}

const RESULT_COLUMNS = [
  "MAKE", "MODEL", "SUBMODEL", "VEHICLE_YEAR", "BASIC_COLOUR", "BODY_TYPE",
  "MOTIVE_POWER", "TRANSMISSION_TYPE", "TLA", "POSTCODE", "VIN11", "CHASSIS7",
  "ENGINE_NUMBER", "CC_RATING", "POWER_RATING", "GROSS_VEHICLE_MASS", "WIDTH",
  "HEIGHT", "NUMBER_OF_SEATS", "NUMBER_OF_AXLES", "IMPORT_STATUS", "ORIGINAL_COUNTRY",
  "PREVIOUS_COUNTRY", "CLASS", "INDUSTRY_CLASS", "ROAD_TRANSPORT_CODE", "VEHICLE_USAGE",
  "NZ_ASSEMBLED", "FIRST_NZ_REGISTRATION_YEAR", "FIRST_NZ_REGISTRATION_MONTH",
  "VDAM_WEIGHT", "VEHICLE_TYPE", "INDUSTRY_MODEL_CODE", "MVMA_MODEL_CODE",
  "ALTERNATIVE_MOTIVE_POWER", "SYNTHETIC_GREENHOUSE_GAS", "FC_COMBINED", "FC_URBAN", "FC_EXTRA_URBAN",
].map(c => `"${c}"`).join(", ");

if (db) {
  try {
    const total = (db.prepare("SELECT COUNT(*) as n FROM fleet").get() as any).n as number;
    const fuelTypes = db.prepare("SELECT COALESCE(NULLIF(TRIM(MOTIVE_POWER),''), 'UNKNOWN') as value, COUNT(*) as count FROM fleet GROUP BY MOTIVE_POWER ORDER BY count DESC LIMIT 12").all() as any[];
    const topMakes = db.prepare("SELECT MAKE as value, COUNT(*) as count FROM fleet WHERE MAKE IS NOT NULL AND MAKE != '' GROUP BY MAKE ORDER BY count DESC LIMIT 20").all() as any[];
    const bodyTypes = db.prepare("SELECT COALESCE(NULLIF(TRIM(BODY_TYPE),''), 'UNKNOWN') as value, COUNT(*) as count FROM fleet GROUP BY BODY_TYPE ORDER BY count DESC LIMIT 10").all() as any[];
    const importStatus = db.prepare("SELECT COALESCE(NULLIF(TRIM(IMPORT_STATUS),''), 'UNKNOWN') as value, COUNT(*) as count FROM fleet GROUP BY IMPORT_STATUS ORDER BY count DESC").all() as any[];
    const regions = db.prepare("SELECT TRIM(TLA) as value, COUNT(*) as count FROM fleet WHERE TLA IS NOT NULL AND TRIM(TLA) != '' GROUP BY TRIM(TLA) ORDER BY count DESC").all() as any[];
    fleetOverview = { total, fuelTypes, topMakes, bodyTypes, importStatus, regions };
    console.log("Fleet overview precomputed");
  } catch (err) {
    console.warn("Failed to precompute fleet overview:", (err as Error).message);
  }
}

console.log("API listening on http://localhost:3001");

// --- Routes ---

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, db: !!db });
});

app.get("/api/suggestions/:field", (req, res) => {
  const { field } = req.params;
  if (!ALLOWED_FIELDS.has(field)) return res.status(400).json([]);

  const { q = "", ...filterBy } = req.query as Record<string, string>;
  const activeFilters = Object.entries(filterBy).filter(
    ([k, v]) => v && v.trim() !== "" && ALLOWED_FIELDS.has(k)
  );

  if (activeFilters.length === 0) {
    const all = (distinctCache[field] || []).map(v => String(v || "").trim()).filter(Boolean);
    const unique = Array.from(new Set(all));
    const results = q
      ? unique.filter((v) => v.toUpperCase().includes(q.toUpperCase())).slice(0, 100)
      : unique.slice(0, 100);
    return res.json(results);
  }

  if (!db) return res.status(503).json([]);

  const cacheKey = `${field}|${q}|${JSON.stringify(activeFilters)}`;
  const cached = getCachedSuggestion(cacheKey);
  if (cached) return res.json(cached);

  const params: string[] = [];
  const clauses = activeFilters.map(([key, value]) => {
    params.push(value.toUpperCase());
    return `UPPER("${key}") = ?`;
  });
  if (q) {
    params.push(`%${q.toUpperCase()}%`);
    clauses.push(`UPPER("${field}") LIKE ?`);
  }
  const where = "WHERE " + clauses.join(" AND ");
  const sql = `SELECT DISTINCT "${field}" FROM fleet ${where} ORDER BY "${field}" LIMIT 100`;
  const rows = (getStmt(sql) || db.prepare(sql)).all(...params) as any[];
  const result = Array.from(new Set(rows.map((r: any) => String(r[field] || "").trim()).filter(Boolean)));
  setCachedSuggestion(cacheKey, result);
  res.json(result);
});

const breakdownCache = new Map<string, { data: any; ts: number }>();
const BREAKDOWN_TTL = 5 * 60 * 1000; // 5 min

app.get("/api/breakdown", (req, res) => {
  if (!db) return res.status(503).json({});

  const filters = req.query as Record<string, string>;
  const activeFilters = Object.entries(filters).filter(
    ([k, v]) => v && v.trim() && ALLOWED_FIELDS.has(k)
  );

  // No filters → return instant precomputed result
  if (activeFilters.length === 0) return res.json(globalBreakdown);

  // Check per-filter cache
  const cacheKey = JSON.stringify(activeFilters);
  const cached = breakdownCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < BREAKDOWN_TTL) return res.json(cached.data);

  const params: any[] = [];
  const clauses: string[] = [];
  for (const [key, value] of activeFilters) {
    clauses.push(`UPPER("${key}") = UPPER(?)`);
    params.push(value);
  }

  const where = "WHERE " + clauses.join(" AND ");
  const fields = ["MOTIVE_POWER", "BASIC_COLOUR", "BODY_TYPE", "TRANSMISSION_TYPE", "MAKE"];

  const unions = fields
    .map(f =>
      `SELECT * FROM (SELECT '${f}' as grp, COALESCE("${f}",'UNKNOWN') as val, COUNT(*) as cnt FROM fleet ${where} GROUP BY "${f}" ORDER BY cnt DESC LIMIT 8)`
    )
    .join(" UNION ALL ");

  const allParams = Array(fields.length).fill(params).flat();
  const rows = (getStmt(unions) || db!.prepare(unions)).all(...allParams) as {
    grp: string; val: string; cnt: number;
  }[];

  const breakdown: Record<string, { value: string; count: number }[]> = {};
  for (const row of rows) {
    if (!breakdown[row.grp]) breakdown[row.grp] = [];
    breakdown[row.grp].push({ value: row.val || "UNKNOWN", count: row.cnt });
  }

  breakdownCache.set(cacheKey, { data: breakdown, ts: Date.now() });
  res.json(breakdown);
});

app.get("/api/vehicles", (req, res) => {
  if (!db) {
    return res.status(503).json({ error: "Database not available", vehicles: [], total: 0, page: 1, pages: 0 });
  }

  const { page = "1", ...filters } = req.query as Record<string, string>;
  const limit = 50;
  const offset = (parseInt(page) - 1) * limit;
  const params: any[] = [];
  const clauses: string[] = [];

  for (const [key, value] of Object.entries(filters)) {
    if (!value || !value.trim()) continue;
    if (key.endsWith("_MIN")) {
      const col = key.replace("_MIN", "");
      if (!ALLOWED_FIELDS.has(col)) continue;
      clauses.push(`CAST("${col}" AS INTEGER) >= ?`);
      params.push(parseInt(value));
    } else if (key.endsWith("_MAX")) {
      const col = key.replace("_MAX", "");
      if (!ALLOWED_FIELDS.has(col)) continue;
      clauses.push(`CAST("${col}" AS INTEGER) <= ?`);
      params.push(parseInt(value));
    } else {
      if (!ALLOWED_FIELDS.has(key)) continue;
      clauses.push(`UPPER("${key}") = UPPER(?)`);
      params.push(value);
    }
  }

  const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "";
  const total = (db.prepare(`SELECT COUNT(*) as count FROM fleet ${where}`).get(...params) as any).count;
  const vehicles = db.prepare(`SELECT ${RESULT_COLUMNS} FROM fleet ${where} LIMIT ? OFFSET ?`).all(...params, limit, offset);
  res.json({ vehicles, total, page: parseInt(page), pages: Math.ceil(total / limit) });
});

app.get("/api/fleet-overview", (_req, res) => {
  if (!fleetOverview) return res.status(503).json({});
  res.json(fleetOverview);
});

app.get("/api/top-regions", (_req, res) => {
  if (!fleetOverview) return res.status(503).json([]);
  res.json(fleetOverview.regions);
});

app.get("/api/top-models/:make", (req, res) => {
  if (!db) return res.status(503).json([]);
  const make = req.params.make.replace(/_/g, " ").toUpperCase();
  const rows = db
    .prepare(
      `SELECT TRIM(MODEL) as model, COUNT(*) as count FROM fleet WHERE UPPER(MAKE) = ? AND MODEL IS NOT NULL AND LENGTH(TRIM(MODEL)) > 0 GROUP BY TRIM(MODEL) ORDER BY count DESC LIMIT 24`
    )
    .all(make) as { model: string; count: number }[];
  res.json(rows);
});

app.post("/api/feedback", async (req, res) => {
  const { rating, comment, page_path, distinct_id } = req.body ?? {};

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: "rating must be an integer 1-5" });
  }
  const safeComment = typeof comment === "string" ? comment.trim().slice(0, 1000) : null;
  const safePath = typeof page_path === "string" ? page_path.slice(0, 200) : null;
  const safeDistinctId = typeof distinct_id === "string" ? distinct_id.slice(0, 100) : null;

  if (feedbackDb) {
    feedbackDb.prepare(
      `INSERT INTO feedback (created_at, rating, comment, page_path, distinct_id) VALUES (?, ?, ?, ?, ?)`
    ).run(new Date().toISOString(), rating, safeComment, safePath, safeDistinctId);
  }

  if (resend && process.env.FEEDBACK_FROM_EMAIL) {
    try {
      const stars = "★".repeat(rating) + "☆".repeat(5 - rating);
      await resend.emails.send({
        from: process.env.FEEDBACK_FROM_EMAIL,
        to: "hello@jedbillyb.com",
        subject: `NZ Vehicle Finder feedback: ${stars}`,
        text: [
          `Rating: ${rating}/5 ${stars}`,
          safeComment ? `Comment: ${safeComment}` : "No comment",
          safePath ? `Page: ${safePath}` : "",
          safeDistinctId ? `User: ${safeDistinctId}` : "",
        ].filter(Boolean).join("\n"),
      });
    } catch (err) {
      console.error("Resend email failed:", (err as Error).message);
    }
  }

  res.json({ ok: true });
});

app.listen(3001);