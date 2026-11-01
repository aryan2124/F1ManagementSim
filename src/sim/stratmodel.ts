import type { Compound } from "./types";
import { tempWearMul } from "./engine";

/**
 * How many stops the race calls for, and where: worked out from how long each compound lasts today.
 * "Today" is the track's tyre severity, the rules in force and the track temperature, so the same circuit can be a one stopper in the cool
 * and a two stopper in the heat, and a rule change that wears tyres harder shows up in the plan without anyone writing it down.
 * A strategist reads those numbers with an error that grows as skill falls, which is why weaker pit walls misjudge the tipping points.
 */

export type DryCompound = "S" | "M" | "H";

export interface TyreRead {
  laps: number;
  /** Laps each dry compound lasts at standard pace on a 38 C track with the severity already applied. */
  life: Record<DryCompound, number>;
  /** Track temperature in C. */
  trackC: number;
}

/**
 * How many stints of the race the tyres can cover in one go: the race length over the laps an average stint can run.
 * About 1.4 on an ordinary track, 2.0 and up on a hard one. Includes the heat.
 */
export function tyreStress(r: TyreRead): number {
  const m = r.life.M / tempWearMul("M", r.trackC);
  const h = r.life.H / tempWearMul("H", r.trackC);
  const stint = ((m + h) / 2) * 0.92;
  return r.laps / stint;
}

function noise(seed: number, k: number): number {
  let h = (seed * 374761393 + k * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** One stop while the race fits two stints, two stops while it fits three, and so on. */
export function stopsForStress(stress: number, laps: number): number {
  const stints = Math.max(1, Math.ceil(stress - 1e-9));
  return Math.max(laps <= 12 ? 0 : 1, Math.min(4, stints - 1));
}

export interface Plan {
  stops: number;
  /** The lap each stop is made on, in order. */
  laps: number[];
  compounds: DryCompound[];
  /** What the strategist believed the stress was (it may be off). */
  read: number;
}

/** The plan this strategist would draw up. `skill` 0..1: a weak one misreads the stress by up to about 20 percent. */
export function planStops(r: TyreRead, skill: number, noiseSeed: number, stopBias = 0): Plan {
  const err = 1 + (noise(noiseSeed, 1) - 0.5) * 2 * (1 - Math.max(0, Math.min(1, skill))) * 0.2;
  const read = tyreStress(r) * err + stopBias * 0.08;
  const stops = stopsForStress(read, r.laps);
  const stints = stops + 1;
  const len = r.laps / stints;
  const laps = Array.from({ length: stops }, (_, i) => Math.round(len * (i + 1)));
  // the softest compound that can run a stint of this length, with room to spare; the two compound rule is kept at the end
  const heat = (c: DryCompound) => r.life[c] / tempWearMul(c, r.trackC);
  const pick = (n: number): DryCompound => (["S", "M", "H"] as DryCompound[]).find((c) => heat(c) * 0.92 >= n) ?? "H";
  const comps = Array.from({ length: stints }, (_, i) => pick(Math.round(len * (i + 1)) - (i ? Math.round(len * i) : 0)));
  if (new Set(comps).size < 2) comps[comps.length - 1] = comps[0] === "H" ? "M" : "H";
  return { stops, laps, compounds: comps, read };
}

export type { Compound };
