import type { CareerEngine, CareerEngineExtras } from "../shared/careerNet";
import { apply } from "./reducer";
import { newCareer, makeSponsor } from "./world";
import { makeOwner } from "./people";
import { defaultBudgets } from "./finance";
import { newBrand } from "./brand";
import { newPress, newRift } from "./dressing";
import { advanceDay, playerDay, stopNow } from "./tick";
import { endPractice, extrasFromRows, planSession, recordSession, runQualiWithSets, runRace, setKeyFor, startWeekend, type SessionPlan } from "./weekend";
import { rulesOf } from "./eras";
import { noisyRanking } from "./car";
import { clamp, rngFor } from "./util";
import { hashSeed } from "../sim/rng";
import { loadCircuit } from "../game/circuits";
import { TRAITS, type Action, type CareerState } from "./types";
import { TRAIT_AREA } from "./traits";
import type { RaceConfig } from "../sim/types";
import type { QualiConfig } from "../sim/qualifying";

/**
 * The multiplayer career engine. One shared league: every human runs one team, the AI runs the rest.
 *
 * Everything that belongs to one person (their cards, promises, budgets, weekend, brand, press, story...) lives in a
 * SLICE. The shared world is a plain CareerState whose teams, drivers, standings and calendar everyone sees.
 * To act for a person the engine swaps their slice into the state, runs the ordinary single-player code, and swaps back.
 * So every rule of the single-player game applies to every human without a second copy of it.
 *
 * A day is: the world moves once (with the first human's slice in place), then every other human gets their own
 * per-team work (playerDay). Qualifying and the race run once for the whole league in lockstep, practice and setup
 * are individual.
 */

// ---------------------------------------------------------------- slices

const TOP_KEYS = ["cards", "recap", "spendLog", "promises", "budgets", "weekend", "brand", "rift", "press", "owner", "story", "legacy", "fired", "stopReason", "rumours", "privNews", "privTicker", "talks", "nextCar", "nextCarLast", "letters", "guidance", "boardLog", "threads", "chronicle", "teller"] as const;
const ACADEMY_KEYS = ["scouts", "shortlist", "decisions", "rookieNominee", "graduates", "trialDays", "devRep", "firstGradWin"] as const;
const ERA_KEYS = ["influence", "tried"] as const;

export interface Slice {
  top: Partial<Pick<CareerState, (typeof TOP_KEYS)[number]>>;
  academy: Record<string, unknown>;
  era: Record<string, unknown>;
}

export interface MultiSettings {
  difficulty: 0 | 1 | 2;
  raceLength: "full" | "half" | "quick";
  eraMode: "natural" | "locked";
  lockedModules: string[];
  guidance: "off" | "hints" | "full";
}

export interface MultiState {
  v: 1;
  world: CareerState;
  slices: Record<string, Slice>;
  /** teamId to the public player id, for the teams a person runs right now. */
  humans: Record<string, string>;
  /** Teams in the order people took them. The first is the lead for the world pass. */
  order: string[];
}

const copy = <T>(x: T): T => (x === undefined ? x : JSON.parse(JSON.stringify(x)));

function takeSlice(s: CareerState): Slice {
  const top: Record<string, unknown> = {};
  for (const k of TOP_KEYS) top[k] = copy((s as unknown as Record<string, unknown>)[k]);
  const academy: Record<string, unknown> = {};
  for (const k of ACADEMY_KEYS) academy[k] = copy((s.academy as unknown as Record<string, unknown>)[k]);
  const era: Record<string, unknown> = {};
  for (const k of ERA_KEYS) era[k] = copy((s.era as unknown as Record<string, unknown>)[k]);
  return { top: top as Slice["top"], academy, era };
}

function putSlice(s: CareerState, sl: Slice) {
  for (const k of TOP_KEYS) (s as unknown as Record<string, unknown>)[k] = (sl.top as Record<string, unknown>)[k] ?? defaultOf(k);
  for (const k of ACADEMY_KEYS) (s.academy as unknown as Record<string, unknown>)[k] = sl.academy[k];
  for (const k of ERA_KEYS) (s.era as unknown as Record<string, unknown>)[k] = sl.era[k];
}

