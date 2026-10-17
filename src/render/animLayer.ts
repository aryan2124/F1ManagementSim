import { Container, Graphics, Sprite, type Renderer, type Texture } from "pixi.js";
import { SCENES } from "../game/scenes.generated";
import { CLS, type LoadedScene } from "./sceneGround";
import type { TrackModel } from "../sim/track";

/**
 * The few things on a circuit that move: boats rocking on their moorings, sunlight glinting on the water and flags
 * on the grandstands. The ground itself is baked into textures, so this is the only per-frame scenery work, and it
 * touches only what is on screen: a handful of sprites and at most a few dozen 1 px rectangles.
 */

const MPP = 1.2;

interface Boat {
  sprite: Sprite;
  x: number;
  y: number;
  ang: number;
  phase: number;
  speed: number;
}

function hullTexture(renderer: Renderer, len: number, wid: number, cache: Map<string, Texture>, hull: number, deck: number): Texture {
  const key = `${len}x${wid}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const g = new Graphics();
  const L = Math.max(5, len);
  const W = Math.max(2, wid);
  // pointed bow on the right, flat stern on the left, drawn lying along the x axis
  const pts: number[] = [];
  const n = 8;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const hw = (W / 2) * (t < 0.62 ? 1 : Math.max(0.15, 1 - (t - 0.62) / 0.38));
    pts.push(Math.round(t * L), Math.round(W / 2 - hw));
  }
  for (let k = n; k >= 0; k--) {
    const t = k / n;
    const hw = (W / 2) * (t < 0.62 ? 1 : Math.max(0.15, 1 - (t - 0.62) / 0.38));
    pts.push(Math.round(t * L), Math.round(W / 2 + hw));
  }
  g.poly(pts).fill(0x000000); // a hard 1 px shadow edge
  g.poly(pts.map((v, i) => (i % 2 === 0 ? v : v))).fill(hull);
  g.rect(Math.round(L * 0.18), Math.round(W * 0.28), Math.max(1, Math.round(L * 0.5)), Math.max(1, Math.round(W * 0.44))).fill(deck);
  if (L > 12) g.rect(Math.round(L * 0.3), Math.round(W / 2) - 1, Math.max(2, Math.round(L * 0.16)), 2).fill(0x9aa4b8); // cabin
  const tex = renderer.generateTexture({ target: g, resolution: 1, antialias: false });
  tex.source.scaleMode = "nearest";
  g.destroy();
  cache.set(key, tex);
  return tex;
}

export interface FlagPole {
  x: number;
  y: number;
  color: number;
  phase: number;
}

export class AnimLayer {
  readonly container = new Container();
  private boats: Boat[] = [];
  private glints: { x: number; y: number; phase: number; period: number }[] = [];
  private flags: FlagPole[] = [];
  private fx = new Graphics();
  private textures = new Map<string, Texture>();
  private t = 0;
  private tint: number;

  constructor(renderer: Renderer, id: string, scene: LoadedScene | null, track: TrackModel, night: boolean, fanColours: number[]) {
    this.tint = night ? 0x7f89b0 : 0xffffff;
    this.container.addChild(this.fx);
    const meta = SCENES[id];
    if (scene && meta) {
      const hulls = [0xf4f1ea, 0xe9edf2, 0xdfe6ee, 0xf1e8d8];
      const decks = [0xc9a875, 0xb8c0cf, 0xe6e2d6];
      let k = 0;
      for (const [x, y, len, wid, ang] of meta.boats ?? []) {
        // keep only boats whose mooring is on, or right beside, water in the classified picture
        const cx = Math.floor((x - meta.x0) / meta.cell);
        const cy = Math.floor((y - meta.y0) / meta.cell);
        let wet = false;
        for (let dy = -2; dy <= 2 && !wet; dy++) for (let dx = -2; dx <= 2; dx++) {
          const ix = cx + dx, iy = cy + dy;
          if (ix >= 0 && iy >= 0 && ix < meta.w && iy < meta.h && scene.cls[iy * meta.w + ix] === CLS.water) { wet = true; break; }
        }
        if (!wet) continue;
        const l = Math.max(4, Math.round(len / MPP));
        const w = Math.max(2, Math.round(wid / MPP));
        const tex = hullTexture(renderer, l, w, this.textures, hulls[k % hulls.length], decks[k % decks.length]);
        const sp = new Sprite(tex);
        sp.anchor.set(0.5);
        sp.tint = this.tint;
        sp.visible = false;
        this.container.addChildAt(sp, 0);
        this.boats.push({ sprite: sp, x: x / MPP, y: y / MPP, ang, phase: (k * 2.399) % 6.283, speed: 0.7 + ((k * 7) % 5) * 0.12 });
        k++;
      }
      // glints: pick water cells, denser near the shore where the light is strongest
      let seed = 12345;
      const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
      const want = night ? 160 : 520;
      for (let tries = 0; tries < want * 40 && this.glints.length < want; tries++) {
        const ix = Math.floor(rnd() * meta.w);
        const iy = Math.floor(rnd() * meta.h);
        const i = iy * meta.w + ix;
        if (scene.cls[i] !== CLS.water || scene.shore[i] < 2) continue;
        this.glints.push({ x: (meta.x0 + (ix + rnd()) * meta.cell) / MPP, y: (meta.y0 + (iy + rnd()) * meta.cell) / MPP, phase: rnd() * 6.283, period: 1.6 + rnd() * 2.6 });
      }
      // flags on grandstands, planted at the corner nearest the road
      let f = 0;
      for (const st of meta.stands ?? []) {
        const [sx, sy, L, D, ang] = st;
        const ux = Math.cos(ang);
        const uy = Math.sin(ang);
        for (const sgn of [-1, 1]) {
          const cx = sx + ux * (L / 2) * sgn;
          const cy = sy + uy * (L / 2) * sgn;
          this.flags.push({ x: cx / MPP, y: cy / MPP - D * 0.0, color: fanColours[f % fanColours.length], phase: f * 1.7 });
          f++;
        }
      }
    }
    void track;
  }

  update(dt: number, camX: number, camY: number, viewW: number, viewH: number, wind: number) {
    this.t += dt;
    const t = this.t;
    const x0 = camX - viewW / 2 - 40;
    const x1 = camX + viewW / 2 + 40;
    const y0 = camY - viewH / 2 - 40;
    const y1 = camY + viewH / 2 + 40;
    for (const b of this.boats) {
      const vis = b.x > x0 && b.x < x1 && b.y > y0 && b.y < y1;
      b.sprite.visible = vis;
      if (!vis) continue;
      const s = Math.sin(t * b.speed + b.phase);
      b.sprite.x = Math.round(b.x + Math.sin(t * 0.5 + b.phase * 2) * 0.6);
      b.sprite.y = Math.round(b.y + (s > 0.35 ? 1 : s < -0.35 ? -1 : 0));
      b.sprite.rotation = b.ang + Math.round(Math.sin(t * 0.8 * b.speed + b.phase) * 3) * 0.012;
    }
    const g = this.fx;
    g.clear();
    for (const q of this.glints) {
      if (q.x < x0 || q.x > x1 || q.y < y0 || q.y > y1) continue;
      const ph = ((t / q.period + q.phase) % 1 + 1) % 1;
      if (ph > 0.14) continue;
      const a = ph < 0.05 ? 0.55 : ph < 0.1 ? 0.95 : 0.55;
      g.rect(Math.round(q.x), Math.round(q.y), ph > 0.04 && ph < 0.1 ? 2 : 1, 1).fill({ color: 0xffffff, alpha: a * (this.tint === 0xffffff ? 1 : 0.6) });
    }
    const gust = 0.6 + Math.min(1, Math.abs(wind) / 8) * 0.8;
    for (const f of this.flags) {
      if (f.x < x0 || f.x > x1 || f.y < y0 || f.y > y1) continue;
      const x = Math.round(f.x);
      const y = Math.round(f.y);
      g.rect(x, y - 9, 1, 10).fill(0xe8e4f4);
      const w = Math.sin(t * 4.2 * gust + f.phase);
      const seg = w > 0.3 ? 1 : w < -0.3 ? -1 : 0;
      g.rect(x + 1, y - 9, 2, 2).fill(f.color);
      g.rect(x + 3, y - 9 + (seg > 0 ? 0 : 1), 2, 2).fill(f.color);
      g.rect(x + 5, y - 9 + (seg > 0 ? 1 : seg < 0 ? 0 : 1), 1, 2).fill(f.color);
    }
  }

  destroy() {
    for (const t of this.textures.values()) t.destroy(true);
    this.container.destroy({ children: true });
  }
}
