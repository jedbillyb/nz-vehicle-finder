/**
 * Rebuild database/vehicles.db from the NZTA Motor Vehicle Register open data.
 *
 * NZTA publishes a monthly snapshot of the register as one CSV per vehicle year
 * from 1990 onwards, plus a single zipped file for everything older. This script
 * downloads every part (including pre-1990), loads them into a fresh database,
 * builds the indexes and the breakdown cache, and writes autocomplete.json.
 *
 * The existing database is left untouched until the new one is complete, so a
 * failed run never takes the site down.
 *
 *   npx tsx database/import-mvr.ts              # full refresh
 *   npx tsx database/import-mvr.ts --keep-csv   # keep the downloaded CSVs
 *   npx tsx database/import-mvr.ts --no-swap    # build vehicles.db.new, don't swap
 *
 * Source: https://nzta.govt.nz/resources/new-zealand-motor-vehicle-register-statistics/new-zealand-vehicle-fleet-open-data-sets
 */
import Database from "better-sqlite3";
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync, createReadStream } from "fs";
import { execFileSync } from "child_process";
import { createInterface } from "readline";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const WORK_DIR = path.join(ROOT, "database", "mvr-download");
const LIVE_DB = path.join(ROOT, "database", "vehicles.db");
const NEW_DB = path.join(ROOT, "database", "vehicles.db.new");

const BASE_URL = "https://wksprdgisopendata.blob.core.windows.net/motorvehicleregister";
const FIRST_YEAR = 1990;
const LAST_YEAR = new Date().getFullYear() + 2; // model years can run ahead of the calendar

const KEEP_CSV = process.argv.includes("--keep-csv");
const NO_SWAP = process.argv.includes("--no-swap");
/** --only=2026,2027 builds from a subset of parts. Smoke-testing only, never for a real refresh. */
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length).split(",");

/** Column order of the NZTA CSV. Verified against the published header on every run. */
const COLUMNS = [
  "ALTERNATIVE_MOTIVE_POWER", "BASIC_COLOUR", "BODY_TYPE", "CC_RATING", "CHASSIS7", "CLASS",
  "ENGINE_NUMBER", "FIRST_NZ_REGISTRATION_YEAR", "FIRST_NZ_REGISTRATION_MONTH", "GROSS_VEHICLE_MASS",
  "HEIGHT", "IMPORT_STATUS", "INDUSTRY_CLASS", "INDUSTRY_MODEL_CODE", "MAKE", "MODEL",
  "MOTIVE_POWER", "MVMA_MODEL_CODE", "NUMBER_OF_AXLES", "NUMBER_OF_SEATS", "NZ_ASSEMBLED",
  "ORIGINAL_COUNTRY", "POWER_RATING", "PREVIOUS_COUNTRY", "ROAD_TRANSPORT_CODE", "SUBMODEL",
  "TLA", "POSTCODE", "TRANSMISSION_TYPE", "VDAM_WEIGHT", "VEHICLE_TYPE", "VEHICLE_USAGE",
  "VEHICLE_YEAR", "VIN11", "WIDTH", "SYNTHETIC_GREENHOUSE_GAS", "FC_COMBINED", "FC_URBAN",
  "FC_EXTRA_URBAN",
];

const INDEX_COLUMNS = [
  "MAKE", "MODEL", "SUBMODEL", "BASIC_COLOUR", "MOTIVE_POWER", "BODY_TYPE",
  "TRANSMISSION_TYPE", "TLA", "POSTCODE", "IMPORT_STATUS", "ORIGINAL_COUNTRY",
  "CLASS", "INDUSTRY_CLASS", "ROAD_TRANSPORT_CODE", "VEHICLE_USAGE", "NZ_ASSEMBLED",
  "VEHICLE_YEAR", "CC_RATING", "POWER_RATING", "GROSS_VEHICLE_MASS", "WIDTH",
  "NUMBER_OF_SEATS", "NUMBER_OF_AXLES",
];

const COMPOSITE_INDEXES = [
  ["MAKE", "MODEL"],
  ["MAKE", "MODEL", "SUBMODEL"],
  ["TLA", "POSTCODE"],
];

/**
 * The search API compares text filters with UPPER("COL") = UPPER(?), which only
 * hits an index if that exact expression is indexed. The old database had this
 * for MAKE alone (plus a set of COLLATE NOCASE indexes the planner never used),
 * so every other filter fell back to a full scan.
 */
