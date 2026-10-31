import { useEffect, useState } from "react";

/** Re-render this component every `ms` milliseconds (used to poll the sim at a UI-friendly rate). */
export function useUiTick(ms: number): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((v) => v + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return n;
}

/** Jump back to the top of the page. Every new screen, session or weekend stage should open at the top, never wherever the last one was scrolled to. */
export function scrollTop() {
  try {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.scrollingElement?.scrollTo?.(0, 0);
  } catch {
    /* no scrolling in this environment */
  }
}
