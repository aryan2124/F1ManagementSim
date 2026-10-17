import { Rng, hashSeed } from "../sim/rng";
import { staffOf } from "./car";
import { AREAS, TRAITS } from "./types";
import type { Area, CareerState, Know, TeamState, Trait } from "./types";
import { AREA_TRAITS, TRAIT_AREA, TRAIT_GAIN_K, TRAIT_NAME, areaOfPair, trackNeed } from "./traits";
import { clamp, round2, rngFor } from "./util";
import { factorsOf } from "./factors";

/**
 * What a team believes about its own car and about the rules, as an estimate with an error bar.
 * Readings are noisy measurements of the truth; each one shrinks the error bar, and building a part or
 * starting a new season widens it again. The belief is only as good as the instruments and the people reading them.
 */

export const START_ERR = 0.1;
export const REG_ERR = 0.3;

export function initKnow(t: TeamState, rng: Rng) {
  const know = {} as Record<Trait, Know>;
  const reg = {} as Record<Trait, Know>;
  for (const tr of TRAITS) {
    know[tr] = { est: round2(t.dna[tr] + rng.gauss() * START_ERR * 0.7), err: START_ERR };
    reg[tr] = { est: 1, err: REG_ERR };
  }
  t.know = know;
  t.regKnow = reg;
  syncBelief(t);
}

/** The area-level belief everything older reads, derived from the trait beliefs. */
export function syncBelief(t: TeamState) {
  for (const a of AREAS) {
    const [x, y] = AREA_TRAITS[a];
    t.believed[a] = round2(areaOfPair(t.know[x].est, t.know[y].est));
  }
}

/** Combine one noisy reading (same units, standard deviation `sigma`) with what is already believed. */
export function learn(k: Know, reading: number, sigma: number) {
  const a = 1 / Math.max(1e-6, k.err * k.err);
  const b = 1 / Math.max(1e-6, sigma * sigma);
  k.est = round2((k.est * a + reading * b) / (a + b));
  k.err = round2(Math.max(0.03, Math.sqrt(1 / (a + b))));
}

const rel = (skill?: number) => clamp(((skill ?? 55) - 40) / 55, 0, 1);

/** The facility that measures an area: the tunnel reads aero, the simulator reads the chassis and the tyres, the factory dyno reads the engine and its cooling. */
export function facilityFor(a: Area): "tunnel" | "sim" | "factory" {
  return a === "aero" ? "tunnel" : a === "chassis" || a === "tyres" ? "sim" : "factory";
}
export const FACILITY_LABEL = { tunnel: "wind tunnel", sim: "simulator", factory: "dyno cell" } as const;

/** The head of the area who reads its data. Falls back to the technical director. */
export function readerFor(s: CareerState, teamId: string, a: Area) {
  const role = a === "aero" ? "aero" : a === "power" || a === "cooling" ? "power" : "designer";
  return staffOf(s, teamId, role) ?? staffOf(s, teamId, "td");
}

/** How clean a reading of this trait is, 0..1: the right instrument, the right specialist and a data lead. */
export function quality(s: CareerState, teamId: string, tr: Trait): number {
  const t = s.teams[teamId];
  const a = TRAIT_AREA[tr];
  const lvl = t.facilities[facilityFor(a)];
  const reader = readerFor(s, teamId, a);
  const data = staffOf(s, teamId, "data");
  const spec = reader?.spec ? 0.6 + 0.8 * reader.spec[a] : 1;
  // a driver who gives clean feedback makes every reading better: consistent drivers are good test drivers
  const crew = Object.values(s.drivers).filter((d) => d.teamId === teamId && !d.retired);
  const fb = crew.length ? crew.reduce((a, d) => a + d.spec.consistency, 0) / crew.length : 0.75;
  let q = 0.14 + 0.095 * (lvl - 1) + clamp((fb - 0.75) * 0.9, -0.08, 0.12) + 0.3 * rel(reader?.skill) * spec * (reader?.role === "td" ? 0.7 : 1) + 0.2 * rel(data?.skill);
  if (reader?.traits.includes("data-driven") || data?.traits.includes("data-driven")) q += 0.06;
  // the same instrument reads better in a team that works well together and knows its tools
  q *= factorsOf(s, teamId).talent.value * factorsOf(s, teamId).cohesion.value * (0.97 + 0.06 * factorsOf(s, teamId).tools.value - 0.06);
  return clamp(q, 0.1, 0.97);
}
/** The standard deviation of one reading at that quality. */
export const sigmaOf = (q: number) => round2(0.02 + 0.2 * (1 - q) * (1 - q) + 0.06 * (1 - q));

