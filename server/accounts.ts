/**
 * Accounts, API keys and usage metering for the paid API.
 *
 * Sign-in is by emailed magic link, so there are no passwords to store. A
 * session is an httpOnly cookie scoped to /api. API keys and every token are
 * stored only as SHA-256 hashes; the raw key is shown to its owner once.
 */
import Database from "better-sqlite3";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";
import express, { type Request, type Response, type NextFunction } from "express";
import { clientIp } from "./rateLimit.js";
import { isValidEmail } from "../shared/email.js";
import { BURST_PER_SECOND, MAX_KEYS_PER_ACCOUNT, TIERS, TIER_ORDER, tierFor, type Tier } from "../shared/apiTiers.js";
import { analyticsId, track } from "./analytics.js";
import {
  MAX_SAVED_QUERY_LENGTH, MAX_SAVED_SEARCHES, MAX_SAVED_SEARCH_NAME, canonicalQuery, describeSearch,
} from "../shared/savedSearch.js";

const LOGIN_TOKEN_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_COOKIE = "nzvf_session";
/** Wrong guesses allowed against one emailed code before it is burned. */
const MAX_CODE_ATTEMPTS = 5;
const KEY_PREFIX = "nzvf_";

export interface User {
  id: number;
  email: string;
  name: string | null;
  tier: string;
  created_at: string;
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
  /** Canonical query string, without the leading "?" - see shared/savedSearch.ts */
  query: string;
  created_at: string;
}

/** What Google's ID token says about who signed in. */
export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}

export interface AdminAccountRow {
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
}

export const MAX_NAME_LENGTH = 40;

export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
  return name || null;
}

export type UsageCheck =
  | { ok: true; user: User; tier: Tier; used: number; resetsAt: string }
  | { ok: false; status: 401 | 429; error: string; tier?: Tier; used?: number; resetsAt?: string };

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const token = () => randomBytes(32).toString("base64url");
const sixDigits = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
/** The code is hashed with its email so equal codes for two people never share a hash. */
const codeHash = (email: string, code: string) => sha256(`${email}:${code}`);

/** Usage is counted per calendar month in UTC. */
export function monthOf(date: Date): string {
  return date.toISOString().slice(0, 7);
}

export function nextMonthStart(date: Date): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)).toISOString();
}

export function normaliseEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (!isValidEmail(email)) return null;
  return email;
}

