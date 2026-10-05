import { useEffect, type ReactNode } from "react";
import { applySeo } from "@/lib/seo";
import { PageShell } from "@/components/PageShell";
import { DocSection } from "@/components/DocLayout";
import { CONTACT_EMAIL } from "../../shared/contact";

const p = { fontSize: 14, color: "#374151", lineHeight: 1.7, margin: "0 0 12px" } as const;
const ul = { ...p, paddingLeft: 20 } as const;
const mail = <a href={`mailto:${CONTACT_EMAIL.support}`} style={{ color: "#0369a1", fontWeight: 600 }}>{CONTACT_EMAIL.support}</a>;

function Who({ name, why }: { name: string; why: ReactNode }) {
  return <li><strong>{name}</strong>: {why}</li>;
}

export default function Privacy() {
  useEffect(() => {
    applySeo({
      title: "Privacy | NZ Vehicle Finder",
      description: "What NZ Vehicle Finder collects about you, why, who else handles it, and how to see or delete it.",
      canonical: "https://vehiclefinder.co.nz/privacy",
    });
  }, []);

  return (
    <PageShell
      source="privacy_page"
      subtitle="Privacy"
      crumb="Privacy"
      title="Privacy"
      intro="What this site collects about you, why, and how to get it changed or deleted. Last updated 5 October 2026."
    >
      <div className="stagger-in doc-layout doc-layout--plain">
        <DocSection id="who" title="Who runs this site">
          <p style={p}>
            NZ Vehicle Finder is run by Jed Blenkhorn in New Zealand, on my own. Questions about your information go to {mail}.
          </p>
        </DocSection>

        <DocSection id="vehicles" title="The vehicle data">
          <p style={p}>
            The vehicle records come from NZTA&apos;s open Motor Vehicle Register data. That data has no owner names or
            addresses, and neither does this site.
          </p>
        </DocSection>

        <DocSection id="collect" title="What I collect">
          <p style={p}>Searching the site needs no account. If you make one, I keep:</p>
          <ul style={ul}>
            <li>your email address and your name</li>
            <li>if you sign in with Google, your Google account ID, so the same account is found next time</li>
            <li>when you joined and last signed in</li>
            <li>your API keys (stored scrambled, never in readable form), how many API requests you make each month, and your saved searches</li>
            <li>if you pay, your plan and subscription status. Card details go to Stripe and never reach this site.</li>
          </ul>
          <p style={p}>
            Feedback you send through the site is kept with whatever you write in it, including your email if you add it.
          </p>
          <p style={p}>
            Usage analytics record which pages are visited and what is clicked, with your browser and device type, so I can
            see what is used and what is broken. Your IP address is used to stop abuse and shows up in the server's logs, but is never stored with your account.
          </p>
        </DocSection>

        <DocSection id="why" title="Why">
          <ul style={ul}>
            <li>to sign you in and run your account, API keys and monthly limit</li>
            <li>to bill paid plans</li>
            <li>to reply when you get in touch</li>
            <li>to fix problems and improve the site</li>
          </ul>
          <p style={p}>
            I don&apos;t sell your information, show ads, or send marketing email. Emails are only sign-in codes, receipts
            and replies to you.
          </p>
        </DocSection>

        <DocSection id="others" title="Who else handles it">
          <ul style={ul}>
            <Who name="Stripe" why="takes card payments and runs subscriptions" />
            <Who name="Google" why="only if you choose Sign in with Google" />
            <Who name="Resend" why="sends sign-in emails" />
            <Who name="PostHog" why="usage analytics, stored in the United States" />
            <Who name="Cloudflare" why="delivers the site and forwards email" />
          </ul>
        </DocSection>

        <DocSection id="browser" title="Cookies and browser storage">
          <p style={p}>
            Signing in sets one cookie that keeps you signed in for 30 days. Signing in with Google also sets a short-lived
            cookie for the 10 minutes the sign-in takes. Browser storage on your device remembers small things like your
            analytics ID and whether you were signed in. There are no advertising or tracking cookies.
          </p>
        </DocSection>

        <DocSection id="rights" title="Seeing, fixing or deleting your information">
          <p style={p}>
            Under the Privacy Act 2020 you can ask to see what I hold about you, ask me to correct it, or ask me to delete
            your account. Email {mail} from the address on your account. Your information is kept until you delete your account.
          </p>
          <p style={p}>
            If you&apos;re unhappy with how I handle it, you can complain to the{" "}
            <a href="https://www.privacy.org.nz" target="_blank" rel="noopener noreferrer" style={{ color: "#0369a1" }}>Office of the Privacy Commissioner</a>.
          </p>
        </DocSection>
      </div>
    </PageShell>
  );
}
