import { Container, Graphics } from "pixi.js";
import { sampleTrack, type TrackModel } from "../sim/track";
import { BOX_SPACING, GRID_GAP } from "../sim/engine";
import type { TeamSpec } from "../sim/types";
const M_PER_PX = 1.2;
const PIT_LATERAL = 24;

/**
 * What a race weekend adds to the place that the satellite picture cannot show, because the picture was taken on an
 * ordinary day: painted grid boxes, the start gantry, each team's motorhome behind its garage, the TV compound,
 * the medical centre and the helicopter pad. Everything is placed relative to the real centreline and pit lane,
 * and checked against the photographed land cover so a motorhome never sits in the sea.
 */

const px = (m: number) => m / M_PER_PX;

interface Frame {
  x: number;
  y: number;
  ux: number;
  uy: number;
  vx: number;
  vy: number;
}

/** A frame at distance s along the track and `lat` metres to the left of travel (matches the pit side maths). */
function frame(track: TrackModel, s: number, lat: number): Frame {
  const t = sampleTrack(track, s);
  const nx = Math.sin(t.heading);
  const ny = -Math.cos(t.heading);
  return { x: t.x + nx * lat, y: t.y + ny * lat, ux: Math.cos(t.heading), uy: Math.sin(t.heading), vx: nx, vy: ny };
}

const shade = (c: number, f: number) => {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * f));
  const b = Math.min(255, Math.round((c & 255) * f));
  return (r << 16) | (g << 8) | b;
};

function box(g: Graphics, f: Frame, a0: number, a1: number, b0: number, b1: number, color: number, alpha = 1) {
  const P = (a: number, b: number) => [px(f.x + f.ux * a + f.vx * b), px(f.y + f.uy * a + f.vy * b)];
  g.poly([...P(a0, b0), ...P(a1, b0), ...P(a1, b1), ...P(a0, b1)]).fill({ color, alpha });
}

