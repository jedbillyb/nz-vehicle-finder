import express from "express";
import Database from "better-sqlite3";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

const dbPath = path.resolve(__dirname, "../../database/vehicles.db");
const autocompletePath = path.resolve(__dirname, "../public/autocomplete.json");

let db: InstanceType<typeof Database> | null = null;
try {
  db = new Database(dbPath, { readonly: true });
  db.pragma("journal_mode = WAL");
  db.pragma("cache_size = -64000");
  db.pragma("temp_store = MEMORY");
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
]);
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
    const all = distinctCache[field] || [];
    const results = q
      ? all.filter((v) => v.toUpperCase().startsWith(q.toUpperCase())).slice(0, 20)
      : all.slice(0, 20);
    return res.json(results);
  }

  if (!db) {
    return res.status(503).json([]);
  }

  const params: string[] = [];
  const clauses = activeFilters.map(([key, value]) => {
    params.push(`%${value.toUpperCase()}%`);
    return `UPPER("${key}") LIKE ?`;
  });
  if (q) {
    params.push(`%${q.toUpperCase()}%`);
    clauses.push(`UPPER("${field}") LIKE ?`);
  }
  const where = "WHERE " + clauses.join(" AND ");
  const rows = db.prepare(
    `SELECT DISTINCT "${field}" FROM fleet ${where} ORDER BY "${field}" LIMIT 20`
  ).all(...params) as any[];
  res.json(rows.map((r: any) => r[field]).filter(Boolean));
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
  const vehicles = db.prepare(`SELECT * FROM fleet ${where} LIMIT ? OFFSET ?`).all(...params, limit, offset);
  res.json({ vehicles, total, page: parseInt(page), pages: Math.ceil(total / limit) });
});

app.listen(3001);
