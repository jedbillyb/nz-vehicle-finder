import express from "express";
import Database from "better-sqlite3";
import cors from "cors";
import compression from "compression";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import { Resend } from "resend";
import { parseFilterValue, type FilterTerm } from "../shared/filterTerms.js";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MIN_PAGE_SIZE } from "../shared/pagination.js";

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
  /** ISO date the NZTA register snapshot was taken, when the import recorded one. */
  snapshotDate?: string;
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

/**
 * A "contains" term is resolved against the distinct-value list rather than
 * queried with LIKE '%...%', because LIKE cannot use an index and would scan
 * all 5.9M rows. Expanding "Manual" into the handful of real values (Manual 4,
 * Manual 5, ...) keeps the query on the same index-backed path as an exact
 * match. Only an implausibly broad term falls back to LIKE.
 */
const MAX_EXPANDED_TERMS = 2000;

function buildFieldClause(field: string, terms: FilterTerm[]): { sql: string; params: string[] } | null {
  if (!terms.length) return null;

  const exact = new Set<string>();
  const likes: string[] = [];

  for (const term of terms) {
    const needle = term.value.toUpperCase();
    if (!term.contains) {
      exact.add(needle);
      continue;
    }
    const matches = (distinctCache[field] || [])
      .map((v) => String(v || "").trim())
      .filter((v) => v && v.toUpperCase().includes(needle));
    if (matches.length > 0 && matches.length <= MAX_EXPANDED_TERMS) {
      for (const m of matches) exact.add(m.toUpperCase());
    } else {
      likes.push(`%${needle}%`);
    }
  }

  const parts: string[] = [];
  const params: string[] = [];
  if (exact.size > 0) {
    parts.push(`UPPER("${field}") IN (${Array.from(exact, () => "?").join(", ")})`);
    params.push(...exact);
  }
  for (const like of likes) {
    parts.push(`UPPER("${field}") LIKE ?`);
    params.push(like);
  }
  if (parts.length === 0) return null;
  return { sql: parts.length === 1 ? parts[0] : `(${parts.join(" OR ")})`, params };
}

/** Build the WHERE fragment for every recognised filter in a query string. */
function buildFilterClauses(filters: Record<string, string>) {
  const clauses: string[] = [];
  const params: any[] = [];

  for (const [key, value] of Object.entries(filters)) {
    // A repeated query param arrives as an array; terms belong in one value.
    if (typeof value !== "string" || !value.trim()) continue;

    if (key.endsWith("_MIN") || key.endsWith("_MAX")) {
      const col = key.slice(0, -4);
      if (!ALLOWED_FIELDS.has(col)) continue;
      const bound = parseInt(value, 10);
      if (Number.isNaN(bound)) continue;
      clauses.push(`CAST("${col}" AS INTEGER) ${key.endsWith("_MIN") ? ">=" : "<="} ?`);
      params.push(bound);
      continue;
    }

    if (!ALLOWED_FIELDS.has(key)) continue;
    const clause = buildFieldClause(key, parseFilterValue(value));
    if (!clause) continue;
    clauses.push(clause.sql);
    params.push(...clause.params);
  }

  return { where: clauses.length ? "WHERE " + clauses.join(" AND ") : "", clauses, params };
}

/**
 * Suggestions match anywhere in a value, but a value *starting* with what was
 * typed is nearly always what the user meant. Without this, typing "P" returned
 * the first 100 makes containing a p anywhere in alphabetical order (AAKRON
 * XPRESS, ALPHA, ALPINE, ...) and no make beginning with P ever survived the cut.
 */
function rankSuggestions(values: string[], q: string, limit = 100): string[] {
  const needle = q.toUpperCase();
  const prefix: string[] = [];
  const elsewhere: string[] = [];
  for (const value of values) {
    const upper = value.toUpperCase();
    if (upper.startsWith(needle)) prefix.push(value);
    else if (upper.includes(needle)) elsewhere.push(value);
  }
  return prefix.concat(elsewhere).slice(0, limit);
}

/**
 * autocomplete.json is written alphabetically, which made an empty MAKE box
 * offer "AAKRON XPRESS" before "TOYOTA". The commonest values are what people
 * actually want, so the first unfiltered request for a field computes the top
 * values once and every later request reuses that order. Everything outside
 * the top slice keeps its alphabetical order behind them.
 */
const POPULARITY_LIMIT = 300;
const popularityCache = new Map<string, string[]>();

