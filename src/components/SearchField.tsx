import { useMemo, useRef, useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { getSuggestionsLocal, getSuggestions, getModelsForMake } from "@/lib/vehicleApi";
import { Vehicle } from "@/lib/mockData";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { captureEvent } from "@/lib/posthog";

interface SearchFieldProps {
  label: string;
  field: keyof Vehicle;
  value: string;
  onChange: (value: string) => void;
  filterBy?: Partial<Record<keyof Vehicle, string>>;
}

export function SearchField({ label, field, value, onChange, filterBy }: SearchFieldProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [debouncedValue, setDebouncedValue] = useState(value);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedValue(value), 150);
    return () => clearTimeout(t);
  }, [value]);

  const { data: remoteSuggestions = [] } = useQuery({
    queryKey: ["suggestions", field, debouncedValue, filterBy],
    queryFn: ({ signal }) => getSuggestions(field, debouncedValue, filterBy, signal),
    enabled: showSuggestions && (debouncedValue.length > 0 || !!filterBy),
    staleTime: 60 * 1000,
  });

  const suggestions = useMemo(() => {
    // If we have remote suggestions, use them as they are most accurate (filtered by other fields)
    if (remoteSuggestions.length > 0) {
      return remoteSuggestions.slice(0, 10);
    }
    
    // Fallback/Initial suggestions while remote is loading or if it returns nothing
    // We prioritize model-specific local search if a make is selected
    if (field === "MODEL" && filterBy?.MAKE) {
      const models = getModelsForMake(filterBy.MAKE as string, value);
      if (models.length > 0) return models;
    }

    // General local fallback (e.g. from the big autocomplete.json)
    return getSuggestionsLocal(field as string, value, filterBy);
  }, [field, value, filterBy, remoteSuggestions]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node))
        setShowSuggestions(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Tab" || (e.key === "Enter" && highlightedIndex >= 0)) {
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
        onChange={e => { onChange(e.target.value); setHighlightedIndex(-1); }}
        onFocus={() => {
          setShowSuggestions(true);
          captureEvent("filter_focused", { field: label });
        }}
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
                captureEvent("suggestion_selected", { field: label, value: s });
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