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

export interface SavedSearch {
  id: number;
  name: string;
  /** Canonical query string without "?", ready to append to "/?" */
  query: string;
  created_at: string;
}

export interface Account {
  email: string;
  /** PostHog distinct id for this account (`user_<id>`), shared with the server's API events. */
  analyticsId: string;
  tier: Tier;
  tiers: Tier[];
  usage: { used: number; limit: number; resetsAt: string };
  keys: ApiKeyInfo[];
  searches: SavedSearch[];
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

export const renameApiKey = (id: number, name: string) =>
  call<{ ok: true }>(`/api/account/keys/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });

export const revokeApiKey = (id: number) => call<{ ok: true }>(`/api/account/keys/${id}`, { method: "DELETE" });

/** Both return a Stripe-hosted page to send the browser to. */
export const startCheckout = (tier: string) =>
  call<{ url: string }>("/api/billing/checkout", { method: "POST", body: JSON.stringify({ tier }) });

export const openBillingPortal = () => call<{ url: string }>("/api/billing/portal", { method: "POST" });

export const syncBilling = () => call<{ ok: true }>("/api/billing/sync", { method: "POST" });

/** Resolves to null when nobody is signed in. */
export async function fetchSavedSearches(): Promise<SavedSearch[] | null> {
  try {
    return (await call<{ searches: SavedSearch[] }>("/api/account/searches")).searches;
  } catch (err) {
    if ((err as { status?: number }).status === 401) return null;
    throw err;
  }
}

export const saveSearch = (query: string, name?: string) =>
  call<SavedSearch>("/api/account/searches", { method: "POST", body: JSON.stringify({ query, name }) });

export const renameSavedSearch = (id: number, name: string) =>
  call<{ ok: true }>(`/api/account/searches/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });

export const deleteSavedSearch = (id: number) => call<{ ok: true }>(`/api/account/searches/${id}`, { method: "DELETE" });

/**
 * A search someone tried to save while signed out. It waits in this browser
 * and is saved as soon as they finish signing in on the account page.
 */
const PENDING_SAVE_KEY = "nzvf.pendingSavedSearch";

export function setPendingSave(query: string) {
  try { localStorage.setItem(PENDING_SAVE_KEY, query); } catch { /* storage blocked: they can save again after signing in */ }
}

export function takePendingSave(): string | null {
  try {
    const query = localStorage.getItem(PENDING_SAVE_KEY);
    localStorage.removeItem(PENDING_SAVE_KEY);
    return query;
  } catch {
    return null;
  }
}

export function hasPendingSave(): boolean {
  try { return !!localStorage.getItem(PENDING_SAVE_KEY); } catch { return false; }
}
