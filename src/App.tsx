import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import MakeStats from "./pages/MakeStats";
import ModelStats from "./pages/ModelStats";
import FleetOverview from "./pages/FleetOverview";
import RegionStats from "./pages/RegionStats";
import NotFound from "./pages/NotFound";
import { AnalyticsTracker } from "./components/AnalyticsTracker";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AnalyticsTracker />
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/stats/:make" element={<MakeStats />} />
          <Route path="/stats/:make/:model" element={<ModelStats />} />
          <Route path="/nz-fleet" element={<FleetOverview />} />
          <Route path="/region/:tla" element={<RegionStats />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
