import { boardMove } from "./board";
import { hashSeed, Rng } from "../sim/rng";
import { fillTier, generateDriver, realPeople, type Person, type Tier } from "../game/people";
import { baseTeam, staffOf } from "./car";
import { news, pushCard, sendMail, ticker } from "./cards";
import { logSpend } from "./log";
import { clamp, fmtMoney, isHuman, rngFor, round2 } from "./util";
import { teamRanking } from "./car";
import type { CareerState, DriverState, JuniorState } from "./types";
import { signDriver } from "./contracts";
import { budgetBlock, driversOf } from "./finance";

/**
 * Young drivers and the academy. Every prospect has hidden attributes and a hidden ceiling. The player only ever sees
 * scouts' ranges, which narrow with more races watched and a trial day. Outcomes come from circumstances, not dice:
 * about 1 in 40 prospects (independently) is a generational talent, and an ordinary prospect with ideal circumstances can still reach the top.
 * All numbers are the game's own design.
 */

export type Series = "kart" | "f4" | "f3" | "f2";
export const SERIES: Series[] = ["kart", "f4", "f3", "f2"];
export const SERIES_LABEL: Record<Series, string> = { kart: "Karting", f4: "Formula 4", f3: "Formula 3", f2: "Formula 2" };
export const SERIES_COST: Record<Series, number> = { kart: 0.3, f4: 0.7, f3: 1.6, f2: 3.2 };
const SERIES_SEATS: Record<Series, number> = { kart: 28, f4: 40, f3: 30, f2: 22 };
const SERIES_BAND: Record<Series, [number, number]> = { kart: [0, 0.3], f4: [0.2, 0.5], f3: [0.38, 0.68], f2: [0.52, 0.92] };
const SERIES_MIN_AGE: Record<Series, number> = { kart: 0, f4: 15, f3: 16, f2: 18 };

export const ATTRS = ["pace", "quali", "racecraft", "tyreFeel", "wet", "consistency", "feedback", "adaptability", "pressure", "temperament", "ambition", "work", "loyalty"] as const;
export type AttrKey = (typeof ATTRS)[number];
export const ATTR_LABEL: Record<AttrKey, string> = {
  pace: "Pace", quali: "Qualifying", racecraft: "Racecraft", tyreFeel: "Tyre feel", wet: "Wet weather", consistency: "Consistency",
  feedback: "Feedback", adaptability: "Adaptability", pressure: "Pressure handling", temperament: "Temperament", ambition: "Ambition", work: "Work ethic", loyalty: "Loyalty",
};
export const ATTR_GROUP: Record<AttrKey, string> = {
  pace: "Driving", quali: "Driving", racecraft: "Driving", tyreFeel: "Driving", wet: "Driving", consistency: "Driving",
  feedback: "Technical", adaptability: "Technical", pressure: "Mind", temperament: "Mind", ambition: "Mind", work: "Mind", loyalty: "Mind",
};
const LEVEL_W: Partial<Record<AttrKey, number>> = { pace: 0.3, quali: 0.12, racecraft: 0.18, tyreFeel: 0.1, wet: 0.06, consistency: 0.14, feedback: 0.05, adaptability: 0.05 };

export type Focus = "pace" | "racecraft" | "consistency" | "wet" | "mental";
export const FOCUS_LABEL: Record<Focus, string> = { pace: "Pace", racecraft: "Racecraft", consistency: "Consistency", wet: "Wet weather", mental: "Mental strength" };
export type Bloom = "early" | "steady" | "late";

export interface Prospect {
  id: string;
  name: string;
  code: string;
  nat: string;
  born: number;
  series: Series;
  attrs: Record<AttrKey, number>;
  caps: Record<AttrKey, number>;
  /** Smooth to aggressive, 0..1. */
  style: number;
  generational: boolean;
  bloom: Bloom;
  confidence: number;
  fatigue: number;
  status: "free" | "academy" | "rival" | "f1pool" | "f1" | "gone";
  owner: string | null;
  deal?: { endYear: number; retainer: number; buyout: number; firstRefusal: boolean };
  /** What the player's scouts have learned. */
  seen: number;
  quality: number;
  trial: number;
  training: Focus[];
  mentor: string | null;
  /** Super licence points, newest year last. */
  licence: number[];
  /** This season in the series. */
  pts: number;
  wins: number;
  rank: number;
  titles: number;
  ride: number;
  fictional: boolean;
  /** Short history lines for the prospect page. */
  log: string[];
  /** Set when he was handled badly or well, for the story. */
  setback: number;
  /** Season by season record, newest last. */
  path?: { year: number; series: Series; rank: number; pts: number; wins: number }[];
}

export interface JuniorResult {
  year: number;
  month: number;
  series: Series;
  name: string;
  round: number;
  of: number;
  top: { id: string; name: string; pts: number }[];
}

export interface JuniorEvent {
  month: number;
  name: string;
}
/** The junior calendar. Karting has championships; the single-seater series run one round a month through the season. */
export const JUNIOR_CAL: Record<Series, JuniorEvent[]> = {
  kart: [
    { month: 2, name: "Winter Cup" },
    { month: 4, name: "Regional Championship" },
    { month: 6, name: "National Final" },
    { month: 8, name: "European Championship" },
    { month: 10, name: "World Final" },
  ],
  f4: ["Misano", "Monza", "Le Castellet", "Zandvoort", "Spa", "Hockenheim", "Barcelona", "Mugello"].map((name, i) => ({ month: 3 + i, name })),
  f3: ["Sakhir", "Barcelona", "Spielberg", "Silverstone", "Budapest", "Spa", "Monza", "Imola"].map((name, i) => ({ month: 3 + i, name })),
  f2: ["Jeddah", "Imola", "Monaco", "Barcelona", "Spielberg", "Silverstone", "Budapest", "Monza"].map((name, i) => ({ month: 3 + i, name })),
};
export const eventIn = (series: Series, month: number): JuniorEvent | undefined => JUNIOR_CAL[series].find((e) => e.month === month);
export const nextEvent = (series: Series, month: number): JuniorEvent | undefined => JUNIOR_CAL[series].find((e) => e.month >= month);
export const roundNo = (series: Series, month: number) => JUNIOR_CAL[series].findIndex((e) => e.month === month) + 1;

export interface SeriesTable {
  year: number;
  round: number;
}

export interface AcademyState {
  prospects: Record<string, Prospect>;
  scouts: Record<string, Series>;
  shortlist: string[];
  tables: Record<Series, SeriesTable>;
  trialDays: number;
  decisions: string[];
  rookieNominee: string | null;
  graduates: string[];
  firstGradWin: boolean;
  devRep: number;
  champions: { year: number; series: Series; id: string; name: string }[];
  /** Recent junior results, newest last. */
  results?: JuniorResult[];
}

const ageOfP = (s: CareerState, p: Prospect) => s.year - p.born;
export const levelOf = (p: Prospect): number => {
  let t = 0;
  let w = 0;
  for (const [k, v] of Object.entries(LEVEL_W) as [AttrKey, number][]) {
    t += p.attrs[k] * v;
    w += v;
  }
  return t / w;
};
const ceilingOf = (p: Prospect): number => {
  let t = 0;
  let w = 0;
  for (const [k, v] of Object.entries(LEVEL_W) as [AttrKey, number][]) {
    t += p.caps[k] * v;
    w += v;
  }
  return t / w;
};
export const stars = (p: Prospect) => 1 + 4 * clamp((ceilingOf(p) - 0.5) / 0.45, 0, 1);
export const f1Pace = (level: number) => round2(clamp(0.955 + 0.045 * level, 0.93, 1.002) * 1000) / 1000;

