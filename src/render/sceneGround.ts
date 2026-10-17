import { Sprite, Texture } from "pixi.js";
import { SCENES, type SceneMeta } from "../game/scenes.generated";

/**
 * The ground of a circuit, drawn from a land-cover grid that was derived offline from a satellite picture of the
 * real place. The grid (4 m cells) says where the water, forest, fields, rooftops and tarmac are. This file turns
 * it into pixel art: every pixel is shaded from one light direction (top left), cast shadows fall down and right,
 * and the edges are broken up with a little noise so it reads as hand drawn rather than as a grid.
 * Everything here runs once at load; the result is baked into plain textures, so it costs nothing per frame.
 */

export const CLS = { none: 0, water: 1, tree: 2, grass: 3, dry: 4, building: 5, paved: 6, light: 7 } as const;

export interface LoadedScene {
  meta: SceneMeta;
  cls: Uint8Array;
  tint: Uint8Array; // r,g,b per cell
  /** Distance (in cells) from each water cell to the nearest land, 0 for land. Saturates at 255. */
  shore: Uint8Array;
  /** 0..255 local density of rooftops (box filtered), used to decide where to lay out city blocks. */
  built: Uint8Array;
  /** Distance in cells from each land cell to the nearest water (0 on water). */
  landShore: Uint8Array;
}

const BASE = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";

function loadImageData(url: string, timeoutMs = 15000): Promise<ImageData | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined" || typeof Image === "undefined") return resolve(null);
    const img = new Image();
    const timer = setTimeout(() => resolve(null), timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      try {
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0);
        resolve(ctx.getImageData(0, 0, c.width, c.height));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

export function hasScene(id: string): boolean {
  return !!SCENES[id];
}

export async function loadScene(id: string): Promise<LoadedScene | null> {
  const meta = SCENES[id];
  if (!meta) return null;
  const [c, t] = await Promise.all([loadImageData(`${BASE}scenes/${id}.cls.png`), loadImageData(`${BASE}scenes/${id}.tint.png`)]);
  if (!c || !t || c.width !== meta.w || c.height !== meta.h) return null;
  const n = meta.w * meta.h;
  const cls = new Uint8Array(n);
  const tint = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    cls[i] = c.data[i * 4];
    tint[i * 3] = t.data[i * 4];
    tint[i * 3 + 1] = t.data[i * 4 + 1];
    tint[i * 3 + 2] = t.data[i * 4 + 2];
  }
  return { meta, cls, tint, shore: shoreDistance(cls, meta.w, meta.h), landShore: shoreDistance(cls, meta.w, meta.h, true), built: builtDensity(cls, meta.w, meta.h, Math.max(3, Math.round(24 / meta.cell))) };
}

/** Box filtered share of rooftop cells within radius r cells, as 0..255. */
function builtDensity(cls: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Float32Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x < w + r; x++) {
      if (x + r < w && x + r >= 0) acc += cls[y * w + x + r] === CLS.building ? 1 : 0;
      if (x - r - 1 >= 0 && x - r - 1 < w) acc -= cls[y * w + x - r - 1] === CLS.building ? 1 : 0;
      if (x >= 0 && x < w) tmp[y * w + x] = acc / (2 * r + 1);
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y < h + r; y++) {
      if (y + r < h && y + r >= 0) acc += tmp[(y + r) * w + x];
      if (y - r - 1 >= 0 && y - r - 1 < h) acc -= tmp[(y - r - 1) * w + x];
      if (y >= 0 && y < h) out[y * w + x] = Math.round((acc / (2 * r + 1)) * 255);
    }
  }
  return out;
}

