import { CAR_W, drawCar, drawCloth, hexStr, shade } from "./carDraw";
import { drawText, textWidth } from "./pixFont";

export const RW = 320;
export const RH = 180;
export const T_PULL_START = 1.1;
export const T_PULL_END = 3.1;
export const T_FLASH_END = 3.5;
export const T_END = 4.0;

const S = 3;
const CAR_X = Math.round((RW - CAR_W * S) / 2);
const FLOOR_Y = 142;
const CAR_Y = FLOOR_Y - 26 * S;

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const rnd = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export function carCode(name: string, year: number): string {
  const letters = name.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 3);
  return `${letters}-${String(year).slice(-2)}`;
}

export interface RevealInfo {
  teamColor: number;
  accent: number;
  teamName: string;
  year: number;
}

export function drawReveal(ctx: CanvasRenderingContext2D, t: number, o: RevealInfo): void {
  ctx.imageSmoothingEnabled = false;
  const R = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  const team = hexStr(o.teamColor);
  const acc = hexStr(o.accent);

  // back wall
  for (let y = 0; y < FLOOR_Y - 14; y += 2) R(0, y, RW, 2, y % 4 === 0 ? "#171229" : "#1a1530");
  for (let x = 0; x < RW; x += 40) R(x, 30, 1, FLOOR_Y - 44, "#0f0b1b");
  // garage door slats up top
  for (let y = 0; y < 30; y += 3) {
    R(0, y, RW, 2, "#241e3d");
    R(0, y + 2, RW, 1, "#120e22");
  }
  R(0, 30, RW, 2, "#3a2f66");
  // hanging team banners
  for (const bx of [24, 270]) {
    R(bx, 34, 22, 40, shade(team, 0.55));
    R(bx, 34, 22, 3, acc);
    R(bx + 9, 40, 4, 22, shade(acc, 0.8));
    for (let i = 0; i < 4; i++) R(bx + i * 6, 74, 4, 3, shade(team, 0.55));
  }
  // tool cabinets
  for (const [cx, cw] of [[2, 18], [300, 18]]) {
    R(cx, FLOOR_Y - 34, cw, 34, "#2b2547");
    for (let i = 0; i < 4; i++) {
      R(cx + 2, FLOOR_Y - 32 + i * 8, cw - 4, 6, i % 2 ? "#3a3166" : team);
      R(cx + cw / 2 - 2, FLOOR_Y - 30 + i * 8, 4, 1, "#d8cfee");
    }
  }
  // floor: polished tiles with perspective lines
  for (let y = FLOOR_Y - 14; y < RH; y++) {
    const k = y - (FLOOR_Y - 14);
    R(0, y, RW, 1, k % 6 < 3 ? "#16112a" : "#1b1533");
  }
  for (let i = -8; i <= 8; i++) {
    for (let y = FLOOR_Y - 14; y < RH; y += 2) {
      const k = (y - (FLOOR_Y - 14)) / (RH - FLOOR_Y + 14);
      R(RW / 2 + i * (22 + k * 40), y, 1, 1, "#0e0a1c");
    }
  }
  R(0, FLOOR_Y - 14, RW, 1, "#3a2f66");

  // the car, then the cloth on top
  drawCar(ctx, CAR_X, CAR_Y, S, { teamColor: o.teamColor, accent: o.accent });
  const pull = clamp((t - T_PULL_START) / (T_PULL_END - T_PULL_START));
  if (pull < 1) drawCloth(ctx, CAR_X, CAR_Y, S, pull, { teamColor: o.teamColor, accent: o.accent, steps: 10 });

  // lighting: darkness first, then three spotlights switching on and sweeping
  const lamps = [60, 160, 260];
  const lvl = lamps.map((_, i) => clamp(Math.floor(((t - (0.3 + i * 0.3)) / 0.12) + 1) / 3));
  const lit = (lvl[0] + lvl[1] + lvl[2]) / 3;
  ctx.globalAlpha = 0.84 - 0.62 * lit;
  R(0, 0, RW, RH, "#05030c");
  ctx.globalAlpha = 1;
  lamps.forEach((lx, i) => {
    R(lx - 5, 0, 10, 4, "#0c0916");
    R(lx - 3, 4, 6, 2, lvl[i] > 0 ? "#fff6cf" : "#2a2347");
    if (lvl[i] <= 0) return;
    const sway = Math.sin(t * 2.4 + i * 2) * 26 * clamp(1.6 - t * 0.5, 0, 1) * (t < 3.5 ? 1 : 0);
    const target = CAR_X + (CAR_W * S) / 2 + (i - 1) * 46;
    for (let y = 6; y < FLOOR_Y + 6; y += 2) {
      const f = (y - 6) / (FLOOR_Y - 6);
      const cx = lx + (target + sway * (1 - f * 0.5) - lx) * f;
      const hw = 4 + f * 34;
      ctx.globalAlpha = 0.07 * lvl[i] * (1 - f * 0.35);
      R(cx - hw, y, hw * 2, 2, "#fff3c0");
      ctx.globalAlpha = 0.05 * lvl[i];
      R(cx - hw * 0.55, y, hw * 1.1, 2, "#ffffff");
    }
    ctx.globalAlpha = 1;
  });
  // light pool on the floor
  for (let k = 0; k < 14; k++) {
    const w = 120 + 26 * Math.sin((k / 14) * Math.PI) * 3;
    ctx.globalAlpha = 0.1 * lit;
    R(RW / 2 - w / 2, FLOOR_Y - 6 + k, w, 1, "#ffeeb8");
  }
  ctx.globalAlpha = 1;

  // confetti after the reveal
  if (t > T_PULL_END - 0.05) {
    const age = t - (T_PULL_END - 0.05);
    for (let i = 0; i < 46; i++) {
      const vx = (rnd(i) - 0.5) * 150;
      const vy = -60 - rnd(i + 99) * 110;
      const x = RW / 2 + vx * age * 0.9 + (rnd(i + 5) - 0.5) * 80;
      const y = 80 + vy * age + 120 * age * age;
      if (y > RH || y < 0 || age > 3.2) continue;
      const c = i % 3 === 0 ? team : i % 3 === 1 ? acc : "#f4e9d0";
      R(Math.round(x / 2) * 2, Math.round(y / 2) * 2, 2, 2, c);
    }
  }

  // flash
  if (t >= T_PULL_END - 0.02 && t < T_FLASH_END) {
    const k = (t - (T_PULL_END - 0.02)) / (T_FLASH_END - T_PULL_END + 0.02);
    const a = [0.95, 0.7, 0.45, 0.25, 0.1][Math.min(4, Math.floor(k * 5))];
    ctx.globalAlpha = a;
    R(0, 0, RW, RH, "#ffffff");
    ctx.globalAlpha = 1;
  }

  // title banner, dropping in with pixel steps
  if (t >= T_FLASH_END - 0.2) {
    const step = Math.min(4, Math.floor((t - (T_FLASH_END - 0.2)) / 0.09));
    const by = -34 + step * 11 + (step >= 4 ? 0 : 0);
    const title = `THE ${o.year} CAR`;
    const sc = 3;
    const tw = textWidth(title, sc);
    const bw = tw + 30;
    const bx = Math.round((RW - bw) / 2);
    R(bx - 3, by - 3, bw + 6, 32, "#0b0814");
    R(bx, by, bw, 26, "#231d3b");
    R(bx, by, bw, 3, team);
    R(bx, by + 23, bw, 3, acc);
    R(bx - 6, by + 8, 6, 10, team);
    R(bx + bw, by + 8, 6, 10, acc);
    drawText(ctx, title, bx + 15, by + 6 + sc, "#000000", sc);
    drawText(ctx, title, bx + 15, by + 6 + sc - 3, "#f4e9d0", sc);
  }
  // car name and livery chips
  if (t >= T_FLASH_END + 0.1) {
    const nm = o.teamName.toUpperCase();
    const nw = textWidth(nm, 2);
    drawText(ctx, nm, Math.round((RW - nw) / 2), 148, "#f4e9d0", 2);
    const code = carCode(o.teamName, o.year);
    const cw = textWidth(code, 1);
    drawText(ctx, code, Math.round((RW - cw) / 2), 162, "#9a8fbf", 1);
    R(16, 160, 10, 10, "#f4e9d0");
    R(17, 161, 8, 8, team);
    R(30, 160, 10, 10, "#f4e9d0");
    R(31, 161, 8, 8, acc);
    drawText(ctx, "LIVERY", 44, 162, "#9a8fbf", 1);
  }
  if (t < T_END) drawText(ctx, "CLICK TO SKIP", RW - textWidth("CLICK TO SKIP") - 6, RH - 10, "#6a5f94", 1);
}