export function newAcademy(): AcademyState {
  return {
    prospects: {},
    scouts: {},
    shortlist: [],
    tables: { kart: { year: 0, round: 0 }, f4: { year: 0, round: 0 }, f3: { year: 0, round: 0 }, f2: { year: 0, round: 0 } },
    trialDays: 4,
    decisions: [],
    rookieNominee: null,
    graduates: [],
    firstGradWin: false,
    devRep: 0,
    champions: [],
  };
}

// ---------------------------------------------------------------- making prospects

function bloomOf(rng: Rng): Bloom {
  const r = rng.next();
  return r < 0.3 ? "early" : r < 0.75 ? "steady" : "late";
}

function makeProspect(s: CareerState, rng: Rng, per: Person | null, series: Series, id: string, name: string, code: string, nat: string, born: number, fictional: boolean): Prospect {
  const generational = rng.next() < 1 / 40;
  const potential = per ? per.potential : rng.next();
  let ceil = generational ? 0.93 + rng.next() * 0.07 : clamp(0.38 + 0.5 * Math.pow(potential, 1.1) + (rng.next() - 0.5) * 0.12, 0.42, 0.9);
  if (!generational && !per) ceil = 0.46 + 0.42 * Math.pow(rng.next(), 1.35);
  const bloom = bloomOf(rng);
  const age = s.year - born;
  const frac = clamp(0.5 + (age - 13) * 0.075 - (bloom === "late" ? 0.1 : bloom === "early" ? -0.06 : 0), 0.4, 0.95);
  const caps = {} as Record<AttrKey, number>;
  const attrs = {} as Record<AttrKey, number>;
  for (const k of ATTRS) {
    const spread = ["pressure", "temperament", "ambition", "work", "loyalty"].includes(k) ? 0.22 : 0.06;
    caps[k] = round2(clamp(ceil + (rng.next() - 0.5) * 2 * spread, 0.15, 1));
    attrs[k] = round2(clamp(caps[k] * frac + (rng.next() - 0.5) * 0.06, 0.05, 1));
  }
  if (per) {
    // a real entry is placed where his series pace says he is
    const lv = clamp((per.pace - 0.94) / 0.06, 0.1, 0.95);
    for (const k of ATTRS) attrs[k] = round2(clamp(attrs[k] * 0.4 + lv * 0.6 + (rng.next() - 0.5) * 0.05, 0.05, caps[k]));
  }
  return {
    id, name, code, nat, born, series, attrs, caps, style: round2(per ? clamp(per.aggression, 0, 1) : rng.next()), generational, bloom,
    confidence: 0.55, fatigue: 0.1, status: "free", owner: null, seen: 0, quality: 0, trial: 0, training: [], mentor: null,
    licence: [], pts: 0, wins: 0, rank: 0, titles: 0, ride: round2(0.25 + rng.next() * 0.6), fictional, log: [], setback: 0,
  };
}

function fromTier(s: CareerState, rng: Rng, tier: Tier, series: Series, n: number): Prospect[] {
  const out: Prospect[] = [];
  const people = fillTier(tier, n, s.seed % 97 + 1);
  const ages: Record<Series, [number, number]> = { kart: [13, 15], f4: [15, 17], f3: [17, 19], f2: [18, 22] };
  for (const per of people) {
    const [a, b] = ages[series];
    const age = per.born ? s.year - per.born : Math.round(a + rng.next() * (b - a));
    const born = per.born && age >= a - 1 && age <= b + 2 ? per.born : s.year - age;
    const p = makeProspect(s, rng, per, series, `jp-${per.id}`, per.name, per.code, per.nat, born, per.fictional);
    out.push(p);
  }
  return out;
}

/** Builds the junior world for a new career and gives every team a scout. */
export function initAcademy(s: CareerState) {
  const a = s.academy;
  const rng = new Rng(hashSeed(`academy:${s.seed}`));
  const all = [...fromTier(s, rng, "F2", "f2", SERIES_SEATS.f2), ...fromTier(s, rng, "F3", "f3", SERIES_SEATS.f3), ...fromTier(s, rng, "F4", "f4", 34)];
  const real = realPeople();
  const taken = new Set([...real.names, ...Object.values(s.drivers).map((d) => d.spec.name), ...all.map((p) => p.name)]);
  const codes = new Set([...Object.values(s.drivers).map((d) => d.spec.code), ...all.map((p) => p.code)]);
  for (const t of Object.values(real.byTier)) for (const x of t) codes.add(x.code);
  for (let i = 0; i < 24; i++) {
    const g = generateDriver(rng, "F4", taken, codes, `kart-${i}`);
    all.push(makeProspect(s, rng, null, "kart", `jp-kart-0-${i}`, g.name, g.code, g.nat, s.year - (13 + Math.floor(rng.next() * 2)), true));
  }
  for (const p of all) {
    a.prospects[p.id] = p;
    a.tables[p.series] = { year: s.year, round: 0 };
  }
  // the F1 pool is the best of F2 and F3 who could step up
  s.pool = Object.values(a.prospects)
    .filter((p) => p.series === "f2" || p.series === "f3")
    .map((p) => toJunior(s, p));
  // each team starts with a scout; the player's covers Formula 2
  for (const id of Object.keys(s.teams)) {
    const st = Object.values(s.staff).find((x) => x.teamId === id && x.role === "scout");
    if (st && id === s.teamId) a.scouts[st.id] = "f2";
  }
  // a head start: the first shortlist
  const first = Object.values(a.prospects).filter((p) => p.series === "f2").sort((x, y) => levelOf(y) - levelOf(x)).slice(0, 10);
  for (const p of first) {
    p.seen = 3;
    p.quality = 0.5;
  }
  a.shortlist = first.map((p) => p.id);
  for (const p of first) {
    p.seen = 2;
    p.quality = 0.5;
  }
}

function toJunior(s: CareerState, p: Prospect): JuniorState {
  return {
    id: p.id,
    name: p.name,
    code: p.code,
    nat: p.nat,
    born: p.born,
    pace: f1Pace(levelOf(p)),
    potential: clamp((ceilingOf(p) - 0.4) / 0.55, 0.3, 1),
    tyreMgmt: clamp(0.4 + p.attrs.tyreFeel * 0.55, 0.3, 0.95),
    aggression: p.style,
    consistency: clamp(0.4 + p.attrs.consistency * 0.5, 0.4, 0.93),
    fictional: p.fictional,
    owner: p.status === "academy" || p.status === "rival" ? (p.owner ?? undefined) : undefined,
  } as JuniorState;
  void s;
}

/** January: about 40 notable new prospects, so the cohort always has some names worth watching. */
export function newCohort(s: CareerState) {
  const a = s.academy;
  const rng = new Rng(hashSeed(`cohort:${s.seed}:${s.year}`));
  const real = realPeople();
  const taken = new Set([...real.names, ...Object.values(s.drivers).map((d) => d.spec.name), ...Object.values(a.prospects).map((p) => p.name)]);
  const codes = new Set([...Object.values(s.drivers).map((d) => d.spec.code), ...Object.values(a.prospects).map((p) => p.code)]);
  for (const t of Object.values(real.byTier)) for (const x of t) codes.add(x.code);
  const made: Prospect[] = [];
  for (let i = 0; i < 40; i++) {
    const g = generateDriver(rng, "F4", taken, codes, `x`);
    const series: Series = i < 26 ? "kart" : "f4";
    const age = series === "kart" ? 13 + Math.floor(rng.next() * 2) : 15 + Math.floor(rng.next() * 2);
    const p = makeProspect(s, rng, null, series, `jp-${s.year}-${i}`, g.name, g.code, g.nat, s.year - age, true);
    a.prospects[p.id] = p;
    made.push(p);
  }
  a.trialDays = 4 + (s.teams[s.teamId].facilities.academy - 1);
  const gen = made.filter((p) => p.generational).length;
  if (gen > 0) news(s, `This year's junior crop looks special: scouts whisper about ${gen === 1 ? "one prospect" : gen + " prospects"} with a very high ceiling.`, { importance: 1, cause: "Cohort of new prospects", tag: "academy" });
  void ticker;
}

