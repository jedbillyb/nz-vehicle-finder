/**
 * Per-client limits for the free site endpoints (/api/*, not /api/v1).
 *
 * The free endpoints exist to serve the website, not other people's apps;
 * those should use the paid API. These limits sit well above what a person
 * clicking around the site generates, and well below what a scraper needs.
 */
import type { Request, Response, NextFunction } from "express";

/**
 * The site sits behind Cloudflare and then nginx, so the socket address is
 * always loopback. Cloudflare passes the real client address in this header.
 */
export function clientIp(req: Request): string {
  const cf = req.headers["cf-connecting-ip"];
  return (typeof cf === "string" && cf) || req.ip || "unknown";
}

/** Fixed-window counter per key. Cheap enough to run on every request. */
export function windowCounter(max: number, windowMs: number) {
  const windows = new Map<string, { start: number; count: number }>();
  return (key: string, now = Date.now()): boolean => {
    const w = windows.get(key);
    if (!w || now - w.start >= windowMs) {
      if (windows.size > 50_000) windows.clear();
      windows.set(key, { start: now, count: 1 });
      return true;
    }
    w.count++;
    return w.count <= max;
  };
}

/** Express middleware: at most `max` requests per IP per `windowMs`. */
export function limitPerIp(max: number, windowMs: number) {
  const allow = windowCounter(max, windowMs);
  return (req: Request, res: Response, next: NextFunction) => {
    if (allow(clientIp(req))) return next();
    res.setHeader("Retry-After", String(Math.ceil(windowMs / 1000)));
    res.status(429).json({
      error: "Too many requests. Slow down, or use the API for programmatic access: https://vehiclefinder.co.nz/developers",
    });
  };
}

/**
 * Free site search shows at most this many results deep. Paging further is
 * what a scraper does, not a person, and a deep OFFSET is also the slowest
 * query the site runs.
 */
export const FREE_MAX_RESULT_DEPTH = 10_000;
