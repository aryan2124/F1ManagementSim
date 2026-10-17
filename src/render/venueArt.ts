import { Container, Graphics } from "pixi.js";
import type { Rng } from "../sim/rng";
import { sampleTrack, type TrackModel } from "../sim/track";
import { VENUE_GEO } from "../game/venueGeo.generated";
import { SCENES } from "../game/scenes.generated";
import { MIXED_FANS, SPONSORS, VENUES, type LandmarkSpec, type StandSpec } from "../game/venues";

const M_PER_PX = 1.2;
const px = (m: number) => m / M_PER_PX;

/** 3x5 pixel font. Each row is 3 bits, left pixel is the high bit. */
const FONT: Record<string, number[]> = {
  A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6], E: [7, 4, 6, 4, 7], F: [7, 4, 6, 4, 4],
  G: [3, 4, 5, 5, 3], H: [5, 5, 7, 5, 5], I: [7, 2, 2, 2, 7], J: [1, 1, 1, 5, 2], K: [5, 5, 6, 5, 5], L: [4, 4, 4, 4, 7],
  M: [5, 7, 7, 5, 5], N: [6, 5, 5, 5, 5], O: [2, 5, 5, 5, 2], P: [6, 5, 6, 4, 4], Q: [2, 5, 5, 6, 3], R: [6, 5, 6, 5, 5],
  S: [3, 4, 2, 1, 6], T: [7, 2, 2, 2, 2], U: [5, 5, 5, 5, 7], V: [5, 5, 5, 5, 2], W: [5, 5, 7, 7, 5], X: [5, 5, 2, 5, 5],
  Y: [5, 5, 2, 2, 2], Z: [7, 1, 2, 4, 7], "0": [7, 5, 5, 5, 7], "1": [2, 6, 2, 2, 7], "2": [6, 1, 2, 4, 7], "3": [6, 1, 2, 1, 6],
  "4": [5, 5, 7, 1, 1], "5": [7, 4, 6, 1, 6], "6": [3, 4, 7, 5, 7], "7": [7, 1, 2, 2, 2], "8": [7, 5, 7, 5, 7], "9": [7, 5, 7, 1, 6],
  "-": [0, 0, 7, 0, 0], ".": [0, 0, 0, 0, 2], " ": [0, 0, 0, 0, 0],
};

export function textWidth(t: string): number {
  return t.length * 4 - 1;
}
export function drawText(g: Graphics, text: string, x: number, y: number, color: number) {
  let cx = x;
  for (const ch of text.toUpperCase()) {
    const rows = FONT[ch] ?? FONT[" "];
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 3; c++) if (rows[r] & (4 >> c)) g.rect(cx + c, y + r, 1, 1).fill(color);
    cx += 4;
  }
}

type Dist = (x: number, y: number, limit: number) => number;

/** Corner apexes, strongest first, at least `sep` metres apart. */
function apexes(track: TrackModel): number[] {
  const n = track.n;
  const win = Math.round(40 / track.ds);
  const cand: { i: number; k: number }[] = [];
  for (let i = 0; i < n; i++) {
    const k = Math.abs(track.curv[i]);
    if (k < 0.004) continue;
    let top = true;
    for (let d = -win; d <= win && top; d++) if (Math.abs(track.curv[(i + d + n) % n]) > k) top = false;
    if (top) cand.push({ i, k });
  }
  return cand.sort((a, b) => b.k - a.k).map((c) => c.i);
}

