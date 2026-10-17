import { staffOf } from "./car";
import { fitFor } from "./capability";
import { capRoom } from "./rnd";
import { AREA_TRAITS, TRAIT_AREA, TRAIT_GAIN_K, TRAIT_NAME, areaOfPair } from "./traits";
import { AREAS, TRAITS } from "./types";
import type { CareerState, Guidance, Know, Trait } from "./types";
import { round2 } from "./util";

/**
 * The optional help. With guidance off the game shows only facts and numbers, and the player reads them.
 * Hints add plain-language flags about what looks unsure or lopsided. Full adds explicit recommendations.
 * Nothing here changes any outcome; it only changes what the screens say.
 */

export const guidanceOf = (s: CareerState): Guidance => s.guidance ?? "off";
export const wantsHints = (s: CareerState) => guidanceOf(s) !== "off";
export const wantsAdvice = (s: CareerState) => guidanceOf(s) === "full";

export const GUIDANCE_LABEL: Record<Guidance, string> = { off: "FACTS ONLY", hints: "HINTS", full: "FULL ADVICE" };
export const GUIDANCE_TEXT: Record<Guidance, string> = {
  off: "The game shows numbers and error bars and nothing else. You read them and decide.",
  hints: "Adds plain-language flags where something looks unsure, lopsided or badly staffed. It never says what to do.",
  full: "Adds recommendations: which parts look worth the money, what to study next, and where your people and your concept disagree.",
};

/** The best guess at how much one part would change its area, using only what the team believes. Minus is not used: bigger is faster. */
export function believedAreaGain(s: CareerState, teamId: string, tr: Trait, predicted: number): number {
  const t = s.teams[teamId];
  const [x, y] = AREA_TRAITS[TRAIT_AREA[tr]];
  const pipe = pipeline(s, teamId);
  const bx = t.know[x].est + pipe[x];
  const by = t.know[y].est + pipe[y];
  const cur = areaOfPair(bx, by);
  const k = { x: bx + (tr === x ? predicted * TRAIT_GAIN_K : 0), y: by + (tr === y ? predicted * TRAIT_GAIN_K : 0) };
  const w = 0.3 + 0.7 * (t.regKnow[tr]?.est ?? 1);
  return round2((areaOfPair(k.x, k.y) - cur) * w);
}

export const rangeOf = (k: Know) => ({ lo: round2(k.est - k.err), hi: round2(k.est + k.err) });

export interface Hint {
  text: string;
  tone: "info" | "warn";
}

export function hints(s: CareerState): Hint[] {
  if (!wantsHints(s)) return [];
  const t = s.teams[s.teamId];
  const out: Hint[] = [];
  const loose = TRAITS.filter((tr) => t.know[tr].err > 0.14).sort((a, b) => t.know[b].err - t.know[a].err);
  if (loose.length) out.push({ tone: "info", text: `The numbers on ${loose.slice(0, 3).map((x) => TRAIT_NAME[x].toLowerCase()).join(", ")} are loose (error bars of ${t.know[loose[0]].err.toFixed(2)} s or more). A study or a run at the track would firm them up.` });
  for (const a of AREAS) {
    const [x, y] = AREA_TRAITS[a];
    const d = t.know[x].est - t.know[y].est;
    if (Math.abs(d) > Math.max(0.14, t.know[x].err + t.know[y].err)) {
      const weak = d < 0 ? x : y;
      const strong = d < 0 ? y : x;
      out.push({ tone: "warn", text: `${TRAIT_NAME[weak]} looks about ${Math.abs(d).toFixed(2)} s behind ${TRAIT_NAME[strong].toLowerCase()}. A lopsided pair costs lap time, and the weaker side is where a part pays best.` });
    }
  }
  for (const p of t.projects.filter((q) => q.status === "building" && q.lead)) {
    const st = s.staff[p.lead as string];
    if (!st || !p.trait) continue;
    const f = fitFor(s, st, t.concept, p.trait, t.projects.filter((q) => q.status === "building" && q.lead === st.id).length);
    if (f.mult < 0.8) out.push({ tone: "warn", text: `${st.name} is leading "${p.name}" but is a poor fit: ${f.specialty < 0.4 ? "this is not their specialty" : f.philosophy < 0.45 ? "their instincts pull against your concept" : "they are stretched across too many projects"}.` });
  }
  const unknownRegs = TRAITS.filter((tr) => t.regKnow[tr].err > 0.28);
  if (unknownRegs.length >= 6) out.push({ tone: "info", text: "You have barely studied what the regulations reward. Which traits matter most is still a guess." });
  if (capRoom(t) < 8) out.push({ tone: "warn", text: `Only ${capRoom(t).toFixed(1)}m of cap room is left this season.` });
  return out;
}

