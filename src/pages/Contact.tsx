import { useEffect, useRef, useState } from "react";
import { applySeo } from "@/lib/seo";
import { captureEvent } from "@/lib/posthog";
import { openFeedback } from "@/lib/feedback";
import { submitContact, saveContactDraft } from "@/lib/contactApi";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { CONTACT_EMAIL } from "../../shared/contact";
import { isValidEmail } from "../../shared/email";

const TOPICS = ["General", "The data", "API / developers", "Billing", "Custom report", "Bug"];

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", fontSize: 14, borderRadius: 8,
  border: "1px solid #d1d5db", background: "#ffffff", color: "#111827",
  fontFamily: "inherit", boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 600, color: "#374151", margin: "0 0 6px",
};

export default function Contact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState("General");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDraft = useRef("");

  useEffect(() => {
    applySeo({
      title: "Contact | NZ Vehicle Finder",
      description: "Get in touch with Jed, who built and runs NZ Vehicle Finder, about the site, the API, billing or custom vehicle data reports.",
      canonical: "https://vehiclefinder.co.nz/contact",
    });
  }, []);

  // Keep a draft so a lead is captured even if the form is never sent. Fires at
  // most every 1.5s, only once there is a valid email, and only when something changed.
  useEffect(() => {
    if (sent || !isValidEmail(email.trim())) return;
    const snapshot = JSON.stringify({ name, email, topic, message });
    if (snapshot === lastDraft.current) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      lastDraft.current = snapshot;
      saveContactDraft({ name: name.trim(), email: email.trim(), topic, message: message.trim() });
    }, 1500);
    return () => { if (draftTimer.current) clearTimeout(draftTimer.current); };
  }, [name, email, topic, message, sent]);

  const emailValid = isValidEmail(email.trim());
  const canSend = emailValid && message.trim().length > 0 && !sending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) {
      setError(!emailValid ? "Please enter a valid email so I can reply." : "Please add a message.");
      return;
    }
    setError(null);
    setSending(true);
    captureEvent("contact_submitted", { topic });
    try {
      await submitContact({ name: name.trim(), email: email.trim(), topic, message: message.trim() });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send your message. Please try again.");
      captureEvent("contact_failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="error-page">
      <SiteHeader source="contact_page" subtitle="Contact" />
      <main className="stagger-in error-page__main">
        <div className="error-page__code">CONTACT</div>
        <h2 className="error-page__title">Hi, I&apos;m Jed</h2>
        <p className="error-page__intro">
          I built NZ Vehicle Finder and I run it on my own. If you have questions about the site, the data, the API or
          billing, or want a custom report, send me a message below and I&apos;ll reply within a day or two.
        </p>

        {sent ? (
          <div style={{ maxWidth: 440, width: "100%", margin: "8px auto 0", padding: "20px 22px", borderRadius: 10, border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#166534", textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Thanks, that&apos;s on its way.</div>
            <div style={{ fontSize: 14 }}>I&apos;ll get back to you at {email.trim()} within a day or two.</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ maxWidth: 440, width: "100%", margin: "8px auto 0", textAlign: "left", display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={labelStyle} htmlFor="contact-name">Name <span style={{ color: "#9ca3af", fontWeight: 400 }}>(optional)</span></label>
              <input id="contact-name" style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} />
            </div>
            <div>
              <label style={labelStyle} htmlFor="contact-email">Email</label>
              <input id="contact-email" type="email" required style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" maxLength={254} />
            </div>
            <div>
              <label style={labelStyle} htmlFor="contact-topic">Topic</label>
              <select id="contact-topic" style={inputStyle} value={topic} onChange={(e) => setTopic(e.target.value)}>
                {TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle} htmlFor="contact-message">Message</label>
              <textarea id="contact-message" required rows={5} style={{ ...inputStyle, resize: "vertical", minHeight: 110 }} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={4000} placeholder="How can I help?" />
            </div>
            {error && <div style={{ fontSize: 13, color: "#b91c1c" }}>{error}</div>}
            <button type="submit" disabled={!canSend} style={{ padding: "11px 18px", borderRadius: 999, border: "none", background: canSend ? "#0ea5e9" : "#bae6fd", color: "#ffffff", fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: canSend ? "pointer" : "default" }}>
              {sending ? "Sending…" : "Send message"}
            </button>
          </form>
        )}

        <p className="contact-note" style={{ marginTop: 20 }}>
          Prefer email? Write to{" "}
          <a href={`mailto:${CONTACT_EMAIL.support}`} onClick={() => captureEvent("contact_email_clicked", { kind: "support" })}>{CONTACT_EMAIL.support}</a>.
          {" "}Just a quick thought or found a bug?{" "}
          <button type="button" onClick={() => { captureEvent("contact_feedback_clicked"); openFeedback(); }}>Send feedback</button>{" "}
          without leaving the page.
        </p>
      </main>
      <SiteFooter source="contact_page" />
    </div>
  );
}
