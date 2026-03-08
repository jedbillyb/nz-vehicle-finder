import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface PaginationProps {
  page: number;
  pages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pages, onPageChange }: PaginationProps) {
  if (pages <= 1) return null;

  const getVisiblePages = () => {
    const visible: number[] = [];
    const start = Math.max(1, page - 2);
    const end = Math.min(pages, page + 2);
    for (let i = start; i <= end; i++) visible.push(i);
    return visible;
  };

  const btnStyle = (active = false): React.CSSProperties => ({
    padding: "4px 10px",
    background: active ? "#3bff7e" : "transparent",
    color: active ? "#000" : "#555",
    border: "1px solid " + (active ? "#3bff7e" : "#222"),
    cursor: "pointer",
    fontSize: 10,
    fontFamily: "inherit",
    fontWeight: active ? 800 : 400,
    letterSpacing: "0.1em",
    minWidth: 32,
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 24px", background: "#0d0d0d", borderTop: "1px solid #1a1a1a" }}>
      <button onClick={() => onPageChange(1)} disabled={page === 1} style={{ ...btnStyle(), opacity: page === 1 ? 0.3 : 1 }}>
        <ChevronsLeft size={12} />
      </button>
      <button onClick={() => onPageChange(page - 1)} disabled={page === 1} style={{ ...btnStyle(), opacity: page === 1 ? 0.3 : 1 }}>
        <ChevronLeft size={12} />
      </button>

      {getVisiblePages()[0] > 1 && <span style={{ color: "#333", fontSize: 10 }}>…</span>}

      {getVisiblePages().map((p) => (
        <button key={p} onClick={() => onPageChange(p)} style={btnStyle(p === page)}>
          {p}
        </button>
      ))}

      {getVisiblePages()[getVisiblePages().length - 1] < pages && <span style={{ color: "#333", fontSize: 10 }}>…</span>}

      <button onClick={() => onPageChange(page + 1)} disabled={page === pages} style={{ ...btnStyle(), opacity: page === pages ? 0.3 : 1 }}>
        <ChevronRight size={12} />
      </button>
      <button onClick={() => onPageChange(pages)} disabled={page === pages} style={{ ...btnStyle(), opacity: page === pages ? 0.3 : 1 }}>
        <ChevronsRight size={12} />
      </button>

      <span style={{ fontSize: 10, color: "#444", letterSpacing: "0.1em", marginLeft: 8 }}>
        PAGE <span style={{ color: "#3bff7e" }}>{page}</span> OF <span style={{ color: "#888" }}>{pages}</span>
      </span>
    </div>
  );
}
