import { useState } from "react";

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
    <div>
      <label style={{
        display: "block",
        fontSize: 9,
        fontWeight: 700,
        color: "#444",
        marginBottom: 6,
        letterSpacing: "0.2em",
        fontFamily: "inherit",
      }}>
        {label}
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
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
            background: "#111",
            border: "1px solid #222",
            color: valueMin ? "#e0e0e0" : "#333",
            padding: "5px 8px",
            fontSize: 11,
            fontFamily: "inherit",
            outline: "none",
          }}
          onFocus={e => e.currentTarget.style.borderColor = "#3bff7e"}
          onBlur={e => e.currentTarget.style.borderColor = "#222"}
        />
        <span style={{ color: "#333", fontSize: 10, flexShrink: 0 }}>–</span>
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
            background: "#111",
            border: "1px solid #222",
            color: valueMax ? "#e0e0e0" : "#333",
            padding: "5px 8px",
            fontSize: 11,
            fontFamily: "inherit",
            outline: "none",
          }}
          onFocus={e => e.currentTarget.style.borderColor = "#3bff7e"}
          onBlur={e => e.currentTarget.style.borderColor = "#222"}
        />
      </div>
    </div>
  );
}
