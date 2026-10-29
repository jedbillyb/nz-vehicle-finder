import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/Spinner";

/**
 * Stripe Checkout inside the account page, instead of a trip to stripe.com.
 * Stripe.js has to come from js.stripe.com (Stripe's rule), so it is loaded on
 * first use rather than bundled. With no publishable key set, callers fall back
 * to the hosted checkout page.
 */

const PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
export const embeddedCheckoutAvailable = !!PUBLISHABLE_KEY;

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

export function StripeCheckoutDialog({ planName, getClientSecret, onComplete, onClose, onError }: {
  planName: string;
  getClientSecret: () => Promise<string>;
  onComplete: () => void;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

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

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="max-h-[92dvh] overflow-y-auto p-0 sm:max-w-[560px]"
        // Clicks inside Stripe's frame must never close the dialog.
        onInteractOutside={(e) => e.preventDefault()}
        aria-describedby={undefined}
      >
        <DialogTitle style={{ padding: "18px 48px 0 20px", fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
          Upgrade to {planName}
        </DialogTitle>
        {!ready && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "48px 0", color: "#6b7280", fontSize: 13 }}>
            <Spinner /> Loading secure checkout...
          </div>
        )}
        <div ref={mountRef} style={{ minHeight: ready ? 400 : 0, paddingBottom: 8 }} />
      </DialogContent>
    </Dialog>
  );
}