// ---------------------------------------------------------------- what the player can know

export interface Range {
  lo: number;
  hi: number;
}
export interface Report {
  confidence: number;
  attrs: Record<AttrKey, Range>;
  stars: Range;
  level: Range;
  styleNote: string;
  bloomNote: string;
  /** The scout who watches his series, or null when nobody does. */
  scout: { name: string; skill: number } | null;
}

export function confidenceOf(p: Prospect): number {
  const c = 1 - Math.exp(-(p.seen * (0.4 + p.quality)) / 5);
  return clamp(c * 0.9 + p.trial * 0.5, 0, 0.97);
}

function hashNoise(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  const u = ((h >>> 0) % 10000) / 10000;
  return (u - 0.5) * 2; // -1..1
}

/** Only the scout assigned to his series reads him. A series with nobody watching it gets rumour, not a report. */
export function scoutFor(s: CareerState, p: Prospect) {
  const scouts = Object.values(s.staff).filter((x) => x.teamId === s.teamId && x.role === "scout");
  return scouts.find((x) => (s.academy.scouts[x.id] ?? "f4") === p.series);
}

export function reportOf(s: CareerState, p: Prospect): Report {
  const conf = confidenceOf(p);
  const sc = scoutFor(s, p);
  const biasWet = sc?.traits.includes("overrates wet pace") ? 0.12 : 0;
  const biasLate = sc?.traits.includes("underrates late bloomers") && p.bloom === "late" ? -0.08 : 0;
  const attrs = {} as Record<AttrKey, Range>;
  const quality = clamp((sc?.skill ?? 30) / 100, 0.2, 1);
  for (const k of ATTRS) {
    const err = hashNoise(`${p.id}:${k}:${p.trial > 0 ? "t" : "s"}`) * (1 - conf) * (0.42 - 0.2 * quality);
    const est = p.attrs[k] + err + (k === "wet" ? biasWet : 0) + (k === "pace" ? biasLate : 0);
    const hw = (1 - conf) * 0.28 + 0.02;
    attrs[k] = { lo: clamp(est - hw, 0, 1), hi: clamp(est + hw, 0, 1) };
  }
  const sw = 2.0 * (1 - conf) + 0.25;
  const estStars = stars(p) + hashNoise(`${p.id}:stars`) * (1 - conf) * 1.6 + biasLate * 6;
  const lvl = levelOf(p) + hashNoise(`${p.id}:lvl`) * (1 - conf) * 0.1;
  const lw = (1 - conf) * 0.2 + 0.03;
  return {
    confidence: conf,
    attrs,
    stars: { lo: clamp(Math.round((estStars - sw) * 2) / 2, 1, 5), hi: clamp(Math.round((estStars + sw) * 2) / 2, 1, 5) },
    level: { lo: clamp(lvl - lw, 0, 1), hi: clamp(lvl + lw, 0, 1) },
    styleNote: conf < 0.25 ? "Style not clear yet" : p.style > 0.62 ? "Aggressive, attacks the car" : p.style < 0.38 ? "Smooth, kind to the car" : "Neutral style",
    scout: sc ? { name: sc.name, skill: sc.skill } : null,
    bloomNote: conf < 0.6 ? "Growth shape unclear" : p.bloom === "early" ? "Looks like an early bloomer" : p.bloom === "late" ? "Looks like a late bloomer" : "Looks like a steady grower",
  };
}

export interface FitLine {
  key: "car" | "era" | "culture" | "lineup" | "money";
  label: string;
  mark: "good" | "ok" | "bad";
  text: string;
}

/** The fit panel: how he suits your team, from the scout's noisy numbers. */
export function fitOf(s: CareerState, p: Prospect): { lines: FitLine[]; tip: string } {
  const rep = reportOf(s, p);
  const mid = (k: AttrKey) => (rep.attrs[k].lo + rep.attrs[k].hi) / 2;
  const t = s.teams[s.teamId];
  const lines: FitLine[] = [];
  // car: a forgiving car (strong tyres and chassis) suits an aggressive style, a pointy one suits a smooth style
  const stable = t.believed.tyres + t.believed.chassis - (t.believed.aero + t.believed.power) * 0.5;
  const aggr = p.style;
  const mism = Math.abs((stable > 0 ? 0.65 : 0.35) - aggr);
  lines.push({ key: "car", label: "Car", mark: mism < 0.22 ? "good" : mism < 0.4 ? "ok" : "bad", text: stable > 0 ? `Your car is forgiving. ${aggr > 0.55 ? "That suits an attacking driver." : "A smooth driver gets less from it."}` : `Your car is pointy. ${aggr < 0.45 ? "A smooth driver can tame it." : "An aggressive driver may bin it."}` });
  // era
  const ad = mid("adaptability");
  const next = s.era.next;
  const soon = next && next.startYear - s.year <= 4;
  lines.push({ key: "era", label: "Era", mark: !soon ? "ok" : ad > 0.6 ? "good" : ad > 0.4 ? "ok" : "bad", text: !soon ? "No big rule change is close, so adaptability is not urgent." : ad > 0.6 ? `He should adapt well to the ${next!.startYear} rules.` : ad > 0.4 ? `Adaptability looks average for the ${next!.startYear} rules.` : `He may struggle with the ${next!.startYear} rules.` });
  // culture: the board's pressure against his temperament
  const pressure = clamp(0.35 + (t.objectives[0] && t.objectives[0].target <= 3 ? 0.3 : 0) + (60 - t.board) / 100, 0.1, 1);
  const hold = (mid("pressure") + mid("temperament")) / 2;
  lines.push({ key: "culture", label: "Culture", mark: hold >= pressure ? "good" : hold >= pressure - 0.15 ? "ok" : "bad", text: hold >= pressure ? "He handles pressure at least as well as your team demands." : "Your team's pressure may be more than he can take yet." });
  // lineup: when does a seat open and when is he ready
  const age = ageOfP(s, p);
  const readyIn = Math.max(0, 18 - age, Math.ceil((0.5 - (rep.level.lo + rep.level.hi) / 2) / 0.07));
  const open = Math.min(...driversOf(s, s.teamId).map((d) => d.endYear - s.year));
  const gap = Math.abs(readyIn - Math.max(0, open));
  lines.push({ key: "lineup", label: "Lineup", mark: gap <= 1 ? "good" : gap <= 2 ? "ok" : "bad", text: `A seat opens in about ${Math.max(0, open)} season${open === 1 ? "" : "s"}, he could be ready in about ${readyIn}.` });
  // money
  const cost = SERIES_COST[p.series] + 0.8;
  const budget = s.budgets.academy;
  const spent = t.ledger.academy ?? 0;
  const room = budget - spent;
  lines.push({ key: "money", label: "Money", mark: room >= cost * 1.5 ? "good" : room >= cost ? "ok" : "bad", text: `About ${fmtMoney(cost)} a year to run him. Academy budget left: ${fmtMoney(Math.max(0, room))}.` });
  const worst = lines.find((l) => l.mark === "bad") ?? lines.find((l) => l.mark === "ok");
  const tips: Record<FitLine["key"], string> = {
    car: "Fit improves if your car's character moves toward his style, or if you hire a driver coach.",
    era: "Fit improves if you pair him with a veteran who adapts well, or wait until the rules are clearer.",
    culture: "Fit improves with a driver coach and a calmer season, or by letting him race longer in a junior series first.",
    lineup: "Fit improves if you shorten a contract, or loan him out for a year.",
    money: "Fit improves if you raise the academy budget in the Money screen.",
  };
  return { lines, tip: worst ? tips[worst.key] : "Nothing stands in the way. The scout's numbers may still be wrong." };
}

