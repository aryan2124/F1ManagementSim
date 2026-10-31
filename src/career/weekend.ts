import { onLanding } from "./dev";
import { socialAfterRace, type RadioQuote } from "./social";
import { planRetirements } from "./contracts";
import { logQuali, logRaceResult, checkClinch } from "./records";
import { ensureCrew, afterStops } from "./pitcrew";
import { AREA_TRAITS, TRAIT_GAIN_K, TRAIT_NAME, trackNeed } from "./traits";
import { addFact } from "./facts";
import { multiply } from "./factors";
import { setupFor, axisErrors, bestFor, changeSummary, trimOf, comfort, driverComments, lapLossSecs, lossFactors, runNoise, simBias, trimEffect, trueConfidence, TRIM } from "./setup";
import { trackCorrelates } from "./lab";
import { PROGRAMME_TRAITS, shiftKnow, weekendLearn, weekendRead } from "./know";
import { loadCircuit, scheduledLaps } from "../game/circuits";
import { raceWeather, qualiWeather, type WeekendSettings } from "../game/setup";
import { runQualifying, type QualiConfig, type QualiRow } from "../sim/qualifying";
import { baseTeam } from "./car";
import { COMPOUNDS, RaceSim } from "../sim/engine";
import { Rng, hashSeed } from "../sim/rng";
import { WET_ALLOC, bestSet, cloneSets, findSet, makeSets, type Alloc, type TyreSet } from "../sim/tyreSets";
import { BRAINS, DEFAULT_BRAIN } from "../sim/strategy";
import type { Compound, EntrySpec, RaceConfig } from "../sim/types";
import { bestCompoundFor, makeWeather, targetWetness } from "../sim/weather";
import { activeDrivers, entriesFor, staffOf, teamStaff } from "./car";
import { pushCard, ticker, news, recap } from "./cards";
import { CFG } from "./config";
import { driversOf, raceBonuses, raceMoney, type TeamResult } from "./finance";
import { addBoost, revealPart } from "./rnd";
import { clamp, fmtRange, lapDelta, round2 } from "./util";
import type { AxisInfo, CareerState, Programme, SessionKind, SessionResult, SetupVec, Trait, WeekendState } from "./types";
import { rulesOf } from "./eras";
import { afterRace, addCause } from "./people";
import { ensureStatus } from "./status";
import { standingsRank } from "./car";
import { PART_NAME, afterRaceService, fitAllDead, markDead, openWeekendPenalties, totalDrop, wearAfterRace, wearOf } from "./powertrain";

export const BASE_AXES: AxisInfo[] = [
  { id: "balance", label: "Balance", low: "Forward", high: "Rearward" },
  { id: "downforce", label: "Downforce", low: "Trim it", high: "Add it" },
  { id: "gearing", label: "Gearing", low: "Shorter", high: "Longer" },
  { id: "brakes", label: "Brake bias", low: "Forward", high: "Rearward" },
];
/** The setup axes for this season's rules. */
export function axesFor(s: CareerState): AxisInfo[] {
  const r = rulesOf(s);
  const out = BASE_AXES.filter((a) => !(r.removeAxes ?? []).includes(a.id));
  for (const x of r.extraAxes ?? []) if (!out.some((o) => o.id === x.id)) out.push({ id: x.id, label: x.label, low: x.low, high: x.high, target: x.target });
  return out;
}
const ids = (ws: WeekendState) => ws.axes.map((a) => a.id);
const zero = (axes: AxisInfo[]): SetupVec => Object.fromEntries(axes.map((a) => [a.id, 0]));
export const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];

/** The hidden best setup for a circuit and season. Street circuits want downforce, fast ones want to trim it. */
function sweetSpot(s: CareerState, circuitId: string, round: number, axes: AxisInfo[], rain = 0): SetupVec {
  // the best setup is mostly a property of the circuit (it stays much the same from year to year, which is what the team's notebook is for),
  // with a small yearly drift, and it moves with the forecast: a wet race wants more downforce and gentler brakes
  const r = new Rng(hashSeed(`sweet:${s.seed}:${circuitId}`));
  const y = new Rng(hashSeed(`sweet:${s.seed}:${s.year}:${circuitId}:${round}`));
  const me = s.teams[s.teamId];
  const dfBase = clamp(trackNeed(circuitId).df * 0.8 - 0.5 * clamp(me.dna.downforce - me.dna.efficiency, -0.6, 0.6), -0.8, 0.8);
  const df = clamp(dfBase + r.gauss() * 0.25 + y.gauss() * 0.1 + 0.3 * rain, -0.85, 0.85);
  const all: SetupVec = {
    balance: clamp(r.gauss() * 0.4 + y.gauss() * 0.08 + 0.4 * clamp(me.dna.grip - me.dna.platform, -0.6, 0.6), -0.8, 0.8),
    downforce: df,
    gearing: clamp(-df * 0.6 + r.gauss() * 0.25 + y.gauss() * 0.08, -0.85, 0.85),
    brakes: clamp(r.gauss() * 0.4 + y.gauss() * 0.08 - 0.15 * rain, -0.8, 0.8),
  };
  const out: SetupVec = {};
  for (const a of axes) out[a.id] = all[a.id] ?? clamp(r.gauss() * 0.45, -0.85, 0.85);
  return out;
}

export function sponsorRunsLost(s: CareerState): number {
  const demand = s.teams[s.teamId].sponsors.reduce((a, x) => a + x.demand, 0);
  return Math.floor(demand / 0.5);
}

export function engineerSkill(s: CareerState): number {
  const eng = teamStaff(s, s.teamId).filter((x) => x.role === "engineer");
  return eng.length ? eng.reduce((a, x) => a + x.skill, 0) / eng.length : 60;
}

/** The two rookie rounds of the year when the rookie rule is live (the 5th and 14th race). */
function rookieWeekend(s: CareerState): boolean {
  return !!rulesOf(s).rookieRule && (s.round === 4 || s.round === 13);
}

/** The heaviest rain at any point of the race, 0..1, so the weather card can be drawn from the real forecast. */
function raceRainPeak(s: CareerState, circuitId: string, seed: number): number {
  const settings: WeekendSettings = { teamId: s.teamId, circuitId, distance: "full", seed, weather: "random", difficulty: s.difficulty };
  const w = makeWeather(raceWeather(settings), 60);
  let peak = 0;
  for (let m = 0; m <= 90; m += 10) peak = Math.max(peak, targetWetness(w.rainAt(m * 60)));
  return peak;
}

