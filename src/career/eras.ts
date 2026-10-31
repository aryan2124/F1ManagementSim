import { circuitMeta } from "../game/circuits";
import { baseTeam, carRating, carSpec, standingsRank, teamRanking, noisyRanking } from "./car";
import { launchDay, summerStart } from "./calendar";
import { news, pushCard, ticker } from "./cards";
import { accuracy } from "./rnd";
import { MODULES, MODULE_BY_ID, THEMES, THEME_LABEL, describeIntensity, type Flags, type Theme } from "./modules";
import { logSpend } from "./log";
import { clamp, isHuman, rngFor, round2 } from "./util";
import { AREAS, type Area, type CareerState } from "./types";
import { staffOf } from "./car";
import { addArea } from "./traits";
import { shiftBelief } from "./know";
import { VOTE_NEEDED, holdVote } from "./vote";
import type { Rng } from "../sim/rng";

/**
 * The regulation era engine. A new era is designed years ahead from the state of the sport, announced in five stages,
 * and nobody (the player or the AI teams) is told which design route is best. Every number is the game's own design.
 */

export interface EraUnknown {
  id: string;
  moduleId: string;
  label: string;
  /** The hidden truth, 0..1. */
  truth: number;
}
export interface EraRoute {
  id: number;
  name: string;
  blurb: string;
  areas: Partial<Record<Area, number>>;
  /** How each unknown moves this route's quality, summing to 1 in absolute value. */
  weights: Record<string, number>;
  /** How much a fast calendar helps (positive) or hurts (negative). */
  fast: number;
  /** Late changes to the route's quality. */
  amend: number;
}
export interface EraModule {
  id: string;
  role: "headline" | "support" | "extra";
  intensity: number;
  /** Net lobbying, whole steps. */
  lobby: number;
}
export interface EraDef {
  number: number;
  theme: Theme;
  why: string[];
  startYear: number;
  length: number;
  modules: EraModule[];
  unknowns: EraUnknown[];
  routes: EraRoute[];
  /** 0 designed in secret, 1 framework, 2 draft, 3 final, 4 late amendment, 5 launched. */
  stage: number;
  amendment?: string;
  /** Share of the calendar on fast circuits, known to everyone. */
  fastShare: number;
}
export interface Lab {
  unknown: string;
  done: number;
}
export interface TeamEraPlan {
  route: number | null;
  hedge: number | null;
  split: number;
  progress: number;
  known: Record<string, [number, number]>;
  labs: Lab[];
  labsDone: number;
  package?: "sprinter" | "marathoner" | "balanced";
  lobbied: Record<string, 1 | -1>;
  /** The player's votes per module, and trades agreed with other teams. */
  votes?: Record<string, 1 | -1 | 0>;
  pledges?: { team: string; mine: string; theirs: string }[];
}
export interface Ballot {
  yes: string[];
  no: string[];
  abstain: string[];
  needed: number;
  passed: boolean;
}
export interface EraSummary {
  number: number;
  theme: Theme;
  startYear: number;
  modules: string[];
  story: string[];
}
export interface EraState {
  mode: "natural" | "locked";
  current: EraDef | null;
  next: EraDef | null;
  plans: Record<string, TeamEraPlan>;
  /** The player's lobbying influence left this stage. */
  influence: number;
  past: EraSummary[];
  lockedModules: string[];
  rumours: { day: number; text: string }[];
  /** Car ranking just before a launch, for the winners and losers story. */
  prelaunch: string[];
  pendingStory: boolean;
  /** The text of the last winners and losers story, so every human can be handed the same card. */
  storyText?: string;
  storyDay?: number;
  tweaks: string[];
  /** Persuasion shifts on a team's leaning, module then team. */
  shifts?: Record<string, Record<string, number>>;
  /** Persuasion attempts already made, "module:team". */
  tried?: string[];
  /** Results of the Commission vote for the coming era, by module. */
  ballot?: Record<string, Ballot>;
}

