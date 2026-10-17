import { useCallback, useEffect, useRef, useState } from "react";
import "./pixel.css";
import { RH, RW, T_END, drawReveal } from "./revealDraw";

export interface CarRevealProps {
  teamColor: number;
  accent: number;
  teamName: string;
  year: number;
  onDone: () => void;
}

const HOLD_MS = 3500;

function reducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function CarReveal({ teamColor, accent, teamName, year, onDone }: CarRevealProps) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const info = useRef({ teamColor, accent, teamName, year });
  info.current = { teamColor, accent, teamName, year };
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const calledRef = useRef(false);
  const startRef = useRef(0);
  const [ended, setEnded] = useState(false);
  const endedRef = useRef(false);
  const endedAt = useRef(0);

  const finish = useCallback(() => {
    if (calledRef.current) return;
    calledRef.current = true;
    doneRef.current();
  }, []);

  const jumpToEnd = useCallback(() => {
    // pretend the animation started long enough ago to be at its final frame
    startRef.current = Date.now() - (T_END + 0.4) * 1000;
    if (!endedRef.current) {
      endedRef.current = true;
      endedAt.current = Date.now();
      setEnded(true);
    }
  }, []);

  // animation loop
  useEffect(() => {
    const reduce = reducedMotion();
    startRef.current = Date.now();
    if (reduce) jumpToEnd();
    const cv = cvRef.current;
    const ctx = cv ? cv.getContext("2d") : null;
    let alive = true;
    const frame = () => {
      if (!alive) return;
      const now = Date.now();
      const t = (now - startRef.current) / 1000;
      if (!endedRef.current && t >= T_END) {
        endedRef.current = true;
        endedAt.current = now;
        setEnded(true);
      }
      if (ctx) drawReveal(ctx, t, info.current);
    };
    // a 25 fps timer gives the chunky stepped look and keeps the timeline independent of display refresh
    const id = window.setInterval(frame, 40);
    frame();
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [jumpToEnd]);

  // auto continue after a short hold on the finished card
  useEffect(() => {
    if (!ended) return;
    const id = window.setTimeout(finish, HOLD_MS);
    return () => window.clearTimeout(id);
  }, [ended, finish]);

  // keyboard skip: Space / Escape / Enter
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " && e.key !== "Escape" && e.key !== "Enter" && e.code !== "Space") return;
      e.preventDefault();
      if (!endedRef.current) jumpToEnd();
      else if (Date.now() - endedAt.current > 500) finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jumpToEnd, finish]);

  return (
    <div
      className="pixel-reveal"
      role="dialog"
      aria-label={`The ${year} car launch`}
      onClick={() => {
        if (!endedRef.current) jumpToEnd();
      }}
    >
      <canvas ref={cvRef} width={RW} height={RH} aria-hidden="true" />
      {ended && (
        <>
          <span className="pixel-sr" role="status">
            THE {year} CAR: {teamName}
          </span>
          <button
            type="button"
            className="pixel-continue"
            autoFocus
            onClick={(e) => {
              e.stopPropagation();
              finish();
            }}
          >
            CONTINUE
          </button>
        </>
      )}
    </div>
  );
}
