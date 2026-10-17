import type { Weather } from "./weather";
import { STATE_RAIN } from "./weather";

/**
 * What a team THINKS the weather will do.
 *
 * Every team has its own radar and its own meteorologist. They all see the same sky, but each
 * reads it a little differently: a bias in how fast the front is moving, a bias in how hard it
 * will rain, and a blur that grows with lead time. Skill shrinks the errors; it never removes them.
 * The nowcast (the next minute or two) is close to the truth; 20 minutes out it is a real gamble.
 *
 * The radar picture, the forecast curve and the ETA all come from the same belief, so a team's
 * panels agree with each other even when they disagree with the sky.
 */

export interface RadarProfile {
  teamId: string;
  /** 0..1, higher = smaller errors. */
  skill: number;
  /** Fraction of the lead time by which the front is believed to be early (+) or late (-). */
  biasTime: number;
  /** Believed rain intensity is scaled by 1 + biasInt * 0.35. */
  biasInt: number;
  seed: number;
}

export interface ForecastPoint {
  /** Seconds from now. */
  lead: number;
  rain: number;
  lo: number;
  hi: number;
}

export interface Eta {
  kind: "arrives" | "clears" | "steady";
  /** Best estimate, seconds from now. */
  sec: number;
  /** Window in which it will probably happen. */
  lo: number;
  hi: number;
  /** Peak intensity expected in the next 10 minutes (arrives) or the intensity now (clears). */
  peak: number;
  /** 0..1 how sure the team is. */
  confidence: number;
}

