import { speedFactor } from "./engine";
import type { RaceSim } from "./engine";
import type { CarState, Compound, StopRec } from "./types";

/**
 * The strategy rulebook. One place that knows what a pit stop is actually worth, so that the radio, the prompts and
 * the AI wall all talk from the same facts. If this says an undercut is not real, nobody on the radio calls it one.
 *
 * Real F1 logic it follows: a stop costs about 20 seconds, so an undercut only works when the rival's tyres are old
 * enough that fresh rubber gains more than the gap over the laps he stays out, and you rejoin in clear air. A stop in
 * the first laps is damage, a puncture or a gamble for a safety car. Nobody covers that.
 */

/** Time lost in the pits, in seconds. */
export function pitLossOf(sim: RaceSim): number {
  const T = sim.track;
  const lane = Math.max(150, T.length - T.pitOut + T.pitIn);
  return lane / 22 - lane / (T.length / T.nominalLap) + 2.6;
}

/** Seconds per lap that tyres `fresh` on car x gain over the tyres car y is wearing now. Negative: no gain. */
export function paceGain(sim: RaceSim, x: CarState, fresh: Compound, y: CarState): number {
  const N = sim.track.nominalLap;
  const f = speedFactor(x.entry, { compound: fresh, wear: 0 }, x.fuel, 1, 0.004, 1);
  const o = speedFactor(y.entry, { compound: y.tyre.compound, wear: y.tyre.wear }, y.fuel, 1, 0.004, 1);
  return N * (1 / o - 1 / f);
}

export type UndercutWhy = "real" | "early" | "fresh" | "late" | "small" | "traffic" | "wet";

export interface UndercutRead {
  real: boolean;
  why: UndercutWhy;
  /** Gap between the two cars before the stop, seconds. */
  gap: number;
  /** Seconds the fresh tyres gain per lap over the rival's worn ones. */
  perLap: number;
  /** Net seconds gained over the laps the rival stays out, after traffic on the rejoin. */
  value: number;
  /** Cars the stopper would rejoin behind, within two seconds of the rejoin point. */
  traffic: number;
  /** The rival's tyre age and wear, for showing the evidence. */
  rivalAge: number;
  rivalWear: number;
}

/** Laps the rival is assumed to stay out before he reacts. */
const STAY_OUT = 2;

/**
 * Is it a real undercut for car x (the one stopping, or who just stopped) on car y (the one he is trying to jump)?
 * `gap` is how far x was behind y before the stop. `fresh` is the compound x went onto.
 */
export function readUndercut(sim: RaceSim, x: CarState, y: CarState, fresh: Compound, gap: number): UndercutRead {
  const loss = pitLossOf(sim);
  const perLap = paceGain(sim, x, fresh, y);
  // cars the stopper would rejoin behind: close to where he comes out
  const rejoin = x.gapLeader + loss;
  let traffic = 0;
  for (const o of sim.order) {
    if (o.id === x.id || o.id === y.id || o.status === "dnf") continue;
    if (o.gapLeader >= rejoin - 2 && o.gapLeader <= rejoin + 0.3 && o.tyre.wear > 0.15) traffic++;
  }
  const value = perLap * STAY_OUT - Math.min(2, traffic) * 0.7;
  const base = { gap, perLap, value, traffic, rivalAge: y.tyre.ageLaps, rivalWear: y.tyre.wear };
  const remaining = sim.cfg.laps - Math.max(x.lap, y.lap);
  const wet = (c: Compound) => c === "I" || c === "W";
  if (wet(fresh) || wet(y.tyre.compound)) return { real: false, why: "wet", ...base };
  if (remaining < 6) return { real: false, why: "late", ...base };
  if (y.tyre.ageLaps < 5 || y.tyre.wear < 0.3) return { real: false, why: "fresh", ...base };
  if (perLap < 0.35) return { real: false, why: "small", ...base };
  if (traffic >= 2 && value < gap + 0.3) return { real: false, why: "traffic", ...base };
  if (value < gap + 0.3) return { real: false, why: "small", ...base };
  return { real: true, why: "real", ...base };
}

/** What a stop most likely was, from what the pit wall can see. */
export type StopKind = "damage" | "early" | "normal";

export function stopKind(rec: StopRec): StopKind {
  if (rec.hurt) return "damage";
  if (rec.lap <= 3 || (rec.ageBefore ?? 99) < 5) return "early";
  return "normal";
}

/** A short evidence line for a prompt, so the player can see why the call is on the table. */
export function evidence(r: UndercutRead): string[] {
  const out = [`His tyres: ${r.rivalAge} laps old, ${Math.round(r.rivalWear * 100)}% worn`, `Gap: ${r.gap.toFixed(1)}s`, `Fresh tyres gain ${r.perLap.toFixed(1)}s a lap`];
  out.push(r.real ? `Worth about +${Math.max(0, r.value - r.gap).toFixed(1)}s if he stays out ${STAY_OUT} laps` : "Not enough to jump him");
  if (r.traffic >= 2) out.push(`Rejoin behind ${r.traffic} cars`);
  return out;
}