export const visible = (s: CareerState): Prospect[] => {
  const a = s.academy;
  const ids = new Set([...a.shortlist, ...Object.values(a.prospects).filter((p) => p.status === "academy" && p.owner === s.teamId).map((p) => p.id)]);
  return [...ids].map((id) => a.prospects[id]).filter((p) => p && p.status !== "gone" && p.status !== "f1");
};

// ---------------------------------------------------------------- the monthly tick

const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

function perfOf(p: Prospect, rng: Rng): number {
  return levelOf(p) + (p.ride - 0.5) * 0.18 + (p.confidence - 0.5) * 0.1 + rng.gauss() * (0.04 + 0.08 * (1 - p.attrs.consistency));
}

/** The prospects of a series in the order of the table right now. */
const tableOf = (s: CareerState, series: Series): Prospect[] =>
  Object.values(s.academy.prospects).filter((p) => p.series === series && p.status !== "gone" && p.status !== "f1").sort((x, y) => y.pts - x.pts || y.wins - x.wins);

/**
 * Scouts follow one series. In its season they go to the round: they watch the front of the field and your shortlist,
 * and pick up new names from who really was fast. Out of season they only go through tapes.
 */
function scoutMonth(s: CareerState, month: number) {
  const a = s.academy;
  const rng = rngFor(s, "scoutmonth");
  for (const st of Object.values(s.staff)) {
    if (st.teamId !== s.teamId || st.role !== "scout") continue;
    const series = a.scouts[st.id] ?? "f4";
    const ev = eventIn(series, month);
    const table = tableOf(s, series);
    const fresh: Prospect[] = [];
    const known = (p: Prospect) => a.shortlist.includes(p.id) || (p.status === "academy" && p.owner === s.teamId);
    if (ev) {
      const front = table.slice(0, 8);
      const finds = 1 + (st.skill > 70 ? 1 : 0) + (rng.next() < 0.3 ? 1 : 0);
      const pool = front.filter((p) => !known(p));
      for (let i = 0; i < finds && pool.length; i++) {
        const k = Math.min(pool.length - 1, Math.floor(Math.pow(rng.next(), 1.6) * pool.length));
        fresh.push(pool[k]);
        pool.splice(k, 1);
      }
      // an eye for the back of the field: a hidden gem, now and then
      const back = table.slice(8).filter((p) => !known(p));
      if (back.length && rng.next() < 0.12 + st.skill / 600) fresh.push(back[Math.floor(rng.next() * back.length)]);
      for (const p of fresh) a.shortlist.push(p.id);
      for (const p of table) {
        if (known(p) || front.includes(p)) {
          p.seen += 1;
          p.quality = Math.max(p.quality, st.skill / 100);
        }
      }
      // the report
      const last = (a.results ?? []).filter((r) => r.series === series && r.year === s.year && r.month === month).pop();
      const win = last?.top[0] ? a.prospects[last.top[0].id] : table[0];
      const mine = table.filter((p) => p.status === "academy" && p.owner === s.teamId && a.shortlist.includes(p.id) && front.includes(p));
      if (win && (fresh.length > 0 || series === "kart" || mine.length > 0)) {
        const r = reportOf(s, win);
        const bits = [`${st.name} was at ${ev.name} (${SERIES_LABEL[series]}).`, `${win.name} won it. We read him at ${r.stars.lo === r.stars.hi ? r.stars.lo : r.stars.lo + " to " + r.stars.hi} stars.`];
        if (fresh.length) bits.push(`New on the list: ${fresh.map((p) => `${p.name} (${p.nat}, ${s.year - p.born})`).join(", ")}.`);
        if (mine.length) bits.push(`Your driver${mine.length > 1 ? "s" : ""} ${mine.map((p) => p.name).join(", ")} ${mine.length > 1 ? "were" : "was"} in the front group.`);
        sendMail(s, {
          from: st.name,
          role: "Scout",
          subject: `Scout report: ${ev.name}`,
          body: bits.join(" "),
          options: [...(fresh.length && a.trialDays > 0 ? [{ id: `trial:${fresh[0].id}`, label: `Book a trial day for ${fresh[0].name}`, detail: "$0.25m, a day in the car tells you a lot" }] : []), { id: "ok", label: "Noted" }],
          days: 20,
          data: { m: "scout" },
        });
      }
    } else {
      // tape review out of season: the odd name, a little knowledge of the ones we already follow
      if (rng.next() < 0.35) {
        const pool = table.filter((p) => !known(p));
        if (pool.length) a.shortlist.push(pool[Math.floor(rng.next() * pool.length)].id);
      }
      for (const p of table) if (known(p)) p.seen += 0.25;
    }
  }
  if (a.shortlist.length > 60) a.shortlist = a.shortlist.filter((id) => a.prospects[id]?.status === "academy" || a.prospects[id]?.status === "free").slice(-60);
}

/** The month's round of every series that races. Low detail, but each round is a real result with a winner. */
function juniorRound(s: CareerState, month: number) {
  const a = s.academy;
  const rng = rngFor(s, `jr:${s.day}`);
  a.results ??= [];
  for (const series of SERIES) {
    const ev = eventIn(series, month);
    if (!ev) continue;
    const rounds = JUNIOR_CAL[series].length;
    const round = roundNo(series, month);
    const field = Object.values(a.prospects).filter((p) => p.series === series && p.status !== "gone" && p.status !== "f1");
    const scored = field.map((p) => ({ p, v: perfOf(p, rng) })).sort((x, y) => y.v - x.v);
    scored.forEach((e, i) => {
      e.p.pts += POINTS[i] ?? 0;
      if (i === 0) e.p.wins += 1;
    });
    a.tables[series].round = round;
    a.results.push({ year: s.year, month, series, name: ev.name, round, of: rounds, top: scored.slice(0, 3).map((e, i) => ({ id: e.p.id, name: e.p.name, pts: POINTS[i] ?? 0 })) });
    if (a.results.length > 60) a.results.splice(0, a.results.length - 60);
    const w = scored[0]?.p;
    if (!w) continue;
    const mine = w.status === "academy" && w.owner === s.teamId;
    const followed = a.shortlist.includes(w.id);
    const label = series === "kart" ? ev.name : `the ${ev.name} round of ${SERIES_LABEL[series]}`;
    if (mine || followed) news(s, `${w.name} wins ${label}${series === "kart" ? "" : ` (round ${round} of ${rounds})`}.${mine ? " An academy driver of yours." : ""}`, { importance: mine ? 2 : 1, cause: `Result in ${SERIES_LABEL[series]}`, tag: "junior" });
    else if (series === "kart") news(s, `${w.name} takes the ${ev.name} in karting.`, { importance: 1, cause: "Karting championship", tag: "junior" });
    const table = tableOf(s, series);
    if (round === Math.ceil(rounds / 2) && table.length > 1 && series !== "kart") {
      news(s, `${SERIES_LABEL[series]} at the halfway mark: ${table[0].name} leads ${table[1].name} by ${table[0].pts - table[1].pts} points.`, { importance: 1, cause: `${SERIES_LABEL[series]} standings`, tag: "junior" });
    }
    if (round === 1 && (series === "f2" || series === "f3")) news(s, `The ${s.year} ${SERIES_LABEL[series]} season opens at ${ev.name}.`, { importance: 1, cause: "Junior season starts", tag: "junior" });
  }
}

