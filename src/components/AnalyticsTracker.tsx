import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { captureEvent } from "@/lib/posthog";

/** How far down the page has been seen, as a percentage of the page height. */
function scrolledPercent(): number {
  const doc = document.documentElement;
  const seen = window.scrollY + window.innerHeight;
  return doc.scrollHeight > 0 ? Math.min(100, Math.round((seen / doc.scrollHeight) * 100)) : 100;
}

type Page = { url: string; pathname: string; start: number; maxScroll: number };

const startPage = (pathname: string): Page => ({ url: window.location.href, pathname, start: Date.now(), maxScroll: scrolledPercent() });

function sendPageleave(p: Page) {
  captureEvent("$pageleave", {
    $current_url: p.url,
    $pathname: p.pathname,
    $prev_pageview_pathname: p.pathname,
    $prev_pageview_duration: (Date.now() - p.start) / 1000,
    $prev_pageview_max_scroll_percentage: p.maxScroll / 100,
  });
}

/**
 * $pageview on every route change, and $pageleave when a page is left (another
 * route, or the tab closing), with time on page and scroll depth. Web
 * analytics needs $pageleave for bounce rate and session duration; these use
 * the same property names posthog-js does.
 */
export function AnalyticsTracker() {
  const location = useLocation();
  const page = useRef<Page | null>(null);

  useEffect(() => {
    const onScroll = () => {
      if (page.current) page.current.maxScroll = Math.max(page.current.maxScroll, scrolledPercent());
    };
    const leave = () => {
      if (page.current) sendPageleave(page.current);
      page.current = null;
    };
    // Back from the back-forward cache: the page is live again, so time it again.
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted && !page.current) page.current = startPage(window.location.pathname);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", onShow);
    return () => {
      window.removeEventListener("pageshow", onShow);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", leave);
    };
  }, []);

  useEffect(() => {
    if (page.current) sendPageleave(page.current);
    captureEvent("$pageview", { pathname: location.pathname });
    page.current = startPage(location.pathname);
  }, [location.pathname]);

  return null;
}
