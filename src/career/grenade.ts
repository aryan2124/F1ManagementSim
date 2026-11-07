import { Rng, hashSeed } from "../sim/rng";
import { rulesOf } from "./eras";
import { news } from "./cards";
import { clamp } from "./util";
import type { CareerState, WeekendState } from "./types";

/** Grenade era: each team has a fixed pool of destructive engine runs a season. One run is a whole weekend. */
export const GRENADE_POOL = 6;
/** What a grenade weekend gives: peak power, and what it costs in engine life. */
export const GRENADE_POWER = 0.006;
export const GRENADE_RELIABILITY = 0.04;

export const grenadeLive = (s: CareerState) => !!rulesOf(s).enginePackages;

export function grenadeUsed(s: CareerState, teamId: string): number {
  const g = s.grenade?.[teamId];
  return g && g.year === s.year ? g.used : 0;
}
/** Runs left in the pool, counting this weekend's if it is already switched on. */
export function grenadeLeft(s: CareerState, teamId: string): number {
  return GRENADE_POOL - grenadeUsed(s, teamId) - (s.weekend?.grenade?.[teamId] ? 1 : 0);
}
export const grenadeOn = (s: CareerState, teamId: string) => !!s.weekend?.grenade?.[teamId];

/** The player's switch. Only before the race has started, and only while the pool lasts. */
export function setGrenade(s: CareerState, on: boolean): string {
  const ws = s.weekend;
  if (!ws || !grenadeLive(s)) return "That rule is not in force.";
  if (ws.stage === "race" && ws.results.quali) return "The race is about to start. The engine mode is locked.";
  if (ws.stage === "done") return "The weekend is over.";
  ws.grenade ??= {};
  if (on) {
    if (grenadeLeft(s, s.teamId) <= 0) return "No grenade runs left this season.";
    ws.grenade[s.teamId] = true;
    return `Grenade mode on: more power this weekend, less engine life. ${grenadeLeft(s, s.teamId)} runs will be left.`;
  }
  delete ws.grenade[s.teamId];
  return "Grenade mode off. The run goes back in the pool.";
}

/** At the start of a weekend the AI teams decide: richer teams and teams with runs to spare burn one more often. */
export function aiGrenades(s: CareerState, ws: WeekendState): void {
  if (!grenadeLive(s)) return;
  ws.grenade ??= {};
  const rng = new Rng(hashSeed(`grenade:${s.seed}:${s.year}:${s.round}`));
  const roundsLeft = Math.max(1, s.calendar.length - s.round);
  for (const id of Object.keys(s.teams).sort()) {
    if (id === s.teamId || s.humans?.includes(id)) continue;
    const left = GRENADE_POOL - grenadeUsed(s, id);
    if (left <= 0) continue;
    if (rng.chance(clamp((left / roundsLeft) * 1.5, 0, 0.9))) ws.grenade[id] = true;
  }
}

/** When the race is done the runs are spent and the engines pay for it. */
export function commitGrenades(s: CareerState): void {
  const ws = s.weekend;
  if (!ws?.grenade || ws.grenadeSpent) return;
  ws.grenadeSpent = true;
  s.grenade ??= {};
  const burnt: string[] = [];
  for (const id of Object.keys(ws.grenade).sort()) {
    const g = s.grenade[id];
    s.grenade[id] = { year: s.year, used: (g && g.year === s.year ? g.used : 0) + 1 };
    burnt.push(id);
  }
  if (burnt.length) news(s, `${burnt.length} team${burnt.length > 1 ? "s" : ""} ran grenade engine modes this weekend.`, { importance: 1, cause: "Engines", tag: "rules" });
}
