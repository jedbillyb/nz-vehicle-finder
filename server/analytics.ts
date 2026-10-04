/**
 * Server-side PostHog events: the things the browser never sees, like paid API
 * calls, sign-ups and Stripe plan changes. Uses the same project key as the
 * site (the server starts with --env-file .env, which holds VITE_POSTHOG_API_KEY).
 *
 * People are identified as `user_<id>`, the same id the account page merges
 * the browser's anonymous id into, so site visits and API use line up.
 * No email addresses are sent.
 */
const apiKey = process.env.POSTHOG_API_KEY || process.env.VITE_POSTHOG_API_KEY;
const host = (process.env.POSTHOG_HOST || process.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/+$/, "");

export const analyticsId = (userId: number) => `user_${userId}`;

/** Fire and forget: analytics must never slow or break a request. */
export function track(event: string, distinctId: string, properties: Record<string, unknown> = {}) {
  if (!apiKey) return;
  fetch(`${host}/capture/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      event,
      distinct_id: distinctId,
      properties: { ...properties, source: "server" },
    }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}