const ROUTES: Record<Theme, { name: string; blurb: string; areas: Partial<Record<Area, number>>; fast: number }[]> = {
  aero: [
    { name: "Low drag specialist", blurb: "Trim drag and win on the straights", areas: { aero: 0.55, power: 0.45 }, fast: 1 },
    { name: "Balanced efficiency car", blurb: "A well rounded package with no big weakness", areas: { aero: 0.35, cooling: 0.35, power: 0.3 }, fast: 0 },
    { name: "Mechanical grip car", blurb: "Lean on the chassis and tyres", areas: { chassis: 0.55, tyres: 0.45 }, fast: -1 },
  ],
  power: [
    { name: "Energy sprinter", blurb: "Maximum electric punch for short bursts", areas: { power: 0.8, cooling: 0.2 }, fast: 1 },
    { name: "Efficiency marathoner", blurb: "Smooth, repeatable energy use over a race", areas: { power: 0.5, tyres: 0.3, cooling: 0.2 }, fast: 0 },
    { name: "Packaging play", blurb: "Tight bodywork around the power unit", areas: { cooling: 0.5, aero: 0.3, power: 0.2 }, fast: -1 },
  ],
  spectacle: [
    { name: "Drag light overtaker", blurb: "Built to pass", areas: { aero: 0.5, power: 0.5 }, fast: 1 },
    { name: "Tyre kind racer", blurb: "Wins on long stints", areas: { tyres: 0.6, chassis: 0.4 }, fast: 0 },
    { name: "Qualifying specialist", blurb: "Everything for one lap", areas: { aero: 0.6, chassis: 0.4 }, fast: -1 },
  ],
  equaliser: [
    { name: "Cost efficient build", blurb: "Spend carefully, trust the cap", areas: { chassis: 0.4, cooling: 0.3, tyres: 0.3 }, fast: 0 },
    { name: "Copy the leader", blurb: "Follow whoever looks quickest", areas: { aero: 0.4, power: 0.3, chassis: 0.3 }, fast: 1 },
    { name: "Spend to win gamble", blurb: "Bet big on one concept", areas: { aero: 0.5, power: 0.5 }, fast: -1 },
  ],
  safety: [
    { name: "Robust reliable car", blurb: "Finish every race", areas: { cooling: 0.5, chassis: 0.5 }, fast: 0 },
    { name: "Light and nimble", blurb: "Low mass, quick direction changes", areas: { aero: 0.4, chassis: 0.4, tyres: 0.2 }, fast: -1 },
    { name: "Balanced all rounder", blurb: "A bit of everything", areas: { aero: 0.3, power: 0.3, chassis: 0.2, tyres: 0.2 }, fast: 1 },
  ],
};

export const PACKAGES: Record<"sprinter" | "marathoner" | "balanced", { label: string; car: Partial<Record<Area, number>>; blurb: string }> = {
  sprinter: { label: "Sprinter", car: { power: 0.08, cooling: -0.05 }, blurb: "More peak power, runs the cooling tight" },
  marathoner: { label: "Marathoner", car: { power: -0.03, cooling: 0.07 }, blurb: "Gentler on itself, a little less peak" },
  balanced: { label: "Balanced", car: {}, blurb: "No strong point and no weak one" },
};

export function newEraState(mode: "natural" | "locked", lockedModules: string[] = []): EraState {
  return { mode, current: null, next: null, plans: {}, influence: 0, past: [], lockedModules, rumours: [], prelaunch: [], pendingStory: false, tweaks: [] };
}

/** Starts the era system for a new career. */
export function initEras(s: CareerState) {
  const e = s.era;
  if (e.mode === "locked") {
    const mods = e.lockedModules.filter((id) => MODULE_BY_ID[id]);
    e.current = makeLocked(s, mods);
    e.next = null;
    return;
  }
  e.next = designEra(s, s.year + 4, 1);
}

function makeLocked(s: CareerState, ids: string[]): EraDef {
  const rng = rngFor(s, "locked");
  return {
    number: 0, theme: "equaliser", why: ["This league is locked to one chosen rule set."], startYear: s.year, length: 99,
    modules: ids.map((id, i) => ({ id, role: i === 0 ? "headline" : "support", intensity: round2(0.45 + rng.next() * 0.3), lobby: 0 })),
    unknowns: [], routes: [], stage: 5, fastShare: 0.5,
  };
}

// ---------------------------------------------------------------- designing an era

const carSpecPower = (s: CareerState, id: string): number => carSpec(s, id).power;

function worldWeights(s: CareerState): { w: Record<Theme, number>; why: string[] } {
  const w: Record<Theme, number> = { spectacle: 1, power: 1, aero: 1, equaliser: 1, safety: 1 };
  const why: string[] = [];
  const last = s.history.slice(-3);
  const teamWins = new Map<string, number>();
  for (const h of last) teamWins.set(h.constructors, (teamWins.get(h.constructors) ?? 0) + 1);
  const dom = Math.max(0, ...teamWins.values());
  if (dom >= 2) {
    w.equaliser += 1.5 * (dom - 1);
    why.push("One team has dominated recently, so the rulemakers lean toward an equaliser.");
  }
  const ratings = Object.keys(s.teams).map((id) => carRating(s, id));
  const mean = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  const sd = Math.sqrt(ratings.reduce((a, b) => a + (b - mean) ** 2, 0) / ratings.length);
  if (sd > 0.012) {
    w.equaliser += 1;
    why.push("The gap between the best and worst car is wide.");
  }
  const poor = Object.values(s.teams).filter((t) => t.cash < 5).length;
  if (poor >= 2 || Object.values(s.teams).some((t) => t.breached)) {
    w.equaliser += 1;
    why.push("Costs are biting, and some teams are stretched.");
  }
  // spectacle: processions. Few different winners in the recent races means the fans want more racing.
  const recent = s.standings.races.slice(-12);
  const prev = s.history.length ? 1 : 0;
  const winners = new Set(recent.map((r) => r.winner));
  if (recent.length >= 6 && winners.size <= 3) {
    w.spectacle += 1.2 + 0.2 * (4 - winners.size);
    why.push("A few drivers keep winning and the racing has been processional, so fans want more overtaking.");
  } else if (recent.length >= 6 && winners.size >= 7) {
    w.spectacle -= 0.3;
  }
  // safety: the retirements and crashes of the recent races
  const dnfAvg = recent.length ? recent.reduce((a, r) => a + (r.dnfs ?? 2), 0) / recent.length : 2;
  if (dnfAvg > 3.2) {
    w.safety += 0.8 + (dnfAvg - 3.2) * 0.8;
    why.push("A run of retirements and big crashes has the safety panel worried.");
  }
  // power: a wide engine gap, or a power formula that has had its day
  const powSpread = (id: string) => carSpecPower(s, id);
  const pw = Object.keys(s.teams).map(powSpread);
  const pm = pw.reduce((a, b) => a + b, 0) / pw.length;
  const psd = Math.sqrt(pw.reduce((a, b) => a + (b - pm) ** 2, 0) / pw.length);
  const age = s.era.current ? s.year - s.era.current.startYear : 0;
  if (psd > 0.0045 || age >= 6) {
    w.power += 0.9 + (age >= 6 ? 0.6 : 0);
    why.push(age >= 6 ? "The current engine formula is old and manufacturers want a new one." : "The engine suppliers are far apart, and the manufacturers want a reset.");
  }
  void prev;
  if (!why.length) why.push("A routine renewal of the technical rules.");
  return { w, why };
}

