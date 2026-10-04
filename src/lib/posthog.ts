type Properties = Record<string, unknown>;

const POSTHOG_API_KEY = import.meta.env.VITE_POSTHOG_API_KEY as string | undefined;
const POSTHOG_HOST =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined)?.replace(/\/+$/, "") || "https://us.i.posthog.com";
const STORAGE_KEY = "nzvf_posthog_distinct_id";

function isEnabled() {
  return Boolean(POSTHOG_API_KEY) && typeof window !== "undefined" && typeof document !== "undefined";
}

function getDistinctId() {
  if (typeof window === "undefined") return "server";

  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;

    const next =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `nzvf_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;

    window.localStorage.setItem(STORAGE_KEY, next);
    return next;
  } catch {
    return `nzvf_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
  }
}

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
const ATTRIBUTION_KEY = "nzvf_attribution";

/**
 * Where this visit came from: the UTM tags on the landing URL (posthog-js reads
 * these for you; this hand-rolled client has to do it itself) plus the external
 * referrer. Read once when the page first loads, because the search page
 * rewrites the URL afterwards, and kept for the tab so every event in the visit
 * carries it.
 */
function readAttribution(): Properties {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const fromUrl: Properties = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key)?.trim();
    if (value) fromUrl[`$${key}`] = value.slice(0, 200);
  }
  try {
    if (Object.keys(fromUrl).length) {
      window.sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(fromUrl));
      return fromUrl;
    }
    return JSON.parse(window.sessionStorage.getItem(ATTRIBUTION_KEY) || "{}") as Properties;
  } catch {
    return fromUrl;
  }
}

function referringDomain(): string | undefined {
  try {
    const host = document.referrer ? new URL(document.referrer).hostname : "";
    return host && host !== window.location.hostname ? host : undefined;
  } catch {
    return undefined;
  }
}

const attribution = readAttribution();
const referrerDomain = typeof document === "undefined" ? undefined : referringDomain();

/** Person properties recording the first source we ever saw for this person. */
function initialAttribution(): Properties {
  const initial: Properties = {};
  for (const [key, value] of Object.entries(attribution)) initial[`$initial_${key.slice(1)}`] = value;
  if (referrerDomain) initial.$initial_referring_domain = referrerDomain;
  return initial;
}

/**
 * This page's address with UTM tags for sharing, so a visit from a shared link
 * says where it came from even when the app it was pasted into strips the referrer.
 * Any UTM tags already on the URL are replaced.
 */
export function shareUrl(source: string, campaign?: string): string {
  const url = new URL(window.location.href);
  for (const key of UTM_KEYS) url.searchParams.delete(key);
  url.searchParams.set("utm_source", source);
  url.searchParams.set("utm_medium", "share");
  if (campaign) url.searchParams.set("utm_campaign", campaign);
  return url.toString();
}

export function captureEvent(event: string, properties: Properties = {}) {
  if (!isEnabled()) return;

  const payload = {
    api_key: POSTHOG_API_KEY,
    event,
    distinct_id: getDistinctId(),
    properties: {
      ...attribution,
      ...properties,
      $current_url: window.location.href,
      $pathname: window.location.pathname,
      $referrer: document.referrer || undefined,
      $referring_domain: referrerDomain,
      $set_once: initialAttribution(),
    },
  };

  const body = JSON.stringify(payload);
  const url = `${POSTHOG_HOST}/capture/`;

  if (navigator.sendBeacon) {
    navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
    return;
  }

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
    mode: "cors",
  }).catch(() => {
    // Analytics should never block the UI.
  });
}

/**
 * Link this browser to a signed-in account. PostHog merges the anonymous id's
 * history into `id` (the server's `user_<id>`, which also tags API calls), and
 * later events from this browser use `id` directly.
 */
export function identifyUser(id: string, properties: Properties = {}) {
  if (!isEnabled()) return;
  const anon = getDistinctId();
  if (anon === id) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    return; // Without storage every event is anonymous anyway.
  }
  // Sent as the new id, naming the anonymous id to merge in.
  captureEvent("$identify", { $anon_distinct_id: anon, $set: properties });
}

/** After sign-out, start a fresh anonymous id so the next person on this browser is not merged in. */
export function resetUser() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored, nothing to reset.
  }
}

export function summarizeFilters(filters: Record<string, string | undefined>) {
  const active = Object.entries(filters).reduce<Record<string, string>>((acc, [key, value]) => {
    const next = value?.trim();
    if (next) acc[key] = next;
    return acc;
  }, {});

  return {
    active_filter_count: Object.keys(active).length,
    active_filter_keys: Object.keys(active),
    active_filters: active,
    search_query: Object.entries(active)
      .map(([key, value]) => `${key}=${value}`)
      .join(" | "),
  };
}