/** One measurement of a trait. */
export function read(s: CareerState, teamId: string, tr: Trait, rng: Rng, qMul = 1) {
  const t = s.teams[teamId];
  const sigma = sigmaOf(clamp(quality(s, teamId, tr) * qMul, 0.05, 0.97));
  learn(t.know[tr], t.dna[tr] + rng.gauss() * sigma, sigma);
  syncBelief(t);
}

/** Spend allowance hours on a study of one trait. Each 8 hours is one reading, up to six at a time. */
export const HOURS_PER_READING = 8;
export function study(s: CareerState, teamId: string, tr: Trait, readings: number): { ok: boolean; why?: string; hours: number } {
  const t = s.teams[teamId];
  const n = clamp(Math.round(readings), 1, 6);
  const hours = n * HOURS_PER_READING;
  if (t.tunnelLeft < hours) return { ok: false, why: `That needs ${hours} allowance hours and ${Math.floor(t.tunnelLeft)} are left.`, hours };
  t.tunnelLeft = Math.max(0, t.tunnelLeft - hours);
  const rng = rngFor(s, `study:${teamId}:${tr}:${s.day}:${s.uid}`);
  for (let i = 0; i < n; i++) read(s, teamId, tr, rng);
  s.uid++;
  return { ok: true, hours };
}

/** Quality of a reading of the rulebook's emphasis: the data lead and the technical director, not the instruments. */
export function regQuality(s: CareerState, teamId: string): number {
  const td = staffOf(s, teamId, "td");
  const data = staffOf(s, teamId, "data");
  const t = s.teams[teamId];
  return clamp(0.15 + 0.4 * rel(td?.skill) + 0.25 * rel(data?.skill) + 0.04 * (t.facilities.sim - 1), 0.1, 0.95);
}
/** Study what the regulations really reward in one trait. */
export function studyRegs(s: CareerState, teamId: string, tr: Trait, readings: number): { ok: boolean; why?: string; hours: number } {
  const t = s.teams[teamId];
  const n = clamp(Math.round(readings), 1, 6);
  const hours = n * HOURS_PER_READING;
  if (!s.regW) return { ok: false, why: "Nothing to study yet.", hours };
  if (t.tunnelLeft < hours) return { ok: false, why: `That needs ${hours} allowance hours and ${Math.floor(t.tunnelLeft)} are left.`, hours };
  t.tunnelLeft = Math.max(0, t.tunnelLeft - hours);
  const rng = rngFor(s, `studyreg:${teamId}:${tr}:${s.day}:${s.uid}`);
  const q = regQuality(s, teamId);
  const sigma = round2(0.05 + 0.4 * (1 - q) * (1 - q));
  for (let i = 0; i < n; i++) learn(t.regKnow[tr], s.regW[tr] + rng.gauss() * sigma, sigma);
  s.uid++;
  return { ok: true, hours };
}

/** A part was fitted: the team adds what it predicted, and is less sure than before. */
export function believeFit(t: TeamState, tr: Trait, predicted: number, size: number) {
  t.know[tr].est = round2(t.know[tr].est + predicted * TRAIT_GAIN_K);
  t.know[tr].err = round2(Math.min(0.3, Math.sqrt(t.know[tr].err ** 2 + (0.03 + 0.05 * size) ** 2)));
  syncBelief(t);
}
/** The truth surfaced (a bench run, a race): move the belief by a share of the way to the car's real number. */
export function correct(t: TeamState, tr: Trait, share: number) {
  const k = t.know[tr];
  if (share >= 0.999) {
    k.est = t.dna[tr];
    k.err = Math.max(0.03, round2(k.err * 0.5));
    syncBelief(t);
    return;
  }
  // a reading whose weight against the old belief is `share`: honest noise, so the bar stays honest
  const sigma = k.err * Math.sqrt((1 - share) / Math.max(0.01, share));
  const rng = new Rng(hashSeed(`corr:${t.id}:${tr}:${k.est}:${t.dna[tr]}`));
  learn(k, t.dna[tr] + rng.gauss() * sigma, sigma);
  syncBelief(t);
}
/** A new season, a new car: everything is a little less certain. */
export function newCarDoubt(t: TeamState, amount = 0.07) {
  for (const tr of TRAITS) t.know[tr].err = round2(Math.min(0.3, Math.sqrt(t.know[tr].err ** 2 + amount ** 2)));
}

