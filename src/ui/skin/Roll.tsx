import { useEffect, useRef, useState } from "react";

/** A number that counts to its new value with a small overshoot, so money, points and gaps feel like they land. */
export function Roll({ v, fmt = (x: number) => String(Math.round(x)), ms = 520, good = "up" }: { v: number; fmt?: (x: number) => string; ms?: number; good?: "up" | "down" | "none" }) {
  const [shown, setShown] = useState(v);
  const [dir, setDir] = useState<"up" | "down" | "">("");
  const from = useRef(v);
  useEffect(() => {
    if (from.current === v) return;
    const a = from.current;
    const b = v;
    from.current = v;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setShown(b); return; }
    setDir(good === "none" ? "" : (b > a) === (good === "up") ? "up" : "down");
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      // ease out back: a little past the target, then settle
      const c1 = 1.9;
      const e = 1 + (c1 + 1) * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
      setShown(a + (b - a) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else { setShown(b); window.setTimeout(() => setDir(""), 500); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [v, ms, good]);
  return <span className={`roll ${dir}`}>{fmt(shown)}</span>;
}
