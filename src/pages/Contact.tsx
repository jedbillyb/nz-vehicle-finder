import { useEffect } from "react";
import { applySeo } from "@/lib/seo";
import { captureEvent } from "@/lib/posthog";
import { openFeedback } from "@/lib/feedback";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { CONTACT_EMAIL } from "../../shared/contact";

export default function Contact() {
  useEffect(() => {
    applySeo({
      title: "Contact | NZ Vehicle Finder",
      description: "Get in touch with NZ Vehicle Finder about the site, the API, billing or custom vehicle data reports.",
      canonical: "https://vehiclefinder.co.nz/contact",
    });
  }, []);

  return (
    <div className="error-page">
      <SiteHeader source="contact_page" subtitle="Contact" />
      <main className="error-page__main">
        <div className="error-page__code">CONTACT</div>
        <h2 className="error-page__title">Get in touch</h2>
        <p className="error-page__intro">
          Questions about the site, the data, the API, billing or a custom report: one email reaches a real person, usually within a day or two.
        </p>
        <a
          className="contact-email"
          href={`mailto:${CONTACT_EMAIL.support}`}
          onClick={() => captureEvent("contact_email_clicked", { kind: "support" })}
        >
          {CONTACT_EMAIL.support}
        </a>
        <p className="contact-note">
          Just a quick thought or a bug?{" "}
          <button type="button" onClick={() => { captureEvent("contact_feedback_clicked"); openFeedback(); }}>Send feedback</button>{" "}
          without leaving the page.
        </p>
      </main>
      <SiteFooter source="contact_page" />
    </div>
  );
}