/** The weekly background read: the data from the last week's running tells the team a little about two traits. */
export function passiveRead(s: CareerState, teamId: string) {
  const rng = rngFor(s, `passive:${teamId}:${s.day}`);
  read(s, teamId, TRAITS[Math.floor(rng.next() * TRAITS.length)], rng, 0.3);
  for (const tr of TRAITS) s.teams[teamId].know[tr].err = round2(Math.min(0.3, Math.sqrt(s.teams[teamId].know[tr].err ** 2 + 0.012 ** 2)));
}

/** A weekend of running: the data teaches the team about the car under the load that weekend asked for. */
export function weekendRead(s: CareerState, teamId: string, focus: Trait[], strength = 1) {
  const rng = rngFor(s, `wkread:${teamId}:${s.day}:${s.round}`);
  for (const tr of focus) read(s, teamId, tr, rng, strength);
}

/** After a race the numbers from the cars are in: every trait moves toward the truth a little, the ones the circuit stressed more. */
export function raceLearn(s: CareerState, teamId: string, stressed: Trait[]) {
  const t = s.teams[teamId];
  for (const tr of TRAITS) correct(t, tr, stressed.includes(tr) ? 0.16 : 0.06);
  // the car keeps changing between races, so certainty leaks away
  for (const tr of TRAITS) t.know[tr].err = round2(Math.min(0.3, Math.sqrt(t.know[tr].err ** 2 + 0.03 ** 2)));
}

/** Importance of a trait in the rulebook as this team believes it. */
export const believedWeight = (t: TeamState, tr: Trait) => t.regKnow[tr].est;

/** The belief moves with a change the team knows about (a rule change everyone saw). */
export function shiftBelief(t: TeamState, a: Area, delta: number) {
  for (const tr of AREA_TRAITS[a]) t.know[tr].est = round2(t.know[tr].est + delta);
  syncBelief(t);
}
export function shiftKnow(t: TeamState, tr: Trait, delta: number) {
  t.know[tr].est = round2(t.know[tr].est + delta);
  syncBelief(t);
}
/** Pre-season testing: every trait's belief moves toward the truth. */
export function testLearn(t: TeamState, share: number) {
  for (const tr of TRAITS) correct(t, tr, share);
}

/** Which traits a circuit stresses most, from its character. */
export function stressedAt(circuitId: string): Trait[] {
  const n = trackNeed(circuitId);
  const out: Trait[] = n.df >= 0.25 ? ["downforce", "grip"] : n.df <= -0.25 ? ["efficiency", "output"] : ["platform", "drive"];
  out.push(n.sev > 1.05 ? "wear" : "warmup");
  return out;
}

/** What the data from running tells the team, by programme. */
export const PROGRAMME_TRAITS: Record<string, Trait[]> = {
  setup: ["downforce", "efficiency", "platform"],
  tyres: ["wear", "warmup", "grip"],
  raceSim: ["wear", "capacity", "drive"],
  qualiSim: ["output", "grip", "warmup"],
  part: [],
};

/** After a race: move beliefs toward the truth and say in plain words what changed. */
export function weekendLearn(s: CareerState, teamId: string, circuitId: string): string[] {
  const t = s.teams[teamId];
  const before = Object.fromEntries(TRAITS.map((tr) => [tr, { ...t.know[tr] }])) as Record<Trait, Know>;
  raceLearn(s, teamId, stressedAt(circuitId));
  const lines: string[] = [];
  for (const tr of TRAITS) {
    const d = t.know[tr].est - before[tr].est;
    if (Math.abs(d) >= 0.04 || before[tr].err - t.know[tr].err >= 0.04) lines.push(`${TRAIT_NAME[tr]}: now ${fmtSigned(t.know[tr].est)} (was ${fmtSigned(before[tr].est)}), error bar ${t.know[tr].err.toFixed(2)} (was ${before[tr].err.toFixed(2)}).`);
  }
  return lines.slice(0, 6);
}
const fmtSigned = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