/** Two pass chamfer distance from every water cell to the nearest non-water cell. */
function shoreDistance(cls: Uint8Array, w: number, h: number, fromLand = false): Uint8Array {
  const INF = 255;
  const d = new Uint8Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = fromLand ? (cls[i] !== CLS.water && cls[i] !== 0 ? INF : 0) : cls[i] === CLS.water ? INF : 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 1);
      if (y > 0) v = Math.min(v, d[i - w] + 1);
      if (x > 0 && y > 0) v = Math.min(v, d[i - w - 1] + 1);
      if (x < w - 1 && y > 0) v = Math.min(v, d[i - w + 1] + 1);
      d[i] = Math.min(255, v);
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      let v = d[i];
      if (x < w - 1) v = Math.min(v, d[i + 1] + 1);
      if (y < h - 1) v = Math.min(v, d[i + w] + 1);
      if (x < w - 1 && y < h - 1) v = Math.min(v, d[i + w + 1] + 1);
      if (x > 0 && y < h - 1) v = Math.min(v, d[i + w - 1] + 1);
      d[i] = Math.min(255, v);
    }
  // cells outside the grid edge count as water-land boundary at the border only if they were land; leave as is
  return d;
}

export function classAtMetres(s: LoadedScene, X: number, Y: number): number {
  const { x0, y0, w, h, cell } = s.meta;
  const ix = Math.floor((X - x0) / cell);
  const iy = Math.floor((Y - y0) / cell);
  if (ix < 0 || iy < 0 || ix >= w || iy >= h) return 0;
  return s.cls[iy * w + ix];
}

// ------------------------------------------------------------------ noise tables

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tileable value noise, 128 x 128, values 0..255. `cells` is how many lattice cells fit across the tile. */
function blobTable(seed: number, cells: number, octave2 = 0.35): Uint8Array {
  const rnd = mulberry(seed);
  const mk = (n: number) => {
    const g = new Float32Array(n * n);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    return g;
  };
  const g1 = mk(cells);
  const c2 = cells * 2;
  const g2 = mk(c2);
  const out = new Uint8Array(128 * 128);
  const sample = (g: Float32Array, n: number, x: number, y: number) => {
    const fx = (x / 128) * n;
    const fy = (y / 128) * n;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = g[(y0 % n) * n + (x0 % n)];
    const b = g[(y0 % n) * n + ((x0 + 1) % n)];
    const c = g[((y0 + 1) % n) * n + (x0 % n)];
    const d = g[((y0 + 1) % n) * n + ((x0 + 1) % n)];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      const v = (sample(g1, cells, x, y) + octave2 * sample(g2, c2, x, y)) / (1 + octave2);
      out[y * 128 + x] = Math.max(0, Math.min(255, Math.round(v * 255)));
    }
  return out;
}

let ROUND: Uint8Array | null = null;
let PINE: Uint8Array | null = null;
let WARP: Float32Array | null = null;
function tables() {
  if (!ROUND) ROUND = blobTable(11, 18);
  if (!PINE) PINE = blobTable(23, 26, 0.5);
  if (!WARP) {
    const rnd = mulberry(77);
    WARP = new Float32Array(2 * 32 * 32);
    for (let i = 0; i < WARP.length; i++) WARP[i] = rnd() - 0.5;
  }
  return { ROUND: ROUND!, PINE: PINE!, WARP: WARP! };
}

const hash2 = (x: number, y: number): number => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// ------------------------------------------------------------------ colour helpers (packed 0xRRGGBB in, bytes out)

const rr = (c: number) => (c >> 16) & 255;
const gg = (c: number) => (c >> 8) & 255;
const bb = (c: number) => c & 255;
const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
const q = (v: number) => clamp(Math.round((v - 10) / 20) * 20 + 10);
function pack(r: number, g: number, b: number): number {
  return 0xff000000 | (clamp(b) << 16) | (clamp(g) << 8) | clamp(r);
}

export interface GroundTheme {
  ground: number;
  treeDark: number;
  treeLight: number;
  pine: boolean;
  night: boolean;
  /** Dense city: roofs come from a small palette, streets are flat grey. */
  urban?: boolean;
}

const WATER = [0x86d6dc, 0x56b4d6, 0x3f98cc, 0x3382bb, 0x2a6ba3];
const GRASS = 0x5b8f3c;
const DRY = 0xcdb98a;
const ASPHALT = 0x4b4e5b;
const CONCRETE = 0xb4b2bc;

