import { Rng, hashSeed } from "../sim/rng";
import { CIRCUITS } from "../game/circuits";
import { clamp, round2 } from "./util";
import { AREAS, TRAITS } from "./types";
import type { Area, CareerState, Phil, TeamState, Trait } from "./types";

export { TRAITS };

/** Two traits under each area. The area's worth is their blend minus a price for a lopsided pair. */
export const AREA_TRAITS: Record<Area, [Trait, Trait]> = {
  aero: ["downforce", "efficiency"],
  chassis: ["grip", "platform"],
  power: ["output", "drive"],
  cooling: ["capacity", "packaging"],
  tyres: ["wear", "warmup"],
};
export const TRAIT_AREA: Record<Trait, Area> = Object.fromEntries(AREAS.flatMap((a) => AREA_TRAITS[a].map((t) => [t, a]))) as Record<Trait, Area>;

export const TRAIT_NAME: Record<Trait, string> = {
  downforce: "Downforce",
  efficiency: "Aero efficiency",
  grip: "Mechanical grip",
  platform: "Platform control",
  output: "Peak output",
  drive: "Drivability",
  capacity: "Cooling capacity",
  packaging: "Packaging",
  wear: "Tyre life",
  warmup: "Tyre warm-up",
};
export const TRAIT_BLURB: Record<Trait, string> = {
  downforce: "Cornering load. Wins slow and medium tracks.",
  efficiency: "Low drag for the downforce carried. Wins the long straights.",
  grip: "Mechanical grip from springs, geometry and weight. Works at every speed.",
  platform: "How steady the car stays on the bumps, kerbs and in the wind. Feeds the aero.",
  output: "Peak power and how long it lasts.",
  drive: "Torque delivery and energy deployment. Gets the power onto the road out of corners.",
  capacity: "Heat the car can shed. Decides how hard you can run the engine and how often it breaks.",
  packaging: "How tightly the car is wrapped. Lets the aero work but runs hotter.",
  wear: "How kind the car is to its tyres over a stint.",
  warmup: "How quickly the tyres reach their window after a stop or a restart.",
};
/** Which way each trait leans on the car's philosophy axis from low drag (-1) to downforce (+1). */
export const TRAIT_DF: Record<Trait, number> = { downforce: 1, efficiency: -1, grip: 0.5, platform: 0.2, output: -0.4, drive: -0.1, capacity: 0.3, packaging: -0.3, wear: -0.2, warmup: 0.3 };
/** How radical each trait's work is: new ideas on the risky ones. */
export const TRAIT_RISK: Record<Trait, number> = { downforce: 0.3, efficiency: 0.5, grip: -0.2, platform: 0.6, output: 0.3, drive: 0.5, capacity: -0.3, packaging: 0.6, wear: -0.4, warmup: 0.1 };

/** The price of a lopsided pair, per second of difference. */
export const IMB = 0.3;
/** A part's gain is on one trait; this turns the old area-sized figure into trait terms. */
export const TRAIT_GAIN_K = 2;

export const areaOfPair = (x: number, y: number) => (x + y) / 2 - IMB * Math.abs(x - y);

export function carFromDna(dna: Record<Trait, number>): Record<Area, number> {
  const out = {} as Record<Area, number>;
  for (const a of AREAS) out[a] = round2(areaOfPair(dna[AREA_TRAITS[a][0]], dna[AREA_TRAITS[a][1]]));
  return out;
}

/** Split an area rating into two traits that blend back to exactly that rating, with a team-specific lean. */
export function makeDna(car: Record<Area, number>, rng: Rng, spread = 0.12): Record<Trait, number> {
  const dna = {} as Record<Trait, number>;
  for (const a of AREAS) {
    const [x, y] = AREA_TRAITS[a];
    const d = rng.gauss() * spread;
    dna[x] = car[a] + d + 2 * IMB * Math.abs(d);
    dna[y] = car[a] - d + 2 * IMB * Math.abs(d);
  }
  return dna;
}

/** Recompute the area ratings (the cache everything else reads) from the traits. */
export function syncCar(t: TeamState) {
  const c = carFromDna(t.dna);
  for (const a of AREAS) t.car[a] = c[a];
}

export function addTrait(t: TeamState, tr: Trait, delta: number) {
  t.dna[tr] = round2(t.dna[tr] + delta);
  syncCar(t);
}

/** Move a whole area by `delta` seconds, keeping its balance. */
export function addArea(t: TeamState, a: Area, delta: number) {
  for (const tr of AREA_TRAITS[a]) t.dna[tr] = round2(t.dna[tr] + delta);
  syncCar(t);
}

/** Shift every trait of a team's car by a share of the way to a target area value. */
export function setArea(t: TeamState, a: Area, value: number) {
  addArea(t, a, value - t.car[a]);
}

/** The area that is furthest behind its own best, i.e. the one with the biggest imbalance cost. */
export function weakestTrait(t: TeamState, a: Area): Trait {
  const [x, y] = AREA_TRAITS[a];
  return t.dna[x] <= t.dna[y] ? x : y;
}

/** The regulations reward some traits more than others. Hidden truth, one number per trait, mean 1. */
export function newRegW(seed: number, key: string, spread = 0.6): Record<Trait, number> {
  const rng = new Rng(hashSeed(`regw:${seed}:${key}`));
  const w = {} as Record<Trait, number>;
  for (const tr of TRAITS) w[tr] = clamp(1 + rng.gauss() * spread, 0.25, 2.1);
  return normW(w);
}
function normW(w: Record<Trait, number>) {
  const m = TRAITS.reduce((a, tr) => a + w[tr], 0) / TRAITS.length;
  for (const tr of TRAITS) w[tr] = round2(w[tr] / m);
  return w;
}
/** Rule tweaks at the start of a season nudge the weights; a new era redraws them. */
export function driftRegW(s: CareerState, strength: number, key: string) {
  const fresh = newRegW(s.seed, `${key}:${s.year}`, 0.5);
  const w = { ...(s.regW ?? fresh) } as Record<Trait, number>;
  for (const tr of TRAITS) w[tr] = w[tr] + (fresh[tr] - w[tr]) * strength;
  s.regW = normW(w);
}

