import type { ReactElement } from "react";

/** Shared pixel helpers: a tiny character grid for sprites, a palette and a 3x5 pixel font. */

export const PAL: Record<string, string> = {
  k: "#0b0814", // near black outline
  w: "#f4e9d0", // ink / cream
  h: "#ff7a1a", // hot orange
  t: "#2ec4b6", // teal
  r: "#e63946", // red
  y: "#f9c74f", // yellow
  g: "#57cc99", // green
  p: "#b66cff", // purple
  d: "#9a8fbf", // dim lavender
  b: "#4a9bf0", // blue
  n: "#2e2650", // panel dark
  s: "#6b6590", // slate
  l: "#cfe8ff", // ice
  m: "#3a3550", // tyre rubber
  o: "#9a6a3a", // wood / crate
  e: "#7a2030", // dark red (mouth)
};

export class Grid {
  w: number;
  h: number;
  c: string[][];
  constructor(w = 16, h = 16) {
    this.w = w;
    this.h = h;
    this.c = Array.from({ length: h }, () => Array<string>(w).fill("."));
  }
  p(x: number, y: number, ch: string): this {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.c[y][x] = ch;
    return this;
  }
  r(x: number, y: number, w: number, h: number, ch: string): this {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.p(x + i, y + j, ch);
    return this;
  }
  /** Bresenham line, optional thickness (extra pixels to the right). */
  l(x0: number, y0: number, x1: number, y1: number, ch: string, thick = 1): this {
    let dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    let dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      for (let t = 0; t < thick; t++) this.p(x0 + t, y0, ch);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
    return this;
  }
  /** Filled ellipse centred on pixel (cx, cy), floats allowed. */
  disc(cx: number, cy: number, rx: number, ch: string, ry = rx): this {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const dx = (x - cx) / (rx + 0.35);
        const dy = (y - cy) / (ry + 0.35);
        if (dx * dx + dy * dy <= 1) this.c[y][x] = ch;
      }
    return this;
  }
  ring(cx: number, cy: number, r: number, ch: string, thick = 1.2): this {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= r + 0.35 && d > r + 0.35 - thick) this.c[y][x] = ch;
      }
    return this;
  }
  /** Draw text in the 3x5 font. */
  text(x: number, y: number, s: string, ch: string): this {
    let cx = x;
    for (const c of s.toUpperCase()) {
      const g = FONT[c];
      if (g) {
        for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j][i] === "#") this.p(cx + i, y + j, ch);
      }
      cx += 4;
    }
    return this;
  }
  /** Add a one pixel dark outline around every filled pixel. */
  outline(ch = "k"): this {
    const src = this.c.map((r) => r.slice());
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (src[y][x] !== ".") continue;
        const n = [src[y - 1]?.[x], src[y + 1]?.[x], src[y]?.[x - 1], src[y]?.[x + 1]];
        if (n.some((v) => v !== undefined && v !== ".")) this.c[y][x] = ch;
      }
    return this;
  }
  rows(): string[] {
    return this.c.map((r) => r.join(""));
  }
}

export const arrowR = (g: Grid, x: number, y: number, len: number, ch: string) =>
  g.r(x, y, len, 1, ch).p(x + len, y, ch).p(x + len - 1, y - 1, ch).p(x + len - 1, y + 1, ch);
export const arrowL = (g: Grid, x: number, y: number, len: number, ch: string) =>
  g.r(x - len + 1, y, len, 1, ch).p(x - len, y, ch).p(x - len + 1, y - 1, ch).p(x - len + 1, y + 1, ch);
export const arrowU = (g: Grid, x: number, y: number, len: number, ch: string) =>
  g.r(x, y - len + 1, 1, len, ch).p(x, y - len, ch).p(x - 1, y - len + 1, ch).p(x + 1, y - len + 1, ch);
export const arrowD = (g: Grid, x: number, y: number, len: number, ch: string) =>
  g.r(x, y, 1, len, ch).p(x, y + len, ch).p(x - 1, y + len - 1, ch).p(x + 1, y + len - 1, ch);

