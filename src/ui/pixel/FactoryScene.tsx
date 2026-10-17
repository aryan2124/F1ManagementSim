import { useEffect, useRef, useState } from "react";
import "./pixel.css";
import { SH, SW, drawScene, layout, type Dept, type Levels } from "./sceneDraw";

export type { Dept };

export interface FactorySceneProps {
  /** factory shutdown: lights off, CLOSED sign, no staff */
  closed: boolean;
  night: boolean;
  winter?: boolean;
  /** 1 to 5 */
  levels: Levels;
  busy: { tunnel: boolean; sim: boolean; factory: boolean; academy: boolean };
  teamColor: number;
  carBay?: { building: boolean; progress: number };
  onOpen?: (dept: Dept) => void;
  /** optional override of the "click to open ..." destination text per building */
  targets?: Partial<Record<Dept, string>>;
}

const NAMES: Record<Dept, string> = {
  tunnel: "Wind tunnel",
  sim: "Simulator",
  factory: "Factory",
  academy: "Academy",
  car: "Car bay",
};
const DEFAULT_TARGETS: Record<Dept, string> = {
  tunnel: "Car and R&D",
  sim: "Car and R&D",
  factory: "Car and R&D",
  academy: "Academy",
  car: "Car and R&D",
};
const DEPTS: Dept[] = ["academy", "sim", "factory", "tunnel", "car"];

function reducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function FactoryScene(props: FactorySceneProps) {
  const { closed, night, winter = false, levels, busy, teamColor, carBay, onOpen, targets } = props;
  const cvRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<Dept | null>(null);
  const stRef = useRef({ closed, night, winter, levels, busy, teamColor, carBay, hover });
  stRef.current = { closed, night, winter, levels, busy, teamColor, carBay, hover };
  const frame = useRef(0);

  useEffect(() => {
    const cv = cvRef.current;
    const ctx = cv ? cv.getContext("2d") : null;
    if (!cv || !ctx) return;
    const reduce = reducedMotion();
    const paint = () => drawScene(ctx, stRef.current, reduce ? 0 : frame.current);
    paint();
    if (reduce) return;
    const raf: (cb: FrameRequestCallback) => number = window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : (cb) => window.setTimeout(() => cb(performance.now()), 100);
    const caf: (id: number) => void = window.cancelAnimationFrame ? window.cancelAnimationFrame.bind(window) : (id) => window.clearTimeout(id);
    let id = 0;
    let last = 0;
    let alive = true;
    const loop = (now: number) => {
      if (!alive) return;
      if (now - last >= 100) {
        last = now;
        frame.current++;
        paint();
      }
      id = raf(loop);
    };
    const start = () => {
      if (id === 0 && alive) id = raf(loop);
    };
    const stop = () => {
      caf(id);
      id = 0;
    };
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVis);
    if (!document.hidden) start();
    return () => {
      alive = false;
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // repaint immediately when props change (also covers reduced motion where there is no loop)
  useEffect(() => {
    const cv = cvRef.current;
    const ctx = cv ? cv.getContext("2d") : null;
    if (ctx) drawScene(ctx, stRef.current, frame.current);
  }, [closed, night, winter, levels, busy, teamColor, carBay, hover]);

  const B = layout(levels);
  const lvlOf = (d: Dept): number | null => (d === "car" ? null : Math.max(1, Math.min(5, Math.round(levels[d] || 1))));
  return (
    <div className="pixel-scene" role="group" aria-label={closed ? "Team campus, factory closed" : "Team campus"}>
      <canvas ref={cvRef} width={SW} height={SH} aria-hidden="true" />
      {closed && <span className="pixel-sr">FACTORY CLOSED</span>}
      <div className="pixel-hits">
        {DEPTS.map((d) => {
          const b = B[d];
          const l = lvlOf(d);
          const dest = targets?.[d] ?? DEFAULT_TARGETS[d];
          const text = `${NAMES[d]}${l ? ` level ${l}` : ""}: click to open ${dest}${closed ? " (factory closed)" : ""}`;
          return (
            <button
              key={d}
              type="button"
              data-dept={d}
              className={`pixel-hit${d === "academy" ? " tip-left" : d === "car" ? " tip-right" : ""}`}
              aria-label={text}
              style={{ left: `${(b.x / SW) * 100}%`, top: `${(b.y / SH) * 100}%`, width: `${(b.w / SW) * 100}%`, height: `${(b.h / SH) * 100}%` }}
              onClick={() => onOpen && onOpen(d)}
              onMouseEnter={() => setHover(d)}
              onMouseLeave={() => setHover((h) => (h === d ? null : h))}
              onFocus={() => setHover(d)}
              onBlur={() => setHover((h) => (h === d ? null : h))}
            >
              <span className="pixel-tip" aria-hidden="true">
                {text}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