function defaultOf(k: string): unknown {
  if (k === "cards" || k === "recap" || k === "spendLog" || k === "promises" || k === "legacy" || k === "rumours" || k === "privNews" || k === "privTicker" || k === "talks" || k === "letters") return [];
  if (k === "fired") return false;
  if (k === "stopReason") return "";
  if (k === "weekend") return null;
  return undefined;
}

/** Runs `fn` with the person's slice in place on the shared state, then takes the changes back into the slice. */
function as<T>(ms: MultiState, teamId: string, fn: (s: CareerState) => T): T {
  const s = ms.world;
  const keep = takeSlice(s);
  const keepTeam = s.teamId;
  const sl = ms.slices[teamId];
  if (!sl) throw new Error(`No slice for ${teamId}`);
  putSlice(s, sl);
  s.teamId = teamId;
  try {
    return fn(s);
  } finally {
    ms.slices[teamId] = takeSlice(s);
    putSlice(s, keep);
    s.teamId = keepTeam;
  }
}

/** Playoff cuts mark drivers out of the title race in the story. That is a fact of the league, not of one person. */
function shareArcs(ms: MultiState, from: string) {
  const src = ms.slices[from]?.top.story?.arcs ?? {};
  for (const [h, sl] of Object.entries(ms.slices)) {
    if (h === from) continue;
    const arcs = sl.top.story?.arcs;
    if (!arcs) continue;
    for (const k of Object.keys(arcs)) if (k.startsWith("out:") && !(k in src)) delete arcs[k];
    for (const [k, v] of Object.entries(src)) if (k.startsWith("out:")) arcs[k] = v;
  }
}

function humanList(ms: MultiState): string[] {
  return ms.order.filter((t) => ms.humans[t]);
}

function syncHumans(ms: MultiState) {
  const list = humanList(ms);
  ms.world.humans = list.length ? list : undefined;
  if (list.length && !list.includes(ms.world.teamId)) ms.world.teamId = list[0];
}

// ---------------------------------------------------------------- creating people

function newSliceFor(ms: MultiState, teamId: string): Slice {
  const s = ms.world;
  const keepTeam = s.teamId;
  const keep = takeSlice(s);
  s.teamId = teamId;
  try {
    const rng = rngFor(s, `joiner:${teamId}`);
    const t = s.teams[teamId];
    if (t.sponsors.length < 3) {
      const taken = new Set(t.sponsors.map((x) => x.name));
      for (const sp of Object.values(s.teams).flatMap((x) => x.sponsors)) taken.add(sp.name);
      while (t.sponsors.length < 3) t.sponsors.push(makeSponsor(rng, ++s.uid, t.aiIncome * [0.5, 0.3, 0.2][t.sponsors.length], s.year, taken));
    }
    t.delegation = { rnd: "advise", setup: "advise", parts: "advise" };
    t.board = Math.max(t.board, 55);
    s.cards = [];
    s.recap = ["You took over the team."];
    s.spendLog = [];
    s.promises = [];
    s.rumours = [];
    s.legacy = [];
    s.fired = false;
    s.stopReason = "";
    s.weekend = null;
    s.privNews = [];
    s.privTicker = [];
    s.story = { last: {}, count: {}, bigDay: -99, mediaDay: -99, mediaCount: 0, tone: 0, arcs: {} };
    s.brand = newBrand(s);
    s.rift = newRift();
    s.press = newPress();
    s.budgets = defaultBudgets(s);
    s.owner = makeOwner(s, rng);
    const scout = Object.values(s.staff).find((x) => x.teamId === teamId && x.role === "scout");
    s.academy.scouts = scout ? { [scout.id]: "f3" } : {};
    s.academy.shortlist = [];
    s.academy.decisions = [];
    s.academy.rookieNominee = null;
    s.academy.graduates = [];
    s.academy.trialDays = 4;
    s.academy.devRep = 0;
    s.academy.firstGradWin = false;
    s.era.influence = 3;
    s.era.tried = [];
    return takeSlice(s);
  } finally {
    putSlice(s, keep);
    s.teamId = keepTeam;
  }
}

// ---------------------------------------------------------------- the engine

