import type { DriverSpec } from "../sim/types";
import type { EraState } from "./eras";
import type { AcademyState } from "./academy";

/** Everything about a career in plain data, so it saves as JSON and a reducer can run it anywhere. */

export type Area = "aero" | "chassis" | "power" | "cooling" | "tyres";
export const AREAS: Area[] = ["aero", "chassis", "power", "cooling", "tyres"];
export const AREA_LABEL: Record<Area, string> = {
  aero: "Aero",
  chassis: "Chassis",
  power: "Power unit",
  cooling: "Cooling and packaging",
  tyres: "Tyre and suspension",
};

export type Size = "S" | "M" | "L";

/** The ten things a car is made of. Two sit under each area; the area's worth is their blend, and a lopsided pair costs. */
export type Trait = "downforce" | "efficiency" | "grip" | "platform" | "output" | "drive" | "capacity" | "packaging" | "wear" | "warmup";
export const TRAITS: Trait[] = ["downforce", "efficiency", "grip", "platform", "output", "drive", "capacity", "packaging", "wear", "warmup"];
/** What an engineer or a concept leans towards, each -1..1. df: low drag (-1) to high downforce (+1). risk: proven (-1) to radical (+1). innov: refine (-1) to invent (+1). */
export interface Phil {
  df: number;
  risk: number;
  innov: number;
}
/** A belief about one number: the estimate and how far off it could be (one standard deviation, same units). */
export interface Know {
  est: number;
  err: number;
}
export type Guidance = "off" | "hints" | "full";

/** A proposal from the factory. The real gain is hidden until the part runs at a track. */
export interface Idea {
  id: number;
  area: Area;
  size: Size;
  name: string;
  /** Cap room it uses, $m. */
  cost: number;
  days: number;
  tunnelHours: number;
  /** What the staff predict, seconds per lap. */
  predLo: number;
  predHi: number;
  /** Hidden truth, seconds per lap. */
  trueGain: number;
  created: number;
  expires: number;
  /** Safe: small and sure. Gamble: wide range, could flop. Enabler: little gain now, makes the next part in the area better. */
  kind?: "safe" | "gamble" | "enabler";
  /** How the design office would tackle the problem in the brief: a quick fix, a proper job, or a rethink. */
  approach?: "quick" | "proper" | "rethink";
  /** A price paid on the partner trait when the part goes on the car. Known up front, unlike the gain. */
  side?: { trait: Trait; amount: number };
  /** Came from outside the brief. */
  offBrief?: boolean;
  note?: string;
  /** A trainee brought this one. */
  rookie?: boolean;
  /** Born from the manager's own lab run. */
  lab?: boolean;
  /** The trait this part works on. */
  trait?: Trait;
  /** The engineer who would lead it. */
  lead?: string;
}

/** How the player steers the factory. */
/** Data from a race weekend that makes the next matching project cheaper and quicker. */
export interface Boost { trait: Trait; pct: number; why: string; day: number; until: number }

export interface RndPlan {
  /** Weekend findings waiting to be spent on a matching project. */
  boosts?: Boost[];
  /** Last day a development crisis hit, so they do not pile up. */
  eventDay?: number;
  /** The problem the manager sent the design office after: all new pitches are approaches to it until it lapses. */
  brief?: { trait: Trait; area: Area; until: number; day: number; made?: boolean; lastGen?: number };
  focus: Area | "balanced" | "bank";
  stance: "safe" | "balanced" | "bold";
  /** The focus lapses back to balanced on this day. */
  until: number;
  /** Last day the focus question was put to the manager, and the ideas already offered, so the same question is not asked again. */
  asked?: number;
  offered?: number[];
  /** Bonus on the next fitted part in an area, from enabler projects. */
  synergy: Partial<Record<Area, number>>;
  /** A cheap supplier deal is running until this day: parts cost less and may underdeliver. */
  cheapUntil: number;
}

export interface Project {
  id: number;
  area: Area;
  size: Size;
  name: string;
  cost: number;
  days: number;
  tunnelHours: number;
  predLo: number;
  predHi: number;
  trueGain: number;
  start: number;
  /** Days of work done. */
  progress: number;
  status: "building" | "ready" | "fitted" | "scrapped";
  /** The player (or the team) is holding this part back from the next race. */
  hold: boolean;
  /** Set once fitted: what it really did. */
  delivered?: number;
  fittedRound?: number;
  /** Seconds known about the real gain after a test run (0 means not tested). */
  tested?: number;
  /** Track tests run on this part: what each plan measured and how far to trust it. */
  testRuns?: { plan: string; est: number; sd: number; day: number }[];
  /** The day it went into the crate, if held back. */
  heldSince?: number;
  /** A trainee brought this part. */
  rookie?: boolean;
  /** The field caught up while it sat in the crate. */
  stale?: boolean;
  /** Wind tunnel hours used so far. */
  tunnelUsed?: number;
  fittedYear?: number;
  kind?: "safe" | "gamble" | "enabler";
  cheap?: boolean;
  /** Started by a delegated head of R&D, without the player's brief: built to a general spec. */
  unbriefed?: boolean;
  trait?: Trait;
  approach?: "quick" | "proper" | "rethink";
  side?: { trait: Trait; amount: number };
  /** Short-life parts gain more but wear out after `lifeRaces` races and must be rebuilt. */
  life?: "short" | "long";
  lifeRaces?: number;
  worn?: boolean;
  /** Built for next year's car: banked until January, never fitted this season. */
  forNext?: boolean;
  /** The weekend data this project used to start cheaper and faster. */
  boost?: { pct: number; why: string };
  /** Who leads the design, for the fit between the engineer and the job. */
  lead?: string;
}

