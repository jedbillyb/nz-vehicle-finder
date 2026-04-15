import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { captureEvent } from "@/lib/posthog";

export function AnalyticsTracker() {
  const location = useLocation();

  useEffect(() => {
    captureEvent("$pageview", {
      pathname: location.pathname,
    });
  }, [location.pathname]);

  return null;
}
