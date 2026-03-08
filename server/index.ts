import express from "express";
import Database from "better-sqlite3";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());

const db = new Database(path.resolve(__dirname, "../public/vehicles.db"), { readonly: true });
db.pragma("journal_mode = WAL");
db.pragma("cache_size = -64000");
db.pragma("temp_store = MEMORY");

const distinctCache: Record<string, string[]> = JSON.parse(
  readFileSync(path.resolve(__dirname, "../public/autocomplete.json"), "utf-8")
);
console.log("Autocomplete cache loaded. API ready on http://localhost:3001");

app.get("/api/suggestions/:field", (req, res) => {
  const { field } = req.params;
  const { q = "", ...filterBy } = req.query as Record<string, string>;
  const activeFilters = Object.entries(filterBy).filter(([, v]) => v && v.trim() !== "");

  if (activeFilters.length === 0) {
    const all = distinctCache[field] || [];
    const results = q
      ? all.filter((v) => v.toUpperCase().startsWith(q.toUpperCase())).slice(0, 20)
      : all.slice(0, 20);
    return res.json(results);
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