export type StaffRole = "td" | "designer" | "aero" | "power" | "data" | "strategy" | "mechanic" | "engineer" | "scout" | "coach";
export const STAFF_LABEL: Record<StaffRole, string> = {
  td: "Technical director",
  designer: "Chief designer",
  aero: "Head of aerodynamics",
  power: "Head of power unit",
  data: "Data and simulation lead",
  strategy: "Head of strategy",
  mechanic: "Chief mechanic",
  engineer: "Race engineer",
  scout: "Scout",
  coach: "Junior coach",
};

export interface Staff {
  id: string;
  name: string;
  nat: string;
  age: number;
  role: StaffRole;
  /** Race engineers work with one driver. */
  driverId?: string;
  /** 0..100. The player sees words and a sharpening range, not this number. */
  skill: number;
  /** 0..1 how well the player knows this person's true skill. */
  known: number;
  traits: string[];
  mood: number;
  teamId: string | null;
  salary: number;
  endYear: number;
  /** Seasons spent with the current team. */
  tenure: number;
  /** What this person is best at, per area, 0..1 (hidden truth; the player sees it sharpen with `known`). */
  spec?: Record<Area, number>;
  /** Where this person's instincts lie. */
  phil?: Phil;
  /** Set for a trainee: someone learning the job whose `role` is the job they are learning. */
  intern?: { potential: number; since: number };
}

export type DriverRole = "equal" | "number1" | "number2";

export interface DriverState {
  id: string;
  spec: DriverSpec;
  teamId: string | null;
  salary: number;
  endYear: number;
  role: DriverRole;
  /** 0..1 how good they could still get. */
  potential: number;
  /** Seasons with the current team. */
  tenure: number;
  retired: boolean;
  /** Memory for the people systems added later (all 0..1). */
  morale: number;
  trust: number;
  /** Counts of things that have happened, for ages of service and career records. */
  wins: number;
  podiums: number;
  titles: number;
  starts: number;
  /** Grievance 0..1, its stage on the ladder (0 content to 5 leaving) and what built it, by cause. */
  grievance: number;
  gStage: number;
  causes: Record<string, number>;
  /** A signed deal for next season with another team (set in-season, applied at the end of the year). */
  next?: { teamId: string; salary: number; endYear: number; role: DriverRole; replaces?: string };
  /** A team option: the club may keep him one more year at the same pay. Set to the optional year. */
  optionYear?: number;
  /** Paid at the year end if he finishes in the top five of the championship. */
  perfBonus?: number;
  /** Career record: places, poles, fastest laps, sprint wins and title years (real totals for the real drivers). */
  rec?: import("./records").DriverRecord;
  /** The year he has decided to retire at the end of, rolled before the last race so the paddock can send him off. */
  retiring?: number;
  /** The year the retirement decision was rolled for. */
  retireRolled?: number;
  /** Where he stands with the team and what he expects (see status.ts). */
  stat?: import("./status").DriverStatus;
}

export interface Sponsor {
  id: number;
  name: string;
  /** Retainer paid across the season, $m. */
  retainer: number;
  /** Paid per race for points finishes by both cars, $m. */
  bonusPerRace: number;
  /** Objective text shown to the player. */
  objective: string;
  /** Which objective kind, for scoring. */
  objKind: "bothPoints" | "podiums" | "top5";
  mood: number;
  endYear: number;
  /** Activities cost driver time and morale. */
  demand: number;
  /** What the sponsor makes the team change: livery colour, or a title name in front of the team. */
  terms?: { kind: "livery" | "rename"; color?: number; prefix?: string };
  /** Paid to leave early, $m. */
  breakFee?: number;
}

/** Friction between the two drivers of the player's team. */
export interface RiftState {
  heat: number;
  /** 0 calm, 1 tension, 2 feud, 3 open war. */
  stage: 0 | 1 | 2 | 3;
  causes: Record<string, number>;
  /** The last stage the player was asked about, so a card is not repeated. */
  asked: number;
  /** Day until which a settlement holds (heat grows slower). */
  truceUntil: number;
}

