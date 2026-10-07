import { TIERS, type Tier, type TierId } from "../../shared/apiTiers";

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
  /** Asked for after the first sign-in; filled from Google when that's how they signed in. */
  name: string | null;
  /** A Google account is linked; the emailed code always works too. */
  google: boolean;
  /** Sees every account on the account page (ADMIN_EMAILS on the server). */
  isAdmin: boolean;
  /** PostHog distinct id for this account (`user_<id>`), shared with the server's API events. */
  analyticsId: string;
  tier: Tier;
  tiers: Tier[];
  usage: { used: number; limit: number; resetsAt: string };
  keys: ApiKeyInfo[];
  searches: SavedSearch[];
  billing: { enabled: boolean; subscribed: boolean; status: string | null };
}

/** `plan` is a paid plan picked before signing up; the emailed link carries it to checkout. */
/** `reused`: a code sent within the last minute still works, so no new email went out. */
export const requestSignInLink = (email: string, plan?: TierId) =>
  call<{ ok: true; reused?: boolean }>("/api/auth/request-link", { method: "POST", body: JSON.stringify({ email, plan }) });

export const verifySignInToken = (token: string) =>
  call<{ ok: true }>("/api/auth/verify", { method: "POST", body: JSON.stringify({ token }) });

/** The 6-digit code from the same email, typed into the tab that asked for it. */
export const verifySignInCode = (email: string, code: string) =>
  call<{ ok: true }>("/api/auth/verify", { method: "POST", body: JSON.stringify({ email, code }) });

export const setAccountName = (name: string) =>
  call<{ ok: true; name: string }>("/api/account", { method: "PATCH", body: JSON.stringify({ name }) });

/** Which sign-in methods the server has turned on. */
export type AuthOptions = { google: boolean; devLogin?: boolean; testLogin?: boolean };
export const fetchAuthOptions = () => call<AuthOptions>("/api/auth/options");

/** Local development only: the server answers 404 unless DEV_LOGIN is on. */
export const devSignIn = (as: "user" | "admin") =>
  call<{ ok: true }>("/api/auth/dev-login", { method: "POST", body: JSON.stringify({ as }) });

/** Local development only: forget the account's name so the name step shows again. */
export const devForgetName = () => call<{ ok: true }>("/api/auth/dev-forget-name", { method: "POST" });

/** A full-page navigation, not a fetch: Google's consent screen can't load in the background. */
export const googleSignInUrl = (plan?: TierId) => `/api/auth/google${plan ? `?plan=${plan}` : ""}`;

export interface AdminAccount {
  id: number;
  email: string;
  name: string | null;
  tier: string;
  created_at: string;
  last_signin_at: string | null;
  google: boolean;
  subscription_status: string | null;
  keys: number;
  searches: number;
  requests_this_month: number;
  requests_last_month: number;
  requests_total: number;
  last_api_use: string | null;
  sessions: number;
  stripe_customer_id: string | null;
  /** One per line: each key's name (or prefix), revoked ones marked. */
  key_list: string | null;
  /** One per line: each saved search's name. */
  search_list: string | null;
}

export const fetchAdminAccounts = () => call<{ accounts: AdminAccount[] }>("/api/admin/accounts");

export const signOutEverywhere = () => call<{ ok: true }>("/api/auth/logout-all", { method: "POST" });

export const deleteAccount = (confirmEmail: string) =>
  call<{ ok: true }>("/api/account", { method: "DELETE", body: JSON.stringify({ confirmEmail }) });

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

/** A plan id from a URL or storage, if it names a paid plan. */
export function paidPlan(id: string | null | undefined): TierId | null {
  return id && Object.prototype.hasOwnProperty.call(TIERS, id) && id !== "free" ? (id as TierId) : null;
}

/**
 * A paid plan picked before signing in. Kept in this browser as well as in the
 * emailed link, so checkout follows sign-in either way.
 */
const PENDING_PLAN_KEY = "nzvf.pendingPlan";

export function setPendingPlan(plan: TierId | null) {
  try {
    if (plan && plan !== "free") localStorage.setItem(PENDING_PLAN_KEY, plan);
    else localStorage.removeItem(PENDING_PLAN_KEY);
  } catch { /* storage blocked: the link still carries the plan */ }
}

export function takePendingPlan(): TierId | null {
  try {
    const plan = localStorage.getItem(PENDING_PLAN_KEY);
    localStorage.removeItem(PENDING_PLAN_KEY);
    return paidPlan(plan);
  } catch {
    return null;
  }
}