function fatigueAndTraining(s: CareerState) {
  const a = s.academy;
  const t = s.teams[s.teamId];
  const coach = Object.values(s.staff).find((x) => x.teamId === s.teamId && x.role === "coach");
  const coachBonus = coach ? 0.15 + coach.skill / 400 : 0;
  const rng = rngFor(s, "train");
  for (const p of Object.values(a.prospects)) {
    if (p.status === "gone" || p.status === "f1") continue;
    const mine = p.status === "academy" && p.owner === s.teamId;
    const load = mine ? p.training.length * 0.09 : 0;
    p.fatigue = clamp(p.fatigue + 0.03 + load - 0.09, 0, 1);
    if (!mine) continue;
    const mult = (1 - p.fatigue) * (0.6 + p.attrs.work * 0.6) * (0.8 + 0.1 * t.facilities.academy + coachBonus);
    for (const f of p.training) {
      const keys: AttrKey[] = f === "mental" ? ["pressure", "temperament"] : [f === "pace" ? "pace" : f === "racecraft" ? "racecraft" : f === "consistency" ? "consistency" : "wet"];
      for (const k of keys) p.attrs[k] = round2(clamp(p.attrs[k] + 0.006 * mult * (f === "mental" ? 1.4 : 1), 0, p.caps[k]));
    }
    // a mentor passes on character, slowly
    if (p.mentor) {
      const m = s.drivers[p.mentor];
      const ps = m?.spec.psyche;
      if (ps) {
        p.attrs.temperament = round2(p.attrs.temperament + (1 - ps.volatility - p.attrs.temperament) * 0.02);
        p.attrs.work = round2(p.attrs.work + (0.6 + ps.patience * 0.3 - p.attrs.work) * 0.01);
        p.attrs.ambition = round2(p.attrs.ambition + (ps.ego - p.attrs.ambition) * 0.01);
      }
    }
    // burnout: past a threshold he stalls and loses confidence
    if (p.fatigue > 0.78) {
      p.confidence = clamp(p.confidence - 0.05, 0, 1);
      if (rng.chance(0.3)) p.log.unshift(`${s.year}: showing signs of burnout.`);
    }
    // a confidence talk when it matters
    if (!s.cards.some((c) => c.kind === "academy" && Number(c.data?.prospectId) === 0) && (p.confidence < 0.32 || p.confidence > 0.9) && rng.chance(0.25) && !s.cards.some((c) => c.kind === "talk")) {
      pushCard(
        s,
        "talk",
        `${p.name}: a word`,
        `${p.name} (${SERIES_LABEL[p.series]}) is ${p.confidence < 0.4 ? "low on confidence after a poor run" : "full of confidence after a good run"}. How do you handle him? The right answer depends on his temperament, and you may need to learn what works.`,
        [
          { id: "praise", label: "Praise him" },
          { id: "calm", label: "A calm talk" },
          { id: "demand", label: "Demand more" },
        ],
        { urgency: 1, deadline: s.day + 12, defaultOption: "calm", data: { prospectId: p.id } },
      );
    }
  }
}

export function resolveTalk(s: CareerState, prospectId: string, option: string) {
  const p = s.academy.prospects[prospectId];
  if (!p) return;
  const sensitive = p.attrs.temperament < 0.45;
  const proud = p.attrs.ambition > 0.65;
  let d = 0;
  if (option === "praise") d = p.confidence < 0.5 ? (sensitive ? 0.2 : 0.1) : -0.02;
  if (option === "calm") d = 0.1 + (sensitive ? 0.05 : 0);
  if (option === "demand") d = proud && p.attrs.pressure > 0.55 ? 0.14 : sensitive ? -0.2 : -0.04;
  p.confidence = clamp(p.confidence + d, 0, 1);
  p.log.unshift(`${s.year}: ${option === "praise" ? "praised" : option === "calm" ? "a calm talk" : "was challenged"}: confidence ${d >= 0 ? "up" : "down"}.`);
}

/** Called on the first of each month. */
export function academyMonth(s: CareerState, month: number, skipWorld = false) {
  if (!skipWorld) juniorRound(s, month);
  scoutMonth(s, month);
  fatigueAndTraining(s);
  // monthly cost of the academy deals and scouts
  const a = s.academy;
  const t = s.teams[s.teamId];
  let cost = 0;
  for (const p of Object.values(a.prospects)) {
    if (p.status === "academy" && p.owner === s.teamId && p.deal) cost += (p.deal.retainer + SERIES_COST[p.series]) / 12;
  }
  const scouts = Object.values(s.staff).filter((x) => x.teamId === s.teamId && x.role === "scout").reduce((x, y) => x + y.salary, 0);
  if (cost > 0) {
    t.cash = round2(t.cash - cost);
    t.ledger.academy = round2((t.ledger.academy ?? 0) + cost);
    t.ledger.costs += cost;
  }
  if (scouts > 0) t.capSpent = round2(t.capSpent + scouts / 12);
  // random setbacks: rare, and more likely when he is worn out
  const rng = rngFor(s, "setback");
  for (const p of Object.values(a.prospects)) {
    if (p.status !== "academy" || p.owner !== s.teamId) continue;
    if (rng.chance(0.004 + 0.01 * p.fatigue)) {
      p.confidence = clamp(p.confidence - 0.25, 0, 1);
      p.setback += 1;
      p.log.unshift(`${s.year}: a bad injury and a lost spring.`);
      news(s, `${p.name} is injured. His season is hit.`, { importance: 2, cause: "Injury to an academy driver", tag: "academy" });
    }
  }
}

// ---------------------------------------------------------------- year end

function circumstances(s: CareerState, p: Prospect): number {
  const [lo, hi] = SERIES_BAND[p.series];
  const lv = levelOf(p);
  const fit = lv < lo - 0.08 ? 0.72 : lv > hi + 0.05 ? 0.68 : 1;
  const mine = p.status === "academy" && p.owner === s.teamId;
  const coach = mine && Object.values(s.staff).some((x) => x.teamId === s.teamId && x.role === "coach") ? 0.08 : 0;
  const ment = p.mentor ? 0.05 : 0;
  const burn = p.fatigue > 0.75 ? 0.6 : 1;
  const idle = p.status === "gone" ? 0.3 : 1;
  return clamp((0.9 + 0.2 * p.ride) * fit * (0.85 + 0.3 * p.confidence) * burn * idle + coach + ment, 0.4, 1.3);
}

function growYear(s: CareerState, p: Prospect) {
  const age = ageOfP(s, p);
  let r = p.bloom === "early" ? (age <= 19 ? 0.3 : 0.12) : p.bloom === "late" ? (age <= 19 ? 0.1 : 0.3) : age <= 23 ? 0.22 : 0.08;
  if (p.generational) r *= 1.4;
  const c = circumstances(s, p);
  for (const k of ATTRS) {
    const eff = Math.min(1, p.caps[k] + 0.12 * ((c - 0.9) / 0.3));
    const slow = ["pressure", "temperament", "ambition", "work", "loyalty"].includes(k) ? 0.5 : 1;
    p.attrs[k] = round2(clamp(p.attrs[k] + (eff - p.attrs[k]) * r * c * slow, 0.05, 1));
  }
}

const LICENCE: Record<Series, number[]> = { kart: [], f4: [12, 8, 4], f3: [25, 20, 15, 10, 5], f2: [40, 40, 40, 30, 20, 10, 8, 6, 4, 2] };

function sellPrice(p: Prospect): number {
  return round2(1 + 18 * Math.pow(Math.max(0, levelOf(p) - 0.3), 1.6) * (0.7 + 0.12 * stars(p)));
}

export const f1Eligible = (s: CareerState, p: Prospect): boolean => ageOfP(s, p) >= 18 && p.licence.slice(-3).reduce((a, b) => a + b, 0) >= 40 && p.series === "f2";