export const careerEngine: CareerEngine<MultiState> & CareerEngineExtras = {
  create({ seed, teamId, settings }) {
    const extra = ((settings as { extra?: Partial<MultiSettings> } | undefined)?.extra ?? {}) as Partial<MultiSettings>;
    const world = newCareer(teamId, seed, extra.difficulty ?? 1, extra.raceLength ?? "half", { eraMode: extra.eraMode ?? "natural", lockedModules: extra.lockedModules ?? [], guidance: extra.guidance === "hints" || extra.guidance === "full" ? extra.guidance : "off" });
    for (const c of world.calendar) c.sprint = false;
    const ms: MultiState = { v: 1, world, slices: {}, humans: {}, order: [] };
    // the first slice is what newCareer built for the founder's team
    ms.slices[teamId] = takeSlice(world);
    return ms;
  },

  assign(state, teamId, humanId) {
    const ms = copy(state);
    if (!ms.world.teams[teamId]) return ms;
    if (humanId === null) {
      delete ms.humans[teamId];
      syncHumans(ms);
      return ms;
    }
    if (!ms.slices[teamId]) ms.slices[teamId] = newSliceFor(ms, teamId);
    ms.humans[teamId] = humanId;
    if (!ms.order.includes(teamId)) ms.order.push(teamId);
    syncHumans(ms);
    // someone joining in race week gets their own weekend so the lockstep sessions include them
    const open = humanList(ms).some((h) => h !== teamId && ms.slices[h]?.top.weekend && ms.slices[h].top.weekend?.stage !== "done");
    if (open && !ms.slices[teamId].top.weekend) {
      as(ms, teamId, (s) => {
        s.weekend = startWeekend(s);
      });
    }
    return ms;
  },

  reduceAs(state, teamId, action) {
    const ms = copy(state);
    if (!ms.humans[teamId]) return { state, ok: false, message: "That team is not yours." };
    const a = action as Action;
    // a league vote (skip the rest of a session) changes nothing in the career itself
    const vt = action as { type?: string; topic?: string; option?: string };
    if (vt.type === "vote") {
      const ok = vt.topic === "skip" && (vt.option === "skip" || vt.option === "watch");
      return { state, ok, message: ok ? "Vote noted." : "That is not something the league votes on." };
    }
    const out = as(ms, teamId, (s) => apply(s, a));
    if (out.ok) shareArcs(ms, teamId);
    return { state: out.ok ? ms : state, ok: out.ok, message: out.message };
  },

  stepDay(state) {
    const ms = copy(state);
    const humans = humanList(ms);
    if (!humans.length) return { state, stop: null, weekend: false, log: [] };
    const before = ms.world.uid;
    const era = ms.world.era.next;
    const stageBefore = era?.stage ?? -1;
    // the world moves once, with the first human's team in place
    const lead = humans[0];
    as(ms, lead, (s) => advanceDay(s));
    shareArcs(ms, lead);
    for (const h of humans.slice(1)) as(ms, h, (s) => playerDay(s));
    // the draft stage gives each person their own pot of influence
    if (ms.world.era.next && stageBefore !== 2 && ms.world.era.next.stage === 2) {
      for (const h of humans) as(ms, h, (s) => (s.era.influence = 3 + Math.floor(clamp((s.teams[h].board - 40) / 20, 0, 3))));
    }
    // sprints are not run in lockstep: the league races full weekends only
    for (const c of ms.world.calendar) c.sprint = false;
    let stop: string | null = null;
    let weekend = false;
    for (const h of humans) {
      const sl = ms.slices[h];
      const w = sl.top.weekend;
      if (w && w.stage !== "done") weekend = true;
    }
    if (!weekend) {
      for (const h of humans) {
        const why = as(ms, h, (s) => stopNow(s, before));
        if (why) stop = "A manager has a decision to make";
      }
    } else stop = "Race week";
    // the world's own news this day goes to the log
    const log = ms.world.news.filter((n) => n.day === ms.world.day && (n.importance ?? 1) >= 3).map((n) => n.text);
    return { state: ms, stop, weekend, log };
  },

  view(state, teamId) {
    const ms = state;
    if (!ms.slices[teamId]) return null;
    const s = copy(ms.world);
    putSlice(s, copy(ms.slices[teamId]));
    s.teamId = teamId;
    s.humans = humanList(ms);
    // what you may not see: other teams' true cars and R&D, and the seed behind every dice roll
    for (const [id, t] of Object.entries(s.teams)) {
      if (id === teamId) continue;
      t.car = copy(t.believed);
      t.projects = [];
      t.ideas = [];
      // the traits behind a rival's car, what they know and where their concept points are theirs alone
      for (const tr of TRAITS) {
        t.dna[tr] = t.car[TRAIT_AREA[tr]];
        t.know[tr] = { est: t.car[TRAIT_AREA[tr]], err: 0.3 };
        t.regKnow[tr] = { est: 1, err: 0.3 };
      }
      t.concept = { df: 0, risk: 0, innov: 0 };
      t.conceptDay = undefined;
      // the lab is private: the finished shape shows in photos, the notebook, the plan for January and the trust in each tool do not
      t.notebook = [];
      t.designNext = undefined;
      t.corr = undefined;
      t.dev = undefined;
    }
    // private ledger lines (lab, trainees, stories, hires) belong to the team they happened to
    const PRIVATE = /^(thread:|lab$|intern$|promotion$|hire$)/;
    s.facts = (s.facts ?? []).filter((f) => !PRIVATE.test(f.kind) || f.who.includes(teamId));
    // the rulebook's true emphasis is something each team has to study
    s.regW = undefined;
    s.seed = hashSeed(`${s.seed}:${teamId}`);
    // merge the private feeds back in date order
    s.news = [...(s.privNews ?? []), ...s.news].sort((a, b) => b.day - a.day).slice(0, 160);
    s.ticker = [...(s.privTicker ?? []), ...s.ticker].sort((a, b) => b.day - a.day).slice(0, 40);
    return s;
  },

  sessionPlan(state, kind) {
    const ms = copy(state);
    const humans = humanList(ms).filter((h) => ms.slices[h].top.weekend && ms.slices[h].top.weekend?.stage !== "done");
    if (!humans.length) throw new Error("Nobody has a race weekend open.");
    // close practice for anyone still in it
    for (const h of humans) as(ms, h, (s) => endPractice(s));
    const k = kind === "qualifying" ? "quali" : "race";
    const plans = humans.map((h) => ({ h, plan: as(ms, h, (s) => planSession(s, k)) }));
    const base = plans[0].plan;
    const entries = base.entries.map((e, i) => {
      const owner = plans.find((p) => p.plan.entries[i].team.id === p.h && p.plan.entries[i].human);
      return owner ? { ...owner.plan.entries[i], human: true } : { ...e, human: false };
    });
    const humanTeams: Record<string, string[]> = {};
    for (const p of plans) humanTeams[p.h] = p.plan.humanIds;
    const humanIds = plans.flatMap((p) => p.plan.humanIds);
    const cfg = (base.qualiCfg ?? base.raceCfg) as QualiConfig | RaceConfig;
    const strip = { ...cfg, entries, track: undefined } as unknown as Record<string, unknown>;
    // everyone brings their own physical sets to the session
    const mergedSets: Record<string, unknown> = {};
    for (const p of plans) Object.assign(mergedSets, ((p.plan.qualiCfg ?? p.plan.raceCfg) as { tyreSetList?: Record<string, unknown> } | undefined)?.tyreSetList ?? {});
    strip.tyreSetList = mergedSets;
    if (base.raceCfg) {
      const rc = strip as unknown as RaceConfig & { tyreSets?: Record<string, unknown>; moods?: Record<string, unknown>; startTyres?: Record<string, string> };
      const sets: Record<string, unknown> = {};
      const moods: Record<string, unknown> = {};
      const startTyres: Record<string, string> = { ...(base.raceCfg.startTyres ?? {}) };
      for (const p of plans) {
        Object.assign(sets, p.plan.raceCfg?.tyreSets ?? {});
        Object.assign(moods, p.plan.raceCfg?.moods ?? {});
      }
      rc.tyreSets = sets as never;
      rc.moods = moods as never;
      // each person chooses their own start tyres; the AI's guess for their cars is only the default
      for (const p of plans) for (const id of p.plan.humanIds) startTyres[id] = (p.plan.raceCfg?.startTyres?.[id] ?? startTyres[id] ?? "M") as string;
      rc.startTyres = startTyres as never;
      (rc as RaceConfig).startLocks = (base.locks ?? undefined) as never;
    }
    return {
      v: 1,
      kind: k,
      circuitId: base.circuitId,
      gp: base.gp,
      laps: base.laps,
      settings: base.settings,
      humanIds,
      humanTeams,
      aiTyres: base.aiTyres,
      locks: base.locks ?? null,
      cfg: strip,
    };
  },

  applySession(state, kind, results) {
    const ms = copy(state);
    const humans = humanList(ms).filter((h) => ms.slices[h].top.weekend && ms.slices[h].top.weekend?.stage !== "done");
    const k = kind === "qualifying" ? "quali" : "race";
    let res = results as SessionResultIn | null;
    if (!res) res = headless(ms, humans[0], k);
    let first = true;
    for (const h of humans) {
      as(ms, h, (s) => {
        const own = ownDrivers(s, h);
        if (k === "quali") {
          const used: NonNullable<SessionResultIn["used"]> = {};
          for (const id of own) if (res!.used?.[id]) used[id] = res!.used[id];
          const sets: NonNullable<SessionResultIn["sets"]> = {};
          for (const id of own) { const k = setKeyFor(s, id); if (res!.sets?.[k]) sets[k] = res!.sets[k]; }
          recordSession(s, "quali", res!.order, {}, res!.order, [], undefined, { locks: res!.locks, used, sets, skipWorld: !first });
        } else {
          const moods: Record<string, { morale: number; trust: number; grievance: number; strat?: number }> = {};
          for (const id of own) if (res!.moods?.[id]) moods[id] = res!.moods[id];
          recordSession(s, "race", res!.order, res!.points ?? {}, undefined, res!.dnf ?? [], moods, { skipWorld: !first });
        }
      });
      shareArcs(ms, h);
      first = false;
    }
    return ms;
  },

  authorizeCommand(plan, teamId, cmd) {
    const p = plan as { humanTeams?: Record<string, string[]> } | null;
    const c = cmd as { type?: string; carId?: string } | null;
    if (!p || !c || typeof c.type !== "string") return false;
    if (c.carId === undefined) return c.type === "reply";
    return !!p.humanTeams?.[teamId]?.includes(c.carId);
  },

  blockedActionTypes: ["continue", "day", "step", "recordSession", "simWeekend"],
};