export function startWeekend(s: CareerState): WeekendState {
  const race = s.calendar[s.round];
  // the last race of the season: whoever is about to retire says so now
  if (s.round === s.calendar.length - 1) planRetirements(s);
  const rng = new Rng(hashSeed(`wk:${s.seed}:${s.year}:${s.round}`));
  const sprint = race.sprint;
  const aiQuality: Record<string, number> = {};
  for (const id of Object.keys(s.teams)) {
    if (id === s.teamId) continue;
    aiQuality[id] = clamp(0.8 + (s.teams[id].skillBrain - 0.6) * 0.15 + rng.gauss() * 0.07, 0.45, 0.97);
  }
  const confidence: Record<string, number> = {};
  for (const d of driversOf(s, s.teamId)) confidence[d.id] = 0.45;
  const rules = rulesOf(s);
  const axes = axesFor(s);
  const ruleNotes: string[] = [];
  const rookieGone = rookieWeekend(s) ? 1 : 0;
  const lostRun = s.story.arcs.lostRun ?? 0;
  s.story.arcs.lostRun = 0;
  const lost = sponsorRunsLost(s) + rookieGone + lostRun;
  const sessions = sprint ? 1 : 3;
  const extra = rules.extraRuns ?? 0;
  const runs = Math.max(2, (sprint ? CFG.sprintRunsPerPractice : CFG.runsPerPractice) + extra - lost);
  if (extra) ruleNotes.push(`Rule: ${extra} extra practice run${extra > 1 ? "s" : ""} each session.`);
  if (rules.setupLockAfterFirst) ruleNotes.push("Rule: the setup is locked after the first practice session.");
  if (rookieGone) {
    const pr = Object.values(s.academy.prospects).find((x) => x.owner === s.teamId && x.status === "academy" && x.series === "f2");
    if (pr) {
      pr.seen += 2;
      pr.confidence = clamp(pr.confidence + 0.05, 0, 1);
      pr.log.unshift(`${s.year}: drove in first practice for your team.`);
    }
  }
  if (rookieGone) ruleNotes.push("Rule: a rookie drives one car in first practice, so you have one run fewer.");
  if (lostRun) ruleNotes.push("You gave an academy driver a Friday run, so you have one run fewer.");
  if (rules.reverseSprint && sprint) ruleNotes.push("Rule: the sprint grid is reversed for the top ten.");
  if (rules.handicapStart) ruleNotes.push("Rule: handicap start. The weakest teams start ahead.");
  if (rules.fixedStop) ruleNotes.push(`Rule: every pit stop takes ${rules.fixedStop.toFixed(1)} seconds.`);
  if (rules.scheduledSC) ruleNotes.push("Rule: a safety car is scheduled around the middle of the race.");
  if (rules.oneCompound) ruleNotes.push("Rule: one tyre compound only.");
  if (rules.tyreLottery) ruleNotes.push("Rule: tyre wear is a lottery each stint.");
  if (rules.lapLed) ruleNotes.push("Rule: one point for the most laps led.");
  if (rules.ballast) ruleNotes.push("Rule: leaders carry ballast.");
  let fanRule: WeekendState["fanRule"];
  if (rules.fanVote) {
    fanRule = rng.pick(["fastestLap", "extraRun", "softTyres"] as const);
    ruleNotes.push(`Fans voted: ${fanRule === "fastestLap" ? "a point for the fastest lap" : fanRule === "extraRun" ? "an extra practice run for everyone" : "softer tyres for the race"}.`);
  }
  let weatherCard: WeekendState["weatherCard"];
  if (rules.weatherCard) {
    const truth = raceRainPeak(s, race.circuitId, hashSeed(`weekend:${s.seed}:${s.year}:${s.round}`) % 90000 + SESSION_OFFSET.race);
    const kind = truth < 0.08 ? "dry" : truth < 0.35 ? "mixed" : "wet";
    const acc = clamp(0.78 * Math.sqrt(multiply(s, s.teamId, ["tools", "knowledge", "talent"]).value), 0.5, 0.95);
    const shown = rng.chance(acc) ? kind : rng.pick((["dry", "mixed", "wet"] as const).filter((k) => k !== kind));
    weatherCard = { kind: shown, chance: shown === "dry" ? [0, 15] : shown === "mixed" ? [25, 55] : [60, 90] };
    ruleNotes.push(`Weather card: ${shown}, chance of rain ${weatherCard.chance[0]} to ${weatherCard.chance[1]} percent. The race follows it loosely.`);
  }
  const ws: WeekendState = {
    round: s.round,
    circuitId: race.circuitId,
    sprint,
    stage: "practice",
    sessionsLeft: sessions,
    runsLeft: runs,
    sweet: sweetSpot(s, race.circuitId, s.round, axes, raceRainPeak(s, race.circuitId, hashSeed(`weekend:${s.seed}:${s.year}:${s.round}`) % 90000 + SESSION_OFFSET.race)),
    setup: zero(axes),
    known: zero(axes),
    hint: zero(axes),
    bias: simBias(s, axes, hashSeed(`weekend:${s.seed}:${s.year}:${s.round}`)),
    runs: [],
    fam: {},
    fresh: {},
    notes: [],
    tyreKnow: 0,
    raceKnow: 0,
    qualiKnow: 0,
    confidence,
    aiQuality,
    fitted: s.teams[s.teamId].projects.filter((p) => p.fittedRound === s.round + 1).map((p) => p.id),
    parc: false,
    results: {},
    seed: hashSeed(`weekend:${s.seed}:${s.year}:${s.round}`) % 90000,
    axes,
    sessions0: sessions,
    ruleNotes,
    fanRule,
    weatherCard,
  };
  if (fanRule === "extraRun") ws.runsLeft += 1;
  ws.allocRec = recommendAlloc(s, race.circuitId, sprint, ws.seed);
  ws.alloc = { ...ws.allocRec.alloc };
  // the notebook: what the team ran here last time is where this weekend starts
  const book = s.setupBook?.[race.circuitId];
  if (book) {
    for (const a of axes) {
      const v = clamp((book.setup[a.id] ?? 0) * 0.85, -1, 1);
      ws.setup[a.id] = v;
      ws.hint[a.id] = v;
      ws.known[a.id] = 0.2;
    }
    ws.setup[TRIM] = book.setup[TRIM] ?? 0;
    ws.notes.push(`The notebook from ${book.year}: you ran ${axes.map((a) => `${a.label.toLowerCase()} ${(book.setup[a.id] ?? 0).toFixed(2)}`).join(", ")} here, about ${book.loss.toFixed(2)}s off the best. That is where the sliders start, but the car and the conditions have changed.`);
  }
  openWeekendPenalties(s, ws, rng);
  for (const d of driversOf(s, s.teamId)) {
    const list = ws.drops?.[d.id];
    if (list?.length) ws.ruleNotes.push(`${d.spec.name} starts the race ${totalDrop(list)} places down: ${list.map((x) => x.why).join("; ")}.`);
  }
  for (const [id, list] of Object.entries(ws.drops ?? {})) {
    const dr = s.drivers[id];
    if (dr && dr.teamId !== s.teamId && list.length) ticker(s, `${dr.spec.name} takes a ${totalDrop(list)} place grid penalty this weekend: ${list[0].why}.`, 1);
  }
  if (sponsorRunsLost(s) > 0) ws.notes.push(`Sponsor commitments cost you ${sponsorRunsLost(s)} practice run${sponsorRunsLost(s) > 1 ? "s" : ""} this weekend.`);
  return ws;
}

// ---------------------------------------------------------------- practice

const WORDS: Record<string, [string, string]> = {
  balance: ["The rear is nervous. Shift the balance forward.", "The front pushes wide. Shift the balance rearward."],
  downforce: ["Too draggy on the straights. Trim some downforce.", "Short of grip in the corners. Add downforce."],
  gearing: ["Slow out of the slow corners. Shorten the gearing.", "Running out of revs on the straight. Lengthen the gearing."],
  brakes: ["The rear is unstable on turn in. Move brake bias forward.", "Locking the fronts. Move brake bias rearward."],
};

export function axisReport(axis: AxisInfo, tried: number, est: number): string {
  const diff = est - tried;
  if (Math.abs(diff) < 0.12) return `${axis.label}: feels right.`;
  const size = Math.abs(diff) > 0.5 ? "well off" : Math.abs(diff) > 0.28 ? "a bit off" : "slightly off";
  const words = WORDS[axis.id]?.[diff > 0 ? 1 : 0] ?? `Move toward: ${diff > 0 ? axis.high : axis.low}`;
  return `${axis.label} (${size}): ${words}`;
}

/** The range shown for where the best setting sits. It narrows as the team learns. */
export function setupRange(ws: WeekendState, axis: string): [number, number] {
  const hw = 0.8 * (1 - ws.known[axis]) + 0.06;
  return [clamp(ws.hint[axis] - hw, -1, 1), clamp(ws.hint[axis] + hw, -1, 1)];
}

export const allocTotal = (sprint: boolean): number => (sprint ? 12 : 13);

/**
 * The engineers' advice on how to split the weekend's dry sets. It follows the real conditions: how hard the track is on tyres, how long the race is,
 * the chance of rain. How firm the advice is depends on how well the team really knows its tyres: with a poor picture it is a guess, and it says so.
 */
export function recommendAlloc(s: CareerState, circuitId: string, sprint: boolean, seed: number): NonNullable<WeekendState["allocRec"]> {
  const total = allocTotal(sprint);
  const meta = loadCircuit(circuitId).meta;
  const sev = meta.tyreSeverity * (rulesOf(s).tyreSev ?? 1);
  const laps = scheduledLaps(meta);
  const rain = raceRainPeak(s, circuitId, seed + 11);
  const err = s.teams[s.teamId].know.wear.err;
  const sure = err <= 0.12;
  const why: string[] = [];
  let hard = Math.round(1.6 + 2.2 * (sev - 0.9));
  let soft = Math.round(6.5 - 2 * (sev - 1));
  why.push(sev > 1.1 ? "This track is hard on tyres, so we want hards for the long stints." : sev < 0.92 ? "This track is kind to tyres, so softs will last and we can lean on them." : "This track is average on tyres.");
  if (laps >= 62) { hard += 0; why.push(`A long race (${laps} laps) means stints will matter more than one-lap pace.`); }
  if (rain >= 0.4) { soft -= 1; why.push(`The forecast carries a real chance of rain (about ${Math.round(rain * 100)} percent), so we keep fewer dry sets back and rely on the intermediates and wets we already have.`); }
  if (!sure) {
    // a poor picture of the tyres makes the advice noisy
    const nudge = new Rng(hashSeed(`alloc:${seed}`)).chance(0.5) ? 1 : -1;
    soft += nudge;
    why.push("Our tyre numbers are still rough, so treat this as a good guess, not a plan. Tyre work in practice would make it firmer.");
  } else why.push("Our tyre picture is good, so we trust this split.");
  hard = clamp(hard, 1, 4);
  soft = clamp(soft, 4, 9);
  let med = total - soft - hard;
  if (med < 2) { soft -= 2 - med; med = 2; }
  why.push(`That gives ${soft} soft, ${med} medium and ${hard} hard. Qualifying and practice will use softs fast, and every set used in practice is a set you do not have on Sunday.`);
  return { alloc: { S: soft, M: med, H: hard }, why, sure };
}

/** Where a driver's sets live: by driver, or by team when the two cars share one pool. */
export const setKeyFor = (s: CareerState, driverId: string): string => (rulesOf(s).tyrePool ? (s.drivers[driverId]?.teamId ?? driverId) : driverId);

/** Build the weekend's sets from the chosen allocation, once. Older saves without any get the standard split. */
export function ensureSets(s: CareerState): Record<string, TyreSet[]> {
  const ws = s.weekend;
  if (!ws) return {};
  if (ws.setList) return ws.setList;
  const base: Alloc = ws.alloc ?? (ws.sprint ? { S: 4, M: 4, H: 4 } : { S: 4, M: 5, H: 4 });
  const list: Record<string, TyreSet[]> = {};
  const pool = !!rulesOf(s).tyrePool;
  for (const d of driversOf(s, s.teamId)) {
    const key = setKeyFor(s, d.id);
    if (list[key]) continue;
    const n = pool ? driversOf(s, s.teamId).length : 1;
    list[key] = makeSets({ S: base.S * n, M: base.M * n, H: base.H * n }, { I: WET_ALLOC.I * n, W: WET_ALLOC.W * n });
  }
  ws.setList = list;
  ws.allocDone = true;
  return list;
}