/** What the player has said in public, and how the press feels. */
export interface Quote {
  day: number;
  kind: "mood" | "support" | "money" | "fair" | "plan";
  text: string;
  driverId?: string;
  called?: boolean;
}
export interface PressState {
  /** -1 hostile to +1 friendly. */
  mood: number;
  quotes: Quote[];
  /** Answers of "no comment" in a row. */
  silence: number;
  /** How hot the biggest live story is, 0..1. */
  heat: number;
  lastStory: number;
}

/** Fans, heritage and what sponsors have made the team change. */
export interface BrandState {
  /** 0 to 100. Slow to move, and heritage teams care most about their identity. */
  fans: number;
  /** The livery colour a sponsor forced, if any (the team's own colour otherwise). */
  color: number | null;
  /** A title-sponsor name in front of the team name. */
  prefix: string | null;
  /** The identity the team had before the deal, so it can be restored. */
  backlashDue: number | null;
  /** The sponsor id behind the current identity change. */
  by: number | null;
  /** The shortlist behind the open sponsor card. */
  offers: Sponsor[];
  /** The day the team last chose a new livery of its own. */
  liveryDay?: number;
}

export interface Facilities {
  tunnel: number;
  sim: number;
  factory: number;
  academy: number;
  building: { which: keyof Omit<Facilities, "building">; done: number } | null;
}

export type Level = "advise" | "do" | "hands";
export interface Delegation {
  rnd: Level;
  setup: Level;
  parts: Level;
}

export interface Objective {
  id: string;
  text: string;
  kind: "position" | "points" | "podiums" | "wins";
  target: number;
}

/** How one person has fared under the manager's direction. */
export interface DevRec { backed: number; overruled: number; scrapped: number; landed: number; missed: number; heard: number }
export type DevReact = "fume" | "stung" | "nod" | "shrug" | "sulk" | "pale" | "grin" | "proud";
export interface DevEntry {
  day: number;
  kind: "backed" | "overruled" | "scrapped" | "held" | "fitted" | "landed" | "missed" | "regret" | "notice" | "promoted" | "tested" | "stale" | "crisis";
  text: string;
  staffId?: string;
  projectId?: number;
  react?: DevReact;
}
/** The record of the manager's development calls and how the people took them. Private to the team. */
export interface DevState {
  rec: Record<string, DevRec>;
  log: DevEntry[];
  landed: number;
  missed: number;
  /** A development crisis: 1 warning, 2 split, 3 fallout. */
  crisis?: { stage: 1 | 2 | 3; since: number };
  /** The last day each person handed in a letter, so it cannot repeat for months. */
  noticeDay?: Record<string, number>;
  /** Idea production runs slow until this day (after a split). */
  slowUntil?: number;
  /** Ideas that were scrapped, to compare with what rivals later deliver. */
  scrapped?: { name: string; area: Area; gain: number; day: number; staffId?: string }[];
}

export interface TeamState {
  id: string;
  /** The development record: calls, reactions, landings. */
  dev?: DevState;
  /** Lap-time seconds gained (or lost) against the baseline team, per area. This is the truth. */
  car: Record<Area, number>;
  /** What the player believes about their own car, per area (they find out the truth at the track). */
  believed: Record<Area, number>;
  /** Hidden truth, one number per trait (seconds). `car` is derived from this. */
  dna: Record<Trait, number>;
  /** What the team believes about each trait, with an error bar. `believed` is derived from this. */
  know: Record<Trait, Know>;
  /** What the team believes the regulations reward, per trait (1 = average). */
  regKnow: Record<Trait, Know>;
  /** The design philosophy of the car being built. */
  concept: Phil;
  /** The shape of the car: eight dials, 0 to 1 (see design.ts). */
  design?: import("./design").Design;
  /** A shape chosen in the lab for next year's car. It becomes the car in January. */
  designNext?: import("./design").Design;
  /** How well each lab instrument matches the track, 0 to 1, built up by running the car (see lab.ts). */
  corr?: Record<string, number>;
  /** The lab notebook, newest first. */
  notebook?: import("./lab").LabEntry[];
  /** The day the concept last changed. */
  conceptDay?: number;
  cash: number;
  capSpent: number;
  capLimit: number;
  /** Cap room already promised in the base programme this season so far (accrues daily). */
  capBase: number;
  projects: Project[];
  ideas: Idea[];
  tunnelLeft: number;
  tunnelTotal: number;
  /** CFD (computer simulation) hours, a second allowance on the same sliding scale. */
  cfdTotal?: number;
  cfdLeft?: number;
  facilities: Facilities;
  sponsors: Sponsor[];
  /** AI teams use these when they build their calendar of upgrades. */
  philosophy: "early" | "balanced" | "late" | "gamble";
  skillBrain: number;
  board: number;
  objectives: Objective[];
  delegation: Delegation;
  /** Operating costs not otherwise listed, per season, set from the team's tier. */
  overhead: number;
  /** Base income apart from prize money and the sponsors the player manages (AI teams only). */
  aiIncome: number;
  /** The season money log for the Money screen. */
  ledger: { income: number; costs: number; prize: number; sponsors: number; salaries: number; travel: number; facilities: number; other: number; academy: number; drivers: number; staffPay: number; rnd: number };
  fineOwed: number;
  breached: boolean;
  /** Constructors' championships won, by year (real history for the real teams). */
  wcc?: number[];
  /** The pit crew: members, line-up and how well they work together. */
  crew?: import("./pitcrew").PitCrewState;
  /** Money borrowed from the bank, $m. It costs interest every month and the board does not like it. */
  debt?: number;
  /** Wind tunnel hours borrowed from the next allowance. */
  tunnelDebt?: number;
  plan?: RndPlan;
}