/** After the last race: standings, titles, licence points, growth, promotions, the AI academies, and the player's decision list. */
/** Junior records that no longer matter (gone from the sport, not a graduate, not in any live talk) are dropped, so the state stays small. */
export function pruneProspects(s: CareerState) {
  const a = s.academy;
  const live = new Set<string>([...a.graduates, ...a.shortlist, ...s.talks.filter((t) => t.status !== "closed").map((t) => t.targetId)]);
  for (const [id, p] of Object.entries(a.prospects)) {
    if (p.status === "gone" && !live.has(id) && !s.drivers[id]) delete a.prospects[id];
    else {
      if (p.log.length > 12) p.log = p.log.slice(-12);
    }
  }
}

export function academyYearEnd(s: CareerState): string[] {
  const a = s.academy;
  const notes: string[] = [];
  pruneProspects(s);
  const rng = rngFor(s, "academyyear");
  const me = s.teamId;
  // standings and licence points
  for (const series of SERIES) {
    const field = tableOf(s, series);
    field.forEach((p, i) => {
      p.rank = i + 1;
      (p.path ??= []).push({ year: s.year, series, rank: i + 1, pts: p.pts, wins: p.wins });
      if (p.path.length > 8) p.path.shift();
      p.licence.push(LICENCE[series][i] ?? 0);
      if (p.licence.length > 3) p.licence.shift();
      const top = i < Math.ceil(field.length * 0.2);
      const low = i >= Math.floor(field.length * 0.6);
      p.confidence = clamp(p.confidence + (top ? 0.18 : low ? -0.12 : 0), 0, 1);
      if (i < 3) p.log.unshift(`${s.year}: ${SERIES_LABEL[series]} P${i + 1}, ${p.pts} points.`);
    });
    const champ = field[0];
    if (champ) {
      champ.titles += 1;
      a.champions.push({ year: s.year, series, id: champ.id, name: champ.name });
      const known = champ.owner === me || a.shortlist.includes(champ.id);
      news(s, `${champ.name} wins the ${s.year} ${SERIES_LABEL[series]} title.${champ.owner === me ? " An academy driver of yours." : ""}`, { importance: champ.owner === me ? 3 : known ? 2 : 1, cause: `${SERIES_LABEL[series]} champion`, tag: "junior" });
      if (champ.owner === me) a.devRep += 1;
    }
  }
  // growth and ageing of everyone
  for (const p of Object.values(a.prospects)) {
    if (p.status === "gone" || p.status === "f1") continue;
    growYear(s, p);
    p.pts = 0;
    p.wins = 0;
    p.fatigue = clamp(p.fatigue - 0.3, 0, 1);
  }
  // step up into the F1 pool
  for (const p of Object.values(a.prospects)) {
    if (p.status === "gone" || p.status === "f1pool" || p.status === "f1") continue;
    if (f1Eligible(s, p) && levelOf(p) >= 0.5) {
      const was = p.status;
      p.status = was === "academy" || was === "rival" ? was : "f1pool";
      if (!s.pool.some((j) => j.id === p.id)) s.pool.push(toJunior(s, p));
      if (was === "academy" && p.owner === me) notes.push(`${p.name} now has the licence points to race in F1. Promote him in the Academy screen.`);
    }
  }
  s.pool = s.pool.filter((j) => {
    const p = a.prospects[j.id];
    return !p || (p.status !== "gone" && p.status !== "f1");
  });
  // promotions up the ladder, seat by seat
  const order: Series[] = ["f2", "f3", "f4", "kart"];
  const next: Record<Series, Series | null> = { kart: "f4", f4: "f3", f3: "f2", f2: null };
  for (const series of order) {
    const up = next[series];
    if (!up) continue;
    const here = Object.values(a.prospects).filter((p) => p.series === series && p.status !== "gone" && p.status !== "f1");
    const ready = here
      .filter((p) => ageOfP(s, p) + 1 >= SERIES_MIN_AGE[up] && levelOf(p) >= SERIES_BAND[up][0] - 0.02)
      .sort((x, y) => levelOf(y) + (y.owner === me ? 0.02 : 0) - (levelOf(x) + (x.owner === me ? 0.02 : 0)));
    const seats = SERIES_SEATS[up] - Object.values(a.prospects).filter((p) => p.series === up && p.status !== "gone" && p.status !== "f1").length;
    for (let i = 0; i < Math.max(0, seats) + 4 && i < ready.length; i++) {
      if (i >= ready.length) break;
      if (ready[i].owner === me && ready[i].status === "academy") a.decisions.push(ready[i].id);
      if (ready[i].owner === me || a.shortlist.includes(ready[i].id)) news(s, `${ready[i].name} steps up from ${SERIES_LABEL[series]} to ${SERIES_LABEL[up]} for ${s.year + 1}.`, { importance: ready[i].owner === me ? 2 : 1, cause: "Junior promotion", tag: "junior" });
      ready[i].series = up;
      ready[i].ride = round2(0.25 + rng.next() * 0.6);
    }
  }
  // old and weak prospects leave single seaters
  for (const p of Object.values(a.prospects)) {
    if (p.status === "gone" || p.status === "f1") continue;
    const age = ageOfP(s, p);
    const stuck = (p.series === "f2" && age >= 22 && p.status !== "academy") || age >= 25 || (p.series === "f3" && age >= 21) || (p.series === "f4" && age >= 19) || (p.series === "kart" && age >= 16);
    if (stuck && !(p.status === "academy" && p.owner === me)) {
      p.status = "gone";
      s.pool = s.pool.filter((j) => j.id !== p.id);
    }
  }
  // deals end
  for (const p of Object.values(a.prospects)) {
    if (!p.deal || p.status === "gone" || p.status === "f1") continue;
    if (p.deal.endYear <= s.year) {
      if (p.owner === me && p.status === "academy") {
        if (p.deal.firstRefusal && levelOf(p) > 0.4) {
          pushCard(s, "talk", `${p.name}: your deal ends`, `${p.name}'s academy deal runs out. You hold first refusal: re-sign him now before a rival can bid. A new deal costs about ${fmtMoney(p.deal.retainer * 1.3)} a year.`, [
            { id: "resign", label: "Use first refusal", detail: `${fmtMoney(p.deal.retainer * 1.3)} a year for 2 years` },
            { id: "release", label: "Let him go" },
          ], { urgency: 2, deadline: s.day + 20, defaultOption: "resign", data: { prospectId: p.id, resign: 1 } });
        } else {
          releaseProspect(s, p, "his deal ended");
        }
      } else {
        p.status = "free";
        p.owner = null;
        delete p.deal;
      }
    }
  }
  // rivals try to buy out the best of your academy: the buyout clause is what they must pay
  if (!s.cards.some((c) => c.kind === "talk" && (c.data as { bid?: number } | undefined)?.bid)) {
    const target = Object.values(a.prospects)
      .filter((p) => p.owner === me && p.status === "academy" && p.deal && stars(p) >= 3.5 && p.series !== "kart")
      .sort((x, y) => stars(y) - stars(x))[0];
    if (target && target.deal && teamRanking(s).some((x) => !isHuman(s, x)) && rng.chance(0.35 + 0.1 * (stars(target) - 3.5))) {
      const rivalPool = teamRanking(s).filter((x) => !isHuman(s, x)).slice(0, 6);
      const rival = rivalPool[Math.floor(rng.next() * rivalPool.length) % Math.max(1, rivalPool.length)] ?? "";
      const fee = target.deal.buyout;
      pushCard(s, "talk", `${baseTeam(rival).name} want ${target.name}`, `${baseTeam(rival).name} will trigger the buyout clause in his deal and pay ${fmtMoney(fee)} to take ${target.name} into their academy. You can take the money, or refuse and tear up the clause for his next deal. A refused driver knows who stood in his way.`, [
        { id: "sell", label: "Take the money", detail: `${fmtMoney(fee)} now, he leaves`, lines: ["Cash up. A rival gets a good junior."] },
        { id: "keep", label: "Refuse", detail: "He stays, but his confidence drops", lines: ["He may resent it if he stalls."] },
      ], { urgency: 2, deadline: s.day + 20, defaultOption: "keep", data: { prospectId: target.id, bid: 1, rival, fee } });
    }
  }
  // the AI academies pick prospects (the same noisy reading, better at higher difficulty)
  for (const id of teamRanking(s)) {
    if (isHuman(s, id)) continue;
    const t = s.teams[id];
    const held = Object.values(a.prospects).filter((p) => p.owner === id && (p.status === "rival")).length;
    if (held >= 3) continue;
    const pool = Object.values(a.prospects).filter((p) => p.status === "free" && ageOfP(s, p) <= 21 && p.series !== "kart");
    let best: Prospect | null = null;
    let bv = -9;
    for (const p of pool) {
      const v = stars(p) + rng.gauss() * (1.4 - t.skillBrain) * 1.0 + (a.shortlist.includes(p.id) ? 0.1 : 0);
      if (v > bv) {
        bv = v;
        best = p;
      }
    }
    if (best && rng.chance(0.5 + 0.3 * t.skillBrain)) {
      best.status = "rival";
      best.owner = id;
      best.deal = { endYear: s.year + 2, retainer: 0.6, buyout: 3, firstRefusal: false };
      if (a.shortlist.includes(best.id) || stars(best) > 4) news(s, `${baseTeam(id).name} sign ${SERIES_LABEL[best.series]} prospect ${best.name} to their academy.`, { importance: 2, cause: "A rival scouted the same driver", tag: "academy" });
    }
  }
  a.decisions = [...new Set([...a.decisions, ...Object.values(a.prospects).filter((p) => p.status === "academy" && p.owner === me).map((p) => p.id)])];
  if (a.decisions.length) {
    pushCard(s, "academyEnd", "Academy: end of season decisions", `You have ${a.decisions.length} academy driver${a.decisions.length > 1 ? "s" : ""} to review: keep, loan out, promote to test or reserve, sell, or release. Open the Academy screen. If you do nothing, they stay as they are.`, [{ id: "ok", label: "Understood" }], { urgency: 2, deadline: s.day + 25 });
  }
  notes.push(...[]);
  return notes;
}

