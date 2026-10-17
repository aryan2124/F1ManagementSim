import { Container, Graphics } from "pixi.js";
import { Rng } from "../sim/rng";
import type { TeamSpec } from "../sim/types";
import { sampleTrack, type TrackModel } from "../sim/track";
import { BOX_SPACING } from "../sim/engine";
import { buildVenue } from "./venueArt";
import { buildWeekend } from "./weekend";
import { city, fields, groundDetail, groves, infrastructure, type Ctx } from "./scenery";
import type { CircuitMeta, ThemeId } from "../game/circuits";
import { bakeSceneGround, classAtMetres, CLS, type LoadedScene } from "./sceneGround";

/** World metres per screen pixel. Smaller = more zoomed in. */
export const M_PER_PX = 1.2;
export const PIT_LATERAL = 24;

export const PAL = {
  grassA: 0x5b8f3c,
  grassB: 0x4f8035,
  grassC: 0x6aa044,
  flower1: 0xf4e9d0,
  flower2: 0xf9c74f,
  flower3: 0xe76f8a,
  treeD: 0x2d5a33,
  treeL: 0x3f7d45,
  treeShadow: 0x3a6b30,
  gravel: 0xcdb98a,
  asphalt: 0x3a3d4a,
  asphaltRubber: 0x31343f,
  line: 0xe9e6dc,
  kerbR: 0xe63946,
  kerbW: 0xf4f1e8,
  pit: 0x555a69,
  stand: 0x8b7bb8,
};

type TreeKind = "round" | "pine" | "palm" | "shrub" | "none";

interface ThemeSpec {
  ground: number;
  speckA: number;
  speckB: number;
  runoff: number;
  trees: TreeKind;
  treeCount: number;
  treeD: number;
  treeL: number;
  flowers: boolean;
  buildings: boolean;
  wall: boolean;
  night: boolean;
  water?: number;
}

const THEMES: Record<ThemeId, ThemeSpec> = {
  park: { ground: 0x5b8f3c, speckA: 0x4f8035, speckB: 0x6aa044, runoff: 0xcdb98a, trees: "round", treeCount: 700, treeD: 0x2d5a33, treeL: 0x3f7d45, flowers: true, buildings: false, wall: false, night: false, water: 0x3f8fc0 },
  plain: { ground: 0x6a9a45, speckA: 0x5d8c3c, speckB: 0x78a84e, runoff: 0xc9b98c, trees: "round", treeCount: 300, treeD: 0x2f6034, treeL: 0x447f48, flowers: true, buildings: false, wall: false, night: false },
  pine: { ground: 0x4a7a3a, speckA: 0x3f6b32, speckB: 0x588a45, runoff: 0xb9a77c, trees: "pine", treeCount: 900, treeD: 0x1f4a2e, treeL: 0x2f6a40, flowers: false, buildings: false, wall: false, night: false },
  alpine: { ground: 0x5f9a4a, speckA: 0x538a40, speckB: 0x74ad5c, runoff: 0xcdb98a, trees: "pine", treeCount: 600, treeD: 0x24503a, treeL: 0x367a52, flowers: true, buildings: false, wall: false, night: false },
  dry: { ground: 0xa89a58, speckA: 0x978a4c, speckB: 0xb8aa66, runoff: 0xd6c590, trees: "shrub", treeCount: 220, treeD: 0x6b6a35, treeL: 0x8a8a45, flowers: false, buildings: false, wall: false, night: false },
  desert: { ground: 0xd8b878, speckA: 0xc9a968, speckB: 0xe6c98a, runoff: 0xeed9a0, trees: "palm", treeCount: 90, treeD: 0x3f7d45, treeL: 0x57a05a, flowers: false, buildings: false, wall: false, night: false },
  desertNight: { ground: 0xd0b070, speckA: 0xc2a262, speckB: 0xdcc084, runoff: 0xeed9a0, trees: "palm", treeCount: 90, treeD: 0x3f7d45, treeL: 0x57a05a, flowers: false, buildings: false, wall: false, night: true },
  city: { ground: 0x8e8a96, speckA: 0x817d8b, speckB: 0x9b97a4, runoff: 0x8e8a96, trees: "none", treeCount: 0, treeD: 0, treeL: 0, flowers: false, buildings: true, wall: true, night: false, water: 0x3f8fc0 },
  cityNight: { ground: 0x7d7a88, speckA: 0x716e7c, speckB: 0x8a8795, runoff: 0x7d7a88, trees: "none", treeCount: 0, treeD: 0, treeL: 0, flowers: false, buildings: true, wall: true, night: true, water: 0x3f8fc0 },
  tropical: { ground: 0x4f9a4a, speckA: 0x438a40, speckB: 0x62ac58, runoff: 0xd6c590, trees: "palm", treeCount: 320, treeD: 0x2c7a40, treeL: 0x49a85a, flowers: true, buildings: false, wall: false, night: false },
  dunes: { ground: 0xd9c98e, speckA: 0xc9b77c, speckB: 0xe8dba4, runoff: 0xeadfae, trees: "shrub", treeCount: 200, treeD: 0x5e7a3a, treeL: 0x7a9a4c, flowers: false, buildings: false, wall: false, night: false, water: 0x3f8fc0 },
};

