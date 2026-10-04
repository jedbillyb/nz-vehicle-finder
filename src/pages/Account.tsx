import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { applySeo } from "@/lib/seo";
import { captureEvent } from "@/lib/posthog";
import {
  createApiKey, deleteSavedSearch, fetchAccount, hasPendingSave, openBillingPortal, renameApiKey, renameSavedSearch, requestSignInLink,
  revokeApiKey, saveSearch, signOut, startCheckout, syncBilling, takePendingSave, verifySignInToken, type Account as AccountData,
  type SavedSearch,
} from "@/lib/account";
import { Band, PageShell, StatCard } from "@/components/PageShell";
import { code, input, label, primaryButton, secondaryButton } from "@/lib/pageStyles";
import { BURST_PER_SECOND } from "../../shared/apiTiers";
import { MAX_SAVED_SEARCH_NAME, MAX_SAVED_SEARCHES } from "../../shared/savedSearch";
import { Star } from "lucide-react";

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" }) : "Never";

const panel: React.CSSProperties = { background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "16px 20px" };
const errorText: React.CSSProperties = { color: "#b91c1c", fontSize: 13, margin: "10px 0 0" };

function SignIn({ pendingSave }: { pendingSave: boolean }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    setError(null);
    try {
      await requestSignInLink(email);
      captureEvent("api_signin_requested");
      setState("sent");
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
  };

  return (
    <Band tone="grey" title="Sign in or create an account">
      {pendingSave && state !== "sent" && (
        <div style={{ ...panel, maxWidth: 560, marginBottom: 12, background: "#fffbeb", borderColor: "#fcd34d", fontSize: 14, color: "#92400e", display: "flex", gap: 8, alignItems: "center" }}>
          <Star size={14} fill="#f59e0b" color="#f59e0b" style={{ flexShrink: 0 }} />
          Sign in to save your search. It's saved to your account as soon as you're in.
        </div>
      )}
      <div style={{ ...panel, maxWidth: 560 }}>
        {state === "sent" ? (
          <>
            <div style={label}>Check your email</div>
            <p style={{ margin: 0, fontSize: 14 }}>
              We sent a sign-in link to <strong>{email}</strong>. It works once and expires in 15 minutes.
            </p>
          </>
        ) : (
          <>
            <p style={{ margin: "0 0 14px", fontSize: 14, color: "#374151" }}>
              Enter your email and we'll send you a sign-in link. No password needed. Your account keeps your saved
              searches, and API keys on the free plan with 500 requests a month.
            </p>
            <form onSubmit={submit} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.co.nz"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={input}
              />
              <button type="submit" disabled={state === "sending"} style={primaryButton}>
                {state === "sending" ? "Sending..." : "Email me a link"}
              </button>
            </form>
            {error && <p style={errorText}>{error}</p>}
          </>
        )}
      </div>
    </Band>
  );
}

