import { useState, useEffect } from "react";
import { MessageSquare, X, Star } from "lucide-react";
import { useLocation } from "react-router-dom";
import { toast, useSonner } from "sonner";
import { captureEvent } from "@/lib/posthog";
import { API_BASE } from "@/lib/vehicleApi";
import { isValidEmail } from "../../shared/email";
import { OPEN_FEEDBACK_EVENT } from "@/lib/feedback";

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

/**
 * Where the pill sits. It floats 24px from the bottom right corner, and as
 * the footer scrolls into view it eases down into it, ending centred in the
 * footer with the same gap above, below and to its right. It's moved with
 * the CSS `translate` property, set straight on the element every frame, so
 * it tracks the scroll in sub-pixel steps without re-rendering.
 */
function useFooterDock(active: boolean) {
  const { pathname } = useLocation();
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const footer = document.querySelector<HTMLElement>("footer.footer-root");
        const pill = document.querySelector<HTMLElement>("[data-feedback-pill]");
        if (!pill) return;
        if (!footer) return void (pill.style.translate = "");
        const height = footer.offsetHeight;
        const gap = Math.max(8, Math.round((height - pill.offsetHeight) / 2));
        const shown = Math.min(height, Math.max(0, window.innerHeight - footer.getBoundingClientRect().top));
        const move = (24 - gap) * (shown / height);
        pill.style.translate = `${move}px ${move}px`;
      });
    };
    update();
    // Each page mounts its own footer, and pages grow as their data loads.
    // Late fonts change the pill's height, so measure again once they're in.
    const ro = new ResizeObserver(update);
    ro.observe(document.body);
    document.fonts?.ready.then(update);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [active, pathname]);
}

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const emailInvalid = email.trim() !== "" && !isValidEmail(email);
  const showEmailError = emailInvalid && emailTouched;
  const [submitting, setSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const isMobile = useIsMobile();
  // Toasts take this corner, so the pill ducks out of the way while any are
  // showing. Near the bottom of the page it docks into the footer (see useFooterDock).
  useFooterDock(!isMobile);
  const hidePill = useSonner().toasts.length > 0;

  const pagePath = window.location.pathname;

  useEffect(() => {
    if (open) {
      // trigger enter animation next frame
      requestAnimationFrame(() => setMounted(true));
      // lock body scroll on mobile sheet
      if (isMobile) {
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = prev; };
      }
    } else {
      setMounted(false);
    }
  }, [open, isMobile]);

  const handleOpen = () => {
    setOpen(true);
    captureEvent("feedback_widget_opened", { page_path: pagePath });
  };

  // The footer's FEEDBACK link opens the panel from anywhere (see lib/feedback).
  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      captureEvent("feedback_widget_opened", { page_path: window.location.pathname, trigger: "footer" });
    };
    window.addEventListener(OPEN_FEEDBACK_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_FEEDBACK_EVENT, onOpen);
  }, []);

  const handleClose = () => {
    captureEvent("feedback_dismissed", { page_path: pagePath, rating_selected: rating > 0 });
    setMounted(false);
    // wait for exit animation
    setTimeout(() => {
      setOpen(false);
      setRating(0);
      setHovered(0);
      setComment("");
      setEmail("");
      setEmailTouched(false);
    }, 180);
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      toast("Please select a rating first");
      return;
    }
    if (emailInvalid) {
      setEmailTouched(true);
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
          email: email.trim() || null,
        }),
      });
      if (res.status === 400) {
        const body = await res.json().catch(() => ({}));
        toast.error(body?.error ?? "Couldn't send feedback");
        return;
      }
      if (!res.ok) throw new Error("Request failed");
      captureEvent("feedback_submitted", { rating, has_comment: comment.trim().length > 0, has_email: email.trim().length > 0, page_path: pagePath });
      toast("Thanks for your feedback!");
      handleClose();
    } catch {
      toast.error("Couldn't send feedback", { description: "Please try again later." });
    } finally {
      setSubmitting(false);
    }
  };

  const displayRating = hovered || rating;


  return (
    <>
      <style>{`
        @keyframes nzvf-fb-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes nzvf-fb-pop-in {
          from { opacity: 0; transform: translateY(8px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes nzvf-fb-sheet-in {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>

      {/* Phones get a FEEDBACK link in the footer instead (see SiteFooter). */}
      {!isMobile && (
        <button
          onClick={handleOpen}
          aria-label="Give feedback"
          data-feedback-pill
          aria-hidden={hidePill}
          tabIndex={hidePill ? -1 : 0}
          style={
            {
              position: "fixed",
              bottom: 24,
              right: 24,
              zIndex: 35,
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              background: "rgba(15, 23, 42, 0.82)",
              color: "#e2e8f0",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.1em",
              cursor: "pointer",
              fontFamily: "'Inter', 'Inter Fallback', system-ui, -apple-system, sans-serif",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              boxShadow: "0 4px 16px rgba(15,23,42,0.22)",
              opacity: hidePill ? 0 : 1,
              transform: hidePill ? "translateY(16px) scale(0.92)" : "none",
              pointerEvents: hidePill ? "none" : "auto",
              transition: "background 0.15s ease, color 0.15s ease, opacity 0.25s ease, transform 0.3s cubic-bezier(0.2, 0.7, 0.2, 1)",
              textTransform: "uppercase",
            }
          }
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(15,23,42,0.96)";
            (e.currentTarget as HTMLButtonElement).style.color = "#ffffff";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(15,23,42,0.82)";
            (e.currentTarget as HTMLButtonElement).style.color = "#e2e8f0";
          }}
        >
          <MessageSquare size={11} />
          Feedback
        </button>
      )}

      {open && (
        <>
          {/* Backdrop */}
          <div
            onClick={handleClose}
            style={{
              position: "fixed", inset: 0,
              // No backdrop blur: it repaints the whole page on every keystroke.
              background: isMobile ? "rgba(15,23,42,0.5)" : "rgba(15,23,42,0.32)",
              zIndex: 50,
              opacity: mounted ? 1 : 0,
              transition: "opacity 0.18s ease",
            }}
          />

          {/* Panel */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Send feedback"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              zIndex: 51,
              background: "#ffffff",
              fontFamily: "'Inter', 'Inter Fallback', system-ui, -apple-system, sans-serif",
              overflow: "hidden",
              ...(isMobile
                ? {
                    left: 0,
                    right: 0,
                    bottom: 0,
                    borderTopLeftRadius: 18,
                    borderTopRightRadius: 18,
                    paddingBottom: "max(16px, env(safe-area-inset-bottom))",
                    boxShadow: "0 -12px 40px rgba(15,23,42,0.18)",
                    transform: mounted ? "translateY(0)" : "translateY(100%)",
                    transition: "transform 0.22s cubic-bezier(0.32, 0.72, 0, 1)",
                  }
                : {
                    bottom: 80,
                    right: 24,
                    width: 320,
                    borderRadius: 14,
                    border: "1px solid #e5e7eb",
                    boxShadow: "0 20px 50px rgba(15,23,42,0.16), 0 4px 12px rgba(15,23,42,0.08)",
                    opacity: mounted ? 1 : 0,
                    transform: mounted ? "translateY(0) scale(1)" : "translateY(8px) scale(0.97)",
                    transformOrigin: "bottom right",
                    transition: "opacity 0.18s ease, transform 0.18s ease",
                  }),
            }}
          >
            {/* Mobile grabber */}
            {isMobile && (
              <div style={{ display: "flex", justifyContent: "center", paddingTop: 8 }}>
                <div style={{ width: 36, height: 4, borderRadius: 999, background: "#e2e8f0" }} />
              </div>
            )}

            {/* Header */}
            <div style={{
              display: "flex", alignItems: "flex-start", justifyContent: "space-between",
              padding: isMobile ? "12px 18px 10px" : "14px 16px 12px",
              borderBottom: "1px solid #f1f5f9",
            }}>
              <div>
                <div style={{ fontSize: isMobile ? 15 : 14, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.01em" }}>
                  How's the site?
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                  Your feedback helps improve Vehicle Finder
                </div>
              </div>
              <button
                onClick={handleClose}
                aria-label="Close feedback"
                style={{
                  background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8,
                  cursor: "pointer", color: "#94a3b8",
                  width: 32, height: 32,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, marginLeft: 8,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#475569"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#94a3b8"; }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Stars */}
            <div style={{ padding: isMobile ? "18px 18px 12px" : "16px 16px 12px" }}>
              <div
                style={{ display: "flex", gap: 6, marginBottom: 14, justifyContent: "center" }}
                onMouseLeave={() => !isMobile && setHovered(0)}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    aria-label={`Rate ${n} star${n > 1 ? "s" : ""}`}
                    onMouseEnter={() => !isMobile && setHovered(n)}
                    onClick={() => setRating(n)}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      padding: 4, display: "flex", alignItems: "center",
                      transform: n <= displayRating ? "scale(1.1)" : "scale(1)",
                      WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    <Star
                      size={isMobile ? 34 : 28}
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
                  borderRadius: 10,
                  padding: "10px 12px",
                  fontSize: isMobile ? 16 : 13,
                  color: "#374151",
                  fontFamily: "inherit",
                  outline: "none",
                  boxSizing: "border-box",
                  lineHeight: 1.5,
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
              <div style={{ position: "relative", marginTop: 8 }}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email, if you'd like a reply (optional)"
                maxLength={254}
                aria-invalid={showEmailError}
                aria-describedby={showEmailError ? "feedback-email-error" : undefined}
                autoComplete="email"
                style={{
                  width: "100%",
                  border: `1px solid ${showEmailError ? "#ef4444" : "#e2e8f0"}`,
                  borderRadius: 10,
                  padding: showEmailError ? "10px 96px 10px 12px" : "10px 12px",
                  fontSize: isMobile ? 16 : 13,
                  color: "#374151",
                  fontFamily: "inherit",
                  outline: "none",
                  boxSizing: "border-box",
                  background: "#f8fafc",
                  transition: "border-color 0.15s ease, background 0.15s ease",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#0ea5e9";
                  e.currentTarget.style.background = "#ffffff";
                }}
                onBlur={(e) => {
                  setEmailTouched(true);
                  e.currentTarget.style.borderColor = emailInvalid ? "#ef4444" : "#e2e8f0";
                  e.currentTarget.style.background = "#f8fafc";
                }}
              />
              {/* Inside the box, so flagging a bad email doesn't push the buttons down. */}
              {showEmailError && (
                <span
                  id="feedback-email-error"
                  role="alert"
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 11, fontWeight: 600, color: "#dc2626", pointerEvents: "none" }}
                >
                  Invalid email
                </span>
              )}
              </div>
            </div>

            {/* Submit */}
            <div style={{
              padding: isMobile ? "4px 18px 18px" : "0 16px 16px",
              display: "flex",
              gap: 8,
            }}>
              <button
                onClick={handleClose}
                style={{
                  flex: "0 0 auto",
                  padding: isMobile ? "12px 16px" : "10px 14px",
                  background: "transparent",
                  color: "#64748b",
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  letterSpacing: "0.02em",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || rating === 0 || showEmailError}
                style={{
                  flex: 1,
                  padding: isMobile ? "12px 0" : "10px 0",
                  background: rating === 0 || showEmailError ? "#f1f5f9" : submitting ? "#7dd3fc" : "#0ea5e9",
                  color: rating === 0 || showEmailError ? "#94a3b8" : "#ffffff",
                  border: "none",
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  cursor: rating === 0 || submitting ? "default" : "pointer",
                  fontFamily: "inherit",
                  transition: "background 0.15s ease",
                  textTransform: "uppercase",
                }}
              >
                {submitting ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
