import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Fragment, type ReactNode } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { ScrollToTop } from "./components/ScrollToTop";
import Index from "./pages/Index";
import MakeStats from "./pages/MakeStats";
import ModelStats from "./pages/ModelStats";
import FleetOverview from "./pages/FleetOverview";
import RegionStats from "./pages/RegionStats";
import NotFound from "./pages/NotFound";
import Account from "./pages/Account";
import Developers from "./pages/Developers";
import Contact from "./pages/Contact";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import { AnalyticsTracker } from "./components/AnalyticsTracker";
import { FeedbackWidget } from "./components/FeedbackWidget";
import { PullToRefresh, useRefreshKey } from "./components/PullToRefresh";
import { SiteNavMobile } from "./components/SiteChrome";

const queryClient = new QueryClient();

/**
 * The stats pages load their data once, on mount. A link from one region (or
 * make, or model) to another keeps the same route, so without a fresh mount
 * the page kept the first one's numbers. Keyed by path, each one starts clean.
 */
function PerPath({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <Fragment key={pathname}>{children}</Fragment>;
}

/** The pages, remounted (so they refetch) on each pull to refresh. */
function Pages() {
  return (
    <Routes key={useRefreshKey()}>
      <Route path="/" element={<Index />} />
      <Route path="/stats/:make" element={<PerPath><MakeStats /></PerPath>} />
      <Route path="/stats/:make/:model" element={<PerPath><ModelStats /></PerPath>} />
      <Route path="/nz-fleet" element={<FleetOverview />} />
      <Route path="/region/:tla" element={<PerPath><RegionStats /></PerPath>} />
      <Route path="/account" element={<Account />} />
      <Route path="/developers" element={<Developers />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      {/* Same corner as the desktop feedback pill, which hides while a toast shows (FeedbackWidget). */}
      <Sonner position="bottom-right" offset={{ bottom: 24, right: 24 }} />
      <BrowserRouter>
        <ScrollToTop />
        <AnalyticsTracker />
        <FeedbackWidget />
        <PullToRefresh />
        <SiteNavMobile />
        <Pages />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