/** 3x5 pixel font: digits, capitals and a few symbols. */
export const FONT: Record<string, string[]> = {
  "0": ["###", "#.#", "#.#", "#.#", "###"],
  "1": [".#.", "##.", ".#.", ".#.", "###"],
  "2": ["###", "..#", "###", "#..", "###"],
  "3": ["###", "..#", ".##", "..#", "###"],
  "4": ["#.#", "#.#", "###", "..#", "..#"],
  "5": ["###", "#..", "###", "..#", "###"],
  "6": ["###", "#..", "###", "#.#", "###"],
  "7": ["###", "..#", ".#.", ".#.", ".#."],
  "8": ["###", "#.#", "###", "#.#", "###"],
  "9": ["###", "#.#", "###", "..#", "###"],
  A: ["###", "#.#", "###", "#.#", "#.#"],
  B: ["##.", "#.#", "##.", "#.#", "##."],
  C: ["###", "#..", "#..", "#..", "###"],
  D: ["##.", "#.#", "#.#", "#.#", "##."],
  E: ["###", "#..", "##.", "#..", "###"],
  F: ["###", "#..", "##.", "#..", "#.."],
  G: ["###", "#..", "#.#", "#.#", "###"],
  H: ["#.#", "#.#", "###", "#.#", "#.#"],
  I: ["###", ".#.", ".#.", ".#.", "###"],
  J: ["..#", "..#", "..#", "#.#", "###"],
  K: ["#.#", "#.#", "##.", "#.#", "#.#"],
  L: ["#..", "#..", "#..", "#..", "###"],
  M: ["#.#", "###", "###", "#.#", "#.#"],
  N: ["##.", "#.#", "#.#", "#.#", "#.#"],
  O: ["###", "#.#", "#.#", "#.#", "###"],
  P: ["###", "#.#", "###", "#..", "#.."],
  Q: ["###", "#.#", "#.#", "###", "..#"],
  R: ["##.", "#.#", "##.", "#.#", "#.#"],
  S: ["###", "#..", "###", "..#", "###"],
  T: ["###", ".#.", ".#.", ".#.", ".#."],
  U: ["#.#", "#.#", "#.#", "#.#", "###"],
  V: ["#.#", "#.#", "#.#", "#.#", ".#."],
  W: ["#.#", "#.#", "###", "###", "#.#"],
  X: ["#.#", "#.#", ".#.", "#.#", "#.#"],
  Y: ["#.#", "#.#", ".#.", ".#.", ".#."],
  Z: ["###", "..#", ".#.", "#..", "###"],
  "?": ["###", "..#", ".##", "...", ".#."],
  "$": [".##", "##.", ".#.", ".##", "##."],
  "+": ["...", ".#.", "###", ".#.", "..."],
  "!": [".#.", ".#.", ".#.", "...", ".#."],
  "-": ["...", "...", "###", "...", "..."],
  "*": ["...", "#.#", ".#.", "#.#", "..."],
  ".": ["...", "...", "...", "...", ".#."],
  ":": ["...", ".#.", "...", ".#.", "..."],
  "/": ["..#", "..#", ".#.", "#..", "#.."],
  " ": ["...", "...", "...", "...", "..."],
};

/** Render a character grid as SVG rects, merging horizontal runs. */
export function gridRects(rows: string[], pal: Record<string, string> = PAL, keyPrefix = ""): ReactElement[] {
  const out: ReactElement[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === "." || ch === " " || !pal[ch]) {
        x++;
        continue;
      }
      let e = x + 1;
      while (e < row.length && row[e] === ch) e++;
      out.push(<rect key={`${keyPrefix}${x}-${y}`} x={x} y={y} width={e - x} height={1} fill={pal[ch]} />);
      x = e;
    }
  });
  return out;
}

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
/** Small deterministic generator. */
export function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shade(hex: string, f: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(f >= 1 ? v + (255 - v) * (f - 1) : v * f)));
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}
