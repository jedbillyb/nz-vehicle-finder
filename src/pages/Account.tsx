import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { applySeo } from "@/lib/seo";
import { captureEvent, identifyUser, resetUser } from "@/lib/posthog";
import {
  createApiKey, deleteSavedSearch, deleteAccount, fetchAccount, fetchAdminAccounts, signOutEverywhere, fetchAuthOptions, googleSignInUrl, setAccountName, hasPendingSave, openBillingPortal, paidPlan, renameApiKey, renameSavedSearch, requestSignInLink,
  revokeApiKey, saveSearch, setPendingPlan, signOut, startCheckout, syncBilling, takePendingPlan, takePendingSave, verifySignInCode, verifySignInToken,
  type Account as AccountData, type AdminAccount, type SavedSearch,
} from "@/lib/account";
import { PageShell } from "@/components/PageShell";
import { DocSection, Split } from "@/components/DocLayout";
import { code, input, label, primaryButton, secondaryButton } from "@/lib/pageStyles";
import { BURST_PER_SECOND, TIERS, TIER_ORDER, type Tier, type TierId } from "../../shared/apiTiers";
import { MAX_SAVED_SEARCH_NAME, MAX_SAVED_SEARCHES } from "../../shared/savedSearch";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { LoadingDots } from "@/components/LoadingDots";
import { SkeletonBlock } from "@/components/SkeletonRows";
import { AnimatedNumber } from "@/components/NumberSlot";

const SIGNED_IN_KEY = "nzvf_signed_in";

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" }) : "Never";

const panel: React.CSSProperties = { background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "16px 20px" };
const errorText: React.CSSProperties = { color: "#b91c1c", fontSize: 13, margin: "10px 0 0" };

const fmtRequests = (t: Tier) => `${t.monthlyRequests.toLocaleString("en-NZ")} requests a month`;

/** One plan as a selectable row: name and allowance on the left, price on the right. */
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

