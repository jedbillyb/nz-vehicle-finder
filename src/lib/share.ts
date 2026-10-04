import { shareUrl } from "@/lib/posthog";

export type ShareResult = "native" | "copy" | "cancelled" | "failed";

/**
 * Shares this page with UTM tags baked in (utm_source=share_button), so visits
 * from the link are attributed even when Messenger, WhatsApp and the like strip
 * the referrer. Phones get the native share sheet; elsewhere the link is copied.
 */
export async function sharePage(campaign: string): Promise<ShareResult> {
  const url = shareUrl("share_button", campaign);
  if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
    try {
      await navigator.share({ title: document.title, url });
      return "native";
    } catch {
      return "cancelled"; // Closing the share sheet throws; nothing was shared.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copy";
  } catch {
    return "failed";
  }
}
