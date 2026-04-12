import express from "express";
import Database from "better-sqlite3";
import cors from "cors";
import compression from "compression";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(compression());
app.use(express.static(path.join(__dirname, "public")));

const dbPath = path.resolve(__dirname, "../database/vehicles.db");
const autocompletePath = path.resolve(__dirname, "../public/autocomplete.json");

let db: InstanceType<typeof Database> | null = null;
try {
  db = new Database(dbPath, { readonly: true });
  db.pragma("journal_mode = WAL");
  db.pragma("cache_size = -16000");
  db.pragma("temp_store = MEMORY");
  db.pragma("mmap_size = 268435456"); // 256MB mmap — lets OS handle caching without Node RAM
  console.log("Database opened:", dbPath);
} catch (err) {
  console.error("Database failed to open:", (err as Error).message);
  console.error("Expected database at:", dbPath);
  console.error("Search and filtered suggestions will not work until the database is available.");
}

const distinctCache: Record<string, string[]> = (() => {
  try {
    return JSON.parse(readFileSync(autocompletePath, "utf-8"));
  } catch (err) {
    console.error("Autocomplete file failed to load:", (err as Error).message);
    console.error("Expected at:", autocompletePath);
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

// Prepared statement cache — avoid re-parsing SQL on every request
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

// In-memory suggestion response cache (TTL: 5 min, max 500 entries)
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
    // Evict oldest
    const firstKey = suggestionResponseCache.keys().next().value;
    if (firstKey) suggestionResponseCache.delete(firstKey);
  }
  suggestionResponseCache.set(key, { data, ts: Date.now() });
}

// Result columns for vehicles endpoint — only send what the frontend needs
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

console.log("API listening on http://localhost:3001");

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, db: !!db });
});

app.get("/api/suggestions/:field", (req, res) => {
  const { field } = req.params;
  if (!ALLOWED_FIELDS.has(field)) {
    return res.status(400).json([]);
  }
  const { q = "", ...filterBy } = req.query as Record<string, string>;
  const activeFilters = Object.entries(filterBy).filter(
    ([k, v]) => v && v.trim() !== "" && ALLOWED_FIELDS.has(k)
  );

  if (activeFilters.length === 0) {
    const all = (distinctCache[field] || []).map(v => String(v || "").trim()).filter(Boolean);
    const unique = Array.from(new Set(all));
    const results = q
      ? unique.filter((v) => v.toUpperCase().startsWith(q.toUpperCase())).slice(0, 100)
      : unique.slice(0, 100);
    return res.json(results);
  }

  if (!db) {
    return res.status(503).json([]);
  }

  // Check response cache
  const cacheKey = `${field}|${q}|${JSON.stringify(activeFilters)}`;
  const cached = getCachedSuggestion(cacheKey);
  if (cached) return res.json(cached);

  const params: string[] = [];
  const clauses = activeFilters.map(([key, value]) => {
    params.push(`%${value.toUpperCase()}%`);
    return `UPPER("${key}") LIKE ?`;
  });
  if (q) {
    params.push(`${q.toUpperCase()}%`);
    clauses.push(`UPPER("${field}") LIKE ?`);
  }
  const where = "WHERE " + clauses.join(" AND ");
  const sql = `SELECT DISTINCT "${field}" FROM fleet ${where} ORDER BY "${field}" LIMIT 100`;
  const rows = (getStmt(sql) || db.prepare(sql)).all(...params) as any[];
  const result = Array.from(new Set(rows.map((r: any) => String(r[field] || "").trim()).filter(Boolean)));
  setCachedSuggestion(cacheKey, result);
  res.json(result);
});

app.get("/api/vehicles", (req, res) => {
  if (!db) {
    return res.status(503).json({
      error: "Database not available",
      vehicles: [],
      total: 0,
      page: 1,
      pages: 0,
    });
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
      clauses.push(`CAST("${col}" AS INTEGER) >= ?`);
      params.push(parseInt(value));
    } else if (key.endsWith("_MAX")) {
      const col = key.replace("_MAX", "");
      clauses.push(`CAST("${col}" AS INTEGER) <= ?`);
      params.push(parseInt(value));
    } else {
      clauses.push(`"${key}" LIKE ? COLLATE NOCASE`);
      params.push(`%${value}%`);
    }
  }

  const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "";
  const total = (db.prepare(`SELECT COUNT(*) as count FROM fleet ${where}`).get(...params) as any).count;
  const vehicles = db.prepare(`SELECT ${RESULT_COLUMNS} FROM fleet ${where} LIMIT ? OFFSET ?`).all(...params, limit, offset);
  res.json({ vehicles, total, page: parseInt(page), pages: Math.ceil(total / limit) });
});

app.listen(3001);
