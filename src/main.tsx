import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/responsive.css";

// With the keyboard up, iOS scrolls what's on screen within a page that stays
// put, so the nav strip stuck to the page's top slides away above it. Hand the
// gap to the CSS, which sticks the strip that much lower.
const seen = window.visualViewport;
if (seen) {
  const follow = () => {
    const shift = Math.max(0, Math.round(seen.offsetTop));
    document.documentElement.style.setProperty("--keyboard-shift", `${shift}px`);
  };
  seen.addEventListener("resize", follow);
  seen.addEventListener("scroll", follow);
}

createRoot(document.getElementById("root")!).render(<App />);
