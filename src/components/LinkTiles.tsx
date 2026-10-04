import { Link } from "react-router-dom";

export type LinkTile = {
  key: string;
  to: string;
  label: string;
  count?: number;
  onClick?: () => void;
};

// Even-height grid of links with an optional count, used for "browse by make",
// "top models" and region lists. Long names truncate rather than wrap, so
// every tile in a row stays the same height. `wide` suits long names like
// "Queenstown-Lakes District" that would otherwise be cut short.
export function LinkTiles({ items, tone = "white", wide = false }: { items: LinkTile[]; tone?: "white" | "grey"; wide?: boolean }) {
  return (
    <div className={`fade-in link-tiles link-tiles--${tone}${wide ? " link-tiles--wide" : ""}`}>
      {items.map((t) => (
        <Link key={t.key} to={t.to} onClick={t.onClick} className="link-tile" title={t.label}>
          <span className="link-tile__label">{t.label}</span>
          {t.count !== undefined && <span className="link-tile__count">{t.count.toLocaleString("en-NZ")}</span>}
        </Link>
      ))}
    </div>
  );
}
