import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { applySeo } from "@/lib/seo";
import { captureEvent, identifyUser, resetUser } from "@/lib/posthog";
import {
  createApiKey, deleteSavedSearch, deleteAccount, fetchAccount, fetchAdminAccounts, adminDeleteAccount, signOutEverywhere, fetchAuthOptions, devSignIn, devForgetName, googleSignInUrl, setAccountName, hasPendingSave, openBillingPortal, paidPlan, renameApiKey, renameSavedSearch, requestSignInLink,
  revokeApiKey, saveSearch, setPendingPlan, signOut, startCheckout, syncBilling, takePendingPlan, takePendingSave, verifySignInCode, verifySignInToken,
  type Account as AccountData, type AdminAccount, type SavedSearch,
  type AuthOptions,
} from "@/lib/account";
import { PageShell } from "@/components/PageShell";
import { DocSection, Split } from "@/components/DocLayout";
import { code, input, label, primaryButton, secondaryButton } from "@/lib/pageStyles";
import { BURST_PER_SECOND, TIERS, TIER_ORDER, type Tier, type TierId } from "../../shared/apiTiers";
import { MAX_SAVED_SEARCH_NAME, MAX_SAVED_SEARCHES } from "../../shared/savedSearch";
import { ChevronLeft, LogOut, Star } from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/Spinner";
import { SkeletonBlock } from "@/components/SkeletonRows";
import { AnimatedNumber } from "@/components/NumberSlot";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { REGEXP_ONLY_DIGITS } from "input-otp";

const SIGNED_IN_KEY = "nzvf_signed_in";
/** Last visit's first name, so the heading reads "Hey, Sam" while the account loads. */
const SIGNED_IN_NAME_KEY = "nzvf_signed_in_name";

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" }) : "Never";

const panel: React.CSSProperties = { background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "16px 20px" };
const errorText: React.CSSProperties = { color: "#b91c1c", fontSize: 13, margin: "10px 0 0" };

const fmtRequests = (t: Tier) => `${t.monthlyRequests.toLocaleString("en-NZ")} requests a month`;

/** One plan as a selectable row: name and allowance on the left, price on the right. */
/** Main form buttons: as tall as the input beside them and wide enough to read. */

function PlanOption({ tier, selected, onSelect }: { tier: Tier; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", cursor: "pointer",
        padding: "12px 14px", borderRadius: 8, background: selected ? "#f0f9ff" : "#ffffff",
        border: selected ? "2px solid #0ea5e9" : "1px solid #e5e7eb", margin: selected ? 0 : 1,
      }}
    >
      <span style={{ width: 16, height: 16, borderRadius: 999, flexShrink: 0, border: selected ? "5px solid #0ea5e9" : "2px solid #d1d5db", background: "#ffffff" }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{tier.name}</span>
        <span style={{ display: "block", fontSize: 12, color: "#6b7280" }}>{fmtRequests(tier)}</span>
      </span>
      <span style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", whiteSpace: "nowrap" }}>
        {tier.priceNzd === 0 ? "Free" : `NZ$${tier.priceNzd}`}
        {tier.priceNzd > 0 && <span style={{ fontSize: 12, fontWeight: 500, color: "#6b7280" }}> /mo</span>}
      </span>
    </button>
  );
}

