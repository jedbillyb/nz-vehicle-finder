/**
 * Grey placeholder table rows shown while results load. They match the real
 * rows' height, so the table already has its final size and nothing jumps
 * when the data arrives.
 */
const WIDTHS = [70, 55, 40, 60, 35, 50, 45, 30, 65];

export function SkeletonRows({ columns, rows = 12 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} aria-hidden style={{ borderBottom: "1px solid #e5e7eb", background: r % 2 === 0 ? "#ffffff" : "#f9fafb" }}>
          {Array.from({ length: columns }, (_, c) => (
            <td key={c} style={{ padding: "7px 16px", fontSize: 11 }}>
              <span className="text-skeleton" style={{ display: "inline-block", width: `${WIDTHS[(c + r) % WIDTHS.length]}%`, minWidth: 24 }}>&nbsp;</span>
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** A grey block standing in for a whole section, sized like the real one. */
export function SkeletonBlock({ height }: { height: number }) {
  return <div aria-hidden className="text-skeleton" style={{ display: "block", height, borderRadius: 8 }} />;
}
