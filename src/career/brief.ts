import { CIRCUITS } from "../game/circuits";
import { AREA_TRAITS, TRAIT_AREA, TRAIT_GAIN_K, TRAIT_NAME, IMB, areaOfPair, trackNeed, traitWeight } from "./traits";
import { NEXT_YEAR_GAIN, SHORT_LIFE, accuracy, boostsFor } from "./rnd";
import { planOf } from "./rndplan";
import { clamp, rngFor, round2 } from "./util";
import { TRAITS, type Area, type CareerState, type Idea, type Project, type Trait } from "./types";

/** The next few races, with how much each one rewards a given trait (the circuit's character, which anyone can read). */
export interface UpRace { round: number; circuitId: string; gp: string; day: number; sprint: boolean }
export function upcomingRaces(s: CareerState, n = 5, from = s.day): UpRace[] {
  return s.calendar
    .filter((c) => c.day >= from)
    .slice(0, n)
    .map((c) => ({ round: c.round, circuitId: c.circuitId, gp: CIRCUITS.find((x) => x.id === c.circuitId)?.short ?? c.circuitId, day: c.day, sprint: c.sprint }));
}

/** How much a track rewards this trait, 1 is average. Public knowledge: downforce tracks, power tracks, harsh and kind tracks for tyres. */
export const trackFactor = (tr: Trait, circuitId: string): number => traitWeight({} as Record<Trait, number>, tr, trackNeed(circuitId));

export interface Problem {
  trait: Trait;
  area: Area;
  /** How far behind the average car, as the staff read it, in seconds of trait. Positive is behind. */
  gap: number;
  /** How far the staff could be out, seconds. */
  unsure: number;
  /** The upcoming races and how much each rewards fixing this. */
  races: { gp: string; round: number; f: number }[];
  /** Weighted worth of closing the gap over the next races (what ranks the problems). */
  worth: number;
  who?: string;
}

/**
 * The engineers' report on where the car is losing time: the three traits where it trails the field most, weighted by the races coming up.
 * It is a reading, not the truth: it is built from what the team believes about its own car and a noisy picture of the others.
 */
export function diagnose(s: CareerState, teamId = s.teamId): Problem[] {
  const t = s.teams[teamId];
  const rng = rngFor(s, `diag:${teamId}:${Math.floor(s.day / 14)}`);
  const races = upcomingRaces(s, 5);
  const teams = Object.values(s.teams);
  const out: Problem[] = [];
  for (const tr of TRAITS) {
    const area = TRAIT_AREA[tr];
    const avg = teams.reduce((a, q) => a + q.dna[tr], 0) / teams.length;
    const mine = t.know[tr]?.est ?? t.dna[tr];
    const err = t.know[tr]?.err ?? 0.1;
    const acc = accuracy(s, teamId, area, tr);
    const noise = rng.gauss() * (0.02 + 0.06 * (1 - acc));
    const gap = round2(avg - mine + noise);
    const rf = races.map((r) => ({ gp: r.gp, round: r.round, f: round2(trackFactor(tr, r.circuitId)) }));
    const mean = rf.length ? rf.reduce((a, r) => a + r.f, 0) / rf.length : 1;
    const worth = gap * mean * (0.3 + 0.7 * (t.regKnow?.[tr]?.est ?? 1));
    out.push({ trait: tr, area, gap, unsure: round2(Math.max(0.02, err * 0.6 + (1 - acc) * 0.05)), races: rf, worth: round2(worth) });
  }
  out.sort((a, b) => b.worth - a.worth);
  return out.slice(0, 3);
}

export const briefActive = (s: CareerState, teamId = s.teamId) => {
  const b = planOf(s.teams[teamId]).brief;
  return b && s.day <= b.until ? b : undefined;
};

