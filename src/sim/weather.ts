import { Rng } from "./rng";
import type { Compound } from "./types";

/**
 * The weather the sim actually runs on (the truth).
 *
 * A seeded timeline of rain intensity, cloud, wind and temperature is built once, then the track
 * gets wet and dries per sector as the clock advances. Nothing here uses the race RNG, so turning
 * weather on or off never changes how the rest of the sim rolls its dice.
 *
 * Teams never see this directly. They see an imperfect forecast built from it (see radar.ts).
 */

export type WeatherState = "dry" | "cloud" | "drizzle" | "showers" | "steady" | "heavy" | "storm";

export const WEATHER_STATES: WeatherState[] = ["dry", "cloud", "drizzle", "showers", "steady", "heavy", "storm"];

/** Rain intensity 0..1 for each named state. */
export const STATE_RAIN: Record<WeatherState, number> = {
  dry: 0,
  cloud: 0,
  drizzle: 0.14,
  showers: 0.35,
  steady: 0.5,
  heavy: 0.8,
  storm: 1,
};

export const STATE_LABEL: Record<WeatherState, string> = {
  dry: "Dry",
  cloud: "Overcast",
  drizzle: "Light drizzle",
  showers: "Showers",
  steady: "Steady rain",
  heavy: "Heavy rain",
  storm: "Thunderstorm",
};

const NEXT: Record<WeatherState, [WeatherState, number][]> = {
  dry: [["dry", 0.5], ["cloud", 0.38], ["drizzle", 0.07], ["showers", 0.04], ["steady", 0.01]],
  cloud: [["dry", 0.42], ["cloud", 0.2], ["drizzle", 0.17], ["showers", 0.12], ["steady", 0.07], ["heavy", 0.02]],
  drizzle: [["dry", 0.1], ["cloud", 0.35], ["showers", 0.3], ["steady", 0.2], ["heavy", 0.05]],
  showers: [["cloud", 0.25], ["drizzle", 0.3], ["steady", 0.2], ["heavy", 0.15], ["storm", 0.1]],
  steady: [["cloud", 0.1], ["drizzle", 0.3], ["showers", 0.25], ["heavy", 0.25], ["storm", 0.1]],
  heavy: [["drizzle", 0.2], ["showers", 0.25], ["steady", 0.4], ["storm", 0.15]],
  storm: [["showers", 0.3], ["steady", 0.35], ["heavy", 0.35]],
};

function pickWeighted<T>(rng: Rng, items: [T, number][]): T {
  let total = 0;
  for (const [, w] of items) total += w;
  let r = rng.next() * total;
  for (const [v, w] of items) {
    r -= w;
    if (r <= 0) return v;
  }
  return items[items.length - 1][0];
}

/** How wet a surface settles at under steady rain of a given intensity. */
export function targetWetness(rain: number): number {
  const pts: [number, number][] = [[0, 0], [0.14, 0.22], [0.35, 0.5], [0.5, 0.68], [0.8, 0.92], [1, 1]];
  if (rain <= 0) return 0;
  for (let i = 1; i < pts.length; i++) {
    if (rain <= pts[i][0]) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return y0 + ((y1 - y0) * (rain - x0)) / (x1 - x0);
    }
  }
  return 1;
}

/** Wetness at which each tyre is at its best. */
const SWEET: Record<Compound, number> = { S: 0, M: 0, H: 0, I: 0.38, W: 0.78 };

/**
 * Pace lost, as a fraction of the dry lap speed, for a tyre on a surface of this wetness.
 * Slicks lose a lot as soon as it is damp, intermediates are best on a wet line, full wets need real water.
 */
export function wetLoss(compound: Compound, wetness: number): number {
  const w = Math.min(1, Math.max(0, wetness));
  switch (compound) {
    case "S":
    case "M":
    case "H": {
      const base = 0.3 * (1 - Math.exp(-w / 0.2)) + 0.5 * Math.max(0, w - 0.25);
      // harder compounds warm up worse, so they are slightly worse when damp
      const hard = compound === "H" ? 1.06 : compound === "M" ? 1.02 : 1;
      return Math.min(0.62, base * hard);
    }
    case "I":
      return w <= SWEET.I ? 0.085 + 0.06 * ((SWEET.I - w) / SWEET.I) : 0.085 + 0.8 * (w - SWEET.I);
    case "W":
      return w <= SWEET.W ? 0.2 + 0.3 * (SWEET.W - w) : 0.2 + 0.1 * (w - SWEET.W);
  }
}

