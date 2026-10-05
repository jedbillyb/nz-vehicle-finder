import { useEffect } from "react";

/**
 * Freezes the page while a popup or sheet is open, giving back the scrollbar's
 * width so nothing shifts sideways.
 */
export function useScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const root = document.documentElement;
    const gap = window.innerWidth - root.clientWidth;
    const before = { overflow: root.style.overflow, paddingRight: root.style.paddingRight };
    root.style.overflow = "hidden";
    if (gap > 0) root.style.paddingRight = `${gap}px`;
    return () => {
      root.style.overflow = before.overflow;
      root.style.paddingRight = before.paddingRight;
    };
  }, [locked]);
}