export function buildWeekend(
  track: TrackModel,
  teams: TeamSpec[],
  /** true when a spot (metres) is open ground we may build on */
  free: (x: number, y: number, r: number) => boolean,
  night: boolean,
): Container {
  const out = new Container();
  const g = new Graphics();
  const side = track.pitSide;
  const half = track.def.width / 2;

  // ---- starting grid: 20 painted boxes, staggered, pole nearest the line
  for (let slot = 0; slot < 20; slot++) {
    const s = -6 - slot * GRID_GAP;
    const lat = slot % 2 === 0 ? 3 : -3;
    const f = frame(track, s, lat);
    // box: 5.5 m long, 2.4 m wide, open at the front like the real thing
    const l0 = -3.4;
    const l1 = 2.2;
    const w = 1.2;
    box(g, f, l0, l1, -w, -w + 0.22, 0xf4f1e8, 0.9);
    box(g, f, l0, l1, w - 0.22, w, 0xf4f1e8, 0.9);
    box(g, f, l0, l0 + 0.25, -w, w, 0xf4f1e8, 0.9);
  }
  // pole line, a painted bar across the whole grid width
  {
    const f = frame(track, -3, 0);
    box(g, f, -0.2, 0.2, -half + 0.4, half - 0.4, 0xf4f1e8, 0.5);
  }

  // ---- start gantry over the line: two legs, a bar and a row of five light pods
  {
    const f = frame(track, 4, 0);
    const L = half + 4;
    box(g, f, -0.7, 0.7, -L - 0.6, -L + 0.6, 0x3a3652); // left leg
    box(g, f, -0.7, 0.7, L - 0.6, L + 0.6, 0x3a3652); // right leg
    // shadow of the bar falls down and right on the tarmac
    const sh = frame(track, 4 + 2.4, 0);
    box(g, sh, -0.5, 0.5, -L, L, 0x000000, 0.2);
    box(g, f, -0.6, 0.6, -L, L, 0x6a6490);
    box(g, f, -0.6, 0.6, -L, L, 0xd9d6e3, 0.0);
    for (let k = 0; k < 5; k++) {
      const b = -half + (k + 0.5) * ((half * 2) / 5);
      box(g, f, -0.8, 0.8, b - 0.9, b + 0.9, 0x1d1a2e);
      box(g, f, -0.5, 0.5, b - 0.6, b + 0.6, 0x5b1f28);
    }
  }

  // ---- paddock behind the garages, team motorhomes in team colours
  const lat0 = PIT_LATERAL * side;
  const placed: { x: number; y: number }[] = [];
  const tryPlace = (s: number, lats: number[], len: number, wid: number): { f: Frame; lat: number } | null => {
    for (const l of lats) {
      const f = frame(track, s, lat0 + side * l);
      let ok = true;
      for (const [da, db] of [[0, 0], [len / 2, wid / 2], [-len / 2, wid / 2], [len / 2, -wid / 2], [-len / 2, -wid / 2]]) {
        const x = f.x + f.ux * da + f.vx * db;
        const y = f.y + f.uy * da + f.vy * db;
        if (!free(x, y, 3)) ok = false;
      }
      if (ok && placed.every((p) => Math.hypot(p.x - f.x, p.y - f.y) > Math.max(len, wid) * 0.9)) {
        placed.push({ x: f.x, y: f.y });
        return { f, lat: l };
      }
    }
    return null;
  };
  teams.forEach((tm, idx) => {
    const s = track.boxS + idx * BOX_SPACING;
    const spot = tryPlace(s, [26, 34, 42, 50], 14, 8);
    if (!spot) return;
    const { f } = spot;
    box(g, f, -6.4, 7.4, -3.6, 4.4, 0x000000, 0.24); // shadow
    box(g, f, -7, 7, -4, 4, 0xf0ede4);
    box(g, f, -7, 7, -4, -2.4, tm.color);
    box(g, f, -7, 7, 3.2, 4, shade(tm.color, 0.7));
    box(g, f, -7, -6.2, -4, 4, shade(0xf0ede4, 0.8));
    // roof terrace and a flag
    box(g, f, -1, 5, -1.4, 1.6, 0xd2cec2);
    box(g, f, 5.6, 6.4, 3, 3.8, shade(tm.color, 1.15));
  });

  // ---- TV compound and a medical centre, a little further along the pit lane
  const tv = tryPlace(track.boxS + teams.length * BOX_SPACING + 30, [30, 40, 52], 40, 20);
  if (tv) {
    const { f } = tv;
    box(g, f, -19, 21, -9, 11, 0x000000, 0.22);
    box(g, f, -20, 20, -10, 10, 0x6f7384);
    for (let k = 0; k < 6; k++) {
      const a = -17 + k * 6.2;
      box(g, f, a, a + 5, -7, -1, 0xf4f1e8);
      box(g, f, a, a + 1.6, -7, -1, 0xd9d6e3);
      box(g, f, a, a + 5, 2, 8, k % 2 ? 0xf4f1e8 : 0xd9d6e3);
      // dishes
      const dx = px(f.x + f.ux * (a + 2.5) + f.vx * -4);
      const dy = px(f.y + f.uy * (a + 2.5) + f.vy * -4);
      g.circle(Math.round(dx), Math.round(dy), 1.4).fill(0xffffff);
    }
  }
  const med = tryPlace(track.boxS - 70, [30, 40], 16, 10);
  if (med) {
    const { f } = med;
    box(g, f, -7, 9, -4, 6, 0x000000, 0.22);
    box(g, f, -8, 8, -5, 5, 0xf4f1e8);
    box(g, f, -1.2, 1.2, -3.4, 3.4, 0xe63946);
    box(g, f, -3.4, 3.4, -1.2, 1.2, 0xe63946);
  }
  const heli = tryPlace(track.boxS + teams.length * BOX_SPACING + 90, [40, 54, 70], 24, 24);
  if (heli) {
    const { f } = heli;
    const cx = Math.round(px(f.x));
    const cy = Math.round(px(f.y));
    g.circle(cx + 1, cy + 1, 10).fill({ color: 0x000000, alpha: 0.2 });
    g.circle(cx, cy, 10).fill(0x7a7d8a);
    g.circle(cx, cy, 10).stroke({ width: 1, color: 0xf4f1e8 });
    g.rect(cx - 4, cy - 5, 2, 10).fill(0xf4f1e8);
    g.rect(cx + 2, cy - 5, 2, 10).fill(0xf4f1e8);
    g.rect(cx - 4, cy - 1, 8, 2).fill(0xf4f1e8);
  }

  // ---- pit entry and exit lines painted across the lane, pit wall mark
  {
    const f1 = frame(track, -track.pitIn + 60, lat0);
    box(g, f1, -0.3, 0.3, -4.2, 4.2, 0xe63946, 0.85);
    const f2 = frame(track, track.pitOut, lat0);
    box(g, f2, -0.3, 0.3, -4.2, 4.2, 0xe63946, 0.85);
  }
  void night;
  out.addChild(g);
  return out;
}
