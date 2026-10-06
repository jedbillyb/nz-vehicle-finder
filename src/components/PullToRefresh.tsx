import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

const PULL = 64; // px the page must come down to arm a refresh
const HOLD = 56; // px the page rests at while it refreshes
const MIN_SPIN = 700; // ms the spinner shows, so a quick refresh still reads as one
const SLACK = 12; // px the finger moves before the page starts to follow
const SPOKES = 12;
const SPINNER_ROOM = 26; // px of pull before the spinner starts to show
const REFRESH = "app:refresh";

/** A number that goes up on each pull to refresh. Key the page by it to remount it. */
export function useRefreshKey() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const bump = () => setN((x) => x + 1);
    window.addEventListener(REFRESH, bump);
    return () => window.removeEventListener(REFRESH, bump);
  }, []);
  return n;
}

/** The built script this page runs, so a refresh can tell when a new version is live. */
const bundleOf = (html: string) => html.match(/\/assets\/index-[\w-]+\.js/)?.[0];

/**
 * Pull down at the top of the page to refresh, when the site is opened from
 * the home screen: that has no browser pull to refresh, and no bounce either
 * (index.css). In the browser this stays off and Safari's own one is used.
 *
 * Like the standard one, the whole page (nav and all) slides down over the
 * nav's blue, with an iOS-style spinner that fills a spoke at a time. Let go
 * and the page holds there while it refreshes in place (the routes remount
 * and refetch, see useRefreshKey), then slides back up. Only when a new
 * version of the site is live does it do a full reload.
 *
 * Everything moves by transform on #root, the blue included (it lives inside
 * #root, above the top edge), so nothing can come apart mid-animation.
 */