/** Google's four-colour G, as their sign-in branding asks for. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function SignIn({ options, pendingSave, initialPlan, naming, onSignedIn, onNamed, onSignOut }: {
  options: AuthOptions;
  pendingSave: boolean;
  initialPlan: TierId;
  /** Signed in for the first time and no name yet: step 2 becomes step 3, the name. */
  naming: boolean;
  /** Called after a typed code signs this tab in, with the paid plan picked here (if any). */
  onSignedIn: (plan: TierId | null) => void;
  /** Called once the name is saved, with the paid plan picked here (if any). */
  onNamed: (plan: TierId | null) => void;
  /** Back from the name step: the account exists by then, so going back means signing out. */
  onSignOut: () => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState<TierId>(initialPlan);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  /** Said inside the email box, so nothing below it moves. */
  const [badEmail, setBadEmail] = useState(false);
  const [typed, setTyped] = useState("");
  const [checking, setChecking] = useState(false);
  /** Bumped on a wrong code, so the boxes shake (and clear) each time. */
  const [rejected, setRejected] = useState(0);
  /** Phones get one plain input drawn as six boxes (CodeInputPhone); the library boxes stay on desktop. */
  const phone = typeof window !== "undefined" && window.matchMedia("(max-width: 899px)").matches;
  const googleOn = options.google;
  const devLogin = !!options.devLogin;
  /** On test.vehiclefinder.co.nz: test1 and test2 sign in with 000000 (server/accounts.ts). */
  const testLogin = !!options.testLogin;
  /** Seconds until another code can be sent; the server allows one a minute per email. */
  const [cooldown, setCooldown] = useState(0);
  /** Where the last code went, so Back and the same email again doesn't ask for another inside the minute. */
  const [sentTo, setSentTo] = useState("");
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);
  const tier = TIERS[plan];
  const paid = tier.priceNzd > 0;
  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingName(true);
    setError(null);
    try {
      await setAccountName(name);
      captureEvent("name_saved");
      onNamed(paid ? plan : null);
    } catch (err) {
      setError((err as Error).message);
      setSavingName(false);
    }
  };
  // The step on screen trails the real one by a short fade-out, so the plans
  // column can leave (or come back) before the layout changes width.
  const step = naming ? "name" : state === "sent" ? "code" : "email";
  const [shown, setShown] = useState(step);
  const leaving = shown !== step;
  useEffect(() => {
    if (step === shown) return;
    const t = window.setTimeout(() => setShown(step), 180);
    return () => window.clearTimeout(t);
  }, [step, shown]);
  // When the step column moves (beside the plans, or alone in the middle), slide it
  // from where it was to where it lands instead of jumping.
  // The grid's height eases to the new step's too, so the sections below glide instead of jumping.
  const stepRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const from = useRef<{ left: number; top: number; height: number; bottom: number } | null>(null);
  /** Side by side (wide screens), the later steps keep the email step's height and sit
   *  centred in it, so the rule below the section never moves. */
  const [heldHeight, setHeldHeight] = useState<number | null>(null);
  useEffect(() => {
    if (leaving && stepRef.current && gridRef.current) {
      const at = stepRef.current.getBoundingClientRect();
      from.current = { left: at.left, top: at.top, height: gridRef.current.offsetHeight, bottom: gridRef.current.getBoundingClientRect().bottom };
      const wide = window.matchMedia("(min-width: 900px)").matches;
      // Stacked (phones), the name step is shorter than the code step before it:
      // the page would shrink under it and drag it down. Keep the room instead.
      if ((shown === "email" && wide) || (shown === "code" && step === "name" && !wide)) setHeldHeight(gridRef.current.offsetHeight);
    }
    else if (shown === "email") setHeldHeight(null);
  }, [leaving, shown, step]);
  useLayoutEffect(() => {
    const el = stepRef.current;
    const grid = gridRef.current;
    const was = from.current;
    from.current = null;
    if (!el || !grid || !was || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timing = { duration: 450, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" };
    const dx = was.left - el.getBoundingClientRect().left;
    if (Math.abs(dx) >= 2) el.animate([{ transform: `translateX(${dx}px)` }, { transform: "none" }], timing);
    // Phones: the step slides from where the step before it was. Arriving at the
    // code, the keyboard has just gone down (submit waits for it) and can leave
    // the page scrolled down by the footer, so the page is first put back with
    // the step near the top, where the code keyboard won't cover it. The slide
    // below starts from the old place on screen, so this doesn't show as a jump.
    if (!window.matchMedia("(min-width: 900px)").matches) {
      if (shown === "code") {
        let top = 0;
        for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) top += n.offsetTop;
        const maxTop = document.documentElement.scrollHeight - window.innerHeight;
        const want = Math.max(48, Math.round(window.innerHeight * 0.1));
        window.scrollTo({ top: Math.max(0, Math.min(top - want, maxTop)), behavior: "instant" as ScrollBehavior });
      }
      const dy = was.top - el.getBoundingClientRect().top;
      if (Math.abs(dy) >= 2 && Math.abs(dy) <= window.innerHeight) el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], timing);
      // The sections below start where they were on screen and glide up (or
      // down) to their new place, instead of jumping when the step changes size.
      const startHeight = was.bottom - grid.getBoundingClientRect().top;
      const endHeight = grid.offsetHeight;
      if (startHeight > 0 && startHeight <= endHeight + window.innerHeight && Math.abs(startHeight - endHeight) >= 2) {
        grid.animate([{ height: `${startHeight}px`, overflow: "hidden" }, { height: `${endHeight}px`, overflow: "hidden" }], timing);
      }
      return;
    }
    const height = grid.offsetHeight;
    if (Math.abs(height - was.height) >= 2) {
      grid.animate([{ height: `${was.height}px`, overflow: "hidden" }, { height: `${height}px`, overflow: "hidden" }], timing);
    }
  }, [shown]);
  const back = async () => {
    if (naming) await onSignOut();
    setChecking(false);
    setState("idle");
    setError(null);
    setTyped("");
  };

  const submitLabel = state === "sending" ? "Sending..." : paid ? `Continue with ${tier.name}` : "Email me a code";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const typedEmail = email.trim();
    if (!(testLogin && /^test[12]$/i.test(typedEmail)) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typedEmail)) {
      setBadEmail(true);
      return;
    }
    // Enter on the keyboard keeps it up, unlike a tap on the button. Put it
    // down here too: carried over, it never offers the code from the email.
    // The code step waits for it to finish going down, so the page doesn't
    // resize under the step as it slides in.
    const keyboardWasUp = phone && document.activeElement instanceof HTMLInputElement;
    (document.activeElement as HTMLElement | null)?.blur();
    const keyboardDown = keyboardWasUp ? keyboardClosed() : Promise.resolve();
    // Back, then the same email again within the minute: the code already
    // sent still works, and the server would refuse to send another anyway.
    if (cooldown > 0 && email.trim().toLowerCase() === sentTo) {
      setPendingPlan(paid ? plan : null);
      setTyped("");
      await keyboardDown;
      setState("sent");
      toast("Use the code we already emailed you.");
      return;
    }
    setState("sending");
    try {
      const [{ reused }] = await Promise.all([requestSignInLink(email, paid ? plan : undefined), keyboardDown]);
      setPendingPlan(paid ? plan : null);
      captureEvent("api_signin_requested", { plan });
      setSentTo(email.trim().toLowerCase());
      setTyped("");
      setCooldown(60);
      setState("sent");
      if (reused) toast("Use the code we already emailed you.");
    } catch (err) {
      const message = (err as Error).message;
      if (/valid email/i.test(message)) setBadEmail(true);
      else setError(message);
      setState("idle");
    }
  };

  /** Stays on the code screen: a new email, and the old code stops working. */
  const resend = async () => {
    setError(null);
    setCooldown(60);
    try {
      const { reused } = await requestSignInLink(email, paid ? plan : undefined);
      captureEvent("signin_code_resent");
      setTyped("");
      toast.success(reused ? "The code we already emailed you still works." : "New code sent. Use the newest email.");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const checkCode = async (value: string) => {
    if (checking) return;
    setChecking(true);
    setError(null);
    try {
      await verifySignInCode(email, value);
      captureEvent("signin_code_entered", { result: "ok" });
      onSignedIn(paid ? plan : null);
    } catch (err) {
      captureEvent("signin_code_entered", { result: "rejected" });
      setError((err as Error).message);
      setTyped("");
      setRejected((n) => n + 1);
      setChecking(false);
    }
  };

  const onCodeChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 6);
    setTyped(digits);
    // Six digits is the whole code: check it without waiting for a click.
    if (digits.length === 6) checkCode(digits);
  };
  /** Copied from the email, the code often comes with a line break or the words around it: keep the digits. */
  const digitsOf = (text: string) => text.replace(/\D/g, "").slice(0, 6);
  /** Reads the clipboard for people who can't find the long-press paste; the phone asks once. */
  const pasteCode = async () => {
    try {
      const digits = digitsOf(await navigator.clipboard.readText());
      if (digits.length < 6) throw new Error("no code");
      onCodeChange(digits);
    } catch {
      setError("Copy the 6-digit code from the email first, or long-press the boxes and tap Paste.");
    }
  };

  return (
    <DocSection id="sign-in">
      {pendingSave && state !== "sent" && !naming && (
        <div style={{ ...panel, marginBottom: 12, background: "#fffbeb", borderColor: "#fcd34d", fontSize: 14, color: "#92400e", display: "flex", gap: 8, alignItems: "center" }}>
          <Star size={14} fill="#f59e0b" color="#f59e0b" style={{ flexShrink: 0 }} />
          Sign in to save your search. It's saved to your account as soon as you're in.
        </div>
      )}
      <div ref={gridRef} style={shown !== "email" && heldHeight ? { minHeight: heldHeight, alignContent: phone ? "start" : "center" } : undefined} className={`signup-grid signup-grid--single${leaving ? " is-leaving" : ""}`}>

        {/* Keyed by step, so each step's lines cascade in when it takes over. */}
        <div key={shown} ref={stepRef} className="stagger-in stagger-in--step">
          {shown !== "email" && (
            <button type="button" onClick={back} disabled={shown === "code" ? checking : savingName} className="signup-back">
              <ChevronLeft size={14} aria-hidden />
              Back
            </button>
          )}
          <div style={{ ...label, marginBottom: 8 }}>
            {shown === "name" ? "3. Set up your account" : shown === "code" ? "2. Check your email" : "1. Enter your email"}
          </div>
          {shown === "name" ? (
            <>
              <p style={{ margin: "0 0 14px", fontSize: 14, color: "#374151", lineHeight: 1.6 }}>
                You're new here. What should we call you, and which plan do you want? Free is fine for saved searches.
              </p>
              {/* Stacked and full width, like the email step. */}
              <form onSubmit={saveName} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input
                  autoFocus
                  required
                  autoComplete="given-name"
                  aria-label="First name"
                  placeholder="First name"
                  maxLength={40}
                  value={name}
                  disabled={savingName}
                  onChange={(e) => setName(e.target.value)}
                  className="signup-input"
                  style={{ ...input, width: "100%", height: 42, boxSizing: "border-box" }}
                />
                {/* New accounts only: signing back in never shows the plans. */}
                <div role="radiogroup" aria-label="Plan" style={{ display: "flex", flexDirection: "column", gap: 8, margin: "8px 0", textAlign: "left" }}>
                  {TIER_ORDER.map((id) => (
                    <PlanOption
                      key={id}
                      tier={TIERS[id]}
                      selected={id === plan}
                      onSelect={() => {
                        if (savingName) return;
                        setPlan(id);
                        captureEvent("plan_selected", { plan: id, source: "signup" });
                      }}
                    />
                  ))}
                </div>
                <button type="submit" disabled={savingName || !name.trim()} style={{ ...primaryButton, width: "100%", height: 42, opacity: name.trim() ? 1 : 0.5 }}>
                  {savingName ? "Saving..." : paid ? `Continue to checkout for ${tier.name}` : "Finish sign-up"}
                </button>
              </form>
              {error && <p style={errorText}>{error}</p>}
            </>
          ) : shown === "code" ? (
            <>
              <p style={{ margin: "0 0 14px", fontSize: 14, color: "#374151", lineHeight: 1.6 }}>
                We emailed a 6-digit code to <strong>{email}</strong>. Type it here, or open the link in the email.
                {paid && <> Then you go straight to secure checkout for <strong>{tier.name}</strong>.</>}
              </p>
              {/* Six boxes, no button: the sixth digit checks the code. */}
              <div key={rejected} className={rejected ? "otp-shake" : undefined}>
                {phone ? <CodeInputPhone value={typed} disabled={checking} onChange={onCodeChange} /> : <InputOTP
                  autoFocus
                  maxLength={6}
                  pattern={REGEXP_ONLY_DIGITS}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  aria-label="6-digit code"
                  value={typed}
                  disabled={checking}
                  onChange={onCodeChange}
                  pasteTransformer={digitsOf}
                  containerClassName="otp"
                >
                  <InputOTPGroup className="otp__group">
                    {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} className="otp__slot" />)}
                  </InputOTPGroup>
                </InputOTP>}
              </div>
              <div className="otp-status">
                {checking
                  ? <span style={{ color: "#0369a1", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 7 }}><Spinner size={13} />Checking code</span>
                  : error
                  ? <span style={{ color: "#b91c1c" }}>{error}</span>
                  : <span>
                      Expires in 15 minutes.{" "}
                      {typeof navigator !== "undefined" && !!navigator.clipboard?.readText && (
                        <button type="button" onClick={pasteCode} className="otp-resend">Paste code</button>
                      )}
                    </span>}
              </div>
              <div className="otp-status">
                Didn't get it?{" "}
                <button type="button" disabled={cooldown > 0 || checking} onClick={resend} className="otp-resend">
                  {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p style={{ margin: "0 0 14px", fontSize: 14, color: "#374151", lineHeight: 1.6 }}>
                We'll email you a 6-digit code.
                {paid
                  ? <> Then you go straight to Stripe to pay NZ${tier.priceNzd} a month for <strong>{tier.name}</strong>.</>
                  : <> No account yet? We'll set you up after that.</>}
              </p>
              {devLogin && (
                <div className="dev-login">
                  <span>Local dev</span>
                  {(["user", "admin"] as const).map((as) => (
                    <button
                      key={as}
                      type="button"
                      onClick={() => devSignIn(as).then(() => onSignedIn(paid ? plan : null)).catch((err) => setError((err as Error).message))}
                    >
                      Sign in as test {as}
                    </button>
                  ))}
                </div>
              )}
              {googleOn && (
                <>
                  <a
                    href={googleSignInUrl(paid ? plan : undefined)}
                    className="google-btn"
                    onClick={() => {
                      setPendingPlan(paid ? plan : null);
                      captureEvent("api_signin_requested", { plan, method: "google" });
                    }}
                  >
                    <GoogleMark />
                    Continue with Google
                  </a>
                  <div className="or-rule"><span>or use your email</span></div>
                </>
              )}
              {/* Stacked and full width, like the Google button above, so the button
                  doesn't change size with each plan's label. */}
              <form onSubmit={submit} noValidate style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ position: "relative" }}>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.co.nz"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setBadEmail(false); }}
                    aria-invalid={badEmail}
                    aria-describedby={badEmail ? "email-problem" : undefined}
                    className={`signup-input${badEmail ? " is-invalid" : ""}`}
                    style={{ ...input, width: "100%", height: 42, boxSizing: "border-box", paddingRight: badEmail ? 150 : undefined }}
                  />
                  {badEmail && <span id="email-problem" className="signup-input__problem">Enter a valid email</span>}
                </div>
                {/* The keyboard goes down with the tap, on purpose: the code box takes
                    focus as it appears, and a tap on it brings the keyboard up fresh for
                    it, which is when the phone offers the code from the email. Carried
                    over from here, the keyboard never got that offer. */}
                <button type="submit" disabled={state === "sending"} style={{ ...primaryButton, width: "100%", height: 42 }}>
                  {submitLabel}
                </button>
              </form>
              {error && <p style={errorText}>{error}</p>}
              <p style={{ margin: "12px 0 0", fontSize: 12, color: "#6b7280" }}>
                By continuing you agree to the <Link to="/terms" style={{ color: "#0369a1" }}>Terms</Link> and{" "}
                <Link to="/privacy" style={{ color: "#0369a1" }}>Privacy Policy</Link>.
              </p>
            </>
          )}
        </div>
      </div>
    </DocSection>
  );
}

