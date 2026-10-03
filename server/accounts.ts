/**
 * Accounts, API keys and usage metering for the paid API.
 *
 * Sign-in is by emailed magic link, so there are no passwords to store. A
 * session is an httpOnly cookie scoped to /api. API keys and every token are
 * stored only as SHA-256 hashes; the raw key is shown to its owner once.
 */
import Database from "better-sqlite3";
import { createHash, randomBytes } from "crypto";
import express, { type Request, type Response, type NextFunction } from "express";
import { clientIp } from "./rateLimit.js";
import { isValidEmail } from "../shared/email.js";
import { BURST_PER_SECOND, MAX_KEYS_PER_ACCOUNT, TIERS, TIER_ORDER, tierFor, type Tier } from "../shared/apiTiers.js";

const LOGIN_TOKEN_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_COOKIE = "nzvf_session";
const KEY_PREFIX = "nzvf_";

export interface User {
  id: number;
  email: string;
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

export type UsageCheck =
  | { ok: true; user: User; tier: Tier; used: number; resetsAt: string }
  | { ok: false; status: 401 | 429; error: string; tier?: Tier; used?: number; resetsAt?: string };

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const token = () => randomBytes(32).toString("base64url");

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
    `);
    // Columns added after the first release; ALTER only what is missing.
    const columns = new Set((this.db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name));
    if (!columns.has("stripe_subscription_id")) this.db.exec("ALTER TABLE users ADD COLUMN stripe_subscription_id TEXT");
    if (!columns.has("subscription_status")) this.db.exec("ALTER TABLE users ADD COLUMN subscription_status TEXT");
    this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stripe_customer ON users (stripe_customer_id)");
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
    return (this.db.prepare("SELECT id, email, tier, created_at FROM users WHERE stripe_customer_id = ?").get(customerId) as
      | User | undefined) ?? null;
  }

  setBilling(userId: number, b: { tier: string; subscriptionId: string | null; subscriptionStatus: string | null }) {
    this.db.prepare("UPDATE users SET tier = ?, stripe_subscription_id = ?, subscription_status = ? WHERE id = ?")
      .run(b.tier, b.subscriptionId, b.subscriptionStatus, userId);
  }

  createLoginToken(email: string, now = Date.now()): string {
    const raw = token();
    this.db.prepare("DELETE FROM login_tokens WHERE expires_at < ?").run(now);
    this.db.prepare("INSERT INTO login_tokens (token_hash, email, expires_at) VALUES (?, ?, ?)")
      .run(sha256(raw), email, now + LOGIN_TOKEN_TTL_MS);
    return raw;
  }

  /** Spend a login token: one use only. Creates the account on first sign-in. */
  redeemLoginToken(raw: string, now = Date.now()): { user: User; session: string } | null {
    return this.db.transaction(() => {
      const hash = sha256(raw);
      const row = this.db.prepare("SELECT email, expires_at FROM login_tokens WHERE token_hash = ?").get(hash) as
        | { email: string; expires_at: number } | undefined;
      if (!row) return null;
      this.db.prepare("DELETE FROM login_tokens WHERE token_hash = ?").run(hash);
      if (row.expires_at < now) return null;

      this.db.prepare("INSERT OR IGNORE INTO users (email, created_at) VALUES (?, ?)")
        .run(row.email, new Date(now).toISOString());
      const user = this.db.prepare("SELECT id, email, tier, created_at FROM users WHERE email = ?").get(row.email) as User;

      const session = token();
      this.db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
      this.db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
        .run(sha256(session), user.id, now + SESSION_TTL_MS);
      return { user, session };
    })();
  }

  userForSession(raw: string | undefined, now = Date.now()): User | null {
    if (!raw) return null;
    return (this.db.prepare(
      `SELECT u.id, u.email, u.tier, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id
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
      `SELECT k.id as key_id, u.id, u.email, u.tier, u.created_at FROM api_keys k JOIN users u ON u.id = k.user_id
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
function attemptLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
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
  sendLoginEmail: (email: string, link: string) => Promise<void>;
  publicUrl: string;
  billingEnabled: boolean;
}

export function createAccounts(store: AccountStore, opts: AccountsOptions) {
  const router = express.Router();
  const perIp = attemptLimiter(5, 15 * 60 * 1000);
  const perEmail = attemptLimiter(1, 60 * 1000);
  const burst = burstLimiter(BURST_PER_SECOND);

  const sessionUser = (req: Request) => store.userForSession(readCookie(req, SESSION_COOKIE));

  router.post("/auth/request-link", async (req, res) => {
    const email = normaliseEmail(req.body?.email);
    if (!email) return res.status(400).json({ error: "Enter a valid email address" });
    if (!perIp(clientIp(req)) || !perEmail(email)) {
      return res.status(429).json({ error: "Too many sign-in attempts. Wait a minute and try again." });
    }
    const raw = store.createLoginToken(email);
    try {
      await opts.sendLoginEmail(email, `${opts.publicUrl}/account?token=${raw}`);
    } catch (err) {
      console.error("Login email failed:", (err as Error).message);
      return res.status(502).json({ error: "Could not send the sign-in email. Try again shortly." });
    }
    res.json({ ok: true });
  });

  router.post("/auth/verify", (req, res) => {
    const raw = typeof req.body?.token === "string" ? req.body.token : "";
    const result = raw ? store.redeemLoginToken(raw) : null;
    if (!result) return res.status(400).json({ error: "This sign-in link has expired or was already used." });
    res.cookie(SESSION_COOKIE, result.session, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/api",
      maxAge: SESSION_TTL_MS,
    });
    res.json({ ok: true });
  });

  router.post("/auth/logout", (req, res) => {
    store.endSession(readCookie(req, SESSION_COOKIE));
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
      tier,
      tiers: TIER_ORDER.map((id) => TIERS[id]),
      usage: { used: store.usageFor(user.id, now), limit: tier.monthlyRequests, resetsAt: nextMonthStart(now) },
      keys: store.listKeys(user.id),
      billing: {
        enabled: opts.billingEnabled,
        subscribed: !!store.billingFor(user.id).subscriptionId,
        status: store.billingFor(user.id).subscriptionStatus,
      },
    });
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

  /** Guards /api/v1: valid key, under the monthly quota, under the burst rate. */
  function requireApiKey(req: Request, res: Response, next: NextFunction) {
    const key = apiKeyFrom(req);
    if (key && !burst(key)) {
      return res.status(429).json({ error: `Slow down: at most ${BURST_PER_SECOND} requests per second.` });
    }
    const check = store.useKey(key);
    if (check.tier) res.setHeader("X-RateLimit-Limit", String(check.tier.monthlyRequests));
    if (check.resetsAt) res.setHeader("X-RateLimit-Reset", check.resetsAt);
    if (check.ok === false) {
      if (check.status === 429) res.setHeader("X-RateLimit-Remaining", "0");
      return res.status(check.status).json({ error: check.error });
    }
    res.setHeader("X-RateLimit-Remaining", String(Math.max(check.tier.monthlyRequests - check.used, 0)));
    // Shared handlers apply the free-site caps unless this is set.
    res.locals.apiUser = check.user;
    next();
  }

  return { router, requireApiKey, sessionUser };
}