/** Wear multiplier for a tyre that is on the wrong surface (inters cooking on a dry track, slicks in standing water). */
export function wetWearFactor(compound: Compound, wetness: number): number {
  if (compound === "I") return wetness < 0.12 ? 3.2 : wetness < 0.25 ? 1.8 : wetness > 0.7 ? 1.3 : 1;
  if (compound === "W") return wetness < 0.3 ? 4.5 : wetness < 0.5 ? 2.2 : 1;
  return wetness > 0.2 ? 0.7 : 1;
}

/** The compound that is actually quickest right now. */
export function bestCompoundFor(wetness: number, allowDry = true): Compound {
  const opts: Compound[] = allowDry ? ["M", "I", "W"] : ["I", "W"];
  let best = opts[0];
  let bl = Infinity;
  for (const c of opts) {
    const l = wetLoss(c, wetness);
    if (l < bl) {
      bl = l;
      best = c;
    }
  }
  return best;
}

export interface WeatherNow {
  state: WeatherState;
  rain: number;
  cloud: number;
  wind: number;
  windDir: number;
  airC: number;
  trackC: number;
  wet: [number, number, number];
  wetMean: number;
  /** True while lightning is in the air. */
  storm: boolean;
}

const STEP = 5; // seconds per timeline sample

/** What a place's weather is usually like. */
export interface Climate {
  /** Probability that rain falls during a given session. */
  rain: number;
  /** Air temperature range for a session day, Celsius. */
  air: [number, number];
  /** Typical wind range, m/s. */
  wind: [number, number];
  /** 0 = rain is mostly drizzle and showers, 1 = it tends to be heavy or stormy when it comes. */
  intensity: number;
  /** How often a dry session is overcast rather than sunny. */
  cloudy: number;
}

export const DEFAULT_CLIMATE: Climate = { rain: 0.2, air: [16, 28], wind: [1, 6], intensity: 0.4, cloudy: 0.35 };

export class Weather {
  readonly seed: number;
  readonly duration: number;
  /** Rain intensity 0..1 every STEP seconds. */
  readonly rainLine: Float32Array;
  readonly cloudLine: Float32Array;
  readonly stateLine: Uint8Array;
  readonly airBase: number;
  readonly windBase: number;
  readonly windDir: number;
  /** Per sector: seconds the rain arrives later than at sector 1, and how much heavier it falls. */
  readonly lag: [number, number, number];
  readonly mult: [number, number, number];
  wet: [number, number, number] = [0, 0, 0];
  t = 0;
  private rng: Rng;
  private flash = 0;
  private lastFlash = -999;
  private flashes: number[] = [];

  readonly climate: Climate;

  constructor(seed: number, durationSec: number, opts: { dry?: boolean; climate?: Climate } = {}) {
    this.climate = opts.climate ?? DEFAULT_CLIMATE;
    this.seed = seed;
    this.duration = durationSec + 2400; // the radar looks ahead, so the timeline runs past the end
    this.rng = new Rng(seed * 31 + 9001);
    const r = this.rng;
    const n = Math.ceil(this.duration / STEP) + 2;
    this.rainLine = new Float32Array(n);
    this.cloudLine = new Float32Array(n);
    this.stateLine = new Uint8Array(n);
    this.airBase = r.range(this.climate.air[0], this.climate.air[1]);
    this.windBase = r.range(this.climate.wind[0], this.climate.wind[1]);
    this.windDir = r.range(0, Math.PI * 2);
    const flip = r.chance(0.5) ? 1 : -1;
    this.lag = [0, flip * r.range(12, 30), flip * r.range(30, 60)];
    this.mult = [r.range(0.88, 1.12), r.range(0.88, 1.12), r.range(0.88, 1.12)];
    this.build(opts.dry === true);
  }