function Dashboard({ account, reload }: { account: AccountData; reload: () => void }) {
  const [keyName, setKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  }, [reload]);

  const { used, limit, resetsAt } = account.usage;
  const { billing } = account;
  const pct = Math.min((used / limit) * 100, 100);

  /** Checkout and the billing portal are pages on stripe.com; send the browser there. */
  const goToStripe = async (which: string, event: string, get: () => Promise<{ url: string }>) => {
    setError(null);
    setRedirecting(which);
    captureEvent(event);
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
      reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const copy = async () => {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
  };

  return (
    <>
      <SavedSearches searches={account.searches} notice={savedNotice} reload={reload} onError={setError} />

      <div className="page-band" style={{ padding: "20px 24px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <StatCard label="REQUESTS THIS MONTH" value={used.toLocaleString("en-NZ")} sub={`of ${limit.toLocaleString("en-NZ")} · resets ${fmtDate(resetsAt)}`}>
          <div style={{ height: 6, background: "#f3f4f6", borderRadius: 999, overflow: "hidden", marginTop: 10, minWidth: 180 }}>
            <div style={{ height: "100%", width: `${pct}%`, background: pct >= 90 ? "#ef4444" : "linear-gradient(90deg,#0ea5e9,#22c55e)" }} />
          </div>
        </StatCard>
        <StatCard
          label="PLAN"
          value={account.tier.name}
          sub={account.tier.priceNzd === 0 ? "No card on file" : `NZ$${account.tier.priceNzd} / month`}
        />
        <StatCard label="API KEYS" value={account.keys.length} sub="active" />
        <StatCard label="SIGNED IN AS" value={<span style={{ fontSize: 15, fontWeight: 700, overflowWrap: "anywhere" }}>{account.email}</span>}>
          <button
            style={{ ...secondaryButton, marginTop: 10, padding: "4px 12px", fontSize: 11 }}
            onClick={async () => {
              await signOut();
              reload();
            }}
          >
            Sign out
          </button>
        </StatCard>
      </div>

      {error && (
        <div className="page-band" style={{ padding: "10px 24px", background: "#fef2f2", borderBottom: "1px solid #fecaca", color: "#b91c1c", fontSize: 13 }}>{error}</div>
      )}

      <Band tone="grey" title="API keys">
        {newKey && (
          <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: 14, marginBottom: 14 }}>
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
        <div>
          {account.keys.length === 0 ? (
            <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 14px" }}>No keys yet. Create one to start calling the API.</p>
          ) : (
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, marginBottom: 14 }}>
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
                  <button style={{ ...secondaryButton, color: "#b91c1c", borderColor: "#fecaca" }} onClick={() => revoke(k.id)}>
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={create} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input placeholder="Key name (optional)" value={keyName} maxLength={60} onChange={(e) => setKeyName(e.target.value)} style={input} />
            <button type="submit" style={primaryButton}>Create key</button>
          </form>
        </div>
      </Band>

      <Band title="Plans">
        {billing.status === "past_due" && (
          <p style={{ fontSize: 13, color: "#b91c1c", margin: "0 0 12px" }}>
            Your last payment failed. Update your card in Manage billing to keep your plan.
          </p>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {account.tiers.map((t) => {
            const current = t.id === account.tier.id;
            const busy = redirecting !== null;
            const planButton = { width: "100%", padding: "11px 18px", fontSize: 13, borderRadius: 8 } as const;
            const includes = [
              `${t.monthlyRequests.toLocaleString("en-NZ")} requests a month`,
              `Up to ${BURST_PER_SECOND} calls a second`,
              "Every endpoint and filter",
              t.priceNzd === 0 ? "No card needed" : "Cancel any time",
            ];
            return (
              <div key={t.id} style={{ ...panel, border: current ? "2px solid #0ea5e9" : panel.border, display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>{t.name}</div>
                <div style={{ fontSize: 30, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em", lineHeight: 1.1, margin: "4px 0 12px" }}>
                  NZ${t.priceNzd}
                  <span style={{ fontSize: 13, fontWeight: 500, color: "#6b7280" }}> / month</span>
                </div>
                <ul style={{ margin: "0 0 16px", paddingLeft: 18, listStyle: "disc", fontSize: 13, color: "#374151", lineHeight: 1.7 }}>
                  {includes.map((i) => <li key={i}>{i}</li>)}
                </ul>
                <div style={{ marginTop: "auto" }}>
                  {current ? (
                    <button style={{ ...secondaryButton, ...planButton, color: "#0369a1", borderColor: "#bae6fd", background: "#f0f9ff", fontWeight: 700, cursor: "default" }} disabled>
                      Your current plan
                    </button>
                  ) : !billing.enabled ? (
                    <button style={{ ...secondaryButton, ...planButton, cursor: "default" }} disabled>Coming soon</button>
                  ) : billing.subscribed ? (
                    // Switching or cancelling an existing subscription happens in Stripe's portal.
                    <button style={{ ...secondaryButton, ...planButton, fontWeight: 600 }} disabled={busy} onClick={() => goToStripe(t.id, "billing_portal_opened", openBillingPortal)}>
                      {redirecting === t.id ? "Opening Stripe..." : t.priceNzd === 0 ? "Cancel paid plan" : `Switch to ${t.name}`}
                    </button>
                  ) : t.priceNzd > 0 ? (
                    <button style={{ ...primaryButton, ...planButton, opacity: busy && redirecting !== t.id ? 0.5 : 1 }} disabled={busy} onClick={() => goToStripe(t.id, "checkout_started", () => startCheckout(t.id))}>
                      {redirecting === t.id ? "Opening Stripe..." : `Upgrade to ${t.name}`}
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
          Payments are handled by Stripe. Cancel any time; your plan runs to the end of the month you paid for.
        </p>
      </Band>
    </>
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
    <Band id="saved-searches" title="Saved searches">
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
    </Band>
  );
}

export default function Account() {
  // Read once: the save is taken out of storage when the dashboard saves it.
  const [pendingSave] = useState(hasPendingSave);
  const [account, setAccount] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    if (query.get("billing") === "success") {
      // Back from Stripe checkout. Pull the new plan now rather than waiting on the webhook.
      window.history.replaceState(null, "", "/account");
      captureEvent("checkout_completed");
      syncBilling().catch(() => {}).finally(reload);
      return;
    }
    const token = query.get("token");
    if (!token) return reload();
    // Take the one-time token out of the address bar and history before using it.
    window.history.replaceState(null, "", "/account");
    verifySignInToken(token)
      .catch((err) => setError((err as Error).message))
      .finally(reload);
  }, [reload]);

  return (
    <PageShell
      source="account_page"
      subtitle="Your account"
      crumb="Account"
      title="Your account"
      intro="Your saved searches, API keys, this month's API usage and your plan."
      heroApi={{ to: "/developers", title: "Read the API docs", sub: "Endpoints and examples" }}
    >
      {error && (
        <div className="page-band" style={{ padding: "10px 24px", background: "#fef2f2", borderBottom: "1px solid #fecaca", color: "#b91c1c", fontSize: 13 }}>{error}</div>
      )}
      {loading ? (
        <Band tone="grey"><p style={{ color: "#6b7280", margin: 0, fontSize: 13 }}>Loading...</p></Band>
      ) : account ? (
        <Dashboard account={account} reload={reload} />
      ) : (
        <SignIn pendingSave={pendingSave} />
      )}
      {!loading && !account && (
        <Band title="What you get">
          <p style={{ fontSize: 14, color: "#374151", margin: 0, maxWidth: 800 }}>
            JSON access to all 5.9 million vehicles on the NZ Motor Vehicle Register: search by make, model, year, fuel,
            region and more, refreshed every month from NZTA. See the <Link to="/developers" style={{ color: "#0369a1" }}>API docs</Link> for
            endpoints and pricing.
          </p>
        </Band>
      )}
    </PageShell>
  );
}
