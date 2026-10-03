/**
 * Paid API plans. The server enforces monthlyRequests; the account and docs
 * pages show the same table, so the numbers live here once.
 */
export type TierId = "free" | "starter" | "pro";

export interface Tier {
  id: TierId;
  name: string;
  priceNzd: number;
  monthlyRequests: number;
}

export const TIERS: Record<TierId, Tier> = {
  free: { id: "free", name: "Free", priceNzd: 0, monthlyRequests: 500 },
  starter: { id: "starter", name: "Starter", priceNzd: 9, monthlyRequests: 10_000 },
  pro: { id: "pro", name: "Pro", priceNzd: 29, monthlyRequests: 100_000 },
};

export const TIER_ORDER: TierId[] = ["free", "starter", "pro"];

export function tierFor(id: string | null | undefined): Tier {
  return TIERS[id as TierId] ?? TIERS.free;
}

/** Requests per second one API key may make, on top of the monthly quota. */
export const BURST_PER_SECOND = 5;

export const MAX_KEYS_PER_ACCOUNT = 5;