export class AccountStore {
  readonly db: InstanceType<typeof Database>;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        tier TEXT NOT NULL DEFAULT 'free',
        created_at TEXT NOT NULL,
        stripe_customer_id TEXT
      );
      CREATE TABLE IF NOT EXISTS login_tokens (
        token_hash TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        key_hash TEXT NOT NULL UNIQUE,
        prefix TEXT NOT NULL,
        name TEXT,
        created_at TEXT NOT NULL,
        last_used_at TEXT,
        revoked_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys (user_id);
      CREATE TABLE IF NOT EXISTS usage (
        user_id INTEGER NOT NULL REFERENCES users(id),
        month TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, month)
      );
      CREATE TABLE IF NOT EXISTS saved_searches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        name TEXT NOT NULL,
        query TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (user_id, query)
      );
    `);
    // Columns added after the first release; ALTER only what is missing.
    const columns = new Set((this.db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name));
    if (!columns.has("stripe_subscription_id")) this.db.exec("ALTER TABLE users ADD COLUMN stripe_subscription_id TEXT");
    if (!columns.has("subscription_status")) this.db.exec("ALTER TABLE users ADD COLUMN subscription_status TEXT");
    if (!columns.has("name")) this.db.exec("ALTER TABLE users ADD COLUMN name TEXT");
    if (!columns.has("google_sub")) this.db.exec("ALTER TABLE users ADD COLUMN google_sub TEXT");
    if (!columns.has("last_signin_at")) this.db.exec("ALTER TABLE users ADD COLUMN last_signin_at TEXT");
    this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users (google_sub)");
    this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stripe_customer ON users (stripe_customer_id)");
    const loginColumns = new Set((this.db.prepare("PRAGMA table_info(login_tokens)").all() as { name: string }[]).map((c) => c.name));
    if (!loginColumns.has("code_hash")) this.db.exec("ALTER TABLE login_tokens ADD COLUMN code_hash TEXT");
    if (!loginColumns.has("attempts")) this.db.exec("ALTER TABLE login_tokens ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0");
  }

  billingFor(userId: number): { stripeCustomerId: string | null; subscriptionId: string | null; subscriptionStatus: string | null } {
    const row = this.db.prepare(
      "SELECT stripe_customer_id, stripe_subscription_id, subscription_status FROM users WHERE id = ?"
    ).get(userId) as { stripe_customer_id: string | null; stripe_subscription_id: string | null; subscription_status: string | null } | undefined;
    return {
      stripeCustomerId: row?.stripe_customer_id ?? null,
      subscriptionId: row?.stripe_subscription_id ?? null,
      subscriptionStatus: row?.subscription_status ?? null,
    };
  }

  setStripeCustomer(userId: number, customerId: string) {
    this.db.prepare("UPDATE users SET stripe_customer_id = ? WHERE id = ?").run(customerId, userId);
  }

  userByStripeCustomer(customerId: string): User | null {
    return (this.db.prepare("SELECT id, email, name, tier, created_at FROM users WHERE stripe_customer_id = ?").get(customerId) as
      | User | undefined) ?? null;
  }

  setBilling(userId: number, b: { tier: string; subscriptionId: string | null; subscriptionStatus: string | null }) {
    this.db.prepare("UPDATE users SET tier = ?, stripe_subscription_id = ?, subscription_status = ? WHERE id = ?")
      .run(b.tier, b.subscriptionId, b.subscriptionStatus, userId);
  }

  /**
   * One sign-in email carries both a link and a 6-digit code; spending either
   * spends both. Only the newest request per email is valid, so a code can't
   * be guessed across several live ones.
   */
  createLogin(email: string, now = Date.now(), fixedCode?: string): { token: string; code: string } {
    const raw = token();
    const code = fixedCode ?? sixDigits();
    this.db.prepare("DELETE FROM login_tokens WHERE expires_at < ? OR email = ?").run(now, email);
    this.db.prepare("INSERT INTO login_tokens (token_hash, email, expires_at, code_hash) VALUES (?, ?, ?, ?)")
      .run(sha256(raw), email, now + LOGIN_TOKEN_TTL_MS, codeHash(email, code));
    return { token: raw, code };
  }

  /** How long ago the live sign-in code for this email was sent, or null if there isn't one. */
  loginAgeMs(email: string, now = Date.now()): number | null {
    const row = this.db.prepare("SELECT expires_at FROM login_tokens WHERE email = ? AND code_hash IS NOT NULL").get(email) as
      | { expires_at: number } | undefined;
    if (!row || row.expires_at < now) return null;
    return LOGIN_TOKEN_TTL_MS - (row.expires_at - now);
  }

  createLoginToken(email: string, now = Date.now()): string {
    return this.createLogin(email, now).token;
  }

  /** Spend a login link: one use only. Creates the account on first sign-in. */
  redeemLoginToken(raw: string, now = Date.now()): { user: User; session: string; created: boolean } | null {
    return this.db.transaction(() => {
      const hash = sha256(raw);
      const row = this.db.prepare("SELECT email, expires_at FROM login_tokens WHERE token_hash = ?").get(hash) as
        | { email: string; expires_at: number } | undefined;
      if (!row) return null;
      this.db.prepare("DELETE FROM login_tokens WHERE token_hash = ?").run(hash);
      if (row.expires_at < now) return null;
      return this.startSession(row.email, now);
    })();
  }

  /** Spend a 6-digit code typed by hand. A few wrong guesses burn it. */
  redeemLoginCode(email: string, code: string, now = Date.now()): { user: User; session: string; created: boolean } | null {
    return this.db.transaction(() => {
      const row = this.db.prepare("SELECT token_hash, expires_at, code_hash, attempts FROM login_tokens WHERE email = ?").get(email) as
        | { token_hash: string; expires_at: number; code_hash: string | null; attempts: number } | undefined;
      if (!row?.code_hash) return null;
      if (row.expires_at < now) {
        this.db.prepare("DELETE FROM login_tokens WHERE token_hash = ?").run(row.token_hash);
        return null;
      }
      const given = Buffer.from(codeHash(email, code));
      const expected = Buffer.from(row.code_hash);
      if (!/^\d{6}$/.test(code) || !timingSafeEqual(given, expected)) {
        if (row.attempts + 1 >= MAX_CODE_ATTEMPTS) {
          this.db.prepare("DELETE FROM login_tokens WHERE token_hash = ?").run(row.token_hash);
        } else {
          this.db.prepare("UPDATE login_tokens SET attempts = attempts + 1 WHERE token_hash = ?").run(row.token_hash);
        }
        return null;
      }
      this.db.prepare("DELETE FROM login_tokens WHERE token_hash = ?").run(row.token_hash);
      return this.startSession(email, now);
    })();
  }

  /**
   * Google and the emailed code land on the same account: a Google sign-in is
   * matched by Google's own account id first, then by email, which Google has
   * verified. The first match links the two, so a later change of address at
   * Google still finds this account.
   */
  signInWithGoogle(profile: GoogleProfile, now = Date.now()): { user: User; session: string; created: boolean } | null {
    return this.db.transaction(() => {
      const linked = this.db.prepare("SELECT email FROM users WHERE google_sub = ?").get(profile.sub) as { email: string } | undefined;
      if (linked) return this.startSession(linked.email, now, profile.name);
      const email = normaliseEmail(profile.email);
      if (!email || !profile.emailVerified) return null;
      const result = this.startSession(email, now, profile.name);
      this.db.prepare("UPDATE users SET google_sub = ? WHERE id = ? AND google_sub IS NULL").run(profile.sub, result.user.id);
      return result;
    })();
  }

  hasGoogle(userId: number): boolean {
    return !!(this.db.prepare("SELECT google_sub FROM users WHERE id = ?").get(userId) as { google_sub: string | null } | undefined)?.google_sub;
  }

  /** Signs the account out on every device. */
  endAllSessions(userId: number) {
    this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  }

  /** Removes the account and everything hanging off it. Billing must be dealt with first. */
  deleteAccount(userId: number) {
    this.db.transaction(() => {
      const row = this.db.prepare("SELECT email FROM users WHERE id = ?").get(userId) as { email: string } | undefined;
      if (!row) return;
      for (const table of ["sessions", "api_keys", "usage", "saved_searches"]) {
        this.db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId);
      }
      this.db.prepare("DELETE FROM login_tokens WHERE email = ?").run(row.email);
      this.db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    })();
  }

  setName(userId: number, name: string | null) {
    this.db.prepare("UPDATE users SET name = ? WHERE id = ?").run(name, userId);
  }

  /** Every account, newest first, with enough to see who is using what. */
  listAllAccounts(now = new Date()): AdminAccountRow[] {
    const rows = this.db.prepare(
      `SELECT u.id, u.email, u.name, u.tier, u.created_at, u.last_signin_at, u.google_sub IS NOT NULL AS google,
         u.subscription_status,
         (SELECT COUNT(*) FROM api_keys k WHERE k.user_id = u.id AND k.revoked_at IS NULL) AS keys,
         (SELECT COUNT(*) FROM saved_searches s WHERE s.user_id = u.id) AS searches,
         COALESCE((SELECT count FROM usage g WHERE g.user_id = u.id AND g.month = ?), 0) AS requests_this_month
       FROM users u ORDER BY u.id DESC`
    ).all(monthOf(now)) as (Omit<AdminAccountRow, "google"> & { google: number })[];
    return rows.map((r) => ({ ...r, google: !!r.google }));
  }

  /** Local development only: sign in with no email or code. */
  devSignIn(email: string, name: string | null, now = Date.now()) {
    return this.startSession(email, now, name);
  }

  /** `name` (from Google) only fills an empty name; it never replaces one the person typed. */
  private startSession(email: string, now: number, name: string | null = null): { user: User; session: string; created: boolean } {
    const created = this.db.prepare("INSERT OR IGNORE INTO users (email, created_at) VALUES (?, ?)")
      .run(email, new Date(now).toISOString()).changes > 0;
    this.db.prepare("UPDATE users SET last_signin_at = ?, name = COALESCE(name, ?) WHERE email = ?")
      .run(new Date(now).toISOString(), cleanName(name), email);
    const user = this.db.prepare("SELECT id, email, name, tier, created_at FROM users WHERE email = ?").get(email) as User;

    const session = token();
    this.db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
    this.db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
      .run(sha256(session), user.id, now + SESSION_TTL_MS);
    return { user, session, created };
  }

  userForSession(raw: string | undefined, now = Date.now()): User | null {
    if (!raw) return null;
    return (this.db.prepare(
      `SELECT u.id, u.email, u.name, u.tier, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at >= ?`
    ).get(sha256(raw), now) as User | undefined) ?? null;
  }

  endSession(raw: string | undefined) {
    if (raw) this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(raw));
  }

  listKeys(userId: number): ApiKeyInfo[] {
    return this.db.prepare(
      `SELECT id, name, prefix, created_at, last_used_at FROM api_keys
       WHERE user_id = ? AND revoked_at IS NULL ORDER BY id`
    ).all(userId) as ApiKeyInfo[];
  }

  /** Returns the raw key, which is never stored and cannot be shown again. */
  createKey(userId: number, name: string | null, now = new Date()): { key: string; info: ApiKeyInfo } | null {
    if (this.listKeys(userId).length >= MAX_KEYS_PER_ACCOUNT) return null;
    const key = KEY_PREFIX + token();
    const prefix = key.slice(0, KEY_PREFIX.length + 6);
    const result = this.db.prepare(
      "INSERT INTO api_keys (user_id, key_hash, prefix, name, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(userId, sha256(key), prefix, name, now.toISOString());
    return {
      key,
      info: { id: Number(result.lastInsertRowid), name, prefix, created_at: now.toISOString(), last_used_at: null },
    };
  }

  renameKey(userId: number, keyId: number, name: string | null): boolean {
    return this.db.prepare(
      "UPDATE api_keys SET name = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL"
    ).run(name, keyId, userId).changes > 0;
  }

  revokeKey(userId: number, keyId: number, now = new Date()): boolean {
    return this.db.prepare(
      "UPDATE api_keys SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL"
    ).run(now.toISOString(), keyId, userId).changes > 0;
  }

  listSearches(userId: number): SavedSearch[] {
    return this.db.prepare(
      "SELECT id, name, query, created_at FROM saved_searches WHERE user_id = ? ORDER BY id DESC"
    ).all(userId) as SavedSearch[];
  }

  /**
   * Saves a search, or returns the existing one if these exact filters are
   * already saved. "full" when the account is at the limit; "empty" when the
   * query sets no filter at all.
   */
  saveSearch(userId: number, rawQuery: string, rawName: string | null, now = new Date()): SavedSearch | "full" | "empty" {
    const query = canonicalQuery(rawQuery);
    if (!query) return "empty";
    const existing = this.db.prepare(
      "SELECT id, name, query, created_at FROM saved_searches WHERE user_id = ? AND query = ?"
    ).get(userId, query) as SavedSearch | undefined;
    if (existing) return existing;
    const count = (this.db.prepare("SELECT COUNT(*) AS n FROM saved_searches WHERE user_id = ?").get(userId) as { n: number }).n;
    if (count >= MAX_SAVED_SEARCHES) return "full";
    const name = rawName?.trim().slice(0, MAX_SAVED_SEARCH_NAME) || describeSearch(query);
    const result = this.db.prepare(
      "INSERT INTO saved_searches (user_id, name, query, created_at) VALUES (?, ?, ?, ?)"
    ).run(userId, name, query, now.toISOString());
    return { id: Number(result.lastInsertRowid), name, query, created_at: now.toISOString() };
  }

  renameSearch(userId: number, id: number, name: string): boolean {
    return this.db.prepare("UPDATE saved_searches SET name = ? WHERE id = ? AND user_id = ?")
      .run(name.trim().slice(0, MAX_SAVED_SEARCH_NAME), id, userId).changes > 0;
  }

  deleteSearch(userId: number, id: number): boolean {
    return this.db.prepare("DELETE FROM saved_searches WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
  }

  usageFor(userId: number, now = new Date()): number {
    const row = this.db.prepare("SELECT count FROM usage WHERE user_id = ? AND month = ?").get(userId, monthOf(now)) as
      | { count: number } | undefined;
    return row?.count ?? 0;
  }

  /**
   * Check a key against its account's monthly quota and count the request if
   * it is allowed. Refused requests are not counted.
   */
  useKey(rawKey: string | undefined, now = new Date()): UsageCheck {
    if (!rawKey || !rawKey.startsWith(KEY_PREFIX)) {
      return { ok: false, status: 401, error: "Missing or malformed API key. Send it as: Authorization: Bearer nzvf_..." };
    }
    const row = this.db.prepare(
      `SELECT k.id as key_id, u.id, u.email, u.name, u.tier, u.created_at FROM api_keys k JOIN users u ON u.id = k.user_id
       WHERE k.key_hash = ? AND k.revoked_at IS NULL`
    ).get(sha256(rawKey)) as (User & { key_id: number }) | undefined;
    if (!row) return { ok: false, status: 401, error: "Unknown or revoked API key" };

    const { key_id, ...user } = row;
    const tier = tierFor(user.tier);
    const month = monthOf(now);
    const resetsAt = nextMonthStart(now);

    return this.db.transaction((): UsageCheck => {
      const used = this.usageFor(user.id, now);
      if (used >= tier.monthlyRequests) {
        return {
          ok: false, status: 429, tier, used, resetsAt,
          error: `Monthly limit of ${tier.monthlyRequests.toLocaleString("en-NZ")} requests reached for the ${tier.name} plan. Upgrade at https://vehiclefinder.co.nz/account`,
        };
      }
      this.db.prepare(
        `INSERT INTO usage (user_id, month, count) VALUES (?, ?, 1)
         ON CONFLICT (user_id, month) DO UPDATE SET count = count + 1`
      ).run(user.id, month);
      this.db.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").run(now.toISOString(), key_id);
      return { ok: true, user, tier, used: used + 1, resetsAt };
    })();
  }
}

