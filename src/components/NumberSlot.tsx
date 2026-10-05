import { useEffect, useState, type ReactNode } from "react";

const COUNT_MS = 900;

/** Counts up from 0 to `value` with an ease-out, so a number lands instead of popping in. */
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(() =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ? value : 0,
  );
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(value); return; }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      setShown(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{shown.toLocaleString("en-NZ")}</>;
}

/**
 * A number that is still loading. While it loads, a row of dots (one per
 * digit of `placeholder`) ripples across a hidden copy of the placeholder, so
 * the slot already has roughly the final width. When the value lands it
 * counts up inside a box sized to the final number, so the heading around it
 * doesn't rewrap (and jump) mid-count.
 */
export function NumberSlot({ value, placeholder = "000,000" }: { value: number | null | undefined; placeholder?: string }) {
  if (value !== null && value !== undefined) {
    const final = value.toLocaleString("en-NZ");
    return (
      <span className="fade-in" style={{ position: "relative", display: "inline-block", fontVariantNumeric: "tabular-nums" }}>
        <span aria-hidden style={{ visibility: "hidden" }}>{final}</span>
        <span style={{ position: "absolute", inset: 0, textAlign: "right" }}><CountUp value={value} /></span>
      </span>
    );
  }
  const digits = placeholder.replace(/\D/g, "").length || 3;
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <span aria-hidden style={{ visibility: "hidden" }}>{placeholder}</span>
      <span className="dot-fill" role="status" aria-label="Loading">
        {Array.from({ length: digits }, (_, i) => <span key={i} style={{ animationDelay: `${i * 0.09}s` }} />)}
      </span>
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
