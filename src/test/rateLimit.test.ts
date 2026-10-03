// @vitest-environment node
import { describe, it, expect } from "vitest";
import { windowCounter } from "../../server/rateLimit";

describe("windowCounter", () => {
  it("allows up to the limit in a window, then refuses", () => {
    const allow = windowCounter(3, 60_000);
    const t = 1_000_000;
    expect([allow("a", t), allow("a", t), allow("a", t), allow("a", t)]).toEqual([true, true, true, false]);
  });

  it("counts each client separately", () => {
    const allow = windowCounter(1, 60_000);
    expect(allow("a", 0)).toBe(true);
    expect(allow("b", 0)).toBe(true);
    expect(allow("a", 0)).toBe(false);
  });

  it("starts a fresh window once the old one has passed", () => {
    const allow = windowCounter(1, 60_000);
    expect(allow("a", 0)).toBe(true);
    expect(allow("a", 59_999)).toBe(false);
    expect(allow("a", 60_000)).toBe(true);
  });
});