function SignIn({ pendingSave, initialPlan, onSignedIn }: {
  pendingSave: boolean;
  initialPlan: TierId;
  /** Called after a typed code signs this tab in, with the paid plan picked here (if any). */
  onSignedIn: (plan: TierId | null) => void;
}) {
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState<TierId>(initialPlan);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [checking, setChecking] = useState(false);
  const [googleOn, setGoogleOn] = useState(false);
  /** Seconds until another code can be sent; the server allows one a minute per email. */
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);
  useEffect(() => {
    fetchAuthOptions().then((o) => setGoogleOn(o.google)).catch(() => {});
  }, []);
  const tier = TIERS[plan];
  const paid = tier.priceNzd > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    setError(null);
    try {
      await requestSignInLink(email, paid ? plan : undefined);
      setPendingPlan(paid ? plan : null);
      captureEvent("api_signin_requested", { plan });
      setTyped("");
      setCooldown(60);
      setState("sent");
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
  };

  /** Stays on the code screen: a new email, and the old code stops working. */
  const resend = async () => {
    setError(null);
    setCooldown(60);
    try {
      await requestSignInLink(email, paid ? plan : undefined);
      captureEvent("signin_code_resent");
      setTyped("");
      toast.success("New code sent. Use the newest email.");
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
      setChecking(false);
    }
  };

  const onCodeChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 6);
    setTyped(digits);
    // Six digits is the whole code: check it without waiting for a click.
    if (digits.length === 6) checkCode(digits);
  };

  return (
    <DocSection id="sign-in" title="Create an account or sign in">
      {pendingSave && state !== "sent" && (
        <div style={{ ...panel, marginBottom: 12, background: "#fffbeb", borderColor: "#fcd34d", fontSize: 14, color: "#92400e", display: "flex", gap: 8, alignItems: "center" }}>
          <Star size={14} fill="#f59e0b" color="#f59e0b" style={{ flexShrink: 0 }} />
          Sign in to save your search. It's saved to your account as soon as you're in.
        </div>
      )}
      <div className="signup-grid">
        <div>
          <div style={{ ...label, marginBottom: 8 }}>1. Pick a plan</div>
          <div role="radiogroup" aria-label="Plan" className="stagger-in stagger-in--slow" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {TIER_ORDER.map((id) => (
              <PlanOption
                key={id}
                tier={TIERS[id]}
                selected={id === plan}
                onSelect={() => {
                  if (state === "sent") return;
                  setPlan(id);
                  captureEvent("plan_selected", { plan: id, source: "signup" });
                }}
              />
            ))}
          </div>
          <p style={{ fontSize: 12, color: "#6b7280", margin: "10px 0 0" }}>
            Every plan gets every endpoint and filter. Change or cancel any time.
          </p>
        </div>

        <div>
          <div style={{ ...label, marginBottom: 8 }}>2. Your email</div>
          {state === "sent" ? (
            <>
              <p style={{ margin: "0 0 14px", fontSize: 14, color: "#374151", lineHeight: 1.6 }}>
                We emailed a 6-digit code to <strong>{email}</strong>. Type it here, or open the link in the email.
                {paid && <> Then you go straight to secure checkout for <strong>{tier.name}</strong>.</>}
              </p>
              <form onSubmit={(e) => { e.preventDefault(); if (typed.length === 6) checkCode(typed); }} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  aria-label="6-digit code"
                  placeholder="123456"
                  maxLength={7}
                  value={typed}
                  disabled={checking}
                  onChange={(e) => onCodeChange(e.target.value)}
                  style={{ ...input, flex: "0 1 160px", fontFamily: "'JetBrains Mono', monospace", fontSize: 20, letterSpacing: "0.3em", textAlign: "center" }}
                />
                <button type="submit" disabled={checking || typed.length !== 6} style={{ ...primaryButton, opacity: typed.length === 6 ? 1 : 0.5 }}>
                  {checking ? "Checking..." : "Sign in"}
                </button>
              </form>
              {error && <p style={errorText}>{error}</p>}
              <p style={{ margin: "12px 0 0", fontSize: 12, color: "#6b7280", display: "flex", gap: 14, flexWrap: "wrap" }}>
                <span>Expires in 15 minutes.</span>
                <button
                  type="button"
                  disabled={cooldown > 0 || checking}
                  onClick={resend}
                  style={{ ...linkButton, fontWeight: 400, textDecoration: cooldown > 0 ? "none" : "underline", color: cooldown > 0 ? "#9ca3af" : "#0369a1", cursor: cooldown > 0 ? "default" : "pointer" }}
                >
                  {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
                </button>
                <button
                  type="button"
                  onClick={() => { setState("idle"); setError(null); }}
                  style={{ ...linkButton, fontWeight: 400, textDecoration: "underline" }}
                >
                  Use a different email
                </button>
              </p>
            </>
          ) : (
            <>
              <p style={{ margin: "0 0 14px", fontSize: 14, color: "#374151", lineHeight: 1.6 }}>
                We'll email you a 6-digit code. No password. New here? Signing in creates your account.
                {paid
                  ? <> Then you go straight to Stripe to pay NZ${tier.priceNzd} a month for <strong>{tier.name}</strong>.</>
                  : <> No card needed.</>}
              </p>
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
              <form onSubmit={submit} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.co.nz"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ ...input, flex: "1 1 220px" }}
                />
                <button type="submit" disabled={state === "sending"} style={primaryButton}>
                  {state === "sending" ? "Sending..." : paid ? `Continue with ${tier.name}` : "Email me a code"}
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

/** The plain-English version of how accounts work, for people who haven't signed up. */
function HowItWorks() {
  const steps: [string, string][] = [
    ["Sign in with a code", "Enter your email and type the 6-digit code we send. No password to remember. Your first sign-in creates your account."],
    ["Create an API key", "Make a key on this page and send it with each request. Keys never expire; revoke one any time."],
    ["Pay only for more", "Free covers 500 requests a month. Paid plans bill monthly through Stripe and can be changed or cancelled whenever."],
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
      <p style={{ fontSize: 13, color: "#6b7280", margin: "16px 0 0" }}>
        Your account also keeps your saved searches. See the <Link to="/developers" style={{ color: "#0369a1" }}>API docs</Link> for endpoints and examples.
      </p>
    </DocSection>
  );
}

/** Top right of the heading when signed in: who you are, and the way out. */
function SignedInAs({ account, reload }: { account: AccountData; reload: () => void }) {
  return (
    <div className="acct-who">
      <div className="acct-who__label">Signed in as</div>
      {account.name && <div className="acct-who__name">{account.name}</div>}
      <div className={account.name ? "acct-who__plan" : "acct-who__email"} style={account.name ? { margin: 0, overflowWrap: "anywhere" } : undefined}>{account.email}</div>
      <div className="acct-who__plan">{account.tier.name} plan</div>
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
        Sign out
      </button>
    </div>
  );
}

function Dashboard({ account, reload }: { account: AccountData; reload: () => void }) {
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
    <div className="stagger-in stagger-in--slow doc-layout doc-layout--plain">
      {!account.name && <NamePrompt reload={reload} />}
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
              {account.keys.length === 0 ? (
                <p style={{ ...p, color: "#6b7280", margin: 0 }}>No keys yet. Create one to start calling the API.</p>
              ) : (
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

  const row = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 0", borderTop: "1px solid #f1f5f9", fontSize: 14 } as const;
  const muted = { color: "#6b7280", fontSize: 13 } as const;

  return (
    <DocSection id="settings" title="Settings">
      <div style={{ maxWidth: 640 }}>
        <div style={{ ...row, borderTop: 0 }}>
          <div>
            <div style={{ fontWeight: 600 }}>First name</div>
            {editingName === null && <div style={muted}>{account.name ?? "Not set"}</div>}
          </div>
          {editingName === null ? (
            <button type="button" style={linkButton} onClick={() => setEditingName(account.name ?? "")}>Change</button>
          ) : (
            <form onSubmit={saveName} style={{ display: "flex", gap: 8, flex: "1 1 280px", justifyContent: "flex-end" }}>
              <input autoFocus required autoComplete="given-name" aria-label="First name" maxLength={40} value={editingName} onChange={(e) => setEditingName(e.target.value)} style={{ ...input, flex: "1 1 160px", padding: "6px 10px" }} />
              <button type="submit" style={{ ...primaryButton, padding: "6px 14px", fontSize: 13 }}>Save</button>
              <button type="button" style={{ ...secondaryButton, padding: "6px 14px", fontSize: 13 }} onClick={() => setEditingName(null)}>Cancel</button>
            </form>
          )}
        </div>

        <div style={row}>
          <div>
            <div style={{ fontWeight: 600 }}>Sign-in methods</div>
            <div style={muted}>
              Emailed code to {account.email}
              {account.google ? " · Google linked" : ". Google links itself the first time you use Continue with Google with this email."}
            </div>
          </div>
        </div>

        <div style={row}>
          <div>
            <div style={{ fontWeight: 600 }}>Sign out everywhere</div>
            <div style={muted}>Ends every session on every device, including this one.</div>
          </div>
          <button type="button" style={{ ...secondaryButton, padding: "6px 14px", fontSize: 13 }} disabled={busy} onClick={everywhere}>Sign out everywhere</button>
        </div>

        <div style={row}>
          <div style={{ flex: "1 1 300px" }}>
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
              style={{ ...secondaryButton, padding: "6px 14px", fontSize: 13, color: "#b91c1c", borderColor: "#fecaca" }}
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

/** Shown once, straight after the first sign-in, until a name is saved. */
function NamePrompt({ reload }: { reload: () => void }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await setAccountName(name);
      captureEvent("name_saved");
      reload();
    } catch (err) {
      toast.error((err as Error).message);
      setSaving(false);
    }
  };
  return (
    <DocSection id="name" title="What should we call you?">
      <form onSubmit={save} style={{ display: "flex", gap: 8, flexWrap: "wrap", maxWidth: 520 }}>
        <input
          autoFocus
          required
          autoComplete="given-name"
          aria-label="First name"
          placeholder="First name"
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ ...input, flex: "1 1 220px" }}
        />
        <button type="submit" disabled={saving || !name.trim()} style={{ ...primaryButton, opacity: name.trim() ? 1 : 0.5 }}>
          {saving ? "Saving..." : "Save"}
        </button>
      </form>
    </DocSection>
  );
}

const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "2-digit" }) : "never";

/** Every account on the site, for whoever is listed in ADMIN_EMAILS. */
function AdminAccounts() {
  const [rows, setRows] = useState<AdminAccount[] | null>(null);
  const [filter, setFilter] = useState("");
  useEffect(() => {
    fetchAdminAccounts().then((r) => setRows(r.accounts)).catch((err) => toast.error((err as Error).message));
  }, []);

  const q = filter.trim().toLowerCase();
  const shown = (rows ?? []).filter((r) => !q || r.email.includes(q) || (r.name ?? "").toLowerCase().includes(q));
  const paid = (rows ?? []).filter((r) => r.tier !== "free").length;
  const requests = (rows ?? []).reduce((n, r) => n + r.requests_this_month, 0);

  return (
    <DocSection id="all-accounts" title="All accounts">
      {!rows ? (
        <SkeletonBlock height={160} />
      ) : (
        <>
          <div className="acct-usage__facts" style={{ marginBottom: 12 }}>
            <span><strong><AnimatedNumber value={rows.length} /></strong> accounts</span>
            <span><strong><AnimatedNumber value={paid} /></strong> paying</span>
            <span><strong><AnimatedNumber value={requests} /></strong> API requests this month</span>
          </div>
          <input
            placeholder="Filter by name or email"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ ...input, maxWidth: 320, marginBottom: 12 }}
          />
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>First name</th><th>Email</th><th>Plan</th><th>Sign-in</th><th>Joined</th><th>Last in</th>
                  <th className="num">Keys</th><th className="num">Requests</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name ?? <span className="muted">no name yet</span>}</td>
                    <td>{r.email}</td>
                    <td>{TIERS[r.tier as TierId]?.name ?? r.tier}{r.subscription_status && r.subscription_status !== "active" ? ` (${r.subscription_status})` : ""}</td>
                    <td>{r.google ? "Google" : "Email"}</td>
                    <td>{shortDate(r.created_at)}</td>
                    <td>{shortDate(r.last_signin_at)}</td>
                    <td className="num">{r.keys}</td>
                    <td className="num">{r.requests_this_month.toLocaleString("en-NZ")}</td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr><td colSpan={8} className="muted">No accounts match.</td></tr>
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
  // visitors don't see "Your account" flash before it flips to "Get an API key".
  const [wasSignedIn] = useState(() => {
    try { return localStorage.getItem(SIGNED_IN_KEY) === "1"; } catch { return false; }
  });
  useEffect(() => {
    if (loading) return;
    try {
      if (account) localStorage.setItem(SIGNED_IN_KEY, "1");
      else localStorage.removeItem(SIGNED_IN_KEY);
    } catch { /* storage blocked: fall back to the signed-out heading */ }
  }, [account, loading]);
  const showAccount = account || (loading && wasSignedIn);
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
    if (!account || !checkoutPlan) return;
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
      title={showAccount ? "Your account" : "Get an API key"}
      intro={
        showAccount
          ? "Your API usage, keys, saved searches and plan."
          : "Start free with 500 requests a month, or pick a paid plan and go straight to checkout."
      }
      aside={account ? <SignedInAs account={account} reload={reload} /> : false}
    >
      {notice && (
        <div className="page-band" style={{ padding: "10px 24px", background: "#f0f9ff", borderBottom: "1px solid #bae6fd", color: "#0369a1", fontSize: 13, fontWeight: 600 }}>{notice}</div>
      )}
      {error && (
        <div className="page-band" style={{ padding: "10px 24px", background: "#fef2f2", borderBottom: "1px solid #fecaca", color: "#b91c1c", fontSize: 13 }}>{error}</div>
      )}
      {loading ? (
        <div className="skeleton-late page-band" aria-busy="true" style={{ padding: "24px", display: "grid", gap: 16 }}><SkeletonBlock height={120} /><SkeletonBlock height={260} /></div>
      ) : account ? (
        <Dashboard account={account} reload={reload} />
      ) : (
        // Two short sections need no menu; same section styling as the docs, full width.
        <div className="stagger-in stagger-in--slow doc-layout doc-layout--plain">
          <SignIn
            pendingSave={pendingSave}
            initialPlan={urlPlan ?? "free"}
            onSignedIn={(plan) => {
              setPendingPlan(null);
              if (plan) setCheckoutPlan(plan);
              reload();
            }}
          />
          <HowItWorks />
        </div>
      )}
    </PageShell>
  );
}