export interface Standings {
  drivers: Record<string, number>;
  teams: Record<string, number>;
  /** One line per race for the history table. */
  races: RaceRecord[];
}

export interface RaceRecord {
  round: number;
  circuitId: string;
  gp: string;
  winner: string;
  winnerTeam: string;
  podium: string[];
  playerPos: number[];
  sprintWinner?: string;
  /** Cars that did not finish, for the rulemakers' mood. */
  dnfs?: number;
}

export type CardKind =
  | "welcome"
  | "debrief"
  | "projectReady"
  | "ideaBatch"
  | "partReveal"
  | "sponsorOffer"
  | "sponsorReview"
  | "contractExpiring"
  | "contractOffer"
  | "staffExpiring"
  | "staffPoach"
  | "board"
  | "summerHub"
  | "offseason"
  | "capWarning"
  | "capBreach"
  | "facility"
  | "launch"
  | "weekendPrep"
  | "info"
  | "firing"
  | "era"
  | "talk"
  | "event"
  | "media"
  | "owner"
  | "promise"
  | "academy"
  | "academyEnd"
  | "rumour"
  | "sponsorPick"
  | "fanBacklash"
  | "rndDirection"
  | "staffNotice"
  | "testDay"
  | "devCrisis"
  | "pressStory"
  | "rivalry"
  | "mail"
  | "nextCar"
  | "devEvent";

export interface CardOption {
  id: string;
  label: string;
  detail?: string;
  /** Plain-words facts shown under the option. */
  lines?: string[];
  /** A warning, such as not being able to afford it. */
  warn?: string;
}

export interface Card {
  id: number;
  kind: CardKind;
  title: string;
  body: string;
  options: CardOption[];
  created: number;
  /** The day by which it must be answered. After that the default option is taken. */
  deadline?: number;
  defaultOption?: string;
  /** 1 info, 2 normal, 3 urgent. */
  urgency: 1 | 2 | 3;
  data?: Record<string, number | string | boolean>;
  /** The clock has already stopped once to warn about this card's deadline. */
  warned?: boolean;
  /** A notice: shown in its own area, never needs an answer. */
  notice?: boolean;
  /** A letter in the inbox: who wrote and in what role. Never stops the clock. */
  mail?: { from: string; role: string };
  /** Set once the player has opened it in the inbox. */
  read?: boolean;
}

export interface TickerItem {
  day: number;
  text: string;
  importance: 1 | 2 | 3;
}

/** The three setup axes the engineers help the player find. All -1..1 around a hidden sweet spot. */
export type SetupVec = Record<string, number>;
export interface AxisInfo {
  id: string;
  label: string;
  low: string;
  high: string;
  target?: "aero" | "power" | "tyre" | "consistency";
}

export type SessionKind = "sq" | "sprint" | "quali" | "race";

export interface SessionResult {
  kind: SessionKind;
  /** Car ids in finishing order. */
  order: string[];
  points: Record<string, number>;
  /** Grid order produced by a qualifying (car ids). */
  grid?: string[];
  dnf: string[];
  /** Car id of the fastest lap, when known. */
  fastest?: string;
}

