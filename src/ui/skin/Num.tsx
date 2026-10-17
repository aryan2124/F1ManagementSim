import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { juiceUp } from "./juice";

/** A value that reacts when it changes: wobble, and a flash of green or red for up or down. */
export function Num({ v, children, className = "", style, good = "up" }: { v: number; children?: ReactNode; className?: string; style?: CSSProperties; good?: "up" | "down" | "none" }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(v);
  useEffect(() => {
    if (prev.current === v) return;
    const up = v > prev.current;
    prev.current = v;
    const el = ref.current;
    if (!el) return;
    juiceUp(el, 0.22, 4);
    if (good === "none") return;
    el.classList.remove("flash-up", "flash-down");
    void el.offsetWidth;
    el.classList.add(up === (good === "up") ? "flash-up" : "flash-down");
  }, [v, good]);
  return (
    <span ref={ref} className={`num-juice ${className}`} style={style}>
      {children ?? v}
    </span>
  );
}