export function PullToRefresh() {
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    // Only from the home screen. In the browser, Safari's own pull to refresh does the job.
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    if (!standalone || !window.matchMedia("(pointer: coarse)").matches) return;
    const el = ref.current;
    const page = document.getElementById("root");
    if (!el || !page) return;
    const spinner = el.firstElementChild as HTMLElement;
    let startX = 0;
    let startY = 0;
    let pull = 0; // where the page is drawn
    let target = 0; // where the finger says it should be
    let tracking = false;
    let armed = false;
    let refreshing = false;
    let settle = 0;
    let frame = 0;
    // Top of the nav text and the notch/island inset, measured at the start of
    // each pull, so the spinner sits midway in the blue the user actually sees.
    let gapTop = 0;
    let gapBottom = 0;
    const measure = () => {
      const probe = document.createElement("div");
      probe.style.cssText = "position:fixed;top:0;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none";
      document.body.appendChild(probe);
      gapTop = probe.getBoundingClientRect().height;
      probe.remove();
      const text = document.querySelector<HTMLElement>(".header-topbar a, .header-topbar span");
      const rootTop = page.getBoundingClientRect().top - pull;
      gapBottom = text ? Math.max(gapTop, text.getBoundingClientRect().top - pull - rootTop) : gapTop;
    };

    const EASE = "0.4s cubic-bezier(0.2, 0.7, 0.2, 1)";
    const draw = (animate: boolean, hideSpinner = false) => {
      window.clearTimeout(settle);
      cancelAnimationFrame(frame);
      frame = 0;
      page.style.transition = animate ? `transform ${EASE}` : "none";
      spinner.style.transition = hideSpinner
        ? "transform 0.2s ease-in, opacity 0.2s ease-in"
        : animate ? `transform ${EASE}, opacity ${EASE}` : "none";
      page.style.transform = `translate3d(0, ${pull}px, 0)`;
      // The spinner stays in the middle of the blue that's showing, growing
      // in as it comes into view, and shrinks away before the page goes back.
      const t = refreshing ? 1 : Math.min(1, pull / PULL);
      // Hidden until there's room for it above the nav, so it never peeks out from behind it.
      const shown = refreshing ? 1 : Math.min(1, Math.max(0, (pull - SPINNER_ROOM) / 20));
      spinner.style.opacity = hideSpinner ? "0" : String(shown);
      spinner.style.transform = `translate3d(0, ${(gapTop + gapBottom - pull) / 2}px, 0) scale(${hideSpinner ? 0.5 : 0.6 + 0.4 * t})`;
      el.style.visibility = "visible";
      // Back at rest, drop the transform: it would pin fixed elements to #root.
      if (pull === 0) settle = window.setTimeout(() => {
        page.style.transform = page.style.transition = page.style.willChange = "";
        el.style.visibility = "hidden";
        el.classList.remove("ptr--spin");
      }, animate ? 400 : 0);
    };
    // Touch events can come faster than the screen draws: draw once a frame.
    // The page eases toward the finger a frame at a time, so touch updates that
    // arrive unevenly still draw as one smooth movement.
    const step = () => {
      frame = 0;
      pull += (target - pull) * 0.5;
      if (Math.abs(target - pull) < 0.3) pull = target;
      draw(false);
      if (pull !== target) frame = requestAnimationFrame(step);
    };
    const drawSoon = () => {
      if (!frame) frame = requestAnimationFrame(step);
    };

    // The page rests at HOLD for this long at most, or until the user scrolls
    // away: held down, the nav and all sit a step too low wherever they are.
    const hold = (ms: number) => new Promise<void>((resolve) => {
      const done = () => { window.clearTimeout(t); window.removeEventListener("scroll", onScroll); resolve(); };
      const onScroll = () => { if (window.scrollY > 8) done(); };
      const t = window.setTimeout(done, ms);
      window.addEventListener("scroll", onScroll, { passive: true });
    });
    const refresh = async () => {
      const started = Date.now();
      try {
        // A slow connection mustn't keep the page held down: give up on the check after a moment.
        const res = await fetch(window.location.pathname, { cache: "no-store", signal: AbortSignal.timeout(1500) });
        const live = bundleOf(await res.text());
        const mine = bundleOf(document.documentElement.innerHTML);
        if (live && mine && live !== mine) return window.location.reload();
      } catch {
        // Offline, or too slow: refresh what's here anyway.
      }
      // The refetch runs in the background; each part of the page shows its own
      // loading state, and the hold doesn't wait on the network.
      void queryClient.invalidateQueries();
      window.dispatchEvent(new Event(REFRESH));
      await hold(Math.max(0, MIN_SPIN - (Date.now() - started)));
      draw(false, true);
      await new Promise((r) => window.setTimeout(r, 180));
      refreshing = false;
      el.classList.remove("ptr--spin");
      pull = target = 0;
      draw(true, true);
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
      pull = target = 0;
      armed = false;
      measure();
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (target === 0) {
        // A sideways swipe (wide tables) or scrolling down the page isn't a pull.
        if (window.scrollY > 0 || dy < -8 || (Math.abs(dx) > 8 && Math.abs(dx) > dy)) {
          tracking = false;
          return;
        }
        // Not moving down yet: leave it to Safari.
        if (dy <= 0) return;
      }
      // Moving down at the top: take the gesture from Safari on its very first
      // move, before it's clear whether it's a pull. Let through, Safari treats
      // the drag as a scroll, won't give it back, and sends far fewer touch
      // updates after that, so the page stepped down in jumps.
      if (e.cancelable) e.preventDefault();
      // A small slack before anything moves, so a light touch or the start of
      // a scroll doesn't nudge the page. The pull counts from where the slack
      // ends, so it starts at 0 instead of jumping partway open.
      if (!armed) {
        if (dy < SLACK) return;
        armed = true;
        startY = e.touches[0].clientY;
        // Ready the page to move only now, so plain taps never touch its layer.
        page.style.willChange = "transform";
        // It spins the whole time it's out, held or refreshing (CSS, a spoke at
        // a time, so it keeps going even while the page is busy).
        el.classList.add("ptr--spin");
        return;
      }
      // Heavier the further it goes, like the real thing.
      target = Math.max(0, 140 * (1 - Math.exp(-Math.max(0, e.touches[0].clientY - startY) / 220)));
      drawSoon();
    };
    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      cancelAnimationFrame(frame);
      frame = 0;
      if (target === 0 && pull === 0) {
        page.style.willChange = "";
        el.classList.remove("ptr--spin");
        return;
      }
      if (target >= PULL) {
        refreshing = true;
        pull = target = HOLD;
        el.classList.add("ptr--spin");
        draw(true);
        void refresh();
      } else {
        pull = target = 0;
        draw(true);
      }
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.clearTimeout(settle);
      cancelAnimationFrame(frame);
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [queryClient]);

  return (
    <div ref={ref} className="ptr" aria-hidden>
      <div className="ptr__spinner">
        <svg viewBox="0 0 28 28" width="22" height="22">
          {Array.from({ length: SPOKES }, (_, i) => (
            <line key={i} x1="14" y1="3" x2="14" y2="8.5" transform={`rotate(${i * 30} 14 14)`} opacity={0.25 + (0.75 * i) / (SPOKES - 1)} />
          ))}
        </svg>
      </div>
    </div>
  );
}
