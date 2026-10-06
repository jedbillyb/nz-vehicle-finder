/**
 * A smooth loading ring. Pure CSS in a fixed square box, so it spins in place
 * on phones instead of wobbling like a rotated icon.
 */
export function Spinner({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <span
      className="spinner"
      role="status"
      aria-label="Loading"
      style={{ width: size, height: size, color, borderWidth: Math.max(2, Math.round(size / 9)) }}
    />
  );
}