export interface WeekendState {
  round: number;
  circuitId: string;
  sprint: boolean;
  /** What the player does next. */
  stage: "practice" | "sq" | "sprint" | "quali" | "race" | "done";
  /** Practice sessions left and runs left in the current one. */
  sessionsLeft: number;
  runsLeft: number;
  /** The truth the engineers are hunting. */
  sweet: SetupVec;
  /** The current setup the player chose. */
  setup: SetupVec;
  /** Per-driver offsets from the shared setup. */
  tweak?: Record<string, SetupVec>;
  /** How much of each axis is known (0..1). The shown range narrows with it. */
  known: Record<string, number>;
  /** Noisy hints per axis from the last run, -1..1 (where the engineer thinks the sweet spot is). */
  hint: Record<string, number>;
  notes: string[];
  /** Knowledge gathered from programmes. */
  tyreKnow: number;
  raceKnow: number;
  qualiKnow: number;
  /** Confidence per driver id, 0..1, rises with laps. */
  confidence: Record<string, number>;
  /** Setup quality for AI teams. */
  aiQuality: Record<string, number>;
  /** Parts fitted for this weekend (project ids). */
  fitted: number[];
  /** True once qualifying is done and setup is locked. */
  parc: boolean;
  results: Partial<Record<SessionKind, SessionResult>>;
  seed: number;
  /** The setup axes this weekend (the regulations may add or remove some). */
  axes: AxisInfo[];
  sessions0: number;
  /** Rule notes for this weekend, shown on the practice screen. */
  ruleNotes: string[];
  /** Race rules chosen by the fans, if the rule is live. */
  fanRule?: "fastestLap" | "extraRun" | "softTyres";
  weatherCard?: { kind: "dry" | "mixed" | "wet"; chance: [number, number] };
  /** Fresh tyre sets left per human driver after qualifying, and tyres locked by the qualifying rule. */
  tyreSets?: Record<string, Record<"S" | "M" | "H", number>>;
  locks?: Record<string, "S" | "M" | "H">;
  /** The player changed the setup after parc ferme: both cars start from the pit lane. */
  parcBroken?: boolean;
  /** Grid places each driver loses in this weekend's race, and why. */
  drops?: Record<string, GridDrop[]>;
  /** Components that failed this weekend and must be replaced before the next session. */
  dead?: Record<string, PartKind[]>;
  /** The player has walked into the weekend (the dashboard button says START WEEKEND until then). */
  entered?: boolean;
  /** How far the simulator's picture of each axis is off. The engineers' guess can never be better than this. */
  bias?: SetupVec;
  /** Every timed run of the weekend: the evidence the setup is worked out from. */
  runs?: import("./setup").RunRec[];
  /** How familiar each driver is with the car this weekend, 0..1, from laps (the smaller part of his confidence). */
  fam?: Record<string, number>;
  /** Fresh tyre sets each driver has burnt in practice. They come off the weekend's allocation. */
  fresh?: Record<string, Partial<Record<"S" | "M" | "H", number>>>;
  /** The physical tyre sets for the weekend, with their wear, keyed by driver (or by team under the pool rule). */
  setList?: Record<string, import("../sim/tyreSets").TyreSet[]>;
  /** The allocation chosen before the weekend (dry sets per driver), and the engineers' recommendation with their reasons. */
  alloc?: import("../sim/tyreSets").Alloc;
  allocRec?: { alloc: import("../sim/tyreSets").Alloc; why: string[]; sure: boolean };
  /** True once the allocation is confirmed (the first run confirms the recommendation if you never did). */
  allocDone?: boolean;
}

export type PartKind = "pu" | "gb";
export interface GridDrop {
  places: number;
  why: string;
}
export interface DriverWear {
  year: number;
  /** Units used this season, counting the one on the car, and what is left of the current one (0..1). */
  pu: { n: number; life: number };
  gb: { n: number; life: number };
}

export interface SeasonRecord {
  year: number;
  champion: string;
  championTeam: string;
  constructors: string;
  playerPos: number;
  playerPoints: number;
}

export type Phase = "season" | "offseason";

export interface NewsItem {
  day: number;
  text: string;
  importance?: 1 | 2 | 3;
  /** Why it happened, in plain words. */
  cause?: string;
  tag?: string;
}

export interface SpendEntry {
  day: number;
  text: string;
  /** $m of cap room, tunnel hours, and cash (negative is spent). */
  cap: number;
  tunnel: number;
  cash: number;
}

export interface Budgets {
  drivers: number;
  staff: number;
  rnd: number;
  facilities: number;
  academy: number;
}
export const BUDGET_LABEL: Record<keyof Budgets, string> = {
  drivers: "Drivers",
  staff: "Staff",
  rnd: "R&D and parts",
  facilities: "Facilities",
  academy: "Academy and scouting",
};

export interface PromiseItem {
  id: number;
  driverId: string;
  kind: "upgrade" | "seat" | "number1" | "title" | "academy" | "noSwap";
  text: string;
  made: number;
  due: number;
  arg?: number;
  /** Set when settled: true kept, false broken. */
  kept?: boolean;
}

export interface Rumour {
  day: number;
  text: string;
  driverId?: string;
  teamId?: string;
  /** True rumours come from a real chat between camps; false ones are noise. */
  real: boolean;
  source: string;
}

export interface Rivalry {
  a: string;
  b: string;
  heat: number;
  lines: string[];
}

export interface RecordEntry {
  key: string;
  label: string;
  holder: string;
  value: number;
  year: number;
}

export interface OwnerState {
  name: string;
  /** 0..1 how much he trusts the project. */
  trust: number;
  /** A second objective set each year besides the board's results target. */
  goal: { kind: "young" | "budget" | "reliability" | "growth"; text: string; done: boolean | null; arg?: number };
}

export interface StoryState {
  /** Per event id: day last fired and how often. */
  last: Record<string, number>;
  count: Record<string, number>;
  /** Last day a big event fired. */
  bigDay: number;
  /** A pending media question, answered or not. */
  mediaDay: number;
  mediaCount: number;
  /** Tone the paddock sees the player in, -1 (ruthless) to 1 (loyal). */
  tone: number;
  arcs: Record<string, number>;
  /** Follow-ups to earlier choices, waiting for their day. */
  queue?: { day: number; id: string; data: Record<string, number | string | boolean> }[];
}