/** What a part does to the pair it sits in: the lopsided price before and after, so the player can see whether it evens the car out or tilts it. */
export function balanceChange(s: CareerState, i: Pick<Idea, "trait" | "side" | "predLo" | "predHi">, teamId = s.teamId): { pairBefore: number; pairAfter: number; lopsided: number } | null {
  const tr = i.trait;
  if (!tr) return null;
  const t = s.teams[teamId];
  const [x, y] = AREA_TRAITS[TRAIT_AREA[tr]];
  const mid = (i.predLo + i.predHi) / 2;
  const bx = t.know[x]?.est ?? t.dna[x];
  const by = t.know[y]?.est ?? t.dna[y];
  const nx = bx + (tr === x ? mid * TRAIT_GAIN_K : 0);
  const ny = by + (tr === y ? mid * TRAIT_GAIN_K : 0);
  const pairBefore = areaOfPair(bx, by);
  let ax = nx, ay = ny;
  if (i.side) {
    // the side effect may land in the other pair
    if (i.side.trait === x) ax -= i.side.amount * TRAIT_GAIN_K;
    if (i.side.trait === y) ay -= i.side.amount * TRAIT_GAIN_K;
  }
  return { pairBefore: round2(pairBefore), pairAfter: round2(areaOfPair(ax, ay)), lopsided: round2(IMB * Math.abs(ax - ay) - IMB * Math.abs(bx - by)) };
}

/** Everything a pitch needs to be judged on besides its lap time. */
export interface Profile {
  /** How much each upcoming race rewards this part's trait. */
  fit: { gp: string; round: number; f: number; after: boolean }[];
  landsDay: number;
  racesAfter: number;
  racesLeft: number;
  slots: { used: number; max: number };
  side?: { trait: Trait; amount: number; name: string };
  balance: ReturnType<typeof balanceChange>;
  inBrief: boolean;
}

export function profileOf(s: CareerState, i: Idea, slotsMax: number): Profile {
  const t = s.teams[s.teamId];
  const landsDay = s.day + i.days;
  const races = upcomingRaces(s, 6);
  const left = s.calendar.filter((c) => c.day >= s.day).length;
  const after = s.calendar.filter((c) => c.day > landsDay).length;
  const fit = races.map((r) => ({ gp: r.gp, round: r.round, f: i.trait ? round2(trackFactor(i.trait, r.circuitId)) : 1, after: r.day > landsDay }));
  const b = briefActive(s);
  return {
    fit,
    landsDay,
    racesAfter: after,
    racesLeft: left,
    slots: { used: t.projects.filter((p) => p.status === "building").length, max: slotsMax },
    side: i.side ? { trait: i.side.trait, amount: i.side.amount, name: TRAIT_NAME[i.side.trait] } : undefined,
    balance: balanceChange(s, i),
    inBrief: !!b && b.trait === i.trait,
  };
}

export const clampN = clamp;
export type { Project };

/** What a pitch really costs and gives once the dials and any weekend data are applied. */
export interface Dialled { life: "short" | "long"; horizon: "now" | "next" }
export function previewIdea(s: CareerState, i: Idea, dl: Dialled) {
  const next = dl.horizon === "next";
  const short = dl.life === "short" && !next;
  const g = next ? NEXT_YEAR_GAIN : short ? SHORT_LIFE.gain : 1;
  let cost = i.cost * (short ? SHORT_LIFE.cost : 1);
  let days = i.days;
  let lo = i.predLo * g;
  let hi = i.predHi * g;
  const b = i.trait ? boostsFor(s, s.teamId, i.trait) : { pct: 0, why: "" };
  if (b.pct > 0) {
    cost *= 1 - b.pct;
    days = Math.max(3, Math.round(days * (1 - 0.6 * b.pct)));
    const mid = (lo + hi) / 2;
    const half = ((hi - lo) / 2) * (1 - 0.8 * b.pct);
    lo = mid - half;
    hi = mid + half;
  }
  return { cost: round2(cost), days, predLo: round2(lo), predHi: round2(hi), boost: b.pct > 0 ? { pct: b.pct, why: b.why } : undefined, short, next };
}
