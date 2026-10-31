/**
 * Shared pixel-art GP car drawing (side view, nose to the right).
 * Car space is 64 x 27 pixels, origin at the top-left of the car. A 5 pixel strip above (negative y) holds gauges.
 */
export type Area = "aero" | "chassis" | "power" | "cooling" | "tyres";
export const AREAS: Area[] = ["aero", "chassis", "power", "cooling", "tyres"];
export const AREA_LABEL: Record<Area, string> = {
  aero: "Aero",
  chassis: "Chassis",
  power: "Power unit",
  cooling: "Cooling",
  tyres: "Tyres and suspension",
};

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export const CAR_W = 64;
export const CAR_H = 27;
export const CAR_TOP_MARGIN = 5;

/** Clickable / glowing regions per R&D area in car space. The first rect of each area is the primary one. */
export const AREA_RECTS: Record<Area, Rect[]> = {
  aero: [
    { x: 0, y: 1, w: 10, h: 14 },
    { x: 53, y: 19, w: 11, h: 6 },
  ],
  chassis: [
    { x: 41, y: 8, w: 13, h: 12 },
    { x: 30, y: 2, w: 12, h: 9 },
    { x: 10, y: 20, w: 32, h: 3 },
  ],
  power: [{ x: 10, y: 3, w: 20, h: 13 }],
  cooling: [{ x: 30, y: 11, w: 11, h: 9 }],
  tyres: [
    { x: 8, y: 11, w: 15, h: 15 },
    { x: 44, y: 13, w: 13, h: 13 },
  ],
};