export interface LegacyEntry {
  year: number;
  text: string;
}

export interface CareerState {
  v: 1;
  /** Power unit and gearbox wear per driver, and grid drops waiting for the next race. */
  wear?: Record<string, DriverWear>;
  gridDrops?: Record<string, GridDrop[]>;
  seed: number;
  uid: number;
  difficulty: 0 | 1 | 2;
  teamId: string;
  /** Race length: full or half distance. */
  raceLength: "full" | "half" | "quick";
  day: number;
  year: number;
  /** Index into the season's race list of the next race. */
  round: number;
  /** The year's races as day numbers in order (filled when the season starts). */
  calendar: { round: number; circuitId: string; day: number; sprint: boolean }[];
  teams: Record<string, TeamState>;
  drivers: Record<string, DriverState>;
  staff: Record<string, Staff>;
  /** Everyone not under contract, ready to sign. */
  freeDrivers: string[];
  freeStaff: string[];
  /** Junior drivers who may enter F1 (pace, potential). */
  pool: JuniorState[];
  standings: Standings;
  history: SeasonRecord[];
  cards: Card[];
  ticker: TickerItem[];
  news: NewsItem[];
  /** What changed on the last Continue, shown as the recap strip. */
  recap: string[];
  weekend: WeekendState | null;
  /** Set once the player has been sacked. */
  fired: boolean;
  /** Prize money already paid out this season, per team. */
  prizePaid: Record<string, number>;
  rngN: number;
  /** Mark that stops the clock the next time. */
  stopReason: string;
  summerDone: boolean;
  /** The manager's weekly focus (Today screen). */
  focus?: { kind: import("./focus").FocusKind; since: number };
  /** Regulation eras. */
  era: EraState;
  /** The junior world and the player's academy. */
  academy: AcademyState;
  budgets: Budgets;
  spendLog: SpendEntry[];
  promises: PromiseItem[];
  rumours: Rumour[];
  rivalries: Rivalry[];
  records: Record<string, RecordEntry>;
  owner: OwnerState;
  story: StoryState;
  legacy: LegacyEntry[];
  /** Month of the last monthly pass, to keep it once a month. */
  lastMonth: number;
  /** Hall of fame lines (retired greats, champions). */
  hall: { year: number; name: string; text: string }[];
  brand: BrandState;
  rift: RiftState;
  press: PressState;
  /** Private conversations in progress or finished, newest last. */
  talks: Talk[];
  /** Agents, keyed by id. A driver's agent is worked out from his id. */
  managers: Record<string, Manager>;
  /** Multiplayer league only: every team a person runs. The AI leaves these alone. */
  humans?: string[];
  /** Multiplayer: this person's private news and ticker lines (the ones that say "you"). */
  privNews?: NewsItem[];
  privTicker?: TickerItem[];
  /** The player's programme for next season's car. */
  nextCar?: NextCarPlan;
  /** What the regulations really reward per trait (hidden truth, mean 1). */
  regW?: Record<Trait, number>;
  /** How much help the screens give: off shows only the facts, hints adds plain-language flags, full adds recommendations. Per person. */
  guidance?: Guidance;
  /** Why the board's confidence moved, newest first. */
  boardLog?: { day: number; delta: number; why: string }[];
  /** Messages that are not decisions: answers from private conversations and other news from people. */
  letters?: Letter[];
  /** Everything that happened worth remembering, newest last. */
  achievements?: import("./records").Achievement[];
  /** Titles waiting to be celebrated on screen. */
  ceremonies?: import("./records").Ceremony[];
  /** This season's clinched titles. */
  clinched?: { year?: number; wdc?: string; wcc?: string };
  /** Real conversations with drivers: what they said, what you answered. */
  convos?: import("./convo").Convo[];
  /** How much the player has found out about each driver (0..1). Own drivers are fully known. */
  driverKnow?: Record<string, number>;
  /** Set once the number one and number two roles have been read from the drivers' records (older saves had everyone equal). */
  rolesSeeded?: boolean;
  /** The team's setup notebook: the last setup run at each circuit, how many seconds it was off the best, and the year. */
  setupBook?: Record<string, { year: number; setup: SetupVec; loss: number }>;
  /** The paddock on social media: posts, live storylines and how the drivers' form reads (see social.ts). */
  social?: import("./social").SocialState;
  /** What last winter's programme did, shown at the test. */
  /** Each team's published name prefix and livery colour, shared by the whole league (see identity.ts). */
  identity?: Record<string, { prefix: string | null; color: number | null }>;
  /** Trainees on the market, as ids into `staff` (see hiring.ts). */
  internPool?: string[];
  /** Last season's final constructors' order, which sets this year's testing allowances. */
  prevOrder?: string[];
  /** The fact ledger (see facts.ts). */
  threads?: import("./threads").Thread[];
  chronicle?: import("./threads").Chronicle[];
  teller?: import("./threads").Teller;
  facts?: import("./facts").Fact[];
  nextCarLast?: { approach: NextCarPlan["approach"]; share: number; effort: number; note: string };
}