/**
 * Fixed one-second windows per key; enough to stop one client hogging the
 * synchronous database. Checked before the quota so a throttled request is
 * not billed.
 */
function burstLimiter(perSecond: number) {
  const windows = new Map<string, { second: number; count: number }>();
  return (key: string): boolean => {
    const second = Math.floor(Date.now() / 1000);
    const w = windows.get(key);
    if (!w || w.second !== second) {
      if (windows.size > 10_000) windows.clear();
      windows.set(key, { second, count: 1 });
      return true;
    }
    w.count++;
    return w.count <= perSecond;
  };
}

/** Small in-memory limiter for the sign-in form, so it can't be used to spam inboxes. */
/** Asked for the name step on every sign-in, for testing it on the live site. */
const NAME_STEP_TEST_EMAILS = ["hello@jedbillyb.com"];

function attemptLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  const allow = (key: string): boolean => {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    if (hits.size > 10_000) hits.clear();
    hits.set(key, recent);
    return true;
  };
  /** Clears a key's count, for when what it guarded has been used up. */
  const forget = (key: string) => { hits.delete(key); };
  return Object.assign(allow, { forget });
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

function apiKeyFrom(req: Request): string | undefined {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length).trim();
  const header = req.headers["x-api-key"];
  return typeof header === "string" ? header.trim() : undefined;
}

