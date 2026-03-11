import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, "../../database/vehicles.db");

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

const columns = [
  "MAKE", "MODEL", "SUBMODEL", "BASIC_COLOUR", "MOTIVE_POWER", "BODY_TYPE",
  "TRANSMISSION_TYPE", "TLA", "POSTCODE", "IMPORT_STATUS", "ORIGINAL_COUNTRY",
  "CLASS", "INDUSTRY_CLASS", "ROAD_TRANSPORT_CODE", "VEHICLE_USAGE", "NZ_ASSEMBLED",
  "VEHICLE_YEAR", "CC_RATING", "POWER_RATING", "GROSS_VEHICLE_MASS", "WIDTH",
  "NUMBER_OF_SEATS", "NUMBER_OF_AXLES",
];

// Composite index for the most common filter combo
const composites = [
  ["MAKE", "MODEL"],
  ["MAKE", "MODEL", "SUBMODEL"],
  ["TLA", "POSTCODE"],
];

console.log(`Creating indexes on ${dbPath}...\n`);

const start = Date.now();

for (const col of columns) {
  const name = `idx_fleet_${col.toLowerCase()}`;
  const sql = `CREATE INDEX IF NOT EXISTS "${name}" ON fleet ("${col}")`;
  console.log(`  ${name}`);
  db.exec(sql);
}

for (const cols of composites) {
  const name = `idx_fleet_${cols.map(c => c.toLowerCase()).join("_")}`;
  const colList = cols.map(c => `"${c}"`).join(", ");
  const sql = `CREATE INDEX IF NOT EXISTS "${name}" ON fleet (${colList})`;
  console.log(`  ${name} (composite)`);
  db.exec(sql);
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`\nDone in ${elapsed}s. Run ANALYZE to update query planner stats...`);
db.exec("ANALYZE");
console.log("ANALYZE complete. Indexes are ready.");

db.close();