  private build(dry: boolean) {
    const r = this.rng;
    const C = this.climate;
    // first decide whether this session sees rain at all, then shape it
    const wet = !dry && r.chance(C.rain);
    const I = C.intensity;
    const rainy = (): WeatherState =>
      pickWeighted(r, [
        ["drizzle", 0.5 * (1 - I) + 0.15],
        ["showers", 0.35],
        ["steady", 0.2 + 0.1 * I],
        ["heavy", 0.05 + 0.3 * I],
        ["storm", 0.02 + 0.25 * I * I],
      ] as [WeatherState, number][]);
    const calmState = (): WeatherState => (r.chance(C.cloudy) ? "cloud" : "dry");
    const segs: { from: number; state: WeatherState }[] = [];
    let t = 0;
    let state: WeatherState;
    if (!wet) {
      state = calmState();
      segs.push({ from: 0, state });
      while (t < this.duration + 600) {
        t += r.range(25, 80) * 60;
        state = calmState();
        segs.push({ from: t, state });
      }
    } else {
      // rain is already falling at the start, or arrives somewhere in the session
      const startsWet = r.chance(0.4);
      const onset = startsWet ? 0 : r.range(240, 3000);
      state = startsWet ? rainy() : "cloud";
      segs.push({ from: 0, state });
      if (!startsWet) {
        state = rainy();
        segs.push({ from: onset, state });
        t = onset;
      }
      while (t < this.duration + 600) {
        const calm = state === "dry" || state === "cloud";
        t += (calm ? r.range(30, 80) : r.range(6, 24)) * 60;
        const next = pickWeighted(r, NEXT[state]);
        // after the main band of rain has passed, the day mostly stays dry
        state = (next === "dry" || next === "cloud") && r.chance(0.8) ? calmState() : next;
        segs.push({ from: t, state });
      }
    }
    const n = this.rainLine.length;
    // smooth the steps into ramps, then add slow wobble
    const wob = [r.range(0, 6.28), r.range(0, 6.28), r.range(0, 6.28)];
    let si = 0;
    const level = (i: number) => {
      const tt = i * STEP;
      while (si + 1 < segs.length && segs[si + 1].from <= tt) si++;
      return si;
    };
    const rainAt = (k: number) => STATE_RAIN[segs[k].state];
    for (let i = 0; i < n; i++) {
      const tt = i * STEP;
      si = 0;
      const k = level(i);
      const ramp = 180; // seconds to blend between two states
      let rain = rainAt(k);
      let cloud = segs[k].state === "dry" ? 0.15 : segs[k].state === "cloud" ? 0.6 : 0.6 + 0.4 * STATE_RAIN[segs[k].state];
      if (k + 1 < segs.length) {
        const toNext = segs[k + 1].from - tt;
        if (toNext < ramp) {
          const f = 1 - toNext / ramp;
          const sm = f * f * (3 - 2 * f);
          rain = rain + (rainAt(k + 1) - rain) * sm;
          const ns = segs[k + 1].state;
          const nc = ns === "dry" ? 0.15 : ns === "cloud" ? 0.6 : 0.6 + 0.4 * STATE_RAIN[ns];
          cloud = cloud + (nc - cloud) * sm;
        }
      }
      const w = 0.5 + 0.5 * Math.sin(tt / 140 + wob[0]) * Math.sin(tt / 331 + wob[1]);
      if (rain > 0.02) rain = Math.min(1, Math.max(0.02, rain * (0.8 + 0.4 * w)));
      this.rainLine[i] = rain;
      this.cloudLine[i] = Math.min(1, Math.max(0, cloud + 0.12 * Math.sin(tt / 420 + wob[2])));
      this.stateLine[i] = WEATHER_STATES.indexOf(segs[k].state);
    }
  }

  private idx(t: number): [number, number] {
    const x = Math.max(0, t) / STEP;
    const i = Math.min(this.rainLine.length - 2, Math.floor(x));
    return [i, x - i];
  }

  /** Truth rain intensity at a time. */
  rainAt(t: number): number {
    const [i, f] = this.idx(t);
    return this.rainLine[i] * (1 - f) + this.rainLine[i + 1] * f;
  }

  cloudAt(t: number): number {
    const [i, f] = this.idx(t);
    return this.cloudLine[i] * (1 - f) + this.cloudLine[i + 1] * f;
  }

  stateAt(t: number): WeatherState {
    const [i] = this.idx(t);
    return WEATHER_STATES[this.stateLine[i]];
  }

