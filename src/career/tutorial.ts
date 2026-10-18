import { newCareer } from "./world";
import { planSession, runRace, startWeekend } from "./weekend";
import { AREAS, TRAITS, type CareerState, type Trait } from "./types";
import { TRAIT_NAME, addArea } from "./traits";
import { baseTeam } from "./car";
import { round2 } from "./util";

/**
 * The tutorial runs on a practice career: a fixed seed, a short race, the gentlest rivals and full hints.
 * It is never saved, so nothing done in it touches a real career.
 */
export const TUTORIAL_SEED = 4242;
export function tutorialCareer(teamId = "wil"): CareerState {
  return newCareer(teamId, TUTORIAL_SEED, 0, "quick", { eraMode: "natural", guidance: "full" });
}

export interface DemoRow { team: string; id: string; pts: number; best: number }
export interface DemoResult {
  before: DemoRow[];
  after: DemoRow[];
  /** What the rules now reward: how much each trait is worth, before and after. */
  weights: { trait: Trait; name: string; from: number; to: number }[];
  gp: string;
}

function standing(s: CareerState, order: { carId: string; points: number }[]): DemoRow[] {
  const by: Record<string, DemoRow> = {};
  order.forEach((r, i) => {
    const id = s.drivers[r.carId]?.teamId ?? r.carId;
    const row = (by[id] ??= { team: baseTeam(id).name, id, pts: 0, best: 99 });
    row.pts += r.points;
    row.best = Math.min(row.best, i + 1);
  });
  return Object.values(by).sort((a, b) => b.pts - a.pts || a.best - b.best);
}

function quickRace(c: CareerState): DemoRow[] {
  c.raceLength = "quick";
  if (!c.weekend) c.weekend = startWeekend(c);
  const plan = planSession(c, "race", true);
  const rows = runRace(plan).results();
  return standing(c, rows.map((r) => ({ carId: r.carId, points: r.points })));
}

/**
 * Two short races on the same grid: one under today's rules and one after a drastic rewrite. In the rewrite the rules stop paying
 * for what the player's team is best at and start paying for what it is worst at, and every team's figures are pulled
 * toward the middle the way a new era does it. Nothing touches the real state: both races run on copies.
 */
export function rulesDemo(s: CareerState): DemoResult {
  const a = structuredClone(s);
  const before = quickRace(a);
  const b = structuredClone(s);
  const w = (b.regW ??= Object.fromEntries(TRAITS.map((t) => [t, 1])) as Record<Trait, number>);
  const from = { ...w };
  const me = b.teams[b.teamId];
  const ranked = [...TRAITS].sort((x, y) => me.dna[y] - me.dna[x]);
  const strong = ranked.slice(0, 3);
  const weak = ranked.slice(-3);
  for (const t of strong) w[t] = round2(w[t] * 0.45);
  for (const t of weak) w[t] = round2(Math.max(w[t] + 0.3, Math.min(2.6, w[t] * 1.9)));
  for (const area of AREAS) {
    const ts = Object.values(b.teams);
    const mean = ts.reduce((x, t) => x + t.car[area], 0) / ts.length;
    for (const t of ts) addArea(t, area, round2(mean + (t.car[area] - mean) * 0.6) - t.car[area]);
  }
  const after = quickRace(b);
  const weights = [...strong, ...weak].map((t) => ({ trait: t, name: TRAIT_NAME[t], from: from[t], to: w[t] }));
  return { before, after, weights, gp: "" };
}
