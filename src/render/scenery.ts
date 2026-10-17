import { Graphics } from "pixi.js";
import type { Rng } from "../sim/rng";

/**
 * Clean top-down indie look: flat colours, hard one-pixel highlights, one light direction
 * (the sun is up and to the left, so every shadow falls down and to the right).
 */
export interface Ctx {
  rng: Rng;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Distance in px from a point to the nearest bit of road (Infinity beyond `limit`). */
  dist: (x: number, y: number, limit: number) => number;
  /** True where water is (the sea or the lake), so nothing gets built there. */
  inWater: (x: number, y: number, pad: number) => boolean;
  /** Areas already used (fields, car parks...) so nothing overlaps. */
  taken?: { x: number; y: number; w: number; h: number }[];
}

/** True when no part of the rectangle (corners, every edge and the inside, sampled) comes within `min` of the road. */
export function rectClear(dist: Ctx["dist"], x: number, y: number, w: number, h: number, min: number): boolean {
  const step = Math.max(10, min / 3);
  for (let px = 0; px <= w + step; px += step) {
    for (let py = 0; py <= h + step; py += step) {
      if (dist(x + Math.min(px, w), y + Math.min(py, h), min) < min) return false;
    }
  }
  return true;
}

export function claim(ctx: Ctx, w: number, h: number, minTrack: number, maxTrack: number, near: (k: number) => { x: number; y: number }, tries = 60): { x: number; y: number; w: number; h: number } | null {
  const { rng, dist } = ctx;
  const taken = (ctx.taken ??= []);
  for (let t = 0; t < tries; t++) {
    const c = near(rng.next());
    const ang = rng.next() * Math.PI * 2;
    const d = minTrack + rng.next() * (maxTrack - minTrack);
    const x = Math.round(c.x + Math.cos(ang) * d - w / 2);
    const y = Math.round(c.y + Math.sin(ang) * d - h / 2);
    const pts: [number, number][] = [[x, y], [x + w, y], [x, y + h], [x + w, y + h], [x + w / 2, y + h / 2]];
    if (!rectClear(dist, x, y, w, h, minTrack) || pts.some(([qx, qy]) => ctx.inWater(qx, qy, 14))) continue;
    if (x < ctx.bounds.minX + 6 || y < ctx.bounds.minY + 6 || x + w > ctx.bounds.maxX - 6 || y + h > ctx.bounds.maxY - 6) continue;
    if (taken.some((r) => x < r.x + r.w + 6 && x + w + 6 > r.x && y < r.y + r.h + 6 && y + h + 6 > r.y)) continue;
    const r = { x, y, w, h };
    taken.push(r);
    return r;
  }
  return null;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export function shade(c: number, k: number): number {
  const r = Math.max(0, Math.min(255, Math.round(((c >> 16) & 255) * k)));
  const g = Math.max(0, Math.min(255, Math.round(((c >> 8) & 255) * k)));
  const b = Math.max(0, Math.min(255, Math.round((c & 255) * k)));
  return (r << 16) | (g << 8) | b;
}

/** Flat ground with a few big, soft colour patches and sparse grass tufts. */
export function groundDetail(ctx: Ctx, base: number, a: number, b: number): Graphics {
  const { rng, bounds } = ctx;
  const W = bounds.maxX - bounds.minX;
  const H = bounds.maxY - bounds.minY;
  const g = new Graphics();
  const patches = Math.floor((W * H) / 14000);
  for (let i = 0; i < patches; i++) {
    const x = bounds.minX + rng.next() * W;
    const y = bounds.minY + rng.next() * H;
    const w = 24 + rng.next() * 60;
    const h = 14 + rng.next() * 36;
    g.roundRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h), 6).fill({ color: rng.next() < 0.5 ? a : b, alpha: 0.55 });
  }
  const tufts = Math.floor((W * H) / 2200);
  for (let i = 0; i < tufts; i++) {
    const x = Math.floor(bounds.minX + rng.next() * W);
    const y = Math.floor(bounds.minY + rng.next() * H);
    const c = rng.next() < 0.5 ? a : b;
    g.rect(x, y, 1, 2).fill(c);
    g.rect(x + 2, y, 1, 2).fill(c);
    g.rect(x + 1, y + 1, 1, 1).fill(c);
  }
  void base;
  return g;
}