const UPPER_INDEX_COLUMNS = [
  "MAKE", "MODEL", "SUBMODEL", "BASIC_COLOUR", "MOTIVE_POWER", "BODY_TYPE",
  "TRANSMISSION_TYPE", "TLA", "POSTCODE", "IMPORT_STATUS", "ORIGINAL_COUNTRY",
  "CLASS", "INDUSTRY_CLASS", "ROAD_TRANSPORT_CODE", "VEHICLE_USAGE", "NZ_ASSEMBLED",
  "VEHICLE_YEAR",
];

/** Range filters arrive as CAST("COL" AS INTEGER) >= ?, so index that expression too. */
const NUMERIC_INDEX_COLUMNS = [
  "VEHICLE_YEAR", "CC_RATING", "POWER_RATING", "GROSS_VEHICLE_MASS", "WIDTH",
  "NUMBER_OF_SEATS", "NUMBER_OF_AXLES",
];

const BREAKDOWN_FIELDS = ["MOTIVE_POWER", "BASIC_COLOUR", "BODY_TYPE", "TRANSMISSION_TYPE", "MAKE"];

const AUTOCOMPLETE_FIELDS = [
  "MAKE", "MODEL", "SUBMODEL", "BASIC_COLOUR", "MOTIVE_POWER", "BODY_TYPE", "TRANSMISSION_TYPE",
  "TLA", "POSTCODE", "IMPORT_STATUS", "ORIGINAL_COUNTRY", "CLASS", "INDUSTRY_CLASS",
  "ROAD_TRANSPORT_CODE", "VEHICLE_USAGE", "NZ_ASSEMBLED", "VEHICLE_YEAR",
  "CC_RATING", "POWER_RATING", "GROSS_VEHICLE_MASS", "WIDTH", "NUMBER_OF_SEATS", "NUMBER_OF_AXLES",
];

function log(msg: string) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

function human(bytes: number) {
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)}${units[i]}`;
}

/** Split one CSV line, honouring quoted fields. */
function parseLine(line: string): string[] {
  if (!line.includes('"')) return line.split(",");
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { out.push(field); field = ""; }
    else field += ch;
  }
  out.push(field);
  return out;
}

/** HEAD a URL; returns null when the file does not exist. */
async function probe(url: string): Promise<{ size: number; modified: string | null } | null> {
  const res = await fetch(url, { method: "HEAD" });
  if (!res.ok) return null;
  const size = Number(res.headers.get("content-length") ?? 0);
  return { size, modified: res.headers.get("last-modified") };
}

async function download(url: string, dest: string, expectedSize: number) {
  if (existsSync(dest) && statSync(dest).size === expectedSize) {
    log(`  cached ${path.basename(dest)} (${human(expectedSize)})`);
    return;
  }
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${url} -> HTTP ${res.status}`);
  const out = createWriteStream(dest);
  const reader = res.body.getReader();
  let written = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    written += value.length;
    if (!out.write(value)) await new Promise((r) => out.once("drain", r));
  }
  await new Promise<void>((resolve, reject) => out.end(() => resolve()).on("error", reject));
  log(`  downloaded ${path.basename(dest)} (${human(written)})`);
}

/** Work out which parts NZTA is currently publishing. */
async function discoverParts() {
  const parts: { label: string; url: string; file: string; zipped: boolean; size: number; modified: string | null }[] = [];

  const pre1990Url = `${BASE_URL}/VehicleYear-Pre1990.zip`;
  const pre = await probe(pre1990Url);
  if (!pre) throw new Error("Pre-1990 file is missing from the NZTA feed - refusing to build a database without it");
  parts.push({ label: "pre-1990", url: pre1990Url, file: path.join(WORK_DIR, "VehicleYear-Pre1990.zip"), zipped: true, size: pre.size, modified: pre.modified });

  for (let year = FIRST_YEAR; year <= LAST_YEAR; year++) {
    const url = `${BASE_URL}/VehicleYear-${year}.csv`;
    const info = await probe(url);
    if (!info || info.size === 0) continue;
    parts.push({ label: String(year), url, file: path.join(WORK_DIR, `VehicleYear-${year}.csv`), zipped: false, size: info.size, modified: info.modified });
  }
  return ONLY ? parts.filter((p) => ONLY.includes(p.label)) : parts;
}

