import { Rng, hashSeed } from "../sim/rng";
import { clamp, round2 } from "./util";
import type { AxisInfo, CareerState, DriverState, SetupVec, WeekendState } from "./types";

/**
 * The setup puzzle.
 *
 * Every circuit has a hidden best setup. Nothing on screen shows it. What the team can see is evidence:
 *  - lap times of runs, with noise (less on fresh tyres and with a good engineer),
 *  - what the drivers say, which is limited to their two biggest complaints and differs between the two of them because
 *    each driver has his own taste,
 *  - the engineers' simulator guess, which carries a built-in bias that no number of runs removes (it is a model, and the
 *    team's simulator is only as good as its correlation with the real track).
 * Axes interact (the right balance depends on how much downforce you run), and the qualifying trim buys one lap of pace at
 * the cost of tyre wear in the race, so the "best" setup is a compromise, not a point.
 */

export const TRIM = "trim";

/** How much each axis costs when it is wrong: some are steep, some forgiving. */
const STEEP: Record<string, number> = { balance: 1.0, downforce: 1.0, gearing: 0.8, brakes: 0.6 };
/** Balance wants to follow downforce: more wing moves the best balance rearward by this much per unit. */
const COUPLE_BALANCE_DF = 0.35;

export interface RunRec {
  n: number;
  /** Which practice session (1-based) and the programme. */
  session: number;
  programme: string;
  driverId: string;
  /** The setting used. */
  setup: SetupVec;
  fresh: boolean;
  /** Measured lap time against the first run of the weekend, seconds (negative is quicker). Null when there was nothing to time. */
  delta: number | null;
  /** The measured loss itself (the delta is this minus the first timed run's). */
  raw: number | null;
  /** Wet runs are noisier and say less about a dry setup. */
  wet: boolean;
}

export const trimOf = (setup: SetupVec) => clamp(setup[TRIM] ?? 0, -1, 1);

/** The best setting of an axis with the other settings taken into account. */
export function bestFor(ws: WeekendState, setup: SetupVec, axis: string): number {
  const sweet = ws.sweet[axis] ?? 0;
  if (axis === "balance") return sweet + COUPLE_BALANCE_DF * ((setup.downforce ?? 0) - (ws.sweet.downforce ?? 0));
  return sweet;
}

/** How far each axis is from where it should be for this driver (his own taste added) and these other settings. */
export function axisErrors(ws: WeekendState, setup: SetupVec, driver?: DriverState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const ax of ws.axes) out[ax.id] = (setup[ax.id] ?? 0) - (bestFor(ws, setup, ax.id) + (driver ? driverPref(driver, ax.id) : 0));
  return out;
}

/** A driver's taste: where he likes the car to sit away from what is fastest. Fixed for a driver, so it can be learnt. */
export function driverPref(d: DriverState, axis: string): number {
  const r = new Rng(hashSeed(`pref:${d.id}:${axis}`));
  const noise = r.gauss() * 0.14;
  const sp = d.spec;
  switch (axis) {
    case "balance":
      return clamp((sp.aggression - 0.5) * 0.45 + noise, -0.35, 0.35);
    case "downforce":
      return clamp((sp.consistency - 0.6) * 0.5 + noise * 0.6, -0.25, 0.25);
    case "brakes":
      return clamp((0.5 - sp.tyreMgmt) * 0.4 + noise, -0.3, 0.3);
    default:
      return clamp(noise, -0.2, 0.2);
  }
}

/** The setup a particular driver actually runs: the shared car plus his own offsets (each axis up to 0.4 either way). */
export function setupFor(ws: WeekendState, driverId: string, base: SetupVec = ws.setup): SetupVec {
  const tw = ws.tweak?.[driverId];
  if (!tw) return base;
  const out: SetupVec = { ...base };
  for (const k of Object.keys(tw)) out[k] = Math.max(-1, Math.min(1, (out[k] ?? 0) + tw[k]));
  return out;
}

