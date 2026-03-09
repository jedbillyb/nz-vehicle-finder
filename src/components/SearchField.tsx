import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { getSuggestions } from "@/lib/vehicleApi";
import { Vehicle } from "@/lib/mockData";
import { cn } from "@/lib/utils";

/** Short debounce only while typing; open/focus uses preloaded cache so we fetch immediately. */
const DEBOUNCE_TYPING_MS = 60;
const DEBOUNCE_WHEN_EMPTY_MS = 0;

interface SearchFieldProps {
  label: string;
  field: keyof Vehicle;
  value: string;
  onChange: (value: string) => void;
  filterBy?: Partial<Record<keyof Vehicle, string>>; // e.g. { MAKE: "FORD" }
}

export function SearchField({ label, field, value, onChange, filterBy }: SearchFieldProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showSuggestions) return;

    const ac = new AbortController();
    const delay =
      value.trim() === "" ? DEBOUNCE_WHEN_EMPTY_MS : DEBOUNCE_TYPING_MS;
    const timeoutId = setTimeout(() => {
      getSuggestions(field, value, filterBy, ac.signal)
        .then(setSuggestions)
        .catch((err) => {
          if (err?.name !== "AbortError") setSuggestions([]);
        });
    }, delay);

    return () => {
      clearTimeout(timeoutId);
      ac.abort();
    };
  }, [value, field, showSuggestions, JSON.stringify(filterBy)]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      // Let the parent form or global handler trigger the actual search.
      return;
    }
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && highlightedIndex >= 0) {
      e.preventDefault();
      onChange(suggestions[highlightedIndex]);
      setShowSuggestions(false);
    } else if (e.key === "Tab" && suggestions.length > 0) {
      e.preventDefault();
      onChange(suggestions[highlightedIndex >= 0 ? highlightedIndex : 0]);
      setShowSuggestions(false);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <label className="block text-xs font-medium text-muted-foreground mb-1 font-mono uppercase tracking-wider">
        {label}
      </label>
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setHighlightedIndex(-1);
        }}
        onFocus={() => setShowSuggestions(true)}
        onKeyDown={handleKeyDown}
        className="bg-secondary/50 border-border/60 text-foreground placeholder:text-muted-foreground/50 h-9 text-sm font-mono"
        placeholder={`Any ${label.toLowerCase()}...`}
      />
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-40 overflow-auto rounded-md border border-border bg-popover shadow-lg">
          {suggestions.map((s, i) => (
            <button
              key={s}
              className={cn(
                "w-full text-left px-3 py-1.5 text-sm font-mono hover:bg-accent hover:text-accent-foreground transition-colors",
                i === highlightedIndex && "bg-accent text-accent-foreground"
              )}
              onMouseDown={() => {
                onChange(s);
                setShowSuggestions(false);
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}