export function hexStr(n: number): string {
  return "#" + (n & 0xffffff).toString(16).padStart(6, "0");
}
function parse(c: string): [number, number, number] {
  const n = parseInt(c.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
export function shade(c: string, f: number): string {
  const [r, g, b] = parse(c);
  return "#" + [r * f, g * f, b * f].map((v) => cl(v).toString(16).padStart(2, "0")).join("");
}
export function mix(a: string, b: string, t: number): string {
  const p = parse(a);
  const q = parse(b);
  return "#" + [0, 1, 2].map((i) => cl(p[i] + (q[i] - p[i]) * t).toString(16).padStart(2, "0")).join("");
}
export function lum(c: string): number {
  const [r, g, b] = parse(c);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function interp(pts: number[][], x: number): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
}
const BODY_TOP = [[6, 17], [9, 15], [12, 11], [17, 7], [22, 4], [29, 4], [31, 7], [32, 10], [40, 10], [42, 9], [48, 11], [56, 15], [62, 18], [64, 19]];
const CLOTH_TOP = [[-2, 4], [0, 1], [10, 1], [12, 8], [17, 5], [22, 2], [30, 2], [31, 2], [41, 2], [44, 8], [50, 10], [56, 14], [62, 17], [66, 20]];
export const clothTop = (x: number) => interp(CLOTH_TOP, x);

export interface CarDrawOpts {
  teamColor: number;
  accent: number;
  slots?: Partial<Record<Area, number>>;
  highlight?: Area | null;
  /** 0..1 pulse for the highlight glow */
  pulse?: number;
  /** 0..1 how much of the car is assembled (1 = finished and liveried) */
  build?: number;
  /** colour transform, used for night scenes */
  tone?: (c: string) => string;
}

export function drawCar(ctx: CanvasRenderingContext2D, ox: number, oy: number, s: number, o: CarDrawOpts): void {
  const T = (c: string) => (o.tone && c[0] === "#" ? o.tone(c) : c);
  const build = o.build ?? 1;
  const has = (t: number) => build >= t;
  const R = (x: number, y: number, w: number, h: number, c: string) => {
    const x0 = Math.round(ox + x * s);
    const y0 = Math.round(oy + y * s);
    ctx.fillStyle = T(c);
    ctx.fillRect(x0, y0, Math.round(ox + (x + w) * s) - x0, Math.round(oy + (y + h) * s) - y0);
  };
  const disc = (cx: number, cy: number, r: number, c: string) => {
    for (let dy = -r; dy <= r; dy++) {
      const hw = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy + r * 0.4)));
      if (hw > 0) R(cx - hw, cy + dy, hw * 2, 1, c);
    }
  };
  const livery = has(0.88);
  const team = hexStr(o.teamColor);
  const acc = hexStr(o.accent);
  const body = livery ? team : "#6a7084";
  const light = shade(body, 1.3);
  const dark = shade(body, 0.62);
  const carbon = "#181a24";
  const carbonL = "#2c3044";
  const stripe = livery ? acc : "#8a90a4";
  const helmet = lum(acc) < 50 ? "#f2f2f2" : acc;

  // ground shadow
  ctx.globalAlpha = 0.35;
  R(4, 26, 58, 1, "#000000");
  ctx.globalAlpha = 1;

  // floor plank and diffuser
  if (has(0.2)) {
    R(10, 20, 43, 2, "#171923");
    R(10, 22, 43, 1, "#2c3042");
    R(7, 18, 4, 4, "#171923");
  }
  // monocoque (x >= 30) and engine cover (x < 30), drawn as shaded columns that follow the profile
  const col = (x: number) => {
    const top = Math.round(interp(BODY_TOP, x));
    R(x, top, 1, 1, light);
    R(x, top + 1, 1, 20 - top - 3, body);
    R(x, 18, 1, 2, dark);
    if (livery && ((x >= 12 && x <= 29) || (x >= 42 && x <= 62))) R(x, top + 3, 1, 1, stripe);
  };
  if (has(0.08)) for (let x = 30; x < 64; x++) col(x);
  if (has(0.42)) {
    for (let x = 6; x < 30; x++) col(x);
    R(27, 5, 3, 3, "#0b0c12");
    R(27, 4, 3, 1, carbonL);
  }
  // sidepod and cooling intake
  if (has(0.3)) {
    R(24, 11, 17, 1, light);
    R(24, 12, 17, 6, shade(body, 0.92));
    R(24, 18, 17, 2, dark);
    R(25, 13, 4, 1, shade(body, 0.55));
    R(25, 15, 4, 1, shade(body, 0.55));
    if (livery) {
      R(25, 14, 12, 1, stripe);
      R(30, 16, 6, 2, mix(body, "#ffffff", 0.75));
    }
    R(38, 12, 3, 7, "#0b0c12");
    R(38, 12, 3, 1, carbonL);
    R(39, 14, 1, 1, "#3a4060");
    R(39, 16, 1, 1, "#3a4060");
  }
  // driver and halo
  if (has(0.95)) {
    R(31, 9, 10, 1, "#12131a");
    R(33, 5, 5, 4, helmet);
    R(36, 6, 2, 2, "#10131e");
    R(33, 5, 1, 1, "#ffffff");
    R(31, 3, 11, 1, carbonL);
    R(31, 4, 1, 5, carbonL);
    R(41, 4, 1, 3, carbonL);
    R(42, 6, 1, 3, carbonL);
  }
  // rear wing
  if (has(0.7)) {
    R(5, 11, 3, 7, carbon);
    R(2, 14, 7, 1, carbon);
    R(1, 2, 8, 10, shade(body, 0.85));
    R(1, 2, 8, 1, stripe);
    R(2, 5, 6, 1, "#0f1017");
    R(2, 8, 6, 1, "#0f1017");
    R(1, 11, 8, 1, dark);
  }
  // front wing
  if (has(0.78)) {
    R(57, 19, 2, 3, carbon);
    R(54, 22, 10, 2, carbon);
    R(55, 21, 9, 1, stripe);
    R(56, 20, 6, 1, carbonL);
    R(62, 19, 2, 6, body);
    R(62, 19, 2, 1, light);
  }
  // suspension and wheels
  if (has(0.58)) {
    R(20, 16, 4, 1, carbonL);
    R(20, 18, 4, 1, carbonL);
    R(46, 16, 4, 1, carbonL);
    R(46, 18, 4, 1, carbonL);
    const wheel = (cx: number, cy: number, r: number) => {
      disc(cx, cy, r, "#101116");
      disc(cx, cy, r - 1, "#c1272d");
      disc(cx, cy, r - 2, "#101116");
      disc(cx, cy, r - 3, "#8c92a8");
      disc(cx, cy, Math.max(1, r - 5), "#2a2d3c");
      R(cx - 1, cy - r + 1, 2, 1, "#2a2d3c");
    };
    wheel(15, 18, 7);
    wheel(50, 19, 6);
  }

  // gauges (top margin)
  if (o.slots) {
    const GX: Record<Area, number> = { aero: 1, power: 13, cooling: 30, chassis: 42, tyres: 54 };
    for (const a of AREAS) {
      const v = o.slots[a];
      if (v == null) continue;
      const gx = GX[a];
      R(gx, -5, 9, 4, "#0b0a12");
      R(gx, -5, 9, 1, "#4a3f7a");
      const w = Math.round(Math.max(0, Math.min(1, v)) * 7);
      R(gx + 1, -4, w, 2, v < 0.34 ? "#e63946" : v < 0.67 ? "#f9c74f" : "#57cc99");
    }
  }
  // highlight glow
  if (o.highlight) {
    const p = o.pulse ?? 1;
    for (const r of AREA_RECTS[o.highlight]) {
      ctx.globalAlpha = 0.06 + 0.12 * p;
      R(r.x, r.y, r.w, r.h, "#ffe27a");
      ctx.globalAlpha = 0.6 + 0.4 * p;
      const x1 = r.x + r.w - 2;
      const y1 = r.y + r.h - 1;
      for (const [cx, cy, dx, dy] of [[r.x, r.y, 0, 0], [x1, r.y, 1, 0], [r.x, y1, 0, 1], [x1, y1, 1, 1]]) {
        R(cx, cy, 2, 1, "#fff2b0");
        R(dx ? cx + 1 : cx, dy ? cy - 1 : cy + 1, 1, 1, "#fff2b0");
      }
      ctx.globalAlpha = 1;
    }
  }
}

