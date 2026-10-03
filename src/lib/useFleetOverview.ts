import { useEffect, useState } from "react";
import { fetchFleetOverview, type FleetOverview } from "@/lib/vehicleApi";

/** One request per page load, shared by every component that wants the fleet totals. */
let pending: Promise<FleetOverview | null> | null = null;

export function useFleetOverview(): FleetOverview | null {
  const [data, setData] = useState<FleetOverview | null>(null);
  useEffect(() => {
    let live = true;
    pending ??= fetchFleetOverview().then((d) => {
      if (!d) pending = null; // let a later page retry after a failure
      return d;
    });
    pending.then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, []);
  return data;
}
