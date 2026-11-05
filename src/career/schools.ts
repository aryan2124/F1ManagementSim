import { hashSeed } from "../sim/rng";
import { round2 } from "./util";
import { attributesOf, type AttrKey } from "./attributes";
import type { CareerState, DriverState, Staff, Trait } from "./types";

/**
 * Engineer schools and driver qualities. Every designer or aero lead came up in one school of thought; his readings are
 * sharper on its traits and carry a steady lean on the rest. Drivers have six qualities that match what a car demands:
 * a keystone choice or a design dial pushes the car toward needing one of them.
 */
export type School = "downforce" | "efficiency" | "platform" | "power" | "tyres";
export const SCHOOLS: School[] = ["downforce", "efficiency", "platform", "power", "tyres"];
export const SCHOOL_NAME: Record<School, string> = {
  downforce: "Downforce school", efficiency: "Efficiency school", platform: "Platform and mechanical school", power: "Power unit and energy school", tyres: "Tyre school",
};
export const SCHOOL_TRAITS: Record<School, Trait[]> = {
  downforce: ["downforce", "grip"],
  efficiency: ["efficiency", "drive"],
  platform: ["platform", "packaging"],
  power: ["output", "capacity"],
  tyres: ["wear", "warmup"],
};

export const schoolOf = (st: Pick<Staff, "id">): School => SCHOOLS[hashSeed(`school:${st.id}`) % SCHOOLS.length];

/** The lead engineer a team's lab work goes through. */
export function leadEngineer(s: CareerState, teamId: string): Staff | undefined {
  const mine = Object.values(s.staff).filter((x) => x.teamId === teamId && (x.role === "designer" || x.role === "aero" || x.role === "td"));
  return mine.sort((a, b) => b.skill - a.skill || (a.id < b.id ? -1 : 1))[0];
}

/** How the lead's school changes a reading on a trait: a noise multiplier (below 1 is sharper) and a steady bias. */
export function schoolReading(s: CareerState, teamId: string, tr: Trait): { sigma: number; bias: number } {
  const lead = leadEngineer(s, teamId);
  if (!lead) return { sigma: 1, bias: 0 };
  const school = schoolOf(lead);
  if (SCHOOL_TRAITS[school].includes(tr)) return { sigma: 0.8, bias: 0 };
  const g = ((hashSeed(`sbias:${lead.id}:${tr}`) % 2001) / 1000 - 1) * 0.04;
  return { sigma: 1.05, bias: round2(g) };
}

/** Ideas inside the lead's school cost a little less to develop. */
export function schoolDiscount(s: CareerState, teamId: string, tr: Trait): number {
  const lead = leadEngineer(s, teamId);
  return lead && SCHOOL_TRAITS[schoolOf(lead)].includes(tr) ? 0.9 : 1;
}

export type Quality = "frontEnd" | "rearStability" | "tyreKindness" | "platformTolerance" | "energySense" | "adaptability";
export const QUALITIES: Quality[] = ["frontEnd", "rearStability", "tyreKindness", "platformTolerance", "energySense", "adaptability"];
export const QUALITY_NAME: Record<Quality, string> = {
  frontEnd: "Front-end bite", rearStability: "Rear stability tolerance", tyreKindness: "Tyre kindness",
  platformTolerance: "Platform tolerance", energySense: "Energy sense", adaptability: "Adaptability",
};
const FROM: Record<Quality, AttrKey[]> = {
  frontEnd: ["qualifying", "aggression"],
  rearStability: ["composure", "consistency"],
  tyreKindness: ["tyres", "fuel"],
  platformTolerance: ["determination", "feedback"],
  energySense: ["energy", "racePace"],
  adaptability: ["adaptability", "feedback"],
};

export function qualitiesOf(d: DriverState): Record<Quality, number> {
  const a = attributesOf(d);
  const out = {} as Record<Quality, number>;
  for (const q of QUALITIES) out[q] = Math.round((FROM[q].reduce((x, k) => x + a[k], 0) / FROM[q].length) * 10) / 10;
  return out;
}

/** What the car asks of its driver, 0 to 1 per quality, from its traits and keystones. */
export function carDemand(traits: Record<Trait, number>): Record<Quality, number> {
  const c = (x: number) => Math.max(0, Math.min(1, 0.5 + x * 2.5));
  return {
    frontEnd: c(traits.downforce * 0.6 + traits.grip * -0.5),
    rearStability: c(-traits.platform * 0.6 + traits.downforce * 0.3),
    tyreKindness: c(-traits.wear * 0.7 - traits.warmup * 0.3),
    platformTolerance: c(-traits.platform),
    energySense: c(traits.output * 0.7 + traits.capacity * 0.3),
    adaptability: 0.5,
  };
}

/** 0..1: how well his strengths cover what the car asks. */
export function qualityFit(d: DriverState, traits: Record<Trait, number>): number {
  const q = qualitiesOf(d);
  const need = carDemand(traits);
  let miss = 0;
  for (const k of QUALITIES) miss += Math.max(0, need[k] - (q[k] - 1) / 19);
  return Math.max(0, Math.min(1, 1 - miss / 3));
}
