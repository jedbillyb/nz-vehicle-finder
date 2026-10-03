import { describe, expect, it } from "vitest";
import { isValidEmail } from "../../shared/email";

describe("isValidEmail", () => {
  it.each(["jed@example.com", "a.b+tag@mail.co.nz", "x_y@sub.domain.io", "  padded@example.org  "])("accepts %s", (e) => {
    expect(isValidEmail(e)).toBe(true);
  });

  it.each(["", "plain", "no-at.example.com", "a@b", "a@b.c", "a@@b.com", "a b@c.com", "a@b..com", ".a@b.com", "a..b@c.com", "a@-b.com", "a@b.com.", "a@b.c0m"])("rejects %s", (e) => {
    expect(isValidEmail(e)).toBe(false);
  });
});
