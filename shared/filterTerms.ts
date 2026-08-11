/**
 * Encoding for multi-value filters, shared by the UI and the API.
 *
 * A filter field holds a list of terms. Each term is either an exact value
 * ("Automatic 4") or a "contains" term ("Manual", written `~Manual`) that
 * matches every value in the field containing that text.
 *
 * On the wire the terms are one comma-separated string, so a single-value URL
 * such as ?MAKE=TOYOTA keeps working exactly as before. A backslash escapes any
 * comma, tilde or backslash that appears inside a value.
 */

export interface FilterTerm {
  value: string;
  /** true = match any field value containing `value`; false = match it exactly */
  contains: boolean;
}

const SEPARATOR = ",";
const CONTAINS_PREFIX = "~";
const ESCAPE = "\\";

function escapeValue(value: string): string {
  return value.replace(/[\\,~]/g, (ch) => ESCAPE + ch);
}

/** Split on separators that are not backslash-escaped, leaving escapes in place. */
function splitUnescaped(raw: string): string[] {
  const chunks: string[] = [];
  let current = "";
  let escaped = false;
  for (const ch of raw) {
    if (escaped) {
      current += ESCAPE + ch;
      escaped = false;
    } else if (ch === ESCAPE) {
      escaped = true;
    } else if (ch === SEPARATOR) {
      chunks.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (escaped) current += ESCAPE; // trailing lone backslash: treat as literal
  chunks.push(current);
  return chunks;
}

/** Decode a wire value into its terms. Duplicates and blanks are dropped. */
export function parseFilterValue(raw: string | undefined | null): FilterTerm[] {
  if (!raw) return [];

  const terms: FilterTerm[] = [];
  const seen = new Set<string>();
  for (const chunk of splitUnescaped(raw)) {
    const contains = chunk.startsWith(CONTAINS_PREFIX);
    const body = contains ? chunk.slice(CONTAINS_PREFIX.length) : chunk;
    const value = body.replace(/\\(.)/g, "$1").trim();
    if (!value) continue;
    const key = `${contains ? "~" : "="}${value.toUpperCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push({ value, contains });
  }
  return terms;
}

/** Encode terms back into a wire value. */
export function serializeTerms(terms: FilterTerm[]): string {
  return terms
    .filter((t) => t.value.trim())
    .map((t) => (t.contains ? CONTAINS_PREFIX : "") + escapeValue(t.value.trim()))
    .join(SEPARATOR);
}

/** Does this encoded value hold anything at all? */
export function hasTerms(raw: string | undefined | null): boolean {
  return parseFilterValue(raw).length > 0;
}

/** The first exact term - for the places that still need a single plain value. */
export function firstExactValue(raw: string | undefined | null): string {
  const terms = parseFilterValue(raw);
  return terms.find((t) => !t.contains)?.value ?? terms[0]?.value ?? "";
}