/** Confirm (or change) the allocation. Only possible before anything has run. */
export function setAlloc(s: CareerState, a: Alloc): { ok: boolean; message: string } {
  const ws = s.weekend;
  if (!ws) return { ok: false, message: "No weekend is open." };
  if (ws.allocDone || ws.setList) return { ok: false, message: "The sets are already unpacked for this weekend." };
  const total = allocTotal(ws.sprint);
  const S = Math.round(a.S), M = Math.round(a.M), H = Math.round(a.H);
  if (S < 1 || M < 1 || H < 1) return { ok: false, message: "Take at least one set of each compound." };
  if (S + M + H !== total) return { ok: false, message: `The allocation is ${total} dry sets, not ${S + M + H}.` };
  ws.alloc = { S, M, H };
  ensureSets(s);
  return { ok: true, message: `Allocation confirmed: ${S} soft, ${M} medium, ${H} hard.` };
}

/** What a practice run does to a set: the wear it takes. */
const RUN_WEAR: Record<string, number> = { setup: 0.05, qualiSim: 0.1, raceSim: 0.4, tyres: 0.5, part: 0 };

function pickPracticeSet(list: TyreSet[], programme: Programme, fresh: boolean, setId?: string): TyreSet | undefined {
  const named = findSet(list, setId);
  if (named && named.compound !== "I" && named.compound !== "W" && !(named.wear >= 0.8 && named.runs > 0)) return named;
  const comp = programme === "qualiSim" ? "S" : programme === "raceSim" || programme === "tyres" ? "H" : "M";
  if (fresh) return bestSet(list, comp) ?? undefined;
  // a worn set first when none was asked for
  return [...list].filter((x) => x.compound === comp && x.runs > 0 && x.wear < 0.7).sort((a, b) => a.wear - b.wear)[0] ?? bestSet(list, comp);
}

/** What each kind of run teaches the factory. Spent on a matching project in the next few weeks. */
const RUN_LESSONS: Partial<Record<Programme, { trait: Trait; pct: number; what: string }[]>> = {
  tyres: [{ trait: "wear", pct: 0.16, what: "tyre wear data" }, { trait: "warmup", pct: 0.1, what: "warm-up data" }],
  raceSim: [{ trait: "wear", pct: 0.1, what: "long-run data" }, { trait: "platform", pct: 0.12, what: "long-run balance data" }],
  setup: [{ trait: "grip", pct: 0.1, what: "setup data" }, { trait: "platform", pct: 0.1, what: "setup data" }],
  qualiSim: [{ trait: "downforce", pct: 0.12, what: "low-fuel data" }, { trait: "drive", pct: 0.08, what: "low-fuel data" }],
};
function grantRunBoosts(s: CareerState, programme: Programme, eng: number, wet: boolean, out: string[]) {
  const lessons = RUN_LESSONS[programme];
  if (!lessons) return;
  const gp = loadCircuit(s.weekend!.circuitId).meta.short;
  const given: string[] = [];
  for (const l of lessons) {
    const pct = round2(l.pct * (0.7 + 0.6 * eng) * (wet ? 0.5 : 1));
    if (pct < 0.03) continue;
    addBoost(s, s.teamId, l.trait, pct, `${gp} ${l.what}`);
    given.push(`${TRAIT_NAME[l.trait].toLowerCase()} projects ${Math.round(pct * 100)}% cheaper`);
  }
  if (given.length) out.push(`The factory can use this: ${given.join(", ")} for the next five weeks.`);
}

export function practiceRun(s: CareerState, programme: Programme, setup: SetupVec, driverId: string, opts: { fresh?: boolean; setId?: string } = {}): string[] {
  const ws = s.weekend;
  const out: string[] = [];
  if (!ws || ws.stage !== "practice" || ws.runsLeft <= 0) return out;
  const t = s.teams[s.teamId];
  const eng = engineerSkill(s) / 100;
  const sim = t.facilities.sim;
  const rng = new Rng(hashSeed(`run:${ws.seed}:${ws.sessionsLeft}:${ws.runsLeft}:${programme}`));
  const locked = !!rulesOf(s).setupLockAfterFirst && ws.sessionsLeft < ws.sessions0;
  if (programme === "setup" && locked) {
    out.push("The setup is locked after the first practice session by the rules. Run a different programme.");
    return out;
  }
  ws.runsLeft -= 1;
  // a worn unit can let go in practice: the run is lost and the unit has to be replaced
  const wr = wearOf(s, driverId);
  const frng = new Rng(hashSeed(`fail:${ws.seed}:${ws.sessionsLeft}:${ws.runsLeft}:${driverId}`));
  for (const part of ["pu", "gb"] as const) {
    const p = (part === "pu" ? 0.002 : 0.0015) + 0.08 * Math.pow(1 - wr[part].life, 3);
    if (frng.chance(p) && !(ws.dead?.[driverId] ?? []).includes(part)) {
      markDead(s, driverId, part);
      ws.confidence[driverId] = clamp((ws.confidence[driverId] ?? 0.45) - 0.02, 0, 0.95);
      out.push(`${s.drivers[driverId]?.spec.name ?? "The driver"}'s ${PART_NAME[part]} has failed in the run. The data from it is lost and the unit has to be replaced before he goes out again.`);
      return out;
    }
  }
  const drv = s.drivers[driverId];
  const wetRun = rng.chance(clamp(raceRainPeak(s, ws.circuitId, ws.seed + 11 * (ws.sessionsLeft + 1)) * 0.9, 0, 0.8));
  const lists = ensureSets(s);
  const list = lists[setKeyFor(s, driverId)] ?? [];
  const set = pickPracticeSet(list, programme, !!opts.fresh, opts.setId);
  const fresh = !!set && set.runs === 0;
  const worn = set && set.runs > 0 ? clamp(set.wear, 0, 0.8) : 0;
  if (set) {
    set.runs++;
    set.wear = round2(set.wear + (RUN_WEAR[programme] ?? 0.05) * (programme === "tyres" || programme === "raceSim" ? 1 : 1));
    set.log.push(`FP${ws.sessions0 - ws.sessionsLeft + 1}`);
    out.push(`Run on set ${set.id} (${COMPOUNDS[set.compound].name}, ${fresh ? "a new set" : `${Math.round(worn * 100)}% worn before the run`}).`);
    if (set.wear >= 0.8) out.push(`Set ${set.id} is finished: it is too worn to be worth putting on again.`);
  } else out.push("There was no usable set left in the garage for that run: it went out on scrubbed old rubber.");
  if (wetRun) out.push("Rain at the track during this run: the numbers are rougher than usual.");
  grantRunBoosts(s, programme, eng, wetRun, out);
  // the car goes out as the sliders say (unless the rules have locked the setup)
  const used: SetupVec = locked ? { ...ws.setup } : { ...setup };
  if (!locked) ws.setup = { ...setup };
  const poleRef = loadCircuit(ws.circuitId).meta.poleRef ?? 90;
  const timed = programme === "setup" || programme === "qualiSim" || programme === "raceSim";
  // familiarity grows with laps, with diminishing returns: spamming runs does not make him confident
  ws.fam ??= {};
  ws.fam[driverId] = clamp((ws.fam[driverId] ?? 0) + 0.07 * (1 - (ws.fam[driverId] ?? 0)), 0, 1);
  if (drv) {
    // what he tells the team about the car this run: how well it suits him, read through some noise
    const reading = comfort(ws, setupFor(ws, driverId, used), drv) + rng.gauss() * 0.08;
    ws.confidence[driverId] = clamp(0.3 + 0.28 * ws.fam[driverId] + 0.42 * clamp(reading, 0, 1), 0.1, 0.95);
  }
  const runs = (ws.runs ??= []);
  let delta: number | null = null;
  if (timed && drv) {
    const raw = lapLossSecs(ws, setupFor(ws, driverId, used), poleRef, drv, programme === "raceSim" ? "race" : "quali") + rng.gauss() * runNoise(eng, fresh, wetRun, programme) * (programme === "raceSim" ? 1 : 1 + worn);
    const first = runs.find((r) => r.delta !== null);
    const base = first?.raw ?? raw;
    delta = round2(raw - base);
    runs.push({ n: runs.length + 1, session: ws.sessions0 - ws.sessionsLeft + 1, programme, driverId, setup: used, fresh, setId: set?.id, delta, raw, wet: wetRun });
    const prev = [...runs].slice(0, -1).reverse().find((r) => r.delta !== null);
    out.push(first ? `Lap time ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}s against your baseline run (${changeSummary(ws, used, prev?.setup)}).` : `Baseline lap set. Everything else is measured against this run.`);
  } else {
    runs.push({ n: runs.length + 1, session: ws.sessions0 - ws.sessionsLeft + 1, programme, driverId, setup: used, fresh, setId: set?.id, delta: null, raw: null, wet: wetRun });
  }
  if (programme === "setup" || programme === "qualiSim" || programme === "raceSim") {
    if (drv && !wetRun) out.push(...driverComments(ws, setupFor(ws, driverId, used), drv, eng, rng));
    else if (drv && wetRun) out.push(`${drv.spec.name.split(" ").slice(-1)[0]}: too wet to say anything useful about the setup.`);
    // the engineers update their own picture too (a model, so it keeps its bias)
    const learn = programme === "setup" ? 1 : 0.5;
    for (const ax of ws.axes) {
      const a = ax.id;
      const sd = 0.5 * (1.25 - eng * 0.9) * (1 - 0.1 * (sim - 3)) * (1 - ws.known[a] * 0.5) * (wetRun ? 1.7 : 1) * (fresh ? 0.8 : 1);
      const obs = clamp(ws.sweet[a] + (ws.bias?.[a] ?? 0) + rng.gauss() * sd, -1, 1);
      const g = (ws.known[a] === 0 ? 0.75 : 0.45) * learn;
      ws.hint[a] = round2(ws.hint[a] * (1 - g) + obs * g);
      ws.known[a] = clamp(1 - (1 - ws.known[a]) * (1 - g * 0.7), 0, 0.97);
    }
  }
  if (programme === "tyres") {
    ws.tyreKnow = clamp(ws.tyreKnow + (0.3 + eng * 0.1) * (wetRun ? 0.4 : 1) * (0.9 + 1.2 * Math.min(0.35, worn)), 0, 1);
    out.push(wetRun ? "Tyre wear study in the wet: little learned about dry wear." : worn > 0.15 ? "Tyre wear study on a used set: the engineers learned a lot about how the rubber ages." : "Tyre wear study done on a fresh set: useful, but the wear curve is better learned on rubber that is already a little worn.");
  } else if (programme === "raceSim") {
    ws.raceKnow = clamp(ws.raceKnow + (0.3 + eng * 0.1) * (wetRun ? 0.5 : 1) * (0.9 + 0.35 * Math.min(1, worn / 0.3)), 0, 1);
    out.push("Race simulation done: stint pace and fuel load numbers are firmer. The lap time above is a race-trim lap.");
  } else if (programme === "qualiSim") {
    ws.qualiKnow = clamp(ws.qualiKnow + 0.3 + eng * 0.1, 0, 1);
    out.push("Qualifying simulation done: the driver has a clearer idea of the lap. The lap time above is a qualifying-trim lap.");
  } else if (programme === "part") {
    // a part held back in the garage is tested first: the whole point of holding it is to learn the real number before it goes on the car
    const held = t.projects.filter((p) => p.status === "ready" && p.hold && p.tested === undefined);
    const fitted = t.projects.filter((p) => ws.fitted.includes(p.id) && p.tested === undefined);
    const p = held[0] ?? fitted[0];
    if (!p) out.push("There is no new part to test: nothing is held back in the garage and nothing new went on the car this weekend.");
    else {
      const noise = rng.gauss() * (1 - eng) * 0.04;
      p.tested = round2(p.trueGain + noise);
      const mid = (p.predLo + p.predHi) / 2;
      if (p.status === "fitted") {
        shiftKnow(t, p.trait ?? AREA_TRAITS[p.area][0], round2((p.tested - mid) * TRAIT_GAIN_K * 0.7));
        out.push(`Part test: ${p.name} is giving about ${fmtRange(p.tested - 0.03, p.tested + 0.03)} (predicted ${fmtRange(p.predLo, p.predHi)}).`);
      } else {
        const verdict = p.tested < p.predLo - 0.02 ? "worse than hoped" : p.tested > p.predHi + 0.02 ? "better than hoped" : "about as predicted";
        out.push(`Bench test of the held part ${p.name}: it gives about ${fmtRange(p.tested - 0.03, p.tested + 0.03)}, ${verdict} (predicted ${fmtRange(p.predLo, p.predHi)}). You decide: fit it at the next race or scrap it.${p.tested <= 0 ? " It would not make the car any faster." : ""}`);
      }
    }
  }
  const focus = PROGRAMME_TRAITS[programme] ?? [];
  if (focus.length) {
    weekendRead(s, s.teamId, focus, 0.6 + 0.4 * eng);
    out.push(`The data tightened the engineers' numbers on ${focus.map((x) => TRAIT_NAME[x].toLowerCase()).join(", ")}.`);
  }
  ws.notes.unshift(...out);
  ws.notes = ws.notes.slice(0, 30);
  if (ws.runsLeft <= 0) {
    ws.sessionsLeft -= 1;
    if (ws.sessionsLeft > 0) {
      ws.runsLeft = Math.max(2, CFG.runsPerPractice - sponsorRunsLost(s));
      // the track rubbers in between sessions: the best balance drifts a little
      const dr = new Rng(hashSeed(`drift:${ws.seed}:${ws.sessionsLeft}`));
      if (ws.sweet.balance !== undefined) ws.sweet.balance = clamp(ws.sweet.balance + 0.05 + dr.gauss() * 0.03, -1, 1);
      ws.notes.unshift("Next practice session. The track has rubbered in: the best balance has moved a little, so earlier readings are slightly out of date.");
    } else {
      // stay here: the player may want to finish the setup with everything the runs taught, then press END PRACTICE
      ws.notes.unshift("All runs used. Make your final setup changes and save, then press END PRACTICE.");
    }
  }
  return out;
}

