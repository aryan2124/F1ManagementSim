import { useEffect, useRef } from "react";

export type SwirlTheme = "home" | "hq" | "car" | "people" | "money" | "rules" | "academy" | "world" | "calendar" | "inbox" | "garage" | "race" | "crisis" | "quali" | "rain" | "night";

/** Four-tone palettes, darkest first. They stay dim so text on top stays readable. */
const PAL: Record<SwirlTheme, [string, string, string, string]> = {
  home: ["#0d1420", "#14203a", "#1d3158", "#2a4a7a"],
  hq: ["#0d1420", "#131e38", "#1b2d52", "#2a4577"],
  car: ["#0c1530", "#122248", "#1a3468", "#244a8a"],
  people: ["#170f1c", "#261630", "#3a1f44", "#552a58"],
  money: ["#0e1a16", "#14281f", "#1d3c2c", "#2b5a3c"],
  rules: ["#101626", "#182540", "#243a62", "#34528a"],
  academy: ["#0f1a22", "#162a36", "#203f50", "#2c5a70"],
  world: ["#101a20", "#18282f", "#233d46", "#32565f"],
  calendar: ["#10161f", "#18232f", "#243646", "#34506a"],
  inbox: ["#0f1520", "#17203a", "#222f55", "#324476"],
  garage: ["#1a120e", "#2a1b14", "#40281a", "#5c3a22"],
  race: ["#0a1018", "#10192a", "#182540", "#223458"],
  quali: ["#14120a", "#241f0e", "#3b3216", "#5a4a1c"],
  rain: ["#0a1420", "#0f2236", "#173552", "#234f78"],
  night: ["#0e0b1e", "#181233", "#241a4a", "#34246a"],
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
/** How far the lighter tones are pulled toward the darkest: the table stays a quiet backdrop, never the loudest thing on screen. */
const CALM = 0.55;
const calm = (p: [string, string, string, string]): [number, number, number][] => {
  const c = p.map(hexRgb);
  return c.map((x, i) => (i === 0 ? x : x.map((v, k) => c[0]![k]! + (v - c[0]![k]!) * (1 - CALM)) as [number, number, number]));
};

/** The table: slow flowing race-line contours, drawn at a very low resolution and scaled up, so it stays pixel-crisp and costs almost nothing. The palette follows the screen. */
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
    let from = calm(PAL[current]);
    let to = from;
    let mix = 1;
    const un = (t: SwirlTheme) => {
      from = from.map((c, i) => c.map((v, k) => v + (to[i]![k]! - v) * mix) as [number, number, number]);
      to = calm(PAL[t]);
      mix = 0;
    };
    listeners.add(un);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = 0;
    // Firefox upscales and repaints a full-screen canvas on the CPU, so it gets a calmer frame rate
    const gap = typeof navigator !== "undefined" && /firefox/i.test(navigator.userAgent) ? 1200 : 70;
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
          // racing-line contours: a warped diagonal flow field read as banded isolines, with a bright thread on each band edge
          const warp = Math.sin(v * 1.5 + t * 0.28) * 0.7 + Math.sin(u * 0.8 - t * 0.2) * 0.5;
          const s = (u * 0.55 + v * 0.3 + warp * 0.8) * 0.8 - t * 0.04;
          const band = s - Math.floor(s);
          const tri = Math.abs(band * 2 - 1);
          const q = tri < 0.45 ? 0 : tri < 0.8 ? 1 : 2;
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
