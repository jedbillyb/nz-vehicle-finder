type Properties = Record<string, unknown>;

const POSTHOG_API_KEY = import.meta.env.VITE_POSTHOG_API_KEY as string | undefined;
const POSTHOG_HOST =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined)?.replace(/\/+$/, "") || "https://us.i.posthog.com";
const STORAGE_KEY = "nzvf_posthog_distinct_id";

function isEnabled() {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  if (!POSTHOG_API_KEY) return false;

  const host = window.location.hostname;
  // Only track on the real site or localhost (for your own testing)
  return host === "vehiclefinder.co.nz" || host === "localhost" || host === "127.0.0.1";
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