/** End practice early and go to qualifying. */
export function endPractice(s: CareerState) {
  const ws = s.weekend;
  if (!ws || ws.stage !== "practice") return;
  ws.sessionsLeft = 0;
  ws.runsLeft = 0;
  ws.stage = ws.sprint ? "sq" : "quali";
}

// ---------------------------------------------------------------- setup effects on the cars

export function setupQuality(ws: WeekendState, setup: SetupVec): number {
  const e = axisErrors(ws, setup);
  let err = 0;
  for (const a of ids(ws)) err += Math.abs(e[a] ?? 0);
  return clamp(1 - err / ws.axes.length, 0, 1);
}

export function setupEffects(s: CareerState, ws: WeekendState, kind: "quali" | "race" = "race"): Record<string, { aero: number; power: number; tyre: number; consistency: number }> {
  const out: Record<string, { aero: number; power: number; tyre: number; consistency: number }> = {};
  const fx = (errs: Record<string, number>, dfSign: number) => {
    const ad = Math.abs(errs.downforce ?? 0);
    const aero = dfSign < 0 ? -0.0035 * ad : -0.0008 * ad;
    const df = dfSign > 0 ? -0.0035 * ad : -0.0008 * ad;
    const r = { aero, power: df - 0.0022 * Math.abs(errs.gearing ?? 0), tyre: -0.1 * Math.abs(errs.balance ?? 0), consistency: -0.03 * Math.abs(errs.brakes ?? 0) };
    // axes added by the regulations push on whatever they are about
    for (const ax of ws.axes) {
      if (!ax.target) continue;
      const e = Math.abs(errs[ax.id] ?? 0);
      if (ax.target === "aero") r.aero -= 0.0025 * e;
      else if (ax.target === "power") r.power -= 0.0025 * e;
      else if (ax.target === "tyre") r.tyre -= 0.07 * e;
      else r.consistency -= 0.02 * e;
    }
    return r;
  };
  for (const id of Object.keys(s.teams)) {
    if (id === s.teamId) {
      // the real cost of the setup: axes interact, and the qualifying trim buys one lap at the price of race tyres
      const mine = driversOf(s, id);
      const fs = (mine.length ? mine : [null]).map((dr) => lossFactors(ws, dr ? setupFor(ws, dr.id) : ws.setup));
      const avg = (k: "aero" | "power" | "tyre" | "consistency") => fs.reduce((a, x) => a + x[k], 0) / fs.length;
      const f = { aero: avg("aero"), power: avg("power"), tyre: avg("tyre"), consistency: avg("consistency") };
      const tr = trimEffect(ws.setup, kind);
      out[id] = { aero: f.aero + tr.aero, power: f.power, tyre: f.tyre + tr.tyre, consistency: f.consistency };
      // a tyre study teaches the crew how to look after the rubber: up to four percent less wear
      out[id].tyre += 0.04 * ws.tyreKnow;
    } else {
      const q = ws.aiQuality[id] ?? 0.8;
      const e = (1 - q) * 2.2;
      out[id] = fx(Object.fromEntries(ws.axes.map((a) => [a.id, e])), e > 0 ? (id.length % 2 ? 1 : -1) : 0);
    }
  }
  return out;
}

/** After the weekend: how far the setup was from the best one, and what that cost on track. Uses the hidden truth, so it is only told once the racing is over. */
export interface SetupReview {
  lines: string[];
  lapCost: number;
  tyreCost: number;
  tyreKnow: number;
  raceKnow: number;
  qualiKnow: number;
}
export function setupReview(s: CareerState, ws: WeekendState): SetupReview {
  const fx = setupEffects(s, ws)[s.teamId];
  const { meta } = loadCircuit(ws.circuitId);
  const lapCost = Math.max(0, -(fx.aero + fx.power)) * (meta.poleRef ?? 90);
  const lines = ws.axes.map((a) => {
    const set = ws.setup[a.id] ?? 0;
    const best = bestFor(ws, ws.setup, a.id);
    const off = set - best;
    const size = Math.abs(off) < 0.12 ? "right on it" : Math.abs(off) < 0.3 ? "a little off" : Math.abs(off) < 0.55 ? "clearly off" : "far off";
    const dir = Math.abs(off) < 0.12 ? "" : off > 0 ? ` (too far toward ${a.high.toLowerCase()})` : ` (too far toward ${a.low.toLowerCase()})`;
    return `${a.label}: you ran ${set.toFixed(2)}, with your other settings the track wanted ${best.toFixed(2)}: ${size}${dir}.`;
  });
  // how each driver felt about the car, and what the trim did
  for (const d of driversOf(s, s.teamId)) {
    const c = comfort(ws, ws.setup, d);
    lines.push(`${d.spec.name} was ${c > 0.75 ? "happy with the car" : c > 0.5 ? "reasonably comfortable" : c > 0.3 ? "not at home in the car" : "fighting the car"} (his own taste moved his best setting a little: that is why the two drivers disagreed).`);
  }
  const trim = trimOf(ws.setup);
  if (Math.abs(trim) >= 0.1) lines.push(`Trim ${trim > 0 ? "toward qualifying" : "toward the race"} (${trim.toFixed(2)}): ${trim > 0 ? "a little one-lap pace, paid for with tyre wear on Sunday" : "gentler on the tyres in the race, a little slower over one lap"}.`);
  return { lines, lapCost, tyreCost: Math.max(0, -fx.tyre), tyreKnow: ws.tyreKnow, raceKnow: ws.raceKnow, qualiKnow: ws.qualiKnow };
}

// ---------------------------------------------------------------- sessions