export interface Pick {
  id: number;
  why: string;
  score: number;
}

/** Full advice: each proposal scored by the gain the team believes it makes per dollar of cap room, with the reason in words. */
export function picks(s: CareerState): Pick[] {
  if (!wantsAdvice(s)) return [];
  const t = s.teams[s.teamId];
  const rows = t.ideas
    .filter((i) => i.trait)
    .map((i) => {
      const mid = (i.predLo + i.predHi) / 2;
      const g = believedAreaGain(s, s.teamId, i.trait as Trait, mid);
      const sure = i.kind === "gamble" ? 0.7 : 1;
      return { i, g, score: (g * sure) / Math.max(1, i.cost) };
    })
    .sort((a, b) => b.score - a.score);
  return rows.slice(0, 3).map(({ i, g, score }) => ({ id: i.id, score, why: `On your numbers it moves ${TRAIT_NAME[i.trait as Trait].toLowerCase()} and gains the area about ${g.toFixed(2)} s for ${i.cost.toFixed(1)}m.` }));
}

export function studyAdvice(s: CareerState): string[] {
  if (!wantsAdvice(s)) return [];
  const t = s.teams[s.teamId];
  const rows = TRAITS.map((tr) => ({ tr, v: t.know[tr].err * (0.6 + 0.4 * (t.regKnow[tr]?.est ?? 1)) })).sort((a, b) => b.v - a.v);
  const out: string[] = [];
  if (rows[0].v > 0.1) out.push(`Study ${TRAIT_NAME[rows[0].tr].toLowerCase()} next: it is the loosest number on the car (${t.know[rows[0].tr].err.toFixed(2)} s).`);
  const regs = TRAITS.map((tr) => ({ tr, e: t.regKnow[tr].err })).sort((a, b) => b.e - a.e)[0];
  if (regs.e > 0.2) out.push(`Study what the rules reward in ${TRAIT_NAME[regs.tr].toLowerCase()}: you have the least idea about it.`);
  return out;
}

export function conceptAdvice(s: CareerState): string | null {
  if (!wantsAdvice(s)) return null;
  const t = s.teams[s.teamId];
  const crew = [staffOf(s, s.teamId, "aero"), staffOf(s, s.teamId, "power"), staffOf(s, s.teamId, "designer"), staffOf(s, s.teamId, "td")].filter(<T,>(x: T | undefined): x is T => !!x);
  const withPhil = crew.filter((x) => x.phil);
  if (!withPhil.length) return null;
  const avg = { df: 0, risk: 0, innov: 0 };
  for (const x of withPhil) for (const k of ["df", "risk", "innov"] as const) avg[k] += (x.phil as typeof avg)[k] / withPhil.length;
  const gap = Math.abs(avg.df - t.concept.df) + Math.abs(avg.risk - t.concept.risk) + Math.abs(avg.innov - t.concept.innov);
  if (gap < 0.9) return "Your people and your concept point the same way.";
  return `Your design staff lean ${avg.df > 0.15 ? "towards downforce" : avg.df < -0.15 ? "towards low drag" : "neutral on downforce"}, ${avg.risk > 0.15 ? "radical" : avg.risk < -0.15 ? "proven" : "balanced"} and ${avg.innov > 0.15 ? "inventive" : avg.innov < -0.15 ? "refining" : "balanced"}. Your concept disagrees with them, which costs part quality. Either move the concept or hire people who share it.`;
}


/** What the projects already running or waiting would add to each trait if they deliver what the staff predict (a fact, not advice). */
export function pipeline(s: CareerState, teamId: string): Record<Trait, number> {
  const t = s.teams[teamId];
  const out = Object.fromEntries(TRAITS.map((tr) => [tr, 0])) as Record<Trait, number>;
  for (const p of t.projects) {
    if ((p.status === "building" || p.status === "ready") && p.trait) out[p.trait] = round2(out[p.trait] + ((p.predLo + p.predHi) / 2) * TRAIT_GAIN_K);
  }
  return out;
}
