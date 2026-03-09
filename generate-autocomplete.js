import Database from "better-sqlite3";
import { writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.resolve(__dirname, "../database/vehicles.db"), { readonly: true });

const FIELDS = [
  "MAKE", "MODEL", "SUBMODEL", "BASIC_COLOUR", "MOTIVE_POWER", "BODY_TYPE", "TRANSMISSION_TYPE",
  "TLA", "POSTCODE", "IMPORT_STATUS", "ORIGINAL_COUNTRY", "CLASS", "INDUSTRY_CLASS",
  "ROAD_TRANSPORT_CODE", "VEHICLE_USAGE", "NZ_ASSEMBLED", "VEHICLE_YEAR",
  "CC_RATING", "POWER_RATING", "GROSS_VEHICLE_MASS", "WIDTH", "NUMBER_OF_SEATS", "NUMBER_OF_AXLES",
];

const result = {};
for (const field of FIELDS) {
  process.stdout.write(`Loading ${field}...`);
  const rows = db.prepare(`SELECT DISTINCT "${field}" FROM fleet WHERE CAST("${field}" AS TEXT) != '' ORDER BY "${field}"`).all();
  result[field] = rows.map(r => r[field]).filter(Boolean);
  console.log(` ${result[field].length} values`);
}

writeFileSync(
  path.resolve(__dirname, "server/public/autocomplete.json"),
  JSON.stringify(result)
);
console.log("Done! autocomplete.json written.");
db.close();