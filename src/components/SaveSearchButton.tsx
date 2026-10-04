import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { captureEvent } from "@/lib/posthog";
import { deleteSavedSearch, saveSearch, setPendingSave, type SavedSearch } from "@/lib/account";
import { SAVED_SEARCHES_KEY, useSavedSearches } from "@/hooks/useSavedSearches";

interface SaveSearchButtonProps {
  /** Canonical query for the current filters (shared/savedSearch.ts); "" when none are set. */
  query: string;
  style: React.CSSProperties;
}

/**
 * Star toggle for the current search. Signed out, it keeps the search in this
 * browser and sends the person to sign in; the account page saves it once
 * they are in.
 */
export function SaveSearchButton({ query, style }: SaveSearchButtonProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: searches, isLoading } = useSavedSearches();
  const [busy, setBusy] = useState(false);

  const saved = searches?.find((s) => s.query === query);

  const setList = (update: (list: SavedSearch[]) => SavedSearch[]) =>
    queryClient.setQueryData<SavedSearch[] | null>(SAVED_SEARCHES_KEY, (list) => (list ? update(list) : list));

  const onClick = async () => {
    if (!query || busy) return;
    if (searches === null) {
      setPendingSave(query);
      captureEvent("saved_search_signin_prompted");
      navigate("/account?save=1");
      return;
    }
    setBusy(true);
    try {
      if (saved) {
        await deleteSavedSearch(saved.id);
        setList((list) => list.filter((s) => s.id !== saved.id));
        captureEvent("saved_search_removed", { source: "search_page" });
        toast("Removed from saved searches");
      } else {
        const created = await saveSearch(query);
        setList((list) => [created, ...list.filter((s) => s.id !== created.id)]);
        captureEvent("saved_search_added");
        toast.success(`Saved "${created.name}"`, {
          action: { label: "View all", onClick: () => navigate("/account#saved-searches") },
        });
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const on = !!saved;
  return (
    <button
      onClick={onClick}
      disabled={!query || busy || isLoading}
      aria-pressed={on}
      title={on ? "Remove from saved searches" : searches === null ? "Sign in to save this search" : "Save this search to your account"}
      style={{
        ...style,
        background: on ? "#fffbeb" : "transparent",
        color: on ? "#b45309" : "#4b5563",
        border: on ? "1px solid #fcd34d" : "1px solid #d1d5db",
        cursor: !query || busy ? "default" : "pointer",
        opacity: isLoading ? 0.6 : 1,
      }}
    >
      <Star size={11} fill={on ? "#f59e0b" : "none"} color={on ? "#f59e0b" : "currentColor"} />
      {on ? "Saved" : "Save search"}
    </button>
  );
}

/** Quick links to the user's saved searches, for the empty search page. */
export function SavedSearchLinks() {
  const { data: searches } = useSavedSearches();
  if (!searches || searches.length === 0) return null;
  return (
    <>
      <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: "#111827", display: "flex", alignItems: "center", gap: 6 }}>
        <Star size={13} fill="#f59e0b" color="#f59e0b" /> Your saved searches
        <Link to="/account#saved-searches" style={{ marginLeft: "auto", fontSize: 11, fontWeight: 500, color: "#0369a1", textDecoration: "none" }}>
          Manage
        </Link>
      </h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
        {searches.slice(0, 12).map((s) => (
          <a
            key={s.id}
            href={`/?${s.query}`}
            onClick={() => captureEvent("saved_search_opened", { source: "search_page" })}
            style={{ fontSize: 11, padding: "6px 12px", borderRadius: 999, border: "1px solid #fcd34d", background: "#fffbeb", color: "#92400e", textDecoration: "none", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {s.name}
          </a>
        ))}
      </div>
    </>
  );
}
