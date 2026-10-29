import { useEffect, useRef, useState } from "react";

/**
 * Stripe Checkout inside the account page, instead of a trip to stripe.com.
 * It opens in place under the plans, so paying feels like part of the page.
 * Stripe.js has to come from js.stripe.com (Stripe's rule), so it is loaded on
 * first use rather than bundled. With no publishable key set, callers fall back
 * to the hosted checkout page.
 */

const PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
export const embeddedCheckoutAvailable = !!PUBLISHABLE_KEY;

/** Matches the close transition in responsive.css (.acct-checkout). */
const CLOSE_MS = 380;

interface EmbeddedCheckoutPage {
  mount(el: HTMLElement): void;
  destroy(): void;
}
interface StripeJs {
  createEmbeddedCheckoutPage(opts: { fetchClientSecret: () => Promise<string>; onComplete?: () => void }): Promise<EmbeddedCheckoutPage>;
}
declare global {
  interface Window { Stripe?: (key: string) => StripeJs }
}

let stripePromise: Promise<StripeJs> | null = null;
function loadStripe(): Promise<StripeJs> {
  stripePromise ??= new Promise((resolve, reject) => {
    const done = () => (window.Stripe ? resolve(window.Stripe(PUBLISHABLE_KEY!)) : reject(new Error("Stripe didn't load")));
    if (window.Stripe) return done();
    const script = document.createElement("script");
    script.src = "https://js.stripe.com/endive/stripe.js";
    script.onload = done;
    script.onerror = () => { stripePromise = null; reject(new Error("Couldn't reach Stripe. Check your connection and try again.")); };
    document.head.appendChild(script);
  });
  return stripePromise;
}

/** Start fetching Stripe.js early (on hover or focus of an Upgrade button), so the form opens faster. */
export const preloadStripe = () => { if (embeddedCheckoutAvailable) loadStripe().catch(() => {}); };

export function StripeCheckoutPanel({ planName, price, getClientSecret, onComplete, onClose, onError }: {
  planName: string;
  price: string;
  getClientSecret: () => Promise<string>;
  onComplete: () => void;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  // "opening" for one frame so the expand transition has a start point.
  const [phase, setPhase] = useState<"opening" | "open" | "closing">("opening");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setPhase("open"));
    // Bring the form into view once it has started to open.
    const scroll = window.setTimeout(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    return () => { cancelAnimationFrame(frame); window.clearTimeout(scroll); };
  }, []);

  useEffect(() => {
    let page: EmbeddedCheckoutPage | null = null;
    let cancelled = false;
    loadStripe()
      .then((stripe) => stripe.createEmbeddedCheckoutPage({ fetchClientSecret: getClientSecret, onComplete }))
      .then((p) => {
        if (cancelled) return p.destroy();
        page = p;
        if (mountRef.current) p.mount(mountRef.current);
        setReady(true);
      })
      .catch((err) => { if (!cancelled) onError((err as Error).message); });
    return () => { cancelled = true; page?.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one checkout per opening
  }, []);

  const close = () => {
    if (phase === "closing") return;
    setPhase("closing");
    window.setTimeout(onClose, CLOSE_MS);
  };

  return (
    <div ref={panelRef} className={`acct-checkout is-${phase}`} aria-label={`Checkout for ${planName}`} role="region">
      <div className="acct-checkout__inner">
        <div className="acct-checkout__card">
          <div className="acct-checkout__head">
            <div>
              <div className="acct-checkout__eyebrow">Secure checkout</div>
              <div className="acct-checkout__title">{planName} <span>{price}</span></div>
            </div>
            <button type="button" className="acct-checkout__cancel" onClick={close}>Cancel</button>
          </div>
          {!ready && (
            <div className="acct-checkout__loading" aria-live="polite">
              <div className="acct-checkout__shimmer" />
              <div className="acct-checkout__shimmer" style={{ width: "70%" }} />
              <div className="acct-checkout__shimmer" style={{ height: 44 }} />
              <span className="sr-only">Loading secure checkout</span>
            </div>
          )}
          <div ref={mountRef} className={ready ? "acct-checkout__form is-ready" : "acct-checkout__form"} />
        </div>
      </div>
    </div>
  );
}
