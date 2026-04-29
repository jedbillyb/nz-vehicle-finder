import { Link } from "react-router-dom";
import { relatedMakes } from "@/lib/popularMakes";
import { captureEvent } from "@/lib/posthog";

export function RelatedMakes({ currentUpper }: { currentUpper: string }) {
  const items = relatedMakes(currentUpper, 12);
  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="related-makes-heading"
      style={{
        padding: "24px 24px 32px",
        background: "#ffffff",
        borderTop: "1px solid #e5e7eb",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <h2
          id="related-makes-heading"
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "#0f172a",
            margin: "0 0 12px",
            letterSpacing: "-0.01em",
          }}
        >
          Explore other popular makes
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {items.map((m) => (
            <Link
              key={m.slug}
              to={`/stats/${m.slug}`}
              onClick={() =>
                captureEvent("related_make_clicked", {
                  from: currentUpper,
                  to: m.upper,
                })
              }
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: "6px 12px",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                background: "#f9fafb",
                color: "#0f172a",
                textDecoration: "none",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#eff6ff";
                e.currentTarget.style.borderColor = "#bfdbfe";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#f9fafb";
                e.currentTarget.style.borderColor = "#e5e7eb";
              }}
            >
              {m.name}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