export interface AccountsOptions {
  sendLoginEmail: (email: string, link: string, code: string) => Promise<void>;
  publicUrl: string;
  billingEnabled: boolean;
  /** Google sign-in is offered only when both are set. */
  google?: { clientId: string; clientSecret: string } | null;
  /** Emails that see the list of every account on their account page. */
  adminEmails?: string[];
  /** Local development only: one-click sign-in as a test account. Never on in production. */
  devLogin?: boolean;
}

const OAUTH_COOKIE = "nzvf_oauth";

/**
 * The ID token comes straight from Google's token endpoint over TLS, so its
 * signature needn't be checked again (OpenID Connect Core 3.1.3.7); the
 * audience, issuer and expiry still are.
 */
export function profileFromIdToken(idToken: string, clientId: string, now = Date.now()): GoogleProfile | null {
  try {
    const claims = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
    if (claims.aud !== clientId) return null;
    if (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") return null;
    if (typeof claims.exp !== "number" || claims.exp * 1000 < now) return null;
    if (typeof claims.sub !== "string" || typeof claims.email !== "string") return null;
    return {
      sub: claims.sub,
      email: claims.email,
      emailVerified: claims.email_verified === true || claims.email_verified === "true",
      // Only the first name is kept; full names are more than the site needs.
      name: typeof claims.given_name === "string" ? claims.given_name : null,
    };
  } catch {
    return null;
  }
}

/** `secure` is off only for a plain-http local server, which a phone reaches by its wifi address. */
function setSessionCookie(res: Response, session: string, secure: boolean) {
  res.cookie(SESSION_COOKIE, session, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/api",
    maxAge: SESSION_TTL_MS,
  });
}

