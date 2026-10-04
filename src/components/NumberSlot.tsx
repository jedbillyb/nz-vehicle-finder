import type { ReactNode } from "react";
import { LoadingDots } from "@/components/LoadingDots";

/**
 * A number that is still loading. While it loads, bouncing dots sit in a
 * hidden copy of `placeholder`, so the slot already has roughly the final
 * width and the heading around it doesn't rewrap (and jump) when it lands.
 */
export function NumberSlot({ value, placeholder = "000,000" }: { value: number | null | undefined; placeholder?: string }) {
  if (value !== null && value !== undefined) return <span className="fade-in">{value.toLocaleString("en-NZ")}</span>;
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <span aria-hidden style={{ visibility: "hidden" }}>{placeholder}</span>
      <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center" }}><LoadingDots /></span>
    </span>
  );
}

/**
 * Text that depends on data still loading. Until `ready`, a stand-in of about
 * the same length holds the space, drawn as grey placeholder lines; then the
 * real text fades in.
 */
export function Reserve({ ready, standIn, children }: { ready: boolean; standIn: string; children: ReactNode }) {
  return ready
    ? <span className="fade-in">{children}</span>
    : <span aria-hidden className="text-skeleton">{standIn}</span>;
}
