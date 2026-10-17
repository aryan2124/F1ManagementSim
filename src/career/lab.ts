import { Rng, hashSeed } from "../sim/rng";
import { clamp, round2, rngFor, fmtMoney } from "./util";
import { DESIGN_KEYS, NEUTRAL, clampDesign, designOf, designWorth, initDesigns, type Design } from "./design";
import { learn } from "./know";
import { quality } from "./know";
import { factorsOf } from "./factors";
import { addFact } from "./facts";
import { logSpend } from "./log";
import { TRAITS, type CareerState, type TeamState, type Trait } from "./types";
import { TRAIT_NAME } from "./traits";

/**
 * The testing ladder. Every instrument measures what a candidate shape would do to the car, against the car you have now,
 * with its own noise and its own habits of lying. Desk estimates are free and rough. CFD and the tunnel eat allowance
 * hours. The simulator and the dyno cost cash. How far to trust any of them is the correlation: how often their story
 * matched the track, which only running the car on track can build.
 */
export type InstId = "desk" | "cfd" | "tunnel" | "sim" | "dyno";

export interface Instrument {
  id: InstId;
  label: string;
  blurb: string;
  reads: Trait[];
  /** Standard deviation of one reading in seconds, before staff and facilities. */
  sigma: number;
  /** Size of the instrument's habitual lie in seconds, shrinking as correlation grows. */
  bias: number;
  hours?: number;
  cash?: number;
  uses: "none" | "cfd" | "tunnel";
  start: number;
}

export const INSTRUMENTS: Record<InstId, Instrument> = {
  desk: { id: "desk", label: "Desk study", blurb: "Hand calculations and the engineers' experience. Free and fast, and rough.", reads: [...TRAITS], sigma: 0.11, bias: 0.07, uses: "none", start: 0.4 },
  cfd: { id: "cfd", label: "CFD run", blurb: "Airflow on the computer. Sees the air well and loves a smooth, clean model.", reads: ["downforce", "efficiency", "platform", "capacity"], sigma: 0.05, bias: 0.09, hours: 6, uses: "cfd", start: 0.55 },
  tunnel: { id: "tunnel", label: "Wind tunnel", blurb: "A scale model on a rolling road. The best look at the aero, but only as good as the model.", reads: ["downforce", "efficiency", "platform"], sigma: 0.028, bias: 0.045, hours: 10, uses: "tunnel", start: 0.7 },
  sim: { id: "sim", label: "Simulator", blurb: "A driver in a rig. Reads grip, balance and the tyres, depends on the driver who sits in it.", reads: ["grip", "platform", "drive", "wear", "warmup"], sigma: 0.04, bias: 0.06, cash: 0.08, uses: "none", start: 0.6 },
  dyno: { id: "dyno", label: "Dyno cell", blurb: "The engine on a bench with a cooling rig. Reads power, drive, cooling and packaging.", reads: ["output", "drive", "capacity", "packaging"], sigma: 0.03, bias: 0.04, cash: 0.06, uses: "none", start: 0.8 },
};
export const INST_ORDER: InstId[] = ["desk", "cfd", "tunnel", "sim", "dyno"];

export interface LabReading {
  trait: Trait;
  /** Measured change in seconds a lap against the car you have now. */
  value: number;
  err: number;
}
export interface LabEntry {
  id: number;
  day: number;
  inst: InstId;
  model: Design;
  readings: LabReading[];
  note: string;
  /** For the pictures: stylised, repeatable numbers that come from the same truth. */
  seed: number;
  /** Already sent to the drawing office as an idea. */
  sent?: boolean;
}

export const corrOf = (t: TeamState, id: InstId): number => t.corr?.[id] ?? INSTRUMENTS[id].start;

/** A person in the loop: the staff who read this instrument. */
export function readerQuality(s: CareerState, teamId: string, _inst: InstId, tr: Trait): number {
  const q = quality(s, teamId, tr);
  return clamp(q, 0.1, 0.97);
}

/** The instrument's habitual lie for one trait, fixed per team and instrument. */
function habit(teamId: string, seed: number, inst: InstId, tr: Trait): number {
  const r = new Rng(hashSeed(`habit:${seed}:${teamId}:${inst}:${tr}`));
  return r.gauss();
}

export function allowanceCost(inst: InstId, t: TeamState): string | null {
  const I = INSTRUMENTS[inst];
  if (I.uses === "tunnel" && t.tunnelLeft < (I.hours ?? 0)) return `The tunnel needs ${I.hours} allowance hours and ${Math.floor(t.tunnelLeft)} are left.`;
  if (I.uses === "cfd" && (t.cfdLeft ?? t.tunnelLeft * 0.8) < (I.hours ?? 0)) return `A CFD run needs ${I.hours} hours and ${Math.floor(t.cfdLeft ?? 0)} are left.`;
  if (I.cash && t.cash < I.cash) return `That costs ${fmtMoney(I.cash, 2)} and the team has no cash.`;
  return null;
}

