import initSqlJs, { Database } from "sql.js";

export interface Vehicle {
  ALTERNATIVE_MOTIVE_POWER: string;
  BASIC_COLOUR: string;
  BODY_TYPE: string;
  CC_RATING: string;
  CHASSIS7: string;
  CLASS: string;
  ENGINE_NUMBER: string;
  FIRST_NZ_REGISTRATION_YEAR: string;
  FIRST_NZ_REGISTRATION_MONTH: string;
  GROSS_VEHICLE_MASS: string;
  HEIGHT: string;
  IMPORT_STATUS: string;
  INDUSTRY_CLASS: string;
  INDUSTRY_MODEL_CODE: string;
  MAKE: string;
  MODEL: string;
  MOTIVE_POWER: string;
  MVMA_MODEL_CODE: string;
  NUMBER_OF_AXLES: string;
  NUMBER_OF_SEATS: string;
  NZ_ASSEMBLED: string;
  ORIGINAL_COUNTRY: string;
  POWER_RATING: string;
  PREVIOUS_COUNTRY: string;
  ROAD_TRANSPORT_CODE: string;
  SUBMODEL: string;
  TLA: string;
  POSTCODE: string;
  TRANSMISSION_TYPE: string;
  VDAM_WEIGHT: string;
  VEHICLE_TYPE: string;
  VEHICLE_USAGE: string;
  VEHICLE_YEAR: string;
  VIN11: string;
  WIDTH: string;
  SYNTHETIC_GREENHOUSE_GAS: string;
  FC_COMBINED: string;
  FC_URBAN: string;
  FC_EXTRA_URBAN: string;
}

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

export async function getDistinctValues(field: keyof Vehicle): Promise<string[]> {
  const database = await getDB();
  const result = database.exec(
    `SELECT DISTINCT ${field} FROM fleet WHERE ${field} IS NOT NULL AND ${field} != '' ORDER BY ${field}`
  );
  if (!result.length) return [];
  return result[0].values.flat().map(String);
}