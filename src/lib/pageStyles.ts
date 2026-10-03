import type { CSSProperties } from "react";

/** Shared inline styles for the plain content pages (account, developer docs). */
export const card: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: "18px 20px",
  marginBottom: 16,
};

export const label: CSSProperties = {
  fontSize: 10,
  color: "#6b7280",
  letterSpacing: "0.18em",
  fontWeight: 700,
  marginBottom: 8,
  textTransform: "uppercase",
};

export const primaryButton: CSSProperties = {
  padding: "9px 18px",
  background: "#0ea5e9",
  color: "#ffffff",
  border: "1px solid #0ea5e9",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};

export const secondaryButton: CSSProperties = {
  padding: "7px 14px",
  background: "transparent",
  color: "#4b5563",
  border: "1px solid #d1d5db",
  borderRadius: 999,
  fontSize: 12,
  cursor: "pointer",
  fontFamily: "inherit",
};

export const input: CSSProperties = {
  padding: "9px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 14,
  fontFamily: "inherit",
  minWidth: 0,
  flex: 1,
};

export const code: CSSProperties = {
  fontFamily: "'JetBrains Mono', 'Courier New', monospace",
  fontSize: 12,
};
