import { useEffect, useRef } from "react";

export type SwirlTheme = "home" | "hq" | "car" | "people" | "money" | "rules" | "academy" | "world" | "calendar" | "inbox" | "garage" | "race" | "crisis";

/** Four-tone palettes, darkest first. They stay dim so text on top stays readable. */
const PAL: Record<SwirlTheme, [string, string, string, string]> = {
  home: ["#120e22", "#1c1535", "#2b1f4e", "#46286a"],
  hq: ["#120e22", "#1a1736", "#27234f", "#3a3470"],
  car: ["#0c1530", "#122248", "#1a3468", "#244a8a"],
  people: ["#1a0f22", "#2a1634", "#3f1f4a", "#5a2a5a"],
  money: ["#0e1a16", "#14281f", "#1d3c2c", "#2b5a3c"],
  rules: ["#1a1030", "#27184a", "#3a2468", "#52328a"],
  academy: ["#0f1a22", "#162a36", "#203f50", "#2c5a70"],
  world: ["#101a20", "#18282f", "#233d46", "#32565f"],
  calendar: ["#1a1426", "#261c38", "#38284f", "#4c3668"],
  inbox: ["#161426", "#211d3a", "#30294f", "#443a6c"],
  garage: ["#1a120e", "#2a1b14", "#40281a", "#5c3a22"],
  race: ["#100c1e", "#17122c", "#201a40", "#2e2458"],
  crisis: ["#220e12", "#341418", "#4e1c20", "#6e282c"],
};

let current: SwirlTheme = "home";
const listeners = new Set<(t: SwirlTheme) => void>();
export function setSwirl(t: SwirlTheme) {
  if (t === current) return;
  current = t;
  listeners.forEach((l) => l(t));
}

const hexRgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Balatro's table: a slow marbled paint swirl, drawn at a very low resolution and scaled up, so it stays pixel-crisp and costs almost nothing. */
export function Swirl() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const W = 160;
    const H = 90;
    cv.width = W;
    cv.height = H;
    const img = ctx.createImageData(W, H);
    let from = PAL[current].map(hexRgb);
    let to = from;
    let mix = 1;
    const un = (t: SwirlTheme) => {
      from = from.map((c, i) => c.map((v, k) => v + (to[i]![k]! - v) * mix) as [number, number, number]);
      to = PAL[t].map(hexRgb);
      mix = 0;
    };
    listeners.add(un);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = 0;
    // Firefox upscales and repaints a full-screen canvas on the CPU, so it gets a calmer frame rate
    const gap = typeof navigator !== "undefined" && /firefox/i.test(navigator.userAgent) ? 260 : 70;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (document.hidden || now - last < gap) return;
      last = now;
      const t = reduce ? 0 : now / 1000;
      mix = Math.min(1, mix + 0.06);
      const cols = from.map((c, i) => c.map((v, k) => v + (to[i]![k]! - v) * mix));
      const d = img.data;
      let o = 0;
      for (let y = 0; y < H; y++) {
        const v = (y / H) * 3.2;
        for (let x = 0; x < W; x++) {
          const u = (x / W) * 5.4;
          const a = Math.sin(u * 1.1 + Math.sin(v * 1.7 + t * 0.35) * 1.6 + t * 0.22);
          const b = Math.sin(v * 1.3 + Math.sin(u * 0.9 - t * 0.3) * 1.7 - t * 0.17);
          const c = Math.sin((u + v) * 0.8 + a * 1.2 + b * 1.2);
          const n = (a + b + c) / 6 + 0.5;
          const q = n < 0.36 ? 0 : n < 0.5 ? 1 : n < 0.64 ? 2 : 3;
          const col = cols[q]!;
          d[o++] = col[0]!;
          d[o++] = col[1]!;
          d[o++] = col[2]!;
          d[o++] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      listeners.delete(un);
    };
  }, []);
  return <canvas ref={ref} className="swirl" aria-hidden="true" />;
}
