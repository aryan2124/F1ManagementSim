import { Rng, hashSeed } from "../sim/rng";
import { clamp, round2 } from "./util";
import type { CareerState } from "./types";

/**
 * The pit crew.
 *
 * Six people do the stop: a jack man at the front and the rear, and a wheel gun operator at each corner. You pick who
 * stands where from a squad of twelve. Skill sets the usual time. Chemistry sets how often it goes wrong: people
 * who have done many stops together, and whose temperaments fit, work as one. A hothead next to a hothead, or a
 * rookie next to a rookie, make the kind of mistake that costs a race. Stops together build familiarity, and
 * changing the line-up resets part of it.
 */

export type CrewRole = "jackF" | "jackR" | "gunFL" | "gunFR" | "gunRL" | "gunRR";
export const CREW_ROLES: CrewRole[] = ["jackF", "jackR", "gunFL", "gunFR", "gunRL", "gunRR"];
export const ROLE_LABEL: Record<CrewRole, string> = {
  jackF: "Front jack",
  jackR: "Rear jack",
  gunFL: "Front left gun",
  gunFR: "Front right gun",
  gunRL: "Rear left gun",
  gunRR: "Rear right gun",
};
export type Temper = "calm" | "hot" | "joker" | "vet" | "rookie";
export const TEMPER_WORD: Record<Temper, string> = { calm: "Calm", hot: "Hothead", joker: "Joker", vet: "Veteran", rookie: "Rookie" };

export interface CrewMember {
  id: string;
  name: string;
  /** 0..100. */
  skill: number;
  temper: Temper;
  /** Better at the jacks or at the guns. */
  best: "jack" | "gun";
  stops: number;
}

export interface PitCrewState {
  members: CrewMember[];
  /** Member ids by slot, in CREW_ROLES order. */
  lineup: string[];
  /** Stops done together, by pair "a|b". */
  bond: Record<string, number>;
  stops: number;
  slow: number;
  /** Fastest stop of the season, seconds. */
  best?: number;
}

const FIRST = ["Tom", "Jake", "Luca", "Marco", "Ben", "Sam", "Rui", "Dani", "Ollie", "Kai", "Nico", "Pablo", "Finn", "Hugo", "Leo", "Max", "Theo", "Ravi", "Joao", "Eli"];
const LAST = ["Walsh", "Rossi", "Hart", "Ferreira", "Cole", "Nakamura", "Brandt", "Duval", "Ortiz", "Singh", "Moss", "Keller", "Bianchi", "Doyle", "Lund", "Pires", "Hale", "Varga", "Reyes", "Frost"];

const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function newCrew(teamId: string, level: number, seed: number): PitCrewState {
  const rng = new Rng(hashSeed(`crew:${seed}:${teamId}`));
  const members: CrewMember[] = [];
  const temps: Temper[] = ["calm", "calm", "hot", "hot", "joker", "joker", "vet", "vet", "rookie", "rookie", "calm", "vet"];
  for (let i = 0; i < 12; i++) {
    const temper = temps[i]!;
    const base = level * 100 + (temper === "vet" ? 4 : temper === "rookie" ? -9 : 0) + rng.gauss() * 6;
    members.push({
      id: `pc-${teamId}-${i}`,
      name: `${FIRST[(i * 7 + Math.floor(rng.next() * 20)) % FIRST.length]} ${LAST[(i * 3 + Math.floor(rng.next() * 20)) % LAST.length]}`,
      skill: round2(clamp(base, 35, 98)),
      temper,
      best: i % 3 === 0 ? "jack" : "gun",
      stops: temper === "vet" ? 90 + Math.floor(rng.next() * 40) : temper === "rookie" ? Math.floor(rng.next() * 6) : 20 + Math.floor(rng.next() * 50),
    });
  }
  const jacks = members.filter((m) => m.best === "jack").sort((a, b) => b.skill - a.skill);
  const guns = members.filter((m) => m.best === "gun").sort((a, b) => b.skill - a.skill);
  const lineup = [jacks[0]!.id, jacks[1]!.id, guns[0]!.id, guns[1]!.id, guns[2]!.id, guns[3]!.id];
  // the squad has worked together for a while: some familiarity to begin with
  const bond: Record<string, number> = {};
  for (let i = 0; i < lineup.length; i++) for (let j = i + 1; j < lineup.length; j++) bond[key(lineup[i]!, lineup[j]!)] = 14 + Math.floor(rng.next() * 18);
  return { members, lineup, bond, stops: 0, slow: 0 };
}

export function ensureCrew(s: CareerState, teamId: string, base: number): PitCrewState {
  const t = s.teams[teamId];
  if (!t.crew) t.crew = newCrew(teamId, base, s.seed);
  return t.crew;
}