function hash(n: number): number {
  let h = Math.imul(n | 0, 0x9e3779b1) ^ 0x85ebca6b;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Smooth 1D value noise in [-1, 1]. */
function vnoise(seed: number, x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash(seed * 7919 + i) * 2 - 1;
  const b = hash(seed * 7919 + i + 1) * 2 - 1;
  const s = f * f * (3 - 2 * f);
  return a + (b - a) * s;
}

function vnoise2(seed: number, x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const g = (a: number, b: number) => hash(seed * 31 + a * 73856093 + b * 19349663);
  const top = g(xi, yi) + (g(xi + 1, yi) - g(xi, yi)) * sx;
  const bot = g(xi, yi + 1) + (g(xi + 1, yi + 1) - g(xi, yi + 1)) * sx;
  return top + (bot - top) * sy;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export function makeProfile(teamId: string, skill: number, seed: number): RadarProfile {
  let h = 0;
  for (let i = 0; i < teamId.length; i++) h = (h * 31 + teamId.charCodeAt(i)) | 0;
  const k = Math.abs(h) % 9973;
  const spread = 1.3 - skill;
  return {
    teamId,
    skill,
    biasTime: (hash(k + seed) * 2 - 1) * 0.35 * spread,
    biasInt: (hash(k + seed + 17) * 2 - 1) * spread,
    seed: k + seed * 3,
  };
}

export class TeamRadar {
  /** Radar range in km. */
  readonly range = 32;

  constructor(
    readonly weather: Weather,
    readonly profile: RadarProfile,
  ) {}

  /** Believed rain intensity `lead` seconds after `now` (negative lead looks back, and is exact). */
  rain(now: number, lead: number): number {
    const w = this.weather;
    if (lead <= 0) return w.rainAt(now + lead);
    const p = this.profile;
    const spread = 1.3 - p.skill;
    const shift = p.biasTime * lead * 0.35 + vnoise(p.seed, lead / 300) * lead * 0.14 * spread;
    const blur = 12 + lead * 0.16;
    const t = now + lead + shift;
    const avg = (w.rainAt(t - blur) + 2 * w.rainAt(t) + w.rainAt(t + blur)) / 4;
    const ramp = clamp(lead / 600, 0, 1);
    const gain = 1 + p.biasInt * 0.35 * ramp + vnoise(p.seed + 1, lead / 420) * 0.16 * spread * ramp;
    // small drizzle cells fade out of the picture at long range
    const faint = lead > 900 && avg < 0.1 ? avg * 0.5 : avg;
    return clamp(faint * gain, 0, 1);
  }

  /** Believed uncertainty in intensity at this lead. */
  sigma(lead: number): number {
    return 0.03 + (Math.max(0, lead) / 60) * 0.0075 * (1.35 - this.profile.skill);
  }

  curve(now: number, horizon = 1800, step = 60): ForecastPoint[] {
    const out: ForecastPoint[] = [];
    for (let lead = 0; lead <= horizon; lead += step) {
      const r = this.rain(now, lead);
      const s = this.sigma(lead);
      out.push({ lead, rain: r, lo: clamp(r - s, 0, 1), hi: clamp(r + s, 0, 1) });
    }
    return out;
  }

  /** The headline call: when the rain is expected, or when it will stop. */
  eta(now: number): Eta {
    const nowRain = this.rain(now, 0);
    const wet = nowRain > 0.1;
    const horizon = 1800;
    let peak = nowRain;
    for (let lead = 0; lead <= horizon; lead += 30) {
      const r = this.rain(now, lead);
      if (!wet) {
        if (lead <= 600) peak = Math.max(peak, r);
        if (r > 0.12) {
          const unc = (0.08 + 0.22 * (1.3 - this.profile.skill)) * lead;
          return { kind: "arrives", sec: lead, lo: Math.max(0, lead - unc), hi: lead + unc, peak: Math.max(peak, r), confidence: clamp(1 - lead / 2400 - (1 - this.profile.skill) * 0.2, 0.2, 1) };
        }
      } else if (r < 0.05) {
        const unc = (0.08 + 0.22 * (1.3 - this.profile.skill)) * lead;
        return { kind: "clears", sec: lead, lo: Math.max(0, lead - unc), hi: lead + unc, peak: nowRain, confidence: clamp(1 - lead / 2400 - (1 - this.profile.skill) * 0.2, 0.2, 1) };
      }
    }
    return { kind: "steady", sec: horizon, lo: horizon, hi: horizon, peak: Math.max(peak, nowRain), confidence: 0.6 };
  }

  /**
   * A radar picture. Returns rows x cols intensities 0..1, west to east, north to south.
   * The front drifts from upwind towards the circuit at the centre.
   */
  field(now: number, cols: number, rows: number, offset = 0): Float32Array {
    const out = new Float32Array(cols * rows);
    const wx = this.weather;
    const dirx = Math.cos(wx.windDir);
    const diry = Math.sin(wx.windDir);
    const speed = 0.55 + 0.04 * wx.windAt(now); // km per minute
    const R = this.range;
    const n0 = vnoise2(this.profile.seed + 5, 0.3, 0.3);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x = ((i + 0.5) / cols - 0.5) * 2 * R;
        const y = ((j + 0.5) / rows - 0.5) * 2 * R;
        // distance upwind (positive = where the weather is coming from) and sideways
        const u = -(x * dirx + y * diry);
        const lat = -x * diry + y * dirx;
        const lead = (u / speed) * 60 + offset;
        const base = this.rain(now, lead);
        if (base < 0.02) continue;
        const width = 9 + 18 * base;
        const g = Math.exp(-((lat * lat) / (2 * width * width)) * 0.9);
        const nz = vnoise2(this.profile.seed + 5, x / 7 + (now + offset) / 260, y / 7);
        const mod = (0.7 + 0.6 * nz) / (0.7 + 0.6 * n0);
        out[j * cols + i] = clamp(base * (0.35 + 0.65 * g) * mod, 0, 1);
      }
    }
    return out;
  }
}

/** Worst weather state a given intensity maps to, for labels. */
export function intensityWord(r: number): string {
  if (r < 0.06) return "dry";
  if (r < (STATE_RAIN.drizzle + STATE_RAIN.showers) / 2) return "drizzle";
  if (r < (STATE_RAIN.showers + STATE_RAIN.steady) / 2) return "showers";
  if (r < (STATE_RAIN.steady + STATE_RAIN.heavy) / 2) return "steady rain";
  if (r < 0.92) return "heavy rain";
  return "storm";
}
