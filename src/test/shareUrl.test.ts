import { describe, expect, it } from "vitest";
import { shareUrl } from "@/lib/posthog";

describe("shareUrl", () => {
  it("adds UTM tags and keeps the page's own query", () => {
    window.history.pushState(null, "", "/stats/toyota?MAKE=TOYOTA");
    const url = new URL(shareUrl("share_button", "stats_page"));
    expect(url.pathname).toBe("/stats/toyota");
    expect(url.searchParams.get("MAKE")).toBe("TOYOTA");
    expect(url.searchParams.get("utm_source")).toBe("share_button");
    expect(url.searchParams.get("utm_medium")).toBe("share");
    expect(url.searchParams.get("utm_campaign")).toBe("stats_page");
  });

  it("replaces UTM tags the visitor arrived with", () => {
    window.history.pushState(null, "", "/?MAKE=MG&utm_source=reddit&utm_campaign=old&utm_term=x");
    const url = new URL(shareUrl("copy_link"));
    expect(url.searchParams.get("utm_source")).toBe("copy_link");
    expect(url.searchParams.has("utm_campaign")).toBe(false);
    expect(url.searchParams.has("utm_term")).toBe(false);
    expect(url.searchParams.get("MAKE")).toBe("MG");
  });
});
