import { useEffect, useRef } from "react";

const PULL = 72; // px of (damped) pull that arms a refresh
const SPOKES = 12;

/**
 * Pull down at the top of the page to reload, on touch screens. The page turns
 * off the rubber-band bounce (index.css), and Safari ties its own pull to
 * refresh to that bounce, so this brings it back without the bounce. It also
 * works when the site is opened from the home screen, which has no reload.
 *
 * The iOS-style spinner fills a spoke at a time as you pull, then spins and
 * the page reloads. Positions are set straight on the element, so it follows
 * the finger without re-rendering.
 */
export function PullToRefresh() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    const el = ref.current;
    if (!el) return;
    const spokes = [...el.querySelectorAll<SVGLineElement>("line")];
    let startX = 0;
    let startY = 0;
    let pull = 0;
    let tracking = false;
    let refreshing = false;

    const draw = (animate: boolean) => {
      el.style.transition = animate ? "transform 0.3s cubic-bezier(0.2, 0.7, 0.2, 1), opacity 0.2s ease" : "none";
      el.style.transform = `translate(-50%, ${Math.min(pull, PULL + 24) - 48}px)`;
      el.style.opacity = pull > 4 ? "1" : "0";
      const lit = Math.round((pull / PULL) * SPOKES);
      spokes.forEach((s, i) => (s.style.opacity = refreshing ? "" : i < lit ? "1" : "0.15"));
    };

    // Not while a popup or sheet holds the page still, or inside something that scrolls itself.
    const blocked = (target: EventTarget | null) => {
      if (document.body.style.overflow === "hidden") return true;
      for (let n = target as HTMLElement | null; n && n !== document.body; n = n.parentElement) {
        if (n.getAttribute("role") === "dialog" || n.scrollTop > 0) return true;
      }
      return false;
    };

    const onStart = (e: TouchEvent) => {
      tracking = !refreshing && e.touches.length === 1 && window.scrollY <= 0 && !blocked(e.target);
      if (!tracking) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      pull = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      // A sideways swipe (wide tables) or scrolling down the page isn't a pull.
      if (pull === 0 && (dy <= 0 || Math.abs(dx) > dy || window.scrollY > 0)) {
        if (Math.abs(dx) > 8 || dy < -8) tracking = false;
        return;
      }
      pull = Math.max(0, dy * 0.5);
      draw(false);
    };
    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (pull >= PULL) {
        refreshing = true;
        pull = PULL;
        el.classList.add("ptr--spin");
        draw(true);
        window.setTimeout(() => window.location.reload(), 350);
      } else {
        pull = 0;
        draw(true);
      }
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  return (
    <div ref={ref} className="ptr" aria-hidden>
      <svg viewBox="0 0 28 28" width="22" height="22">
        {Array.from({ length: SPOKES }, (_, i) => (
          <line key={i} x1="14" y1="3" x2="14" y2="8.5" transform={`rotate(${i * 30} 14 14)`} style={{ animationDelay: `${(i - SPOKES) / SPOKES}s` }} />
        ))}
      </svg>
    </div>
  );
}
