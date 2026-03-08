import { Vehicle } from "@/lib/mockData";

export function exportToCsv(vehicles: Vehicle[], filename = "vehicles.csv") {
  if (vehicles.length === 0) return;
  const keys = Object.keys(vehicles[0]) as (keyof Vehicle)[];
  const header = keys.join(",");
  const rows = vehicles.map((v) =>
    keys.map((k) => `"${(v[k] || "").replace(/"/g, '""')}"`).join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