function popularityOrdered(field: string): string[] {
  const base = (distinctCache[field] || []).map(v => String(v || "").trim()).filter(Boolean);
  const cached = popularityCache.get(field);
  if (cached) return cached;
  if (!db) return base;

  let ordered = base;
  try {
    const rows = db
      .prepare(
        `SELECT TRIM("${field}") as v, COUNT(*) as cnt FROM fleet
         WHERE TRIM(CAST("${field}" AS TEXT)) != '' GROUP BY TRIM("${field}")
         ORDER BY cnt DESC LIMIT ${POPULARITY_LIMIT}`
      )
      .all() as { v: string }[];
    const top = rows.map(r => String(r.v || "").trim()).filter(Boolean);
    const seen = new Set(top.map(v => v.toUpperCase()));
    ordered = top.concat(base.filter(v => !seen.has(v.toUpperCase())));
  } catch (err) {
    console.warn(`Popularity ordering failed for ${field}:`, (err as Error).message);
  }

  popularityCache.set(field, ordered);
  return ordered;
}

const stmtCache = new Map<string, any>();
// Multi-value filters make the SQL text vary with the number of placeholders,
// so this cache needs a ceiling or it grows without bound.
const STMT_CACHE_MAX = 500;
function getStmt(sql: string) {
  if (!db) return null;
  let stmt = stmtCache.get(sql);
  if (!stmt) {
    stmt = db.prepare(sql);
    if (stmtCache.size >= STMT_CACHE_MAX) {
      const oldest = stmtCache.keys().next().value;
      if (oldest) stmtCache.delete(oldest);
    }
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
    let snapshotDate: string | undefined;
    try {
      snapshotDate = (db.prepare("SELECT value FROM dataset_meta WHERE key = 'snapshot_date'").get() as any)?.value;
    } catch {
      // Databases built before import-mvr.ts recorded this have no dataset_meta table.
    }
    fleetOverview = { total, fuelTypes, topMakes, bodyTypes, importStatus, regions, snapshotDate };
    console.log(`Fleet overview precomputed${snapshotDate ? ` (snapshot ${snapshotDate})` : ""}`);
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
    ([k, v]) => typeof v === "string" && v.trim() !== "" && ALLOWED_FIELDS.has(k)
  );

  if (activeFilters.length === 0) {
    const all = popularityOrdered(field);
    const unique = Array.from(new Set(all));
    return res.json(q ? rankSuggestions(unique, q) : unique.slice(0, 100));
  }


  if (!db) return res.status(503).json([]);

  const cacheKey = `${field}|${q}|${JSON.stringify(activeFilters)}`;
  const cached = getCachedSuggestion(cacheKey);
  if (cached) return res.json(cached);

  const params: any[] = [];
  const clauses: string[] = [];
  for (const [key, value] of activeFilters) {
    const clause = buildFieldClause(key, parseFilterValue(value));
    if (!clause) continue;
    clauses.push(clause.sql);
    params.push(...clause.params);
  }
  // Prefix matches first here too, for the same reason as rankSuggestions, but
  // within each group the commonest values lead - "TOYOTA" before "TOYOPET".
  let order = `cnt DESC, "${field}"`;
  if (q) {
    clauses.push(`UPPER("${field}") LIKE ?`);
    params.push(`%${q.toUpperCase()}%`);
    order = `CASE WHEN UPPER("${field}") LIKE ? THEN 0 ELSE 1 END, cnt DESC, "${field}"`;
  }
  if (clauses.length === 0) return res.json([]);
  const where = "WHERE " + clauses.join(" AND ");
  const sql = `SELECT "${field}", COUNT(*) as cnt FROM fleet ${where} GROUP BY "${field}" ORDER BY ${order} LIMIT 100`;
  if (q) params.push(`${q.toUpperCase()}%`);
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

  const { where, clauses, params } = buildFilterClauses(Object.fromEntries(activeFilters));
  if (clauses.length === 0) return res.json(globalBreakdown);

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

  const { page = "1", limit: limitParam, ...filters } = req.query as Record<string, string>;

  const requestedLimit = parseInt(limitParam ?? "", 10);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, MIN_PAGE_SIZE), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
  const currentPage = Math.max(parseInt(page, 10) || 1, 1);
  const offset = (currentPage - 1) * limit;

  const { where, params } = buildFilterClauses(filters);
  const total = (db.prepare(`SELECT COUNT(*) as count FROM fleet ${where}`).get(...params) as any).count;
  const vehicles = db.prepare(`SELECT ${RESULT_COLUMNS} FROM fleet ${where} LIMIT ? OFFSET ?`).all(...params, limit, offset);
  res.json({ vehicles, total, page: currentPage, pages: Math.ceil(total / limit), limit });
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