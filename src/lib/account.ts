import type { Tier } from "../../shared/apiTiers";

/**
 * Account calls go to a relative /api path, never API_BASE: the session is an
 * httpOnly cookie, which only works same-origin. In development Vite proxies
 * /api to the local server.
 */
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.error || `Request failed (${res.status})`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return body as T;
}

export interface ApiKeyInfo {
  id: number;
  name: string | null;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
}

export interface Account {
  email: string;
  tier: Tier;
  tiers: Tier[];
  usage: { used: number; limit: number; resetsAt: string };
  keys: ApiKeyInfo[];
  billing: { enabled: boolean; subscribed: boolean; status: string | null };
}

export const requestSignInLink = (email: string) =>
  call<{ ok: true }>("/api/auth/request-link", { method: "POST", body: JSON.stringify({ email }) });

export const verifySignInToken = (token: string) =>
  call<{ ok: true }>("/api/auth/verify", { method: "POST", body: JSON.stringify({ token }) });

export const signOut = () => call<{ ok: true }>("/api/auth/logout", { method: "POST" });

/** Resolves to null when nobody is signed in. */
export async function fetchAccount(): Promise<Account | null> {
  try {
    return await call<Account>("/api/account");
  } catch (err) {
    if ((err as { status?: number }).status === 401) return null;
    throw err;
  }
}

export const createApiKey = (name: string) =>
  call<{ key: string; info: ApiKeyInfo }>("/api/account/keys", { method: "POST", body: JSON.stringify({ name }) });

export const revokeApiKey = (id: number) => call<{ ok: true }>(`/api/account/keys/${id}`, { method: "DELETE" });

/** Both return a Stripe-hosted page to send the browser to. */
export const startCheckout = (tier: string) =>
  call<{ url: string }>("/api/billing/checkout", { method: "POST", body: JSON.stringify({ tier }) });

export const openBillingPortal = () => call<{ url: string }>("/api/billing/portal", { method: "POST" });

export const syncBilling = () => call<{ ok: true }>("/api/billing/sync", { method: "POST" });
