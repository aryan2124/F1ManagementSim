import { hashSeed } from "../sim/rng";
import type { DriverState } from "./types";

/**
 * Racing attributes, one to twenty, grouped the way a football manager groups them. They are read from the ratings the
 * simulator already uses (pace, tyre care, consistency, wet, aggression, character) plus a steady personal wobble per
 * driver, so two drivers with the same pace still differ in how they get there. Starts feed the lights-out reaction.
 */
export type AttrKey =
  | "qualifying" | "racePace" | "consistency" | "wet"
  | "overtaking" | "defending" | "starts" | "cleanRacing"
  | "tyres" | "fuel" | "energy"
  | "composure" | "aggression" | "adaptability" | "feedback" | "determination";

export const ATTR_GROUPS: { title: string; keys: AttrKey[] }[] = [
  { title: "PACE", keys: ["qualifying", "racePace", "consistency", "wet"] },
  { title: "RACECRAFT", keys: ["overtaking", "defending", "starts", "cleanRacing"] },
  { title: "MANAGEMENT", keys: ["tyres", "fuel", "energy"] },
  { title: "MIND", keys: ["composure", "aggression", "adaptability", "feedback", "determination"] },
];

export const ATTR_LABEL: Record<AttrKey, string> = {
  qualifying: "One lap pace", racePace: "Race pace", consistency: "Consistency", wet: "Wet weather",
  overtaking: "Overtaking", defending: "Defending", starts: "Starts", cleanRacing: "Clean racing",
  tyres: "Tyre care", fuel: "Fuel saving", energy: "Energy use",
  composure: "Composure", aggression: "Aggression", adaptability: "Adaptability", feedback: "Technical feedback", determination: "Determination",
};

export const ATTR_TIP: Record<AttrKey, string> = {
  qualifying: "Speed over a single lap. Drives the qualifying order.",
  racePace: "Speed over a stint with fuel and traffic.",
  consistency: "How rarely he makes a mistake or has an off lap.",
  wet: "Skill and feel when the track is wet.",
  overtaking: "How often an attack becomes a pass.",
  defending: "How hard he is to pass.",
  starts: "Reaction and clutch at the lights. Feeds the getaway.",
  cleanRacing: "Avoids contact and track limits.",
  tyres: "Looks after the rubber over a stint.",
  fuel: "Saves fuel without losing time.",
  energy: "Deploys and harvests the battery well.",
  composure: "Holds together under pressure and after setbacks.",
  aggression: "How hard he is willing to race. Neither high nor low is better.",
  adaptability: "How fast he gets used to a new car or track.",
  feedback: "How well he describes the car. Helps the engineers' correlation.",
  determination: "Keeps pushing when the car or the day is bad.",
};

const clamp20 = (v: number) => Math.max(1, Math.min(20, Math.round(v)));
const wob = (id: string, key: string, span = 2.2) => ((hashSeed(`attr:${id}:${key}`) % 1000) / 1000 - 0.5) * span * 2;
const scale = (v01: number) => 1 + Math.max(0, Math.min(1, v01)) * 19;

export function attributesOf(x: DriverState): Record<AttrKey, number> {
  const sp = x.spec;
  const ps = (sp.psyche ?? {}) as unknown as Record<string, number>;
  const pace = scale((sp.pace - 0.975) / 0.027);
  const out = {} as Record<AttrKey, number>;
  const set = (k: AttrKey, v: number, span?: number) => (out[k] = clamp20(v + wob(x.id, k, span)));
  set("qualifying", pace, 1.4);
  set("racePace", pace * 0.75 + scale(sp.consistency) * 0.25, 1.4);
  set("consistency", scale((sp.consistency - 0.4) / 0.57));
  set("wet", scale(sp.wet ?? 0.5));
  set("tyres", scale((sp.tyreMgmt - 0.3) / 0.67));
  set("aggression", scale(sp.aggression));
  set("overtaking", pace * 0.5 + scale(sp.aggression) * 0.35 + scale(ps.selfBelief ?? 0.6) * 0.15);
  set("defending", pace * 0.4 + scale(sp.aggression) * 0.3 + scale(ps.ego ?? 0.5) * 0.3);
  set("starts", 10 + (pace - 10) * 0.3 + scale(ps.volatility === undefined ? 0.5 : 1 - ps.volatility) * 0.2, 3.5);
  set("cleanRacing", scale(1 - sp.aggression * 0.6) * 0.5 + scale(sp.consistency) * 0.5);
  set("fuel", scale((sp.tyreMgmt - 0.3) / 0.67) * 0.5 + scale(sp.consistency) * 0.2 + 5, 2.5);
  set("energy", pace * 0.3 + scale(sp.consistency) * 0.3 + 4, 3);
  set("composure", scale(1 - (ps.volatility ?? 0.5)) * 0.6 + scale(sp.consistency) * 0.4);
  set("adaptability", scale(ps.patience ?? 0.5) * 0.4 + pace * 0.3 + 3, 3);
  set("feedback", scale(ps.talkative ?? 0.5) * 0.35 + scale(ps.humility === undefined ? 0.5 : ps.humility) * 0.1 + pace * 0.25 + 4, 3);
  set("determination", scale(ps.selfBelief ?? 0.6) * 0.5 + scale(1 - (ps.volatility ?? 0.5)) * 0.2 + scale(ps.patience ?? 0.5) * 0.3, 2.5);
  return out;
}

/** 0 to 1 launch skill that the lights-out reaction in the simulator reads. */
export const launchOf = (x: DriverState): number => (attributesOf(x).starts - 1) / 19;

/** What a scout who knows the driver `know` (0..1) can tell: a range that narrows as the research goes on. */
export function readAttr(trueValue: number, know: number, id: string, key: string): { lo: number; hi: number; shown: number } {
  const half = Math.round((1 - Math.min(1, know)) * 6);
  if (half === 0) return { lo: trueValue, hi: trueValue, shown: trueValue };
  const off = Math.round(wob(id, `read:${key}`, half * 0.6));
  const c = Math.max(1, Math.min(20, trueValue + off));
  return { lo: Math.max(1, c - half), hi: Math.min(20, c + half), shown: c };
}