export interface SessionPlan {
  kind: SessionKind;
  entries: EntrySpec[];
  humanIds: string[];
  qualiCfg?: QualiConfig;
  raceCfg?: RaceConfig;
  settings: WeekendSettings;
  aiTyres: Record<string, Compound>;
  /** Start tyres fixed by the qualifying lock rule. */
  locks?: Record<string, Compound>;
  laps: number;
  gp: string;
  circuitId: string;
  /** Grid places lost per driver in this race (power unit and gearbox penalties, parc ferme breaches). */
  drops?: Record<string, number>;
}

/** The career's picture of how each human driver feels, handed to the race so the radio starts from the truth. */
function moodsFor(s: CareerState, ids: string[]): Record<string, { morale: number; trust: number; grievance: number; strat?: number }> {
  const out: Record<string, { morale: number; trust: number; grievance: number; strat?: number }> = {};
  for (const id of ids) {
    const d = s.drivers[id];
    if (!d) continue;
    const roleHit = d.role === "number2" ? 0.12 : 0;
    out[id] = { morale: clamp(d.morale, 0.05, 1), trust: clamp(d.trust, 0.05, 1), grievance: clamp(d.grievance + roleHit + (s.rift.stage >= 2 ? 0.1 : 0), 0, 1) };
  }
  return out;
}

/** The simulated race-format rule modules, as the race engine wants them. */
function raceFormatRules(rules: ReturnType<typeof rulesOf>, laps: number, seed: number) {
  const out: Record<string, unknown> = {};
  if (rules.pushToPass) out.pushToPass = rules.pushToPass;
  if (rules.defenceTokens) out.defenceTokens = rules.defenceTokens;
  if (rules.batterySwap) out.batterySwap = true;
  if (rules.refuelling) out.refuelling = true;
  if (rules.checkpointCuts) out.checkpointCuts = true;
  if (rules.stageRacing) out.stageRacing = true;
  if (rules.twoHeat) out.twoHeat = true;
  if (rules.standingRestarts) out.standingRestarts = true;
  if (rules.openRadio) out.openRadio = true;
  if (rules.radioQuota) out.radioQuota = rules.radioQuota;
  if (rules.stopWindow && laps >= 8) {
    const r = new Rng(seed + 303).next();
    const a = Math.max(2, Math.round(laps * (0.2 + 0.12 * r)));
    out.stopWindow = [a, Math.min(laps - 2, a + Math.round(laps * 0.38))];
  }
  return out;
}

/** Fresh sets the human cars have left for the race. Shared by both cars when the pool rule is on. */
/** Wet-weather allocation: a few sets of intermediates and full wets per car. */
const WET_SETS = { I: 3, W: 2 } as const;

function tyreSetsFor(ws: WeekendState, humanIds: string[], entries: EntrySpec[], pool: boolean) {
  const out: Record<string, Partial<Record<Compound, number>>> = {};
  const base = ws.sprint ? BASE_SETS.sprint : BASE_SETS.normal;
  for (const id of humanIds) {
    const have = ws.tyreSets?.[id] ?? { S: base.S, M: base.M, H: base.H };
    if (pool) {
      const team = entries.find((e) => e.id === id)?.team.id ?? id;
      const prev: Partial<Record<Compound, number>> = out[team] ?? { S: 0, M: 0, H: 0, I: 0, W: 0 };
      out[team] = { S: (prev.S ?? 0) + have.S, M: (prev.M ?? 0) + have.M, H: (prev.H ?? 0) + have.H, I: (prev.I ?? 0) + WET_SETS.I, W: (prev.W ?? 0) + WET_SETS.W };
    } else out[id] = { ...have, ...WET_SETS };
  }
  return out;
}

/** The weekend's physical sets for the human cars in this session, copied so the session can wear them freely. */
function tyreSetListFor(s: CareerState, humanIds: string[]): Record<string, TyreSet[]> {
  const all = ensureSets(s);
  const out: Record<string, TyreSet[]> = {};
  for (const id of humanIds) {
    const key = setKeyFor(s, id);
    if (all[key] && !out[key]) out[key] = cloneSets(all[key]);
  }
  return out;
}

function brainSkillMap(s: CareerState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of Object.keys(s.teams)) {
    const st = staffOf(s, id, "strategy");
    const base = (BRAINS[id] ?? DEFAULT_BRAIN).skill;
    out[id] = clamp(base * 0.45 + 0.28 + ((st?.skill ?? 65) / 100) * 0.3, 0.3, 0.97);
  }
  return out;
}

/** The ladder of session seeds: each session of a weekend has its own weather and luck. */
const SESSION_OFFSET: Record<SessionKind, number> = { sq: 11, sprint: 12, quali: 13, race: 14 };

/** Move each listed driver back by his places, in grid order, keeping everyone else in line. */
export function applyDrops(grid: string[], places: Record<string, number>): string[] {
  const g = [...grid];
  for (const id of grid) {
    const p = places[id];
    if (!p) continue;
    const i = g.indexOf(id);
    if (i < 0) continue;
    g.splice(i, 1);
    g.splice(Math.min(g.length, i + p), 0, id);
  }
  return g;
}

export function planSession(s: CareerState, kind: SessionKind, allAi = false): SessionPlan {
  const ws = s.weekend as WeekendState;
  const { meta, track } = loadCircuit(ws.circuitId);
  const settings: WeekendSettings = { teamId: s.teamId, circuitId: ws.circuitId, distance: "full", seed: ws.seed + SESSION_OFFSET[kind], weather: "random", difficulty: s.difficulty };
  // what the team learnt in practice carries into the sessions: a qualifying simulation steadies the drivers over one lap, a race simulation over a stint
  // the drivers' confidence is the truth about how well the car suits each of them, not the noisy reading the team had in practice
  const conf: Record<string, number> = {};
  for (const id of Object.keys(ws.confidence)) {
    const d = s.drivers[id];
    const base = d ? trueConfidence(ws, d) : ws.confidence[id] ?? 0.5;
    conf[id] = clamp(base + (kind === "quali" || kind === "sq" ? 0.14 * ws.qualiKnow : 0.12 * ws.raceKnow), 0, 0.97);
  }
  const isQuali = kind === "quali" || kind === "sq";
  let entries = entriesFor(s, conf, setupEffects(s, ws, isQuali ? "quali" : "race"), ws.circuitId);
  if (allAi) entries = entries.map((e) => ({ ...e, human: false }));
  const humanIds = entries.filter((e) => e.human).map((e) => e.id);
  const full = scheduledLaps(meta);
  const rules = rulesOf(s);
  const lapsBase = s.raceLength === "quick" ? (kind === "sprint" ? 6 : 10) : kind === "sprint" ? Math.max(5, Math.ceil(100000 / track.length)) : s.raceLength === "full" ? full : Math.max(5, Math.round(full / 2));
  const lapsRng = new Rng(settings.seed + 5);
  let laps = rules.timed && kind === "race" ? Math.max(5, Math.round(lapsBase * (1 + (lapsRng.next() - 0.5) * 2 * rules.timed))) : lapsBase;
  const shortFormat = !!rules.formatSplit && kind === "race" && ws.round % 2 === 1;
  if (shortFormat) laps = Math.max(5, Math.round(laps * 0.6));
  const plan: SessionPlan = { kind, entries, humanIds, settings, aiTyres: {}, laps, gp: meta.gp, circuitId: ws.circuitId };
  const sets = tyreSetListFor(s, humanIds);
  if (kind === "sq" || kind === "quali") {
    const ranked = Object.entries(s.standings.drivers).sort((a, b) => a[1] - b[1]).map(([id]) => id);
    const release = [...entries.map((e) => e.id)].sort((a, b) => ranked.indexOf(a) - ranked.indexOf(b));
    plan.qualiCfg = {
      seed: settings.seed, track, entries, weather: qualiWeather(settings), minutes: kind === "sq" ? [12, 10, 8] : undefined,
      rules: rules.aggregateQuali || rules.singleShot || rules.tyrePool ? { aggregate: rules.aggregateQuali, singleShot: rules.singleShot, releaseOrder: release, ...(rules.tyrePool ? { tyrePool: true } : {}) } : undefined,
      tyreSetList: sets,
    };
    return plan;
  }
  const rng = new Rng(settings.seed + 77);
  const rw = raceWeather(settings);
  const w0 = rw.mode === "off" ? 0 : targetWetness(makeWeather(rw, 60).rainAt(0));
  for (const e of entries) {
    if (e.human) continue;
    const r = rng.next();
    const bold = (BRAINS[e.team.id] ?? DEFAULT_BRAIN).boldness;
    const pS = 0.1 + 0.4 * bold;
    plan.aiTyres[e.id] = laps <= 12 ? (r < 0.5 ? "S" : "M") : r < pS ? "S" : r < 0.88 - 0.12 * (bold - 0.5) ? "M" : "H";
    if (w0 > 0.08) plan.aiTyres[e.id] = bestCompoundFor(w0 + (rng.next() - 0.5) * 0.12, false);
  }
  if (kind === "race" && rules.qualiTyreLock && ws.locks) {
    plan.locks = { ...ws.locks };
    for (const e of entries) if (!e.human && ws.locks[e.id] && w0 <= 0.08) plan.aiTyres[e.id] = ws.locks[e.id];
  }
  const prev = kind === "sprint" ? ws.results.sq : ws.results.quali;
  let grid = prev?.grid ?? entries.map((e) => e.id);
  let releaseDelays: Record<string, number> | undefined;
  if (kind === "sprint" && rules.reverseSprint) grid = [...grid.slice(0, 10).reverse(), ...grid.slice(10)];
  if (kind === "race" && rules.handicapStart) {
    const teamPos = new Map(standingsRank(s).map((id, i) => [id, i] as const));
    const posInGrid = new Map(grid.map((id, i) => [id, i] as const));
    const teamOf = (id: string) => s.drivers[id]?.teamId ?? "";
    grid = [...grid].sort((a, b) => (teamPos.get(teamOf(b)) ?? 0) - (teamPos.get(teamOf(a)) ?? 0) || (posInGrid.get(a) ?? 0) - (posInGrid.get(b) ?? 0));
    // the strongest six teams are also held at the line: the leader waits longest
    releaseDelays = {};
    for (const id of grid) {
      const p = teamPos.get(teamOf(id)) ?? 10;
      if (p < 6) releaseDelays[id] = round2((6 - p) * 0.5);
    }
  }
  // changing the setup after parc ferme sends both human cars to the pit lane: the back of the grid
  if (kind === "race" && ws.parcBroken) {
    const human = grid.filter((id) => humanIds.includes(id));
    grid = [...grid.filter((id) => !humanIds.includes(id)), ...human];
  }
  // grid penalties: new units beyond the allowance, parc ferme breaches, and anything carried from the last race
  if (kind === "race" && ws.drops) {
    const places: Record<string, number> = {};
    for (const [id, list] of Object.entries(ws.drops)) places[id] = totalDrop(list);
    plan.drops = places;
    grid = applyDrops(grid, places);
  }
  const oneCompound = !!rules.oneCompound;
  if (oneCompound) for (const e of entries) if (!e.human && !plan.aiTyres[e.id]) plan.aiTyres[e.id] = "M";
  if (oneCompound && w0 <= 0.08) for (const e of entries) plan.aiTyres[e.id] = "M";
  plan.raceCfg = {
    seed: settings.seed,
    year: s.year,
    engineerSkill: engineerSkill(s) / 100,
    laps,
    track,
    entries,
    grid,
    releaseDelays,
    startTyres: { ...plan.aiTyres },
    tyreSeverity: meta.tyreSeverity * (rules.tyreSev ?? 1) * (ws.fanRule === "softTyres" ? 1.15 : 1),
    weather: rw,
    difficulty: s.difficulty,
    brainSkill: brainSkillMap(s),
    moods: moodsFor(s, humanIds),
    intel: { tyre: ws.tyreKnow, race: ws.raceKnow },
    ...(kind === "sprint" ? { pointsTable: SPRINT_POINTS, twoCompoundRule: false } : {}),
    ...(oneCompound || shortFormat ? { twoCompoundRule: false } : {}),
    ...(kind === "race" ? { tyreSets: tyreSetsFor(ws, humanIds, entries, !!rules.tyrePool) } : {}),
    ...(kind === "race" || kind === "sprint" ? { tyreSetList: sets, sessionLabel: kind === "sprint" ? "SPRINT" : "RACE" } : {}),
    rules: {
      fixedStop: rules.fixedStop,
      scheduledSC: rules.scheduledSC && kind === "race",
      oneCompound,
      tyreLottery: rules.tyreLottery,
      lapLed: rules.lapLed && kind === "race",
      fastestLapPoint: ws.fanRule === "fastestLap" && kind === "race",
      ...(kind === "race" ? raceFormatRules(rules, laps, settings.seed) : {}),
      ...(rules.tyrePool ? { tyrePool: true } : {}),
    },
    ...(rules.refuelling && kind === "race" ? { startFuel: 0.55 } : {}),
  };
  return plan;
}

