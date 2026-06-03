import { useState } from "react";
import { MessageSquare, X, Star } from "lucide-react";
import { toast } from "sonner";
import { captureEvent } from "@/lib/posthog";

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE_URL?.replace(/\/+$/, "") || "http://localhost:3001";

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

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={handleOpen}
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          zIndex: 40,
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 14px",
          background: "rgba(15, 23, 42, 0.92)",
          color: "#ffffff",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.08em",
          cursor: "pointer",
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
          backdropFilter: "blur(10px)",
          boxShadow: "0 4px 14px rgba(15,23,42,0.2)",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(15,23,42,1)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(15,23,42,0.92)"; }}
      >
        <MessageSquare size={12} />
        Feedback
      </button>

      {/* Modal overlay */}
      {open && (
        <>
          <div
            onClick={handleClose}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, backdropFilter: "blur(2px)" }}
          />
          <div
            style={{
              position: "fixed",
              bottom: 72,
              right: 20,
              zIndex: 51,
              width: 300,
              background: "#ffffff",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              boxShadow: "0 16px 40px rgba(15,23,42,0.18)",
              fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 10px", borderBottom: "1px solid #f3f4f6" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.01em" }}>How's the site?</span>
              <button
                onClick={handleClose}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 2, display: "flex", alignItems: "center" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#4b5563"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#9ca3af"; }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Stars */}
            <div style={{ padding: "14px 16px 10px" }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 14, justifyContent: "center" }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onMouseEnter={() => setHovered(n)}
                    onMouseLeave={() => setHovered(0)}
                    onClick={() => setRating(n)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex", alignItems: "center" }}
                  >
                    <Star
                      size={26}
                      fill={n <= displayRating ? "#f59e0b" : "none"}
                      stroke={n <= displayRating ? "#f59e0b" : "#d1d5db"}
                      style={{ transition: "all 0.1s ease" }}
                    />
                  </button>
                ))}
              </div>

              {/* Comment */}
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Anything else? (optional)"
                maxLength={1000}
                rows={3}
                style={{
                  width: "100%",
                  resize: "none",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 12,
                  color: "#374151",
                  fontFamily: "inherit",
                  outline: "none",
                  boxSizing: "border-box",
                  lineHeight: 1.5,
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "#0ea5e9"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; }}
              />
            </div>

            {/* Submit */}
            <div style={{ padding: "0 16px 14px" }}>
              <button
                onClick={handleSubmit}
                disabled={submitting || rating === 0}
                style={{
                  width: "100%",
                  padding: "9px 0",
                  background: rating === 0 ? "#e5e7eb" : submitting ? "#bae6fd" : "#0ea5e9",
                  color: rating === 0 ? "#9ca3af" : "#ffffff",
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
