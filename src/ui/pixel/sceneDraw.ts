import { drawCar, hexStr, shade } from "./carDraw";
import { drawText, textWidth } from "./pixFont";

export type Dept = "tunnel" | "sim" | "factory" | "academy" | "car";
export const SW = 480;
export const SH = 150;
export const GY = 124; // ground line where buildings stand

export interface Levels {
  tunnel: number;
  sim: number;
  factory: number;
  academy: number;
}
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface SceneState {
  closed: boolean;
  night: boolean;
  winter: boolean;
  levels: Levels;
  busy: Record<"tunnel" | "sim" | "factory" | "academy", boolean>;
  teamColor: number;
  carBay?: { building: boolean; progress: number };
  hover?: Dept | null;
}

const lv = (n: number) => Math.max(1, Math.min(5, Math.round(n || 1)));

export function layout(levels: Levels): Record<Dept, Box> {
  const f = lv(levels.factory);
  const t = lv(levels.tunnel);
  const s = lv(levels.sim);
  const a = lv(levels.academy);
  const fw = 84 + 9 * f;
  const fh = 30 + 5 * f;
  const tw = 62 + 6 * t;
  const loopH = 18 + 4 * t;
  const sw = 30 + 4 * s;
  const sh = 24 + 3 * s;
  const aw = 34 + 4 * a;
  const floors = 1 + (a >= 2 ? 1 : 0) + (a >= 4 ? 1 : 0);
  const ah = floors * 11 + 9;
  return {
    factory: { x: 150 + Math.round((130 - fw) / 2), y: GY - fh, w: fw, h: fh },
    tunnel: { x: 284 + Math.round((94 - tw) / 2), y: GY - 22 - loopH - 2, w: tw, h: 22 + loopH + 2 },
    sim: { x: 92 + Math.round((54 - sw) / 2), y: GY - sh, w: sw, h: sh },
    academy: { x: 32 + Math.round((58 - aw) / 2), y: GY - ah, w: aw, h: ah },
    car: { x: 382, y: GY - 50, w: 66, h: 50 },
  };
}

const rnd = (i: number) => {
  const x = Math.sin(i * 91.7 + 13.3) * 43758.5453;
  return x - Math.floor(x);
};

const toneCache = new Map<string, string>();
function nightTone(c: string): string {
  let v = toneCache.get(c);
  if (!v) {
    const n = parseInt(c.slice(1, 7), 16);
    const r = Math.round(((n >> 16) & 255) * 0.34);
    const g = Math.round(((n >> 8) & 255) * 0.38);
    const b = Math.round((n & 255) * 0.6 + 14);
    v = "#" + [r, g, Math.min(255, b)].map((x) => x.toString(16).padStart(2, "0")).join("");
    toneCache.set(c, v);
  }
  return v;
}

interface Walker {
  a: number;
  b: number;
  speed: number;
  phase: number;
  row: number;
  kind: "eng" | "mech" | "team" | "kid";
}
const WALKERS: Walker[] = [
  { a: 112, b: 214, speed: 0.07, phase: 0.0, row: 1, kind: "eng" },
  { a: 214, b: 336, speed: 0.06, phase: 0.4, row: 3, kind: "mech" },
  { a: 330, b: 410, speed: 0.08, phase: 0.8, row: 2, kind: "team" },
  { a: 60, b: 118, speed: 0.07, phase: 1.2, row: 4, kind: "eng" },
  { a: 232, b: 398, speed: 0.045, phase: 0.2, row: 5, kind: "team" },
  { a: 40, b: 84, speed: 0.16, phase: 0.6, row: 2, kind: "kid" },
  { a: 160, b: 270, speed: 0.055, phase: 1.5, row: 0, kind: "mech" },
  { a: 22, b: 70, speed: 0.06, phase: 0.9, row: 3, kind: "team" },
  { a: 120, b: 300, speed: 0.05, phase: 1.7, row: 4, kind: "eng" },
];