function recordStandings(s: CareerState, kind: SessionKind, order: string[], points: Record<string, number>) {
  const bestOnly = !!rulesOf(s).bestCarOnly;
  const teamBest: Record<string, number> = {};
  for (const [id, p] of Object.entries(points)) {
    if (!p) continue;
    s.standings.drivers[id] = (s.standings.drivers[id] ?? 0) + p;
    const d = s.drivers[id];
    if (!d?.teamId) continue;
    if (bestOnly) teamBest[d.teamId] = Math.max(teamBest[d.teamId] ?? 0, p);
    else s.standings.teams[d.teamId] = (s.standings.teams[d.teamId] ?? 0) + p;
  }
  for (const [tid, p] of Object.entries(teamBest)) s.standings.teams[tid] = (s.standings.teams[tid] ?? 0) + p;
  void kind;
  void order;
}

/** Store a finished session. A finished Grand Prix closes the weekend and pays out. */
const BASE_SETS = { normal: { S: 4, M: 5, H: 4 }, sprint: { S: 4, M: 4, H: 4 } } as const;

export function recordSession(s: CareerState, kind: SessionKind, order: string[], points: Record<string, number>, grid: string[] | undefined, dnf: string[], moods?: Record<string, { morale: number; trust: number; grievance: number; strat?: number }>, extra?: { sets?: Record<string, TyreSet[]>; locks?: Record<string, "S" | "M" | "H">; used?: Record<string, Partial<Record<"S" | "M" | "H", number>>>; skipWorld?: boolean; failed?: Record<string, "pu" | "gb">; fastest?: string; pit?: { stops: number; slow: number; best?: number }; radio?: RadioQuote[]; duels?: { a: string; b: string; passes: number; contacts: number }[] }) {
  const ws = s.weekend;
  if (!ws) return;
  if (kind === "quali" || (kind === "sq" && !ws.sprint)) {
    // the tyre economy: what qualifying used is gone, and the lock rule fixes the start tyre
    const base = ws.sprint ? BASE_SETS.sprint : BASE_SETS.normal;
    const sets: Record<string, Record<"S" | "M" | "H", number>> = {};
    for (const id of Object.keys(extra?.used ?? {})) {
      const u = extra?.used?.[id] ?? {};
      const f = ws.fresh?.[id] ?? {};
      sets[id] = { S: Math.max(0, base.S - (u.S ?? 0) - (f.S ?? 0)), M: Math.max(0, base.M - (u.M ?? 0) - (f.M ?? 0)), H: Math.max(0, base.H - (u.H ?? 0) - (f.H ?? 0)) };
    }
    // the notebook keeps what was run here, and how far off the best it turned out to be
    const poleRef = loadCircuit(ws.circuitId).meta.poleRef ?? 90;
    (s.setupBook ??= {})[ws.circuitId] = { year: s.year, setup: { ...ws.setup }, loss: Math.round(lapLossSecs(ws, ws.setup, poleRef) * 100) / 100 };
    ws.tyreSets = { ...(ws.tyreSets ?? {}), ...sets };
    // the sets themselves: whatever the session did to them is remembered
    if (extra?.sets) {
      ws.setList = { ...(ws.setList ?? ensureSets(s)) };
      for (const [k, l] of Object.entries(extra.sets)) if (ws.setList[k]) ws.setList[k] = cloneSets(l);
    }
    if (extra?.locks) ws.locks = { ...(ws.locks ?? {}), ...extra.locks };
  }
  if (moods && (kind === "race" || kind === "sprint")) carryMoods(s, order, dnf, moods);
  const res: SessionResult = { kind, order, points, grid, dnf };
  ws.results[kind] = res;
  if (!extra?.skipWorld) {
    const rn = ws.round + 1;
    if (kind === "quali" && grid) logQuali(s, kind, grid, rn);
    if (kind === "sprint" || kind === "race") logRaceResult(s, kind, order, dnf, extra?.fastest, rn);
  }
  if (extra?.pit) afterStops(ensureCrew(s, s.teamId, baseTeam(s.teamId).pitCrew), extra.pit.stops, extra.pit.slow, extra.pit.best);
  if (extra?.pit && extra.pit.stops > 0) {
    // a clean stop lifts the crew chief and everyone working with him; a slow one sours the garage (and feeds Cohesion next time)
    const mech = staffOf(s, s.teamId, "mechanic");
    if (mech) mech.mood = clamp(mech.mood + (extra.pit.slow === 0 && (extra.pit.best ?? 9) < 2.6 ? 0.04 : extra.pit.slow > 0 ? -0.03 * extra.pit.slow : 0.01), 0, 1);
    if (extra.pit.slow === 0 && (extra.pit.best ?? 9) < 2.4) addFact(s, "pit", `${s.teamId.toUpperCase()} pit crew produced a ${extra.pit.best?.toFixed(1)} s stop.`, [s.teamId], 1);
  }
  if (kind === "sq" || kind === "quali") {
    ws.parc = true;
    ws.stage = kind === "sq" ? "sprint" : "race";
  }
  if (kind === "sprint" || kind === "race") {
    const mine = driversOf(s, s.teamId).map((d) => d.id);
    wearAfterRace(s, mine, kind);
    for (const [id, part] of Object.entries(extra?.failed ?? {})) if (mine.includes(id)) markDead(s, id, part);
  }
  if (kind === "sprint") {
    if (!extra?.skipWorld) recordStandings(s, kind, order, points);
    ws.stage = "quali";
    const w = s.drivers[order[0]];
    if (w) ticker(s, `${w.spec.name} wins the sprint.`, 2);
    sprintMoney(s, order);
  }
  if (kind === "race") {
    if (!extra?.skipWorld) recordStandings(s, kind, order, points);
    finishRace(s, ws, res, !!extra?.skipWorld, extra?.radio, extra?.duels);
    ws.stage = "done";
    // whatever died is replaced at the factory; the penalty waits for the next race
    if (ws.dead) {
      for (const id of Object.keys(ws.dead)) wearOf(s, id);
      ws.dead = {};
    }
    afterRaceService(s, driversOf(s, s.teamId).map((d) => d.id));
    if (!extra?.skipWorld) checkClinch(s, ws.round + 1);
    {
      const mineIds = driversOf(s, s.teamId).map((d) => d.id);
      const lines = mineIds.map((id) => {
        const pos = order.indexOf(id) + 1;
        const out = dnf.includes(id);
        const pts = points[id] ?? 0;
        return `${s.drivers[id].spec.code} ${out ? "retired" : `P${pos}`}${pts ? `, +${pts} pts` : ""}`;
      });
      const my = s.teams[s.teamId];
      lines.push(`Cash $${my.cash.toFixed(1)}m, board ${Math.round(my.board)}.`);
      const moods = driversOf(s, s.teamId).map((d) => `${d.spec.code} ${d.morale > 0.7 ? "happy" : d.morale > 0.5 ? "fine" : d.morale > 0.3 ? "annoyed" : "furious"}`).join(", ");
      lines.push(`Mood: ${moods}.`);
      s.lastRace = lines;
    }
  }
}