export interface Letter {
  id: number;
  day: number;
  from: string;
  role: string;
  subject: string;
  body: string;
  read: boolean;
}

export interface NextCarPlan {
  approach: "evolve" | "revolve" | "copy";
  /** Share of the design office working on next year's car, 0 to 1. */
  share: number;
  /** Work done so far. */
  points: number;
  /** The season it is for (the year the work happens in). */
  year: number;
  decided: boolean;
}

export interface JuniorState {
  id: string;
  name: string;
  code: string;
  nat: string;
  born: number;
  pace: number;
  potential: number;
  tyreMgmt: number;
  aggression: number;
  consistency: number;
  fictional: boolean;
  /** Owned by a team's academy (null is free). */
  owner?: string | null;
}

/** One line of a private conversation. */
export interface TalkLine {
  who: "you" | "them" | "press";
  text: string;
  day: number;
}

/** A private negotiation or conversation, played out over days. Replies are not instant. */
export interface Talk {
  id: number;
  kind: "driver" | "junior";
  targetId: string;
  /** sign: a new deal, extend: a new deal for one of your own, sound: only finding out whether he would listen. */
  topic: "sign" | "extend" | "sound";
  opened: number;
  /** open: your move. waiting: they will answer on replyOn. agreed: terms agreed, waiting for you to sign. closed: over. */
  status: "open" | "waiting" | "agreed" | "closed";
  replyOn?: number;
  /** The offer they are thinking about, the counter they made, and the terms they agreed. */
  pending?: Offer;
  counter?: Offer;
  agreed?: Offer;
  agreedUntil?: number;
  round: number;
  /** Who he would replace, chosen by you. null means a free seat. Undefined means you have not chosen. */
  replaces?: string | null;
  interest?: "keen" | "open" | "cool" | "cold";
  /** What matters most to him, once you have asked. */
  priority?: string;
  /** Each feeler can be put out once per set of talks. Asking again gets the same answer. */
  askedPriority?: boolean;
  soundedOut?: boolean;
  leaked?: boolean;
  /** The agent who speaks for him, if any. */
  manager?: string;
  lines: TalkLine[];
  /** They have said something the player has not opened yet. */
  unread?: boolean;
  /** Junior talks: the academy terms on the table. */
  junior?: { years: number; retainer: number; buyout: number; firstRefusal: boolean };
}

/** An agent who speaks for several drivers and juniors, and talks to every team. */
export interface Manager {
  id: string;
  name: string;
  style: "loyal" | "shark" | "quiet";
  /** How he feels about each team that deals with him, 0..1. Below 0.3 he stops taking calls for a while. */
  mood: Record<string, number>;
  coolUntil: Record<string, number>;
}

