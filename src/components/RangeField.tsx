import { useState } from "react";
import { captureEvent } from "@/lib/posthog";

interface RangeFieldProps {
  label: string;
  fieldMin: string;
  fieldMax: string;
  valueMin: string;
  valueMax: string;
  onChangeMin: (value: string) => void;
  onChangeMax: (value: string) => void;
  min: number;
  max: number;
  step?: number;
}

export function RangeField({
  label,
  valueMin,
  valueMax,
  onChangeMin,
  onChangeMax,
  min,
  max,
  step = 1,
}: RangeFieldProps) {
  return (
    <div style={{ minWidth: 0, width: "100%" }}>
      <label style={{
        display: "block",
        fontSize: 9,
        fontWeight: 700,
        color: "#6b7280",
        marginBottom: 6,
        letterSpacing: "0.2em",
        fontFamily: "inherit",
      }}>
        {label}
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
        <input
          type="number"
          value={valueMin}
          onChange={(e) => onChangeMin(e.target.value)}
          placeholder={String(min)}
          min={min}
          max={max}
          step={step}
          style={{
            width: "100%",
            minWidth: 0,
            background: "#ffffff",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            color: valueMin ? "#111827" : "#9ca3af",
            padding: "5px 8px",
            fontSize: 11,
            fontFamily: "inherit",
            outline: "none",
          }}
          onFocus={e => e.currentTarget.style.borderColor = "#0ea5e9"}
          onBlur={e => e.currentTarget.style.borderColor = "#d1d5db"}
        />
        <span style={{ color: "#9ca3af", fontSize: 10, flexShrink: 0 }}>–</span>
        <input
          type="number"
          value={valueMax}
          onChange={(e) => onChangeMax(e.target.value)}
          placeholder={String(max)}
          min={min}
          max={max}
          step={step}
          style={{
            width: "100%",
            minWidth: 0,
            background: "#ffffff",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            color: valueMax ? "#111827" : "#9ca3af",
            padding: "5px 8px",
            fontSize: 11,
            fontFamily: "inherit",
            outline: "none",
          }}
          onFocus={e => e.currentTarget.style.borderColor = "#0ea5e9"}
          onBlur={e => e.currentTarget.style.borderColor = "#d1d5db"}
        />
      </div>
    </div>
  );
}
 { field: label, type: "max" });
          }}
          onBlur={e => e.currentTarget.style.borderColor = "#d1d5db"}
        />
      </div>
    </div>
  );
}