/** Answer to a rival's buyout bid. */
export function resolveBid(s: CareerState, option: string, d: Record<string, unknown>) {
  const p = s.academy.prospects[String(d.prospectId)];
  const t = s.teams[s.teamId];
  if (!p || p.owner !== s.teamId || p.status !== "academy") return;
  const rival = String(d.rival);
  const fee = Number(d.fee ?? 1);
  if (option === "sell") {
    t.cash = round2(t.cash + fee);
    t.ledger.income += fee;
    s.academy.devRep += 1;
    p.status = "rival";
    p.owner = rival;
    p.deal = { endYear: s.year + 2, retainer: 0.6, buyout: 3, firstRefusal: false };
    s.academy.decisions = s.academy.decisions.filter((x) => x !== p.id);
    news(s, `${baseTeam(rival).name} pay ${fmtMoney(fee)} to buy ${p.name} out of your academy.`, { importance: 2, cause: "Academy buyout", tag: "academy" });
  } else {
    p.confidence = clamp(p.confidence - 0.15, 0, 1);
    p.log.unshift(`${s.year}: you refused a buyout bid from ${rival.toUpperCase()}.`);
  }
}

/** You pay a rival academy's buyout clause to take a prospect. */
export function buyoutProspect(s: CareerState, id: string): string | null {
  const a = s.academy;
  const p = a.prospects[id];
  const t = s.teams[s.teamId];
  if (!p || p.status !== "rival" || !p.deal || !p.owner) return "He is not tied to a rival academy.";
  const held = Object.values(a.prospects).filter((x) => x.status === "academy" && x.owner === s.teamId).length;
  const cap = 3 + t.facilities.academy;
  if (held >= cap) return `Your academy has room for ${cap} drivers.`;
  const fee = round2(p.deal.buyout * 1.2);
  if (t.cash < fee) return `The clause costs ${fmtMoney(fee)}.`;
  const over = budgetBlock(s, "academy", SERIES_COST[p.series] + 0.5);
  if (over) return over;
  const from = p.owner;
  t.cash = round2(t.cash - fee);
  t.ledger.academy = round2((t.ledger.academy ?? 0) + fee);
  t.ledger.costs += fee;
  s.teams[from].cash = round2(s.teams[from].cash + fee);
  p.status = "academy";
  p.owner = s.teamId;
  p.deal = { endYear: s.year + 2, retainer: 0.5, buyout: round2(fee * 1.5), firstRefusal: true };
  p.log.unshift(`${s.year}: bought out of ${from.toUpperCase()}'s academy.`);
  logSpend(s, `Bought ${p.name} out of ${baseTeam(from).name}'s academy`, { cash: -fee });
  news(s, `You pay ${fmtMoney(fee)} to take ${p.name} from ${baseTeam(from).name}.`, { importance: 2, cause: "Academy buyout", tag: "academy" });
  return null;
}

/** Fans and the board love a driver the team raised. Called after each race for graduates in your seats. */
export function graduatePrestige(s: CareerState, teamPoints: number) {
  const me = s.teams[s.teamId];
  const grads = driversOf(s, s.teamId).filter((d) => s.academy.graduates.includes(d.id)).length;
  if (!grads || teamPoints <= 0) return;
  const got = (teamPoints * grads) / 2;
  s.brand.fans = clamp(s.brand.fans + Math.min(1.5, got * 0.08), 0, 100);
  boardMove(s, me, Math.min(1.5, got * 0.06), "Academy graduates");
}

function releaseProspect(s: CareerState, p: Prospect, why: string) {
  p.status = "free";
  p.owner = null;
  delete p.deal;
  news(s, `${p.name} leaves your academy (${why}).`, { importance: 1, cause: "Academy decision", tag: "academy" });
}

// ---------------------------------------------------------------- actions

/** What his camp wants as a yearly retainer, $m. */
export const askRetainer = (s: CareerState, p: Prospect) => round2(0.3 + stars(p) * 0.12 + ageOfP(s, p) * 0.02);

export function signProspect(s: CareerState, id: string, years: number, retainer: number, buyout: number, firstRefusal: boolean): string | null {
  const a = s.academy;
  const p = a.prospects[id];
  const t = s.teams[s.teamId];
  if (!p || p.status !== "free") return p ? "He is already tied to another team." : "Unknown prospect.";
  const held = Object.values(a.prospects).filter((x) => x.status === "academy" && x.owner === s.teamId).length;
  const cap = 3 + t.facilities.academy;
  if (held >= cap) return `Your academy has room for ${cap} drivers. Upgrade it or release someone.`;
  if (retainer < 0.3) return "That retainer is too low to interest his family.";
  const over = budgetBlock(s, "academy", retainer + SERIES_COST[p.series]);
  if (over) return over;
  const ask = askRetainer(s, p);
  if (retainer < ask * 0.7) return `His camp wants about ${fmtMoney(ask)} a year.`;
  p.status = "academy";
  p.owner = s.teamId;
  p.deal = { endYear: s.year + years - 1, retainer: round2(retainer), buyout: round2(buyout), firstRefusal };
  p.log.unshift(`${s.year}: joined your academy.`);
  p.confidence = clamp(p.confidence + 0.1, 0, 1);
  t.ledger.costs += 0;
  logSpend(s, `Academy deal: ${p.name}`, { cash: -(retainer + SERIES_COST[p.series]) });
  news(s, `${p.name} joins your academy.`, { importance: 2, cause: "Academy signing", tag: "academy" });
  return null;
}