/** Stream one CSV file into the fleet table. */
async function loadCsv(db: InstanceType<typeof Database>, csvPath: string, label: string): Promise<number> {
  const insert = db.prepare(
    `INSERT INTO fleet (${COLUMNS.map((c) => `"${c}"`).join(", ")}) VALUES (${COLUMNS.map(() => "?").join(", ")})`
  );
  const insertBatch = db.transaction((rows: string[][]) => {
    for (const row of rows) insert.run(row);
  });

  const rl = createInterface({ input: createReadStream(csvPath, { encoding: "utf-8" }), crlfDelay: Infinity });
  let batch: string[][] = [];
  let count = 0;
  let headerChecked = false;

  for await (const line of rl) {
    if (!line) continue;
    if (!headerChecked) {
      headerChecked = true;
      const header = parseLine(line).map((h) => h.trim().replace(/^\uFEFF/, ""));
      if (header.join(",") !== COLUMNS.join(",")) {
        throw new Error(
          `Column layout changed in ${label}.\n  expected: ${COLUMNS.join(",")}\n  got:      ${header.join(",")}`
        );
      }
      continue;
    }
    const row = parseLine(line);
    // Trailing empty columns are dropped by some exports; pad rather than skip.
    while (row.length < COLUMNS.length) row.push("");
    if (row.length > COLUMNS.length) row.length = COLUMNS.length;
    batch.push(row);
    count++;
    if (batch.length >= 50_000) {
      insertBatch(batch);
      batch = [];
    }
  }
  if (batch.length) insertBatch(batch);
  return count;
}