function compat(a: Temper, b: Temper): number {
  const pair = [a, b].sort().join("+");
  switch (pair) {
    case "hot+hot":
      return -0.18;
    case "hot+joker":
      return -0.1;
    case "rookie+rookie":
      return -0.12;
    case "hot+rookie":
      return -0.1;
    case "calm+hot":
      return 0.06;
    case "calm+joker":
      return 0.1;
    case "calm+calm":
      return 0.08;
    case "rookie+vet":
      return 0.14;
    case "calm+vet":
      return 0.06;
    case "joker+vet":
      return 0.04;
    default:
      return 0;
  }
}

export interface PairView {
  a: string;
  b: string;
  quality: number;
  stops: number;
  note: string;
}

export function pairs(c: PitCrewState): PairView[] {
  const out: PairView[] = [];
  const by = new Map(c.members.map((m) => [m.id, m] as const));
  for (let i = 0; i < c.lineup.length; i++)
    for (let j = i + 1; j < c.lineup.length; j++) {
      const a = by.get(c.lineup[i]!)!;
      const b = by.get(c.lineup[j]!)!;
      const stops = c.bond[key(a.id, b.id)] ?? 0;
      const f = stops / (stops + 12);
      const cp = compat(a.temper, b.temper);
      const quality = clamp(0.55 * f + 0.45 * (0.5 + cp * 2), 0, 1);
      const note = cp <= -0.1 ? "They clash" : cp >= 0.1 ? "They click" : f < 0.4 ? "Still learning each other" : f > 0.75 ? "Years together" : "Fine";
      out.push({ a: a.name, b: b.name, quality, stops, note });
    }
  return out;
}

export function chemistry(c: PitCrewState): number {
  const p = pairs(c);
  return p.length ? p.reduce((x, y) => x + y.quality, 0) / p.length : 0.5;
}

export interface CrewEffect {
  /** 0..1 as the simulator's pit crew rating. */
  speed: number;
  /** Chance that any one stop goes wrong. */
  fumble: number;
  chemistry: number;
  skill: number;
}

export function crewEffect(c: PitCrewState): CrewEffect {
  const by = new Map(c.members.map((m) => [m.id, m] as const));
  let sum = 0;
  let wsum = 0;
  c.lineup.forEach((id, i) => {
    const m = by.get(id);
    if (!m) return;
    const w = i < 2 ? 1.4 : 1;
    // a man on the job he is best at is a little quicker
    const fit = (i < 2 && m.best === "jack") || (i >= 2 && m.best === "gun") ? 1.03 : 0.96;
    sum += w * m.skill * fit;
    wsum += w;
  });
  const skill = sum / Math.max(1, wsum) / 100;
  const chem = chemistry(c);
  const speed = clamp(skill + (chem - 0.5) * 0.08, 0.35, 1);
  const fumble = clamp(0.1 - chem * 0.085 - (speed - 0.7) * 0.05, 0.008, 0.14);
  return { speed, fumble, chemistry: chem, skill };
}

/** Swap who stands in a slot. If he already stands elsewhere the two swap places. Familiarity takes a hit for the people who moved. */
export function setSlot(c: PitCrewState, slot: number, memberId: string): string | null {
  if (slot < 0 || slot >= c.lineup.length) return "No such slot.";
  if (!c.members.some((m) => m.id === memberId)) return "No such crew member.";
  const cur = c.lineup[slot]!;
  if (cur === memberId) return null;
  const at = c.lineup.indexOf(memberId);
  if (at >= 0) c.lineup[at] = cur;
  c.lineup[slot] = memberId;
  // the newcomers lose a part of the habits built with their new neighbours
  for (const k of Object.keys(c.bond)) {
    if (k.includes(memberId) || (at >= 0 && k.includes(cur))) c.bond[k] = Math.floor((c.bond[k] ?? 0) * 0.7);
  }
  return null;
}

/** After a race: every pair that worked a stop together gets better at it, and the young ones learn. */
export function afterStops(c: PitCrewState, stops: number, slow: number, best?: number) {
  if (stops <= 0) return;
  c.stops += stops;
  c.slow += slow;
  if (best !== undefined && (c.best === undefined || best < c.best)) c.best = best;
  for (let i = 0; i < c.lineup.length; i++)
    for (let j = i + 1; j < c.lineup.length; j++) {
      const k = key(c.lineup[i]!, c.lineup[j]!);
      c.bond[k] = Math.min(200, (c.bond[k] ?? 0) + stops);
    }
  for (const id of c.lineup) {
    const m = c.members.find((x) => x.id === id);
    if (!m) continue;
    m.stops += stops;
    if (m.stops < 60) m.skill = round2(Math.min(95, m.skill + 0.12 * stops));
  }
}
