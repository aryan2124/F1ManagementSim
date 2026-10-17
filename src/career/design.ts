import { hashSeed, Rng } from "../sim/rng";
import { clamp, round2 } from "./util";
import { solveSection, type Section } from "./airfoil";
import { TRAITS, type CareerState, type TeamState, type Trait } from "./types";

/**
 * The parametric car. Eight dials (each 0 to 1) describe the shape; a hidden physical model turns them into the ten
 * car traits. Nobody sees the model: the player learns the response by testing candidate shapes in the lab, and the
 * rulebook's hidden emphasis (regW) decides which traits are worth the most. The front and rear wings are real
 * sections solved by the panel method in airfoil.ts, so a wing dialled too hard really does stall.
 */
export const DESIGN_KEYS = ["frontWing", "rearWing", "floor", "rake", "sidepod", "inlet", "stiffness", "wheelbase"] as const;
export type DesignKey = (typeof DESIGN_KEYS)[number];
export type Design = Record<DesignKey, number>;

export const DESIGN_LABEL: Record<DesignKey, string> = {
  frontWing: "Front wing loading", rearWing: "Rear wing loading", floor: "Floor tunnel depth", rake: "Rake",
  sidepod: "Sidepod wrap", inlet: "Cooling inlet size", stiffness: "Suspension stiffness", wheelbase: "Wheelbase",
};
export const DESIGN_ENDS: Record<DesignKey, [string, string]> = {
  frontWing: ["light", "heavy"], rearWing: ["low drag", "high downforce"], floor: ["shallow", "deep and sealed"],
  rake: ["flat", "steep nose down"], sidepod: ["open", "tight undercut"], inlet: ["small", "large"],
  stiffness: ["soft", "stiff"], wheelbase: ["short", "long"],
};
export const DESIGN_HINT: Record<DesignKey, string> = {
  frontWing: "Sets how much the front axle bites and how clean the air is for the floor behind it.",
  rearWing: "The biggest lever on downforce and drag at the same time.",
  floor: "Most of the downforce lives here, but a deep floor chokes and bounces if the car is too soft.",
  rake: "Nose-down attitude. Feeds the floor, costs drag and makes the car fussy on bumps.",
  sidepod: "Tight packaging frees the air for the rear, but the engine runs hotter.",
  inlet: "Bigger inlets cool better and cost drag.",
  stiffness: "A stiff car keeps its floor stable, but grips less over bumps and is harder on the tyres.",
  wheelbase: "Longer is calmer and kinder to tyres, shorter turns in quicker.",
};

export const NEUTRAL: Design = { frontWing: 0.5, rearWing: 0.5, floor: 0.5, rake: 0.5, sidepod: 0.5, inlet: 0.5, stiffness: 0.5, wheelbase: 0.5 };

export const clampDesign = (d: Partial<Design>): Design => {
  const out = { ...NEUTRAL };
  for (const k of DESIGN_KEYS) out[k] = clamp(round2(d[k] ?? out[k]), 0, 1);
  return out;
};

/** The section each wing dial draws. */
export function frontSection(v: number): Section {
  return { alpha: 2 + 9 * v, camber: 0.02 + 0.05 * v, pos: 0.4, thick: 0.09 };
}
export function rearSection(v: number): Section {
  return { alpha: 3 + 9 * v, camber: 0.03 + 0.05 * v, pos: 0.45, thick: 0.08 };
}

const n = (x: number) => x - 0.5;
const pos = (x: number) => Math.max(0, x);

