/**
 * Saved searches, shared by the UI and the API.
 *
 * A saved search is the search page's query string. It is stored in one
 * canonical form - sorted keys, no empty values, no paging - so the same
 * filters always produce the same string, whichever order they were set in.
 * That is what lets the page tell whether the current search is already saved.
 */
import { parseFilterValue } from "./filterTerms.js";

export const MAX_SAVED_SEARCHES = 50;
export const MAX_SAVED_SEARCH_NAME = 80;
/** Far above any real search; only stops junk being stored. */
export const MAX_SAVED_QUERY_LENGTH = 2000;

/** Query keys that are about how results are shown, not which vehicles match. */
const VIEW_KEYS = new Set(["limit", "page", "sort"]);

/** "?MODEL=X&MAKE=Y&limit=100" -> "MAKE=Y&MODEL=X". Returns "" when no filter is set. */
export function canonicalQuery(query: string | URLSearchParams | Record<string, string | undefined>): string {
  const source =
    typeof query === "string"
      ? new URLSearchParams(query.replace(/^\?/, ""))
      : query instanceof URLSearchParams
        ? query
        : new URLSearchParams(Object.entries(query).filter((e): e is [string, string] => typeof e[1] === "string"));
  const pairs: [string, string][] = [];
  for (const [k, v] of source.entries()) {
    const value = v.trim();
    if (!value || VIEW_KEYS.has(k)) continue;
    pairs.push([k, value]);
  }
  pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return new URLSearchParams(pairs).toString();
}

const RANGES: [string, string, string][] = [
  ["VEHICLE_YEAR_MIN", "VEHICLE_YEAR_MAX", ""],
  ["CC_RATING_MIN", "CC_RATING_MAX", "cc"],
  ["POWER_RATING_MIN", "POWER_RATING_MAX", "kW"],
];

/** Fields in the order a person would say them: "Toyota Corolla, white or red, petrol". */
const NAME_ORDER = ["MAKE", "MODEL", "SUBMODEL", "BASIC_COLOUR", "MOTIVE_POWER", "BODY_TYPE", "TRANSMISSION_TYPE", "TLA"];

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s/-])\p{L}/gu, (m) => m.toUpperCase());

/** A readable default name for a search, e.g. "Toyota Corolla · White or Red · Petrol · 2010-2020". */
export function describeSearch(query: string): string {
  const params = new URLSearchParams(query.replace(/^\?/, ""));
  const parts: string[] = [];
  const used = new Set<string>();

  const words = (key: string) => {
    used.add(key);
    return parseFilterValue(params.get(key))
      .map((t) => (t.contains ? `has "${t.value}"` : titleCase(t.value)))
      .join(" or ");
  };

  // Make and model read as one phrase.
  const vehicle = [words("MAKE"), words("MODEL"), words("SUBMODEL")].filter(Boolean).join(" ");
  if (vehicle) parts.push(vehicle);
  for (const key of NAME_ORDER) {
    if (used.has(key)) continue;
    const w = words(key);
    if (w) parts.push(w);
  }
  for (const [min, max, unit] of RANGES) {
    used.add(min);
    used.add(max);
    const lo = params.get(min);
    const hi = params.get(max);
    if (!lo && !hi) continue;
    const range = lo && hi ? `${lo}-${hi}` : lo ? `${lo}+` : `up to ${hi}`;
    parts.push(unit ? `${range} ${unit}` : range);
  }
  // Anything else (the advanced filters) still gets a mention, with its field
  // name, since a bare "5" or "Japan" means little on its own.
  for (const [k] of params.entries()) {
    if (used.has(k) || VIEW_KEYS.has(k)) continue;
    const w = words(k);
    if (w) parts.push(`${titleCase(k.replace(/_/g, " "))}: ${w}`);
  }

  const name = parts.join(" · ") || "All vehicles";
  return name.length > MAX_SAVED_SEARCH_NAME ? `${name.slice(0, MAX_SAVED_SEARCH_NAME - 1)}…` : name;
}
