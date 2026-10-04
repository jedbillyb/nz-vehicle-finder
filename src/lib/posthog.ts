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

export function captureEvent(event: string, properties: Properties = {}) {
  if (!isEnabled()) return;

  const payload = {
    api_key: POSTHOG_API_KEY,
    event,
    distinct_id: getDistinctId(),
    properties: {
      ...properties,
      $current_url: window.location.href,
      $pathname: window.location.pathname,
      $referrer: document.referrer || undefined,
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