export function themeGround(id: ThemeId): number {
  return THEMES[id].ground;
}

export interface TrackArt {
  container: Container;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  ground: number;
}

const px = (m: number) => m / M_PER_PX;

function offsetPoint(track: TrackModel, s: number, lateral: number): { x: number; y: number } {
  const t = sampleTrack(track, s);
  const nx = Math.sin(t.heading);
  const ny = -Math.cos(t.heading);
  return { x: px(t.x + nx * lateral), y: px(t.y + ny * lateral) };
}

/**
 * Draws the world around a circuit. The layout itself is the real GPS centreline; everything around it
 * (ground, trees, buildings, water, lights) is chosen by the circuit's theme.
 */
export function buildTrackArt(track: TrackModel, teams: TeamSpec[], meta?: Pick<CircuitMeta, "theme" | "lake" | "sea"> & { id?: string; geoId?: string }, seed = 5, scene: LoadedScene | null = null): TrackArt {
  const rng = new Rng(seed);
  const T = THEMES[meta?.theme ?? "park"];
  const container = new Container();
  const n = track.n;
  const side = track.pitSide;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const cx = new Float64Array(n);
  const cy = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    cx[i] = px(track.x[i]);
    cy[i] = px(track.y[i]);
    minX = Math.min(minX, cx[i]);
    maxX = Math.max(maxX, cx[i]);
    minY = Math.min(minY, cy[i]);
    maxY = Math.max(maxY, cy[i]);
  }
  const pad = 380;
  const bounds = { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
  if (scene) {
    // never show past the edge of the photographed land: trim the world to the scene grid
    const m = scene.meta;
    // the photographed area is not always a full rectangle: find where there is real picture data
    let cx0 = m.w, cx1 = -1, cy0 = m.h, cy1 = -1;
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        if (scene.cls[y * m.w + x] === 0) continue;
        if (x < cx0) cx0 = x;
        if (x > cx1) cx1 = x;
        if (y < cy0) cy0 = y;
        if (y > cy1) cy1 = y;
      }
    }
    if (cx1 >= 0) {
      bounds.minX = Math.max(bounds.minX, px(m.x0 + cx0 * m.cell));
      bounds.minY = Math.max(bounds.minY, px(m.y0 + cy0 * m.cell));
      bounds.maxX = Math.min(bounds.maxX, px(m.x0 + (cx1 + 1) * m.cell));
      bounds.maxY = Math.min(bounds.maxY, px(m.y0 + (cy1 + 1) * m.cell));
    }
  }
  const W = bounds.maxX - bounds.minX;
  const H = bounds.maxY - bounds.minY;

  // spatial hash of centreline points for fast "is this spot clear of the road" checks
  const CELL = 64;
  const grid = new Map<number, number[]>();
  const key = (gx: number, gy: number) => gx * 100003 + gy;
  for (let i = 0; i < n; i++) {
    const k = key(Math.floor(cx[i] / CELL), Math.floor(cy[i] / CELL));
    const a = grid.get(k);
    if (a) a.push(i);
    else grid.set(k, [i]);
  }
  const distToTrack = (x: number, y: number, limit: number) => {
    const r = Math.ceil(limit / CELL);
    const gx = Math.floor(x / CELL);
    const gy = Math.floor(y / CELL);
    let best = Infinity;
    for (let a = -r; a <= r; a++)
      for (let b = -r; b <= r; b++) {
        const arr = grid.get(key(gx + a, gy + b));
        if (!arr) continue;
        for (const i of arr) {
          const d = Math.hypot(cx[i] - x, cy[i] - y);
          if (d < best) best = d;
        }
      }
    return best;
  };
  const farFromTrack = (x: number, y: number, minD: number) => distToTrack(x, y, minD) >= minD;

  // ---- ground
  const ground = new Graphics();
  ground.rect(bounds.minX, bounds.minY, W, H).fill(T.ground);
  container.addChild(ground);
  if (scene) {
    // the land around the circuit comes from a satellite derived grid (see sceneGround.ts)
    const baked = bakeSceneGround(scene, bounds, M_PER_PX, { ground: T.ground, treeDark: T.treeD || 0x2d5a33, treeLight: T.treeL || 0x3f7d45, pine: T.trees === "pine" || meta?.theme === "alpine", night: T.night, urban: T.buildings });
    for (const s of baked.sprites) container.addChild(s);
  }
  // shared context for the scenery helpers
  let lakeShape: { x: number; y: number; rx: number; ry: number } | null = null;
  const sceneCtx: Ctx = {
    rng,
    bounds,
    dist: (x, y, lim) => distToTrack(x, y, lim),
    inWater: (x, y, pad) => {
      if (T.water && meta?.sea && inSea(bounds, meta.sea, x, y, Math.min(W, H) * 0.35 + pad)) return true;
      if (lakeShape) {
        const dx = (x - lakeShape.x) / (lakeShape.rx + pad);
        const dy = (y - lakeShape.y) / (lakeShape.ry + pad);
        if (dx * dx + dy * dy < 1) return true;
      }
      return false;
    },
  };
  if (!scene) container.addChild(groundDetail(sceneCtx, T.ground, T.speckA, T.speckB));

  // ---- water (sea or infield lake), drawn before the road
  if (!scene && T.water && (meta?.sea || meta?.lake)) {
    const water = new Graphics();
    if (meta?.sea) {
      const t = meta.sea;
      const w = Math.min(W, H) * 0.35;
      if (t === "W") water.rect(bounds.minX, bounds.minY, w, H);
      if (t === "E") water.rect(bounds.maxX - w, bounds.minY, w, H);
      if (t === "N") water.rect(bounds.minX, bounds.minY, W, w);
      if (t === "S") water.rect(bounds.minX, bounds.maxY - w, W, w);
      water.fill(T.water);
    }
    if (meta?.lake) {
      // find the point deepest inside the loop and flood around it
      let best = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, d: 0 };
      for (let k = 0; k < 400; k++) {
        const x = minX + rng.next() * (maxX - minX);
        const y = minY + rng.next() * (maxY - minY);
        if (!insideLoop(cx, cy, x, y)) continue;
        const d = distToTrack(x, y, 200);
        if (d > best.d && d !== Infinity) best = { x, y, d };
      }
      const r = Math.max(10, Math.min(best.d - 18, 120));
      if (best.d > 30) {
        lakeShape = { x: best.x, y: best.y, rx: r * 1.2, ry: r * 0.8 };
        water.ellipse(best.x, best.y, r * 1.2, r * 0.8).fill(T.water);
        water.ellipse(best.x - r * 0.3, best.y - r * 0.2, r * 0.5, r * 0.25).fill({ color: 0xffffff, alpha: 0.18 });
      }
    }
    container.addChild(water);
  }

  if (!scene && T.flowers) {
    const flowers = new Graphics();
    for (let i = 0; i < 700; i++) {
      const x = Math.floor(bounds.minX + rng.next() * W);
      const y = Math.floor(bounds.minY + rng.next() * H);
      if (!farFromTrack(x, y, 24)) continue;
      flowers.rect(x, y, 1, 1).fill(rng.pick([PAL.flower1, PAL.flower2, PAL.flower3]));
    }
    container.addChild(flowers);
  }

  // ---- city streets run under the circuit
  let cityOut: ReturnType<typeof city> | null = null;
  if (!scene && T.buildings) {
    cityOut = city(sceneCtx, T.night, T.ground);
    container.addChild(cityOut.streets);
  }

  // ---- road layers
  const stroke = (g: Graphics, w: number, color: number, alpha = 1) => {
    g.moveTo(cx[0], cy[0]);
    for (let i = 1; i < n; i++) g.lineTo(cx[i], cy[i]);
    g.closePath();
    g.stroke({ width: w, color, join: "round", cap: "round", alpha });
  };
  const runoff = new Graphics();
  stroke(runoff, px(track.def.width) + (T.wall ? 6 : scene ? 7 : 15), T.runoff);
  container.addChild(runoff);

  if (T.wall) {
    // street circuits: barriers hug the asphalt
    const wall = new Graphics();
    for (const sd of [-1, 1]) {
      const first = offsetPoint(track, 0, sd * (track.def.width / 2 + 2.6));
      wall.moveTo(first.x, first.y);
      for (let i = 1; i < n; i++) {
        const p = offsetPoint(track, i * track.ds, sd * (track.def.width / 2 + 2.6));
        wall.lineTo(p.x, p.y);
      }
      wall.closePath();
    }
    wall.stroke({ width: 2, color: 0xd9d6e3 });
    container.addChild(wall);
    const wallRed = new Graphics();
    for (let i = 0; i < n; i += 14) {
      for (const sd of [-1, 1]) {
        const p = offsetPoint(track, i * track.ds, sd * (track.def.width / 2 + 2.6));
        wallRed.rect(Math.round(p.x), Math.round(p.y), 2, 2).fill(i % 28 === 0 ? PAL.kerbR : 0x2a2540);
      }
    }
    container.addChild(wallRed);
  } else {
    const kerbs = new Graphics();
    for (let i = 0; i < n; i += 2) {
      if (Math.abs(track.curv[i]) < 0.0032) continue;
      const col = (i / 2) % 2 === 0 ? PAL.kerbR : PAL.kerbW;
      for (const sd of [-1, 1]) {
        const p = offsetPoint(track, i * track.ds, sd * (track.def.width / 2 + 0.8));
        kerbs.rect(Math.round(p.x) - 1, Math.round(p.y) - 1, 2, 2).fill(col);
      }
    }
    container.addChild(kerbs);
  }

  const road = new Graphics();
  stroke(road, px(track.def.width) + 1, PAL.asphalt);
  container.addChild(road);
  const rubber = new Graphics();
  stroke(rubber, 3, PAL.asphaltRubber);
  container.addChild(rubber);

  const edges = new Graphics();
  for (const sd of [-1, 1]) {
    const first = offsetPoint(track, 0, sd * (track.def.width / 2 - 0.4));
    edges.moveTo(first.x, first.y);
    for (let i = 1; i < n; i++) {
      const p = offsetPoint(track, i * track.ds, sd * (track.def.width / 2 - 0.4));
      edges.lineTo(p.x, p.y);
    }
    edges.closePath();
  }
  edges.stroke({ width: 1, color: PAL.line, alpha: 0.85 });
  container.addChild(edges);

  // ---- pit lane + garages, on the side that has room
  const pit = new Graphics();
  const lat = PIT_LATERAL * side;
  const sA = -track.pitIn + 60;
  const sB = track.pitOut;
  const steps = Math.ceil((sB - sA) / track.ds);
  const lane = (l: number) => {
    const p0 = offsetPoint(track, sA, l);
    pit.moveTo(p0.x, p0.y);
    for (let k = 1; k <= steps; k++) {
      const p = offsetPoint(track, sA + k * track.ds, l);
      pit.lineTo(p.x, p.y);
    }
  };
  lane(lat);
  pit.stroke({ width: px(8), color: PAL.pit, join: "round", cap: "butt" });
  lane(lat - 4.2 * side);
  pit.stroke({ width: 1, color: PAL.line, alpha: 0.7 });
  const entryA = offsetPoint(track, sA - 30, 8 * side);
  const entryB = offsetPoint(track, sA, lat);
  pit.moveTo(entryA.x, entryA.y).lineTo(entryB.x, entryB.y).stroke({ width: px(8), color: PAL.pit, cap: "butt" });
  const exitA = offsetPoint(track, sB, lat);
  const exitB = offsetPoint(track, sB + 40, 8 * side);
  pit.moveTo(exitA.x, exitA.y).lineTo(exitB.x, exitB.y).stroke({ width: px(8), color: PAL.pit, cap: "butt" });
  container.addChild(pit);

  const garages = new Graphics();
  teams.forEach((tm, idx) => {
    const s = track.boxS + idx * BOX_SPACING;
    const t = sampleTrack(track, s);
    const p = offsetPoint(track, s, lat + 9 * side);
    const m = offsetPoint(track, s, lat);
    const gx = Math.round(p.x);
    const gy = Math.round(p.y);
    // a block aligned with the lane: draw as a rotated rectangle via its four corners
    const ux = Math.cos(t.heading);
    const uy = Math.sin(t.heading);
    const vx = -uy;
    const vy = ux;
    const corner = (a: number, b: number) => [gx + ux * a + vx * b, gy + uy * a + vy * b];
    const quad = (a0: number, a1: number, b0: number, b1: number, color: number) => {
      const c = [corner(a0, b0), corner(a1, b0), corner(a1, b1), corner(a0, b1)].flat();
      garages.poly(c).fill(color);
    };
    quad(-5, 5, -4, 4, 0x2a2540);
    quad(-5, 5, side > 0 ? -4 : 2, side > 0 ? -2 : 4, tm.color);
    garages.rect(Math.round(m.x) - 1, Math.round(m.y) - 1, 2, 2).fill(tm.color);
  });
  container.addChild(garages);

  // ---- grandstand opposite the pit lane
  const stand = new Graphics();
  for (let k = 0; k < 14; k++) {
    const s = -260 + k * 22;
    const p = offsetPoint(track, s, -side * (track.def.width / 2 + 22));
    stand.rect(Math.round(p.x) - 9, Math.round(p.y) - 4, 18, 8).fill(PAL.stand);
    stand.rect(Math.round(p.x) - 9, Math.round(p.y) - 4, 18, 1).fill(0xb9a9e8);
    for (let d = 0; d < 6; d++) {
      const col = rng.pick([0xe63946, 0xf9c74f, 0x4cc9f0, 0xf4e9d0, 0x57cc99]);
      stand.rect(Math.round(p.x) - 8 + d * 3, Math.round(p.y) - 2 + (d % 2) * 3, 1, 1).fill(col);
    }
  }
  container.addChild(stand);

  // ---- start / finish chequer
  const chequer = new Graphics();
  const a = sampleTrack(track, 0);
  const half = Math.floor(px(track.def.width) / 2);
  for (let r = -half; r < half; r += 2) {
    for (let c = 0; c < 2; c++) chequer.rect(c * 2, r, 2, 2).fill(((r / 2 + c) & 1) === 0 ? 0xffffff : 0x111111);
  }
  chequer.position.set(px(a.x) - 2, px(a.y));
  chequer.rotation = a.heading;
  container.addChild(chequer);

  // ---- scenery
  const away = (x: number, y: number, minD: number) => {
    if (!farFromTrack(x, y, minD)) return false;
    return true;
  };
  const scatter = (count: number, minD: number, maxD: number): { x: number; y: number }[] => {
    const out: { x: number; y: number }[] = [];
    const taken = new Set<number>();
    for (let tries = 0; tries < count * 6 && out.length < count; tries++) {
      const i = Math.floor(rng.next() * n);
      const ang = rng.next() * Math.PI * 2;
      const d = minD + rng.next() * (maxD - minD);
      const x = cx[i] + Math.cos(ang) * d;
      const y = cy[i] + Math.sin(ang) * d;
      if (!away(x, y, minD)) continue;
      const kk = key(Math.floor(x / 9), Math.floor(y / 9));
      if (taken.has(kk)) continue;
      taken.add(kk);
      if (T.water && meta?.sea && inSea(bounds, meta.sea, x, y, Math.min(W, H) * 0.35)) continue;
      out.push({ x, y });
    }
    return out.sort((p, q) => p.y - q.y);
  };

  if (!scene && !T.buildings && /^(park|plain|alpine)$/.test(meta?.theme ?? "")) container.addChild(fields(sceneCtx, 10));

  if (!scene && T.trees !== "none" && T.treeCount > 0) {
    if (T.trees === "round" || T.trees === "pine") {
      const [sh, cr] = groves(sceneCtx, T.treeCount, { kind: T.trees, dark: T.treeD, light: T.treeL }, 42, 280, (i) => ({ x: cx[i], y: cy[i] }), n);
      container.addChild(sh);
      container.addChild(cr);
    } else {
      const spots = scatter(T.treeCount, 46, 260);
      const crowns = new Graphics();
      for (const t of spots) {
        const x = Math.round(t.x);
        const y = Math.round(t.y);
        if (T.trees === "palm") {
          crowns.ellipse(x + 3, y + 3, 4, 2).fill({ color: 0x000000, alpha: 0.2 });
          crowns.rect(x, y - 2, 1, 4).fill(0x8a6a3a);
          for (const [dx, dy] of [[-3, -3], [3, -3], [0, -5], [-2, -1], [2, -1]]) crowns.rect(x + dx, y - 3 + dy + 2, 3, 1).fill(T.treeL);
          crowns.rect(x - 1, y - 4, 3, 2).fill(T.treeD);
        } else {
          crowns.circle(x, y, 2).fill(T.treeD);
          crowns.rect(x - 1, y - 1, 2, 1).fill(T.treeL);
        }
      }
      container.addChild(crowns);
    }
  }

  if (!scene && !T.buildings) {
    const nearStart = (k: number) => {
      const i = Math.floor((k - 0.5) * 0.3 * n + n) % n;
      return { x: cx[i], y: cy[i] };
    };
    const anywhere = (k: number) => {
      const i = Math.floor(k * n) % n;
      return { x: cx[i], y: cy[i] };
    };
    const nearestTrack = (x: number, y: number) => {
      let bi = 0;
      let bd = Infinity;
      for (let i = 0; i < n; i += 3) {
        const d = (cx[i] - x) ** 2 + (cy[i] - y) ** 2;
        if (d < bd) {
          bd = d;
          bi = i;
        }
      }
      return { x: cx[bi], y: cy[bi] };
    };
    container.addChild(infrastructure(sceneCtx, nearStart, anywhere, nearestTrack));
  }

  if (cityOut) {
    container.addChild(cityOut.blocks);
    container.addChild(cityOut.lights);
  }

  // ---- race weekend set up: grid boxes, gantry, motorhomes, TV compound, medical centre, helipad
  {
    const freeSpot = (x: number, y: number, r: number) => {
      if (distToTrack(x, y, 12) < 12) return false;
      if (!scene) return true;
      for (const [dx, dy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
        const c = classAtMetres(scene, x + dx, y + dy);
        if (c === CLS.water || c === CLS.tree) return false;
      }
      return true;
    };
    container.addChild(buildWeekend(track, teams, freeSpot, !!T.night));
  }

  // ---- venue: stands, boards, marshals, landmarks
  container.addChild(buildVenue(track, meta?.id ?? "", rng, (x, y, lim) => distToTrack(x, y, lim), !!T.night, meta?.geoId));

  // ---- night: darken the world, then light the road
  if (T.night) {
    const dark = new Graphics();
    dark.rect(bounds.minX, bounds.minY, W, H).fill({ color: 0x0a0a30, alpha: 0.46 });
    container.addChild(dark);
    const glow = new Graphics();
    for (let i = 0; i < n; i += 9) {
      for (const sd of [-1, 1]) {
        const p = offsetPoint(track, i * track.ds, sd * (track.def.width / 2 + 7));
        glow.circle(Math.round(p.x), Math.round(p.y), 9).fill({ color: 0xffe9a0, alpha: 0.09 });
        glow.circle(Math.round(p.x), Math.round(p.y), 4).fill({ color: 0xffe9a0, alpha: 0.18 });
        glow.rect(Math.round(p.x), Math.round(p.y), 1, 1).fill(0xfff6d0);
      }
    }
    container.addChild(glow);
  }

  return { container, bounds, ground: T.ground };
}

function inSea(b: { minX: number; minY: number; maxX: number; maxY: number }, side: "W" | "E" | "N" | "S", x: number, y: number, w: number) {
  if (side === "W") return x < b.minX + w;
  if (side === "E") return x > b.maxX - w;
  if (side === "N") return y < b.minY + w;
  return y > b.maxY - w;
}

function insideLoop(xs: Float64Array, ys: Float64Array, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = xs.length - 1; i < xs.length; j = i++) {
    if (ys[i] > y !== ys[j] > y && x < ((xs[j] - xs[i]) * (y - ys[i])) / (ys[j] - ys[i]) + xs[i]) inside = !inside;
  }
  return inside;
}