function snapToApex(track: TrackModel, apex: number[], frac: number): number {
  const n = track.n;
  const target = frac * n;
  let best = Math.round(target) % n;
  let bd = Infinity;
  const reach = n * 0.045;
  for (const i of apex) {
    let d = Math.abs(i - target);
    d = Math.min(d, n - d);
    if (d < reach && d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

function dirOut(track: TrackModel, i: number): 1 | -1 {
  // curvature > 0 turns right, the normal (sin h, -cos h) points to the left, so the outside of a right turn is left
  return track.curv[i] >= 0 ? 1 : -1;
}

function place(track: TrackModel, i: number, lateral: number) {
  const t = sampleTrack(track, i * track.ds);
  return { x: px(t.x + Math.sin(t.heading) * lateral), y: px(t.y - Math.cos(t.heading) * lateral), heading: t.heading };
}

function drawStand(g: Graphics, rng: Rng, x: number, y: number, size: number, fans: number[], dim: number) {
  const w = 14 + size * 8;
  const h = 7 + size * 2;
  const x0 = Math.round(x - w / 2);
  const y0 = Math.round(y - h / 2);
  g.rect(x0 + 2, y0 + 2, w, h).fill({ color: 0x000000, alpha: 0.28 });
  g.rect(x0, y0, w, h).fill(0x57508a);
  g.rect(x0, y0, w, 2).fill(0x8f86c8); // roof edge
  for (let ry = y0 + 3; ry < y0 + h - 1; ry += 2) {
    for (let rx = x0 + 1; rx < x0 + w - 1; rx += 1) {
      if (rng.next() < 0.18) continue; // empty seat
      g.rect(rx, ry, 1, 1).fill({ color: fans[Math.floor(rng.next() * fans.length)], alpha: dim });
    }
  }
}

/** A grandstand found in the satellite picture: roof stays as photographed, the seat tiers face the road. */
function drawSatStand(g: Graphics, rng: Rng, st: number[], tx: number, ty: number, fans: number[], dim: number) {
  const [sx, sy, L, D, ang] = st;
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  let vx = -uy;
  let vy = ux;
  // v points from the stand toward the road
  if ((tx - sx) * vx + (ty - sy) * vy < 0) {
    vx = -vx;
    vy = -vy;
  }
  const hl = L / 2;
  const hd = D / 2;
  const depth = Math.min(D * 0.62, 9);
  const P = (a: number, b: number) => [px(sx + ux * a + vx * b), px(sy + uy * a + vy * b)];
  const quad = (a0: number, a1: number, b0: number, b1: number) => [...P(a0, b0), ...P(a1, b0), ...P(a1, b1), ...P(a0, b1)];
  // soft shadow, down and to the right of the whole structure
  const sh = quad(-hl, hl, -hd, hd).map((v, i) => v + 2 + (i % 2 === 0 ? 0 : 0));
  g.poly(sh).fill({ color: 0x000000, alpha: 0.26 });
  // seat bowl along the road side
  g.poly(quad(-hl, hl, hd - depth, hd)).fill(0x4d4783);
  g.poly(quad(-hl, hl, hd - depth, hd - depth + 1.4)).fill(0x8f86c8);
  const steps = Math.floor(L / M_PER_PX);
  for (let r = 0; r < Math.floor(depth / (M_PER_PX * 2.1)); r++) {
    const b = hd - depth + 2 + r * M_PER_PX * 2.1;
    for (let k = 0; k < steps; k++) {
      if (rng.next() < 0.2) continue;
      const a = -hl + (k + 0.5) * M_PER_PX;
      const [qx, qy] = P(a, b);
      g.rect(Math.round(qx), Math.round(qy), 1, 1).fill({ color: fans[Math.floor(rng.next() * fans.length)], alpha: dim });
    }
  }
  // front rail
  const rail = quad(-hl, hl, hd - 0.4, hd + 0.5);
  g.poly(rail).fill(0xd9d6e3);
}

function drawLandmark(g: Graphics, kind: LandmarkSpec["kind"], x: number, y: number, rng: Rng) {
  x = Math.round(x);
  y = Math.round(y);
  if (kind === "ferris") {
    const r = 17;
    g.circle(x, y, r).stroke({ width: 1, color: 0xd8d2ee });
    g.circle(x, y, 2).fill(0xd8d2ee);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      g.moveTo(x, y).lineTo(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r)).stroke({ width: 1, color: 0x9a92c0 });
      g.rect(Math.round(x + Math.cos(a) * r) - 1, Math.round(y + Math.sin(a) * r) - 1, 3, 3).fill([0xe63946, 0xf9c74f, 0x4cc9f0][k % 3]);
    }
    g.rect(x - 1, y, 3, r + 4).fill(0x6a6390);
  } else if (kind === "yachts") {
    g.rect(x - 34, y - 14, 68, 28).fill(0x2a6fb3);
    for (let k = 0; k < 7; k++) {
      const yx = x - 30 + k * 9 + Math.floor(rng.next() * 3);
      const yy = y - 10 + (k % 2) * 12;
      g.rect(yx, yy, 6, 3).fill(0xf4f1ea);
      g.rect(yx + 1, yy - 2, 3, 2).fill(0xdcd6e8);
      g.rect(yx + 3, yy - 5, 1, 3).fill(0xffffff);
    }
  } else if (kind === "tower") {
    g.rect(x - 3, y - 18, 6, 36).fill(0x8c84b4);
    g.rect(x - 5, y - 24, 10, 6).fill(0xb9b2e0);
    g.rect(x - 1, y - 30, 2, 6).fill(0xe63946);
  } else if (kind === "floodlights") {
    for (let k = 0; k < 3; k++) {
      g.rect(x + k * 14, y - 10, 1, 14).fill(0xbdb6dc);
      g.rect(x + k * 14 - 2, y - 12, 5, 2).fill(0xfff4c4);
    }
  } else {
    g.rect(x - 30, y - 2, 60, 4).fill(0x9d96c6);
    g.rect(x - 30, y + 2, 2, 8).fill(0x6a6390);
    g.rect(x + 28, y + 2, 2, 8).fill(0x6a6390);
  }
}

/** Grandstands, crowds, advertising boards, marshal posts and landmarks for one circuit. */
export function buildVenue(track: TrackModel, circuitId: string, rng: Rng, dist: Dist, night: boolean, geoId = ""): Container {
  const container = new Container();
  const spec = VENUES[circuitId] ?? {};
  const fans = spec.fans ?? MIXED_FANS;
  const half = track.def.width / 2;
  const n = track.n;
  const apex = apexes(track);
  const dim = night ? 0.8 : 1;

  const clear = (x: number, y: number, r: number) => dist(x, y, r) >= r;

  // ---- gravel traps and tyre walls on the outside of the real corners
  {
    const trap = new Graphics();
    const wall = new Graphics();
    const streetCircuit = /monaco|marina-bay|baku|jeddah|las-vegas|miami/.test(circuitId);
    if (!streetCircuit) {
      for (const i of apex.slice(0, 14)) {
        const sd = dirOut(track, i);
        const span = Math.round(70 / track.ds);
        const inner: number[] = [];
        const outer: number[] = [];
        let ok = true;
        for (let d = -span; d <= span; d++) {
          const j = (i + d + n) % n;
          const a = place(track, j, sd * (half + 3));
          const b = place(track, j, sd * (half + 15));
          if (!clear(b.x, b.y, (half + 6) / M_PER_PX)) {
            ok = false;
            break;
          }
          inner.push(a.x, a.y);
          outer.push(b.x, b.y);
        }
        if (!ok) continue;
        const rev: number[] = [];
        for (let k = outer.length - 2; k >= 0; k -= 2) rev.push(outer[k], outer[k + 1]);
        trap.poly([...inner, ...rev]).fill(0xcdb887);
        for (let d = -span; d <= span; d += 2) {
          const j = (i + d + n) % n;
          const w = place(track, j, sd * (half + 16));
          wall.rect(Math.round(w.x), Math.round(w.y), 2, 2).fill(((d >> 1) & 1) === 0 ? 0xe63946 : 0xf4e9d0);
        }
      }
    }
    container.addChild(trap);
    container.addChild(wall);
  }

  // ---- spectators behind the fence, in knots of a few
  const crowd = new Graphics();
  for (let s = 20; s < track.length; s += 55 + Math.floor(rng.next() * 60)) {
    const i = Math.round(s / track.ds) % n;
    const sd = (rng.next() < 0.5 ? 1 : -1) as 1 | -1;
    const base = place(track, i, sd * (half + 12 + rng.next() * 8));
    if (!clear(base.x, base.y, (half + 9) / M_PER_PX)) continue;
    const cnt = 3 + Math.floor(rng.next() * 6);
    for (let k = 0; k < cnt; k++) {
      const fx = Math.round(base.x + (rng.next() - 0.5) * 14);
      const fy = Math.round(base.y + (rng.next() - 0.5) * 8);
      crowd.rect(fx, fy, 1, 2).fill({ color: fans[Math.floor(rng.next() * fans.length)], alpha: dim });
      crowd.rect(fx, fy - 1, 1, 1).fill(0xe8c9a0);
    }
    if (rng.next() < 0.3) {
      crowd.rect(Math.round(base.x), Math.round(base.y) - 6, 1, 6).fill(0xdddddd);
      crowd.rect(Math.round(base.x) + 1, Math.round(base.y) - 6, 4, 3).fill(fans[Math.floor(rng.next() * fans.length)]);
    }
  }
  container.addChild(crowd);

  // ---- marshal posts, one every ~260 m on the outside of the lap
  const posts = new Graphics();
  for (let s = 130; s < track.length; s += 260) {
    const i = Math.round(s / track.ds) % n;
    const side = dirOut(track, i);
    const p = place(track, i, side * (half + 9));
    if (!clear(p.x, p.y, (half + 6) / M_PER_PX)) continue;
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    posts.rect(x, y, 4, 4).fill(0xff7a1a);
    posts.rect(x, y, 4, 1).fill(0xffd2a0);
    posts.rect(x + 5, y + 1, 1, 3).fill(0xf4e9d0); // marshal
    posts.rect(x + 5, y, 1, 1).fill(0xffa94d);
  }
  container.addChild(posts);

  // ---- advertising boards along the fence
  const boards = new Graphics();
  const slots = Math.floor(track.length / 150);
  for (let k = 0; k < slots; k++) {
    const sp = SPONSORS[(k * 5 + Math.floor(rng.next() * 3)) % SPONSORS.length];
    const i = Math.round((k * 150 + 40) / track.ds) % n;
    const side = (k % 2 === 0 ? 1 : -1) as 1 | -1;
    const w = textWidth(sp.text) + 4;
    const p = place(track, i, side * (half + 5));
    if (!clear(p.x, p.y, (half + 3 + w / 2) / M_PER_PX)) continue;
    const x = Math.round(p.x - w / 2);
    const y = Math.round(p.y - 4);
    boards.rect(x + 1, y + 1, w, 8).fill({ color: 0x000000, alpha: 0.3 });
    boards.rect(x, y, w, 8).fill(sp.bg);
    drawText(boards, sp.text, x + 2, y + 2, sp.fg);
  }
  container.addChild(boards);

  // ---- grandstands: named ones first, then the biggest remaining corners
  const stands = new Graphics();
  const names = new Graphics();
  const used: number[] = [];
  const tooClose = (i: number) => used.some((u) => Math.min(Math.abs(u - i), n - Math.abs(u - i)) * track.ds < 140);
  const putStand = (i: number, size: number, label?: string) => {
    for (const gap of [24, 34, 46]) {
      for (const sd of [dirOut(track, i), -dirOut(track, i)] as (1 | -1)[]) {
        const p = place(track, i, sd * (half + gap));
        const r = (half + 12 + size * 5) / M_PER_PX;
        if (!clear(p.x, p.y, r)) continue;
        drawStand(stands, rng, p.x, p.y, size, fans, dim);
        if (label) {
          const w = textWidth(label) + 4;
          const x = Math.round(p.x - w / 2);
          const y = Math.round(p.y - 8 - size * 2);
          names.rect(x, y, w, 7).fill(0x14111f);
          drawText(names, label, x + 2, y + 1, 0xf4e9d0);
        }
        used.push(i);
        return true;
      }
    }
    return false;
  };
  // surveyed stands (from the optional OSM importer) replace the approximate anchors
  const surveyed = VENUE_GEO[geoId] ?? [];
  const satStands = SCENES[circuitId]?.stands ?? [];
  if (satStands.length) {
    // stands photographed at the real place: use those, size and position as they are
    const nearest = (x: number, y: number) => {
      let bi = 0;
      let bd = Infinity;
      for (let i = 0; i < n; i += 2) {
        const d = (track.x[i] - x) ** 2 + (track.y[i] - y) ** 2;
        if (d < bd) {
          bd = d;
          bi = i;
        }
      }
      return bi;
    };
    const found: { st: number[]; ni: number }[] = [];
    for (const st of satStands) {
      const ni = nearest(st[0], st[1]);
      found.push({ st, ni });
      drawSatStand(stands, rng, st, track.x[ni], track.y[ni], fans, dim);
    }
    // name the stand closest to each named corner
    for (const s of (spec.stands ?? []) as StandSpec[]) {
      const i = snapToApex(track, apex, s.at);
      let best = -1;
      let bd = 140 * 140;
      found.forEach((f, k) => {
        const d = (f.st[0] - track.x[i]) ** 2 + (f.st[1] - track.y[i]) ** 2;
        if (d < bd) {
          bd = d;
          best = k;
        }
      });
      if (best < 0) continue;
      const st = found[best].st;
      const lbl = s.name;
      const w = textWidth(lbl) + 4;
      const lx = Math.round(px(st[0]) - w / 2);
      const ly = Math.round(px(st[1])) - 14;
      names.rect(lx, ly, w, 7).fill(0x14111f);
      drawText(names, lbl, lx + 2, ly + 1, 0xf4e9d0);
    }
  }
  for (const sv of satStands.length ? [] : surveyed) {
    const x = px(sv.x);
    const y = px(sv.y);
    if (!clear(x, y, (half + 10) / M_PER_PX)) continue;
    drawStand(stands, rng, x, y, 2, fans, dim);
    if (sv.name) {
      const w = textWidth(sv.name) + 4;
      names.rect(Math.round(x - w / 2), Math.round(y) - 12, w, 7).fill(0x14111f);
      drawText(names, sv.name, Math.round(x - w / 2) + 2, Math.round(y) - 11, 0xf4e9d0);
    }
  }
  for (const s of (surveyed.length || satStands.length ? [] : spec.stands ?? []) as StandSpec[]) {
    const i = snapToApex(track, apex, s.at);
    if (!tooClose(i)) putStand(i, s.size ?? 2, s.name);
  }
  let extra = 0;
  for (const i of satStands.length ? [] : apex) {
    if (extra >= 12) break;
    if (tooClose(i)) continue;
    if (putStand(i, 1 + Math.floor(rng.next() * 2))) extra++;
  }
  container.addChild(stands);

  // ---- landmarks
  const marks = new Graphics();
  for (const lm of SCENES[circuitId] ? [] : spec.landmarks ?? []) {
    const i = snapToApex(track, apex, lm.at);
    const sdOut = dirOut(track, i);
    for (const sd of [lm.side === "in" ? -sdOut : sdOut, lm.side === "in" ? sdOut : -sdOut] as (1 | -1)[]) {
      const p = place(track, i, sd * (half + (lm.gap ?? 40)));
      if (!clear(p.x, p.y, (half + 26) / M_PER_PX)) continue;
      drawLandmark(marks, lm.kind, p.x, p.y, rng);
      break;
    }
  }
  container.addChild(marks);
  container.addChild(names);
  return container;
}
