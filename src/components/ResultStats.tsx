import { useState } from "react";
import { BarChart3, ChevronDown, ChevronUp } from "lucide-react";
import { type BreakdownData } from "@/lib/vehicleApi";

interface ResultStatsProps {
  data: BreakdownData;
  loading: boolean;
}

const labels: Record<string, string> = {
  MOTIVE_POWER: "Fuel Type",
  BASIC_COLOUR: "Colour",
  BODY_TYPE: "Body Type",
  TRANSMISSION_TYPE: "Transmission",
  MAKE: "Make",
};

const SKELETON_FIELDS = ["Fuel Type", "Colour", "Body Type", "Transmission", "Make"];
const SKELETON_ROWS = [85, 60, 45, 30, 20, 12, 8, 5]; // bar widths %

function SkeletonBar({ width }: { width: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
      <div style={{ width: 90, height: 10, borderRadius: 4, background: "#e5e7eb", animation: "pulse 1.4s ease-in-out infinite" }} />
      <div style={{ flex: 1, height: 8, background: "#f3f4f6", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${width}%`, background: "#e5e7eb", borderRadius: 999, animation: "pulse 1.4s ease-in-out infinite" }} />
      </div>
      <div style={{ width: 45, height: 10, borderRadius: 4, background: "#e5e7eb", animation: "pulse 1.4s ease-in-out infinite" }} />
    </div>
  );
}

export function ResultStats({ data, loading }: ResultStatsProps) {
  const [expanded, setExpanded] = useState(true);
  const hasData = Object.keys(data).length > 0;

  if (!hasData && !loading) return null;

  return (
    <>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
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
            {loading && (
              <span style={{ fontSize: 9, color: "#0ea5e9", letterSpacing: "0.15em", opacity: 0.8 }}>
                · LOADING...
              </span>
            )}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "#6b7280" }}>
            {expanded ? "CLICK TO HIDE" : "CLICK TO SHOW"}
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
            {loading && !hasData
              ? SKELETON_FIELDS.map((label) => (
                  <div key={label}>
                    <div style={{ fontSize: 9, color: "#d1d5db", letterSpacing: "0.18em", marginBottom: 8, fontWeight: 700 }}>
                      {label.toUpperCase()}
                    </div>
                    {SKELETON_ROWS.map((w, i) => <SkeletonBar key={i} width={w} />)}
                  </div>
                ))
              : Object.entries(data).map(([key, items]) => {
                  const max = items[0]?.count || 1;
                  const total = items.reduce((sum, item) => sum + item.count, 0) || 1;
                  return (
                    <div key={key}>
                      <div style={{ fontSize: 9, color: "#6b7280", letterSpacing: "0.18em", marginBottom: 8, fontWeight: 700 }}>
                        {(labels[key] ?? key).toUpperCase()}
                      </div>
                      {items.map((d) => (
                        <div key={d.value} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                          <div style={{ width: 90, fontSize: 10, color: "#4b5563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.value}>
                            {d.value}
                          </div>
                          <div style={{ flex: 1, height: 8, background: "#f3f4f6", position: "relative", borderRadius: 999, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${(d.count / max) * 100}%`, background: "linear-gradient(90deg,#0ea5e9,#22c55e)" }} />
                          </div>
                          <div style={{ fontSize: 9, color: "#6b7280", minWidth: 45, textAlign: "right" }}>
                            {d.count.toLocaleString()} ({((d.count / total) * 100).toFixed(1)}%)
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
          </div>
        )}
      </div>
    </>
  );
}