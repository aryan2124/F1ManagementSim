import { clamp, round2 } from "./util";
import { teamRanking, teamStaff } from "./car";
import { driversOf } from "./finance";
import type { CareerState } from "./types";

/**
 * The factor bus. Every outcome in the game is a base value times named factors read from here, so a change in one
 * system (a hire, a result, a story) shows up in many outputs and the "why" hover can say which factor did it.
 * All factors are multipliers centred on 1.
 */
export const FACTOR_NAMES = ["talent", "tools", "knowledge", "cohesion", "reputation", "funding", "form", "story"] as const;
export type FactorName = (typeof FACTOR_NAMES)[number];
export interface Factor {
  name: FactorName;
  value: number;
  /** Plain-language reason for the number. */
  why: string;
}
export type FactorSet = Record<FactorName, Factor>;

const mean = (xs: number[], d = 0.5) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : d);
const mk = (name: FactorName, raw: number, span: number, why: string): Factor => ({ name, value: round2(clamp(1 + (raw - 0.5) * span, 1 - span / 2, 1 + span / 2)), why });

/** How strong the rest of the field is by rank: 0 for the last team, 1 for the first. */
export function rankFactor(s: CareerState, teamId: string): number {
  const r = teamRanking(s);
  const i = r.indexOf(teamId);
  if (i < 0 || r.length < 2) return 0.5;
  return 1 - i / (r.length - 1);
}

let cacheKey = "";
let cache: Record<string, FactorSet> = {};

/** Test hook: pins named factors to a value so a removal test can see what each one moves. */
export const factorTrial: Partial<Record<FactorName, number>> = {};

export function factorsOf(s: CareerState, teamId: string): FactorSet {
  const key = `${s.seed}:${s.day}:${s.uid}:${s.round}:${s.teamId}`;
  if (key !== cacheKey) { cacheKey = key; cache = {}; }
  const trial = Object.keys(factorTrial).length > 0;
  if (!trial && cache[teamId]) return cache[teamId];
  const t = s.teams[teamId];
  const drivers = driversOf(s, teamId);
  const staff = teamStaff(s, teamId);
  const talentRaw = mean([...drivers.map((d) => (d.spec.pace - 0.92) / 0.09), ...staff.filter((x) => x.skill).map((x) => x.skill / 100)]);
  const fac = t.facilities;
  const toolsRaw = mean([fac.tunnel, fac.sim, fac.factory].map((x) => x / 5));
  const knowRaw = mean(Object.values(t.know ?? {}).map((k) => 1 - clamp(k.err / 0.3, 0, 1)));
  const cohRaw = mean([...staff.map((x) => x.mood), ...drivers.map((d) => (d.morale + d.trust) / 2)]);
  // never reads car ratings here: carSpec reads this factor, so a rating lookup would loop
  const humanFans = s.brand && teamId === s.teamId ? s.brand.fans / 100 : 0.3 + clamp(t.board / 100, 0, 1) * 0.4;
  // a rich history makes the market see a team differently: titles and finished stories count
  const heritage = teamId === s.teamId ? clamp(((s.chronicle?.length ?? 0) * 0.5 + s.legacy.length) / 14, 0, 1) : clamp((t.wcc?.length ?? 0) / 12, 0, 1);
  const repRaw = mean([humanFans, 0.25 + 0.5 * heritage, clamp(t.board / 100, 0, 1), teamId === s.teamId ? (s.press.mood + 1) / 2 : 0.5]);
  const sponsorTotal = t.sponsors.reduce((a, x) => a + x.retainer, 0);
  const fundRaw = clamp(0.35 + clamp(t.cash / 120, -0.3, 0.4) + clamp(sponsorTotal / 160, 0, 0.3), 0, 1);
  const standing = Object.keys(s.teams).sort((a, b) => (s.standings.teams[b] ?? 0) - (s.standings.teams[a] ?? 0)).indexOf(teamId);
  const formRaw = s.standings.races.length ? 1 - standing / Math.max(1, Object.keys(s.teams).length - 1) : 0.5;
  // a bold shape gets noticed: the more the dials sit away from the middle, the louder the car
  const dsg = t.design;
  const bold = dsg ? clamp(Object.values(dsg).reduce((a, v) => a + Math.abs(v - 0.5), 0) / 4, 0, 0.5) : 0;
  const heat = clamp((teamId === s.teamId ? s.press.heat : 0.3) + 0.2 * bold, 0, 1);
  const set: FactorSet = {
    talent: mk("talent", talentRaw, 0.2, "Drivers' pace and the skill of the people around them"),
    tools: mk("tools", toolsRaw, 0.2, "Tunnel, simulator and factory levels"),
    knowledge: mk("knowledge", knowRaw, 0.2, "How well the team knows its own car"),
    cohesion: mk("cohesion", cohRaw, 0.2, "Mood and trust across staff and drivers"),
    reputation: mk("reputation", repRaw, 0.3, "Fans, board confidence and the press"),
    funding: mk("funding", fundRaw, 0.3, "Cash in hand and sponsor money"),
    form: mk("form", formRaw, 0.2, "Where the team sits in the championship"),
    story: mk("story", heat, 0.2, "How hot the story around the team is"),
  };
  for (const k of Object.keys(factorTrial) as FactorName[]) set[k] = { ...set[k], value: factorTrial[k] as number };
  if (!trial) cache[teamId] = set;
  return set;
}

/** Product of the named factors (all of them if none are named), with a breakdown for hover text. */
export function multiply(s: CareerState, teamId: string, names: FactorName[] = [...FACTOR_NAMES]): { value: number; parts: Factor[] } {
  const f = factorsOf(s, teamId);
  const parts = names.map((n) => f[n]);
  return { value: round2(parts.reduce((a, p) => a * p.value, 1)), parts };
}

export const whyText = (m: { value: number; parts: Factor[] }) =>
  m.parts.filter((p) => Math.abs(p.value - 1) >= 0.01).map((p) => `${p.name} ${p.value >= 1 ? "+" : ""}${Math.round((p.value - 1) * 100)}% (${p.why})`).join("; ") || "No factor moves this.";
