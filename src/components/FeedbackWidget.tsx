import { useState, useEffect } from "react";
import { MessageSquare, X, Star } from "lucide-react";
import { toast } from "sonner";
import { captureEvent } from "@/lib/posthog";
import { API_BASE } from "@/lib/vehicleApi";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isMobile;
}

function getDistinctId(): string {
  const key = "nzvf_posthog_distinct_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isMobile = useIsMobile();

  const pagePath = window.location.pathname;

  const handleOpen = () => {
    setOpen(true);
    captureEvent("feedback_widget_opened", { page_path: pagePath });
  };

  const handleClose = () => {
    captureEvent("feedback_dismissed", { page_path: pagePath, rating_selected: rating > 0 });
    setOpen(false);
    setRating(0);
    setHovered(0);
    setComment("");
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      toast("Please select a rating first");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          comment: comment.trim() || null,
          page_path: pagePath,
          distinct_id: getDistinctId(),
        }),
      });
      if (!res.ok) throw new Error("Request failed");
      captureEvent("feedback_submitted", { rating, has_comment: comment.trim().length > 0, page_path: pagePath });
      toast("Thanks for your feedback!");
      setOpen(false);
      setRating(0);
      setHovered(0);
      setComment("");
    } catch {
      toast.error("Couldn't send feedback", { description: "Please try again later." });
    } finally {
      setSubmitting(false);
    }
  };

  const displayRating = hovered || rating;

  // On mobile, sit above the breakdown button (which is ~60px from bottom)
  const btnBottom = isMobile ? 80 : 24;
  const btnRight = isMobile ? 12 : 24;

  return (
    <>
      <button
        onClick={handleOpen}
        aria-label="Give feedback"
        style={{
          position: "fixed",
          bottom: btnBottom,
          right: btnRight,
          zIndex: 35,
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "7px 13px",
          background: "rgba(15, 23, 42, 0.88)",
          color: "#e2e8f0",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 999,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.1em",
          cursor: "pointer",
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
          backdropFilter: "blur(12px)",
          boxShadow: "0 2px 12px rgba(15,23,42,0.18)",
          transition: "background 0.15s ease, color 0.15s ease",
          textTransform: "uppercase",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(15,23,42,1)";
          (e.currentTarget as HTMLButtonElement).style.color = "#ffffff";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(15,23,42,0.88)";
          (e.currentTarget as HTMLButtonElement).style.color = "#e2e8f0";
        }}
      >
        <MessageSquare size={11} />
        Feedback
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            onClick={handleClose}
            style={{
              position: "fixed", inset: 0,
              background: "rgba(0,0,0,0.35)",
              zIndex: 50,
              backdropFilter: "blur(2px)",
            }}
          />

          {/* Modal */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              zIndex: 51,
              ...(isMobile
                ? { left: 16, right: 16, bottom: 16 }
                : { bottom: 80, right: 24, width: 296 }),
              background: "#ffffff",
              borderRadius: 14,
              border: "1px solid #e5e7eb",
              boxShadow: "0 20px 50px rgba(15,23,42,0.16), 0 4px 12px rgba(15,23,42,0.08)",
              fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 16px 12px",
              borderBottom: "1px solid #f1f5f9",
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.01em" }}>
                  How's the site?
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>
                  Your feedback helps improve Vehicle Finder
                </div>
              </div>
              <button
                onClick={handleClose}
                style={{
                  background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6,
                  cursor: "pointer", color: "#94a3b8", padding: "4px 5px",
                  display: "flex", alignItems: "center", flexShrink: 0, marginLeft: 8,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#475569"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#94a3b8"; }}
              >
                <X size={13} />
              </button>
            </div>

            {/* Stars */}
            <div style={{ padding: "16px 16px 12px" }}>
              <div style={{ display: "flex", gap: 4, marginBottom: 14, justifyContent: "center" }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onMouseEnter={() => setHovered(n)}
                    onMouseLeave={() => setHovered(0)}
                    onClick={() => setRating(n)}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      padding: "4px 3px", display: "flex", alignItems: "center",
                      transform: n <= displayRating ? "scale(1.12)" : "scale(1)",
                      transition: "transform 0.1s ease",
                    }}
                  >
                    <Star
                      size={28}
                      fill={n <= displayRating ? "#f59e0b" : "none"}
                      stroke={n <= displayRating ? "#f59e0b" : "#cbd5e1"}
                    />
                  </button>
                ))}
              </div>

              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Any comments? (optional)"
                maxLength={1000}
                rows={3}
                style={{
                  width: "100%",
                  resize: "none",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  padding: "9px 11px",
                  fontSize: 12,
                  color: "#374151",
                  fontFamily: "inherit",
                  outline: "none",
                  boxSizing: "border-box",
                  lineHeight: 1.6,
                  background: "#f8fafc",
                  transition: "border-color 0.15s ease, background 0.15s ease",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#0ea5e9";
                  e.currentTarget.style.background = "#ffffff";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#e2e8f0";
                  e.currentTarget.style.background = "#f8fafc";
                }}
              />
            </div>

            {/* Submit */}
            <div style={{ padding: "0 16px 16px", display: "flex", gap: 8 }}>
              <button
                onClick={handleClose}
                style={{
                  flex: "0 0 auto",
                  padding: "9px 14px",
                  background: "transparent",
                  color: "#64748b",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  letterSpacing: "0.02em",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#94a3b8"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#e2e8f0"; }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || rating === 0}
                style={{
                  flex: 1,
                  padding: "9px 0",
                  background: rating === 0 ? "#f1f5f9" : submitting ? "#7dd3fc" : "#0ea5e9",
                  color: rating === 0 ? "#94a3b8" : "#ffffff",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  cursor: rating === 0 || submitting ? "default" : "pointer",
                  fontFamily: "inherit",
                  transition: "background 0.15s ease",
                }}
              >
                {submitting ? "Sending..." : "Send feedback"}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