export function trialDay(s: CareerState, id: string): string | null {
  const a = s.academy;
  const p = a.prospects[id];
  const t = s.teams[s.teamId];
  if (!p) return "Unknown prospect.";
  if (a.trialDays <= 0) return "No trial days left this season.";
  if (t.cash < 0.25) return "Not enough cash for a trial day.";
  a.trialDays -= 1;
  t.cash = round2(t.cash - 0.25);
  t.ledger.academy = round2((t.ledger.academy ?? 0) + 0.25);
  t.ledger.costs += 0.25;
  p.trial = clamp(p.trial + 0.6, 0, 1);
  p.seen += 2;
  p.quality = Math.max(p.quality, 0.7);
  logSpend(s, `Trial day with ${p.name}`, { cash: -0.25 });
  return null;
}

export function setTraining(s: CareerState, id: string, focus: Focus[]): string | null {
  const p = s.academy.prospects[id];
  if (!p || p.owner !== s.teamId) return "Not in your academy.";
  p.training = focus.slice(0, 2);
  return null;
}

export function moveSeries(s: CareerState, id: string, series: Series): string | null {
  const p = s.academy.prospects[id];
  if (!p || p.owner !== s.teamId || p.status !== "academy") return "Not in your academy.";
  if (ageOfP(s, p) < SERIES_MIN_AGE[series]) return `He is too young for ${SERIES_LABEL[series]} (minimum age ${SERIES_MIN_AGE[series]}).`;
  p.series = series;
  p.ride = round2(0.35 + rngFor(s, `ride:${id}`).next() * 0.5);
  p.log.unshift(`${s.year}: moved to ${SERIES_LABEL[series]}.`);
  return null;
}

export function setMentor(s: CareerState, id: string, driverId: string | null): string | null {
  const p = s.academy.prospects[id];
  if (!p || p.owner !== s.teamId) return "Not in your academy.";
  if (driverId && s.drivers[driverId]?.teamId !== s.teamId) return "He is not one of your drivers.";
  p.mentor = driverId;
  return null;
}

export function assignScout(s: CareerState, staffId: string, series: Series): string | null {
  const st = s.staff[staffId];
  if (!st || st.teamId !== s.teamId || st.role !== "scout") return "Not one of your scouts.";
  s.academy.scouts[staffId] = series;
  return null;
}

export function decide(s: CareerState, id: string, decision: "keep" | "loan" | "reserve" | "sell" | "release"): string | null {
  const a = s.academy;
  const p = a.prospects[id];
  const t = s.teams[s.teamId];
  if (!p || p.owner !== s.teamId || p.status !== "academy") return "Not in your academy.";
  a.decisions = a.decisions.filter((x) => x !== id);
  if (decision === "keep") return null;
  if (decision === "loan") {
    p.ride = clamp(p.ride + 0.2, 0, 1);
    p.log.unshift(`${s.year}: loaned to a stronger team for racing time.`);
    return null;
  }
  if (decision === "reserve") {
    if (!f1Eligible(s, p) && ageOfP(s, p) < 18) return "He is too young to be a reserve.";
    p.training = [];
    p.log.unshift(`${s.year}: promoted to test and reserve.`);
    p.confidence = clamp(p.confidence + 0.08, 0, 1);
    return null;
  }
  if (decision === "sell") {
    const fee = sellPrice(p);
    t.cash = round2(t.cash + fee);
    t.ledger.income += fee;
    a.devRep += 1;
    const buyers = teamRanking(s).filter((x) => !isHuman(s, x));
    p.status = "rival";
    p.owner = buyers[Math.floor(rngFor(s, `sell:${id}`).next() * buyers.length)];
    p.deal = { endYear: s.year + 2, retainer: 0.6, buyout: 3, firstRefusal: false };
    news(s, `You sell ${p.name} to ${baseTeam(p.owner).name} for ${fmtMoney(fee)}.`, { importance: 2, cause: "Academy sale", tag: "academy" });
    return null;
  }
  releaseProspect(s, p, "released");
  return null;
}

export function resignProspect(s: CareerState, id: string) {
  const p = s.academy.prospects[id];
  if (!p || !p.deal) return;
  p.deal = { ...p.deal, endYear: s.year + 2, retainer: round2(p.deal.retainer * 1.3) };
  p.log.unshift(`${s.year}: re-signed using first refusal.`);
}

export function setRookie(s: CareerState, id: string | null): string | null {
  if (id !== null) {
    const p = s.academy.prospects[id];
    if (!p || p.owner !== s.teamId) return "Not in your academy.";
    if (ageOfP(s, p) < 18) return "He must be at least 18 to take part in a Grand Prix weekend.";
  }
  s.academy.rookieNominee = id;
  return null;
}

/** Turns a prospect into an F1 driver for the player's team. Needs the super licence. */
export function promoteToSeat(s: CareerState, id: string, slot: 0 | 1, salary: number, years: number): string {
  const a = s.academy;
  const p = a.prospects[id];
  if (!p || p.owner !== s.teamId || p.status !== "academy") return "He is not in your academy.";
  if (!f1Eligible(s, p)) return `He needs to be 18 and have 40 super licence points over three seasons (he has ${p.licence.slice(-3).reduce((x, y) => x + y, 0)}).`;
  const mine = driversOf(s, s.teamId);
  const seat = mine[slot];
  const ds = prospectToDriver(s, p);
  s.drivers[ds.id] = ds;
  const notes = signDriver(s, s.teamId, ds.id, { salary, years, role: "number2" }, seat?.id);
  p.status = "f1";
  a.graduates.push(p.id);
  s.pool = s.pool.filter((j) => j.id !== p.id);
  p.log.unshift(`${s.year}: promoted to an F1 seat.`);
  news(s, `${p.name} makes the step from your academy to a race seat.`, { importance: 3, cause: "Academy graduate", tag: "academy" });
  return notes.join(" ");
}

export function prospectToDriver(s: CareerState, p: Prospect): DriverState {
  const lv = levelOf(p);
  const ps = { voice: "sunny" as const, ego: p.attrs.ambition * 0.8, obedience: 0.4 + p.attrs.temperament * 0.4, volatility: 1 - p.attrs.temperament, patience: p.attrs.temperament, humour: 0.5, selfBelief: 0.4 + p.attrs.pressure * 0.4, loyalty: clamp(p.attrs.loyalty + 0.15, 0, 1), talkative: 0.5 };
  const spec = {
    id: p.id, code: p.code, name: p.name, number: 40 + (hashSeed(p.id) % 50), nat: p.nat, born: p.born,
    pace: f1Pace(lv), tyreMgmt: clamp(0.4 + p.attrs.tyreFeel * 0.55, 0.3, 0.95), aggression: p.style, consistency: clamp(0.4 + p.attrs.consistency * 0.5, 0.4, 0.93),
    fictional: p.fictional, psyche: ps, wet: p.attrs.wet,
  } as import("../sim/types").DriverSpec;
  return {
    id: p.id, spec, teamId: null, salary: 1, endYear: s.year, role: "equal", potential: clamp((ceilingOf(p) - 0.4) / 0.55, 0.3, 1), tenure: 0, retired: false,
    morale: 0.7, trust: 0.7, wins: 0, podiums: 0, titles: 0, starts: 0, grievance: 0, gStage: 0, causes: {},
  };
}

/** An AI team's pool junior who becomes an F1 driver keeps his prospect record in step. */
export function markGone(s: CareerState, id: string) {
  const p = s.academy.prospects[id];
  if (p) p.status = "f1";
}

export { staffOf };