/** Who raced whom on track: passes and contact between one of the player's cars and a car from another team. The world remembers it. */
function duelsOf(sim: RaceSim, mineIds: string[]) {
  const m = new Map<string, { a: string; b: string; passes: number; contacts: number }>();
  for (const e of sim.keyEvents) {
    if ((e.kind !== "overtake" && e.kind !== "contact") || !e.carId || !e.otherId) continue;
    const mine = mineIds.includes(e.carId) ? e.carId : mineIds.includes(e.otherId) ? e.otherId : null;
    const other = mine === e.carId ? e.otherId : e.carId;
    if (!mine || mineIds.includes(other)) continue;
    const k = mine + "|" + other;
    const r = m.get(k) ?? { a: mine, b: other, passes: 0, contacts: 0 };
    if (e.kind === "overtake") r.passes++;
    else r.contacts++;
    m.set(k, r);
  }
  return [...m.values()];
}

/** Fastest lap car and the player's pit stop numbers, from a finished race sim. */
export function raceExtras(sim: RaceSim, mineIds: string[]) {
  const sets = sim.finalSets();
  const stops = sim.stopLog.filter((x) => mineIds.includes(x.carId));
  const secs = stops.map((x) => x.secs).filter((x) => x > 0);
  return {
    sets,
    fastest: sim.bestLapCar || undefined,
    pit: { stops: stops.length, slow: secs.filter((x) => x > 4.6).length, best: secs.length ? Math.min(...secs) : undefined },
    radio: (sim.radio?.quotes ?? []).filter((q) => mineIds.includes(q.carId)).map((q) => ({ ...q })),
    duels: duelsOf(sim, mineIds),
  };
}

/** What happened in the race changes how the drivers feel back at the factory. */
function carryMoods(s: CareerState, order: string[], dnf: string[], moods: Record<string, { morale: number; trust: number; grievance: number; strat?: number }>) {
  for (const [id, m] of Object.entries(moods)) {
    const d = s.drivers[id];
    if (!d || d.teamId !== s.teamId) continue;
    const pos = order.indexOf(id);
    const expected = Math.max(1, (standingsRank(s).indexOf(s.teamId) + 1) * 2 - 1);
    const good = pos >= 0 && !dnf.includes(id) && pos + 1 <= expected;
    d.morale = clamp(d.morale + (m.morale - d.morale) * 0.5 + (good ? 0.02 : dnf.includes(id) ? -0.03 : -0.005), 0, 1);
    d.trust = clamp(d.trust + (m.trust - d.trust) * 0.5, 0, 1);
    if ((m.strat ?? 0) > 0.05) {
      addCause(d, "strategy", clamp(m.strat ?? 0, 0, 0.6));
      ensureStatus(d).slights.push({ day: s.day, kind: "strategy", text: "a strategy call that went against him", weight: m.strat ?? 0 });
    }
    if (m.grievance > d.grievance + 0.1) d.grievance = round2(clamp(d.grievance + (m.grievance - d.grievance) * 0.15, 0, 1));
  }
}

function sprintMoney(s: CareerState, order: string[]) {
  void s;
  void order;
}

function finishRace(s: CareerState, ws: WeekendState, res: SessionResult, skipWorld = false, radio?: RadioQuote[], duels?: { a: string; b: string; passes: number; contacts: number }[]) {
  const race = s.calendar[ws.round];
  const { meta } = loadCircuit(race.circuitId);
  const winner = s.drivers[res.order[0]];
  const results: Record<string, TeamResult> = {};
  for (const id of Object.keys(s.teams)) results[id] = { positions: [], points: 0 };
  res.order.forEach((id, i) => {
    const d = s.drivers[id];
    if (!d?.teamId) return;
    const pos = res.dnf.includes(id) ? 99 : i + 1;
    results[d.teamId].positions.push(pos);
    results[d.teamId].points += res.points[id] ?? 0;
    if (skipWorld) return;
    d.starts += 1;
    if (pos === 1) d.wins += 1;
    if (pos <= 3) d.podiums += 1;
  });
  if (skipWorld) raceBonuses(s, results, ws.sprint);
  else raceMoney(s, results, ws.sprint);
  afterRace(s, res.order, res.dnf, skipWorld, duels);
  graduateWin(s, winner?.id);
  if (!skipWorld) playoffCheck(s, ws.round);
  const podium = res.order.slice(0, 3).map((id) => s.drivers[id]?.spec.name ?? id);
  const mine = driversOf(s, s.teamId).map((d) => res.order.indexOf(d.id) + 1).filter((x) => x > 0);
  if (!skipWorld) s.standings.races.push({
    round: ws.round + 1,
    circuitId: race.circuitId,
    gp: meta.gp,
    winner: winner?.spec.name ?? "?",
    winnerTeam: winner?.teamId ?? "?",
    podium,
    playerPos: mine,
    dnfs: res.dnf.length,
    sprintWinner: ws.results.sprint ? s.drivers[ws.results.sprint.order[0]]?.spec.name : undefined,
  });
  if (!skipWorld) socialAfterRace(s, res.order, res.grid, res.dnf, meta.gp, ws.round + 1, radio);
  if (!skipWorld) {
    ticker(s, `${winner?.spec.name ?? "?"} wins the ${meta.gp}.`, 3);
    news(s, `${meta.gp}: ${podium.join(", ")} on the podium.`);
  }
  // parts fitted for this race get their real result
  const t = s.teams[s.teamId];
  const reveals: string[] = [];
  for (const p of t.projects) {
    if (p.fittedRound === ws.round + 1 && p.status === "fitted") {
      if (p.tested === undefined) revealPart(s, s.teamId, p);
      const mid = (p.predLo + p.predHi) / 2;
      const verdict = p.trueGain < p.predLo ? "below" : p.trueGain > p.predHi ? "above" : "inside";
      reveals.push(`${p.name}: delivered ${lapDelta(p.trueGain)} s, ${verdict} the predicted ${fmtRange(p.predLo, p.predHi)}.`);
      const des = staffOf(s, s.teamId, "designer");
      if (des) {
        des.known = clamp(des.known + 0.05, 0, 1);
        des.mood = clamp(des.mood + (verdict === "below" ? -0.04 : 0.02), 0, 1);
      }
      void mid;
      onLanding(s, s.teamId, p);
    }
  }
  const pos = mine.length ? Math.min(...mine) : 0;
  const learnt = weekendLearn(s, s.teamId, ws.circuitId);
  trackCorrelates(s, s.teamId);
  pushCard(s, "debrief", `Debrief: ${meta.gp}`, `${winner?.spec.name ?? "?"} won. Your cars finished ${mine.length ? mine.map((p) => "P" + p).join(" and ") : "outside the classification"}.${reveals.length ? "\n\nParts report:\n" + reveals.join("\n") : ""}${learnt.length ? "\n\nWhat the weekend taught the engineers:\n" + learnt.join("\n") : ""}`, [{ id: "ok", label: "OK" }], { urgency: 2, deadline: s.day + 4 });
  recap(s, `${meta.gp} done. Best finish: ${pos ? "P" + pos : "none"}.`);
  if (!skipWorld) s.round += 1;
}

/** The first time a driver from the player's academy wins a Grand Prix is an event of its own. */
function graduateWin(s: CareerState, winnerId: string | undefined) {
  const a = s.academy;
  if (!winnerId || !a.graduates.includes(winnerId) || a.firstGradWin) return;
  const w = s.drivers[winnerId];
  const p = a.prospects[winnerId];
  a.firstGradWin = true;
  const years = p ? s.year - (p.log.length ? Number((p.log[p.log.length - 1].match(/\d{4}/) ?? [s.year])[0]) : s.year) : 0;
  void years;
  news(s, `${w.spec.name} wins a Grand Prix: the first winner to come out of your academy.`, { importance: 3, cause: "Years of academy work pay off", tag: "academy" });
  s.legacy.push({ year: s.year, text: `${w.spec.name}, your academy graduate, won a Grand Prix.` });
  pushCard(s, "event", "An academy driver wins", `${w.spec.name} has won a Grand Prix for you, and he came through your academy. The paddock is talking about it. Your academy's reputation rises.`, [{ id: "ok", label: "Savour it" }], { urgency: 3, deadline: s.day + 8 });
  a.devRep = Math.min(1, a.devRep + 0.15);
}

/** Playoff rule: after round twelve the top ten are compressed together and the rest are out of the title. */
function playoffCheck(s: CareerState, round: number) {
  if (!rulesOf(s).playoffCut || round + 1 !== 12) return;
  const ranked = Object.entries(s.standings.drivers).sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, 10);
  const floor = top[top.length - 1]?.[1] ?? 0;
  for (const [id, p] of top) s.standings.drivers[id] = Math.round(20 + (p - floor) * 0.4);
  for (const [id] of ranked.slice(10)) s.story.arcs[`out:${id}`] = 1;
  news(s, "PLAYOFF CUT: the top ten drivers' points are squeezed together. Everyone else is out of the title race.", { importance: 3, cause: "Playoff rule" });
  ticker(s, "Playoff cut made: ten drivers left in the title race.", 3);
}

