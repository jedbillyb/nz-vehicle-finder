import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { toast } from "sonner";
import { captureEvent } from "@/lib/posthog";
import { sharePage } from "@/lib/share";

/** "Share this page" for the hero of the fleet and stats pages; see sharePage. */
export function ShareButton({ source, style }: { source: string; style?: React.CSSProperties }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const result = await sharePage(source);
    if (result === "native" || result === "copy") captureEvent("share_clicked", { method: result, source });
    if (result === "copy") {
      setCopied(true);
      toast("Link copied", { description: "Paste it anywhere to share this page." });
      setTimeout(() => setCopied(false), 1500);
    } else if (result === "failed") {
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