const ROOFS = [0xc9755a, 0xb8644c, 0xd9a07a, 0xe6dccb, 0xd0c8b8, 0x9e9aae, 0xc7b08a, 0xa86a5c];
function roofColour(tr: number, tg: number, tb: number, ci: number, district: number): number {
  const lum = (tr + tg + tb) / 3;
  const chroma = tr - tb;
  // one colour family per neighbourhood, with a little variety from block to block
  const pick = (district * 0.7 + hash2(ci >> 1, ci >> 7) * 0.3) % 1;
  if (chroma > 34) return ROOFS[pick < 0.5 ? 0 : pick < 0.8 ? 1 : 2];
  if (chroma > 14) return ROOFS[pick < 0.4 ? 6 : pick < 0.7 ? 3 : 2];
  if (lum > 170) return ROOFS[pick < 0.5 ? 3 : pick < 0.8 ? 4 : 6];
  return ROOFS[pick < 0.3 ? 5 : pick < 0.6 ? 4 : pick < 0.8 ? 7 : 6];
}

export interface BakedGround {
  sprites: Sprite[];
  dispose: () => void;
}

/**
 * Renders the ground for the pixel rectangle `bounds` (world pixels, 1 px = mpp metres) as a set of tile sprites.
 */
export function bakeSceneGround(scene: LoadedScene, bounds: { minX: number; minY: number; maxX: number; maxY: number }, mpp: number, th: GroundTheme, TILE = 1024): BakedGround {
  const { ROUND, PINE, WARP } = tables();
  const blob = th.pine ? PINE : ROUND;
  const { x0, y0, w, h, cell } = scene.meta;
  const cls = scene.cls;
  const tint = scene.tint;
  const shore = scene.shore;
  const sprites: Sprite[] = [];
  const textures: Texture[] = [];
  const M = 8; // margin for neighbour lookups
  const S = TILE + M * 2;
  const C = new Uint8Array(S * S); // class per pixel
  const T = new Int32Array(S * S); // cell index per pixel (-1 outside)
  const K = new Uint8Array(S * S); // canopy bit
  const groundC = th.ground;
  const treeD = th.treeDark;
  const treeL = th.treeLight;
  const tx0 = Math.floor(bounds.minX / TILE) * TILE;
  const ty0 = Math.floor(bounds.minY / TILE) * TILE;
  const inv = mpp / cell;
  const ca = Math.cos(scene.meta.ang);
  const sa = Math.sin(scene.meta.ang);
  const ROWH = th.urban ? 30 : 24;
  const urbanCut = th.urban ? 96 : 130;

  for (let ty = ty0; ty < bounds.maxY; ty += TILE) {
    for (let tx = tx0; tx < bounds.maxX; tx += TILE) {
      // ---- pass 1: which class lives under every pixel (with organic edges)
      for (let j = 0; j < S; j++) {
        const py = ty + j - M;
        for (let i = 0; i < S; i++) {
          const px = tx + i - M;
          // domain warp: a slow wobble of up to ~3 px so cell edges never run in straight lines
          const wx = px / 14;
          const wy = py / 14;
          const ax = Math.floor(wx);
          const ay = Math.floor(wy);
          const fx = wx - ax;
          const fy = wy - ay;
          const i0 = (((ay % 32) + 32) % 32) * 32 + (((ax % 32) + 32) % 32);
          const i1 = (((ay % 32) + 32) % 32) * 32 + ((((ax + 1) % 32) + 32) % 32);
          const i2 = ((((ay + 1) % 32) + 32) % 32) * 32 + (((ax % 32) + 32) % 32);
          const i3 = ((((ay + 1) % 32) + 32) % 32) * 32 + ((((ax + 1) % 32) + 32) % 32);
          const ox = (WARP[i0] * (1 - fx) * (1 - fy) + WARP[i1] * fx * (1 - fy) + WARP[i2] * (1 - fx) * fy + WARP[i3] * fx * fy) * (2 + cell * 1.0);
          const oy = (WARP[1024 + i0] * (1 - fx) * (1 - fy) + WARP[1024 + i1] * fx * (1 - fy) + WARP[1024 + i2] * (1 - fx) * fy + WARP[1024 + i3] * fx * fy) * (2 + cell * 1.0);
          const cxm = ((px + ox) * mpp - x0) / cell;
          const cym = ((py + oy) * mpp - y0) / cell;
          void inv;
          const cxi = Math.floor(cxm);
          const cyi = Math.floor(cym);
          const idx = j * S + i;
          if (cxi < 0 || cyi < 0 || cxi >= w || cyi >= h) {
            C[idx] = 0;
            T[idx] = -1;
            K[idx] = 0;
          } else {
            let ci = cyi * w + cxi;
            let c = cls[ci];
            // man-made ground (roofs, car parks, concrete) keeps straight edges: only nature gets the wobbly outline
            {
              const ux = Math.floor((px * mpp - x0) / cell);
              const uy = Math.floor((py * mpp - y0) / cell);
              if (ux >= 0 && uy >= 0 && ux < w && uy < h) {
                const c0 = cls[uy * w + ux];
                if (c0 === CLS.paved || c0 === CLS.building || c0 === CLS.light || c === CLS.paved || c === CLS.building || c === CLS.light) {
                  c = c0;
                  ci = uy * w + ux;
                }
              }
            }
            C[idx] = c;
            T[idx] = ci;
            if (c === CLS.tree) {
              const b = blob[(py & 127) * 128 + (px & 127)];
              // darker (denser) forest in the satellite picture gets bigger crowns
              const lum = (tint[ci * 3] + tint[ci * 3 + 1] + tint[ci * 3 + 2]) / 3;
              K[idx] = b > (lum < 55 ? 100 : lum < 85 ? 118 : 134) ? 1 : 0;
            } else K[idx] = 0;
          }
        }
      }

      // ---- pass 2: colour
      const canvas = document.createElement("canvas");
      canvas.width = TILE;
      canvas.height = TILE;
      const ctx = canvas.getContext("2d")!;
      const img = ctx.createImageData(TILE, TILE);
      const out = new Uint32Array(img.data.buffer);
      for (let j = 0; j < TILE; j++) {
        const py = ty + j;
        for (let i = 0; i < TILE; i++) {
          const px = tx + i;
          const idx = (j + M) * S + (i + M);
          const c = C[idx];
          const ci = T[idx];
          const nz = hash2(px, py);
          let col: number;
          // ---- city blocks: where the picture is built up, lay out streets and roofs on a grid turned to the real street angle
          let blk = -1; // -1 none, else 0 street, 1 roof lit edge, 2 roof body, 3 roof shadow edge, 4 street shadow
          let blkRoof = 0;
          if (c !== CLS.water && ci >= 0 && scene.built[ci] > urbanCut) {
            const X = px * mpp;
            const Y = py * mpp;
            const u0 = X * ca + Y * sa;
            const v0 = -X * sa + Y * ca;
            const row = Math.floor(v0 / ROWH);
            const bw = (th.urban ? 24 : 18) + Math.floor(hash2(row, 3) * 5) * 5;
            const off = hash2(row, 9) * bw;
            const uu = u0 + off;
            const col2 = Math.floor(uu / bw);
            const lu = (uu - col2 * bw) / mpp; // pixels into the block
            const lv = (v0 - row * ROWH) / mpp;
            const sw = 5 / mpp;
            const bwp = bw / mpp;
            const rhp = ROWH / mpp;
            // sample the real land cover at the block centre
            const cuc = (col2 + 0.5) * bw - off;
            const cvc = (row + 0.5) * ROWH;
            const cX = cuc * ca - cvc * sa;
            const cY = cuc * sa + cvc * ca;
            const cxi = Math.floor((cX - x0) / cell);
            const cyi = Math.floor((cY - y0) / cell);
            if (cxi >= 0 && cyi >= 0 && cxi < w && cyi < h) {
              const cc = cyi * w + cxi;
              const dens = scene.built[cc];
              const cclass = cls[cc];
              if (dens > urbanCut && cclass === CLS.building && scene.landShore[cc] * cell > 16 && hash2(col2 * 31 + row, row * 7 + 1) > 0.1) {
                if (lu < sw || lv < sw) blk = lu >= bwp - 2 || lv >= rhp - 2 ? 4 : 0;
                else blk = lu < sw + 1.2 || lv < sw + 1.2 ? 1 : lu >= bwp - 2 || lv >= rhp - 2 ? 3 : 2;
                if (lu >= 0 && lu < 2.2 && lv >= 0) blk = lu < sw ? 4 : blk; // shadow thrown over the street by the block to the left
                blkRoof = cc;
              }
            }
          }
          if (blk >= 0) {
            const cc = blkRoof;
            const rc = roofColour(tint[cc * 3], tint[cc * 3 + 1], tint[cc * 3 + 2], cc, blob[((cc % w) >> 3 & 127) * 128 + (((cc / w) | 0) >> 3 & 127)] / 255);
            let f = 1;
            if (blk === 1) f = 1.2;
            else if (blk === 3) f = 0.62;
            else if (blk === 2) f = 0.98 + hash2(cc, 5) * 0.05;
            if (blk === 0 || blk === 4) {
              const s0 = blk === 4 ? 0.72 : 1;
              out[j * TILE + i] = pack(0x86 * s0, 0x82 * s0, 0x8e * s0);
            } else out[j * TILE + i] = pack(rr(rc) * f, gg(rc) * f, bb(rc) * f);
            continue;
          }
          let shade = 1;
          // cast shadows: trees and roofs throw a shadow down and to the right
          const shadowed = c !== CLS.tree && c !== CLS.water && c !== CLS.building && (K[idx - 3 * S - 3] === 1 || K[idx - 2 * S - 2] === 1 || C[idx - 2 * S - 2] === CLS.building || C[idx - 4 * S - 4] === CLS.building);
          if (shadowed) shade = 0.74;
          const tr = ci >= 0 ? tint[ci * 3] : 90;
          const tg = ci >= 0 ? tint[ci * 3 + 1] : 110;
          const tb = ci >= 0 ? tint[ci * 3 + 2] : 80;
          switch (c) {
            case CLS.water: {
              const d = shore[ci] + (nz - 0.5) * 1.6;
              const k = d < 0.7 ? 0 : d < 2.2 ? 1 : d < 5 ? 2 : d < 10 ? 3 : 4;
              let wc = WATER[k];
              // a few lighter ripple dashes, set in rows so they read as wind on the surface
              const rip = hash2((px >> 2) + ((py >> 1) * 7), py >> 1);
              if (rip > 0.965 && k > 0) wc = WATER[Math.max(0, k - 1)];
              else if (rip < 0.02 && k < 4) wc = WATER[k + 1];
              // foam where water meets land
              if (C[idx - 1] !== CLS.water || C[idx - S] !== CLS.water) wc = 0xe4f6fb;
              else if (C[idx + 1] !== CLS.water || C[idx + S] !== CLS.water) wc = WATER[Math.min(4, k + 1)];
              col = pack(rr(wc), gg(wc), bb(wc));
              break;
            }
            case CLS.tree: {
              if (K[idx]) {
                const b = blob[((py + 1) & 127) * 128 + ((px + 1) & 127)] - blob[((py - 1) & 127) * 128 + ((px - 1) & 127)];
                const base = b > 7 ? treeL : treeD;
                const v = b > 7 ? 1.08 : b < -7 ? 0.8 : 1;
                col = pack(rr(base) * v, gg(base) * v, bb(base) * v);
                if (!K[idx - 1] || !K[idx - S]) col = pack(rr(treeL) * 1.05, gg(treeL) * 1.1, bb(treeL) * 1.05); // lit rim on the top left of every crown
                if (nz > 0.93) col = pack(rr(treeL) * 1.2, gg(treeL) * 1.2, bb(treeL) * 1.15);
              } else {
                col = pack(rr(treeD) * 0.55, gg(treeD) * 0.62, bb(treeD) * 0.58);
              }
              break;
            }
            case CLS.grass: {
              let r = rr(GRASS) * 0.62 + tr * 0.38;
              let g = gg(GRASS) * 0.62 + tg * 0.38;
              let b = bb(GRASS) * 0.62 + tb * 0.38;
              if (nz > 0.965) {
                r *= 1.12;
                g *= 1.12;
                b *= 1.1;
              } else if (nz < 0.03) {
                r *= 0.9;
                g *= 0.9;
                b *= 0.9;
              }
              col = pack(q(r) * shade, q(g) * shade, q(b) * shade);
              break;
            }
            case CLS.dry: {
              if (th.urban) {
                const v = 1 + (nz - 0.5) * 0.05;
                col = pack(0xb4 * v * shade, 0xa8 * v * shade, 0x94 * v * shade);
                break;
              }
              let r = rr(DRY) * 0.55 + tr * 0.45;
              let g = gg(DRY) * 0.55 + tg * 0.45;
              let b = bb(DRY) * 0.55 + tb * 0.45;
              if (nz > 0.97) {
                r *= 1.08;
                g *= 1.08;
                b *= 1.05;
              } else if (nz < 0.025) {
                r *= 0.88;
                g *= 0.88;
                b *= 0.86;
              }
              col = pack(q(r) * shade, q(g) * shade, q(b) * shade);
              break;
            }
            case CLS.building: {
              if (th.urban) {
                // a rooftop cell that did not make it into a block is an open yard or a plaza
                col = pack(0xa8 * shade, 0xa0 * shade, 0x98 * shade);
                break;
              }
              // roof colour comes from the picture, pulled toward a muted palette so a whole city does not turn into noise
              const lum = (tr + tg + tb) / 3;
              let r = tr * 0.8 + lum * 0.2 + 12;
              let g = tg * 0.8 + lum * 0.2 + 10;
              let b = tb * 0.8 + lum * 0.2 + 12;
              const topLeft = C[idx - 1] !== CLS.building || C[idx - S] !== CLS.building;
              const botRight = C[idx + 1] !== CLS.building || C[idx + S] !== CLS.building;
              let f = 1;
              if (topLeft) f = 1.22;
              else if (botRight) f = 0.62;
              else {
                // roof tile lines, direction chosen per cell so neighbouring roofs differ
                const dirv = ci >= 0 ? (ci * 2654435761) >>> 31 : 0;
                if ((dirv ? px : py) % 5 === 0) f = 0.9;
              }
              col = pack(q(r * f), q(g * f), q(b * f));
              break;
            }
            case CLS.paved: {
              if (th.urban) {
                const v = 1 + (nz - 0.5) * 0.05;
                col = pack(0x84 * v * shade, 0x80 * v * shade, 0x8c * v * shade);
                break;
              }
              const v = 1 + (nz - 0.5) * 0.08;
              // wide open paving away from the road is a car park: lighter tarmac with painted bays, so it never reads as a pond
              const inner = C[idx - 4] === CLS.paved && C[idx + 4] === CLS.paved && C[idx - 4 * S] === CLS.paved && C[idx + 4 * S] === CLS.paved;
              if (inner) {
                const bay = ((-px * sa + py * ca) % 9 + 9) % 9;
                const bayc = (((px * ca + py * sa) % 5) + 5) % 5;
                let f = 1.32;
                if (bay < 1) f = 1.85;
                else if (bay >= 4 && bay < 5 && bayc < 1) f = 1.7;
                col = pack(q(rr(ASPHALT) * v * f) * shade, q(gg(ASPHALT) * v * f) * shade, q(bb(ASPHALT) * v * f) * shade);
                break;
              }
              col = pack(rr(ASPHALT) * v * shade, gg(ASPHALT) * v * shade, bb(ASPHALT) * v * shade);
              break;
            }
            case CLS.light: {
              const v = 1 + (nz - 0.5) * 0.07;
              col = pack(rr(CONCRETE) * v * shade, gg(CONCRETE) * v * shade, bb(CONCRETE) * v * shade);
              break;
            }
            default: {
              const v = nz > 0.97 ? 1.1 : nz < 0.03 ? 0.9 : 1;
              col = pack(rr(groundC) * v * shade, gg(groundC) * v * shade, bb(groundC) * v * shade);
            }
          }
          out[j * TILE + i] = col;
        }
      }
      ctx.putImageData(img, 0, 0);
      const tex = Texture.from(canvas);
      tex.source.scaleMode = "nearest";
      textures.push(tex);
      const sp = new Sprite(tex);
      sp.position.set(tx, ty);
      sprites.push(sp);
    }
  }
  return {
    sprites,
    dispose: () => {
      for (const t of textures) t.destroy(true);
    },
  };
}
