import { useState, useEffect } from "react";
import { BarChart3, ChevronDown, ChevronUp } from "lucide-react";
import { API_BASE } from "@/lib/vehicleApi";
import { SearchFilters } from "@/lib/vehicleApi";

interface ResultStatsProps {
  filters: SearchFilters;
}

export function ResultStats({ filters }: ResultStatsProps) {
  const [expanded, setExpanded] = useState(true);
  const [data, setData] = useState<Record<string, { value: string; count: number }[]>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams(filters as Record<string, string>);
        const res = await fetch(`${API_BASE}/api/breakdown?${params}`);
        if (res.ok) setData(await res.json());
      } catch (err) {
        console.error("Failed to fetch breakdown:", err);
      } finally {
        setLoading(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [filters]);

  const labels: Record<string, string> = {
    MOTIVE_POWER: "Fuel Type",
    BASIC_COLOUR: "Colour",
    BODY_TYPE: "Body Type",
    TRANSMISSION_TYPE: "Transmission",
    MAKE: "Make",
  };

  if (Object.keys(data).length === 0) return null;

  return (
    <div style={{ borderBottom: "1px solid #e5e7eb", background: "#f9fafb" }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 24px",
          background: "#f9fafb",
          border: "none",
          borderBottom: expanded ? "1px solid #e5e7eb" : "none",
          cursor: "pointer",
          color: "#4b5563",
        }}
      >
        <span style={{ fontSize: 10, letterSpacing: "0.2em", display: "flex", alignItems: "center", gap: 8 }}>
          <BarChart3 size={11} color="#0ea5e9" />
          <span style={{ color: "#0f172a" }}>RESULT BREAKDOWN</span>
        </span>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 9,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "#6b7280",
          }}
        >
          {loading ? "LOADING..." : expanded ? "CLICK TO HIDE" : "CLICK TO SHOW"}
          {expanded ? <ChevronUp size={13} color="#9ca3af" /> : <ChevronDown size={13} color="#9ca3af" />}
        </span>
      </button>

      {expanded && (
        <div
          style={{
            padding: "16px 24px",
            background: "#ffffff",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 20,
            borderTop: "1px solid #e5e7eb",
          }}
        >
          {Object.entries(data).map(([key, items]) => {
            const max = items[0]?.count || 1;
            return (
              <div key={key}>
                <div
                  style={{
                    fontSize: 9,
                    color: "#6b7280",
                    letterSpacing: "0.18em",
                    marginBottom: 8,
                    fontWeight: 700,
                  }}
                >
                  {labels[key].toUpperCase()}
                </div>
                {items.map((d) => (
                  <div key={d.value} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <div
                      style={{
                        width: 90,
                        fontSize: 10,
                        color: "#4b5563",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={d.value}
                    >
                      {d.value}
                    </div>
                    <div
                      style={{
                        flex: 1,
                        height: 8,
                        background: "#f3f4f6",
                        position: "relative",
                        borderRadius: 999,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${(d.count / max) * 100}%`,
                          background: "linear-gradient(90deg,#0ea5e9,#22c55e)",
                        }}
                      />
                    </div>
                    <div style={{ fontSize: 9, color: "#6b7280", minWidth: 45, textAlign: "right" }}>
                      {d.count.toLocaleString()} ({((d.count / (items.reduce((sum, i) => sum + i.count, 0))) * 100).toFixed(1)}%)
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
