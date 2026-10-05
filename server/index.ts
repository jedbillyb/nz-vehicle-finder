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
import { AccountStore, createAccounts } from "./accounts.js";
import { createBilling } from "./billing.js";
import { FREE_MAX_RESULT_DEPTH, limitPerIp } from "./rateLimit.js";
import { CONTACT_EMAIL } from "../shared/contact.js";
import { isValidEmail } from "../shared/email.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
/**
 * The free /api/* endpoints serve this site, so browsers elsewhere are refused.
 * /api/v1 is gated by API keys instead and stays open to any origin.
 */
const siteCors = cors({
  origin: [
    "https://vehiclefinder.co.nz",
    "https://www.vehiclefinder.co.nz",
    "http://localhost:8080",
    /\.lovable\.app$/,
    /\.lovableproject\.com$/,
  ],
});
const openCors = cors();
app.use((req, res, next) => (req.path.startsWith("/api/v1/") ? openCors : siteCors)(req, res, next));
app.use(compression());
// Stripe signs the raw bytes, so its webhook must be parsed before express.json() sees it.
// Declared as a forward reference: the billing module is built further down.
app.post("/api/billing/webhook", express.raw({ type: "application/json" }), (req, res, next) =>
  billing.webhook(req, res).catch(next)
);
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Per-IP ceiling across the free site endpoints. Search and stats get tighter
// limits on their routes below. Paid, account and health routes are exempt.
const freeSiteLimit = limitPerIp(300, 60_000);
app.use("/api", (req, res, next) =>
  /^\/(v1|auth|account|billing)(\/|$)/.test(req.path) || req.path === "/health" ? next() : freeSiteLimit(req, res, next)
);

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
  const cols = feedbackDb.prepare("PRAGMA table_info(feedback)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "email")) feedbackDb.exec("ALTER TABLE feedback ADD COLUMN email TEXT");
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
 * A dropdown lists everything that is still selectable, not a top-10 slice, so
 * these ceilings only exist to keep a field like MODEL (164k distinct values)
 * from shipping its whole vocabulary on every keystroke.
 */
const SUGGESTION_LIMIT_DEFAULT = 250;
const SUGGESTION_LIMIT_MAX = 1000;

/**
 * How many rows a suggestion query may look up before it starts sampling.
 *
 * better-sqlite3 is synchronous, so a suggestion query holds up every other
 * request on the process while it runs, and grouping a broad filter over the
 * whole table is not cheap: BASIC_COLOUR=WHITE measured 1.8s and
 * VEHICLE_YEAR>=2000 measured 4.4s against the live database.
 *
 * A filter narrower than this budget is counted exactly, which covers nearly
 * every real combination (every model of a make, say, or anything with two
 * fields set). A broader one is counted over every Nth row instead - see
 * suggestionStride.
 */
const SUGGESTION_ROW_BUDGET = 300000;

/**
 * Sample one row in N, spread across the table rather than taken as a prefix.
 *
 * The rowid lives in the index entry, so `rowid % N = 0` is checked without
 * reading the row, and only the surviving rows cost a lookup - which is where
 * all the time goes. Measured on the live database: makes for VEHICLE_YEAR>=2000
 * fell from 4.4s to 0.9s, and the top of the list came back in the same order
 * with counts within half a percent of the exact ones.
 *
 * The trade is that a value with fewer than N rows in the filtered set can be
 * missed. That only applies to filters matching millions of rows, where such a
 * value is a needle - and it can still be typed in by hand.
 */
function suggestionStride(rowCount: number): number {
  if (rowCount <= SUGGESTION_ROW_BUDGET) return 1;
  return Math.ceil(rowCount / SUGGESTION_ROW_BUDGET);
}

/**
 * How many rows the other filters match. Counting is index-only work - 72ms for
 * a make, 206ms for a year range on the live database - which is cheap enough to
 * pay for choosing between an exact count and a sampled one.
 */
const constraintCountCache = new Map<string, number>();

function constrainedRowCount(key: string, where: string, params: any[]): number {
  const cached = constraintCountCache.get(key);
  if (cached !== undefined) return cached;
  const sql = `SELECT COUNT(*) as n FROM fleet ${where}`;
  const n = ((getStmt(sql) || db!.prepare(sql)).get(...params) as any).n as number;
  if (constraintCountCache.size >= 500) {
    const oldest = constraintCountCache.keys().next().value;
    if (oldest !== undefined) constraintCountCache.delete(oldest);
  }
  constraintCountCache.set(key, n);
  return n;
}

function clampSuggestionLimit(raw: unknown): number {
  const n = parseInt(typeof raw === "string" ? raw : "", 10);
  if (!Number.isFinite(n)) return SUGGESTION_LIMIT_DEFAULT;
  return Math.min(Math.max(n, 1), SUGGESTION_LIMIT_MAX);
}

/**
 * The other filters a field's suggestions must respect. Every filter counts -
 * ranges included - so a value the dropdown offers always returns rows; that is
 * what stops a mismatched combination (TESLA + DIESEL) from being selectable at
 * all. The field's own terms are deliberately left out: constraining MAKE by
 * MAKE=TOYOTA would leave TOYOTA as the only make you could ever add.
 */
function constraintsFor(field: string, query: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (key === "q" || key === "limit") continue;
    if (typeof value !== "string" || !value.trim()) continue;
    const base = key.endsWith("_MIN") || key.endsWith("_MAX") ? key.slice(0, -4) : key;
    if (base === field) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Suggestions match anywhere in a value, but a value *starting* with what was
 * typed is nearly always what the user meant. Without this, typing "P" returned
 * the first 100 makes containing a p anywhere in alphabetical order (AAKRON
 * XPRESS, ALPHA, ALPINE, ...) and no make beginning with P ever survived the cut.
 */
function rankSuggestions(values: string[], q: string, limit = SUGGESTION_LIMIT_DEFAULT): string[] {
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
 * autocomplete.json is written commonest-value-first, so an empty MAKE box
 * offers TOYOTA rather than "AAKRON XPRESS". That ordering is baked into the
 * file by import-mvr.ts (and database/rebuild-autocomplete.ts between imports)
 * rather than computed here: the GROUP BY behind it takes seconds on MODEL, and
 * better-sqlite3 is synchronous, so doing it on the first request would stall
 * every other request on the process.
 */
function popularityOrdered(field: string): string[] {
  return (distinctCache[field] || []).map(v => String(v || "").trim()).filter(Boolean);
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

function suggestionsHandler(req: express.Request, res: express.Response) {
  const field = String(req.params.field);
  if (!ALLOWED_FIELDS.has(field)) return res.status(400).json([]);

  const q = typeof req.query.q === "string" ? req.query.q : "";
  const limit = clampSuggestionLimit(req.query.limit);
  const constraints = constraintsFor(field, req.query as Record<string, unknown>);
  const { where, clauses, params } = buildFilterClauses(constraints);

  // Nothing else is set, so every value in the field is still reachable and the
  // precomputed popularity order answers without touching the database.
  if (clauses.length === 0) {
    const unique = Array.from(new Set(popularityOrdered(field)));
    return res.json(q ? rankSuggestions(unique, q, limit) : unique.slice(0, limit));
  }

  if (!db) return res.status(503).json([]);

  const constraintKey = JSON.stringify(constraints);
  const cacheKey = `${field}|${q}|${limit}|${constraintKey}`;
  const cached = getCachedSuggestion(cacheKey);
  if (cached) return res.json(cached);

  // Prefix matches first here too, for the same reason as rankSuggestions, but
  // within each group the commonest values lead - "TOYOTA" before "TOYOPET".
  // Popularity is counted over the filtered set, so the order reflects what is
  // common *given the other filters*, not what is common overall.
  const stride = suggestionStride(constrainedRowCount(constraintKey, where, params));

  const sqlParams: any[] = [...params];
  const value = `TRIM(CAST("${field}" AS TEXT))`;
  let scanWhere = `${where} AND ${value} != ''`;
  if (stride > 1) scanWhere += ` AND (rowid % ${stride}) = 0`;
  let order = `cnt DESC, val`;
  if (q) {
    scanWhere += ` AND UPPER(${value}) LIKE ?`;
    sqlParams.push(`%${q.toUpperCase()}%`);
    order = `CASE WHEN UPPER(val) LIKE ? THEN 0 ELSE 1 END, cnt DESC, val`;
  }
  const sql = `SELECT ${value} as val, COUNT(*) as cnt FROM fleet ${scanWhere} GROUP BY val ORDER BY ${order} LIMIT ?`;
  if (q) sqlParams.push(`${q.toUpperCase()}%`);
  sqlParams.push(limit);
  const rows = (getStmt(sql) || db.prepare(sql)).all(...sqlParams) as any[];
  const result = Array.from(new Set(rows.map((r: any) => String(r.val || "").trim()).filter(Boolean)));
  setCachedSuggestion(cacheKey, result);
  res.json(result);
}
app.get("/api/suggestions/:field", suggestionsHandler);

const breakdownCache = new Map<string, { data: any; ts: number }>();
const BREAKDOWN_TTL = 5 * 60 * 1000; // 5 min
const BREAKDOWN_CACHE_MAX = 500;
function cacheBreakdown(key: string, data: unknown) {
  if (breakdownCache.size >= BREAKDOWN_CACHE_MAX) breakdownCache.delete(breakdownCache.keys().next().value!);
  breakdownCache.set(key, { data, ts: Date.now() });
}

app.get("/api/breakdown", limitPerIp(30, 60_000), (req, res) => {
  if (!db) return res.status(503).json({});

  const filters = req.query as Record<string, string>;
  // Range bounds (VEHICLE_YEAR_MIN etc.) are filters too, keyed by their base field.
  const activeFilters = Object.entries(filters).filter(
    ([k, v]) => typeof v === "string" && v.trim() && ALLOWED_FIELDS.has(k.replace(/_(MIN|MAX)$/, ""))
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

  cacheBreakdown(cacheKey, breakdown);
  res.json(breakdown);
});

const BREAKDOWN_DEFAULT_FIELDS = ["MOTIVE_POWER", "BASIC_COLOUR", "BODY_TYPE", "TRANSMISSION_TYPE", "MAKE"];
const BREAKDOWN_MAX_FIELDS = 5;
const BREAKDOWN_LIMIT_MAX = 1000;

/**
 * API-only: vehicle counts grouped by any field (or up to five at once),
 * under any filters. `by` picks the fields, `limit` how many values per field.
 */
function apiBreakdownHandler(req: express.Request, res: express.Response) {
  if (!db) return res.status(503).json({ error: "Database not available" });
  const { by, limit: limitParam, ...filters } = req.query as Record<string, string>;

  const fields = typeof by === "string" && by.trim()
    ? Array.from(new Set(by.split(",").map((f) => f.trim().toUpperCase()).filter(Boolean)))
    : BREAKDOWN_DEFAULT_FIELDS;
  const unknown = fields.filter((f) => !ALLOWED_FIELDS.has(f));
  if (unknown.length) return res.status(400).json({ error: `Unknown field: ${unknown.join(", ")}` });
  if (fields.length > BREAKDOWN_MAX_FIELDS) return res.status(400).json({ error: `At most ${BREAKDOWN_MAX_FIELDS} fields in by` });

  const parsed = parseInt(limitParam ?? "", 10);
  const limit = Number.isNaN(parsed) ? 50 : Math.min(Math.max(parsed, 1), BREAKDOWN_LIMIT_MAX);

  const cacheKey = JSON.stringify(["v1", fields, limit, Object.entries(filters).sort()]);
  const cached = breakdownCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < BREAKDOWN_TTL) return res.json(cached.data);

  const { where, params } = buildFilterClauses(filters);
  const totalSql = `SELECT COUNT(*) as n FROM fleet ${where}`;
  const total = ((getStmt(totalSql) || db.prepare(totalSql)).get(...params) as { n: number }).n;

  const groups: Record<string, { value: string; count: number }[]> = {};
  for (const f of fields) {
    const sql = `SELECT COALESCE("${f}",'UNKNOWN') as val, COUNT(*) as cnt FROM fleet ${where} GROUP BY val ORDER BY cnt DESC LIMIT ?`;
    const rows = (getStmt(sql) || db.prepare(sql)).all(...params, limit) as { val: string; cnt: number }[];
    groups[f] = rows.map((r) => ({ value: String(r.val || "UNKNOWN"), count: r.cnt }));
  }

  const data = { total, groups };
  cacheBreakdown(cacheKey, data);
  res.json(data);
}

function vehiclesHandler(req: express.Request, res: express.Response) {
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

  // The free site stops at FREE_MAX_RESULT_DEPTH results; API callers don't.
  const maxPage = res.locals.apiUser ? Infinity : Math.max(Math.floor(FREE_MAX_RESULT_DEPTH / limit), 1);
  if (currentPage > maxPage) {
    return res.status(400).json({
      error: `Site search shows the first ${FREE_MAX_RESULT_DEPTH.toLocaleString("en-NZ")} results. Narrow your filters, or use the API to go further: https://vehiclefinder.co.nz/developers`,
    });
  }

  const { where, params } = buildFilterClauses(filters);
  const total = (db.prepare(`SELECT COUNT(*) as count FROM fleet ${where}`).get(...params) as any).count;
  const vehicles = db.prepare(`SELECT ${RESULT_COLUMNS} FROM fleet ${where} LIMIT ? OFFSET ?`).all(...params, limit, offset);
  res.json({ vehicles, total, page: currentPage, pages: Math.min(Math.ceil(total / limit), maxPage), limit });
}
app.get("/api/vehicles", limitPerIp(60, 60_000), vehiclesHandler);

function fleetOverviewHandler(_req: express.Request, res: express.Response) {
  if (!fleetOverview) return res.status(503).json({});
  res.json(fleetOverview);
}
app.get("/api/fleet-overview", fleetOverviewHandler);

app.get("/api/top-regions", (_req, res) => {
  if (!fleetOverview) return res.status(503).json([]);
  res.json(fleetOverview.regions);
});

function topModelsHandler(req: express.Request, res: express.Response) {
  if (!db) return res.status(503).json([]);
  const make = String(req.params.make).replace(/_/g, " ").toUpperCase();
  const rows = db
    .prepare(
      `SELECT TRIM(MODEL) as model, COUNT(*) as count FROM fleet WHERE UPPER(MAKE) = ? AND MODEL IS NOT NULL AND LENGTH(TRIM(MODEL)) > 0 GROUP BY TRIM(MODEL) ORDER BY count DESC LIMIT 24`
    )
    .all(make) as { model: string; count: number }[];
  res.json(rows);
}
app.get("/api/top-models/:make", topModelsHandler);

app.post("/api/feedback", async (req, res) => {
  const { rating, comment, page_path, distinct_id, email } = req.body ?? {};

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: "rating must be an integer 1-5" });
  }
  const safeComment = typeof comment === "string" ? comment.trim().slice(0, 1000) : null;
  const safePath = typeof page_path === "string" ? page_path.slice(0, 200) : null;
  const safeDistinctId = typeof distinct_id === "string" ? distinct_id.slice(0, 100) : null;
  // Optional, so the reply can go straight back to the person; if given, it must be valid.
  const trimmedEmail = typeof email === "string" ? email.trim() : "";
  if (trimmedEmail && !isValidEmail(trimmedEmail)) {
    return res.status(400).json({ error: "That email address doesn't look right" });
  }
  const safeEmail = trimmedEmail || null;

  if (feedbackDb) {
    feedbackDb.prepare(
      `INSERT INTO feedback (created_at, rating, comment, page_path, distinct_id, email) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(new Date().toISOString(), rating, safeComment, safePath, safeDistinctId, safeEmail);
  }

  if (resend && process.env.FEEDBACK_FROM_EMAIL) {
    try {
      const stars = "★".repeat(rating) + "☆".repeat(5 - rating);
      await resend.emails.send({
        from: process.env.FEEDBACK_FROM_EMAIL,
        to: CONTACT_EMAIL.support,
        subject: `NZ Vehicle Finder feedback: ${stars}${safeEmail ? " (reply wanted)" : ""}`,
        ...(safeEmail ? { replyTo: safeEmail } : {}),
        text: [
          `Rating: ${rating}/5 ${stars}`,
          safeComment ? `Comment: ${safeComment}` : "No comment",
          safeEmail ? `Email: ${safeEmail} (hit Reply to answer them)` : "No email given",
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

// --- Paid API ---

const accountStore = new AccountStore(path.resolve(__dirname, "../database/accounts.db"));
// vehiclefinder.co.nz is verified in Resend, so any address on it can send.
const loginFrom = process.env.LOGIN_FROM_EMAIL || "NZ Vehicle Finder <login@vehiclefinder.co.nz>";
const publicUrl = (process.env.PUBLIC_URL || "https://vehiclefinder.co.nz").replace(/\/+$/, "");
const accounts = createAccounts(accountStore, {
  publicUrl,
  billingEnabled: !!process.env.STRIPE_SECRET_KEY,
  google: process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET }
    : null,
  adminEmails: (process.env.ADMIN_EMAILS ?? "").split(","),
  // Both checks, so a stray DEV_LOGIN in production can't switch it on.
  devLogin: process.env.DEV_LOGIN === "1" && publicUrl.startsWith("http://localhost"),
  sendLoginEmail: async (email, link, code) => {
    if (!resend || !loginFrom) {
      // Local development has no mail setup; the link or code is all you need.
      console.log(`Sign-in for ${email}: code ${code}, link ${link}`);
      return;
    }
    const { error } = await resend.emails.send({
      from: loginFrom,
      to: email,
      // login@ has no inbox; a reply to the sign-in email should reach a person.
      replyTo: CONTACT_EMAIL.support,
      subject: `${code} is your NZ Vehicle Finder sign-in code`,
      text: [
        `Your sign-in code: ${code}`,
        "",
        "Type it on the page you came from, or open this link:",
        link,
        "",
        "The code and link work once and expire in 15 minutes.",
        "If you did not ask for this, ignore this email.",
      ].join("\n"),
    });
    if (error) throw new Error(error.message);
  },
});
app.use("/api", accounts.router);

const billing = createBilling(accountStore, {
  secretKey: process.env.STRIPE_SECRET_KEY,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  publicUrl,
  sessionUser: accounts.sessionUser,
});
app.use("/api", billing.router);

/**
 * Every v1 response is { data, source }. The source block carries the NZTA
 * attribution the CC BY 4.0 licence requires, and the snapshot date so callers
 * can tell how fresh the data is.
 */
const v1 = express.Router();
v1.use(accounts.requireApiKey);
v1.use((_req, res, next) => {
  const json = res.json.bind(res);
  res.json = (body: unknown) =>
    json(res.statusCode >= 400 ? body : {
      data: body,
      source: {
        name: "NZTA Motor Vehicle Register",
        licence: "CC BY 4.0",
        attribution: "Contains data from the NZ Transport Agency Motor Vehicle Register, licensed under CC BY 4.0.",
        snapshot_date: fleetOverview?.snapshotDate ?? null,
      },
    });
  next();
});
v1.get("/vehicles", vehiclesHandler);
v1.get("/values/:field", suggestionsHandler);
v1.get("/fleet", fleetOverviewHandler);
v1.get("/makes/:make/models", topModelsHandler);
v1.get("/breakdown", apiBreakdownHandler);
v1.use((_req, res) => res.status(404).json({ error: "Unknown endpoint. See https://vehiclefinder.co.nz/developers" }));
app.use("/api/v1", v1);

// Never send a stack trace to the client.
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
});

app.listen(3001);