/**
 * The code boxes on phones: one ordinary input, with six boxes drawn behind it
 * and the digits spaced to land one in each. The desktop boxes (input-otp)
 * hide a doctored input behind them, and the phone never offered the code
 * from the sign-in email for it; an ordinary input is what every other site
 * has, and what the phone's autofill is built for. Pasting keeps the digits
 * whatever came with them.
 */
/**
 * Resolves once the phone keyboard has gone down: the visible area is back to
 * the full window and has stopped changing. Gives up after 600ms, since the
 * page can't always see the keyboard.
 */
function keyboardClosed(): Promise<void> {
  const vv = window.visualViewport;
  if (!vv) return new Promise((done) => window.setTimeout(done, 300));
  return new Promise((done) => {
    const start = performance.now();
    let last = vv.height;
    let steady = 0;
    const tick = () => {
      steady = Math.abs(vv.height - last) < 1 ? steady + 1 : 0;
      last = vv.height;
      const down = window.innerHeight - vv.height < 80 && steady >= 3;
      if (down || performance.now() - start > 600) return done();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function CodeInputPhone({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (raw: string) => void }) {
  const [focused, setFocused] = useState(false);
  const active = Math.min(value.length, 5);
  return (
    <div className="otp-phone">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <span key={i} aria-hidden className={`otp-phone__cell${focused && i === active ? " is-active" : ""}`} />
      ))}
      <input
        className="otp-phone__input"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        aria-label="6-digit code"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        // Tapped while already focused (the keyboard came over from the email
        // box): open the keyboard again for this box, so the phone offers the
        // code from the email the way it does for a box you tapped into.
        onClick={(e) => {
          const el = e.currentTarget;
          if (document.activeElement === el) { el.blur(); el.focus(); }
        }}
      />
    </div>
  );
}

/** The plain-English version of how accounts work, for people who haven't signed up. */
function HowItWorks() {
  const steps: [string, React.ReactNode][] = [
    ["Sign in with a code", "Enter your email and type the 6-digit code we send. No password to remember. Your first sign-in creates your account."],
    ["Save searches", `Star a search to keep it. Save up to ${MAX_SAVED_SEARCHES} and rerun any of them from here.`],
    ["Use the API if you want", <>Make a key here and send it with each request (see the <Link to="/developers" style={{ color: "#0369a1" }}>API docs</Link>). Free covers 500 requests a month; paid plans cover more.</>],
  ];
  return (
    <DocSection id="how-it-works" title="How accounts work">
      <div className="stagger-in stagger-in--slow howto-grid">
        {steps.map(([title, body], i) => (
          <div key={title} style={{ display: "flex", gap: 12 }}>
            <span style={{ width: 26, height: 26, borderRadius: 999, background: "#e0f2fe", color: "#0369a1", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 2 }}>{title}</div>
              <div style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.6 }}>{body}</div>
            </div>
          </div>
        ))}
      </div>
    </DocSection>
  );
}

