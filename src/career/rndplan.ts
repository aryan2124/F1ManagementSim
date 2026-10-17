import { staffOf } from "./car";
import { accuracy } from "./rnd";
import { rngFor } from "./util";
import { AREAS, AREA_LABEL, type Area, type CareerState, type Idea, type RndPlan, type TeamState } from "./types";

export const planOf = (t: TeamState): RndPlan => {
  if (!t.plan) t.plan = { focus: "balanced", stance: "balanced", until: 0, synergy: {}, cheapUntil: 0 };
  return t.plan;
};

/** The focus lapses after four weeks. */
export function activePlan(s: CareerState, t: TeamState): RndPlan {
  const p = planOf(t);
  if (p.focus !== "balanced" && s.day > p.until) p.focus = "balanced";
  return p;
}

export const FOCUS_TEXT: Record<string, string> = {
  balanced: "Even effort on every area.",
  bank: "Almost no new work. Cap room and tunnel hours pile up for later, and the next project you start costs 10 percent less.",
};
export const STANCE_TEXT: Record<RndPlan["stance"], string> = {
  safe: "Mostly sure things: small gains with a narrow range, few flops.",
  balanced: "A mix of sure things, gambles and groundwork.",
  bold: "Many gambles: some are big, some do nothing, and one in five makes the car slower.",
};

/** Odds an area produces an idea this week, given the focus. */
export function areaChance(plan: RndPlan, area: Area, base: number): number {
  if (plan.focus === "bank") return base * 0.3;
  if (plan.focus === "balanced") return base;
  return plan.focus === area ? Math.min(0.95, base + 0.4) : base * 0.55;
}

/** Which kind of idea comes up, given the stance. */
export function pickKind(plan: RndPlan, r: number): NonNullable<Idea["kind"]> {
  const w = plan.stance === "safe" ? [0.72, 0.08] : plan.stance === "bold" ? [0.4, 0.42] : [0.6, 0.2];
  if (plan.focus === "bank") return r < 0.5 ? "enabler" : "safe";
  return r < w[0] ? "safe" : r < w[0] + w[1] ? "gamble" : "enabler";
}

export const KIND_LABEL: Record<NonNullable<Idea["kind"]>, string> = { safe: "SURE THING", gamble: "GAMBLE", enabler: "GROUNDWORK" };
export const KIND_TEXT: Record<NonNullable<Idea["kind"]>, string> = {
  safe: "A solid, well understood change. The range is narrow.",
  gamble: "A radical idea. It could be big, it could do nothing, and it could make the car slower.",
  enabler: "Little gain on its own, but the next part you fit in this area gains about 35 percent more.",
};

/** The head of R&D's view of where the car is weakest. A sharper head reads it correctly more often. */
export function weakestArea(s: CareerState, teamId: string): Area {
  const t = s.teams[teamId];
  const rng = rngFor(s, `weak:${teamId}`);
  const teams = Object.values(s.teams);
  let best: Area = "aero";
  let worst = Infinity;
  for (const a of AREAS) {
    const avg = teams.reduce((x, q) => x + q.car[a], 0) / teams.length;
    const gap = t.car[a] - avg;
    const score = gap + rng.gauss() * (1 - accuracy(s, teamId, a)) * 0.08;
    if (score < worst) {
      worst = score;
      best = a;
    }
  }
  return best;
}

/** How the head picks an idea when the player has delegated. Skill decides what they weigh. */
export function ideaScore(s: CareerState, t: TeamState, i: Idea): number {
  const td = staffOf(s, t.id, "td");
  const skill = td?.skill ?? 60;
  const mid = (i.predLo + i.predHi) / 2;
  const plan = activePlan(s, t);
  let v = skill >= 70 ? mid / i.cost : skill >= 55 ? mid / Math.max(1, i.cost) * 0.8 + mid * 0.3 : mid; // weak heads chase the biggest number
  if (plan.focus === i.area) v *= 1.4;
  if (i.kind === "enabler") v += skill >= 70 ? 0.015 : -0.01; // only a good head sees the groundwork
  if (i.kind === "gamble") {
    const des = staffOf(s, t.id, "designer");
    if (des?.traits.includes("innovator")) v *= 1.2;
    if (des?.traits.includes("cautious")) v *= 0.7;
    if (skill < 55) v *= 1.15;
  }
  return v;
}

export const focusLabel = (f: RndPlan["focus"]) => (f === "balanced" ? "Balanced" : f === "bank" ? "Bank the budget" : AREA_LABEL[f]);