/** How well the car suits a driver, 0 to 1. This is what really moves his confidence, not how many laps he has done. */
export function comfort(ws: WeekendState, setup: SetupVec, d: DriverState): number {
  const e = axisErrors(ws, setup, d);
  const ids = ws.axes.map((a) => a.id);
  if (!ids.length) return 0.6;
  const mean = ids.reduce((a, id) => a + Math.pow(Math.abs(e[id] ?? 0), 1.2) * (STEEP[id] ?? 0.7), 0) / ids.length;
  return clamp(1 - mean / 0.55, 0, 1);
}

/** What the team will actually have in the car's head at the session: familiarity from laps, a lot more from how well the car suits him. */
export function trueConfidence(ws: WeekendState, d: DriverState): number {
  const fam = clamp(ws.fam?.[d.id] ?? 0, 0, 1);
  return clamp(0.3 + 0.28 * fam + 0.42 * comfort(ws, setupFor(ws, d.id), d), 0.15, 0.97);
}

/** Setup quality in seconds per lap, for the evidence: what the wrong settings cost, as the sim will apply it (coupling included). */
export function lossFactors(ws: WeekendState, setup: SetupVec): { aero: number; power: number; tyre: number; consistency: number } {
  const e = axisErrors(ws, setup);
  const dfSign = (setup.downforce ?? 0) - (ws.sweet.downforce ?? 0);
  const ad = Math.abs(e.downforce ?? 0);
  const aero = (dfSign < 0 ? -0.0035 : -0.0008) * Math.pow(ad, 1.15) * (STEEP.downforce ?? 1);
  const df = (dfSign > 0 ? -0.0035 : -0.0008) * Math.pow(ad, 1.15) * (STEEP.downforce ?? 1);
  const r = {
    aero,
    power: df - 0.0022 * Math.pow(Math.abs(e.gearing ?? 0), 1.1) * (STEEP.gearing ?? 1),
    tyre: -0.1 * Math.abs(e.balance ?? 0) * (STEEP.balance ?? 1),
    consistency: -0.03 * Math.abs(e.brakes ?? 0) * (STEEP.brakes ?? 1),
  };
  for (const ax of ws.axes) {
    if (!ax.target) continue;
    const x = Math.abs(e[ax.id] ?? 0);
    if (ax.target === "aero") r.aero -= 0.0025 * x;
    else if (ax.target === "power") r.power -= 0.0025 * x;
    else if (ax.target === "tyre") r.tyre -= 0.07 * x;
    else r.consistency -= 0.02 * x;
  }
  return r;
}

/** The qualifying trim: positive buys a little one-lap pace and costs race tyres, negative the other way round. */
export function trimEffect(setup: SetupVec, kind: "quali" | "race"): { aero: number; tyre: number } {
  const t = trimOf(setup);
  if (kind === "quali") return { aero: 0.0016 * t, tyre: 0 };
  return { aero: -0.0005 * Math.max(0, t), tyre: t > 0 ? -0.06 * t : 0.03 * -t };
}

/** Lap time lost to the setup, seconds, as the evidence shows it (a run measures this plus noise). */
export function lapLossSecs(ws: WeekendState, setup: SetupVec, poleRef: number, driver?: DriverState, kind: "quali" | "race" = "quali"): number {
  const f = lossFactors(ws, setup);
  const tr = trimEffect(setup, kind);
  const aeroPower = -(f.aero + f.power) - tr.aero;
  const taste = driver ? (1 - comfort(ws, setup, driver)) * 0.0011 : 0;
  return Math.max(-0.05, (aeroPower + taste) * poleRef);
}

/** The noise on a timed run, seconds. */
export function runNoise(eng: number, fresh: boolean, wet: boolean, programme: string): number {
  const base = 0.07 * (1.35 - eng * 0.7) * (fresh ? 0.6 : 1) * (wet ? 1.9 : 1);
  return programme === "setup" ? base : base * 0.8;
}

