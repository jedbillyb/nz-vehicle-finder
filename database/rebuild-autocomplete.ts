/**
 * Rewrite autocomplete.json from the existing database, popularity-first.
 *
 * import-mvr.ts already writes the file this way, but only as the last step of a
 * multi-hour full refresh. The file shipped before that change is alphabetical,
 * so an empty MAKE box offers "AAKRON XPRESS" ahead of "TOYOTA". The API works
 * around that at runtime (popularityOrdered in server/index.ts), but the client
 * fetches autocomplete.json directly as its local fallback and has no database
 * to rank against, so the file itself has to be correct.
 *
 * This reads the live database read-only and touches nothing else, so it is safe
 * to run against a database the API is serving from.
 *
 *   npx tsx database/rebuild-autocomplete.ts
 *   npx tsx database/rebuild-autocomplete.ts --out=/tmp   # don't touch the checkout
 *
 * autocomplete.json is tracked, so writing it inside a deployed checkout leaves a
 * dirty tree that blocks the next pull. --out writes a single copy elsewhere for
 * copying back to a machine that can commit it.
 */
import Database from "better-sqlite3";
import { existsSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(ROOT, "database", "vehicles.db");

const AUTOCOMPLETE_FIELDS = [
  "MAKE", "MODEL", "SUBMODEL", "BASIC_COLOUR", "MOTIVE_POWER", "BODY_TYPE", "TRANSMISSION_TYPE",
  "TLA", "POSTCODE", "IMPORT_STATUS", "ORIGINAL_COUNTRY", "CLASS", "INDUSTRY_CLASS",
  "ROAD_TRANSPORT_CODE", "VEHICLE_USAGE", "NZ_ASSEMBLED", "VEHICLE_YEAR",
  "CC_RATING", "POWER_RATING", "GROSS_VEHICLE_MASS", "WIDTH", "NUMBER_OF_SEATS", "NUMBER_OF_AXLES",
];

function log(msg: string) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

if (!existsSync(DB_PATH)) {
  console.error(`No database at ${DB_PATH}. Run this where vehicles.db lives.`);
  process.exit(1);
}

const db = new Database(DB_PATH, { readonly: true });

const autocomplete: Record<string, string[]> = {};
for (const field of AUTOCOMPLETE_FIELDS) {
  // Same ordering as import-mvr.ts: commonest values first, ties alphabetical
  // so the output is stable between runs on the same snapshot.
  const rows = db.prepare(
    `SELECT TRIM("${field}") as v, COUNT(*) as cnt FROM fleet
     WHERE TRIM(CAST("${field}" AS TEXT)) != ''
     GROUP BY TRIM("${field}") ORDER BY cnt DESC, v`
  ).all() as { v: string; cnt: number }[];
  autocomplete[field] = rows.map((r) => r.v).filter(Boolean);
  log(`${field}: ${autocomplete[field].length} values, top = ${autocomplete[field].slice(0, 3).join(", ")}`);
}

db.close();

const json = JSON.stringify(autocomplete);
const outArg = process.argv.find((a) => a.startsWith("--out="))?.slice("--out=".length);
// The API reads server/public/, the built site serves a copy from public/.
const targets = outArg
  ? [path.resolve(outArg, "autocomplete.json")]
  : [
      path.join(ROOT, "public", "autocomplete.json"),
      path.join(ROOT, "server", "public", "autocomplete.json"),
    ];
for (const target of targets) {
  writeFileSync(target, json);
  log(`Wrote ${target}`);
}

log("Done. Restart the API to drop its cached ordering: pm2 restart vehicle-api");
