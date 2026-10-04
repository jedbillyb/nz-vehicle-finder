import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { toast } from "sonner";
import { captureEvent, shareUrl } from "@/lib/posthog";

/**
 * Shares this page with UTM tags baked in (utm_source=share_button), so visits
 * from the shared link are attributed even when Messenger, WhatsApp and the like
 * strip the referrer. Phones get the native share sheet; elsewhere it copies.
 */
export function ShareButton({ source, style }: { source: string; style?: React.CSSProperties }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = shareUrl("share_button", source);
    if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title: document.title, url });
        captureEvent("share_clicked", { method: "native", source });
      } catch {
        // Closing the share sheet throws; nothing was shared.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      captureEvent("share_clicked", { method: "copy", source });
      setCopied(true);
      toast("Link copied", { description: "Paste it anywhere to share this page." });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast("Couldn't copy the link", { description: "Copy it from the address bar instead." });
    }
  };

  return (
    <button
      type="button"
      onClick={share}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 13, fontWeight: 600,
        color: copied ? "#15803d" : "#374151", border: `1px solid ${copied ? "#86efac" : "#e5e7eb"}`,
        background: copied ? "#f0fdf4" : "#ffffff", borderRadius: 10, padding: "9px 18px", cursor: "pointer",
        fontFamily: "inherit", ...style,
      }}
    >
      {copied ? <Check size={14} /> : <Share2 size={14} />}
      {copied ? "Link copied" : "Share this page"}
    </button>
  );
}
