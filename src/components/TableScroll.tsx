import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

/**
 * The scroll box around a results table. On a narrow screen the table is wider
 * than the page, so a fade on the right edge shows there's more, and a "Swipe"
 * hint shows until the first sideways scroll.
 */
export function TableScroll({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });
  const [swiped, setSwiped] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      setMore({ left: el.scrollLeft > 4, right: el.scrollLeft < max - 4 });
      if (el.scrollLeft > 4) setSwiped(true);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    // The table changes width as results load and the screen turns.
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="table-scroll">
      <div ref={ref} className="table-scroll__box">
        {children}
      </div>
      <div className={`table-scroll__fade table-scroll__fade--left${more.left ? " is-on" : ""}`} aria-hidden="true" />
      <div className={`table-scroll__fade table-scroll__fade--right${more.right ? " is-on" : ""}`} aria-hidden="true" />
      <div className={`table-scroll__hint${more.right && !swiped ? " is-on" : ""}`} aria-hidden="true">
        Swipe <ChevronRight size={12} />
      </div>
    </div>
  );
}
