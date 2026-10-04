import type { Vehicle } from "@/lib/mockData";

/**
 * Columns of every vehicle results table (search page and the make, model and
 * region pages). Widths are shares of a fixed-layout table that never gets
 * narrower than 1000px, so short values like the year get just enough room.
 */
export const resultColumns: { key: keyof Vehicle; label: string; width: string }[] = [
  { key: "MAKE", label: "Make", width: "10%" },
  { key: "MODEL", label: "Model", width: "12%" },
  { key: "VEHICLE_YEAR", label: "Year", width: "7%" },
  { key: "BASIC_COLOUR", label: "Colour", width: "8%" },
  { key: "BODY_TYPE", label: "Body", width: "13%" },
  { key: "MOTIVE_POWER", label: "Fuel", width: "9%" },
  { key: "TRANSMISSION_TYPE", label: "Transmission", width: "14%" },
  { key: "TLA", label: "Region", width: "16%" },
  { key: "VIN11", label: "VIN11", width: "11%" },
];