const CROPS: [number, number][] = [
  [0x86b64e, 0x7aa845],
  [0xc9bc58, 0xbcae4c],
  [0x9a7d4c, 0x8c7042],
  [0x6fa04a, 0x649440],
];

/** Tidy farmland: striped fields with a hedge line round the edge. */
export function fields(ctx: Ctx, count: number, shadowOnly = false): Graphics {
  const { rng, bounds, dist } = ctx;
  const g = new Graphics();
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  for (let tries = 0; tries < count * 14 && placed.length < count; tries++) {
    const w = 70 + Math.floor(rng.next() * 90);
    const h = 50 + Math.floor(rng.next() * 70);
    const x = Math.floor(lerp(bounds.minX, bounds.maxX - w, rng.next()));
    const y = Math.floor(lerp(bounds.minY, bounds.maxY - h, rng.next()));
    const pts: [number, number][] = [[x, y], [x + w, y], [x, y + h], [x + w, y + h], [x + w / 2, y + h / 2]];
    if (!rectClear(dist, x, y, w, h, 70) || pts.some(([px, py]) => ctx.inWater(px, py, 20))) continue;
    if (placed.some((p) => x < p.x + p.w + 8 && x + w + 8 > p.x && y < p.y + p.h + 8 && y + h + 8 > p.y)) continue;
    if ((ctx.taken ?? []).some((p) => x < p.x + p.w + 8 && x + w + 8 > p.x && y < p.y + p.h + 8 && y + h + 8 > p.y)) continue;
    placed.push({ x, y, w, h });
    (ctx.taken ??= []).push({ x, y, w, h });
    const [c1, c2] = CROPS[Math.floor(rng.next() * CROPS.length)];
    if (shadowOnly) continue;
    const vertical = rng.next() < 0.5;
    g.rect(x, y, w, h).fill(c1);
    for (let k = 0; k < (vertical ? w : h); k += 8) {
      if (vertical) g.rect(x + k, y, 4, h).fill(c2);
      else g.rect(x, y + k, w, 4).fill(c2);
    }
    g.rect(x, y, w, 2).fill(0x3f6b35);
    g.rect(x, y + h - 2, w, 2).fill(0x3f6b35);
    g.rect(x, y, 2, h).fill(0x3f6b35);
    g.rect(x + w - 2, y, 2, h).fill(0x3f6b35);
  }
  return g;
}

export interface TreeStyle {
  kind: "round" | "pine" | "shrub";
  dark: number;
  light: number;
}

