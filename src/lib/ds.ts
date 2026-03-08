import initSqlJs, { Database } from "sql.js";
import { Vehicle } from "@/lib/mockData";

let db: Database | null = null;

export async function getDB(): Promise<Database> {
  if (db) return db;

  const SQL = await initSqlJs({
    locateFile: () => "/sql-wasm.wasm",
  });

  const response = await fetch("/vehicles.db");
  const buffer = await response.arrayBuffer();
  db = new SQL.Database(new Uint8Array(buffer));
  return db;
}

export async function getVehicles(): Promise<Vehicle[]> {
  const database = await getDB();
  const result = database.exec("SELECT * FROM vehicles");
  if (!result.length) return [];

  const { columns, values } = result[0];
  return values.map((row) =>
    Object.fromEntries(columns.map((col, i) => [col, row[i] ?? ""]))
  ) as Vehicle[];
}

export async function getDistinctValues(field: string): Promise<string[]> {
  const database = await getDB();
  const result = database.exec(
    `SELECT DISTINCT ${field} FROM vehicles WHERE ${field} != '' ORDER BY ${field}`
  );
  if (!result.length) return [];
  return result[0].values.flat().map(String);
}