/** Dust sheet over the car. p 0 = fully covered, 1 = gone. Pulled toward the left in pixel steps. */
export function drawCloth(ctx: CanvasRenderingContext2D, ox: number, oy: number, s: number, p: number, o: { teamColor: number; accent: number; steps?: number }): void {
  const steps = o.steps ?? 10;
  const d = (Math.floor(p * steps) / steps) * 84;
  const lift = Math.floor(p * steps) * 0.4;
  const base = shade(hexStr(o.teamColor), 0.42);
  const hi = shade(hexStr(o.teamColor), 0.58);
  const lo = shade(hexStr(o.teamColor), 0.3);
  const acc = hexStr(o.accent);
  const R = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    const x0 = Math.round(ox + x * s);
    const y0 = Math.round(oy + y * s);
    ctx.fillRect(x0, y0, Math.round(ox + (x + w) * s) - x0, Math.round(oy + (y + h) * s) - y0);
  };
  for (let x = -3 - d; x <= 67 - d; x++) {
    const top = Math.round(interp(CLOTH_TOP, x + d) - lift);
    const wave = Math.round(Math.sin((x + d) * 0.9) * 1.2);
    const bottom = 25 + wave;
    const fold = (((x + d) % 7) + 7) % 7;
    const c = fold < 2 ? hi : fold === 4 || fold === 5 ? lo : base;
    R(x, top, 1, bottom - top, c);
    R(x, top, 1, 1, hi);
    R(x, bottom - 1, 1, 1, acc);
  }
  if (p < 0.05) {
    // question mark on the sheet
    const q = [[1, 0], [2, 0], [3, 0], [3, 1], [3, 2], [2, 3], [2, 4], [2, 6]];
    for (const [qx, qy] of q) R(30 + qx * 2 - d, 10 + qy * 2, 2, 2, "#d8cfee");
  }
}
