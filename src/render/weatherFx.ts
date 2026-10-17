import { Container, Graphics } from "pixi.js";
import type { Weather } from "../sim/weather";

interface Drop {
  x: number;
  y: number;
  z: number;
}
interface Splash {
  x: number;
  y: number;
  age: number;
}

/**
 * Screen space weather: rain streaks that lean with the wind, a cold tint when
 * the track is wet, cloud dimming, splashes, glints on the water and lightning.
 * Purely cosmetic and driven by the real weather state; it never touches the sim.
 */
export class WeatherFx {
  readonly container = new Container();
  private tint = new Graphics();
  private rain = new Graphics();
  private flash = new Graphics();
  private drops: Drop[] = [];
  private splashes: Splash[] = [];
  private bolt: { pts: [number, number][]; life: number } | null = null;
  private wasFlashing = false;
  private time = 0;

  constructor(
    private readonly w: number,
    private readonly h: number,
  ) {
    this.container.addChild(this.tint, this.rain, this.flash);
    for (let i = 0; i < 520; i++) this.drops.push({ x: Math.random() * w, y: Math.random() * h, z: 0.6 + Math.random() * 0.8 });
  }

  /** `sectorWet` is the wetness (0..1) under the followed car. */
  update(dt: number, wx: Weather | undefined, sectorWet: number, camDx: number, camDy: number) {
    this.time += dt;
    const tint = this.tint;
    const rain = this.rain;
    tint.clear();
    rain.clear();
    this.flash.clear();
    if (!wx) return;
    const n = wx.now();

    // cloud and wet track tint
    const dark = Math.min(0.42, n.cloud * 0.12 + n.rain * 0.28 + sectorWet * 0.1);
    if (dark > 0.01) tint.rect(0, 0, this.w, this.h).fill({ color: n.rain > 0.5 ? 0x0a1230 : 0x1a2440, alpha: dark });
    if (sectorWet > 0.12) tint.rect(0, 0, this.w, this.h).fill({ color: 0x4a78c8, alpha: Math.min(0.14, sectorWet * 0.16) });

    // glints on standing water
    if (sectorWet > 0.3) {
      const g = Math.floor(sectorWet * 26);
      for (let i = 0; i < g; i++) {
        const gx = (i * 97 + Math.floor(this.time * 3) * 31) % this.w;
        const gy = (i * 53 + Math.floor(this.time * 2) * 17) % this.h;
        rain.rect(gx, gy, 2, 1).fill({ color: 0xcfe4ff, alpha: 0.18 + 0.2 * Math.sin(this.time * 3 + i) ** 2 });
      }
    }

    // rain streaks
    const intensity = n.rain;
    const count = Math.floor(this.drops.length * Math.min(1, intensity * 1.15));
    const lean = Math.cos(wx.windDir) * n.wind * 2.2;
    const fall = 150 + intensity * 260;
    const len = 3 + intensity * 6;
    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i];
      d.x += (lean * d.z - camDx * 0.25) * dt;
      d.y += (fall * d.z - camDy * 0.25) * dt;
      if (d.y > this.h || d.x < -20 || d.x > this.w + 20) {
        if (this.splashes.length < 70 && Math.random() < 0.5) this.splashes.push({ x: Math.max(0, Math.min(this.w, d.x)), y: this.h * (0.2 + Math.random() * 0.8), age: 0 });
        d.y = -8;
        d.x = Math.random() * (this.w + 40) - 20;
      }
      if (i >= count) continue;
      const lx = (lean / fall) * len;
      rain.moveTo(Math.round(d.x), Math.round(d.y)).lineTo(Math.round(d.x + lx), Math.round(d.y + len * d.z));
    }
    rain.stroke({ width: 1, color: n.rain > 0.6 ? 0xb9cdf0 : 0xdce8ff, alpha: 0.35 + intensity * 0.35 });

    // splashes
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const s = this.splashes[i];
      s.age += dt;
      if (s.age > 0.25) {
        this.splashes.splice(i, 1);
        continue;
      }
      const r = 1 + Math.floor(s.age * 12);
      rain.rect(Math.round(s.x - r), Math.round(s.y), 1, 1).fill({ color: 0xdce8ff, alpha: 0.5 - s.age * 2 });
      rain.rect(Math.round(s.x + r), Math.round(s.y), 1, 1).fill({ color: 0xdce8ff, alpha: 0.5 - s.age * 2 });
    }

    // lightning
    const flashing = wx.flashing;
    if (flashing && !this.wasFlashing) {
      let x = 80 + Math.random() * (this.w - 160);
      const pts: [number, number][] = [[x, 0]];
      for (let y = 0; y < this.h; y += 28) {
        x += (Math.random() - 0.5) * 36;
        pts.push([x, y + 28]);
      }
      this.bolt = { pts, life: 0.22 };
    }
    this.wasFlashing = flashing;
    if (flashing) this.flash.rect(0, 0, this.w, this.h).fill({ color: 0xe8eeff, alpha: 0.55 });
    if (this.bolt) {
      this.bolt.life -= dt;
      if (this.bolt.life <= 0) this.bolt = null;
      else {
        const b = this.bolt.pts;
        this.flash.moveTo(b[0][0], b[0][1]);
        for (const p of b) this.flash.lineTo(Math.round(p[0]), Math.round(p[1]));
        this.flash.stroke({ width: 2, color: 0xffffff, alpha: 0.95 });
      }
    }
  }
}
