// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { AccountStore, monthOf, nextMonthStart, normaliseEmail } from "../../server/accounts";
import { MAX_KEYS_PER_ACCOUNT, TIERS } from "../../shared/apiTiers";

let store: AccountStore;

function signIn(email = "dealer@example.co.nz") {
  const token = store.createLoginToken(email);
  const result = store.redeemLoginToken(token);
  if (!result) throw new Error("sign-in failed");
  return result;
}

beforeEach(() => {
  store = new AccountStore(":memory:");
});

describe("sign-in codes", () => {
  it("signs in with the emailed code, once", () => {
    const { code } = store.createLogin("a@b.nz");
    expect(code).toMatch(/^\d{6}$/);
    expect(store.redeemLoginCode("a@b.nz", code)?.user.email).toBe("a@b.nz");
    expect(store.redeemLoginCode("a@b.nz", code)).toBeNull();
  });

  it("spending the code also spends the link, and the other way round", () => {
    const first = store.createLogin("a@b.nz");
    expect(store.redeemLoginCode("a@b.nz", first.code)).not.toBeNull();
    expect(store.redeemLoginToken(first.token)).toBeNull();
    const second = store.createLogin("a@b.nz");
    expect(store.redeemLoginToken(second.token)).not.toBeNull();
    expect(store.redeemLoginCode("a@b.nz", second.code)).toBeNull();
  });

  it("only works for the email it was sent to", () => {
    const { code } = store.createLogin("a@b.nz");
    expect(store.redeemLoginCode("c@d.nz", code)).toBeNull();
  });

  it("burns the code after five wrong guesses", () => {
    const { code } = store.createLogin("a@b.nz");
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expect(store.redeemLoginCode("a@b.nz", wrong)).toBeNull();
    expect(store.redeemLoginCode("a@b.nz", code)).toBeNull();
  });

  it("allows a typo or two", () => {
    const { code } = store.createLogin("a@b.nz");
    const wrong = code === "000000" ? "111111" : "000000";
    store.redeemLoginCode("a@b.nz", wrong);
    store.redeemLoginCode("a@b.nz", wrong);
    expect(store.redeemLoginCode("a@b.nz", code)).not.toBeNull();
  });

  it("expires after 15 minutes", () => {
    const issued = Date.now();
    const { code } = store.createLogin("a@b.nz", issued);
    expect(store.redeemLoginCode("a@b.nz", code, issued + 16 * 60 * 1000)).toBeNull();
  });

  it("only the newest request is valid", () => {
    const old = store.createLogin("a@b.nz");
    const fresh = store.createLogin("a@b.nz");
    expect(store.redeemLoginToken(old.token)).toBeNull();
    expect(store.redeemLoginCode("a@b.nz", fresh.code)).not.toBeNull();
  });
});

describe("sign-in links", () => {
  it("creates the account on first use and a session that resolves to it", () => {
    const { user, session } = signIn();
    expect(user.tier).toBe("free");
    expect(store.userForSession(session)?.email).toBe("dealer@example.co.nz");
  });

  it("works only once", () => {
    const token = store.createLoginToken("a@b.nz");
    expect(store.redeemLoginToken(token)).not.toBeNull();
    expect(store.redeemLoginToken(token)).toBeNull();
  });

  it("expires after 15 minutes", () => {
    const issued = Date.now();
    const token = store.createLoginToken("a@b.nz", issued);
    expect(store.redeemLoginToken(token, issued + 16 * 60 * 1000)).toBeNull();
  });

  it("signs the same email into the same account", () => {
    expect(signIn("a@b.nz").user.id).toBe(signIn("a@b.nz").user.id);
  });

  it("ends a session on logout", () => {
    const { session } = signIn();
    store.endSession(session);
    expect(store.userForSession(session)).toBeNull();
  });
});