async function main() {
  mkdirSync(WORK_DIR, { recursive: true });

  log("Checking what NZTA is publishing...");
  const parts = await discoverParts();
  const totalSize = parts.reduce((n, p) => n + p.size, 0);
  const published = parts
    .map((p) => p.modified)
    .filter((m): m is string => !!m)
    .sort((a, b) => Date.parse(a) - Date.parse(b))
    .pop() ?? "unknown";
  log(`Found ${parts.length} parts (${parts.map((p) => p.label).join(", ")}), ${human(totalSize)}, published ${published}`);

  log("Downloading...");
  for (const part of parts) await download(part.url, part.file, part.size);

  // The pre-1990 data ships zipped; expand it next to the year files.
  const pre1990Csv = path.join(WORK_DIR, "VehicleYear-Pre1990.csv");
  if (parts.some((p) => p.zipped)) {
    if (!existsSync(pre1990Csv)) {
      log("Unzipping pre-1990 data...");
      execFileSync("unzip", ["-o", "-j", path.join(WORK_DIR, "VehicleYear-Pre1990.zip"), "-d", WORK_DIR], { stdio: "inherit" });
    }
    if (!existsSync(pre1990Csv)) throw new Error(`Expected ${pre1990Csv} after unzip - check the archive layout`);
  }

  if (existsSync(NEW_DB)) rmSync(NEW_DB, { force: true });
  const db = new Database(NEW_DB);
  db.pragma("journal_mode = OFF");
  db.pragma("synchronous = OFF");
  db.pragma("cache_size = -256000");
  db.pragma("temp_store = MEMORY");
  db.exec(`CREATE TABLE fleet (${COLUMNS.map((c) => `"${c}"`).join(", ")})`);

  let total = 0;
  for (const part of parts) {
    const csv = part.zipped ? pre1990Csv : part.file;
    const n = await loadCsv(db, csv, part.label);
    total += n;
    log(`  ${part.label}: ${n.toLocaleString()} rows (running total ${total.toLocaleString()})`);
  }
  log(`Loaded ${total.toLocaleString()} vehicles`);

  log("Creating indexes...");
  for (const col of INDEX_COLUMNS) {
    db.exec(`CREATE INDEX IF NOT EXISTS "idx_fleet_${col.toLowerCase()}" ON fleet ("${col}")`);
  }
  for (const cols of COMPOSITE_INDEXES) {
    const name = `idx_fleet_${cols.map((c) => c.toLowerCase()).join("_")}`;
    db.exec(`CREATE INDEX IF NOT EXISTS "${name}" ON fleet (${cols.map((c) => `"${c}"`).join(", ")})`);
  }
  for (const col of UPPER_INDEX_COLUMNS) {
    db.exec(`CREATE INDEX IF NOT EXISTS "idx_fleet_${col.toLowerCase()}_uc" ON fleet (UPPER("${col}"))`);
  }
  for (const col of NUMERIC_INDEX_COLUMNS) {
    db.exec(`CREATE INDEX IF NOT EXISTS "idx_fleet_${col.toLowerCase()}_int" ON fleet (CAST("${col}" AS INTEGER))`);
  }

  // NZTA publishes early in the month and the files hold the register as at the
  // end of the previous month, so derive the snapshot date from the publish date.
  const publishedAt = published !== "unknown" ? new Date(published) : new Date();
  const snapshotDate = new Date(Date.UTC(publishedAt.getUTCFullYear(), publishedAt.getUTCMonth(), 0));
  log(`Recording snapshot date ${snapshotDate.toISOString().slice(0, 10)}...`);
  db.exec(`
    DROP TABLE IF EXISTS dataset_meta;
    CREATE TABLE dataset_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  const insertMeta = db.prepare("INSERT INTO dataset_meta VALUES (?, ?)");
  insertMeta.run("snapshot_date", snapshotDate.toISOString().slice(0, 10));
  insertMeta.run("published_at", published);
  insertMeta.run("imported_at", new Date().toISOString());
  insertMeta.run("vehicle_count", String(total));

  log("Building breakdown cache...");
  db.exec(`
    DROP TABLE IF EXISTS breakdown_cache;
    CREATE TABLE breakdown_cache (field TEXT NOT NULL, value TEXT NOT NULL, count INTEGER NOT NULL);
    CREATE INDEX idx_breakdown_field ON breakdown_cache (field);
  `);
  const insertBreakdown = db.prepare("INSERT INTO breakdown_cache VALUES (?, ?, ?)");
  for (const field of BREAKDOWN_FIELDS) {
    const rows = db.prepare(
      `SELECT COALESCE(NULLIF(TRIM("${field}"), ''), 'UNKNOWN') as val, COUNT(*) as cnt
       FROM fleet GROUP BY "${field}" ORDER BY cnt DESC LIMIT 8`
    ).all() as { val: string; cnt: number }[];
    for (const row of rows) insertBreakdown.run(field, row.val, row.cnt);
  }

  log("Writing autocomplete.json...");
  const autocomplete: Record<string, string[]> = {};
  for (const field of AUTOCOMPLETE_FIELDS) {
    const rows = db.prepare(
      `SELECT DISTINCT TRIM("${field}") as v FROM fleet WHERE TRIM(CAST("${field}" AS TEXT)) != '' ORDER BY v`
    ).all() as { v: string }[];
    autocomplete[field] = rows.map((r) => r.v).filter(Boolean);
  }
  const json = JSON.stringify(autocomplete);
  // The API reads public/, the built site serves a copy of the same file.
  writeFileSync(path.join(ROOT, "public", "autocomplete.json"), json);
  writeFileSync(path.join(ROOT, "server", "public", "autocomplete.json"), json);

  log("Running ANALYZE...");
  db.exec("ANALYZE");
  // Loading ran with the journal off for speed; the API opens the file read-only
  // and cannot switch it, so leave WAL set here.
  db.pragma("journal_mode = WAL");
  db.close();

  const builtSize = statSync(NEW_DB).size;
  log(`New database built: ${human(builtSize)}`);

  if (NO_SWAP) {
    log(`--no-swap set, leaving the new database at ${NEW_DB}`);
  } else {
    if (existsSync(LIVE_DB)) renameSync(LIVE_DB, `${LIVE_DB}.old`);
    renameSync(NEW_DB, LIVE_DB);
    // The old WAL/SHM belong to the replaced database.
    for (const suffix of ["-wal", "-shm"]) rmSync(`${LIVE_DB}${suffix}`, { force: true });
    log(`Swapped into place. Previous database kept at ${LIVE_DB}.old`);
    log("Restart the API so it picks up the new file: pm2 restart vehicle-api");
  }

  if (!KEEP_CSV) {
    rmSync(WORK_DIR, { recursive: true, force: true });
    log("Removed downloaded CSVs (--keep-csv to keep them)");
  }

  log(`Done. NZTA published ${published}, ${total.toLocaleString()} vehicles.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
