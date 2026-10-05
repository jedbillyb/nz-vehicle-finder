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
      description: "Get in touch with Jed, who built and runs NZ Vehicle Finder, about the site, the API, billing or custom vehicle data reports.",
      canonical: "https://vehiclefinder.co.nz/contact",
    });
  }, []);

  return (
    <div className="error-page">
      <SiteHeader source="contact_page" subtitle="Contact" />
      <main className="stagger-in error-page__main">
        <div className="error-page__code">CONTACT</div>
        <h2 className="error-page__title">Hi, I&apos;m Jed</h2>
        <p className="error-page__intro">
          I built NZ Vehicle Finder and I run it on my own. If you have questions about the site, the data, the API or
          billing, or want a custom report, feel free to contact me below and I&apos;ll answer within a day or two.
        </p>
        <a
          className="contact-email"
          href={`mailto:${CONTACT_EMAIL.support}`}
          onClick={() => captureEvent("contact_email_clicked", { kind: "support" })}
        >
          {CONTACT_EMAIL.support}
        </a>
        <p className="contact-note">
          Just a quick thought or found a bug?{" "}
          <button type="button" onClick={() => { captureEvent("contact_feedback_clicked"); openFeedback(); }}>Send feedback</button>{" "}
          without leaving the page.
        </p>
      </main>
      <SiteFooter source="contact_page" />
    </div>
  );
}