describe("API keys", () => {
  it("accepts a new key and counts each request", () => {
    const { user } = signIn();
    const { key } = store.createKey(user.id, "test")!;
    const first = store.useKey(key);
    expect(first.ok).toBe(true);
    store.useKey(key);
    expect(store.usageFor(user.id)).toBe(2);
  });

  it("stores only a hash, never the key", () => {
    const { user } = signIn();
    const { key } = store.createKey(user.id, null)!;
    const dump = JSON.stringify(store.db.prepare("SELECT * FROM api_keys").all());
    expect(dump).not.toContain(key);
  });

  it("rejects missing, unknown and revoked keys", () => {
    const { user } = signIn();
    const { key, info } = store.createKey(user.id, null)!;
    expect(store.useKey(undefined)).toMatchObject({ ok: false, status: 401 });
    expect(store.useKey("nzvf_nope")).toMatchObject({ ok: false, status: 401 });
    store.revokeKey(user.id, info.id);
    expect(store.useKey(key)).toMatchObject({ ok: false, status: 401 });
  });

  it("does not let one account revoke another's key", () => {
    const owner = signIn("owner@x.nz").user;
    const other = signIn("other@x.nz").user;
    const { info } = store.createKey(owner.id, null)!;
    expect(store.revokeKey(other.id, info.id)).toBe(false);
  });

  it("renames a key, but only for its owner", () => {
    const owner = signIn("owner@x.nz").user;
    const other = signIn("other@x.nz").user;
    const { info } = store.createKey(owner.id, "old")!;
    expect(store.renameKey(other.id, info.id, "stolen")).toBe(false);
    expect(store.renameKey(owner.id, info.id, "Production")).toBe(true);
    expect(store.listKeys(owner.id)[0].name).toBe("Production");
  });

  it(`caps an account at ${MAX_KEYS_PER_ACCOUNT} active keys`, () => {
    const { user } = signIn();
    for (let i = 0; i < MAX_KEYS_PER_ACCOUNT; i++) expect(store.createKey(user.id, null)).not.toBeNull();
    expect(store.createKey(user.id, null)).toBeNull();
  });
});

describe("monthly quota", () => {
  it("refuses with 429 once the plan's limit is used, without counting the refusal", () => {
    const { user } = signIn();
    const { key } = store.createKey(user.id, null)!;
    const now = new Date();
    store.db.prepare("INSERT INTO usage (user_id, month, count) VALUES (?, ?, ?)")
      .run(user.id, monthOf(now), TIERS.free.monthlyRequests);
    expect(store.useKey(key, now)).toMatchObject({ ok: false, status: 429 });
    expect(store.usageFor(user.id, now)).toBe(TIERS.free.monthlyRequests);
  });

  it("starts again next month", () => {
    const { user } = signIn();
    const { key } = store.createKey(user.id, null)!;
    const sept = new Date("2026-09-15T00:00:00Z");
    store.db.prepare("INSERT INTO usage (user_id, month, count) VALUES (?, ?, ?)")
      .run(user.id, monthOf(sept), TIERS.free.monthlyRequests);
    expect(store.useKey(key, new Date("2026-10-01T00:00:01Z")).ok).toBe(true);
  });

  it("follows the account's tier", () => {
    const { user } = signIn();
    const { key } = store.createKey(user.id, null)!;
    store.db.prepare("UPDATE users SET tier = 'starter' WHERE id = ?").run(user.id);
    const check = store.useKey(key);
    expect(check.ok && check.tier.monthlyRequests).toBe(TIERS.starter.monthlyRequests);
  });
});

describe("helpers", () => {
  it("normalises emails and rejects junk", () => {
    expect(normaliseEmail("  Jed@Example.CO.NZ ")).toBe("jed@example.co.nz");
    expect(normaliseEmail("not-an-email")).toBeNull();
    expect(normaliseEmail(42)).toBeNull();
  });

  it("resets at the start of the next UTC month", () => {
    expect(nextMonthStart(new Date("2026-12-20T10:00:00Z"))).toBe("2027-01-01T00:00:00.000Z");
  });
});
