import { useEffect } from "react";
import { Link } from "react-router-dom";
import { applySeo } from "@/lib/seo";
import { PageShell } from "@/components/PageShell";
import { DocSection } from "@/components/DocLayout";
import { CONTACT_EMAIL } from "../../shared/contact";

const p = { fontSize: 14, color: "#374151", lineHeight: 1.7, margin: "0 0 12px" } as const;
// Tailwind's reset strips list markers, so ask for them back.
const ul = { ...p, paddingLeft: 20, listStyle: "disc" } as const;
const a = { color: "#0369a1", fontWeight: 600 } as const;

export default function Terms() {
  useEffect(() => {
    applySeo({
      title: "Terms | NZ Vehicle Finder",
      description: "The terms for using NZ Vehicle Finder, its API and paid plans.",
      canonical: "https://vehiclefinder.co.nz/terms",
    });
  }, []);

  return (
    <PageShell
      source="terms_page"
      subtitle="Terms"
      crumb="Terms"
      title="Terms"
      intro="The rules for using this site, the API and paid plans, in plain words. Last updated 5 October 2026."
    >
      <div className="stagger-in doc-layout doc-layout--plain">
        <DocSection id="who" title="Who you're dealing with">
          <p style={p}>
            NZ Vehicle Finder is run by Jed Blenkhorn in New Zealand. By using the site or the API, or by making an
            account, you agree to these terms. Questions go to <a href={`mailto:${CONTACT_EMAIL.support}`} style={a}>{CONTACT_EMAIL.support}</a>.
          </p>
        </DocSection>

        <DocSection id="data" title="The data">
          <p style={p}>
            The vehicle data comes from NZTA&apos;s open Motor Vehicle Register data, used under its{" "}
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer" style={a}>CC BY 4.0</a>{" "}
            licence. This site is not run by or connected to NZTA or Waka Kotahi.
          </p>
          <p style={p}>
            It is provided as it is. I work to keep it accurate and up to date, but the register itself can have gaps or
            mistakes, so don&apos;t rely on it alone for decisions that matter, like buying a vehicle.
          </p>
        </DocSection>

        <DocSection id="fair-use" title="Fair use">
          <ul style={ul}>
            <li>Use the API through your own key and keep it private. You are responsible for what is done with it.</li>
            <li>Stay within your plan&apos;s monthly requests and the per-second limit. Don&apos;t try to get around them, for example with several free accounts.</li>
            <li>Don&apos;t scrape the website instead of using the API, or do anything that slows the site down for others.</li>
            <li>Don&apos;t use the site to try to identify, track or contact vehicle owners.</li>
          </ul>
          <p style={p}>I can suspend keys or accounts that break these rules.</p>
        </DocSection>

        <DocSection id="paid" title="Paid plans">
          <ul style={ul}>
            <li>Paid plans are billed monthly in New Zealand dollars through Stripe, and renew until you cancel.</li>
            <li>You can change or cancel any time from your <Link to="/account" style={a}>account page</Link>. A cancelled plan runs to the end of the month you paid for.</li>
            <li>Payments aren&apos;t refunded for part-months, unless the law says otherwise or something went wrong on my end.</li>
            <li>Prices can change. You&apos;ll get at least 30 days&apos; notice by email before a change affects you.</li>
          </ul>
        </DocSection>

        <DocSection id="service" title="The service">
          <p style={p}>
            I aim to keep the site and API running, but can&apos;t promise they will never be down or change. Endpoints
            may change; anything that breaks existing use will be announced in the{" "}
            <Link to="/developers" style={a}>API docs</Link> first where possible.
          </p>
          <p style={p}>
            As far as the law allows, I&apos;m not liable for losses from using or not being able to use the site,
            and my total liability is limited to what you paid in the previous three months. Nothing here limits your
            rights under the Consumer Guarantees Act or the Fair Trading Act where they apply. If you use the site for
            business, you agree the Consumer Guarantees Act doesn&apos;t apply.
          </p>
        </DocSection>

        <DocSection id="account" title="Your account">
          <p style={p}>
            You can delete your account any time from its Settings. How your information is handled is covered in the{" "}
            <Link to="/privacy" style={a}>Privacy Policy</Link>. These terms are governed by New Zealand law, and they
            may be updated; the date at the top shows the latest version.
          </p>
        </DocSection>
      </div>
    </PageShell>
  );
}