export function drawScene(ctx: CanvasRenderingContext2D, st: SceneState, f: number): void {
  ctx.imageSmoothingEnabled = false;
  const { closed, night, winter } = st;
  const team = hexStr(st.teamColor);
  const B = layout(st.levels);
  const L = { tunnel: lv(st.levels.tunnel), sim: lv(st.levels.sim), factory: lv(st.levels.factory), academy: lv(st.levels.academy) };
  const active = (d: keyof typeof st.busy) => !closed && st.busy[d];

  const P = (c: string) => (night && c[0] === "#" ? nightTone(c) : c);
  const R = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = P(c);
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  const RL = (x: number, y: number, w: number, h: number, c: string) => {
    // raw colour, never night-toned (lights)
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  const glow = (x: number, y: number, w: number, h: number, c: string, a: number) => {
    if (!night) return;
    ctx.globalAlpha = a;
    RL(x - 1, y - 1, w + 2, h + 2, c);
    ctx.globalAlpha = 1;
  };
  const snow = (x: number, y: number, w: number) => {
    if (winter) RL(x, y, w, 2, night ? "#9fb0cf" : "#f2f6fb");
  };
  const win = (x: number, y: number, w: number, h: number, lit: boolean, seed = 0) => {
    if (lit) {
      const warm = (f + seed) % 23 < 20 ? "#ffd866" : "#e8b84a";
      RL(x, y, w, h, warm);
      glow(x, y, w, h, "#ffd866", 0.22);
    } else if (closed) {
      R(x, y, w, h, "#4a566c");
    } else if (night) {
      R(x, y, w, h, "#2a3355");
    } else {
      R(x, y, w, h, "#86bfe6");
      RL(x, y, 1, 1, "#d6eefa");
    }
  };
  const nightLit = (i: number) => night && !closed && (i * 7 + 3) % 5 === 0;

  // ---------- sky ----------
  const bands = night
    ? winter
      ? ["#0e1530", "#141c3c", "#1a2447", "#222c52", "#2b3660"]
      : ["#070a1f", "#0b1030", "#101640", "#171e4c", "#202858"]
    : winter
      ? ["#8ea3c2", "#a1b4cf", "#b5c5da", "#c9d5e4", "#dde6f0"]
      : ["#4a93dc", "#5fa6e6", "#78b9ee", "#9acbf2", "#bddff6"];
  const bh = Math.ceil(GY / 5);
  bands.forEach((c, i) => RL(0, i * bh, SW, bh + 1, c));
  if (night) {
    for (let i = 0; i < 46; i++) {
      const x = Math.floor(rnd(i) * SW);
      const y = Math.floor(rnd(i + 50) * 70);
      RL(x, y, 1, 1, (f + i) % 17 === 0 ? "#6c78b8" : "#d8dcff");
    }
    for (let dy = -8; dy <= 8; dy++) {
      for (let dx = -8; dx <= 8; dx++) {
        if (dx * dx + dy * dy <= 64 && (dx - 4) * (dx - 4) + (dy + 2) * (dy + 2) > 52) RL(436 + dx, 18 + dy, 1, 1, "#f1efd8");
      }
    }
  } else {
    // sun
    RL(424, 10, 14, 14, "#ffe27a");
    RL(422, 12, 18, 10, "#ffe27a");
    RL(426, 8, 10, 18, "#ffe27a");
    RL(427, 13, 6, 6, "#fff4b8");
    if (!winter) for (let i = 0; i < 8; i++) RL(431 + Math.round(Math.cos(i * 0.785) * 15), 17 + Math.round(Math.sin(i * 0.785) * 15), 2, 2, "#ffe27a");
  }
  // clouds
  const cloud = (cx: number, cy: number, w: number) => {
    const c = night ? "#2a3358" : winter ? "#f3f6fa" : "#ffffff";
    const sd = night ? "#1d2444" : winter ? "#d5dde8" : "#d8e8f6";
    RL(cx + 3, cy, w - 6, 4, c);
    RL(cx, cy + 3, w, 5, c);
    RL(cx + 5, cy - 3, 10, 4, c);
    RL(cx + 2, cy + 7, w - 4, 2, sd);
  };
  [0, 1, 2, 3].forEach((i) => {
    const w = 26 + i * 6;
    const x = ((i * 150 + f * (0.12 + i * 0.03)) % (SW + 80)) - 40;
    cloud(Math.round(x), 18 + i * 14 + (i % 2) * 8, w);
  });

  // a plane crossing the sky (blinking lights at night) and birds by day
  {
    const px = Math.round(((f * 0.7 + 200) % 760) - 120);
    if (night) {
      RL(px, 24, 6, 1, "#8a90b0");
      RL(px + 2, 23, 1, 3, "#8a90b0");
      if (f % 6 < 3) RL(px + 6, 24, 1, 1, "#ff4040");
      if (f % 6 >= 3) RL(px - 1, 24, 1, 1, "#ffffff");
    } else {
      RL(px, 30, 8, 1, "#f4f6fa");
      RL(px + 3, 29, 1, 3, "#f4f6fa");
      RL(px - 1, 29, 1, 1, "#d8dee8");
      if (!winter) {
        for (let i = 0; i < 3; i++) {
          const bx = Math.round(((f * 0.5 + i * 90) % 540) - 30);
          const by = 40 + i * 9 + Math.round(Math.sin((f + i * 4) * 0.2) * 2);
          const up = (f + i * 3) % 6 < 3;
          RL(bx, by + (up ? 0 : 1), 2, 1, "#2a3550");
          RL(bx + 2, by + (up ? 1 : 0), 2, 1, "#2a3550");
        }
      }
    }
  }

  // ---------- hills ----------
  for (let x = 0; x < SW; x++) {
    const h1 = 30 + 8 * Math.sin(x * 0.021 + 1) + 5 * Math.sin(x * 0.067 + 4);
    const h2 = 20 + 6 * Math.sin(x * 0.034 + 2) + 4 * Math.sin(x * 0.09);
    R(x, GY - h1, 1, h1, winter ? "#b6c6dc" : "#5f9a78");
    R(x, GY - h2, 1, h2, winter ? "#a2b4cd" : "#4b8564");
    if (winter) RL(x, Math.round(GY - h1), 1, 2, night ? "#9fb0cf" : "#ffffff");
  }

  // ---------- background trees ----------
  const tree = (x: number, base: number, h: number, round: boolean) => {
    R(x - 1, base - 6, 3, 6, "#6a4a2c");
    if (round) {
      const c = winter ? "#e8eff7" : "#3f8f4a";
      R(x - 6, base - h + 6, 13, h - 10, winter ? "#c7d4e4" : "#2f7a3e");
      R(x - 5, base - h + 2, 11, 8, c);
      R(x - 3, base - h, 7, 4, c);
      if (!winter) R(x - 4, base - h + 4, 3, 2, "#5fb05f");
    } else {
      for (let i = 0; i < 4; i++) {
        const w = 5 + i * 4;
        R(x - w / 2, base - h + i * (h / 4.4), w, h / 4.4 + 2, i % 2 ? (winter ? "#d6e1ee" : "#2a6b3a") : winter ? "#f2f6fb" : "#378a48");
      }
    }
  };
  tree(22, GY, 24, false);
  tree(147, GY, 22, true);
  tree(281, GY, 24, false);
  tree(379, GY, 20, true);

  // ---------- ground ----------
  R(0, GY, SW, 8, winter ? "#dfe8f2" : "#8d93a3");
  for (let x = 0; x < SW; x += 24) R(x, GY + 1, 1, 7, winter ? "#c3cfde" : "#7a8092");
  R(0, GY + 7, SW, 1, winter ? "#c3cfde" : "#6e7486");
  // road
  R(0, 132, SW, 2, winter ? "#e9f0f8" : "#b7bcc9");
  R(0, 134, SW, 11, "#3d4252");
  R(0, 134, SW, 1, "#2c303d");
  for (let x = 0; x < SW; x += 24) R(x, 139, 12, 1, winter ? "#dfe5ee" : "#e9d86a");
  R(0, 145, SW, SH - 145, winter ? "#e8eef7" : "#4f9a48");
  for (let x = 0; x < SW; x += 7) if (!winter) R(x, 146 + (x % 3), 2, 1, "#6cb85e");
  if (winter) for (let x = 0; x < SW; x += 9) R(x, 147 + (x % 4), 3, 1, "#c9d6e6");

  // ---------- gate ----------
  {
    R(3, GY - 18, 12, 18, "#d6d9e2");
    R(3, GY - 18, 12, 2, "#eef0f6");
    R(2, GY - 21, 14, 3, team);
    snow(2, GY - 22, 14);
    win(5, GY - 14, 8, 6, night && !closed ? true : false, 3);
    R(8, GY - 7, 4, 7, "#5a3b22");
    R(16, GY - 11, 2, 11, "#444a5a");
    // barrier arm
    const up = !closed && f % 90 < 55;
    for (let i = 0; i < 16; i++) {
      const x = 17 + (up ? Math.round(i * 0.5) : i);
      const y = up ? GY - 10 - Math.round(i * 0.9) : GY - 10;
      R(x, y, 1, 2, i % 4 < 2 ? "#e63946" : "#f4f4f4");
    }
    // guard
    const gx = 22;
    R(gx, GY - 8, 2, 2, "#f0c8a0");
    R(gx - 1, GY - 6, 4, 4, "#1d2540");
    R(gx - 1, GY - 2, 1, 2, "#1d2540");
    R(gx + 1, GY - 2, 1, 2, "#1d2540");
    R(gx - 1, GY - 9, 4, 1, "#1d2540");
    // lamp
    R(28, GY - 22, 1, 22, "#555b6e");
    R(26, GY - 24, 5, 2, "#555b6e");
    if (night) {
      RL(27, GY - 22, 3, 1, "#fff2a8");
      ctx.globalAlpha = 0.1;
      for (let i = 0; i < 12; i++) RL(28 - 2 - i, GY - 22 + i * 1.6, 5 + i * 2, 2, "#ffe9a0");
      ctx.globalAlpha = 1;
    }
  }

  // ---------- academy ----------
  {
    const b = B.academy;
    const floors = 1 + (L.academy >= 2 ? 1 : 0) + (L.academy >= 4 ? 1 : 0);
    const lit = active("academy");
    R(b.x, b.y + 7, b.w, b.h - 7, "#e3c27a");
    for (let y = b.y + 9; y < GY; y += 4) R(b.x, y, b.w, 1, "#d2b068");
    R(b.x, GY - 3, b.w, 3, "#a98446");
    R(b.x - 1, b.y, b.w + 2, 8, team);
    R(b.x - 1, b.y + 7, b.w + 2, 1, shade(team, 0.6));
    snow(b.x - 1, b.y - 1, b.w + 2);
    drawTextP(b.x + Math.round((b.w - textWidth("ACADEMY")) / 2), b.y + 2, "ACADEMY", "#fff7e0");
    const doorX = b.x + Math.round(b.w / 2) - 3;
    const winCols = Math.max(2, Math.floor((b.w - 10) / 12));
    for (let r = 0; r < floors; r++) {
      const wy = GY - 9 - r * 11 - 2;
      for (let i = 0; i < winCols; i++) {
        const wx = b.x + 5 + Math.round(i * ((b.w - 14) / Math.max(1, winCols - 1)));
        if (r === 0 && wx + 5 > doorX - 2 && wx < doorX + 9) continue;
        R(wx - 1, wy - 1, 7, 8, "#f4ead0");
        win(wx, wy, 5, 6, lit || nightLit(i + r * 3 + 1), i * 5 + r);
        R(wx + 2, wy, 1, 6, "#f4ead0");
        if (lit && (i + r) % 2 === 0) RL(wx + 1 + ((f >> 3) % 2), wy + 4, 2, 2, "#3a2a1a");
      }
    }
    R(doorX, GY - 9, 7, 9, "#5a3b22");
    R(doorX + 5, GY - 5, 1, 1, "#ffd866");
    if (L.academy >= 3) {
      // clock tower
      R(b.x + b.w - 14, b.y - 14, 10, 14, "#e3c27a");
      R(b.x + b.w - 15, b.y - 17, 12, 4, shade(team, 0.8));
      R(b.x + b.w - 11, b.y - 11, 4, 4, "#f7f2e2");
      R(b.x + b.w - 9, b.y - 11, 1, 2, "#222");
      R(b.x + b.w - 9, b.y - 10, 2, 1, "#222");
      snow(b.x + b.w - 15, b.y - 18, 12);
    }
    if (L.academy >= 5) {
      R(b.x + 6, b.y - 16, 1, 16, "#c7ccd8");
      R(b.x + 7, b.y - 16, 8, 5, team);
      R(b.x + 7, b.y - 14, 8, 1, "#ffffff");
    }
    // cones on the apron
    for (let i = 0; i < 3; i++) R(b.x + 8 + i * 9, GY + 6, 2, 2, "#ff7a1a");
    if (closed) RL(b.x, b.y + 8, 0, 0, "#000");
  }

  // ---------- simulator ----------
  {
    const b = B.sim;
    const lit = active("sim");
    R(b.x, b.y, b.w, b.h, "#7885a6");
    for (let y = b.y + 9; y < GY; y += 5) R(b.x, y, b.w, 1, "#6b7898");
    R(b.x, GY - 3, b.w, 3, "#4d587a");
    R(b.x, b.y, b.w, 8, "#4d587a");
    R(b.x, b.y + 7, b.w, 1, "#39425e");
    snow(b.x - 1, b.y - 1, b.w + 2);
    drawTextP(b.x + 3, b.y + 2, "SIM", "#e8f0ff");
    if (!closed) RL(b.x + b.w - 6, b.y + 3, 3, 2, (f >> 2) % 2 ? "#57cc99" : "#2a6a50");
    // big driving screen
    const sx = b.x + 3;
    const sy = b.y + 11;
    const swd = b.w - 15;
    const sht = Math.min(12, b.h - 16);
    R(sx - 1, sy - 1, swd + 2, sht + 2, "#10131f");
    if (lit) {
      for (let i = 0; i < swd; i++) {
        for (let j = 0; j < sht; j++) {
          const horizon = Math.floor(sht * 0.45);
          let c: string;
          if (j < horizon) c = j < 2 ? "#6fb4f0" : "#3a7bd8";
          else {
            const k = j - horizon;
            c = "#4b505e";
            const centre = swd / 2;
            if (Math.abs(i - centre) < 1 + k * 0.5 && (k + (f >> 1)) % 3 === 0) c = "#e9e9f2";
            if (Math.abs(Math.abs(i - centre) - (3 + k * 1.6)) < 0.9) c = (k + (f >> 1)) % 2 ? "#e63946" : "#f4f4f4";
            if (Math.abs(i - centre) > 5 + k * 2.1) c = "#2f7a3e";
          }
          RL(sx + i, sy + j, 1, 1, c);
        }
      }
      // flicker
      const fr = (f * 7) % sht;
      ctx.globalAlpha = 0.35;
      RL(sx, sy + fr, swd, 1, "#ffffff");
      ctx.globalAlpha = 1;
      glow(sx, sy, swd, sht, "#5fa8ff", 0.25);
    } else {
      R(sx, sy, swd, sht, closed ? "#12141c" : "#1b2033");
      R(sx + 2, sy + 1, 1, 3, closed ? "#1a1d28" : "#2b3350");
      R(sx + 3, sy + 2, 1, 3, closed ? "#1a1d28" : "#2b3350");
    }
    R(b.x + b.w - 10, GY - 10, 6, 10, "#23283a");
    R(b.x + b.w - 9, GY - 9, 4, 4, lit || nightLit(2) ? "#ffd866" : "#3a4260");
    // roof kit
    if (L.sim >= 2) {
      R(b.x + 5, b.y - 5, 1, 5, "#c7ccd8");
      R(b.x + 3, b.y - 8, 5, 3, "#e0e5f2");
      R(b.x + 4, b.y - 8, 3, 1, "#fff");
    }
    if (L.sim >= 3) {
      R(b.x + 14, b.y - 7, 14, 7, "#aab4d0");
      R(b.x + 16, b.y - 9, 10, 2, "#aab4d0");
      R(b.x + 19, b.y - 10, 4, 1, "#aab4d0");
      R(b.x + 16, b.y - 5, 10, 2, "#6c7896");
    }
    if (L.sim >= 4) {
      R(b.x + b.w - 8, b.y - 12, 1, 12, "#c7ccd8");
      if (!closed) RL(b.x + b.w - 9, b.y - 14, 3, 2, (f >> 2) % 2 ? "#ff4040" : "#702020");
    }
    if (L.sim >= 5) {
      R(b.x + 30, b.y - 9, 1, 9, "#c7ccd8");
      const sp = (f >> 1) % 4;
      R(b.x + 27 + (sp % 2), b.y - 11, 7 - (sp % 2) * 2, 2, "#e0e5f2");
    }
  }

  // ---------- factory ----------
  {
    const b = B.factory;
    const lit = active("factory");
    const bodyY = b.y + 6;
    R(b.x, bodyY, b.w, b.h - 6, "#c7ccd8");
    for (let x = b.x + 8; x < b.x + b.w; x += 8) R(x, bodyY + 4, 1, b.h - 10, "#b6bccb");
    R(b.x, bodyY, b.w, 3, team);
    R(b.x, bodyY + 3, b.w, 1, shade(team, 0.6));
    R(b.x, GY - 3, b.w, 3, "#8e95a8");
    // saw-tooth roof
    const teeth = Math.floor(b.w / 12);
    for (let i = 0; i < teeth; i++) {
      const tx = b.x + i * 12;
      for (let dx = 0; dx < 12; dx++) {
        const top = b.y + 5 - Math.floor(dx * 0.45);
        R(tx + dx, top, 1, bodyY - top + 1, dx === 0 ? "#5d6479" : "#7a8196");
        if (winter) RL(tx + dx, top - 1, 1, 2, night ? "#9fb0cf" : "#f2f6fb");
      }
      RL(tx + 11, b.y, 1, 6, lit || nightLit(i) ? "#ffe9a0" : night ? "#2a3355" : "#a8d4ee");
      R(tx, b.y + 5, 1, 1, "#5d6479");
    }
    if (b.w % 12 > 3) R(b.x + teeth * 12, b.y + 5, b.w - teeth * 12, 2, "#7a8196");
    // office block at level 3+
    if (L.factory >= 3) {
      R(b.x + 5, b.y - 12, 26, 17, "#8fa3c8");
      R(b.x + 5, b.y - 12, 26, 2, "#5d6e92");
      snow(b.x + 4, b.y - 13, 28);
      const rows = L.factory >= 5 ? 3 : 2;
      for (let r = 0; r < rows; r++)
        for (let i = 0; i < 5; i++) win(b.x + 7 + i * 5, b.y - 9 + r * 5, 4, 3, lit || nightLit(i + r), i + r * 3);
    }
    if (L.factory >= 4) {
      for (let i = 0; i < 2; i++) {
        const sx = b.x + b.w - 30 + i * 12;
        R(sx, b.y - 9, 6, 11, "#8a8f9e");
        R(sx, b.y - 9, 6, 2, "#4d5264");
        if (lit) {
          for (let k = 0; k < 3; k++) {
            const py = b.y - 13 - ((f * 0.7 + k * 7) % 20);
            ctx.globalAlpha = Math.max(0, 0.6 - (b.y - 13 - py) * -0.03);
            RL(sx + 1 + k, py, 4 + k, 3, night ? "#6c7090" : "#e8ebf2");
          }
          ctx.globalAlpha = 1;
        }
      }
    }
    if (L.factory >= 5) {
      R(b.x + 18, b.y - 30, 1, 18, "#c7ccd8");
      R(b.x + 19, b.y - 30, 9, 5, team);
      R(b.x + 19, b.y - 28, 9, 1, "#ffffff");
      if (!closed) RL(b.x + 17, b.y - 32, 3, 2, (f >> 2) % 2 ? "#ff4040" : "#702020");
    }
    // windows
    const floors = 1 + (L.factory >= 3 ? 1 : 0) + (L.factory >= 5 ? 1 : 0);
    const cx = b.x + Math.round(b.w / 2);
    for (let r = 0; r < floors; r++) {
      const wy = bodyY + 7 + r * 10;
      if (wy + 6 > GY - 20 && r > 0) continue;
      const n = Math.floor((b.w - 12) / 10);
      for (let i = 0; i < n; i++) {
        const wx = b.x + 6 + i * 10;
        if (wy + 6 > GY - 21 && wx + 8 > cx - 14 && wx < cx + 14) continue;
        R(wx - 1, wy - 1, 9, 8, "#a3abbd");
        win(wx, wy, 7, 6, lit || nightLit(i * 2 + r), i * 3 + r);
        R(wx + 3, wy, 1, 6, "#a3abbd");
      }
    }
    // roller door
    const dw = 26;
    const dh = 18;
    const dx = cx - dw / 2;
    R(dx - 1, GY - dh - 1, dw + 2, dh + 1, "#5d6479");
    R(dx, GY - dh, dw, dh, "#4a5064");
    for (let y = GY - dh; y < GY; y += 3) R(dx, y, dw, 1, "#3b4054");
    if (lit) {
      // door half open, bright inside, sparks
      R(dx, GY - dh, dw, 9, "#ffd866");
      RL(dx, GY - dh, dw, 9, (f >> 2) % 3 ? "#ffd866" : "#ffe9a0");
      R(dx + 3, GY - dh + 4, 6, 5, "#8a5a3a");
      R(dx + 14, GY - dh + 5, 8, 4, "#7a8196");
      for (let k = 0; k < 4; k++) {
        const sx = dx + 8 + Math.round(rnd(f * 3 + k) * 8);
        const sy = GY - dh + 6 + Math.round(rnd(f * 5 + k) * 3);
        RL(sx, sy, 1, 1, "#ffffff");
      }
      R(dx, GY - dh + 9, dw, 1, "#3b4054");
      for (let y = GY - dh + 9; y < GY; y += 3) R(dx, y, dw, 1, "#3b4054");
      glow(dx, GY - dh, dw, 9, "#ffd866", 0.25);
    }
    // team sign over door
    const sgw = textWidth("HQ") + 6;
    R(cx - sgw / 2, GY - dh - 9, sgw, 7, "#14111f");
    R(cx - sgw / 2, GY - dh - 9, sgw, 1, team);
    drawTextP(cx - textWidth("HQ") / 2, GY - dh - 7, "HQ", "#f4f4f4");
  }

  // ---------- wind tunnel ----------
  {
    const b = B.tunnel;
    const lit = active("tunnel");
    const boxY = GY - 22;
    const t = L.tunnel;
    // base building
    R(b.x, boxY, b.w, 22, "#8d96ab");
    R(b.x, boxY, b.w, 2, "#b8c1d6");
    for (let x = b.x + 6; x < b.x + b.w; x += 6) R(x, boxY + 3, 1, 15, "#7c859b");
    R(b.x, GY - 4, b.w, 4, team);
    R(b.x, GY - 5, b.w, 1, shade(team, 0.6));
    // test section viewing window
    const wx = b.x + Math.round(b.w / 2) - 16;
    R(wx - 1, boxY + 4, 34, 14, "#3b4054");
    R(wx, boxY + 5, 32, 12, lit ? "#1d6e72" : closed ? "#161922" : "#222838");
    if (lit) {
      // streamlines
      for (let k = 0; k < 5; k++) {
        const yy = boxY + 6 + k * 2;
        for (let sx = 0; sx < 30; sx += 7) {
          const px = (sx + f * (2 + (k % 2))) % 30;
          RL(wx + 1 + px, yy, 4, 1, k % 2 ? "#8ffff0" : "#37c9a3");
        }
      }
      // model car
      R(wx + 9, boxY + 10, 14, 3, team);
      R(wx + 12, boxY + 8, 5, 2, "#10131f");
      R(wx + 7, boxY + 12, 3, 3, "#10131f");
      R(wx + 21, boxY + 12, 3, 3, "#10131f");
      glow(wx, boxY + 5, 32, 12, "#37e0c8", 0.28);
    } else {
      R(wx + 9, boxY + 10, 14, 3, closed ? "#222633" : shade(team, 0.5));
      R(wx + 12, boxY + 8, 5, 2, "#10131f");
    }
    R(b.x + 5, GY - 11, 7, 11, "#2c3144");
    // pipe loop
    const lx = b.x + 3;
    const lw = b.w - 6;
    const ly = b.y + 1;
    const lh = boxY - ly;
    const th = t >= 5 ? 6 : 5;
    const pipe = "#8d96ab";
    R(lx, ly, lw, th, pipe);
    R(lx, ly, lw, 1, "#c4cce0");
    R(lx, ly + th - 1, lw, 1, "#6a7288");
    R(lx, ly, th, lh, pipe);
    R(lx, ly, 1, lh, "#c4cce0");
    R(lx + lw - th, ly, th, lh, pipe);
    R(lx + lw - th, ly, 1, lh, "#a9b2c8");
    R(lx + lw - 1, ly, 1, lh, "#6a7288");
    for (let x = lx + 4; x < lx + lw - 2; x += 7) R(x, ly + 2, 1, 1, "#5b6378");
    // corner vanes
    R(lx + th, ly + th, 2, 2, "#5b6378");
    R(lx + lw - th - 2, ly + th, 2, 2, "#5b6378");
    snow(lx - 1, ly - 1, lw + 2);
    // chasing lights on top pipe
    if (lit) for (let i = 0; i < Math.floor(lw / 8); i++) if ((i + (f >> 1)) % 4 === 0) RL(lx + 5 + i * 8, ly + 1, 3, 2, "#8ffff0");
    // fans in housings on the two vertical legs
    const disc = (cx: number, cy: number, r: number, c: string, raw = false) => {
      for (let dy = -r; dy <= r; dy++) {
        const hw = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy + r * 0.4)));
        (raw ? RL : R)(cx - hw, cy + dy, hw * 2 + 1, 1, c);
      }
    };
    const fan = (cx: number, cy: number, r: number) => {
      disc(cx, cy, r + 2, "#5b6378");
      disc(cx, cy, r + 1, "#2c3144");
      disc(cx, cy, r, "#10131c");
      const ang = lit ? f * 0.95 : 0.4;
      for (let k = 0; k < 4; k++) {
        const a = ang + (k * Math.PI) / 2;
        for (let i = 1; i <= r; i++) {
          const px = Math.round(cx + Math.cos(a) * i);
          const py = Math.round(cy + Math.sin(a) * i);
          RL(px, py, 1, 1, lit ? "#c4cce0" : night ? "#3a4056" : "#8d96ab");
          if (lit && i > 1) RL(px + 1, py, 1, 1, "#8f99b2");
        }
      }
      RL(cx, cy, 1, 1, lit ? "#ffd866" : "#c4cce0");
    };
    const fanR = Math.max(4, Math.min(8, Math.floor((lh - th) / 2) - 3));
    const fcy = ly + th + Math.floor((lh - th) / 2) - 1;
    fan(lx + lw - Math.ceil(th / 2), fcy, fanR);
    if (t >= 3) fan(lx + Math.floor(th / 2), fcy, fanR);
    // team colour band across the top pipe
    R(lx + th, ly + 2, lw - th * 2, 1, team);
    if (t >= 2) {
      // cooling tower
      R(b.x + b.w - 14, boxY - 6, 9, 6, "#a3abbd");
      R(b.x + b.w - 14, boxY - 6, 9, 1, "#5b6378");
      if (lit) {
        ctx.globalAlpha = 0.55;
        RL(b.x + b.w - 12 + ((f >> 1) % 3), boxY - 11 - ((f >> 1) % 4), 5, 4, night ? "#6c7090" : "#f4f6fa");
        ctx.globalAlpha = 1;
      }
    }
    if (t >= 4) {
      R(b.x + 22, ly - 14, 1, 14, "#c7ccd8");
      R(b.x + 19, ly - 17, 7, 3, "#e0e5f2");
      if (!closed) RL(b.x + 21, ly - 16, 3, 2, (f >> 2) % 2 ? "#ff4040" : "#702020");
    }
    if (t >= 5) {
      R(b.x + b.w - 24, ly - 12, 1, 12, "#c7ccd8");
      R(b.x + b.w - 23, ly - 12, 8, 5, team);
      R(b.x + b.w - 23, ly - 10, 8, 1, "#ffffff");
    }
  }

  // ---------- car bay ----------
  {
    const b = B.car;
    const building = !!st.carBay?.building;
    const prog = Math.max(0, Math.min(1, st.carBay?.progress ?? 0));
    const lit = !closed && building;
    R(b.x, b.y, b.w, b.h, "#2a2e40");
    // interior wall
    if (building && !closed) RL(b.x + 3, b.y + 9, b.w - 6, b.h - 12, night ? "#5a668a" : "#46506c");
    else R(b.x + 3, b.y + 9, b.w - 6, b.h - 12, "#2f3448");
    if (!closed) for (let i = 0; i < 4; i++) RL(b.x + 6 + i * 15, b.y + 10, 9, 2, building ? "#fff4c8" : night ? "#5a6078" : "#c6ccdc");
    if (lit) glow(b.x + 3, b.y + 9, b.w - 6, b.h - 12, "#ffe9a0", 0.12);
    R(b.x + 3, GY - 3, b.w - 6, 3, "#555a6b");
    if (building || prog > 0) {
      // stand and car
      R(b.x + 12, GY - 10, 2, 7, "#9aa3b8");
      R(b.x + 50, GY - 10, 2, 7, "#9aa3b8");
      R(b.x + 10, GY - 4, 6, 1, "#7c859b");
      R(b.x + 48, GY - 4, 6, 1, "#7c859b");
      R(b.x + 12, GY - 10, 40, 1, "#9aa3b8");
      drawCar(ctx, b.x + 1, GY - 33, 1, { teamColor: st.teamColor, accent: st.teamColor, build: building ? Math.max(0.12, prog) : 1, tone: night ? nightTone : undefined });
      if (lit && (f >> 1) % 3 !== 0) {
        const sx = b.x + 20 + Math.round(rnd(f) * 30);
        RL(sx, GY - 14 + Math.round(rnd(f + 3) * 6), 1, 1, "#ffffff");
        RL(sx + 1, GY - 13 + Math.round(rnd(f + 8) * 6), 1, 1, "#ffb13b");
      }
      if (building) {
        R(b.x + 4, b.y + 11, b.w - 22, 4, "#0b0a12");
        RL(b.x + 5, b.y + 12, Math.round((b.w - 24) * prog), 2, prog > 0.99 ? "#57cc99" : "#f9c74f");
        drawTextP(b.x + b.w - 15, b.y + 10, `${Math.round(prog * 100)}`, "#f4e9d0");
      }
    } else {
      // empty stand
      R(b.x + 12, GY - 9, 2, 6, "#9aa3b8");
      R(b.x + 50, GY - 9, 2, 6, "#9aa3b8");
      R(b.x + 12, GY - 9, 40, 1, "#9aa3b8");
    }
    // roller door (down when closed or idle)
    if (closed || !building) {
      const open = closed ? 0 : 5 + Math.round(((f >> 3) % 2) * 0);
      R(b.x + 3, b.y + 9, b.w - 6, b.h - 12 - (closed ? 0 : 0) - 0 - open * 0, closed ? "#585e75" : "#6b7186");
      for (let y = b.y + 9; y < GY - 3; y += 3) R(b.x + 3, y, b.w - 6, 1, "#4c5167");
      R(b.x + b.w / 2 - 2, GY - 7, 4, 2, "#c7ccd8");
      if (!closed && !building) {
        // not building anything: door left a third open, empty stand showing
        R(b.x + 3, b.y + 9, b.w - 6, 1, "#4c5167");
      }
    }
    // fascia
    R(b.x - 1, b.y, b.w + 2, 9, team);
    R(b.x - 1, b.y + 8, b.w + 2, 1, shade(team, 0.55));
    snow(b.x - 1, b.y - 1, b.w + 2);
    drawTextP(b.x + 3, b.y + 2, "CAR BAY", "#f4f4f4");
    R(b.x, b.y + 9, 3, b.h - 9, "#8d93a6");
    R(b.x + b.w - 3, b.y + 9, 3, b.h - 9, "#8d93a6");
    if (!closed && building) {
      // mechanics
      const m = (mx: number, c: string, k: number) => {
        const bob = (f + k) % 6 < 3 ? 0 : 1;
        R(mx, GY - 12 + bob, 3, 2, "#f0c8a0");
        R(mx - 1, GY - 10 + bob, 5, 5, c);
        R(mx - 1, GY - 5, 2, 2, "#1d2540");
        R(mx + 2, GY - 5, 2, 2, "#1d2540");
        R(mx - 1, GY - 13 + bob, 5, 1, "#f9c74f");
      };
      m(b.x + 6, "#ff7a1a", 0);
      m(b.x + b.w - 10, "#f4f4f4", 3);
    }
  }

  // ---------- walkers ----------
  if (!closed) {
    const total = L.tunnel + L.sim + L.factory + L.academy;
    const count = Math.min(WALKERS.length, 4 + Math.floor(total / 3));
    for (let i = 0; i < count; i++) {
      const w = WALKERS[i];
      const u = (f * w.speed * 0.5 + w.phase) % 2;
      const pos = u < 1 ? u : 2 - u;
      const k = Math.max(0, Math.min(1, (pos - 0.08) / 0.84));
      const moving = pos > 0.08 && pos < 0.92;
      const x = Math.round(w.a + (w.b - w.a) * k);
      const y = GY + 3 + w.row;
      const left = u >= 1;
      const bodyC = w.kind === "eng" ? "#e8ecf6" : w.kind === "mech" ? "#ff7a1a" : w.kind === "kid" ? "#57cc99" : team;
      const hat = w.kind === "mech" ? "#f9c74f" : w.kind === "kid" ? "#e63946" : "#2a2420";
      const step = moving ? (f + i) % 4 < 2 : false;
      R(x, y - 8, 3, 2, "#f0c8a0");
      R(x, y - 9, 3, 1, hat);
      R(x - 1, y - 6, 5, 3, bodyC);
      R(x + (left ? 0 : 2), y - 6, 1, 3, shade(bodyC, 0.7));
      R(x, y - 3, 1, step ? 2 : 3, "#1d2540");
      R(x + 2, y - 3, 1, step ? 3 : 2, "#1d2540");
      if (w.kind === "eng") R(x + (left ? -2 : 4), y - 5, 2, 3, "#f4f4f4");
    }
  }

  // ---------- vehicles ----------
  const van = (x: number, base: number, c: string, dirRight: boolean) => {
    R(x, base - 9, 20, 8, c);
    R(x + (dirRight ? 14 : 0), base - 9, 6, 8, shade(c, 0.9));
    R(x + (dirRight ? 15 : 1), base - 8, 4, 3, "#86bfe6");
    R(x + 2, base - 3, 4, 4, "#101116");
    R(x + 13, base - 3, 4, 4, "#101116");
    if (night) {
      const hx = dirRight ? x + 20 : x - 1;
      RL(hx, base - 6, 1, 2, "#fff2a8");
      ctx.globalAlpha = 0.12;
      for (let i = 0; i < 14; i++) RL(dirRight ? hx + i : hx - i, base - 7 - (i >> 2), 1, 4 + (i >> 1), "#ffe9a0");
      ctx.globalAlpha = 1;
    }
  };
  const vanX = closed ? 560 : ((f * 1.8 + 60) % 640) - 40;
  if (!closed) van(Math.round(vanX), 138, "#2f9bff", true);
  // transporter truck: cab at the left, driving left
  {
    const base = 144;
    const tx = closed ? 306 : Math.round(480 - ((f * 1.3) % 620) + 20);
    const rev = !closed;
    void rev;
    R(tx + 17, base - 21, 48, 17, team);
    R(tx + 17, base - 21, 48, 2, "#f4f4f4");
    R(tx + 17, base - 6, 48, 2, "#2b2f3f");
    R(tx + 17, base - 8, 48, 1, "#f4f4f4");
    drawTextP(tx + 22, base - 15, "BOX BOX", "#f4f4f4");
    R(tx + 21, base - 4, 41, 1, "#2b2f3f");
    // cab
    R(tx, base - 14, 17, 11, "#e8ebf2");
    R(tx, base - 17, 11, 4, "#e8ebf2");
    R(tx + 1, base - 16, 7, 5, "#6fb8e6");
    R(tx + 1, base - 16, 2, 1, "#cfeaf8");
    R(tx, base - 5, 17, 2, "#2b2f3f");
    R(tx - 1, base - 6, 2, 2, "#c7ccd8");
    if (closed || !night) R(tx - 1, base - 9, 1, 2, "#fff2a8");
    for (const wx of [tx + 3, tx + 22, tx + 49, tx + 57]) {
      R(wx, base - 5, 6, 6, "#101116");
      R(wx + 2, base - 3, 2, 2, "#8c92a8");
    }
    if (!closed && night) {
      RL(tx - 2, base - 9, 2, 2, "#fff6c0");
      ctx.globalAlpha = 0.14;
      for (let i = 0; i < 26; i++) RL(tx - 2 - i, base - 11 - (i >> 3), 1, 5 + (i >> 1), "#ffe9a0");
      ctx.globalAlpha = 1;
    }
  }

  // ---------- foreground trees ----------
  tree(458, 148, 28, false);
  tree(470, 148, 24, true);
  tree(10, 149, 14, true);

  // ---------- street lamps ----------
  for (const lx of [88, 148, 282, 380]) {
    R(lx, GY - 20, 1, 20, "#555b6e");
    R(lx - 2, GY - 21, 5, 2, "#555b6e");
    if (night) {
      RL(lx - 1, GY - 19, 3, 1, "#fff2a8");
      ctx.globalAlpha = 0.09;
      for (let i = 0; i < 14; i++) RL(lx - i - 2, GY - 19 + i * 1.2, 5 + i * 2, 2, "#ffe9a0");
      ctx.globalAlpha = 1;
    }
  }

  // ---------- life: light shafts, traffic, floating work icons, a slow golden hour ----------
  if (!night) {
    ctx.globalAlpha = 0.05 + 0.025 * Math.sin(f * 0.04);
    for (let k = 0; k < 4; k++) {
      const x0 = 436 - k * 70;
      for (let y = 20; y < GY; y += 2) RL(x0 - (y - 20) * 0.7, y, 10 + k * 3, 2, "#fff6c8");
    }
    ctx.globalAlpha = 1;
  }
  if (!closed) {
    const car = (x: number, y: number, col: string, dir: number) => {
      RL(x, y + 2, 14, 3, col);
      RL(x + 3, y, 8, 3, col);
      RL(x + 4, y + 1, 6, 2, "#cfeaff");
      RL(x + 2, y + 4, 3, 2, "#14111f");
      RL(x + 9, y + 4, 3, 2, "#14111f");
      RL(dir > 0 ? x + 13 : x, y + 3, 1, 1, "#fff6a8");
    };
    const truck = (x: number, y: number, dir: number) => {
      RL(x, y, 18, 8, "#f4f1ea");
      RL(x, y + 5, 18, 1, team);
      RL(dir > 0 ? x + 18 : x - 7, y + 2, 7, 6, team);
      RL(dir > 0 ? x + 21 : x - 6, y + 3, 3, 2, "#cfeaff");
      RL(x + 2, y + 7, 3, 2, "#14111f");
      RL(dir > 0 ? x + 20 : x - 5, y + 7, 3, 2, "#14111f");
    };
    const x1 = ((f * 0.55) % (SW + 90)) - 45;
    car(x1, 134, "#e63946", 1);
    const x2 = SW + 45 - ((f * 0.38 + 140) % (SW + 90));
    truck(x2, 126, -1);
    const x3 = ((f * 0.8 + 300) % (SW + 90)) - 45;
    car(x3, 134, "#f9c74f", 1);
  }
  {
    const glyph = (x: number, y: number, rows: string[], c: string) => {
      for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j]!.length; i++) if (rows[j]![i] === "#") RL(x + i, y + j, 1, 1, c);
    };
    const GEAR = ["..#.#..", ".#####.", "##...##", "#.....#", "##...##", ".#####.", "..#.#.."];
    const COIN = ["..###..", ".#...#.", "#..#..#", "#.###.#", "#..#..#", ".#...#.", "..###.."];
    const STAR = ["...#...", "...#...", "#######", ".#####.", "..###..", ".##.##.", ".#...#."];
    const WIND = ["#####..", ".......", "..#####", ".......", "####...", ".......", "...####"];
    const jobs: { d: keyof typeof st.busy; g: string[]; c: string; at: number }[] = [
      { d: "factory", g: GEAR, c: "#ffd25a", at: 0 },
      { d: "tunnel", g: WIND, c: "#9fd0ff", at: 17 },
      { d: "sim", g: COIN, c: "#8ff0e4", at: 31 },
      { d: "academy", g: STAR, c: "#ffb0e0", at: 9 },
    ];
    for (const j of jobs) {
      if (!active(j.d)) continue;
      const b = B[j.d];
      const ph = ((f + j.at * 3) % 70) / 70;
      ctx.globalAlpha = Math.sin(Math.min(1, ph) * Math.PI);
      glyph(b.x + Math.round(b.w / 2) - 3, Math.round(b.y - 6 - ph * 24), j.g, j.c);
    }
    ctx.globalAlpha = 1;
  }
  {
    // a very slow golden hour wash, so the scene is never quite the same twice
    const w = 0.5 - 0.5 * Math.cos(f / 520);
    if (!night && w > 0.02) {
      ctx.globalAlpha = w * 0.1;
      RL(0, 0, SW, SH, "#ff9a3c");
      ctx.globalAlpha = 1;
    }
  }

  // ---------- snow ----------
  if (winter) {
    for (let i = 0; i < 70; i++) {
      const sp = 1 + (i % 3) * 0.6;
      const x = (rnd(i) * SW + Math.sin((f + i * 7) * 0.12) * 5 + f * 0.25) % SW;
      const y = (rnd(i + 70) * SH + f * sp) % SH;
      RL(Math.round(x), Math.round(y), i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1, "#ffffff");
    }
  }

  // ---------- closed: sign ----------
  if (closed) {
    R(6, GY - 62, 2, 42, "#555b6e");
    R(8, GY - 60, 54, 15, "#f4f4f4");
    R(9, GY - 59, 52, 13, "#c0392b");
    drawText(ctx, "CLOSED", 14, GY - 56, "#ffffff", 2);
    R(10, GY - 45, 2, 5, "#9aa3b8");
    R(56, GY - 45, 2, 5, "#9aa3b8");
    if (night) {
      ctx.globalAlpha = 0.18;
      RL(5, GY - 63, 59, 18, "#ff6050");
      ctx.globalAlpha = 1;
    }
  }

  // ---------- hover outline ----------
  if (st.hover) {
    const b = B[st.hover];
    ctx.fillStyle = "#ffe27a";
    const dash = (x: number, y: number, horizontal: boolean, len: number) => {
      for (let i = 0; i < len; i += 4) ctx.fillRect(horizontal ? x + i : x, horizontal ? y : y + i, horizontal ? 2 : 1, horizontal ? 1 : 2);
    };
    const bx = b.x - 2;
    const by = b.y - 2;
    const bw = b.w + 4;
    const bh = b.h + 4;
    dash(bx, by, true, bw);
    dash(bx, by + bh, true, bw);
    dash(bx, by, false, bh);
    dash(bx + bw, by, false, bh);
  }

  function drawTextP(x: number, y: number, s: string, c: string) {
    if (s) drawText(ctx, s, x, y, P(c), 1);
  }
}
