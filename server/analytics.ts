/**
 * Server-side PostHog events: the things the browser never sees, like paid API
 * calls, sign-ups and Stripe plan changes. Uses the same project key as the
 * site: `npm run server` loads .env.production (where the build reads
 * VITE_POSTHOG_API_KEY from) and then .env, which wins on any clash.
 *
 * People are identified as `user_<id>`, the same id the account page merges
 * the browser's anonymous id into, so site visits and API use line up. Their
 * email, name, plan and account facts go on the PostHog person (see
 * personProperties in accounts.ts) so they can be found by email there.
 */
import type { Request } from "express";
import { clientIp } from "./rateLimit.js";

const apiKey = process.env.POSTHOG_API_KEY || process.env.VITE_POSTHOG_API_KEY;
// Straight to PostHog, not VITE_POSTHOG_HOST: that is the /ph proxy on our own
// domain, which only exists to get browser events past ad blockers.
const host = (process.env.POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/+$/, "");

export const analyticsId = (userId: number) => `user_${userId}`;

/**
 * Who made this request: their real address (for PostHog's location lookup)
 * and browser, rather than this server's.
 */
export function requestContext(req: Request): Record<string, unknown> {
  const ip = clientIp(req);
  const ua = req.headers["user-agent"];
  return {
    ...(ip !== "unknown" && { $ip: ip }),
    ...(typeof ua === "string" && { $raw_user_agent: ua.slice(0, 500) }),
  };
}

/**
 * Fire and forget: analytics must never slow or break a request. Pass the
 * request when there is one, so the event gets the person's location and browser.
 */
export function track(event: string, distinctId: string, properties: Record<string, unknown> = {}, req?: Request) {
  if (!apiKey) return;
  // Without a request the only address PostHog sees is this server's, which says nothing about where the person is.
  const context = req ? requestContext(req) : { $geoip_disable: true };
  fetch(`${host}/capture/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      event,
      distinct_id: distinctId,
      properties: { ...properties, ...context, source: "server" },
    }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}