export function runLab(s: CareerState, teamId: string, inst: InstId, modelIn: Partial<Design>): { ok: boolean; message: string; entry?: LabEntry } {
  const t = s.teams[teamId];
  initDesigns(s);
  const I = INSTRUMENTS[inst];
  const why = allowanceCost(inst, t);
  if (why) return { ok: false, message: why };
  if (I.uses === "tunnel") t.tunnelLeft = Math.max(0, t.tunnelLeft - (I.hours ?? 0));
  if (I.uses === "cfd") t.cfdLeft = Math.max(0, (t.cfdLeft ?? t.tunnelLeft * 0.8) - (I.hours ?? 0));
  if (I.cash) {
    t.cash = round2(t.cash - I.cash);
    t.ledger.rnd += I.cash;
    t.ledger.costs += I.cash;
    if (teamId === s.teamId) logSpend(s, `${I.label}`, { cash: -I.cash });
  }
  const model = clampDesign(modelIn);
  const cur = designOf(t);
  const truthNew = designWorth(model, s.regW);
  const truthCur = designWorth(cur, s.regW);
  const rng = rngFor(s, `lab:${teamId}:${inst}:${s.day}:${s.uid++}`);
  const fx = factorsOf(s, teamId);
  const corr = corrOf(t, inst);
  const readings: LabReading[] = [];
  for (const tr of I.reads) {
    const q = readerQuality(s, teamId, inst, tr);
    const sigma = round2(I.sigma * (1.6 - 1.2 * q) / Math.max(0.8, fx.tools.value * fx.cohesion.value));
    const delta = truthNew[tr] - truthCur[tr];
    const lie = (1 - corr) * I.bias * habit(teamId, s.seed, inst, tr);
    const value = round2(delta + lie + rng.gauss() * sigma);
    readings.push({ trait: tr, value, err: round2(Math.max(0.01, sigma + (1 - corr) * I.bias * 0.5)) });
    // every logged test makes the team a little surer about the trait it touched
    const k = t.know[tr];
    if (k) k.err = round2(Math.max(0.03, k.err * 0.985));
  }
  const entry: LabEntry = { id: s.uid, day: s.day, inst, model, readings, note: "", seed: hashSeed(`${s.seed}:${s.uid}:${inst}`) };
  const same = DESIGN_KEYS.every((k) => Math.abs(model[k] - cur[k]) < 0.005);
  entry.note = same ? "This is the car as it is: the readings are a check on your own numbers." : "";
  if (same) {
    // measuring your own car feeds what the team believes about it
    for (const r of readings) learn(t.know[r.trait], t.dna[r.trait] + (r.value - 0), Math.max(0.02, r.err));
  }
  (t.notebook ??= []).unshift(entry);
  if (t.notebook.length > 60) t.notebook.length = 60;
  addFact(s, "lab", `${I.label} on a candidate shape at ${teamId.toUpperCase()}.`, [teamId], 1);
  return { ok: true, message: `${I.label} done.`, entry };
}

/** After the car has run on track: every instrument that was used learns how right it was. */
export function trackCorrelates(s: CareerState, teamId: string) {
  const t = s.teams[teamId];
  const used = new Set((t.notebook ?? []).filter((e) => s.day - e.day < 120).map((e) => e.inst));
  const next = { ...(t.corr ?? {}) } as Record<string, number>;
  for (const id of INST_ORDER) {
    const c = corrOf(t, id);
    // a lab that was used and then checked against the track earns trust; unused instruments drift slowly
    next[id] = round2(clamp(c + (used.has(id) ? 0.035 : 0.006) * (1 - c), 0.2, 0.97));
  }
  t.corr = next;
}

/** January: the shape chosen in the lab becomes the car, in proportion to how well the office could build it. */
export function applyDesign(s: CareerState, teamId: string, effort: number, quality01: number): { delta: Record<Trait, number>; text: string } | null {
  const t = s.teams[teamId];
  if (!t.designNext) return null;
  const cur = designOf(t);
  const worthNew = designWorth(t.designNext, s.regW);
  const worthCur = designWorth(cur, s.regW);
  const exec = clamp(0.35 + quality01 * 0.7, 0.3, 1.05) * clamp(effort, 0.15, 1.15);
  const rng = rngFor(s, `applyDesign:${teamId}`);
  const delta = {} as Record<Trait, number>;
  for (const tr of TRAITS) delta[tr] = round2((worthNew[tr] - worthCur[tr]) * exec + rng.gauss() * 0.02 * (1.2 - exec));
  t.design = t.designNext;
  t.designNext = undefined;
  const mean = TRAITS.reduce((a, tr) => a + delta[tr], 0) / TRAITS.length;
  return { delta, text: mean > 0.05 ? "The new shape worked: the lab's promise held on the car." : mean > -0.02 ? "The new shape came out close to the old one." : "The new shape missed what the lab suggested." };
}

export const LAB_TRAIT_NAME = TRAIT_NAME;
void NEUTRAL;
