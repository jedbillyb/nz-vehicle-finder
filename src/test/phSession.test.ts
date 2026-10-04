import { beforeEach, describe, expect, it } from "vitest";
import { sessionId, uuidv7 } from "@/lib/posthog";

describe("uuidv7", () => {
  it("is a version 7 UUID that starts with the timestamp", () => {
    const id = uuidv7(Date.UTC(2026, 9, 4));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(parseInt(id.replace(/-/g, "").slice(0, 12), 16)).toBe(Date.UTC(2026, 9, 4));
  });
});

describe("sessionId", () => {
  beforeEach(() => window.localStorage.clear());
  const t0 = Date.UTC(2026, 9, 4, 9);

  it("keeps the session while events keep coming", () => {
    const a = sessionId(t0);
    expect(sessionId(t0 + 20 * 60_000)).toBe(a);
    expect(sessionId(t0 + 40 * 60_000)).toBe(a); // 20 min after the last event
  });

  it("starts a new session after 30 idle minutes", () => {
    const a = sessionId(t0);
    expect(sessionId(t0 + 31 * 60_000)).not.toBe(a);
  });

  it("starts a new session after 24 hours however busy", () => {
    const a = sessionId(t0);
    let t = t0;
    while (t < t0 + 24 * 3_600_000) sessionId((t += 20 * 60_000));
    expect(sessionId(t + 60_000)).not.toBe(a);
  });
});