export type Action =
  | { type: "continue" }
  | { type: "day" }
  | { type: "markRead"; what: "card" | "talk" | "letter"; id: number }
  | { type: "huntSponsors"; mode: "cold" | "agency" | "personal" }
  | { type: "nextCar"; approach: NextCarPlan["approach"]; share: number }
  | { type: "autoTo"; day: number; max?: number }
  | { type: "swapPart"; driverId: string; part: PartKind }
  | { type: "enterWeekend" }
  | { type: "card"; id: number; option: string }
  | { type: "startProject"; ideaId: number }
  | { type: "scrapProject"; id: number }
  | { type: "testPart"; id: number; plan: "quick" | "compare" | "longrun" }
  | { type: "holdPart"; id: number; hold: boolean }
  | { type: "upgradeFacility"; which: keyof Omit<Facilities, "building"> }
  | { type: "delegate"; area: keyof Delegation; level: Level }
  | { type: "setFocus"; kind: import("./focus").FocusKind }
  | { type: "rndPlan"; focus?: RndPlan["focus"]; stance?: RndPlan["stance"] }
  | { type: "sign"; driverId: string; slot: 0 | 1; offer: Offer }
  | { type: "talkOpen"; kind: "driver" | "junior"; targetId: string }
  | { type: "talkSound"; id: number }
  | { type: "talkAsk"; id: number }
  | { type: "talkOffer"; id: number; offer: Offer; replaces?: string | null }
  | { type: "talkJuniorOffer"; id: number; years: number; retainer: number; buyout: number; firstRefusal: boolean }
  | { type: "talkSign"; id: number; replaces?: string | null }
  | { type: "talkClose"; id: number }
  | { type: "talkPrivate"; kind: "driver" | "junior" | "manager"; targetId: string; topic: string }
  | { type: "signStaff"; staffId: string; offerSalary: number; years: number; forDriverId?: string }
  | { type: "releaseStaff"; staffId: string }
  | { type: "signIntern"; staffId: string }
  | { type: "runLab"; inst: import("./lab").InstId; model: import("./design").Design }
  | { type: "setDesignNext"; model: import("./design").Design | null }
  | { type: "promoteIntern"; staffId: string }
  | { type: "extend"; driverId: string; offer: Offer }
  | { type: "promise"; driverId: string; kind: PromiseKind }
  | { type: "poachStaff"; staffId: string; offerSalary: number }
  | { type: "buyoutProspect"; id: string }
  | { type: "practiceRun"; programme: Programme; setup: SetupVec; driverId: string; fresh?: boolean; setId?: string }
  | { type: "setAlloc"; alloc: { S: number; M: number; H: number } }
  | { type: "setSetup"; setup: SetupVec; force?: boolean }
  | { type: "setTeller"; teller: import("./threads").Teller }
  | { type: "setTweak"; driverId: string; tweak: SetupVec }
  | { type: "recordSession"; kind: SessionKind; order: string[]; points: Record<string, number>; grid?: string[]; dnf: string[]; moods?: Record<string, { morale: number; trust: number; grievance: number; strat?: number }>; locks?: Record<string, "S" | "M" | "H">; used?: Record<string, Partial<Record<"S" | "M" | "H", number>>>; sets?: Record<string, import("../sim/tyreSets").TyreSet[]>; failed?: Record<string, PartKind>; fastest?: string; pit?: { stops: number; slow: number; best?: number }; radio?: { carId: string; tag: "bleep" | "refused" | "fatigue" | "over"; text: string }[]; duels?: { a: string; b: string; passes: number; contacts: number }[] }
  | { type: "endPractice" }
  | { type: "simWeekend" }
  | { type: "tutorialEra" }
  | { type: "simTo"; until: "quali" | "race" | "done" }
  | { type: "sponsor"; id: number; accept: boolean }
  | { type: "endSponsor"; id: number }
  | { type: "livery"; color: number | null }
  | { type: "step"; first?: boolean }
  | { type: "dismiss"; id: number }
  | { type: "setBudget"; key: keyof Budgets; value: number }
  | { type: "eraSplit"; value: number }
  | { type: "eraRoute"; route: number | null; hedge: number | null }
  | { type: "eraLab"; unknown: string }
  | { type: "eraVote"; moduleId: string; vote: 1 | -1 | 0 }
  | { type: "eraPersuade"; moduleId: string; teamId: string; dir: 1 | -1 }
  | { type: "eraTrade"; teamId: string; myModule: string; theirModule: string }
  | { type: "eraPackage"; pkg: "sprinter" | "marathoner" | "balanced" }
  | { type: "borrowTunnel" }
  | { type: "labToIdea"; entryId: number }
  | { type: "designPart"; area: Area; trait: Trait; kind: "safe" | "gamble" | "enabler"; lead?: string; size?: Size }
  | { type: "study"; trait: Trait; readings: number }
  | { type: "studyRegs"; trait: Trait; readings: number }
  | { type: "setConcept"; phil: Partial<Phil> }
  | { type: "setGuidance"; level: Guidance }
  | { type: "borrow"; amount: number }
  | { type: "repay"; amount: number }
  | { type: "shortlist"; id: string; on: boolean }
  | { type: "assignScout"; staffId: string; series: "kart" | "f4" | "f3" | "f2" }
  | { type: "trialDay"; id: string }
  | { type: "signProspect"; id: string; years: number; retainer: number; buyout: number; firstRefusal: boolean }
  | { type: "training"; id: string; focus: ("pace" | "racecraft" | "consistency" | "wet" | "mental")[] }
  | { type: "moveSeries"; id: string; series: "kart" | "f4" | "f3" | "f2" }
  | { type: "mentor"; id: string; driverId: string | null }
  | { type: "decide"; id: string; decision: "keep" | "loan" | "reserve" | "sell" | "release" }
  | { type: "rookie"; id: string | null }
  | { type: "promote"; id: string; slot: 0 | 1; salary: number; years: number }
  | { type: "setRole"; driverId: string; role: DriverRole }
  | { type: "meeting"; driverId: string }
  | { type: "ackCeremony" }
  | { type: "researchDriver"; driverId: string }
  | { type: "setCrew"; slot: number; memberId: string }
  | { type: "convoSay"; id: number; option: string }
  | { type: "convoClose"; id: number };

export type PromiseKind = PromiseItem["kind"];
export interface Offer {
  salary: number;
  years: number;
  role: DriverRole;
  /** A sweetener written into the talks. It becomes a tracked promise when he signs. */
  promise?: PromiseKind;
  /** A team option year on top of the term. The driver sees it as a cost. */
  option?: boolean;
  /** Pay is cut by a fifth in return for a bonus if he finishes top five. */
  perf?: boolean;
}

export type Programme = "setup" | "tyres" | "raceSim" | "qualiSim" | "part";
export const PROGRAMME_LABEL: Record<Programme, string> = {
  setup: "Setup: balance, downforce, gearing, brakes",
  tyres: "Tyre wear study",
  raceSim: "Race simulation",
  qualiSim: "Qualifying simulation",
  part: "Test the newest part",
};
