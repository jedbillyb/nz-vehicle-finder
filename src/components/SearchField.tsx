import { useMemo, useRef, useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { getSuggestionsLocal, getSuggestions, getModelsForMake } from "@/lib/vehicleApi";
import { Vehicle } from "@/lib/mockData";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { captureEvent } from "@/lib/posthog";
import { Info, X } from "lucide-react";
import { parseFilterValue, serializeTerms, type FilterTerm } from "../../shared/filterTerms";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface SearchFieldProps {
  label: string;
  field: keyof Vehicle;
  /** Encoded term list - see shared/filterTerms.ts */
  value: string;
  onChange: (value: string) => void;
  onValidationChange?: (isValid: boolean) => void;
  filterBy?: Partial<Record<keyof Vehicle, string>>;
  helpText?: string;
}

export function SearchField({
  label,
  field,
  value,
  onChange,
  onValidationChange,
  filterBy,
  helpText
}: SearchFieldProps) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [debouncedInput, setDebouncedInput] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  const terms = useMemo(() => parseFilterValue(value), [value]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedInput(input), 150);
    return () => clearTimeout(t);
  }, [input]);

  const { data: remoteSuggestions = [], isFetched } = useQuery({
    queryKey: ["suggestions", field, debouncedInput, filterBy],
    queryFn: ({ signal }) => getSuggestions(field, debouncedInput, filterBy, signal),
    enabled: (showSuggestions || !!input.trim()) && (debouncedInput.length > 0 || !!filterBy),
    staleTime: 60 * 1000,
  });

  const suggestions = useMemo(() => {
    const hasActiveFilters = filterBy && Object.values(filterBy).some(v => !!v);
    // Values already picked on this field are not worth offering again.
    const chosen = new Set(terms.filter(t => !t.contains).map(t => t.value.toUpperCase()));
    const trim = (list: string[]) => list.filter(s => !chosen.has(s.toUpperCase())).slice(0, 10);

    // Remote suggestions are the most accurate - they respect the other fields.
    if (remoteSuggestions.length > 0) {
      return trim(remoteSuggestions);
    }

    // With filters active, falling back to the global list would show values
    // from other makes/categories, so be careful about it.
    if (hasActiveFilters) {
      if (field === "MODEL" && filterBy?.MAKE) {
        const models = getModelsForMake(filterBy.MAKE as string, input);
        if (models.length > 0) return trim(models);
      }

      // The server has already answered with nothing - don't paper over it.
      if (isFetched) {
        return [];
      }
    }

    // General local fallback (the big autocomplete.json), used before the first
    // remote fetch lands or when no other filters are set.
    return trim(getSuggestionsLocal(field as string, input, filterBy));
  }, [field, input, filterBy, remoteSuggestions, isFetched, terms]);

  // Typed text that matches nothing at all is worth flagging; committed terms
  // are always searchable, they just might return no rows.
  const isValid = useMemo(
    () => !input.trim() || suggestions.length > 0,
    [input, suggestions]
  );

  useEffect(() => {
    onValidationChange?.(isValid);
  }, [isValid, onValidationChange]);

  const commit = (next: FilterTerm[]) => {
    onChange(serializeTerms(next));
  };

  const addTerm = (raw: string, contains: boolean) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const duplicate = terms.some(
      t => t.contains === contains && t.value.toUpperCase() === trimmed.toUpperCase()
    );
    if (!duplicate) commit([...terms, { value: trimmed, contains }]);
    setInput("");
    setHighlightedIndex(-1);
  };

  /** Commit whatever is typed: an exact value if it is one, otherwise a match term. */
  const commitInput = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    const exactMatch = suggestions.find(s => s.toLowerCase() === trimmed.toLowerCase());
    if (exactMatch) {
      addTerm(exactMatch, false);
    } else {
      addTerm(trimmed, true);
      captureEvent("filter_contains_term_added", { field: label, value: trimmed });
    }
  };

  const removeTerm = (index: number) => {
    commit(terms.filter((_, i) => i !== index));
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node))
        setShowSuggestions(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !input && terms.length > 0) {
      removeTerm(terms.length - 1);
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
        e.preventDefault();
        addTerm(suggestions[highlightedIndex], false);
        captureEvent("suggestion_selected", { field: label, value: suggestions[highlightedIndex] });
        return;
      }
      if (input.trim()) {
        e.preventDefault();
        commitInput();
      }
      return;
    }
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex(i => Math.max(i - 1, -1));
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex items-center gap-1.5 mb-1">
        <label className="block text-xs font-medium text-muted-foreground font-mono tracking-wide">
          {label}
        </label>
        {terms.length > 0 && (
          <button
            type="button"
            onClick={() => { commit([]); setInput(""); }}
            className="ml-auto text-[10px] font-mono text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            clear
          </button>
        )}
        {helpText && (
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="flex items-center justify-center p-0.5 rounded-full hover:bg-accent transition-colors">
                <Info size={12} className="text-muted-foreground/60 cursor-pointer hover:text-muted-foreground transition-colors" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 text-[11px] font-mono p-3 leading-relaxed">
              {helpText}
            </PopoverContent>
          </Popover>
        )}
      </div>

      <Input
        value={input}
        onChange={e => { setInput(e.target.value); setHighlightedIndex(-1); setShowSuggestions(true); }}
        onFocus={() => {
          setShowSuggestions(true);
          captureEvent("filter_focused", { field: label });
        }}
        onBlur={commitInput}
        onKeyDown={handleKeyDown}
        className={cn(
          "bg-secondary/50 border-border/60 text-foreground placeholder:text-muted-foreground/50 h-9 text-sm font-mono",
          !isValid && "border-destructive ring-destructive/20 focus-visible:ring-destructive/20"
        )}
        placeholder={terms.length > 0 ? "Add another…" : `Any ${label.toLowerCase()}...`}
      />

      {/* Chips sit below the input so adding one never pushes this field's input
          out of line with the other fields in the grid row. */}
      {terms.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {terms.map((term, i) => (
            <span
              key={`${term.contains ? "~" : "="}${term.value}`}
              title={term.contains ? `Matches any value containing "${term.value}"` : term.value}
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono leading-none",
                term.contains
                  // A wildcard term reads differently from a picked value, so it looks different.
                  ? "border border-dashed border-sky-400/70 text-sky-700 bg-sky-50"
                  : "border border-border bg-secondary text-foreground"
              )}
            >
              {term.contains && <span className="opacity-60">contains</span>}
              {term.value}
              <button
                type="button"
                onClick={() => removeTerm(i)}
                className="opacity-50 hover:opacity-100 transition-opacity"
                aria-label={`Remove ${term.value}`}
              >
                <X size={9} />
              </button>
            </span>
          ))}
        </div>
      )}

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-40 overflow-auto rounded-md border border-border bg-popover shadow-lg">
          {suggestions.map((s, i) => (
            <button
              key={s}
              className={cn(
                "w-full text-left px-3 py-1.5 text-sm font-mono hover:bg-accent hover:text-accent-foreground transition-colors",
                i === highlightedIndex && "bg-accent text-accent-foreground"
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                addTerm(s, false);
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