/** Top right of the heading when signed in: who you are, and the way out. */
function SignedInAs({ account, reload, animate }: { account: AccountData; reload: () => void; animate: boolean }) {
  return (
    <div className={animate ? "acct-who fade-in" : "acct-who"}>
      <div className="acct-who__text">
        <div className="acct-who__label">Signed in as</div>
        <div className="acct-who__email">{account.email}</div>
      </div>
      <button
        type="button"
        className="acct-who__signout"
        onClick={async () => {
          captureEvent("signed_out");
          await signOut();
          resetUser();
          reload();
        }}
      >
        <LogOut size={14} aria-hidden />
        Sign out
      </button>
    </div>
  );
}

function Dashboard({ account, reload, greeted }: { account: AccountData; reload: () => void; greeted: boolean }) {
  // Once per visit: tie this browser to the account, then record what the account looks like.
  useEffect(() => {
    identifyUser(account.analyticsId, { tier: account.tier.id });
    captureEvent("account_viewed", {
      tier: account.tier.id,
      api_keys: account.keys.length,
      saved_searches: account.searches.length,
      requests_used: account.usage.used,
      requests_limit: account.usage.limit,
      usage_pct: Math.round((account.usage.used / account.usage.limit) * 100),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount, not on every reload
  }, []);

  const [keyName, setKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Errors pop up at the top of the screen, so they're seen wherever the page is scrolled to.
  const setError = useCallback((message: string | null) => { if (message) toast.error(message); }, []);
  /** Which Stripe button was clicked (a tier id, or "portal"), while the browser is sent there. */
  const [redirecting, setRedirecting] = useState<string | null>(null);

  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  // A search saved while signed out is waiting in this browser; save it now.
  useEffect(() => {
    const query = takePendingSave();
    if (!query) return;
    saveSearch(query)
      .then((s) => {
        captureEvent("saved_search_added", { source: "after_signin" });
        setSavedNotice(s.name);
        reload();
      })
      .catch((err) => setError((err as Error).message));
  }, [reload, setError]);

  const { used, limit, resetsAt } = account.usage;
  const { billing } = account;
  const pct = Math.min((used / limit) * 100, 100);

  /** Checkout and the billing portal are pages on stripe.com; send the browser there. */
  const goToStripe = async (which: string, event: string, get: () => Promise<{ url: string }>) => {
    setError(null);
    setRedirecting(which);
    captureEvent(event, { tier: which, source: "plans" });
    try {
      window.location.href = (await get()).url;
    } catch (err) {
      setError((err as Error).message);
      setRedirecting(null);
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const { key } = await createApiKey(keyName);
      captureEvent("api_key_created");
      setNewKey(key);
      setCopied(false);
      setKeyName("");
      reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setError(null);
    try {
      await renameApiKey(editing.id, editing.name);
      captureEvent("api_key_renamed");
      setEditing(null);
      reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const revoke = async (id: number) => {
    if (!window.confirm("Revoke this key? Anything using it stops working straight away.")) return;
    setError(null);
    try {
      await revokeApiKey(id);
      captureEvent("api_key_revoked", { keys_left: account.keys.length - 1 });
      reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const copy = async () => {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    captureEvent("api_key_copied");
    setCopied(true);
  };

  const p = { fontSize: 14, color: "#374151", lineHeight: 1.6, margin: "0 0 12px" } as const;

  return (
    <div className={`stagger-in${greeted ? " stagger-in--slow stagger-in--rise stagger-in--after-greeting" : ""} doc-layout doc-layout--plain`}>
      <DocSection id="overview" title="Overview">
        <div className="acct-usage">
          <div className="acct-usage__top">
            <div>
              <span className="acct-usage__num"><AnimatedNumber value={used} /></span>
              <span className="acct-usage__of"> of {limit.toLocaleString("en-NZ")} requests used this month</span>
            </div>
            <span className="acct-usage__reset">Resets {fmtDate(resetsAt)}</span>
          </div>
          <div className="acct-usage__bar">
            <div className="bar-grow" style={{ width: `${pct}%`, background: pct >= 90 ? "#ef4444" : "linear-gradient(90deg,#0ea5e9,#22c55e)" }} />
          </div>
          <div className="acct-usage__facts">
            <span><strong>{account.tier.name}</strong> plan{account.tier.priceNzd > 0 && `, NZ$${account.tier.priceNzd} a month`}</span>
            <span><strong>{account.keys.length}</strong> API {account.keys.length === 1 ? "key" : "keys"}</span>
            <span><strong>{account.searches.length}</strong> saved {account.searches.length === 1 ? "search" : "searches"}</span>
          </div>
        </div>
        <p style={{ ...p, margin: "14px 0 0" }}>
          New to the API? The <Link to="/developers" style={{ color: "#0369a1", fontWeight: 600 }}>API docs</Link> have a quick start and every endpoint.
        </p>
      </DocSection>

      <DocSection id="api-keys" title="API keys">
        <Split
          left={
            <>
              <p style={p}>
                Send a key with every request as a Bearer token. Keys never expire. If one leaks, revoke it and make another.
              </p>
              <form onSubmit={create} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input placeholder="Key name (optional)" value={keyName} maxLength={60} onChange={(e) => setKeyName(e.target.value)} style={{ ...input, flex: "1 1 200px" }} />
                <button type="submit" style={primaryButton}>Create key</button>
              </form>
            </>
          }
          right={
            <>
              {newKey && (
                <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#166534", marginBottom: 8 }}>
                    Copy your new key now. You won't be able to see it again.
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <code style={{ ...code, background: "#ffffff", padding: "6px 8px", borderRadius: 4, border: "1px solid #d1d5db", overflowWrap: "anywhere", flex: 1, minWidth: 0 }}>
                      {newKey}
                    </code>
                    <button style={secondaryButton} onClick={copy}>{copied ? "Copied" : "Copy"}</button>
                  </div>
                </div>
              )}
              {account.keys.length > 0 && (
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 8 }}>
                  {account.keys.map((k, i) => (
                    <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderTop: i ? "1px solid #f3f4f6" : "none", flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {editing?.id === k.id ? (
                          <form onSubmit={saveName} style={{ display: "flex", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                            <input
                              autoFocus
                              aria-label="Key name"
                              value={editing.name}
                              maxLength={60}
                              onChange={(e) => setEditing({ id: k.id, name: e.target.value })}
                              onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                              style={{ ...input, padding: "4px 8px", fontSize: 13 }}
                            />
                            <button type="submit" style={{ ...primaryButton, padding: "4px 12px", fontSize: 12 }}>Save</button>
                            <button type="button" style={{ ...secondaryButton, padding: "4px 12px", fontSize: 12 }} onClick={() => setEditing(null)}>Cancel</button>
                          </form>
                        ) : (
                          <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                            {k.name || "Unnamed key"}
                            <button
                              onClick={() => setEditing({ id: k.id, name: k.name ?? "" })}
                              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, color: "#0369a1", fontWeight: 500 }}
                            >
                              Rename
                            </button>
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: "#6b7280" }}>
                          <span style={code}>{k.prefix}…</span> · created {fmtDate(k.created_at)} · last used {fmtDate(k.last_used_at)}
                        </div>
                      </div>
                      <button style={{ ...secondaryButton, padding: "6px 14px", fontSize: 12, color: "#b91c1c", borderColor: "#fecaca" }} onClick={() => revoke(k.id)}>
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          }
        />
      </DocSection>

      <SavedSearches searches={account.searches} notice={savedNotice} reload={reload} onError={setError} />

      <DocSection id="plans" title="Plan and billing">
        {billing.status === "past_due" && (
          <p style={{ fontSize: 13, color: "#b91c1c", margin: "0 0 12px" }}>
            Your last payment failed. Update your card in Manage billing to keep your plan.
          </p>
        )}
        <div className="stagger-in stagger-in--slow acct-plans">
          {account.tiers.map((t) => {
            const current = t.id === account.tier.id;
            const busy = redirecting !== null;
            const planButton = { padding: "4px 12px", fontSize: 12, borderRadius: 999 } as const;
            return (
              <div key={t.id} className={current ? "acct-plan is-current" : "acct-plan"}>
                <div className="acct-plan__row">
                  <span className="acct-plan__name">{t.name}</span>
                  <span className="acct-plan__price">
                    {t.priceNzd === 0 ? "Free" : `NZ$${t.priceNzd}`}
                    {t.priceNzd > 0 && <span> /mo</span>}
                  </span>
                </div>
                <div className="acct-plan__row">
                  <span className="acct-plan__reqs">{fmtRequests(t)}</span>
                  {current ? (
                    <span className="acct-plan__current">Current plan</span>
                  ) : !billing.enabled ? (
                    <span className="acct-plan__reqs">Coming soon</span>
                  ) : billing.subscribed ? (
                    // Switching or cancelling an existing subscription happens in Stripe's portal.
                    <button style={{ ...secondaryButton, ...planButton, fontWeight: 600 }} disabled={busy} onClick={() => goToStripe(t.id, "billing_portal_opened", openBillingPortal)}>
                      {redirecting === t.id ? "Opening Stripe..." : t.priceNzd === 0 ? "Cancel paid plan" : `Switch to ${t.name}`}
                    </button>
                  ) : t.priceNzd > 0 ? (
                    <button style={{ ...primaryButton, ...planButton, opacity: busy && redirecting !== t.id ? 0.5 : 1 }} disabled={busy} onClick={() => goToStripe(t.id, "checkout_started", () => startCheckout(t.id))}>
                      {redirecting === t.id ? "Opening Stripe..." : "Upgrade"}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        {billing.subscribed && (
          <button style={{ ...secondaryButton, marginTop: 14 }} disabled={redirecting !== null} onClick={() => goToStripe("portal", "billing_portal_opened", openBillingPortal)}>
            {redirecting === "portal" ? "Opening Stripe..." : "Manage billing, invoices and card"}
          </button>
        )}
        <p style={{ fontSize: 12, color: "#6b7280", margin: "14px 0 0" }}>
          Every plan allows {BURST_PER_SECOND} calls a second. Payments are handled by Stripe. Cancel any time; your plan runs to the end of the month you paid for.
        </p>
      </DocSection>
      <Settings account={account} reload={reload} />
      {account.isAdmin && <AdminAccounts />}
    </div>
  );
}

const linkButton: React.CSSProperties = {
  background: "none", border: 0, padding: 0, color: "#0369a1", cursor: "pointer", font: "inherit", fontWeight: 600,
};

function Settings({ account, reload }: { account: AccountData; reload: () => void }) {
  const p = { fontSize: 14, color: "#374151", lineHeight: 1.6, margin: "0 0 12px" } as const;
  const [editingName, setEditingName] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingName === null) return;
    try {
      await setAccountName(editingName);
      captureEvent("name_saved", { source: "settings" });
      setEditingName(null);
      reload();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const everywhere = async () => {
    setBusy(true);
    try {
      captureEvent("signed_out_everywhere");
      await signOutEverywhere();
      resetUser();
      reload();
    } catch (err) {
      toast.error((err as Error).message);
      setBusy(false);
    }
  };

  const remove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmDelete === null) return;
    setBusy(true);
    try {
      await deleteAccount(confirmDelete);
      captureEvent("account_deleted");
      resetUser();
      toast.success("Your account has been deleted.");
      reload();
    } catch (err) {
      toast.error((err as Error).message);
      setBusy(false);
    }
  };

  const row = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 0", borderTop: "1px solid #f1f5f9", fontSize: 14 } as const;
  // Text takes the room and wraps; the action button keeps its line beside it.
  const text = { flex: "1 1 0", minWidth: 0 } as const;
  const action = { flexShrink: 0, whiteSpace: "nowrap" } as const;
  const muted = { color: "#6b7280", fontSize: 13 } as const;

  return (
    <DocSection id="settings" title="Settings">
      <div>
        {/* Editing swaps the name for a box and Change for Save/Cancel in the same
            spots, both a fixed height, so the row never grows or shrinks. */}
        <form onSubmit={saveName} style={{ ...row, borderTop: 0 }}>
          <div style={text}>
            <div style={{ fontWeight: 600 }}>First name</div>
            <div style={{ height: 30, paddingTop: 4, boxSizing: "border-box", display: "flex", alignItems: "center" }}>
              {editingName === null ? (
                <span style={muted}>{account.name ?? "Not set"}</span>
              ) : (
                <input autoFocus required autoComplete="given-name" aria-label="First name" maxLength={40} value={editingName} onChange={(e) => setEditingName(e.target.value)} className="signup-input" style={{ ...input, height: 26, padding: "0 8px", margin: "0 0 0 -9px", fontSize: 13, maxWidth: 220 }} />
              )}
            </div>
          </div>
          {editingName === null ? (
            <button type="button" style={{ ...linkButton, ...action }} onClick={() => setEditingName(account.name ?? "")}>Change</button>
          ) : (
            <div style={{ ...action, display: "flex", gap: 8 }}>
              <button type="submit" style={{ ...primaryButton, padding: "0 12px", height: 26, fontSize: 13 }}>Save</button>
              <button type="button" style={{ ...secondaryButton, padding: "0 12px", height: 26, fontSize: 13 }} onClick={() => setEditingName(null)}>Cancel</button>
            </div>
          )}
        </form>

        <div style={row}>
          <div style={text}>
            <div style={{ fontWeight: 600 }}>Sign out everywhere</div>
            <div style={muted}>Ends every session on every device, including this one.</div>
          </div>
          <button type="button" style={{ ...secondaryButton, ...action, padding: "6px 14px", fontSize: 13 }} disabled={busy} onClick={everywhere}>Sign out everywhere</button>
        </div>

        <div style={row}>
          <div style={text}>
            <div style={{ fontWeight: 600, color: "#b91c1c" }}>Delete account</div>
            <div style={muted}>
              Deletes your account, API keys, usage and saved searches for good. Keys stop working straight away.
              {account.billing.subscribed && " Cancel your paid plan in Manage billing first."}
            </div>
            {confirmDelete !== null && (
              <form onSubmit={remove} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                <input
                  autoFocus
                  type="email"
                  aria-label="Type your email to confirm"
                  placeholder={account.email}
                  value={confirmDelete}
                  onChange={(e) => setConfirmDelete(e.target.value)}
                  style={{ ...input, flex: "1 1 220px", padding: "6px 10px" }}
                />
                <button
                  type="submit"
                  disabled={busy || confirmDelete.trim().toLowerCase() !== account.email}
                  style={{ ...primaryButton, background: "#dc2626", padding: "6px 14px", fontSize: 13, opacity: confirmDelete.trim().toLowerCase() === account.email ? 1 : 0.5 }}
                >
                  Delete for good
                </button>
                <button type="button" style={{ ...secondaryButton, padding: "6px 14px", fontSize: 13 }} onClick={() => setConfirmDelete(null)}>Cancel</button>
              </form>
            )}
          </div>
          {confirmDelete === null && (
            <button
              type="button"
              style={{ ...secondaryButton, ...action, padding: "6px 14px", fontSize: 13, color: "#b91c1c", borderColor: "#fecaca" }}
              onClick={() => setConfirmDelete("")}
            >
              Delete account
            </button>
          )}
        </div>
        {confirmDelete !== null && <p style={{ ...p, ...muted, margin: "4px 0 0" }}>Type your email address above to confirm.</p>}
      </div>
    </DocSection>
  );
}

const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "2-digit" }) : "never";

type AdminSort = "id" | "name" | "email" | "tier" | "created_at" | "last_signin_at" | "last_api_use" | "searches" | "keys" | "requests_this_month" | "requests_total";

const ADMIN_COLUMNS: { key: AdminSort; label: string; num?: boolean }[] = [
  { key: "id", label: "#", num: true },
  { key: "name", label: "First name" },
  { key: "email", label: "Email" },
  { key: "tier", label: "Plan" },
  { key: "created_at", label: "Joined" },
  { key: "last_signin_at", label: "Last in" },
  { key: "last_api_use", label: "Last API call" },
  { key: "searches", label: "Searches", num: true },
  { key: "keys", label: "Keys", num: true },
  { key: "requests_this_month", label: "This month", num: true },
  { key: "requests_total", label: "All time", num: true },
];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const withinWeek = (iso: string | null) => !!iso && Date.now() - new Date(iso).getTime() < WEEK_MS;

/** Every account on the site, for whoever is listed in ADMIN_EMAILS. */
function AdminAccounts() {
  const [rows, setRows] = useState<AdminAccount[] | null>(null);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<{ key: AdminSort; desc: boolean }>({ key: "id", desc: true });
  const [open, setOpen] = useState<number | null>(null);
  const [confirm, setConfirm] = useState("");
  const load = useCallback(() => {
    fetchAdminAccounts().then((r) => setRows(r.accounts)).catch((err) => toast.error((err as Error).message));
  }, []);
  useEffect(load, [load]);

  const remove = async (r: AdminAccount) => {
    try {
      await adminDeleteAccount(r.id, confirm);
      toast.success(`Deleted ${r.email}`);
      setOpen(null);
      setConfirm("");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const q = filter.trim().toLowerCase();
  const shown = (rows ?? [])
    .filter((r) => !q || r.email.includes(q) || (r.name ?? "").toLowerCase().includes(q) || r.tier.includes(q))
    .sort((a, b) => {
      const x = a[sort.key] ?? "", y = b[sort.key] ?? "";
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return sort.desc ? -c : c;
    });
  const all = rows ?? [];
  const paid = all.filter((r) => r.tier !== "free").length;
  const requests = all.reduce((n, r) => n + r.requests_this_month, 0);
  const lastMonth = all.reduce((n, r) => n + r.requests_last_month, 0);
  const newThisWeek = all.filter((r) => withinWeek(r.created_at)).length;
  const activeThisWeek = all.filter((r) => withinWeek(r.last_signin_at) || withinWeek(r.last_api_use)).length;
  const google = all.filter((r) => r.google).length;

  const sortBy = (key: AdminSort) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: !["name", "email", "tier"].includes(key) }));

  return (
    <DocSection id="all-accounts" title="All accounts">
      {!rows ? (
        <SkeletonBlock height={160} />
      ) : (
        <>
          <div className="acct-usage__facts" style={{ marginBottom: 12 }}>
            <span><strong><AnimatedNumber value={rows.length} /></strong> accounts</span>
            <span><strong><AnimatedNumber value={newThisWeek} /></strong> new this week</span>
            <span><strong><AnimatedNumber value={activeThisWeek} /></strong> active this week</span>
            <span><strong><AnimatedNumber value={paid} /></strong> paying</span>
            <span><strong><AnimatedNumber value={google} /></strong> use Google</span>
            <span><strong><AnimatedNumber value={requests} /></strong> API requests this month</span>
            <span><strong><AnimatedNumber value={lastMonth} /></strong> last month</span>
          </div>
          <input
            placeholder="Filter by name, email or plan"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ ...input, maxWidth: 320, marginBottom: 12 }}
          />
          <div className="admin-sort">
            <label>
              Sort by
              <select value={sort.key} onChange={(e) => sortBy(e.target.value as AdminSort)} style={{ ...input, width: "auto", padding: "6px 10px", fontSize: 13 }}>
                {ADMIN_COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.key === "id" ? "Newest" : c.label}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => setSort((s) => ({ ...s, desc: !s.desc }))} style={{ ...secondaryButton, padding: "6px 12px", fontSize: 13 }}>
              {sort.desc ? "High to low ↓" : "Low to high ↑"}
            </button>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  {ADMIN_COLUMNS.map((c) => (
                    <th key={c.key} className={c.num ? "num" : undefined} aria-sort={sort.key === c.key ? (sort.desc ? "descending" : "ascending") : undefined}>
                      <button type="button" className="admin-table__sort" onClick={() => sortBy(c.key)}>
                        {c.label}{sort.key === c.key ? (sort.desc ? " ↓" : " ↑") : ""}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <Fragment key={r.id}>
                    <tr className={`admin-table__row${open === r.id ? " is-open" : ""}`} onClick={() => { setOpen(open === r.id ? null : r.id); setConfirm(""); }}>
                      <td className="num muted admin-table__id">#{r.id}</td>
                      <td className="admin-table__name">{r.name ?? <span className="muted">no name yet</span>}</td>
                      <td className="admin-table__email">{r.email}</td>
                      <td data-label="Plan">{TIERS[r.tier as TierId]?.name ?? r.tier}{r.subscription_status && r.subscription_status !== "active" ? ` (${r.subscription_status})` : ""}</td>
                      <td data-label="Joined">{shortDate(r.created_at)}</td>
                      <td data-label="Last in">{shortDate(r.last_signin_at)}</td>
                      <td data-label="Last API">{shortDate(r.last_api_use)}</td>
                      <td data-label="Searches" className="num">{r.searches}</td>
                      <td data-label="Keys" className="num">{r.keys}</td>
                      <td data-label="This month" className="num">{r.requests_this_month.toLocaleString("en-NZ")}</td>
                      <td data-label="All time" className="num">{r.requests_total.toLocaleString("en-NZ")}</td>
                    </tr>
                    {open === r.id && (
                      <tr className="admin-table__detail">
                        <td colSpan={ADMIN_COLUMNS.length}>
                          <dl>
                            <dt>Signs in with</dt><dd>{r.google ? "Google and email" : "Email"}</dd>
                            <dt>Signed in on</dt><dd>{r.sessions} {r.sessions === 1 ? "device" : "devices"}</dd>
                            <dt>Joined</dt><dd>{new Date(r.created_at).toLocaleString("en-NZ")}</dd>
                            <dt>Last in</dt><dd>{r.last_signin_at ? new Date(r.last_signin_at).toLocaleString("en-NZ") : "never"}</dd>
                            <dt>Last API call</dt><dd>{r.last_api_use ? new Date(r.last_api_use).toLocaleString("en-NZ") : "never"}</dd>
                            <dt>Requests</dt><dd>{r.requests_this_month.toLocaleString("en-NZ")} this month, {r.requests_last_month.toLocaleString("en-NZ")} last month, {r.requests_total.toLocaleString("en-NZ")} all time</dd>
                            <dt>Subscription</dt><dd>{r.subscription_status ?? "none"}</dd>
                            <dt>Stripe</dt>
                            <dd>
                              {r.stripe_customer_id
                                ? <a href={`https://dashboard.stripe.com/customers/${r.stripe_customer_id}`} target="_blank" rel="noreferrer">{r.stripe_customer_id}</a>
                                : <span className="muted">no customer</span>}
                            </dd>
                            <dt>API keys</dt><dd>{r.key_list ? r.key_list.split("\n").join(", ") : <span className="muted">none</span>}</dd>
                            <dt>Saved searches</dt><dd>{r.search_list ? r.search_list.split("\n").join(", ") : <span className="muted">none</span>}</dd>
                          </dl>
                          <form className="admin-table__delete" onSubmit={(e) => { e.preventDefault(); remove(r); }}>
                            <label htmlFor={`admin-delete-${r.id}`}>
                              To delete this account, type its email: <strong>{r.email}</strong>
                            </label>
                            <div className="admin-table__delete-row">
                              <input
                                id={`admin-delete-${r.id}`}
                                type="email"
                                autoCapitalize="none"
                                autoCorrect="off"
                                spellCheck={false}
                                placeholder={r.email}
                                value={confirm}
                                onChange={(e) => setConfirm(e.target.value)}
                                style={{ ...input, fontSize: 16 }}
                              />
                              <button type="submit" className="admin-table__delete-btn" disabled={confirm.trim().toLowerCase() !== r.email}>
                                Delete account
                              </button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {shown.length === 0 && (
                  <tr><td colSpan={ADMIN_COLUMNS.length} className="muted">No accounts match.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </DocSection>
  );
}

function SavedSearches({ searches, notice, reload, onError }: {
  searches: SavedSearch[];
  notice: string | null;
  reload: () => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);

  const rename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    try {
      await renameSavedSearch(editing.id, editing.name);
      captureEvent("saved_search_renamed", { source: "account_page" });
      setEditing(null);
      reload();
    } catch (err) {
      onError((err as Error).message);
    }
  };

  const remove = async (id: number) => {
    try {
      await deleteSavedSearch(id);
      captureEvent("saved_search_removed", { source: "account_page" });
      reload();
    } catch (err) {
      onError((err as Error).message);
    }
  };

  return (
    <DocSection id="saved-searches" title="Saved searches">
      {notice && (
        <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#166534" }}>
          Saved "{notice}".
        </div>
      )}
      {searches.length === 0 ? (
        <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>
          No saved searches yet. Run a search and press <strong>Save search</strong> to keep it here.{" "}
          <Link to="/" style={{ color: "#0369a1" }}>Go to search</Link>
        </p>
      ) : (
        <>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 8 }}>
            {searches.map((s, i) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderTop: i ? "1px solid #f3f4f6" : "none", flexWrap: "wrap" }}>
                <Star size={14} fill="#f59e0b" color="#f59e0b" style={{ flexShrink: 0 }} />
                {/* Grows to fill the row, but wraps the buttons underneath rather than shrink below 200px. */}
                <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                  {editing?.id === s.id ? (
                    <form onSubmit={rename} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <input
                        autoFocus
                        aria-label="Search name"
                        value={editing.name}
                        maxLength={MAX_SAVED_SEARCH_NAME}
                        onChange={(e) => setEditing({ id: s.id, name: e.target.value })}
                        onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                        style={{ ...input, padding: "4px 8px", fontSize: 13 }}
                      />
                      <button type="submit" style={{ ...primaryButton, padding: "4px 12px", fontSize: 12 }}>Save</button>
                      <button type="button" style={{ ...secondaryButton, padding: "4px 12px", fontSize: 12 }} onClick={() => setEditing(null)}>Cancel</button>
                    </form>
                  ) : (
                    <>
                      <a
                        href={`/?${s.query}`}
                        onClick={() => captureEvent("saved_search_opened", { source: "account_page" })}
                        style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", textDecoration: "none", overflowWrap: "anywhere" }}
                      >
                        {s.name}
                      </a>
                      <div style={{ fontSize: 11, color: "#6b7280" }}>Saved {fmtDate(s.created_at)}</div>
                    </>
                  )}
                </div>
                {editing?.id !== s.id && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <a href={`/?${s.query}`} style={{ ...primaryButton, padding: "6px 14px", fontSize: 12, textDecoration: "none" }}>Open</a>
                    <button style={{ ...secondaryButton, padding: "6px 14px", fontSize: 12 }} onClick={() => setEditing({ id: s.id, name: s.name })}>Rename</button>
                    <button style={{ ...secondaryButton, padding: "6px 14px", fontSize: 12, color: "#b91c1c", borderColor: "#fecaca" }} onClick={() => remove(s.id)}>Delete</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: "#6b7280", margin: "10px 0 0" }}>
            {searches.length} of {MAX_SAVED_SEARCHES} saved.
          </p>
        </>
      )}
    </DocSection>
  );
}

export default function Account() {
  // Read once: the save is taken out of storage when the dashboard saves it.
  const [pendingSave] = useState(hasPendingSave);
  // A paid plan picked on the docs or pricing links (?plan=pro), before or after signing in.
  const [urlPlan] = useState(() => paidPlan(new URLSearchParams(window.location.search).get("plan")));
  const [account, setAccount] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  // While the session check runs, the heading uses last visit's answer, so signed-out
  // visitors don't see "Your account" flash before it flips to "Sign in or sign up".
  const [wasSignedIn] = useState(() => {
    try { return localStorage.getItem(SIGNED_IN_KEY) === "1"; } catch { return false; }
  });
  const [lastName] = useState(() => {
    try { return localStorage.getItem(SIGNED_IN_NAME_KEY); } catch { return null; }
  });
  useEffect(() => {
    if (loading) return;
    try {
      if (account) localStorage.setItem(SIGNED_IN_KEY, "1");
      else localStorage.removeItem(SIGNED_IN_KEY);
      if (account?.name) localStorage.setItem(SIGNED_IN_NAME_KEY, account.name);
      else localStorage.removeItem(SIGNED_IN_NAME_KEY);
    } catch { /* storage blocked: fall back to the signed-out heading */ }
  }, [account, loading]);
  // An account with no name yet is still finishing sign-up, on the sign-in screen.
  // Finishing sign-in from this page, the sign-in screen fades out before the account
  // builds in; arriving already signed in, the account shows straight away.
  const wantDashboard = !!account?.name;
  const [dashboardShown, setDashboardShown] = useState(false);
  const handoff = useRef(false);
  /** Arrived by finishing sign-in: the greeting lands first, then the account below it. */
  const [greeted, setGreeted] = useState(false);
  useLayoutEffect(() => {
    if (wantDashboard === dashboardShown) return;
    if (!wantDashboard || !handoff.current) {
      setGreeted(false);
      return setDashboardShown(wantDashboard);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
    // The footer leaves with the sign-in screen: on a short page it sits in view,
    // and would ride up and down with the scroll before the account pushes it away.
    const root = document.documentElement;
    root.classList.add("signin-handoff");
    const t = window.setTimeout(() => { handoff.current = false; setGreeted(true); setDashboardShown(true); }, 500);
    return () => window.clearTimeout(t);
  }, [wantDashboard, dashboardShown]);
  // ...and comes back once the account has risen into place.
  useEffect(() => {
    if (!greeted) return;
    const t = window.setTimeout(() => document.documentElement.classList.remove("signin-handoff"), 1100);
    return () => { window.clearTimeout(t); document.documentElement.classList.remove("signin-handoff"); };
  }, [greeted]);
  const leavingSignIn = wantDashboard && !dashboardShown;
  // Fetched alongside the account, so the Google button builds in with the rest of the form.
  const [authOptions, setAuthOptions] = useState<AuthOptions | null>(null);
  useEffect(() => {
    fetchAuthOptions().then(setAuthOptions).catch(() => setAuthOptions({ google: false }));
  }, []);
  const devLogin = !!authOptions?.devLogin;
  const showDashboard = account ? dashboardShown : loading && wasSignedIn;
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** A paid plan to send the browser to checkout for, once the account has loaded. */
  const [checkoutPlan, setCheckoutPlan] = useState<TierId | null>(null);

  useEffect(() => {
    applySeo({
      title: "Account | NZ Vehicle Finder",
      description: "Your NZ Vehicle Finder saved searches, API keys, usage and plan.",
      canonical: "https://vehiclefinder.co.nz/account",
      noindex: true,
    });
  }, []);

  const reload = useCallback(() => {
    fetchAccount()
      .then(setAccount)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const billingResult = query.get("billing");
    if (billingResult === "success") {
      // Back from Stripe checkout. Pull the new plan now rather than waiting on the webhook.
      window.history.replaceState(null, "", "/account");
      captureEvent("checkout_completed");
      setNotice("Payment done. Your new plan is active.");
      syncBilling().catch(() => {}).finally(reload);
      return;
    }
    if (billingResult === "cancelled") {
      window.history.replaceState(null, "", "/account");
      captureEvent("checkout_cancelled");
      setNotice("Checkout cancelled, nothing was charged. You can upgrade any time from Plans below.");
      return reload();
    }
    if (query.get("signin") === "google_failed") {
      window.history.replaceState(null, "", "/account");
      setError("Google sign-in didn't finish. Try again, or use your email instead.");
      return reload();
    }
    const token = query.get("token");
    if (!token) {
      // Signed in already and came from a "Choose Pro" link: straight to checkout.
      if (urlPlan) setCheckoutPlan(urlPlan);
      return reload();
    }
    // Take the one-time token out of the address bar and history before using it.
    window.history.replaceState(null, "", "/account");
    verifySignInToken(token)
      .then(() => {
        captureEvent("signin_link_opened", { result: "ok" });
        // The plan picked at sign-up: from the link, or this browser if the link lost it.
        const plan = urlPlan ?? takePendingPlan();
        setPendingPlan(null);
        if (plan) setCheckoutPlan(plan);
      })
      .catch((err) => {
        captureEvent("signin_link_opened", { result: "rejected" });
        setError((err as Error).message);
      })
      .finally(reload);
  }, [reload, urlPlan]);

  // Signed in with a paid plan waiting: open Stripe checkout for it.
  useEffect(() => {
    if (!account?.name || !checkoutPlan) return;
    const tier = TIERS[checkoutPlan];
    setCheckoutPlan(null);
    if (window.location.search) window.history.replaceState(null, "", "/account");
    if (account.tier.id === checkoutPlan) return setNotice(`You're already on ${tier.name}.`);
    if (!account.billing.enabled) return setNotice(`Paid plans aren't open yet. You're on ${account.tier.name} for now.`);
    if (account.billing.subscribed) {
      return setNotice(`You already pay for ${account.tier.name}. Use "Switch to ${tier.name}" under Plans to change.`);
    }
    setNotice(`Taking you to secure checkout for ${tier.name}...`);
    captureEvent("checkout_started", { tier: checkoutPlan, source: "signup_flow" });
    startCheckout(checkoutPlan)
      .then(({ url }) => { window.location.href = url; })
      .catch((err) => {
        setNotice(null);
        setError((err as Error).message);
      });
  }, [account, checkoutPlan]);

  return (
    <PageShell
      source="account_page"
      subtitle="Your account"
      crumb="Account"
      // Keyed, so a new heading fades up instead of swapping in place.
      title={<span key={showDashboard ? "in" : "out"} className={leavingSignIn ? "leave-fade" : showDashboard && !greeted ? undefined : "fade-in fade-in--slow"} style={{ display: "block" }}>
        {showDashboard ? (account?.name || (!account && lastName) ? `Hey, ${account?.name ?? lastName}` : "Your account") : "Sign in or sign up"}
      </span>}
      intro={<span key={showDashboard ? "in" : "out"} className={leavingSignIn ? "leave-fade" : showDashboard && !greeted ? undefined : "fade-in fade-in--slow"} style={{ display: "block", animationDelay: leavingSignIn ? "0ms" : "120ms" }}>
        {showDashboard
          ? "Your API usage, keys, saved searches and plan."
          : "Your home for saved searches and API keys."}
      </span>}
      aside={account && showDashboard ? <SignedInAs account={account} reload={reload} animate={greeted} /> : false}
    >
      {notice && (
        <div className="page-band" style={{ padding: "10px 24px", background: "#f0f9ff", borderBottom: "1px solid #bae6fd", color: "#0369a1", fontSize: 13, fontWeight: 600 }}>{notice}</div>
      )}
      {error && (
        <div className="page-band" style={{ padding: "10px 24px", background: "#fef2f2", borderBottom: "1px solid #fecaca", color: "#b91c1c", fontSize: 13 }}>{error}</div>
      )}
      {loading || (!(account && dashboardShown) && !authOptions) ? (
        <div className="skeleton-late page-band" aria-busy="true" style={{ padding: "24px", display: "grid", gap: 16 }}><SkeletonBlock height={120} /><SkeletonBlock height={260} /></div>
      ) : account && dashboardShown ? (
        <>
          {devLogin && (
            <div className="page-band" style={{ padding: "12px 24px 0" }}>
              <div className="dev-login" style={{ margin: 0 }}>
                <span>Local dev</span>
                <button type="button" onClick={() => devForgetName().then(reload).catch((err) => setError((err as Error).message))}>
                  Replay name step
                </button>
              </div>
            </div>
          )}
          <Dashboard account={account} reload={reload} greeted={greeted} />
        </>
      ) : (
        // Two short sections need no menu; same section styling as the docs, full width.
        <div className={`stagger-in stagger-in--slow doc-layout doc-layout--plain signin-fill${leavingSignIn ? " is-leaving-all" : ""}`}>
          <SignIn
            options={authOptions!}
            pendingSave={pendingSave}
            initialPlan={checkoutPlan ?? urlPlan ?? "free"}
            naming={!!account}
            onSignedIn={(plan) => {
              handoff.current = true;
              setPendingPlan(null);
              if (plan) setCheckoutPlan(plan);
              reload();
            }}
            onNamed={(plan) => {
              handoff.current = true;
              setCheckoutPlan(plan);
              reload();
            }}
            onSignOut={async () => {
              captureEvent("signup_back_from_name");
              await signOut();
              resetUser();
              setCheckoutPlan(null);
              reload();
            }}
          />
          <HowItWorks />
        </div>
      )}
    </PageShell>
  );
}
