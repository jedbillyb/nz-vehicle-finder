import Database from "better-sqlite3";

const db = new Database("/home/jed/projects/nz-vehicle-finder/database/vehicles.db");

db.exec(`
  DROP TABLE IF EXISTS breakdown_cache;
  CREATE TABLE breakdown_cache (
    field TEXT NOT NULL,
    value TEXT NOT NULL,
    count INTEGER NOT NULL
  );
  CREATE INDEX idx_breakdown_field ON breakdown_cache (field);
`);

const fields = ["MOTIVE_POWER", "BASIC_COLOUR", "BODY_TYPE", "TRANSMISSION_TYPE", "MAKE"];
const insert = db.prepare(`INSERT INTO breakdown_cache VALUES (?, ?, ?)`);

const insertMany = db.transaction(() => {
  for (const field of fields) {
    console.log(`Computing ${field}...`);
    const rows = db.prepare(`
      SELECT COALESCE("${field}", 'UNKNOWN') as val, COUNT(*) as cnt
      FROM fleet
      GROUP BY "${field}"
      ORDER BY cnt DESC
      LIMIT 8
    `).all() as any[];

    for (const row of rows) {
      insert.run(field, row.val, row.cnt);
    }
  }
});

insertMany();
console.log("Done.");
db.close();