  /** Rain falling on one sector (0, 1, 2) at the given time. */
  rainSector(k: number, t: number): number {
    return Math.min(1, this.rainAt(t - this.lag[k]) * this.mult[k]);
  }

  /** Air temperature in Celsius. Rain cools the air. */
  airAt(t: number): number {
    let r = 0;
    for (let k = 0; k <= 4; k++) r += this.rainAt(t - k * 150);
    return this.airBase - 4.5 * Math.min(1, r / 3);
  }

  windAt(t: number): number {
    return this.windBase + 2.2 * Math.sin(t / 97 + this.seed) + 1.4 * Math.sin(t / 31) + 5 * Math.max(0, this.rainAt(t) - 0.85);
  }

  /** Start the track at a given wetness (for example, a damp track from earlier running). */
  seedWetness(w: number) {
    this.wet = [w, w, w];
  }

  /** Advance the weather clock. Call as often as you like; 0.5 s steps are plenty. */
  step(dt: number) {
    this.t += dt;
    const t = this.t;
    const air = this.airAt(t);
    const cloud = this.cloudAt(t);
    const sun = (1 - cloud) * 14;
    const wind = Math.max(0, this.windAt(t));
    for (let k = 0; k < 3; k++) {
      const rain = this.rainSector(k, t);
      const target = targetWetness(rain);
      const w = this.wet[k];
      if (target > w) {
        const tau = 55 + 140 * (1 - rain);
        this.wet[k] = w + (target - w) * (1 - Math.exp(-dt / tau));
      } else {
        // drying: faster when warm, sunny and windy
        const warm = Math.min(1.4, Math.max(0.35, (air + sun * 0.6) / 28));
        const rate = (1 / 1250) * warm * (1 + wind / 14) * (1.1 - 0.5 * cloud);
        this.wet[k] = Math.max(target, w - rate * dt);
      }
    }
    // lightning
    this.flash = Math.max(0, this.flash - dt);
    const r = this.rainAt(t);
    if (r > 0.82 && t - this.lastFlash > 2.5 && this.rng.chance(0.045 * dt)) {
      this.flash = 0.35;
      this.lastFlash = t;
      this.flashes.push(t);
    }
  }

  /** Lightning strikes since the last call. */
  drainFlashes(): number[] {
    const f = this.flashes;
    this.flashes = [];
    return f;
  }

  get flashing(): boolean {
    return this.flash > 0;
  }

  get mean(): number {
    return (this.wet[0] + this.wet[1] + this.wet[2]) / 3;
  }

  now(): WeatherNow {
    const t = this.t;
    const air = this.airAt(t);
    const cloud = this.cloudAt(t);
    const wm = this.mean;
    return {
      state: this.stateAt(t),
      rain: this.rainAt(t),
      cloud,
      wind: Math.max(0, this.windAt(t)),
      windDir: this.windDir,
      airC: air,
      trackC: air + (1 - cloud) * 16 * (1 - wm) - 2 * wm,
      wet: [...this.wet] as [number, number, number],
      wetMean: wm,
      storm: this.rainAt(t) > 0.82,
    };
  }
}

/** Calibration constant: how hard a given loss bites into the speed profile. */
export const WET_K = 0.72;

/**
 * Speed multiplier for a car on a surface of this wetness. Corners cost more than straights.
 * `wetSkill` is the driver's 0..1 skill in the wet (0.5 is average).
 */
export function wetSpeedFactor(compound: Compound, wetness: number, wetSkill: number, cornerWeight: number): number {
  const loss = wetLoss(compound, wetness) * (1.1 - 0.2 * wetSkill);
  return 1 - WET_K * loss * (0.35 + 0.65 * cornerWeight);
}

/** Braking capacity multiplier on a wet surface. */
export function wetBrakeFactor(compound: Compound, wetness: number): number {
  const loss = wetLoss(compound, wetness);
  return 1 - Math.min(0.5, loss * 1.1);
}

/** Build the weather for a session from its spec. */
export function makeWeather(spec: { seed: number; mode: "random" | "off"; climate?: Climate }, durationSec: number): Weather {
  return new Weather(spec.seed, durationSec, { dry: spec.mode === "off", climate: spec.climate });
}
