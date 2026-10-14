import { API_BASE } from "@/lib/vehicleApi";
import { currentDistinctId } from "@/lib/posthog";

export interface ContactPayload {
  name?: string;
  email: string;
  message: string;
  topic?: string;
}

function body(payload: ContactPayload) {
  return JSON.stringify({
    ...payload,
    page_path: typeof window !== "undefined" ? window.location.pathname : undefined,
    distinct_id: currentDistinctId(),
  });
}

/** Sends a contact message. Throws with the server's reason on a 4xx. */
export async function submitContact(payload: ContactPayload): Promise<void> {
  const res = await fetch(`${API_BASE}/api/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || "Could not send your message. Please try again.");
  }
}

/**
 * Keeps an abandoned draft so a lead is captured even if the form is never
 * sent. Fire-and-forget: a failure here must never interrupt typing.
 */
export function saveContactDraft(payload: ContactPayload): void {
  try {
    fetch(`${API_BASE}/api/contact/partial`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Never let lead-capture break the form.
  }
}
