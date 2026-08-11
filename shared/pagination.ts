/** Results-per-page options, shared so the UI selector and the API clamp agree. */
export const PAGE_SIZE_OPTIONS = [50, 100, 200, 500] as const;
export const DEFAULT_PAGE_SIZE = 50;
export const MIN_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 500;

export function clampPageSize(value: number | string | null | undefined): number {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(n, MIN_PAGE_SIZE), MAX_PAGE_SIZE);
}