/** Trees in groves rather than an even sprinkle. Returns [shadow layer, crown layer]. */
export function groves(ctx: Ctx, count: number, style: TreeStyle, minD: number, maxD: number, trackAt: (i: number) => { x: number; y: number }, n: number): [Graphics, Graphics] {
  const { rng, dist } = ctx;
  const shadows = new Graphics();
  const crowns = new Graphics();
  const trees: { x: number; y: number; r: number }[] = [];
  const centres = Math.max(6, Math.floor(count / 11));
  for (let c = 0; c < centres * 8 && trees.length < count; c++) {
    const t = trackAt(Math.floor(rng.next() * n));
    const ang = rng.next() * Math.PI * 2;
    const d = minD + 30 + rng.next() * (maxD - minD);
    const gx = t.x + Math.cos(ang) * d;
    const gy = t.y + Math.sin(ang) * d;
    if (dist(gx, gy, minD) < minD) continue;
    const members = 5 + Math.floor(rng.next() * 11);
    const rad = 16 + rng.next() * 26;
    for (let m = 0; m < members; m++) {
      const a2 = rng.next() * Math.PI * 2;
      const rr = Math.sqrt(rng.next()) * rad;
      const x = Math.round(gx + Math.cos(a2) * rr);
      const y = Math.round(gy + Math.sin(a2) * rr);
      if (dist(x, y, minD) < minD || ctx.inWater(x, y, 6)) continue;
      trees.push({ x, y, r: 4 + Math.floor(rng.next() * 3) });
    }
  }
  trees.sort((p, q) => p.y - q.y);
  for (const t of trees) {
    const { x, y, r } = t;
    if (style.kind === "round") {
      shadows.ellipse(x + 3, y + r - 1, r + 1, Math.max(2, r - 2)).fill({ color: 0x0b2a12, alpha: 0.28 });
      crowns.circle(x, y, r).fill(style.dark);
      crowns.circle(x - 1, y - 1, r - 1).fill(style.light);
      crowns.rect(x - 2, y - 2, 2, 1).fill(shade(style.light, 1.25));
    } else if (style.kind === "pine") {
      const h = 6 + r;
      shadows.ellipse(x + 3, y + 2, 4, 2).fill({ color: 0x0b2a12, alpha: 0.28 });
      crowns.poly([x, y - h, x - 4, y + 2, x + 4, y + 2]).fill(style.dark);
      crowns.poly([x, y - h + 1, x - 2, y, x + 1, y]).fill(style.light);
    } else {
      crowns.circle(x, y, 2).fill(style.dark);
      crowns.rect(x - 1, y - 1, 2, 1).fill(style.light);
    }
  }
  return [shadows, crowns];
}

const ROOFS = [0xd9cdb8, 0xc8785a, 0xe0c890, 0x6f8aa8, 0xa8564a, 0x8aa07a, 0x5a9a9a, 0xe8e4dc, 0xb59a7a, 0x7a7f9a];
const CAR_COLOURS = [0xe63946, 0xf9c74f, 0x4cc9f0, 0xf4f1e8, 0x2a2f44, 0x57cc99, 0xff7a1a];

export interface CityOut {
  streets: Graphics;
  blocks: Graphics;
  lights: Graphics;
}

/**
 * A tidy street grid with city blocks, small parks and rooftop details.
 * Blocks stay clear of the circuit; streets run up to it like the real thing.
 */
