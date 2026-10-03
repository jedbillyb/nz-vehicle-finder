import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { applySeo } from "@/lib/seo";
import {
  createApiKey, fetchAccount, requestSignInLink, revokeApiKey, signOut, verifySignInToken, type Account as AccountData,
} from "@/lib/account";
import { PageShell } from "@/components/PageShell";
import { card, code, input, label, primaryButton, secondaryButton } from "@/lib/pageStyles";

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" }) : "Never";

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
      setState("sent");
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
  };

  if (state === "sent") {
    return (
      <div style={card}>
        <div style={label}>Check your email</div>
        <p style={{ margin: 0, fontSize: 14 }}>
          We sent a sign-in link to <strong>{email}</strong>. It works once and expires in 15 minutes.
        </p>
      </div>
    );
  }

  return (
    <div style={card}>
      <div style={label}>Sign in or create an account</div>
      <p style={{ margin: "0 0 14px", fontSize: 14, color: "#374151" }}>
        Enter your email and we'll send you a sign-in link. No password needed. New accounts start on the free plan.
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
      {error && <p style={{ color: "#b91c1c", fontSize: 13, margin: "10px 0 0" }}>{error}</p>}
    </div>
  );
}

function Dashboard({ account, reload }: { account: AccountData; reload: () => void }) {
  const [keyName, setKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { used, limit, resetsAt } = account.usage;
  const pct = Math.min((used / limit) * 100, 100);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const { key } = await createApiKey(keyName);
      setNewKey(key);
      setCopied(false);
      setKeyName("");
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
      <div style={{ ...card, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={label}>Signed in as</div>
          <div style={{ fontSize: 15, fontWeight: 600, overflowWrap: "anywhere" }}>{account.email}</div>
        </div>
        <button
          style={secondaryButton}
          onClick={async () => {
            await signOut();
            reload();
          }}
        >
          Sign out
        </button>
      </div>

      <div style={card}>
        <div style={label}>Usage this month · {account.tier.name} plan</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", lineHeight: 1 }}>
          {used.toLocaleString("en-NZ")}
          <span style={{ fontSize: 14, fontWeight: 600, color: "#6b7280" }}> / {limit.toLocaleString("en-NZ")} requests</span>
        </div>
        <div style={{ height: 8, background: "#f3f4f6", borderRadius: 999, overflow: "hidden", margin: "12px 0 6px" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: pct >= 90 ? "#ef4444" : "linear-gradient(90deg,#0ea5e9,#22c55e)" }} />
        </div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>Resets {fmtDate(resetsAt)}</div>
      </div>

      <div style={card}>
        <div style={label}>API keys</div>
        {newKey && (
          <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 6, padding: 12, marginBottom: 14 }}>
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
          <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 14px" }}>No keys yet. Create one to start calling the API.</p>
        ) : (
          <div style={{ marginBottom: 14 }}>
            {account.keys.map((k) => (
              <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #f3f4f6", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{k.name || "Unnamed key"}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
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
        {error && <p style={{ color: "#b91c1c", fontSize: 13, margin: "10px 0 0" }}>{error}</p>}
      </div>

      <div style={card}>
        <div style={label}>Plans</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          {account.tiers.map((t) => {
            const current = t.id === account.tier.id;
            return (
              <div key={t.id} style={{ border: current ? "2px solid #0ea5e9" : "1px solid #e5e7eb", borderRadius: 8, padding: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{t.name}</div>
                <div style={{ fontSize: 22, fontWeight: 800, margin: "4px 0" }}>
                  {t.priceNzd === 0 ? "Free" : `NZ$${t.priceNzd}`}
                  {t.priceNzd > 0 && <span style={{ fontSize: 12, fontWeight: 500, color: "#6b7280" }}>/month</span>}
                </div>
                <div style={{ fontSize: 12, color: "#4b5563", marginBottom: 10 }}>{t.monthlyRequests.toLocaleString("en-NZ")} requests / month</div>
                {current ? (
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#0369a1" }}>Current plan</div>
                ) : (
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>Paid plans coming soon</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <p style={{ fontSize: 13, color: "#4b5563" }}>
        New to the API? Read the <Link to="/developers" style={{ color: "#0369a1" }}>developer docs</Link>.
      </p>
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
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) return reload();
    // Take the one-time token out of the address bar and history before using it.
    window.history.replaceState(null, "", "/account");
    verifySignInToken(token)
      .catch((err) => setError((err as Error).message))
      .finally(reload);
  }, [reload]);

  return (
    <PageShell subtitle="API account" crumb="Account">
      <h1 style={{ fontSize: 32, fontWeight: 800, color: "#0f172a", margin: "0 0 16px", letterSpacing: "-0.02em" }}>API account</h1>
      {error && <div style={{ ...card, borderColor: "#fecaca", color: "#b91c1c", fontSize: 14 }}>{error}</div>}
      {loading ? <p style={{ color: "#6b7280" }}>Loading...</p> : account ? <Dashboard account={account} reload={reload} /> : <SignIn />}
    </PageShell>
  );
}
