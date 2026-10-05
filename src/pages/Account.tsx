import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { applySeo } from "@/lib/seo";
import { captureEvent, identifyUser, resetUser } from "@/lib/posthog";
import {
  createApiKey, deleteSavedSearch, fetchAccount, hasPendingSave, openBillingPortal, paidPlan, renameApiKey, renameSavedSearch, requestSignInLink,
  revokeApiKey, saveSearch, setPendingPlan, signOut, startCheckout, syncBilling, takePendingPlan, takePendingSave, verifySignInToken,
  type Account as AccountData, type SavedSearch,
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

function SignIn({ pendingSave, initialPlan }: { pendingSave: boolean; initialPlan: TierId }) {
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState<TierId>(initialPlan);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
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
      setState("sent");
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
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
          <div role="radiogroup" aria-label="Plan" className="stagger-in" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
            <p style={{ margin: 0, fontSize: 14, color: "#374151", lineHeight: 1.6 }}>
              We sent a link to <strong>{email}</strong>. It works once and expires in 15 minutes.
              {paid
                ? <> Open it on any device and you'll go straight to secure checkout for <strong>{tier.name}</strong>.</>
                : <> Open it to finish signing in.</>}
            </p>
          ) : (
            <>
              <p style={{ margin: "0 0 14px", fontSize: 14, color: "#374151", lineHeight: 1.6 }}>
                We'll email you a sign-in link. No password. New here? The link creates your account.
                {paid
                  ? <> Then you go straight to Stripe to pay NZ${tier.priceNzd} a month for <strong>{tier.name}</strong>.</>
                  : <> No card needed.</>}
              </p>
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
                  {state === "sending" ? "Sending..." : paid ? `Continue with ${tier.name}` : "Email me a link"}
                </button>
              </form>
              {error && <p style={errorText}>{error}</p>}
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
    ["Sign in with a link", "Enter your email and click the link we send. No password to remember. The first link creates your account."],
    ["Create an API key", "Make a key on this page and send it with each request. Keys never expire; revoke one any time."],
    ["Pay only for more", "Free covers 500 requests a month. Paid plans bill monthly through Stripe and can be changed or cancelled whenever."],
  ];
  return (
    <DocSection id="how-it-works" title="How accounts work">
      <div className="stagger-in howto-grid">
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
      <div className="acct-who__email">{account.email}</div>
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
    <div className="stagger-in doc-layout doc-layout--plain">
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
        <div className="stagger-in acct-plans">
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
    </div>
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
      title={account || loading ? "Your account" : "Get an API key"}
      intro={
        account || loading
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
        <div className="page-band" aria-busy="true" style={{ padding: "24px", display: "grid", gap: 16 }}><SkeletonBlock height={120} /><SkeletonBlock height={260} /></div>
      ) : account ? (
        <Dashboard account={account} reload={reload} />
      ) : (
        // Two short sections need no menu; same section styling as the docs, full width.
        <div className="stagger-in doc-layout doc-layout--plain">
          <SignIn pendingSave={pendingSave} initialPlan={urlPlan ?? "free"} />
          <HowItWorks />
        </div>
      )}
    </PageShell>
  );
}