function pickWeighted<T>(rng: Rng, items: T[], weight: (t: T) => number): T {
  const ws = items.map((i) => Math.max(0.0001, weight(i)));
  let r = rng.next() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) {
    r -= ws[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

export function designEra(s: CareerState, startYear: number, number: number): EraDef {
  const rng = rngFor(s, `era:${number}:${startYear}`);
  const { w, why } = worldWeights(s);
  const theme = pickWeighted(rng, THEMES, (t) => w[t]);
  const live = (m: (typeof MODULES)[number]) => (m.live === "rules" ? 0.5 : 1);
  const chosen: { id: string; role: EraModule["role"] }[] = [];
  const clash = (id: string) => chosen.some((c) => (MODULE_BY_ID[c.id].conflicts ?? []).includes(id) || (MODULE_BY_ID[id].conflicts ?? []).includes(c.id));
  const take = (role: EraModule["role"], pool: typeof MODULES) => {
    const ok = pool.filter((m) => !chosen.some((c) => c.id === m.id) && !clash(m.id));
    if (!ok.length) return;
    chosen.push({ id: pickWeighted(rng, ok, live).id, role });
  };
  take("headline", MODULES.filter((m) => m.headline.includes(theme)));
  const headCat = MODULE_BY_ID[chosen[0].id].category;
  for (let i = 0; i < 2; i++) {
    const cats = new Set(chosen.map((c) => MODULE_BY_ID[c.id].category));
    take("support", MODULES.filter((m) => m.support.includes(theme) && !cats.has(m.category) && m.category !== headCat));
  }
  take("extra", MODULES.filter((m) => ["Race format", "Operations", "Financial", "Scoring", "Pit lane", "Qualifying", "People"].includes(m.category) && !chosen.some((c) => MODULE_BY_ID[c.id].category === m.category)));
  // guarantees: one module that adds a setting and one that takes a control away
  const kinds = () => chosen.map((c) => MODULE_BY_ID[c.id].kind);
  if (!kinds().includes("setting")) {
    const idx = chosen.length - 1;
    const pick = pickWeighted(rng, MODULES.filter((m) => m.kind === "setting" && !chosen.some((c) => c.id === m.id) && !clash(m.id)), live);
    chosen[idx] = { id: pick.id, role: "extra" };
  }
  if (!kinds().includes("control")) {
    const idx = Math.max(1, chosen.length - 2);
    const pick = pickWeighted(rng, MODULES.filter((m) => m.kind === "control" && !chosen.some((c) => c.id === m.id) && !clash(m.id)), live);
    chosen[idx] = { id: pick.id, role: chosen[idx].role };
  }
  const modules: EraModule[] = chosen.map((c) => ({ id: c.id, role: c.role, intensity: round2(0.2 + rng.next() * 0.8), lobby: 0 }));
  const unknowns: EraUnknown[] = [];
  for (const m of modules) {
    MODULE_BY_ID[m.id].unknowns.forEach((label, i) => unknowns.push({ id: `${m.id}:${i}`, moduleId: m.id, label, truth: round2(rng.next()) }));
  }
  // hidden interaction: two modules that together make a sleeper effect on one unknown
  if (modules.length >= 2) {
    const a = modules.find((m) => MODULE_BY_ID[m.id].category === "Power") ?? modules[0];
    const b = modules.find((m) => m !== a && ["Race format", "Operations"].includes(MODULE_BY_ID[m.id].category));
    if (b) {
      const ua = unknowns.find((u) => u.moduleId === a.id);
      const ub = unknowns.find((u) => u.moduleId === b.id);
      if (ua && ub) {
        const t = clamp((ua.truth + ub.truth) / 2 + (rng.next() - 0.5) * 0.3, 0, 1);
        ua.truth = round2(t);
        ub.truth = round2(t);
      }
    }
  }
  const headline = new Set(unknowns.filter((u) => modules.find((m) => m.id === u.moduleId)?.role === "headline").map((u) => u.id));
  const routes: EraRoute[] = ROUTES[theme].map((r, i) => {
    const raw: Record<string, number> = {};
    for (const u of unknowns) {
      const mag = headline.has(u.id) ? 0.5 + rng.next() * 0.5 : rng.next() * 0.5;
      raw[u.id] = (rng.next() < 0.5 ? -1 : 1) * mag;
    }
    const tot = Object.values(raw).reduce((a, b) => a + Math.abs(b), 0) || 1;
    const weights: Record<string, number> = {};
    for (const k of Object.keys(raw)) weights[k] = round2(raw[k] / tot);
    return { id: i, name: r.name, blurb: r.blurb, areas: r.areas, weights, fast: r.fast, amend: 0 };
  });
  const fastShare = round2(s.calendar.filter((c) => circuitMeta(c.circuitId).vmax >= 92).length / Math.max(1, s.calendar.length));
  const length = rng.chance(0.5) ? 4 : 5;
  return { number, theme, why, startYear, length, modules, unknowns, routes, stage: 0, fastShare };
}

/** Truth: how good a route really is, -1 to 1. */
export function routeQuality(era: EraDef, r: EraRoute): number {
  let q = 0;
  for (const u of era.unknowns) q += (r.weights[u.id] ?? 0) * (2 * u.truth - 1);
  q += r.fast * (era.fastShare * 2 - 1) * 0.25 + r.amend;
  return clamp(q, -1, 1);
}

// ---------------------------------------------------------------- what a team knows

export function planOf(s: CareerState, teamId: string): TeamEraPlan {
  let p = s.era.plans[teamId];
  if (!p) {
    p = { route: null, hedge: null, split: 0.1, progress: 0, known: {}, labs: [], labsDone: 0, lobbied: {} };
    s.era.plans[teamId] = p;
  }
  if (s.era.next) for (const u of s.era.next.unknowns) if (!p.known[u.id]) p.known[u.id] = [0, 1];
  return p;
}

export function routeEstimate(era: EraDef, plan: TeamEraPlan, r: EraRoute): { mid: number; hw: number } {
  let mid = 0;
  let hw = 0;
  for (const u of era.unknowns) {
    const k = plan.known[u.id] ?? [0, 1];
    const w = r.weights[u.id] ?? 0;
    mid += w * (k[0] + k[1] - 1);
    hw += Math.abs(w) * (k[1] - k[0]);
  }
  mid += r.fast * (era.fastShare * 2 - 1) * 0.25;
  return { mid: clamp(mid, -1, 1), hw: clamp(hw, 0, 1) };
}

/** What the technical director and the chief designer would pick, with noise that shrinks as their skill grows. */
export function staffOpinions(s: CareerState): { who: string; role: string; pick: string; sure: string }[] {
  const era = s.era.next;
  if (!era || era.stage < 1) return [];
  const plan = planOf(s, s.teamId);
  const out: { who: string; role: string; pick: string; sure: string }[] = [];
  for (const role of ["td", "designer"] as const) {
    const st = staffOf(s, s.teamId, role);
    if (!st) continue;
    const sd = 0.55 * (1 - (st.skill / 100) * 0.9);
    let best = -9;
    let name = "";
    era.routes.forEach((r) => {
      const hash = [...`${st.id}:${era.stage}:${r.id}`].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);
      const noise = (((hash >>> 0) % 2000) / 1000 - 1) * sd * 1.7;
      const v = routeEstimate(era, plan, r).mid + noise;
      if (v > best) {
        best = v;
        name = r.name;
      }
    });
    out.push({ who: st.name, role: role === "td" ? "Technical director" : "Chief designer", pick: name, sure: st.skill >= 80 ? "very sure" : st.skill >= 65 ? "fairly sure" : "not very sure" });
  }
  return out;
}

// ---------------------------------------------------------------- actions

export function setSplit(s: CareerState, teamId: string, v: number) {
  planOf(s, teamId).split = clamp(round2(v), 0, 0.8);
}

export function setRoute(s: CareerState, teamId: string, route: number | null, hedge: number | null = null): string | null {
  const era = s.era.next;
  if (!era || era.stage < 3) return "The final rules are not out yet.";
  const p = planOf(s, teamId);
  p.route = route;
  p.hedge = hedge !== null && hedge !== route ? hedge : null;
  return null;
}

export function setPackage(s: CareerState, teamId: string, pkg: "sprinter" | "marathoner" | "balanced") {
  planOf(s, teamId).package = pkg;
}

export function startLab(s: CareerState, teamId: string, unknown: string): string | null {
  const era = s.era.next;
  if (!era || era.stage < 1) return "Nothing has been announced yet.";
  const t = s.teams[teamId];
  const p = planOf(s, teamId);
  if (!era.unknowns.some((u) => u.id === unknown)) return "Unknown study.";
  if (p.labs.length >= 2) return "Two studies are already running.";
  if (p.labs.some((l) => l.unknown === unknown)) return "That study is already running.";
  if (t.tunnelLeft < 30) return "Not enough wind tunnel hours for a study.";
  t.capSpent = round2(t.capSpent + 2.5);
  t.tunnelLeft = Math.max(0, t.tunnelLeft - 30);
  p.labs.push({ unknown, done: s.day + 14 });
  if (teamId === s.teamId) logSpend(s, "Concept Lab study started", { cap: -2.5, tunnel: -30 });
  return null;
}

function finishLab(s: CareerState, teamId: string, lab: Lab) {
  const era = s.era.next;
  if (!era) return;
  const u = era.unknowns.find((x) => x.id === lab.unknown);
  if (!u) return;
  const p = planOf(s, teamId);
  const k = p.known[u.id] ?? [0, 1];
  const width = k[1] - k[0];
  const acc = accuracy(s, teamId, "aero");
  const rng = rngFor(s, `lab:${teamId}:${u.id}:${s.day}`);
  const nw = width * (0.5 + 0.3 * (1 - acc));
  const mid = clamp(u.truth + rng.gauss() * (1 - acc) * 0.2 * width, 0, 1);
  const lo = clamp(mid - nw / 2, 0, 1 - nw);
  p.known[u.id] = [round2(lo), round2(lo + nw)];
  p.labsDone += 1;
}

// ---------------------------------------------------------------- stages and the weekly tick

function stageFor(next: EraDef, year: number) {
  return 5 - (next.startYear - year);
}

function aiBaseSplit(s: CareerState, id: string): number {
  const rank = teamRanking(s).indexOf(id);
  let b = rank >= 7 ? 0.45 : rank >= 4 ? 0.3 : 0.15;
  const t = s.teams[id];
  if (t.philosophy === "early") b += 0.08;
  if (t.philosophy === "late") b -= 0.08;
  if (t.philosophy === "gamble") b += 0.1;
  return clamp(b, 0.05, 0.6);
}

function aiPickRoute(s: CareerState, id: string, era: EraDef) {
  const t = s.teams[id];
  const p = planOf(s, id);
  const rng = rngFor(s, `airoute:${id}:${era.stage}`);
  let best = -9;
  let second = -9;
  let bi = 0;
  let si = 0;
  let spread = 0;
  era.routes.forEach((r, i) => {
    const e = routeEstimate(era, p, r);
    const v = e.mid + rng.gauss() * (1 - t.skillBrain) * 0.3;
    spread += e.hw;
    if (v > best) {
      second = best;
      si = bi;
      best = v;
      bi = i;
    } else if (v > second) {
      second = v;
      si = i;
    }
  });
  p.route = bi;
  const unsure = spread / era.routes.length > 0.4;
  p.hedge = t.philosophy === "gamble" ? null : (t.philosophy === "late" || unsure) && rng.chance(0.6) ? si : null;
  if (!p.package) p.package = rng.pick(["sprinter", "marathoner", "balanced"] as const);
}

/** Run at the start of the summer break: publishes the next stage of the upcoming era. */
export function eraSummer(s: CareerState) {
  const e = s.era;
  if (e.mode === "locked" || !e.next) return;
  const era = e.next;
  const stage = stageFor(era, s.year);
  if (stage < 1 || stage <= era.stage || stage > 4) return;
  era.stage = stage;
  e.influence = stage === 2 ? 3 + Math.floor(clamp((s.teams[s.teamId].board - 40) / 20, 0, 3)) : e.influence;
  const head = era.modules.find((m) => m.role === "headline");
  const names = era.modules.map((m) => MODULE_BY_ID[m.id].name);
  for (const id of Object.keys(s.teams)) {
    const p = planOf(s, id);
    if (!isHuman(s, id)) p.split = round2(aiBaseSplit(s, id) * [0, 0.4, 0.7, 1, 1.1][stage]);
  }
  if (stage === 1) {
    news(s, `FRAMEWORK: the ${THEME_LABEL[era.theme]} era is announced for ${era.startYear}. Headline change: ${MODULE_BY_ID[head!.id].name}.`, { importance: 3, cause: "Regulation framework published" });
    ticker(s, `New rules for ${era.startYear}: ${THEME_LABEL[era.theme]} era, headline ${MODULE_BY_ID[head!.id].name}.`, 3);
    pushCard(s, "era", `New regulations for ${era.startYear}: the framework`, `The rulemakers have published a ${THEME_LABEL[era.theme].toLowerCase()} framework. Headline change: ${MODULE_BY_ID[head!.id].name} (${MODULE_BY_ID[head!.id].intent.toLowerCase()}). Other modules are still secret. Open the Rules tab to read the brief, start Concept Lab studies and set how much of your factory looks ahead.`, [{ id: "ok", label: "Open it later" }], { urgency: 2, deadline: s.day + 10 });
  } else if (stage === 2) {
    applyAILobbyNote(s);
    news(s, `DRAFT RULES: full text for ${names.join(", ")}. The Grand Prix Commission votes at the end of the break: each module needs ${VOTE_NEEDED} of ${Object.keys(s.teams).length} votes.`, { importance: 3, cause: "Draft regulations published" });
    pushCard(s, "era", `Draft rules are out`, `Rule text for every module is published, with strengths shown as ranges. The Commission will vote at the end of this break. Each module needs ${VOTE_NEEDED} of ${Object.keys(s.teams).length} team votes to pass in full; one that fails only passes as a token version. You hold one vote. You have ${e.influence} influence to persuade teams, and you can trade your vote for theirs. Open the Rules tab.`, [{ id: "ok", label: "Read the brief" }], { urgency: 2, deadline: s.day + 12 });
  } else if (stage === 3) {
    holdVote(s, era);
    for (const id of Object.keys(s.teams)) {
      if (isHuman(s, id)) continue;
      if (s.teams[id].philosophy !== "late") aiPickRoute(s, id, era);
    }
    news(s, `FINAL RULES: the ${era.startYear} regulations are fixed.`, { importance: 3, cause: "Final regulations voted" });
    pushCard(s, "era", `Final rules fixed`, `The ${era.startYear} rules are now fixed. Choose your concept route in the Rules tab: commit for a bigger gain if you are right, or hedge for half the gain and half the risk. Then set your development split.`, [{ id: "ok", label: "Open the Rules tab" }], { urgency: 2, deadline: s.day + 12 });
  } else if (stage === 4) {
    lateAmendment(s, era);
    for (const id of Object.keys(s.teams)) if (!isHuman(s, id) && s.era.plans[id]?.route === null) aiPickRoute(s, id, era);
    pushCard(s, "era", `Late amendment`, era.amendment ?? "A small late change was published.", [{ id: "ok", label: "Understood" }], { urgency: 2, deadline: s.day + 12 });
  }
}

function applyAILobbyNote(s: CareerState) {
  ticker(s, "Teams are lobbying hard behind the scenes.", 2);
}

function lateAmendment(s: CareerState, era: EraDef) {
  const picks = new Map<number, number>();
  for (const id of Object.keys(s.teams)) {
    const r = s.era.plans[id]?.route;
    if (r !== null && r !== undefined) picks.set(r, (picks.get(r) ?? 0) + 1);
  }
  let top = -1;
  let n = 0;
  for (const [r, c] of picks) if (c > n) { top = r; n = c; }
  if (top >= 0 && n >= 4) {
    era.routes[top].amend = round2(era.routes[top].amend - 0.25);
    era.amendment = `Research shows one concept dominating (${era.routes[top].name}). The rulemakers tighten the rules that favoured it. It is now worth less than the teams expected.`;
  } else {
    const rng = rngFor(s, `amend:${era.number}`);
    const u = era.unknowns[Math.floor(rng.next() * era.unknowns.length)];
    u.truth = round2(clamp(u.truth + (rng.chance(0.5) ? 0.2 : -0.2), 0, 1));
    era.amendment = `A late tweak to "${MODULE_BY_ID[u.moduleId].name}" changes what the teams learned: ${u.label.toLowerCase()} is not what it seemed.`;
  }
  news(s, `LATE AMENDMENT: ${era.amendment}`, { importance: 3, cause: "Late regulation amendment" });
}

/** Weekly: progress toward the new car, Concept Lab studies, AI choices and rumours. */
export function eraWeekly(s: CareerState) {
  const era = s.era.next;
  if (!era || s.era.mode === "locked") return;
  if (era.stage < 1) return;
  const rng = rngFor(s, `eraweek:${s.day}`);
  for (const id of Object.keys(s.teams)) {
    const p = planOf(s, id);
    const td = staffOf(s, id, "td");
    const prod = clamp(1 + ((td?.skill ?? 65) - 70) * 0.01 + 0.04 * (s.teams[id].facilities.tunnel - 3), 0.8, 1.3);
    if (era.stage >= 1) p.progress = clamp(p.progress + (p.split * prod) / 182, 0, 1);
    if (!isHuman(s, id)) {
      const t = s.teams[id];
      if (p.labs.length < 1 && p.labsDone < 6 && rng.chance(0.08 + 0.12 * t.skillBrain) && t.tunnelLeft > 40) startLab(s, id, era.unknowns[Math.floor(rng.next() * era.unknowns.length)].id);
    }
  }
  if (era.stage >= 3 && rng.chance(0.35)) {
    const ids = Object.keys(s.teams).filter((x) => !isHuman(s, x));
    const id = ids[Math.floor(rng.next() * ids.length)];
    const real = s.era.plans[id]?.route;
    if (real !== null && real !== undefined) {
      const shown = rng.chance(0.7) ? real : Math.floor(rng.next() * era.routes.length);
      const text = `Rumour: ${baseTeam(id).name} are said to have committed to the "${era.routes[shown].name}" route.`;
      s.era.rumours.unshift({ day: s.day, text });
      s.era.rumours.length = Math.min(s.era.rumours.length, 12);
      news(s, text, { importance: 1, cause: "Paddock rumour (it may be wrong)", tag: "rumour" });
    }
  }
}

/** Daily: finish Concept Lab studies. */
export function eraDaily(s: CareerState) {
  for (const [id, p] of Object.entries(s.era.plans)) {
    const left: Lab[] = [];
    for (const l of p.labs) {
      if (s.day >= l.done) {
        finishLab(s, id, l);
        if (id === s.teamId) {
          const u = s.era.next?.unknowns.find((x) => x.id === l.unknown);
          news(s, `Concept Lab: study complete on "${u?.label ?? "an unknown"}". The range has narrowed.`, { importance: 2, cause: "Concept Lab study" });
          ticker(s, "Concept Lab study finished.", 2);
        }
      } else left.push(l);
    }
    p.labs = left;
  }
}

// ---------------------------------------------------------------- launch

function gainOf(era: EraDef, p: TeamEraPlan): Partial<Record<Area, number>> {
  const out: Partial<Record<Area, number>> = {};
  const G = 0.9;
  const picks = [p.route, p.hedge].filter((x): x is number => x !== null && x !== undefined);
  if (!picks.length) return out;
  const w = 1 / picks.length;
  const fit = picks.reduce((a, r) => a + (routeQuality(era, era.routes[r]) * 0.5 + 0.5) * w, 0);
  const prog = clamp(p.progress, 0, 1);
  for (const r of picks) {
    for (const [a, aw] of Object.entries(era.routes[r].areas) as [Area, number][]) {
      out[a] = round2((out[a] ?? 0) + G * prog * (fit - 0.5) * 2 * aw * w * (picks.length > 1 ? 1.2 : 1));
    }
  }
  return out;
}

/** January of a launch year: the new rules go live and the order is reshuffled. */
export function launchEra(s: CareerState) {
  const e = s.era;
  const era = e.next;
  if (!era || e.mode === "locked" || era.startYear !== s.year) return;
  e.prelaunch = teamRanking(s);
  // anyone who never chose a route gets nothing from the concept work; AI picks if they were late
  for (const id of Object.keys(s.teams)) {
    const p = planOf(s, id);
    if (!isHuman(s, id) && p.route === null) aiPickRoute(s, id, era);
    if (!p.package) p.package = "balanced";
  }
  const hasPkg = era.modules.some((m) => m.id === "enginePackages");
  for (const area of AREAS) {
    const ts = Object.values(s.teams);
    const mean = ts.reduce((x, t) => x + t.car[area], 0) / ts.length;
    for (const t of ts) {
      const before = t.car[area];
      const bb = t.believed[area];
      addArea(t, area, round2(mean + (before - mean) * 0.6) - before);
      shiftBelief(t, area, round2(mean + (bb - mean) * 0.6) - bb);
    }
  }
  const story: string[] = [];
  for (const [id, t] of Object.entries(s.teams)) {
    const p = planOf(s, id);
    const g = gainOf(era, p);
    for (const [a, v] of Object.entries(g) as [Area, number][]) addArea(t, a, v);
    if (hasPkg && p.package) for (const [a, v] of Object.entries(PACKAGES[p.package].car) as [Area, number][]) addArea(t, a, v);
    // the player's belief knows only the staff's estimate
    if (isHuman(s, id)) {
      const picks = [p.route, p.hedge].filter((x): x is number => x !== null && x !== undefined);
      if (picks.length) {
        const est = picks.reduce((a, r) => a + routeEstimate(era, p, era.routes[r]).mid / picks.length, 0);
        for (const [a, aw] of Object.entries(era.routes[picks[0]].areas) as [Area, number][]) shiftBelief(t, a, round2(0.9 * clamp(p.progress, 0, 1) * est * aw));
      }
    }
    const route = p.route !== null ? era.routes[p.route] : null;
    story.push(`${baseTeam(id).name}: ${route ? route.name : "no concept"}${p.hedge !== null ? " (hedged)" : ""}, ${Math.round(p.progress * 100)}% prepared.`);
    t.philosophy = t.philosophy;
  }
  // drivers adapt at different speeds
  for (const d of Object.values(s.drivers)) {
    if (d.retired || !d.teamId) continue;
    const age = s.year - (d.spec.born ?? s.year - 28);
    const adapt = clamp(0.75 - (age - 22) * 0.018 + (d.potential - 0.8) * 0.4, 0.1, 0.95);
    d.spec = { ...d.spec, pace: clamp(d.spec.pace + (adapt - 0.5) * 0.008, 0.93, 1.002) };
  }
  e.past.push({ number: era.number, theme: era.theme, startYear: era.startYear, modules: era.modules.map((m) => m.id), story });
  era.stage = 5;
  e.current = era;
  e.plans = {};
  e.rumours = [];
  e.pendingStory = true;
  const nextStart = s.year + era.length;
  e.next = designEra(s, nextStart, era.number + 1);
  news(s, `The ${THEME_LABEL[era.theme]} era begins. New cars appear for ${s.year}.`, { importance: 3, cause: "Regulation launch" });
  for (const m of era.modules) {
    const def = MODULE_BY_ID[m.id];
    ticker(s, `New rule: ${def.name} (${describeIntensity(def, m.intensity)}).`, 2);
  }
}

/** The pre-season test of a launch year: who won and who lost, and why. */
export function eraStory(s: CareerState) {
  const e = s.era;
  if (!e.pendingStory || !e.current) return;
  e.pendingStory = false;
  const after = noisyRanking(s, "era", 0.35);
  const moves = after.map((id, i) => ({ id, d: e.prelaunch.indexOf(id) - i, i }));
  const up = [...moves].sort((a, b) => b.d - a.d).slice(0, 2).filter((m) => m.d > 0);
  const down = [...moves].sort((a, b) => a.d - b.d).slice(0, 2).filter((m) => m.d < 0);
  const era = e.current;
  const last = e.past[e.past.length - 1];
  const lines: string[] = [];
  const why = (id: string) => {
    const route = (last?.story.find((x) => x.startsWith(baseTeam(id).name)) ?? "").split(": ")[1] ?? "";
    return route ? ` (${route})` : "";
  };
  for (const m of up) lines.push(`${baseTeam(m.id).name} rise ${m.d} place${m.d > 1 ? "s" : ""} to ${m.i + 1}${why(m.id)}.`);
  for (const m of down) lines.push(`${baseTeam(m.id).name} fall ${-m.d} place${m.d < -1 ? "s" : ""} to ${m.i + 1}${why(m.id)}.`);
  const best = era.routes.length ? [...era.routes].sort((a, b) => routeQuality(era, b) - routeQuality(era, a))[0] : null;
  if (best) lines.push(`The route that suited the new rules best was "${best.name}".`);
  if (last) last.story = [...lines, ...last.story];
  news(s, `NEW ORDER: ${lines.slice(0, 2).join(" ") || "The order is much as before."}`, { importance: 3, cause: "Pre-season test after new regulations" });
  e.storyText = lines.join("\n") || "Little changed.";
  e.storyDay = s.day;
  eraStoryCard(s);
}

/** The winners and losers card for one person. In a league every human gets the same story. */
export function eraStoryCard(s: CareerState) {
  const text = s.era.storyText;
  if (!text || s.era.storyDay !== s.day) return;
  pushCard(s, "era", "Regulation winners and losers", `The first running of the new rules has reshuffled the order.\n\n${text}\n\nThe order shown is still noisy. The first races will tell the truth.`, [{ id: "ok", label: "OK" }], { urgency: 2, deadline: s.day + 7 });
}

// ---------------------------------------------------------------- live rules

/** The sum of every active module's effects. Empty before the first new era and in a league with no locked modules. */
export function rulesOf(s: CareerState): Flags {
  const out: Flags = {};
  const era = s.era.current;
  if (!era) return out;
  const yearsIn = s.year - era.startYear;
  for (const m of era.modules) {
    const def = MODULE_BY_ID[m.id];
    if (!def) continue;
    const f = def.flags(m.intensity);
    if (f.seasons !== undefined && yearsIn >= f.seasons) continue;
    for (const [k, v] of Object.entries(f) as [keyof Flags, unknown][]) {
      if (k === "areaMult") {
        out.areaMult = out.areaMult ?? {};
        for (const [a, x] of Object.entries(v as Record<string, number>)) out.areaMult[a as Area] = (out.areaMult[a as Area] ?? 1) * x;
      } else if (k === "extraAxes") out.extraAxes = [...(out.extraAxes ?? []), ...(v as NonNullable<Flags["extraAxes"]>)];
      else if (k === "removeAxes" || k === "freezeAreas") (out as Record<string, unknown>)[k] = [...(((out as Record<string, unknown>)[k] as unknown[]) ?? []), ...(v as unknown[])];
      else if (k === "tyreSev") out.tyreSev = (out.tyreSev ?? 1) * (v as number);
      else if (k === "driverWeight") out.driverWeight = (out.driverWeight ?? 1) * (v as number);
      else (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

export function eraNote(s: CareerState): string {
  const e = s.era;
  if (e.mode === "locked") return "Locked rules";
  if (!e.next) return "";
  const y = e.next.startYear;
  return e.next.stage === 0 ? `New rules expected in ${y}` : `${THEME_LABEL[e.next.theme]} era in ${y}`;
}

/** Dates the era engine cares about, for the calendar. */
export function eraDates(s: CareerState): { day: number; label: string }[] {
  const out: { day: number; label: string }[] = [];
  const era = s.era.next;
  if (!era || s.era.mode === "locked") return out;
  const stage = stageFor(era, s.year);
  const names = ["", "Framework published", "Draft rules and lobbying", "Final rules: choose your route", "Late amendment"];
  if (stage >= 1 && stage <= 4 && stage > era.stage) out.push({ day: summerStart(s.year), label: names[stage] ?? "" });
  if (era.startYear === s.year) out.push({ day: launchDay(s.year) + 7, label: "New rules launch at the test" });
  return out.filter((x) => x.label);
}

export { standingsRank };
