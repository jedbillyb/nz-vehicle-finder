import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

const PULL = 64; // px the page must come down to arm a refresh
const HOLD = 56; // px the page rests at while it refreshes
const MIN_SPIN = 700; // ms the spinner shows, so a quick refresh still reads as one
const SPOKES = 12;
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
 * Pull down at the top of the page to refresh, on touch screens. The page
 * turns off the rubber-band bounce (index.css), and Safari ties its own pull
 * to refresh to that bounce, so this brings it back without the bounce. It
 * also works when the site is opened from the home screen, which has no reload.
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
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    const el = ref.current;
    const page = document.getElementById("root");
    if (!el || !page) return;
    const spinner = el.firstElementChild as HTMLElement;
    const spokes = [...el.querySelectorAll<SVGLineElement>("line")];
    let startX = 0;
    let startY = 0;
    let pull = 0;
    let tracking = false;
    let armed = false;
    let refreshing = false;
    let settle = 0;
    let frame = 0;
    let lit = -1;
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
      spinner.style.opacity = hideSpinner ? "0" : String(t);
      spinner.style.transform = `translate3d(0, ${(gapTop + gapBottom - pull) / 2}px, 0) scale(${hideSpinner ? 0.5 : 0.6 + 0.4 * t})`;
      el.style.visibility = "visible";
      const now = refreshing ? SPOKES + 1 : Math.round(t * SPOKES);
      if (now !== lit) {
        lit = now;
        // Spinning, the spokes fade around the circle and the whole thing turns
        // a spoke at a time (CSS), which keeps going even while the page is busy.
        spokes.forEach((s, i) => (s.style.opacity = String(refreshing ? 0.25 + (0.75 * i) / (SPOKES - 1) : i < lit ? 1 : 0.25)));
      }
      // Back at rest, drop the transform: it would pin fixed elements to #root.
      if (pull === 0) settle = window.setTimeout(() => {
        page.style.transform = page.style.transition = page.style.willChange = "";
        el.style.visibility = "hidden";
      }, animate ? 400 : 0);
    };
    // Touch events can come faster than the screen draws: draw once a frame.
    const drawSoon = () => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; draw(false); });
    };

    const refresh = async () => {
      const started = Date.now();
      try {
        const res = await fetch(window.location.pathname, { cache: "no-store" });
        const live = bundleOf(await res.text());
        const mine = bundleOf(document.documentElement.innerHTML);
        if (live && mine && live !== mine) return window.location.reload();
      } catch {
        // Offline: refresh what's here anyway.
      }
      await queryClient.invalidateQueries();
      window.dispatchEvent(new Event(REFRESH));
      await new Promise((r) => window.setTimeout(r, Math.max(0, MIN_SPIN - (Date.now() - started))));
      draw(false, true);
      await new Promise((r) => window.setTimeout(r, 180));
      refreshing = false;
      el.classList.remove("ptr--spin");
      pull = 0;
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
      pull = 0;
      armed = false;
      measure();
      // Ready the page to move now, so the first frame of the pull isn't a hitch.
      page.style.willChange = "transform";
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
      // Phones only send the first move after the finger has already travelled
      // a few px. Count the pull from there, so it starts at 0 instead of
      // jumping partway open on the first frame.
      if (pull === 0 && !armed) {
        armed = true;
        startY = e.touches[0].clientY;
        return;
      }
      // Heavier the further it goes, like the real thing.
      pull = Math.max(0, 140 * (1 - Math.exp(-Math.max(0, e.touches[0].clientY - startY) / 220)));
      drawSoon();
    };
    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (pull === 0) return void (page.style.willChange = "");
      if (pull >= PULL) {
        refreshing = true;
        pull = HOLD;
        el.classList.add("ptr--spin");
        draw(true);
        void refresh();
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
            <line key={i} x1="14" y1="3" x2="14" y2="8.5" transform={`rotate(${i * 30} 14 14)`} />
          ))}
        </svg>
      </div>
    </div>
  );
}