const WORDS: Record<string, [string, string]> = {
  balance: ["The rear is nervous, I want the balance further forward.", "The front pushes wide, I want the balance further rearward."],
  downforce: ["We are draggy on the straights, take some downforce off.", "I am short of grip in the corners, give me more downforce."],
  gearing: ["Slow out of the slow corners, shorten the gearing.", "I run out of revs on the straight, lengthen the gearing."],
  brakes: ["The rear is unstable on turn in, brake bias forward.", "Locking the fronts, brake bias rearward."],
};

/**
 * What a driver says after a setup run. He reports what he FEELS (his own taste included, with some noise and sometimes the wrong way
 * round), and only the two things that bother him most. A driver who gives poor feedback is a trap: he may point the wrong way.
 */
export function driverComments(ws: WeekendState, setup: SetupVec, d: DriverState, eng: number, rng: Rng): string[] {
  const sk = clamp(d.spec.consistency * 0.7 + eng * 0.5, 0.3, 1);
  const sd = 0.2 * (1.5 - sk);
  const felt = ws.axes
    .map((ax) => {
      const e = (setup[ax.id] ?? 0) - (bestFor(ws, setup, ax.id) + driverPref(d, ax.id));
      let seen = e + rng.gauss() * sd;
      // a poor reporter sometimes gets the direction backwards
      if (Math.abs(e) > 0.15 && rng.chance(0.14 * (1 - sk))) seen = -seen;
      return { ax, seen };
    })
    .filter((x) => Math.abs(x.seen) > 0.12)
    .sort((a, b) => Math.abs(b.seen) - Math.abs(a.seen))
    .slice(0, 2);
  const name = d.spec.name.split(" ").slice(-1)[0];
  if (!felt.length) return [`${name}: the car feels good, nothing to complain about.`];
  return felt.map(({ ax, seen }) => {
    const mag = Math.abs(seen) > 0.5 ? "a lot" : Math.abs(seen) > 0.28 ? "quite a bit" : "a touch";
    const words = WORDS[ax.id]?.[seen > 0 ? 1 : 0] ?? `Move ${ax.label.toLowerCase()} toward ${seen > 0 ? ax.high : ax.low}.`;
    return `${name} (${ax.label}, ${mag}): ${words}`;
  });
}

/** What the engineers would try: the simulator's number with its built-in bias, and how far they trust it. */
export function engineersGuess(ws: WeekendState, axis: AxisInfo): { value: number; trust: string } {
  const k = ws.known[axis.id] ?? 0;
  const trust = k < 0.15 ? "a first guess from the simulator" : k < 0.5 ? "simulator, a little data" : k < 0.8 ? "simulator and several runs" : "simulator and a lot of data";
  return { value: ws.hint[axis.id] ?? 0, trust };
}

/** How much the simulator's picture is off, per axis. Set when the weekend starts. Better facilities mean a smaller bias. */
export function simBias(s: CareerState, axes: AxisInfo[], seed: number): SetupVec {
  const sim = s.teams[s.teamId].facilities.sim;
  const r = new Rng(hashSeed(`simbias:${seed}`));
  const spread = clamp(0.34 - 0.03 * sim, 0.1, 0.36);
  const out: SetupVec = {};
  for (const a of axes) out[a.id] = round2(r.gauss() * spread);
  return out;
}

/** One line for the table: what changed against the previous run. */
export function changeSummary(ws: WeekendState, setup: SetupVec, prev?: SetupVec): string {
  if (!prev) return "baseline";
  const diffs = [...ws.axes.map((a) => a.id), TRIM]
    .map((id) => ({ id, d: (setup[id] ?? 0) - (prev[id] ?? 0) }))
    .filter((x) => Math.abs(x.d) >= 0.04);
  if (!diffs.length) return "no change";
  const short: Record<string, string> = { balance: "BAL", downforce: "DF", gearing: "GEAR", brakes: "BRK", trim: "TRIM" };
  return diffs.map((x) => `${short[x.id] ?? x.id.toUpperCase()} ${x.d > 0 ? "+" : ""}${x.d.toFixed(2)}`).join(" ");
}
