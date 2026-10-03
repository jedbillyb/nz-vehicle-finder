import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * React Router keeps the scroll position across page changes, so a link in
 * the footer opened the next page scrolled to the bottom. Start each new page
 * at the top. Query-string changes (searching, paging) keep their position.
 */
export function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
