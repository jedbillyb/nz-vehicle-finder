import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { applySeo } from "@/lib/seo";
import { captureEvent } from "@/lib/posthog";
import {
  createApiKey, fetchAccount, openBillingPortal, renameApiKey, requestSignInLink, revokeApiKey, signOut, startCheckout, syncBilling,
  verifySignInToken, type Account as AccountData,
} from "@/lib/account";
import { Band, PageShell, StatCard } from "@/components/PageShell";
import { code, input, label, primaryButton, secondaryButton } from "@/lib/pageStyles";

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" }) : "Never";

const panel: React.CSSProperties = { background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "16px 20px" };
const errorText: React.CSSProperties = { color: "#b91c1c", fontSize: 13, margin: "10px 0 0" };

function SignIn() {
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
              Enter your email and we'll send you a sign-in link. No password needed. New accounts start on the free plan
              with 500 requests a month.
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
  const [redirecting, setRedirecting] = useState(false);

  const { used, limit, resetsAt } = account.usage;
  const { billing } = account;
  const pct = Math.min((used / limit) * 100, 100);

  /** Checkout and the billing portal are pages on stripe.com; send the browser there. */
  const goToStripe = async (event: string, get: () => Promise<{ url: string }>) => {
    setError(null);
    setRedirecting(true);
    captureEvent(event);
    try {
      window.location.href = (await get()).url;
    } catch (err) {
      setError((err as Error).message);
      setRedirecting(false);
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

      <Band title="API keys">
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

      <Band tone="grey" title="Plans">
        {billing.status === "past_due" && (
          <p style={{ fontSize: 13, color: "#b91c1c", margin: "0 0 12px" }}>
            Your last payment failed. Update your card in Manage billing to keep your plan.
          </p>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          {account.tiers.map((t) => {
            const current = t.id === account.tier.id;
            return (
              <div key={t.id} style={{ ...panel, border: current ? "2px solid #0ea5e9" : panel.border, display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 9, color: "#6b7280", letterSpacing: "0.18em", fontWeight: 700 }}>{t.name.toUpperCase()}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em", lineHeight: 1 }}>
                  {t.priceNzd === 0 ? "Free" : `NZ$${t.priceNzd}`}
                  {t.priceNzd > 0 && <span style={{ fontSize: 12, fontWeight: 500, color: "#6b7280" }}> / month</span>}
                </div>
                <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 10 }}>{t.monthlyRequests.toLocaleString("en-NZ")} requests / month</div>
                <div style={{ marginTop: "auto" }}>
                  {current ? (
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#0369a1", letterSpacing: "0.1em" }}>CURRENT PLAN</div>
                  ) : !billing.enabled ? (
                    <div style={{ fontSize: 11, color: "#9ca3af" }}>Paid plans coming soon</div>
                  ) : billing.subscribed ? (
                    // Switching or cancelling an existing subscription happens in Stripe's portal.
                    <button style={secondaryButton} disabled={redirecting} onClick={() => goToStripe("billing_portal_opened", openBillingPortal)}>
                      {t.priceNzd === 0 ? "Cancel plan" : "Switch plan"}
                    </button>
                  ) : t.priceNzd > 0 ? (
                    <button style={primaryButton} disabled={redirecting} onClick={() => goToStripe("checkout_started", () => startCheckout(t.id))}>
                      Upgrade
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        {billing.subscribed && (
          <button style={{ ...secondaryButton, marginTop: 14 }} disabled={redirecting} onClick={() => goToStripe("billing_portal_opened", openBillingPortal)}>
            Manage billing, invoices and card
          </button>
        )}
        <p style={{ fontSize: 12, color: "#6b7280", margin: "14px 0 0" }}>
          Payments are handled by Stripe. Cancel any time; your plan runs to the end of the month you paid for.
        </p>
      </Band>
    </>
  );
}

export default function Account() {
  const [account, setAccount] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    applySeo({
      title: "Account | NZ Vehicle Finder API",
      description: "Manage your NZ Vehicle Finder API keys, usage and plan.",
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
      subtitle="API account"
      crumb="Account"
      title="API account"
      intro="Your API keys, this month's usage and your plan. Calls to the NZ Vehicle Register API count against your monthly quota."
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
        <SignIn />
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
