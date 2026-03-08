node --input-type=module << 'EOF'
import Database from "better-sqlite3";

const db = new Database("public/vehicles.db", { readonly: true });
db.pragma("cache_size = -64000");

const FIELDS = [
  "MAKE","MODEL","SUBMODEL","BASIC_COLOUR","VEHICLE_YEAR","MOTIVE_POWER",
  "BODY_TYPE","TRANSMISSION_TYPE","TLA","POSTCODE","IMPORT_STATUS",
  "ORIGINAL_COUNTRY","NUMBER_OF_SEATS","NUMBER_OF_AXLES","CLASS",
  "INDUSTRY_CLASS","ROAD_TRANSPORT_CODE","VEHICLE_USAGE","NZ_ASSEMBLED",
  "GROSS_VEHICLE_MASS","WIDTH","CC_RATING","POWER_RATING"
];

console.log("Scanning...");
const cache = {};
for (const field of FIELDS) {
  const rows = db.prepare(`SELECT DISTINCT "${field}" FROM fleet WHERE "${field}" IS NOT NULL AND "${field}" != '' ORDER BY "${field}"`).all();
  cache[field] = rows.map(r => r[field]);
  console.log(`  ${field}: ${cache[field].length} values`);
}

import { writeFileSync } from "fs";
writeFileSync("public/autocomplete.json", JSON.stringify(cache));
console.log("Done! Written to public/autocomplete.json");
EOF