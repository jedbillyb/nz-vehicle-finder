import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

const COUNT_MS = 900;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Eases from the last value shown (`initial` on first mount, else 0) to `value`, so numbers land instead of popping in. */
function CountUp({ value, initial = 0 }: { value: number; initial?: number }) {
  const [shown, setShown] = useState(() => (reducedMotion() ? value : initial));
  const from = useRef(shown);
  useEffect(() => {
    if (reducedMotion()) { setShown(value); from.current = value; return; }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      const next = Math.round(origin + (value - origin) * (1 - Math.pow(1 - t, 3)));
      from.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{shown.toLocaleString("en-NZ")}</>;
}

/**
 * A number that counts up when it appears or changes. It counts inside a box
 * sized to the final value, so the text around it doesn't reflow mid-count.
 */
export function AnimatedNumber({ value, from, style }: { value: number; from?: number; style?: CSSProperties }) {
  return (
    <span style={{ position: "relative", display: "inline-block", fontVariantNumeric: "tabular-nums", ...style }}>
      <span aria-hidden style={{ visibility: "hidden" }}>{value.toLocaleString("en-NZ")}</span>
      <span style={{ position: "absolute", inset: 0, textAlign: "right", whiteSpace: "nowrap" }}><CountUp value={value} initial={from} /></span>
    </span>
  );
}

/**
 * A number that is still loading. While it loads, a row of dots (one per
 * digit of `placeholder`) ripples across a hidden copy of the placeholder, so
 * the slot already has roughly the final width. Then it counts up.
 */
export function NumberSlot({ value, placeholder = "000,000" }: { value: number | null | undefined; placeholder?: string }) {
  if (value !== null && value !== undefined) return <span className="fade-in"><AnimatedNumber value={value} /></span>;
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