// ---------------------------------------------------------------- helpers

export interface SessionResultIn {
  order: string[];
  points?: Record<string, number>;
  dnf?: string[];
  moods?: Record<string, { morale: number; trust: number; grievance: number; strat?: number }>;
  locks?: Record<string, "S" | "M" | "H">;
  used?: Record<string, Partial<Record<"S" | "M" | "H", number>>>;
  sets?: Record<string, import("../sim/tyreSets").TyreSet[]>;
}

function ownDrivers(s: CareerState, teamId: string): string[] {
  return Object.values(s.drivers).filter((d) => d.teamId === teamId && !d.retired).map((d) => d.id);
}

/** When the clients could not agree, the engine settles a session itself with every car on the AI. */
function headless(ms: MultiState, lead: string, k: "quali" | "race"): SessionResultIn {
  return as(ms, lead, (s) => {
    const plan: SessionPlan = planSession(s, k, true);
    if (k === "quali") {
      const { rows, sets } = runQualiWithSets(plan);
      const ex = extrasFromRows(rows, plan.humanIds, sets);
      return { order: rows.map((r) => r.carId), locks: ex.locks, used: ex.used, sets: ex.sets };
    }
    const sim = runRace(plan);
    const rows = sim.results();
    const points: Record<string, number> = {};
    for (const r of rows) points[r.carId] = r.points;
    return { order: rows.map((r) => r.carId), points, dnf: rows.filter((r) => r.dnf).map((r) => r.carId) };
  });
}

/** Rebuilds the sim config a client runs from a plan (the track is derived, not shipped). */
export function configFromPlan(plan: { circuitId: string; cfg: Record<string, unknown> }): QualiConfig | RaceConfig {
  const { track } = loadCircuit(plan.circuitId);
  return { ...plan.cfg, track } as unknown as QualiConfig | RaceConfig;
}

export { noisyRanking, rulesOf };