export interface TrackNeed {
  /** -1 power circuit (drag hurts) to +1 downforce circuit. */
  df: number;
  /** 1 is average tyre wear. */
  sev: number;
}
const DF_TABLE: Record<string, number> = {
  monaco: 1, "marina-bay": 0.8, hungaroring: 0.9, zandvoort: 0.6, suzuka: 0.5, barcelona: 0.5, mugello: 0.5, madring: 0.4, "albert-park": 0.1, shanghai: 0.1, interlagos: 0.2, "red-bull-ring": -0.2,
  silverstone: 0.3, miami: 0, cota: 0.2, mexico: 0.7, lusail: 0.3, "yas-marina": 0.1, bahrain: 0, imola: 0.4, montreal: -0.5, baku: -0.6, jeddah: -0.6, "las-vegas": -1, monza: -1, spa: -0.6,
};
export function trackNeed(circuitId: string): TrackNeed {
  const meta = CIRCUITS.find((c) => c.id === circuitId);
  const df = DF_TABLE[circuitId] ?? (new Rng(hashSeed(`df:${circuitId}`)).next() - 0.5);
  return { df, sev: meta?.tyreSeverity ?? 1 };
}

/** How much a trait is worth in seconds at this circuit under these rules, relative to the average trait. */
export function traitWeight(w: Record<Trait, number>, tr: Trait, need?: TrackNeed): number {
  const base = w[tr] ?? 1;
  if (!need) return base;
  const df = need.df;
  const sev = need.sev - 1;
  const f: Record<Trait, number> = {
    downforce: 1 + 0.4 * df,
    efficiency: 1 - 0.4 * df,
    grip: 1 + 0.1 * df,
    platform: 1,
    output: 1 - 0.15 * df,
    drive: 1 + 0.1 * df,
    capacity: 1,
    packaging: 1,
    wear: 1 + 0.9 * sev,
    warmup: 1 - 0.6 * sev,
  };
  return base * f[tr];
}

/** The worth of each area to the lap clock, given the rules and (optionally) the circuit. */
export function effCar(s: CareerState, t: TeamState, circuitId?: string): Record<Area, number> {
  const w = s.regW;
  const need = circuitId ? trackNeed(circuitId) : undefined;
  const out = {} as Record<Area, number>;
  for (const a of AREAS) {
    const [x, y] = AREA_TRAITS[a];
    if (!w && !need) {
      out[a] = t.car[a];
      continue;
    }
    const wx = traitWeight(w ?? ({} as Record<Trait, number>), x, need);
    const wy = traitWeight(w ?? ({} as Record<Trait, number>), y, need);
    const nx = (2 * wx) / (wx + wy);
    const ny = (2 * wy) / (wx + wy);
    // the pair's overall weight also counts: an area made of heavy traits is worth more than one made of light ones
    const sc = (wx + wy) / 2;
    out[a] = ((nx * t.dna[x] + ny * t.dna[y]) / 2 - IMB * Math.abs(t.dna[x] - t.dna[y])) * (0.3 + 0.7 * sc);
  }
  return out;
}

/** What one part is really worth on the clock: its trait gain in this regulation, as an area figure. */
export function partWorth(s: CareerState, tr: Trait, gain: number): number {
  const w = s.regW?.[tr] ?? 1;
  return gain * TRAIT_GAIN_K * 0.5 * (0.3 + 0.7 * w);
}

/** A concept that has no lean. */
export const neutralPhil = (): Phil => ({ df: 0, risk: 0, innov: 0 });

/** How well a part on this trait fits the concept's philosophy, 0..1. */
export function conceptFit(c: Phil, tr: Trait): number {
  const a = 1 - Math.abs(c.df - TRAIT_DF[tr]) / 2;
  const b = 1 - Math.abs(c.risk - TRAIT_RISK[tr]) / 2;
  return clamp(0.6 * a + 0.4 * b, 0, 1);
}


/**
 * A new car is built to its concept. The philosophy leans the traits: a downforce concept builds a car strong in downforce and weaker
 * in efficiency, a radical one swings harder either way. Leaning costs the lopsidedness price but pays off where the rules and the circuits agree.
 */
export function applyConcept(t: TeamState, rng: Rng, strength = 1) {
  const c = t.concept;
  for (const a of AREAS) {
    const [x, y] = AREA_TRAITS[a];
    const lean = (tr: Trait) => strength * (0.1 * c.df * TRAIT_DF[tr] + 0.05 * c.risk * TRAIT_RISK[tr]);
    const lx = lean(x);
    const ly = lean(y);
    const m = (lx + ly) / 2;
    const swing = (0.04 + 0.05 * Math.max(0, c.risk + 1)) * strength;
    t.dna[x] = round2(t.dna[x] + (lx - m) + rng.gauss() * swing);
    t.dna[y] = round2(t.dna[y] + (ly - m) + rng.gauss() * swing);
  }
  // inventive concepts sometimes find something nobody else has
  if (rng.chance(0.06 + 0.1 * Math.max(0, c.innov))) {
    const tr = TRAITS[Math.floor(rng.next() * TRAITS.length)];
    t.dna[tr] = round2(t.dna[tr] + 0.22);
  }
  syncCar(t);
}