/** The truth: how far each trait moves (seconds a lap, positive is faster) for this shape against the neutral one. */
export function designTraits(d: Design): Record<Trait, number> {
  const f0 = solveSection(frontSection(0.5));
  const r0 = solveSection(rearSection(0.5));
  const f = solveSection(frontSection(d.frontWing));
  const r = solveSection(rearSection(d.rearWing));
  const dF = (f.cl - f0.cl) / f0.cl;
  const dR = (r.cl - r0.cl) / r0.cl;
  const dragF = (f.cd - f0.cd) / f0.cd;
  const dragR = (r.cd - r0.cd) / r0.cd;
  // a floor works best with a little rake; too much or too little wastes it
  const floorGain = n(d.floor) * (1 - 1.5 * Math.abs(n(d.rake) - 0.1));
  // a deep floor on a soft car bounces and the downforce collapses
  const bounce = pos(n(d.floor) - 0.15) * pos(0.1 - n(d.stiffness)) * 3.2;
  const stallLoss = (f.stalled ? 0.12 : 0) + (r.stalled ? 0.2 : 0);
  const t = {} as Record<Trait, number>;
  t.downforce = 0.2 * dF + 0.28 * dR + 0.55 * floorGain - 0.35 * bounce - stallLoss;
  t.efficiency = -0.07 * dragF - 0.16 * dragR - 0.2 * pos(n(d.rake)) - 0.18 * n(d.inlet) + 0.16 * n(d.sidepod) + 0.05 * n(d.floor) - (r.stalled ? 0.15 : 0);
  t.grip = -0.32 * n(d.stiffness) - 0.2 * n(d.wheelbase) + 0.08 * dF;
  t.platform = 0.5 * n(d.stiffness) + 0.28 * n(d.wheelbase) - 0.3 * pos(n(d.rake)) * (1 - 0.8 * pos(n(d.stiffness))) - 0.25 * pos(n(d.floor)) * (0.7 - pos(n(d.stiffness))) - 0.1 * bounce;
  t.output = 0.2 * n(d.inlet) - 0.14 * n(d.sidepod);
  t.drive = 0.12 * n(d.wheelbase) + 0.08 * n(d.stiffness) - 0.05 * n(d.rake);
  t.capacity = 0.5 * n(d.inlet) - 0.34 * n(d.sidepod);
  t.packaging = 0.46 * n(d.sidepod) - 0.16 * n(d.inlet) - 0.08 * n(d.wheelbase);
  t.wear = 0.22 * n(d.wheelbase) - 0.28 * n(d.stiffness) - 0.16 * pos(n(d.rake)) - 0.1 * dF;
  t.warmup = 0.2 * n(d.rake) - 0.1 * n(d.wheelbase) + 0.1 * n(d.floor);
  for (const k of TRAITS) t[k] = round2(t[k]);
  return t;
}

/** The same shape as the era sees it: the rulebook's hidden emphasis multiplies each trait. */
export function designWorth(d: Design, regW: Record<Trait, number> | undefined): Record<Trait, number> {
  const raw = designTraits(d);
  const out = {} as Record<Trait, number>;
  for (const k of TRAITS) out[k] = round2(raw[k] * (regW?.[k] ?? 1));
  return out;
}

/** The team's own unmodelled quirks: two cars with the same dials differ a little. Stable per team. */
export function teamQuirk(teamId: string, seed: number): Record<Trait, number> {
  const rng = new Rng(hashSeed(`quirk:${seed}:${teamId}`));
  const q = {} as Record<Trait, number>;
  for (const k of TRAITS) q[k] = round2(rng.gauss() * 0.02);
  return q;
}

export function designOf(t: TeamState): Design {
  return t.design ?? NEUTRAL;
}

/** Start of a career: every team gets its own shape so rivals look and behave differently. */
export function initDesigns(s: CareerState) {
  for (const t of Object.values(s.teams)) {
    if (t.design) continue;
    const rng = new Rng(hashSeed(`design0:${s.seed}:${t.id}`));
    const d = { ...NEUTRAL };
    for (const k of DESIGN_KEYS) d[k] = clamp(round2(0.5 + rng.gauss() * 0.16), 0.1, 0.9);
    t.design = d;
  }
}

/** Words for how a shape differs from the field, for scouting photos and reveal day. */
export function describeDesign(d: Design): string[] {
  const out: string[] = [];
  const word = (k: DesignKey, lo: string, hi: string) => {
    const v = d[k];
    if (v >= 0.66) out.push(hi);
    else if (v <= 0.34) out.push(lo);
  };
  word("frontWing", "a light front wing", "a heavily loaded front wing");
  word("rearWing", "a low drag rear wing", "a big rear wing");
  word("floor", "a shallow floor", "a deep, sealed floor");
  word("rake", "a flat stance", "a steep nose-down rake");
  word("sidepod", "open sidepods", "tight, undercut sidepods");
  word("inlet", "small cooling inlets", "large cooling inlets");
  word("stiffness", "a soft suspension", "a very stiff suspension");
  word("wheelbase", "a short wheelbase", "a long wheelbase");
  return out;
}
