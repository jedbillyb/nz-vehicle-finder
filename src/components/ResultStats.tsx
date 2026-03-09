import { Vehicle } from "@/lib/mockData";
import { useState, useMemo } from "react";
import { BarChart3, ChevronDown, ChevronUp } from "lucide-react";

interface ResultStatsProps {
  vehicles: Vehicle[];
}

const statFields: { key: keyof Vehicle; label: string }[] = [
  { key: "MOTIVE_POWER", label: "Fuel Type" },
  { key: "BASIC_COLOUR", label: "Colour" },
  { key: "BODY_TYPE", label: "Body Type" },
  { key: "TRANSMISSION_TYPE", label: "Transmission" },
  { key: "MAKE", label: "Make" },
];

function breakdown(vehicles: Vehicle[], field: keyof Vehicle): { value: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const v of vehicles) {
    const val = v[field] || "UNKNOWN";
    counts[val] = (counts[val] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

export function ResultStats({ vehicles }: ResultStatsProps) {
  const [expanded, setExpanded] = useState(true);
  const breakdownByField = useMemo(
    () => statFields.map((sf) => ({ ...sf, data: breakdown(vehicles, sf.key) })),
    [vehicles]
  );

  if (vehicles.length === 0) return null;

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
          <span>{expanded ? "CLICK TO HIDE" : "CLICK TO SHOW"}</span>
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
          {breakdownByField.map(({ key, label, data }) => {
            const max = data[0]?.count || 1;
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
                  {label.toUpperCase()}
                </div>
                {data.map((d) => (
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
                    <div style={{ fontSize: 9, color: "#6b7280", minWidth: 24, textAlign: "right" }}>{d.count}</div>
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
