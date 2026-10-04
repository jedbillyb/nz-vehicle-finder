import { captureEvent } from "@/lib/posthog";
import { cn } from "@/lib/utils";

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

/**
 * Same box, label and type as SearchField, so a row of filters reads as one
 * set. The number spinners are hidden: they are too small to hit and step one
 * unit at a time, which is useless for years or engine sizes.
 */
const boxClass = cn(
  "h-9 w-full min-w-0 rounded-md border border-border/60 bg-secondary/50 px-2.5 text-sm font-mono text-foreground",
  "placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ring-offset-background",
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
);

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
    <div className="min-w-0">
      <label className="mb-1 block text-xs font-medium text-muted-foreground font-mono tracking-wide">
        {label}
      </label>
      <div className="flex min-w-0 items-center gap-1.5">
        <input
          type="number"
          inputMode="numeric"
          aria-label={`${label} from`}
          value={valueMin}
          onChange={(e) => onChangeMin(e.target.value)}
          placeholder={String(min)}
          min={min}
          max={max}
          step={step}
          className={boxClass}
          onFocus={() => captureEvent("filter_focused", { field: label, type: "min" })}
        />
        <span className="shrink-0 text-xs text-muted-foreground/60">–</span>
        <input
          type="number"
          inputMode="numeric"
          aria-label={`${label} to`}
          value={valueMax}
          onChange={(e) => onChangeMax(e.target.value)}
          placeholder={String(max)}
          min={min}
          max={max}
          step={step}
          className={boxClass}
          onFocus={() => captureEvent("filter_focused", { field: label, type: "max" })}
        />
      </div>
    </div>
  );
}
