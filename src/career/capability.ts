import { staffOf } from "./car";
import { AREA_TRAITS, TRAIT_AREA, TRAIT_DF, TRAIT_RISK } from "./traits";
import { AREAS } from "./types";
import type { Area, CareerState, Phil, Staff, StaffRole, Trait } from "./types";
import { clamp, round2 } from "./util";
import { Rng, hashSeed } from "../sim/rng";

/**
 * Engineers are not one number. Each has a skill, a specialty across the five areas and a philosophy,
 * and the car has a philosophy too. What an engineer does for a job is skill times how well the person fits that job.
 */

/** Roles that design or read a car, in the order they are tried as the lead of an area. */
export const LEAD_ROLES: Record<Area, StaffRole[]> = {
  aero: ["aero", "designer", "td"],
  chassis: ["designer", "td"],
  power: ["power", "td"],
  cooling: ["power", "designer", "td"],
  tyres: ["designer", "td"],
};

const PRIMARY: Record<StaffRole, Area[]> = {
  td: ["chassis", "tyres", "cooling"],
  designer: ["chassis", "aero", "cooling", "tyres"],
  aero: ["aero"],
  power: ["power", "cooling"],
  data: ["aero", "chassis", "power", "cooling", "tyres"],
  strategy: ["tyres"],
  mechanic: ["chassis"],
  engineer: ["tyres", "chassis"],
  scout: ["tyres"],
  coach: ["tyres"],
};

export function makeCapability(role: StaffRole, rng: Rng): { spec: Record<Area, number>; phil: Phil } {
  const spec = {} as Record<Area, number>;
  const prim = PRIMARY[role];
  const main = rng.pick(prim);
  for (const a of AREAS) spec[a] = clamp(0.15 + rng.next() * 0.3, 0, 1);
  spec[main] = clamp(0.75 + rng.next() * 0.25, 0, 1);
  if (role === "td" || role === "designer" || role === "data") {
    const second = rng.pick(AREAS.filter((a) => a !== main));
    spec[second] = clamp(0.5 + rng.next() * 0.3, 0, 1);
  }
  const g = () => clamp(rng.gauss() * 0.55, -1, 1);
  for (const a of AREAS) spec[a] = round2(spec[a]);
  return { spec, phil: { df: round2(g()), risk: round2(g()), innov: round2(g()) } };
}

/** How near two philosophies are, 0 (opposites) to 1 (the same). */
export function philMatch(a: Phil, b: Phil): number {
  const d = (Math.abs(a.df - b.df) + Math.abs(a.risk - b.risk) + Math.abs(a.innov - b.innov)) / 6;
  return clamp(1 - d, 0, 1);
}

export interface FitParts {
  skill: number;
  specialty: number;
  philosophy: number;
  familiarity: number;
  workload: number;
  /** The multiplier on the person's skill for this job, about 0.6 to 1.25. */
  mult: number;
}

/** How a person fits a job on one trait under the car's current concept. */
export function fitFor(_s: CareerState, st: Staff | undefined, concept: Phil, tr: Trait, busy = 0): FitParts {
  if (!st) return { skill: 0, specialty: 0.3, philosophy: 0.5, familiarity: 0, workload: 1, mult: 0.6 };
  const a = TRAIT_AREA[tr];
  const sp = st.spec?.[a] ?? 0.55;
  const ph = st.phil ? philMatch(st.phil, concept) : 0.6;
  const fam = clamp(st.tenure / 4, 0, 1);
  const load = busy <= 2 ? 1 : clamp(1 - 0.08 * (busy - 2), 0.7, 1);
  const mult = clamp((0.62 + 0.5 * sp) * (0.82 + 0.3 * ph) * (0.95 + 0.07 * fam) * load, 0.5, 1.3);
  return { skill: st.skill, specialty: round2(sp), philosophy: round2(ph), familiarity: round2(fam), workload: round2(load), mult: round2(mult) };
}

/** The best person for an area right now: the one whose skill times fit is highest among those the team employs. */
export function leadFor(s: CareerState, teamId: string, tr: Trait): Staff | undefined {
  const t = s.teams[teamId];
  const a = TRAIT_AREA[tr];
  let best: Staff | undefined;
  let bestV = -1;
  for (const role of LEAD_ROLES[a]) {
    const st = staffOf(s, teamId, role);
    if (!st) continue;
    const busy = t.projects.filter((p) => p.status === "building" && p.lead === st.id).length;
    const f = fitFor(s, st, t.concept, tr, busy);
    const v = st.skill * f.mult * (role === "td" ? 0.9 : 1);
    if (v > bestV) {
      bestV = v;
      best = st;
    }
  }
  return best;
}

/** Effective skill of whoever leads an area for this trait. */
export function leadSkill(s: CareerState, teamId: string, tr: Trait, lead?: Staff): { skill: number; lead: Staff | undefined; fit: FitParts } {
  const t = s.teams[teamId];
  const who = lead ?? leadFor(s, teamId, tr);
  const busy = who ? t.projects.filter((p) => p.status === "building" && p.lead === who.id).length : 0;
  const fit = fitFor(s, who, t.concept, tr, busy);
  return { skill: (who?.skill ?? 55) * fit.mult, lead: who, fit };
}

/** The lean of a trait on the three axes, for showing next to people. */
export const traitLean = (tr: Trait): Phil => ({ df: TRAIT_DF[tr], risk: TRAIT_RISK[tr], innov: 0 });
export { AREA_TRAITS };

/** How good a hire this person is for a team, for the AI's choices: skill times how well they fit the team's concept. */
export function hireScore(s: CareerState, teamId: string, st: Staff): number {
  const t = s.teams[teamId];
  const ph = st.phil ? philMatch(st.phil, t.concept) : 0.6;
  const roleAreas = PRIMARY[st.role];
  const sp = st.spec ? Math.max(...roleAreas.map((a) => st.spec![a])) : 0.6;
  return st.skill * (0.85 + 0.3 * ph) * (0.75 + 0.5 * sp);
}

/** What the player can read of a person's specialty and philosophy: the truth blurred by how well they know the person. */
export function staffReadout(s: CareerState, st: Staff): { spec: Record<Area, number>; phil: Phil; half: number; best: Area } {
  const rng = new Rng(hashSeed(`fog:${s.seed}:${st.id}`));
  const half = round2(0.05 + 0.35 * (1 - st.known));
  const spec = {} as Record<Area, number>;
  let best: Area = "aero";
  for (const a of AREAS) {
    spec[a] = round2(clamp((st.spec?.[a] ?? 0.5) + (rng.next() * 2 - 1) * half, 0, 1));
    if (spec[a] > spec[best]) best = a;
  }
  const f = (v: number) => round2(clamp(v + (rng.next() * 2 - 1) * half * 1.5, -1, 1));
  const p = st.phil ?? { df: 0, risk: 0, innov: 0 };
  return { spec, phil: { df: f(p.df), risk: f(p.risk), innov: f(p.innov) }, half, best };
}