export function city(ctx: Ctx, night: boolean, ground: number): CityOut {
  const { rng, bounds, dist } = ctx;
  const CELL = 84;
  const ST = 12;
  const streets = new Graphics();
  const blocks = new Graphics();
  const lights = new Graphics();
  const shadow = new Graphics();
  const walls = new Graphics();
  const roofs = new Graphics();
  const asphalt = 0x4b4e5c;
  const x0 = Math.floor(bounds.minX / CELL) * CELL;
  const y0 = Math.floor(bounds.minY / CELL) * CELL;
  const clear = (x: number, y: number, d: number) => dist(x, y, d) >= d && !ctx.inWater(x, y, 8);

  // streets: draw each 84 px segment only when its middle is out of the sea and not on the circuit
  const seg = (ax: number, ay: number, bx: number, by: number, horizontal: boolean) => {
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    if (ctx.inWater(mx, my, 6)) return;
    if (horizontal) {
      streets.rect(ax, ay - ST / 2, bx - ax, ST).fill(asphalt);
      streets.rect(ax, ay - 1, bx - ax, 1).fill({ color: 0xe9e6dc, alpha: 0.55 });
    } else {
      streets.rect(ax - ST / 2, ay, ST, by - ay).fill(asphalt);
      streets.rect(ax - 1, ay, 1, by - ay).fill({ color: 0xe9e6dc, alpha: 0.55 });
    }
    // street lamps
    const lampsN = Math.floor(CELL / 42);
    for (let k = 0; k < lampsN; k++) {
      const t = (k + 0.5) / lampsN;
      const lx = horizontal ? ax + (bx - ax) * t : ax + ST / 2 + 1;
      const ly = horizontal ? ay + ST / 2 + 1 : ay + (by - ay) * t;
      lights.circle(lx, ly, night ? 12 : 0.5).fill({ color: 0xffe9a0, alpha: night ? 0.1 : 0 });
      if (night) lights.circle(lx, ly, 4).fill({ color: 0xffe9a0, alpha: 0.2 });
      lights.rect(Math.round(lx), Math.round(ly), 1, 1).fill(night ? 0xfff6d0 : 0x2a2540);
    }
  };
  for (let y = y0; y < bounds.maxY; y += CELL) for (let x = x0; x < bounds.maxX; x += CELL) {
    seg(x, y, x + CELL, y, true);
    seg(x, y, x, y + CELL, false);
  }
  // parked cars along the kerbs
  for (let y = y0; y < bounds.maxY; y += CELL) for (let x = x0; x < bounds.maxX; x += CELL) {
    for (let k = 0; k < CELL; k += 14) {
      for (const horizontal of [true, false]) {
        if (rng.next() > 0.3) continue;
        const along = k + 8 + Math.floor(rng.next() * 3);
        const side = rng.next() < 0.5 ? -1 : 1;
        const px = horizontal ? x + along : x + side * (ST / 2 - 2);
        const py = horizontal ? y + side * (ST / 2 - 2) : y + along;
        if (ctx.inWater(px, py, 6) || dist(px, py, 18) < 18) continue;
        const col = CAR_COLOURS[Math.floor(rng.next() * CAR_COLOURS.length)];
        const w = horizontal ? 5 : 3;
        const h = horizontal ? 3 : 5;
        streets.rect(Math.round(px), Math.round(py), w, h).fill(col);
        streets.rect(Math.round(px), Math.round(py), horizontal ? 2 : w, horizontal ? h : 2).fill(shade(col, 0.7));
      }
    }
  }
  // crossings
  for (let y = y0; y < bounds.maxY; y += CELL) for (let x = x0; x < bounds.maxX; x += CELL) {
    if (!ctx.inWater(x, y, 6)) streets.rect(x - ST / 2, y - ST / 2, ST, ST).fill(asphalt);
  }

  // blocks
  for (let y = y0; y < bounds.maxY; y += CELL) {
    for (let x = x0; x < bounds.maxX; x += CELL) {
      const bx = x + ST / 2 + 2;
      const by = y + ST / 2 + 2;
      const bw = CELL - ST - 4;
      const bh = CELL - ST - 4;
      const probes: [number, number][] = [[bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh], [bx + bw / 2, by + bh / 2], [bx + bw / 2, by], [bx, by + bh / 2], [bx + bw, by + bh / 2], [bx + bw / 2, by + bh]];
      if (ctx.inWater(bx + bw / 2, by + bh / 2, 20)) continue;
      // pavement and parks only where the whole block is well clear of the road; edge blocks just get buildings
      const whole = probes.every(([qx, qy]) => clear(qx, qy, 26));
      if (whole) blocks.rect(bx - 2, by - 2, bw + 4, bh + 4).fill(shade(ground, 1.08));
      const r = rng.next();
      if (whole && r < 0.14) {
        // a small park
        blocks.rect(bx, by, bw, bh).fill(0x5f9a4a);
        blocks.rect(bx + bw / 2 - 1, by, 3, bh).fill(0xcdb98a);
        blocks.rect(bx, by + bh / 2 - 1, bw, 3).fill(0xcdb98a);
        for (let k = 0; k < 5; k++) {
          const tx = Math.round(bx + 8 + rng.next() * (bw - 16));
          const ty = Math.round(by + 8 + rng.next() * (bh - 16));
          shadow.ellipse(tx + 3, ty + 4, 5, 2).fill({ color: 0x0b2a12, alpha: 0.3 });
          roofs.circle(tx, ty, 5).fill(0x2d5a33);
          roofs.circle(tx - 1, ty - 1, 4).fill(0x3f7d45);
        }
        continue;
      }
      // split the block into 1 to 4 buildings
      const cutX = rng.next() < 0.6 ? Math.round(bw * lerp(0.35, 0.65, rng.next())) : bw;
      const cutY = rng.next() < 0.6 ? Math.round(bh * lerp(0.35, 0.65, rng.next())) : bh;
      const parts: [number, number, number, number][] = [];
      const xs = cutX < bw ? [[0, cutX], [cutX, bw]] : [[0, bw]];
      const ys = cutY < bh ? [[0, cutY], [cutY, bh]] : [[0, bh]];
      for (const [ya, yb] of ys) for (const [xa, xb] of xs) parts.push([xa, ya, xb - xa, yb - ya]);
      for (const [px, py, pw, ph] of parts) {
        const ix = bx + px + 2;
        const iy = by + py + 2;
        const iw = pw - 4;
        const ih = ph - 4;
        if (iw < 8 || ih < 8) continue;
        const bprobes: [number, number][] = [[ix, iy], [ix + iw, iy], [ix, iy + ih], [ix + iw, iy + ih], [ix + iw / 2, iy + ih / 2]];
        if (!bprobes.every(([qx, qy]) => clear(qx, qy, 24))) continue;
        const roof = ROOFS[Math.floor(rng.next() * ROOFS.length)];
        const wall = 3 + Math.floor(rng.next() * 4);
        shadow.rect(ix + 3, iy + 3, iw, ih + wall).fill({ color: 0x000000, alpha: 0.22 });
        walls.rect(ix, iy + 1, iw, ih).fill(shade(roof, 0.55));
        roofs.rect(ix, iy, iw, ih).fill(roof);
        roofs.rect(ix, iy, iw, 1).fill(shade(roof, 1.15));
        roofs.rect(ix, iy, 1, ih).fill(shade(roof, 1.1));
        roofs.rect(ix, iy + ih - 1, iw, 1).fill(shade(roof, 0.8));
        roofs.rect(ix + iw - 1, iy, 1, ih).fill(shade(roof, 0.8));
        // rooftop details
        const d = rng.next();
        if (d < 0.55) {
          const ux = ix + 3 + Math.floor(rng.next() * Math.max(1, iw - 9));
          const uy = iy + 3 + Math.floor(rng.next() * Math.max(1, ih - 9));
          roofs.rect(ux, uy, 4, 4).fill(shade(roof, 0.72));
          roofs.rect(ux, uy, 4, 1).fill(shade(roof, 1.2));
        }
        if (d > 0.7) roofs.rect(ix + 3, iy + Math.floor(ih / 2), iw - 6, 2).fill(shade(roof, 0.86));
        if (night && rng.next() < 0.5) roofs.rect(ix + 2 + Math.floor(rng.next() * Math.max(1, iw - 5)), iy + 2, 2, 2).fill(0xffe9a0);
      }
    }
  }
  blocks.addChild(shadow, walls, roofs);
  return { streets, blocks, lights };
}


