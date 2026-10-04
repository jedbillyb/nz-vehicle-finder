import { useMemo, useRef, useState, useEffect } from "react";
import { getSuggestionsLocal, preloadSuggestions, getSuggestions, getModelsForMake, SUGGESTION_LIMIT } from "@/lib/vehicleApi";
import { Vehicle } from "@/lib/mockData";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { captureEvent } from "@/lib/posthog";
import { Check, Info, X } from "lucide-react";
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
  /**
   * Every other active filter. Suggestions are resolved against these, so the
   * dropdown can only offer values that still return rows.
   */
  filterBy?: Record<string, string | undefined>;
  helpText?: string;
}

/** Shared empty list, so the memos below don't see a new array every render. */
const NO_SUGGESTIONS: string[] = [];

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
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** Set when Tab already picked a value, so the blur that follows doesn't also commit the typed text. */
  const pickedOnTab = useRef(false);
  // Flips once autocomplete.json has arrived, so the local fallback list below
  // is rebuilt instead of staying the empty list it saw on first render.
  const [localReady, setLocalReady] = useState(false);
  useEffect(() => {
    let live = true;
    preloadSuggestions().then(() => { if (live) setLocalReady(true); });
    return () => { live = false; };
  }, []);

  const terms = useMemo(() => parseFilterValue(value), [value]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedInput(input), 150);
    return () => clearTimeout(t);
  }, [input]);

  const hasActiveFilters = useMemo(
    () => !!filterBy && Object.values(filterBy).some(v => !!v && v.trim()),
    [filterBy]
  );

  const queryClient = useQueryClient();
  /**
   * Start fetching this field's list when the pointer arrives, so by the time
   * the click lands the round trip is usually done and the list opens full.
   */
  const prefetch = () => {
    if (input) return;
    queryClient.prefetchQuery({
      queryKey: ["suggestions", field, "", filterBy],
      queryFn: ({ signal }) => getSuggestions(field, "", filterBy, signal),
      staleTime: 60 * 1000,
    });
  };

  const { data: remoteSuggestions = NO_SUGGESTIONS, isFetching, isError } = useQuery({
    queryKey: ["suggestions", field, debouncedInput, filterBy],
    queryFn: ({ signal }) => getSuggestions(field, debouncedInput, filterBy, signal),
    enabled: showSuggestions || !!input.trim(),
    staleTime: 60 * 1000,
    // While the next query loads, keep showing this field's last list rather
    // than flashing "Loading…" or a differently ordered local list. It is
    // filtered by what is typed below, so it never offers a stale mismatch.
    placeholderData: (prev, prevQuery) =>
      prevQuery?.queryKey[1] === field &&
      JSON.stringify(prevQuery?.queryKey[3]) === JSON.stringify(filterBy)
        ? prev
        : undefined,
  });

  /** Values picked on this field, as typed. Contains-terms live in the chips only. */
  const selected = useMemo(
    () => terms.filter(t => !t.contains).map(t => t.value),
    [terms]
  );
  const selectedSet = useMemo(
    () => new Set(selected.map(v => v.toUpperCase())),
    [selected]
  );

  /** Everything still selectable for this field, most common first. */
  const available = useMemo(() => {
    // Remote suggestions are the most accurate - they respect the other fields.
    // A placeholder list from the previous keystroke is narrowed to what is typed now.
    if (remoteSuggestions.length > 0) {
      const typed = input.trim().toUpperCase();
      return typed
        ? remoteSuggestions.filter(v => v.toUpperCase().includes(typed))
        : remoteSuggestions;
    }

    // With other filters set, the global list would offer values from other
    // makes and categories - exactly the mismatches that return nothing - so it
    // is not used as a stand-in while the constrained list is still loading.
    // Only the locally cached models for the chosen make are safe to show.
    if (hasActiveFilters && !isError) {
      if (field === "MODEL" && filterBy?.MAKE) {
        const models = getModelsForMake(filterBy.MAKE, input);
        if (models.length > 0) return models;
      }
      return [];
    }

    // General local fallback (the big autocomplete.json): no other filters to
    // respect, or the API is unreachable and a rough list beats none.
    return getSuggestionsLocal(field as string, input, filterBy);
    // localReady isn't read, but listing it rebuilds the list once autocomplete.json lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field, input, filterBy, hasActiveFilters, remoteSuggestions, isError, localReady]);

  // What is already picked stays in the list, pinned at the top and ticked, so
  // the dropdown always shows the current selection - and clicking one takes it
  // off again. The rest keeps the server's popularity order.
  const suggestions = useMemo(() => {
    const typed = input.trim().toUpperCase();
    const pinned = selected.filter(v => !typed || v.toUpperCase().includes(typed));
    const rest = available.filter(v => !selectedSet.has(v.toUpperCase()));
    return [...pinned, ...rest];
  }, [available, selected, selectedSet, input]);

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
    // The full local list is checked too, so typing a real value and hitting
    // Enter before the filtered list has loaded still picks it exactly instead
    // of turning it into a "has" wildcard.
    const exactMatch =
      suggestions.find(s => s.toLowerCase() === trimmed.toLowerCase()) ??
      getSuggestionsLocal(field as string, trimmed).find(s => s.toLowerCase() === trimmed.toLowerCase());
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

  /** Clicking a value in the list picks it, or unpicks it if it is already on. */
  const toggleValue = (value: string) => {
    const upper = value.toUpperCase();
    if (selectedSet.has(upper)) {
      commit(terms.filter(t => t.contains || t.value.toUpperCase() !== upper));
      setInput("");
      setHighlightedIndex(-1);
      return;
    }
    addTerm(value, false);
    captureEvent("suggestion_selected", { field: label, value });
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node))
        setShowSuggestions(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (highlightedIndex < 0) return;
    const row = listRef.current?.children[highlightedIndex] as HTMLElement | undefined;
    row?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !input && terms.length > 0) {
      removeTerm(terms.length - 1);
      return;
    }
    if (e.key === "Escape") {
      setShowSuggestions(false);
      setHighlightedIndex(-1);
      return;
    }
    if (e.key === "Enter") {
      if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
        e.preventDefault();
        toggleValue(suggestions[highlightedIndex]);
        return;
      }
      if (input.trim()) {
        e.preventDefault();
        commitInput();
      }
      return;
    }
    // Tab takes the highlighted value (or what is typed) and then moves on to
    // the next field as usual; blur commits typed text, so only the
    // highlighted pick needs doing here.
    if (e.key === "Tab") {
      if (highlightedIndex >= 0 && suggestions[highlightedIndex] && !selectedSet.has(suggestions[highlightedIndex].toUpperCase())) {
        toggleValue(suggestions[highlightedIndex]);
        pickedOnTab.current = true;
      }
      return;
    }
    if (!showSuggestions) {
      if (e.key === "ArrowDown") { e.preventDefault(); setShowSuggestions(true); }
      return;
    }
    if (suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex(i => Math.max(i - 1, -1));
    }
  };

  return (
    <div ref={wrapperRef} className="relative" onPointerEnter={prefetch}>
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

      {/* Picked values sit inside the box as chips, like a tag input, so picking
          one never pushes the fields below it down. The box only grows if the
          chips need a second line. */}
      <div
        onMouseDown={e => {
          // Clicking the box (not just the text) focuses the input and opens the list.
          if (e.target !== inputRef.current) e.preventDefault();
          inputRef.current?.focus();
          setShowSuggestions(true);
        }}
        className={cn(
          "flex min-h-9 w-full cursor-text flex-wrap items-center gap-1 rounded-md border border-border/60 bg-secondary/50 px-1.5 py-1 transition-shadow",
          "focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ring-offset-background",
          !isValid && "border-destructive focus-within:ring-destructive/20"
        )}
      >
        {terms.map((term, i) => (
          <span
            key={`${term.contains ? "~" : "="}${term.value}`}
            title={term.contains ? `Matches any value containing "${term.value}"` : term.value}
            className={cn(
              "group inline-flex max-w-full items-center gap-1 rounded py-0.5 pl-1.5 pr-0.5 text-[11px] font-mono leading-none",
              term.contains
                // A wildcard term reads differently from a picked value, so it looks different.
                ? "border border-dashed border-primary/50 bg-primary/5 text-foreground"
                : "border border-border bg-background text-foreground"
            )}
          >
            {term.contains && (
              <span className="text-[9px] uppercase tracking-wide text-muted-foreground">has</span>
            )}
            <span className="truncate">{term.value}</span>
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); e.stopPropagation(); removeTerm(i); }}
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
              aria-label={`Remove ${term.value}`}
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={e => { setInput(e.target.value); setHighlightedIndex(-1); setShowSuggestions(true); }}
          onFocus={() => {
            setShowSuggestions(true);
            captureEvent("filter_focused", { field: label });
          }}
          onBlur={() => {
            setShowSuggestions(false);
            setHighlightedIndex(-1);
            if (pickedOnTab.current) {
              pickedOnTab.current = false;
              setInput("");
              return;
            }
            commitInput();
          }}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-expanded={showSuggestions}
          aria-label={label}
          className="h-6 w-0 min-w-[2ch] flex-1 bg-transparent px-1.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
          placeholder={terms.length > 0 ? "" : `Any ${label.toLowerCase()}...`}
        />
      </div>

      {showSuggestions && (
        <div onMouseDown={e => e.preventDefault()} className="absolute z-50 top-full left-0 right-0 mt-1 flex flex-col overflow-hidden rounded-md border border-border bg-popover shadow-lg">
          {/* Only the rows scroll, so the scrollbar stops above the footer note.
              overscroll-none stops the list rubber-banding at either end. */}
          <div ref={listRef} tabIndex={-1} className="max-h-64 overflow-y-auto overscroll-none">
            {suggestions.map((s, i) => {
              const isSelected = selectedSet.has(s.toUpperCase());
              return (
                <button
                  key={s}
                  type="button"
                  // Rows are picked with the mouse or the arrow keys; leaving them
                  // out of the tab order lets Tab go straight to the next field.
                  tabIndex={-1}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm font-mono hover:bg-accent hover:text-accent-foreground",
                    isSelected && "bg-secondary/60 font-semibold",
                    i === highlightedIndex && "bg-accent text-accent-foreground"
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    toggleValue(s);
                  }}
                >
                  <Check
                    size={12}
                    className={cn("shrink-0 text-primary", !isSelected && "invisible")}
                  />
                  <span className="truncate">{s}</span>
                </button>
              );
            })}
          </div>

          {suggestions.length === 0 && (
            <div className="px-3 py-2 text-[11px] font-mono leading-relaxed text-muted-foreground">
              {isFetching
                ? "Loading…"
                : hasActiveFilters
                  ? "No values left that match your other filters."
                  : "No matching values."}
            </div>
          )}

          {/* Every selectable value is listed, so say so when the list had to be
              cut - otherwise a truncated list reads as "that is all there is". */}
          {suggestions.length >= SUGGESTION_LIMIT && (
            <div className="shrink-0 border-t border-border bg-popover px-3 py-1.5 text-[10px] font-mono text-muted-foreground">
              First {SUGGESTION_LIMIT} of many - type to narrow.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