/** A paid plan picked before signing in, carried through the sign-in so checkout can follow. */
function paidPlanFrom(raw: unknown): string | null {
  return typeof raw === "string" && Object.prototype.hasOwnProperty.call(TIERS, raw) && raw !== "free" ? raw : null;
}

/** The sign-in code for every email when DEV_LOGIN is on (localhost only). */
const DEV_LOGIN_CODE = "123456";
/** test.vehiclefinder.co.nz only (its nginx marks the requests, the live site's
 *  strips the mark): two throwaway accounts that sign in with a fixed code and
 *  no email. test1 never keeps a name, so it always gets the sign-up step;
 *  test2 has one and goes straight in. */
const TEST_SITE_LOGINS: Record<string, string | null> = { test1: null, test2: "Test" };
const TEST_SITE_CODE = "000000";

export function createAccounts(store: AccountStore, opts: AccountsOptions) {
  const secureCookies = !opts.publicUrl.startsWith("http://");
  const admins = new Set((opts.adminEmails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean));
  const router = express.Router();
  const perIp = attemptLimiter(5, 15 * 60 * 1000);
  const perEmail = attemptLimiter(1, 60 * 1000);
  // Each code also burns after a few misses; this stops one IP cycling through codes.
  const codeGuesses = attemptLimiter(20, 15 * 60 * 1000);
  const burst = burstLimiter(BURST_PER_SECOND);

  const sessionUser = (req: Request) => store.userForSession(readCookie(req, SESSION_COOKIE));
  const loginEmail = (raw: unknown) => normaliseEmail(raw);
  // Local dev counts as the test site, so the test logins work there too.
  const onTestSite = (req: Request) => !!opts.devLogin || req.get("x-vf-site") === "test";
  const testSiteLogin = (req: Request, raw: unknown) => {
    const name = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    return onTestSite(req) && Object.hasOwn(TEST_SITE_LOGINS, name) ? name : null;
  };

  router.post("/auth/request-link", async (req, res) => {
    if (testSiteLogin(req, req.body?.email)) return res.json({ ok: true });
    const email = loginEmail(req.body?.email);
    if (!email) return res.status(400).json({ error: "Enter a valid email address" });
    // Asked again within a minute (Back, then the same email): the code already
    // sent still works, so say so instead of sending another or refusing.
    const age = opts.devLogin ? null : store.loginAgeMs(email);
    if (age !== null && age < 60 * 1000) return res.json({ ok: true, reused: true });
    // Local dev: no rate limit and a fixed code, so onboarding can be retested quickly.
    if (!opts.devLogin && !perIp(clientIp(req))) {
      return res.status(429).json({ error: "Too many sign-in attempts. Wait a few minutes and try again." });
    }
    if (!opts.devLogin && !perEmail(email)) {
      return res.status(429).json({ error: "We emailed you a code less than a minute ago. Use that one, or wait a minute for a new one." });
    }
    const { token: raw, code } = store.createLogin(email, undefined, opts.devLogin ? DEV_LOGIN_CODE : undefined);
    // A paid plan picked before signing up rides along in the link, so the
    // account page can go straight to checkout even on another device.
    const plan = paidPlanFrom(req.body?.plan);
    try {
      await opts.sendLoginEmail(email, `${opts.publicUrl}/account?token=${raw}${plan ? `&plan=${plan}` : ""}`, code);
    } catch (err) {
      console.error("Login email failed:", (err as Error).message);
      track("signin_link_failed", "server", { reason: "email_send" });
      return res.status(502).json({ error: "Could not send the sign-in email. Try again shortly." });
    }
    track("signin_link_sent", "server", { plan: plan ?? "free" });
    res.json({ ok: true });
  });

  router.post("/auth/verify", (req, res) => {
    const raw = typeof req.body?.token === "string" ? req.body.token : "";
    const email = loginEmail(req.body?.email);
    const code = typeof req.body?.code === "string" ? req.body.code.replace(/\s/g, "") : "";
    const byCode = !raw && !!email && !!code;
    if (byCode && !opts.devLogin && !codeGuesses(clientIp(req))) {
      return res.status(429).json({ error: "Too many wrong codes. Wait a few minutes and try again." });
    }
    const tester = testSiteLogin(req, req.body?.email);
    if (tester) {
      if (code !== TEST_SITE_CODE) return res.status(400).json({ error: "That code is wrong. Test accounts use 000000." });
      const result = store.devSignIn(`${tester}@test.vehiclefinder.co.nz`, TEST_SITE_LOGINS[tester]);
      if (TEST_SITE_LOGINS[tester] === null) store.setName(result.user.id, null);
      setSessionCookie(res, result.session, secureCookies);
      return res.json({ ok: true });
    }
    const result = raw ? store.redeemLoginToken(raw) : byCode ? store.redeemLoginCode(email, code) : null;
    if (!result) {
      track("signin_link_rejected", "server", { method: byCode ? "code" : "link" });
      return res.status(400).json({
        error: byCode
          ? "That code is wrong or has expired. Check the latest email, or send a new one."
          : "This sign-in link has expired or was already used.",
      });
    }
    // The code is used up, so signing out and back in straight away may send a
    // new one: the once-a-minute limit is there to stop repeat emails, not this.
    perEmail.forget(result.user.email);
    // Local dev, and the owner's test address in production: forget the name on
    // every sign-in, so the name step can be retested with one email.
    if (opts.devLogin || NAME_STEP_TEST_EMAILS.includes(result.user.email)) store.setName(result.user.id, null);
    const id = analyticsId(result.user.id);
    if (result.created) track("account_created", id, { $set_once: { signed_up_at: result.user.created_at } });
    track("signed_in", id, { method: byCode ? "code" : "link", new_account: result.created, $set: { tier: result.user.tier } });
    setSessionCookie(res, result.session, secureCookies);
    res.json({ ok: true });
  });

  router.get("/auth/options", (req, res) => {
    res.json({ google: !!opts.google, devLogin: !!opts.devLogin, testLogin: onTestSite(req) });
  });

  if (opts.devLogin) {
    router.post("/auth/dev-login", (req, res) => {
      const admin = req.body?.as === "admin";
      const result = store.devSignIn(admin ? "admin@dev.local" : "test@dev.local", admin ? "Admin" : "Tester");
      setSessionCookie(res, result.session, secureCookies);
      res.json({ ok: true });
    });
    // Clears the signed-in account's name, so the name step and its hand-off can be replayed.
    router.post("/auth/dev-forget-name", (req, res) => {
      const user = sessionUser(req);
      if (!user) return res.status(401).json({ error: "Not signed in" });
      store.setName(user.id, null);
      res.json({ ok: true });
    });
  }

  router.get("/auth/google", (req, res) => {
    if (!opts.google) return res.redirect(`${opts.publicUrl}/account`);
    const state = token();
    const plan = paidPlanFrom(req.query.plan);
    res.cookie(OAUTH_COOKIE, `${state}.${plan ?? ""}`, {
      httpOnly: true, secure: true, sameSite: "lax", path: "/api/auth/google", maxAge: 10 * 60 * 1000,
    });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: opts.google.clientId,
      redirect_uri: `${opts.publicUrl}/api/auth/google/callback`,
      response_type: "code",
      scope: "openid email profile",
      state,
      prompt: "select_account",
    }).toString();
    res.redirect(url.toString());
  });

  router.get("/auth/google/callback", async (req, res) => {
    const [expectedState, plan] = (readCookie(req, OAUTH_COOKIE) ?? "").split(".");
    res.clearCookie(OAUTH_COOKIE, { path: "/api/auth/google" });
    const fail = (reason: string) => {
      track("signin_google_failed", "server", { reason });
      res.redirect(`${opts.publicUrl}/account?signin=google_failed`);
    };
    if (!opts.google) return fail("disabled");
    // Cancelled on Google's screen, or a forged/replayed callback.
    if (typeof req.query.code !== "string") return fail(typeof req.query.error === "string" ? req.query.error : "no_code");
    if (!expectedState || req.query.state !== expectedState) return fail("state");

    let profile: GoogleProfile | null = null;
    try {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: req.query.code,
          client_id: opts.google.clientId,
          client_secret: opts.google.clientSecret,
          redirect_uri: `${opts.publicUrl}/api/auth/google/callback`,
          grant_type: "authorization_code",
        }),
      });
      const body = await response.json() as { id_token?: string };
      if (body.id_token) profile = profileFromIdToken(body.id_token, opts.google.clientId);
    } catch (err) {
      console.error("Google token exchange failed:", (err as Error).message);
    }
    if (!profile) return fail("token");
    const result = store.signInWithGoogle(profile);
    if (!result) return fail("unverified_email");

    const id = analyticsId(result.user.id);
    if (result.created) track("account_created", id, { $set_once: { signed_up_at: result.user.created_at } });
    track("signed_in", id, { method: "google", new_account: result.created, $set: { tier: result.user.tier } });
    setSessionCookie(res, result.session, secureCookies);
    res.redirect(`${opts.publicUrl}/account${plan ? `?plan=${plan}` : ""}`);
  });

  router.post("/auth/logout", (req, res) => {
    store.endSession(readCookie(req, SESSION_COOKIE));
    res.clearCookie(SESSION_COOKIE, { path: "/api" });
    res.json({ ok: true });
  });

  router.post("/auth/logout-all", (req, res) => {
    const user = sessionUser(req);
    if (!user) return res.status(401).json({ error: "Not signed in" });
    store.endAllSessions(user.id);
    track("signed_out_everywhere", analyticsId(user.id));
    res.clearCookie(SESSION_COOKIE, { path: "/api" });
    res.json({ ok: true });
  });

  router.delete("/account", (req, res) => {
    const user = sessionUser(req);
    if (!user) return res.status(401).json({ error: "Not signed in" });
    // A live subscription would keep charging an account that no longer exists.
    const { subscriptionId, subscriptionStatus } = store.billingFor(user.id);
    if (subscriptionId && subscriptionStatus !== "canceled") {
      return res.status(409).json({ error: "Cancel your paid plan in Manage billing first, then delete the account." });
    }
    if (normaliseEmail(req.body?.confirmEmail) !== user.email) {
      return res.status(400).json({ error: "Type your email address to confirm." });
    }
    store.deleteAccount(user.id);
    track("account_deleted", analyticsId(user.id), { tier: user.tier });
    res.clearCookie(SESSION_COOKIE, { path: "/api" });
    res.json({ ok: true });
  });

  router.get("/account", (req, res) => {
    const user = sessionUser(req);
    if (!user) return res.status(401).json({ error: "Not signed in" });
    const tier = tierFor(user.tier);
    const now = new Date();
    res.json({
      email: user.email,
      name: user.name,
      google: store.hasGoogle(user.id),
      isAdmin: admins.has(user.email),
      analyticsId: analyticsId(user.id),
      tier,
      tiers: TIER_ORDER.map((id) => TIERS[id]),
      usage: { used: store.usageFor(user.id, now), limit: tier.monthlyRequests, resetsAt: nextMonthStart(now) },
      keys: store.listKeys(user.id),
      searches: store.listSearches(user.id),
      billing: {
        enabled: opts.billingEnabled,
        subscribed: !!store.billingFor(user.id).subscriptionId,
        status: store.billingFor(user.id).subscriptionStatus,
      },
    });
  });

  router.patch("/account", (req, res) => {
    const user = sessionUser(req);
    if (!user) return res.status(401).json({ error: "Not signed in" });
    const name = cleanName(req.body?.name);
    if (!name) return res.status(400).json({ error: "Enter your name" });
    store.setName(user.id, name);
    track("name_set", analyticsId(user.id), { first_time: !user.name, $set: { name } });
    res.json({ ok: true, name });
  });

  router.get("/admin/accounts", (req, res) => {
    const user = sessionUser(req);
    if (!user) return res.status(401).json({ error: "Not signed in" });
    if (!admins.has(user.email)) return res.status(404).json({ error: "Not found" });
    res.json({ accounts: store.listAllAccounts() });
  });

  const keyNameFrom = (req: Request) =>
    typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 60) || null : null;

  router.post("/account/keys", (req, res) => {
    const user = sessionUser(req);
    if (!user) return res.status(401).json({ error: "Not signed in" });
    const created = store.createKey(user.id, keyNameFrom(req));
    if (!created) return res.status(400).json({ error: `You can have at most ${MAX_KEYS_PER_ACCOUNT} active keys. Revoke one first.` });
    res.json(created);
  });

  router.patch("/account/keys/:id", (req, res) => {
    const user = sessionUser(req);
    if (!user) return res.status(401).json({ error: "Not signed in" });
    const ok = store.renameKey(user.id, Number(req.params.id), keyNameFrom(req));
    if (!ok) return res.status(404).json({ error: "Key not found" });
    res.json({ ok: true });
  });

  router.delete("/account/keys/:id", (req, res) => {
    const user = sessionUser(req);
    if (!user) return res.status(401).json({ error: "Not signed in" });
    const ok = store.revokeKey(user.id, Number(req.params.id));
    if (!ok) return res.status(404).json({ error: "Key not found" });
    res.json({ ok: true });
  });

  // --- Saved searches ---

  router.get("/account/searches", (req, res) => {
    const user = sessionUser(req);
    if (!user) return res.status(401).json({ error: "Not signed in" });
    res.json({ searches: store.listSearches(user.id) });
  });

  router.post("/account/searches", (req, res) => {
    const user = sessionUser(req);
    if (!user) return res.status(401).json({ error: "Not signed in" });
    const query = typeof req.body?.query === "string" ? req.body.query : "";
    if (query.length > MAX_SAVED_QUERY_LENGTH) return res.status(400).json({ error: "That search is too long to save" });
    const name = typeof req.body?.name === "string" ? req.body.name : null;
    const saved = store.saveSearch(user.id, query, name);
    if (saved === "empty") return res.status(400).json({ error: "Set at least one filter before saving a search" });
    if (saved === "full") {
      return res.status(400).json({ error: `You can save up to ${MAX_SAVED_SEARCHES} searches. Delete one first.` });
    }
    res.json(saved);
  });

  router.patch("/account/searches/:id", (req, res) => {
    const user = sessionUser(req);
    if (!user) return res.status(401).json({ error: "Not signed in" });
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) return res.status(400).json({ error: "Give the search a name" });
    if (!store.renameSearch(user.id, Number(req.params.id), name)) return res.status(404).json({ error: "Search not found" });
    res.json({ ok: true });
  });

  router.delete("/account/searches/:id", (req, res) => {
    const user = sessionUser(req);
    if (!user) return res.status(401).json({ error: "Not signed in" });
    if (!store.deleteSearch(user.id, Number(req.params.id))) return res.status(404).json({ error: "Search not found" });
    res.json({ ok: true });
  });

  /** Guards /api/v1: valid key, under the monthly quota, under the burst rate. */
  function requireApiKey(req: Request, res: Response, next: NextFunction) {
    const key = apiKeyFrom(req);
    if (key && !burst(key)) {
      track("api_v1_rejected", "server", { reason: "burst", endpoint: req.path });
      return res.status(429).json({ error: `Slow down: at most ${BURST_PER_SECOND} requests per second.` });
    }
    const check = store.useKey(key);
    if (check.tier) res.setHeader("X-RateLimit-Limit", String(check.tier.monthlyRequests));
    if (check.resetsAt) res.setHeader("X-RateLimit-Reset", check.resetsAt);
    if (check.ok === false) {
      track("api_v1_rejected", "server", { reason: check.status === 429 ? "quota" : "bad_key", endpoint: req.path, tier: check.tier?.id });
      if (check.status === 429) res.setHeader("X-RateLimit-Remaining", "0");
      return res.status(check.status).json({ error: check.error });
    }
    res.setHeader("X-RateLimit-Remaining", String(Math.max(check.tier.monthlyRequests - check.used, 0)));
    // Shared handlers apply the free-site caps unless this is set.
    res.locals.apiUser = check.user;
    const started = Date.now();
    res.on("finish", () =>
      track("api_v1_request", analyticsId(check.user.id), {
        endpoint: req.path,
        status: res.statusCode,
        duration_ms: Date.now() - started,
        tier: check.tier.id,
        used_this_month: check.used,
        monthly_limit: check.tier.monthlyRequests,
      }),
    );
    next();
  }

  return { router, requireApiKey, sessionUser };
}