const CARS = [0xe63946, 0xf9c74f, 0x4cc9f0, 0xf4f1e8, 0x2a2f44, 0x57cc99, 0xff7a1a, 0xb66cff];
const TENTS = [0xe63946, 0xf9c74f, 0x4cc9f0, 0xff7a1a, 0x57cc99, 0xe76f8a, 0xf4f1e8];

/**
 * Everything that makes a circuit look used: car parks with access roads, a campsite,
 * a hospitality village with striped tents, and a perimeter fence. Clustered near the
 * start line, the way the real paddock is.
 */
export function infrastructure(ctx: Ctx, nearStart: (k: number) => { x: number; y: number }, anywhere: (k: number) => { x: number; y: number }, nearestTrack: (x: number, y: number) => { x: number; y: number }): Graphics {
  const { rng } = ctx;
  const g = new Graphics();
  const area = (ctx.bounds.maxX - ctx.bounds.minX) * (ctx.bounds.maxY - ctx.bounds.minY);
  const parks = Math.max(2, Math.min(5, Math.round(area / 900000)));

  const road = (x: number, y: number) => {
    const t0 = nearestTrack(x, y);
    // stop at the edge of the run-off instead of running over the tarmac
    const dx = x - t0.x;
    const dy = y - t0.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const k = Math.min(1, 17 / len);
    const t = { x: t0.x + dx * k, y: t0.y + dy * k };
    g.moveTo(x, y).lineTo(Math.round((x + t.x) / 2), Math.round(y)).lineTo(Math.round(t.x), Math.round(t.y)).stroke({ width: 5, color: 0x6b6e7a });
    g.moveTo(x, y).lineTo(Math.round((x + t.x) / 2), Math.round(y)).lineTo(Math.round(t.x), Math.round(t.y)).stroke({ width: 1, color: 0xe9e6dc, alpha: 0.5 });
  };

  // car parks
  for (let i = 0; i < parks; i++) {
    const w = 70 + Math.floor(rng.next() * 40);
    const h = 40 + Math.floor(rng.next() * 24);
    const r = claim(ctx, w, h, 70, 260, i < 2 ? nearStart : anywhere);
    if (!r) continue;
    road(r.x + r.w / 2, r.y + r.h / 2);
    g.rect(r.x, r.y, r.w, r.h).fill(0x5a5d6a);
    g.rect(r.x, r.y, r.w, 1).fill(0x7a7d8a);
    for (let rx = r.x + 4; rx < r.x + r.w - 6; rx += 12) {
      g.rect(rx - 1, r.y + 3, 1, r.h - 6).fill({ color: 0xe9e6dc, alpha: 0.5 });
      for (let ry = r.y + 4; ry < r.y + r.h - 8; ry += 7) {
        if (rng.next() < 0.28) continue;
        const col = CARS[Math.floor(rng.next() * CARS.length)];
        g.rect(rx + 2, ry, 5, 3).fill(col);
        g.rect(rx + 2, ry, 2, 3).fill(shade(col, 0.72));
        g.rect(rx + 3, ry + 3, 4, 1).fill({ color: 0x000000, alpha: 0.25 });
      }
    }
  }

  // campsite
  const camp = claim(ctx, 84, 56, 80, 300, nearStart);
  if (camp) {
    g.rect(camp.x, camp.y, camp.w, camp.h).fill(0x6fa04a);
    g.rect(camp.x, camp.y, camp.w, 1).fill(0x3f6b35);
    g.rect(camp.x, camp.y + camp.h - 1, camp.w, 1).fill(0x3f6b35);
    for (let ry = camp.y + 6; ry < camp.y + camp.h - 8; ry += 11) {
      for (let rx = camp.x + 6; rx < camp.x + camp.w - 8; rx += 10) {
        if (rng.next() < 0.2) continue;
        const col = TENTS[Math.floor(rng.next() * TENTS.length)];
        g.poly([rx, ry + 5, rx + 3, ry, rx + 6, ry + 5]).fill(col);
        g.rect(rx + 3, ry + 1, 1, 4).fill(shade(col, 0.7));
        g.rect(rx + 1, ry + 6, 6, 1).fill({ color: 0x000000, alpha: 0.22 });
      }
    }
    road(camp.x + camp.w / 2, camp.y + camp.h / 2);
  }

  // hospitality village
  const vil = claim(ctx, 90, 36, 56, 200, nearStart);
  if (vil) {
    g.rect(vil.x, vil.y, vil.w, vil.h).fill(0xb9a98a);
    for (let k = 0; k < 6; k++) {
      const tx = vil.x + 4 + (k % 3) * 29;
      const ty = vil.y + 4 + Math.floor(k / 3) * 16;
      const col = TENTS[Math.floor(rng.next() * TENTS.length)];
      g.rect(tx + 2, ty + 2, 24, 11).fill({ color: 0x000000, alpha: 0.22 });
      g.rect(tx, ty, 24, 11).fill(0xf4f1e8);
      for (let sx = 0; sx < 24; sx += 4) g.rect(tx + sx, ty, 2, 11).fill(col);
      g.rect(tx, ty, 24, 1).fill(shade(col, 1.2));
    }
  }
  return g;
}