/** From qualifying rows: tyre sets used and the tyre each car must start on under the lock rule. */
export function extrasFromRows(rows: { carId: string; bestTyre?: string | null; setsUsed?: Partial<Record<"S" | "M" | "H", number>> }[], humanIds: string[], sets?: Record<string, TyreSet[]>) {
  const locks: Record<string, "S" | "M" | "H"> = {};
  const used: Record<string, Partial<Record<"S" | "M" | "H", number>>> = {};
  for (const r of rows) {
    if (r.bestTyre === "S" || r.bestTyre === "M" || r.bestTyre === "H") locks[r.carId] = r.bestTyre;
    if (humanIds.includes(r.carId) && r.setsUsed) used[r.carId] = r.setsUsed;
  }
  return { locks, used, ...(sets ? { sets } : {}) };
}

// ---------------------------------------------------------------- headless sessions

export function runQuali(plan: SessionPlan): QualiRow[] {
  return runQualifying(plan.qualiCfg as QualiConfig).rows;
}

/** The same, with what it did to the human cars' tyre sets. */
export function runQualiWithSets(plan: SessionPlan): { rows: QualiRow[]; sets: Record<string, TyreSet[]> } {
  const r = runQualifying(plan.qualiCfg as QualiConfig);
  return { rows: r.rows, sets: r.sim.finalSets() };
}

export function runRace(plan: SessionPlan) {
  const sim = new RaceSim(plan.raceCfg as RaceConfig);
  let guard = 0;
  while (sim.phase !== "finished" && guard++ < 400) sim.run(2000);
  return sim;
}

export function simulateSession(s: CareerState, kind: SessionKind, humanIdsAsAi = true) {
  fitAllDead(s);
  const plan = planSession(s, kind, humanIdsAsAi);
  if (kind === "sq" || kind === "quali") {
    const { rows, sets } = runQualiWithSets(plan);
    const grid = rows.map((r) => r.carId);
    recordSession(s, kind, grid, {}, grid, [], undefined, extrasFromRows(rows, plan.humanIds, sets));
    return;
  }
  const sim = runRace(plan);
  const rows = sim.results();
  const order = rows.map((r) => r.carId);
  const points: Record<string, number> = {};
  for (const r of rows) points[r.carId] = r.points;
  recordSession(s, kind, order, points, undefined, rows.filter((r) => r.dnf).map((r) => r.carId), undefined, { failed: failuresOf(rows, plan.humanIds), ...raceExtras(sim, driversOf(s, s.teamId).map((d) => d.id)) });
}

/** Which units blew, from the result rows. */
export function failuresOf(rows: { carId: string; dnf: boolean; dnfReason: string }[], humanIds: string[]): Record<string, "pu" | "gb"> {
  const out: Record<string, "pu" | "gb"> = {};
  for (const r of rows) {
    if (!r.dnf || !humanIds.includes(r.carId)) continue;
    if (r.dnfReason === "Power unit failure") out[r.carId] = "pu";
    else if (r.dnfReason === "Gearbox failure") out[r.carId] = "gb";
  }
  return out;
}

/**
 * The race engineers run practice themselves (delegation "do" or "hands"): a few setup runs, then the other programmes, shared between both
 * drivers, and the setup is set to their best guess. With "hands" practice is closed too and the weekend moves straight to qualifying.
 */
export function autoPractice(s: CareerState, finish: boolean) {
  const ws = s.weekend;
  if (!ws || ws.stage !== "practice") return;
  const ids = driversOf(s, s.teamId).map((d) => d.id);
  if (!ids.length) return;
  const order: Programme[] = ["setup", "setup", "setup", "qualiSim", "raceSim", "tyres"];
  let guard = 0;
  let i = 0;
  while (ws.stage === "practice" && (ws.sessionsLeft > 0 || ws.runsLeft > 0) && guard++ < 80) {
    if (Object.keys(ws.dead ?? {}).length) {
      if (finish) fitAllDead(s); // hands off: the team fits the new unit and carries on
      else break; // otherwise a failed unit needs the player
    }
    const prog = i < order.length ? order[i] : order[3 + ((i - 3) % 3)];
    const before = ws.runsLeft + ws.sessionsLeft * 100;
    practiceRun(s, prog, { ...ws.hint }, ids[i % ids.length]);
    if (ws.runsLeft + ws.sessionsLeft * 100 === before && prog === "setup") {
      i = Math.max(i, 3); // setup is locked by the rules: use the runs on something else
      continue;
    }
    i++;
  }
  ws.setup = { ...ws.hint };
  ws.notes.unshift("Your race engineers ran practice and saved their best setup.");
  if (finish) endPractice(s);
}

/**
 * The head of R&D decides what goes on the car (delegation "do" or "hands"): every finished part is bench tested, parts that would not make
 * the car faster are scrapped, and the rest are fitted, including ones you were holding back. Returns the lines for the recap.
 */
export function delegatedParts(s: CareerState): string[] {
  const t = s.teams[s.teamId];
  const lines: string[] = [];
  const eng = engineerSkill(s) / 100;
  const rng = new Rng(hashSeed(`parts:${s.seed}:${s.year}:${s.round}`));
  for (const p of t.projects) {
    if (p.status !== "ready") continue;
    if (p.tested === undefined) p.tested = round2(p.trueGain + rng.gauss() * (1 - eng) * 0.04);
    p.hold = false;
    if (p.tested <= 0.004) {
      p.status = "scrapped";
      lines.push(`${p.name} tested no faster, so it was scrapped instead of fitted.`);
    }
  }
  return lines;
}

/** Auto-set the player's setup from what the engineers learned: their best guess, which beats a neutral car when they have run. */
export function autoSetup(ws: WeekendState) {
  ws.setup = { ...ws.hint };
}

/** Skip the weekend: the team AI runs the player's cars and everything is simulated. */
export function simulateWeekend(s: CareerState) {
  if (!s.weekend) s.weekend = startWeekend(s);
  const ws = s.weekend;
  if (ws.stage === "practice") {
    autoSetup(ws);
    endPractice(s);
  }
  let guard = 0;
  while (ws.stage !== "done" && guard++ < 6) {
    if (ws.stage === "sq") simulateSession(s, "sq");
    else if (ws.stage === "sprint") simulateSession(s, "sprint");
    else if (ws.stage === "quali") simulateSession(s, "quali");
    else if (ws.stage === "race") simulateSession(s, "race");
  }
}

/** Tutorial skip: run the weekend forward to a point (out of practice, to the race, or to the end) and no further. */
export function simulateTo(s: CareerState, until: "quali" | "race" | "done") {
  if (!s.weekend) return;
  const ws = s.weekend;
  if (ws.stage === "practice") {
    autoSetup(ws);
    endPractice(s);
  }
  let guard = 0;
  while (ws.stage !== "done" && guard++ < 6) {
    if (until === "quali") break;
    if (until === "race" && ws.stage === "race") break;
    simulateSession(s, ws.stage as SessionKind);
  }
}

export { activeDrivers };

/** The race-format rules in force, in plain words, for the briefing. */
export function rulesBrief(r: RaceConfig["rules"] | undefined, laps: number): string[] {
  const out: string[] = [];
  if (!r) return out;
  if (r.pushToPass) out.push(`Push to pass: ${r.pushToPass} boost tokens per driver, 12 seconds each.`);
  if (r.defenceTokens) out.push(`Defence tokens: ${r.defenceTokens} hard defences per driver, 15 seconds each.`);
  if (r.batterySwap) out.push("Battery swap: tick it on the stop call for 1.8 extra seconds in the box and a full charge.");
  if (r.refuelling) out.push("Refuelling: cars start light and add fuel at stops, at about 4.5 percent a second. Do not run dry.");
  if (r.stopWindow) out.push(`Stop window: laps ${r.stopWindow[0]} to ${r.stopWindow[1]}. A stop outside it costs 5 seconds.`);
  if (r.checkpointCuts) out.push("Checkpoints at one third and two thirds: the last three cars take 5 seconds.");
  if (r.stageRacing) out.push("Stage racing: the top five score 5 to 1 at one third and two thirds distance, on top of the finish.");
  if (r.twoHeat) out.push("Two heats: the race is red-flagged at half distance. Free tyres, standing restart, gaps wiped.");
  if (r.standingRestarts) out.push("Every safety car ends with a standing-style restart. Start skill and warm tyres decide it.");
  if (r.openRadio) out.push("Open radio: rivals hear your pit calls and you hear theirs.");
  if (r.radioQuota !== undefined) out.push(`Radio quota: ${r.radioQuota} messages per car. After that your driver makes his own calls.`);
  if (r.tyrePool) out.push("Tyre pool: both cars share one set of tyres for the weekend.");
  void laps;
  return out;
}

export interface PartVerdict {
  tone: "good" | "ok" | "weak" | "bad";
  word: string;
  advice: string;
}
/** What a bench test says, in plain words. Gains are positive when the car gets faster. */
export function partVerdict(p: { tested?: number; predLo: number; predHi: number }): PartVerdict | null {
  if (p.tested === undefined) return null;
  const x = p.tested;
  if (x <= 0) return { tone: "bad", word: "NO GAIN", advice: "On the bench it does not make the car faster. Scrap it, or you spend a race finding out the hard way." };
  if (x < p.predLo - 0.02) return { tone: "weak", word: "BELOW THE GUESS", advice: "It is faster than your current part but the staff overpromised. Fit it only if you need every tenth." };
  if (x > p.predHi + 0.02) return { tone: "good", word: "BETTER THAN HOPED", advice: "Fit it. The staff were too cautious." };
  return { tone: "ok", word: "ON TARGET", advice: "It is doing what the staff said. Fit it." };
}
