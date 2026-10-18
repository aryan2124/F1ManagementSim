import type { TyreSet } from "./tyreSets";
import type { Climate } from "./weather";
import type { TrackModel } from "./track";

/** S, M, H are the dry compounds; I is the intermediate and W the full wet. */
export type Compound = "S" | "M" | "H" | "I" | "W";
export const DRY_COMPOUNDS: Compound[] = ["S", "M", "H"];
export const WET_COMPOUNDS: Compound[] = ["I", "W"];
export const isWetCompound = (c: Compound) => c === "I" || c === "W";
export type EnergyMode = "harvest" | "balanced" | "attack";
export type PushLevel = 0 | 1 | 2; // conserve, standard, push
export type CarStatus = "grid" | "racing" | "pit_in" | "pit_stop" | "pit_out" | "dnf" | "finished";
export type RadioChannel = "control" | "team" | "rival" | "driver";
/** What a radio message really was. The player never sees this, rival AI strategists only guess at it. */
export type RadioTruth = "honest" | "hint" | "bluff" | "noise";

export interface DriverSpec {
  id: string;
  code: string; // 3 letters
  name: string;
  number: number;
  /** Nationality, 3-letter code. */
  nat?: string;
  /** Birth year. */
  born?: number;
  /** True for made-up drivers (only used once the real pool has run out). */
  fictional?: boolean;
  /** Raw speed multiplier, ~0.985 (slow) to 1.0 (great). */
  pace: number;
  /** 0..1, how well he gets away at the lights (0.5 is average). */
  launch?: number;
  /** 0..1 fuel saving: scales the burn rate (career attribute). */
  fuelSave?: number;
  /** 0..1, skill in the wet (0.5 is average). */
  wet?: number;
  /** How this driver talks, thinks and reacts. See game/personalities.ts. */
  psyche?: Psyche;
  /** 0..1, higher = gentler on tyres. */
  tyreMgmt: number;
  /** 0..1, higher = more overtakes attempted/defended hard. */
  aggression: number;
  /** 0..1, higher = fewer mistakes. */
  consistency: number;
}

/** Character traits, all 0..1, that drive radio lines, mood swings and how orders are received. */
export interface Psyche {
  /** Voice used for radio lines. */
  voice: "blunt" | "fire" | "sunny" | "analyst" | "elder" | "anxious";
  /** Needs to be the number one driver. */
  ego: number;
  /** Follows team orders without a fight. */
  obedience: number;
  /** How quickly emotions swing. */
  volatility: number;
  /** Tolerance for bad luck and slow cars. */
  patience: number;
  /** Banter and jokes on the radio. */
  humour: number;
  /** Trust in own judgement over the pit wall. */
  selfBelief: number;
  /** Cares about the team result over their own. */
  loyalty: number;
  /** How often they speak up without being asked. */
  talkative: number;
}

export interface TeamSpec {
  id: string;
  name: string;
  /** Official entrant name. */
  full?: string;
  short: string;
  engine?: string;
  country?: string;
  color: number; // 0xRRGGBB
  accent: number;
  /** 0.9..1: chassis/aero quality. */
  aero: number;
  /** 0.9..1: power unit quality. */
  power: number;
  /** 0.9..1: reliability. */
  reliability: number;
  /** 0..1 pit crew speed. */
  pitCrew: number;
  /** Chance any one stop goes wrong (default 0.04). */
  pitFumble?: number;
}

export interface EntrySpec {
  id: string; // car id (unique)
  driver: DriverSpec;
  team: TeamSpec;
  human: boolean;
  /** What is left of this car's power unit and gearbox (0..1). Absent means fresh. Worn units fail more often. */
  wear?: { pu: number; gb: number };
}

export interface RaceConfig {
  seed: number;
  laps: number;
  track: TrackModel;
  entries: EntrySpec[];
  /** Car ids, pole first. Defaults to entry order. */
  grid?: string[];
  startTyres?: Record<string, Compound>;
  /** Cars whose starting tyre is fixed by a rule (the qualifying tyre lock). A startTyre command cannot change them. */
  startLocks?: Record<string, Compound>;
  /** Start with this fuel fraction (qualifying uses low fuel). Default 1. */
  startFuel?: number;
  /** Handicap start: seconds a car is held at the line after the lights go out. */
  releaseDelays?: Record<string, number>;
  /** Disable random incidents (qualifying, tests). */
  noIncidents?: boolean;
  /** Tyre life in laps per compound. Defaults to a share of the race distance scaled by circuit severity. */
  tyreLife?: Record<Compound, number>;
  /** Circuit tyre severity (1 = average). Only used when tyreLife is not given. */
  tyreSeverity?: number;
  /** Enforce the rule that every finisher must use two different dry compounds. Default true. */
  twoCompoundRule?: boolean;
  /** Disable stewards (penalties) for tests. */
  noPenalties?: boolean;
  /** Weather for the session. Omitted means a dry, sunny day. */
  weather?: WeatherSpec;
  /** AI strategist skill: 0 rookie, 1 pro, 2 legend. Default 1. */
  difficulty?: 0 | 1 | 2;
  /** Switch off crashes, spins and mechanical failures but keep everything else (tests). */
  noCrashes?: boolean;
  /** Turn off the radio and mood system (faster tests). */
  noRadio?: boolean;
  /** Points by finishing position. Defaults to the Grand Prix scale (25, 18, 15...). A sprint uses 8 down to 1. */
  pointsTable?: number[];
  /** Per team override of the pit wall skill (0..1), used by the career layer so the head of strategy matters. */
  brainSkill?: Record<string, number>;
  /** Fresh tyre sets left per compound (human cars; keyed by team id when the pool rule shares them). A used set starts worn. */
  tyreSets?: Record<string, Partial<Record<Compound, number>>>;
  /** The physical sets each human car (or team, with the pool rule) has, with their wear. When given, it replaces the counts above. */
  tyreSetList?: Record<string, TyreSet[]>;
  /** Which set each human car starts the race on (otherwise the least worn of the chosen compound). */
  startSets?: Record<string, string>;
  /** What the log of a set records this session as (FP1, Q, RACE...). */
  sessionLabel?: string;
  /** Starting radio moods per car id (the career layer passes how each human driver really feels). */
  moods?: Record<string, { morale: number; trust: number; grievance: number; strat?: number }>;
  /** Career regulation modules that change how the race itself runs. */
  rules?: RaceRules;
  /** How much the player's team learnt in practice, 0..1 each. It sharpens the tyre-life estimate the pit wall shows and feeds the plan. */
  intel?: { tyre: number; race: number };
}

/** One completed lap of one car, kept for the post-race debrief. */
export interface LapRec {
  lap: number;
  pos: number;
  time: number;
  compound: Compound;
  /** True for an in or out lap, or a lap under a neutralisation: the time says little about pace. */
  slow: boolean;
  gap: number;
}

/** One pit stop, kept for the post-race debrief. */
export interface StopRec {
  carId: string;
  lap: number;
  /** Seconds the car stood still. */
  secs: number;
  from: Compound;
  to: Compound;
  posBefore: number;
}

export interface RaceRules {
  /** Every pit stop takes this many seconds, for everyone. */
  fixedStop?: number;
  /** A safety car is deployed at a fixed point of the race. */
  scheduledSC?: boolean;
  /** One dry compound for everyone. */
  oneCompound?: boolean;
  /** Each stint's tyre wear is multiplied by a luck factor. */
  tyreLottery?: boolean;
  /** One extra point for the most laps led. */
  lapLed?: boolean;
  /** One point for the fastest lap of a classified top ten finisher. */
  fastestLapPoint?: boolean;
  /** A stop made outside these laps (first, last) costs 5 seconds. */
  stopWindow?: [number, number];
  /** Boost tokens per driver (push to pass). */
  pushToPass?: number;
  /** Hard-defence tokens per driver. */
  defenceTokens?: number;
  /** The energy store can be swapped at a stop. */
  batterySwap?: boolean;
  /** Fuel is added at stops, at a capped flow. Pair with a low startFuel. */
  refuelling?: boolean;
  /** At one third and two thirds distance the last three cars take a 5 second penalty. */
  checkpointCuts?: boolean;
  /** Points at the end of the first two thirds of the race, 5 down to 1, for the top five. */
  stageRacing?: boolean;
  /** A red flag at half distance: free tyres, standing restart with the gaps wiped. */
  twoHeat?: boolean;
  /** Every safety car ends with a standing-start style restart. */
  standingRestarts?: boolean;
  /** Both cars share one pool of tyre sets. */
  tyrePool?: boolean;
  /** Radio is public: rivals hear your pit calls and you hear theirs. */
  openRadio?: boolean;
  /** Radio messages allowed per human car. */
  radioQuota?: number;
}

/** How a weekend's weather is generated. Everything derives from the seed. */
export interface WeatherSpec {
  seed: number;
  /** "off" is always dry and mild. */
  mode: "random" | "off";
  /** Qualifying and the race happen on different days with different weather from the same weekend mood. */
  session: "quali" | "race";
  /** What this circuit's weather is usually like. Defaults to a mild generic climate. */
  climate?: Climate;
}

export interface SectorTimes {
  last: [number, number, number];
  best: [number, number, number];
  /** 0 none, 1 yellow (slower than own best), 2 green (personal best), 3 purple (overall best) */
  color: [number, number, number];
}

export interface CarState {
  /** Handicap start: the tick this car is let go. */
  holdUntil?: number;
  id: string;
  entry: EntrySpec;
  status: CarStatus;
  /** Total distance along track in metres; start/finish line = 0, grid slots are negative. */
  s: number;
  v: number;
  lap: number; // completed laps
  lapStartTick: number;
  lastLap: number;
  bestLap: number;
  sectors: SectorTimes;
  sectorStartTick: number;
  tyre: { compound: Compound; wear: number; ageLaps: number };
  /** The physical set on the car, when the team has an inventory. */
  setId?: string;
  /** The set the player asked for at the next stop. */
  pitSetId?: string;
  fuel: number; // 0..1
  soc: number; // battery 0..1
  mode: EnergyMode;
  push: PushLevel;
  pitRequest: Compound | null;
  pitTimer: number;
  stops: number;
  /** Overtake in progress against this car id until overtakeUntil tick. */
  overtaking: string | null;
  overtakeUntil: number;
  /** Overtake failed while alongside: slow down, keep the lateral offset until clear. */
  yielding: boolean;
  cooldownUntil: number;
  lateral: number; // metres from racing line, positive = left of direction of travel; for rendering
  /** Seconds behind car ahead, measured via timing loops. */
  gapAhead: number;
  gapLeader: number;
  position: number;
  startPosition: number;
  finishTick: number;
  dnfReason: string;
  reaction: number;
  loops: Float64Array;
  loopCount: number;
  errorUntil: number;
  sectorIdx: number;
  aiPlan: number;
  /** Along-track offset of this team's pit box past the line, in metres. */
  boxOff: number;
  /** Dry compounds used so far this race (start tyre included). Rule: at least two different ones. */
  compoundsUsed: Compound[];
  /** Time penalties in seconds, added to the finishing time. */
  penalty: number;
  penaltyNotes: string[];
  /** Track-limit warnings (every third one is a 5 second penalty). */
  warnings: number;
  jumpStart: boolean;
  retireTick: number;
  /** Planned stop count for the AI (1 or 2) so it does not wander into a third. */
  aiStops: number;
  /** Water depth the car is driving through right now (0 dry .. 1 standing water). */
  wetD: number;
  /** Accumulated damage. aero and floor cost pace, flat is a flat spot, slow marks a puncture. */
  damage: { aero: number; floor: number; flat: number; puncture: boolean };
  /** An incident in progress: spin, off track, in the gravel, and so on. */
  incident: Incident | null;
  /** Visual spin angle in radians (0 when straight). */
  spin: number;
  /** Doing a slow lap to the pits under a red flag. */
  redStop: boolean;
  /** Best lap's sector times, for the timing screens. */
  bestLapSec: [number, number, number];
  /** Gap bookkeeping for the strategist: laps since last stop. */
  stintLaps: number;
  /** Tyre the car came in on and how long the stop is, set while it stands in the box (debrief only). */
  stopFrom?: Compound;
  stopSecs?: number;
  /** Seconds spent waiting behind a team-mate in the box (double stack). */
  stackWait?: number;
  stackAsked?: boolean;
  /** The last stop went wrong (over 4.6 s of crew work). */
  slowStop?: boolean;
  /** Retired car that the marshals have cleared away (drawn no more). */
  removed: boolean;
  /** Push to pass and defence tokens, and when each runs out. */
  boostLeft: number;
  boostUntil: number;
  defendLeft: number;
  defendUntil: number;
  /** Choices attached to the next stop. */
  pitSwap: boolean;
  pitFuel: "min" | "std" | "full";
  /** Radio messages left under a quota. */
  radioLeft: number;
  /** Restart window after a safety car, ticks. */
  restartUntil: number;
}

export type IncidentKind = "lockup" | "off" | "spin" | "gravel" | "wall" | "stall" | "puncture" | "collision";

export interface Incident {
  kind: IncidentKind;
  start: number;
  /** Tick at which the car is back under control (or retired if stuck). */
  until: number;
  /** Where it happened, metres along the lap. */
  at: number;
  /** Which side of the track the car ended up on (+1 left, -1 right). */
  side: 1 | -1;
  /** True if this incident ends the car's race. */
  terminal: boolean;
}

export type SimEventKind =
  | "lights"
  | "green"
  | "overtake"
  | "pit_in"
  | "pit_out"
  | "fastest_lap"
  | "lap"
  | "crash"
  | "failure"
  | "sc_deployed"
  | "sc_ending"
  | "sc_in"
  | "vsc"
  | "vsc_ending"
  | "vsc_in"
  | "penalty"
  | "warning"
  | "contact"
  | "rule"
  | "q_start"
  | "q_end"
  | "q_lap"
  | "q_purple"
  | "q_eliminated"
  | "q_deleted"
  | "q_red"
  | "q_green"
  | "q_chequered"
  | "q_mistake"
  | "q_impede"
  | "tyre_warning"
  | "finish"
  | "chequered"
  | "yellow"
  | "yellow_clear"
  | "spin"
  | "lockup"
  | "off_track"
  | "gravel"
  | "wall"
  | "damage"
  | "debris"
  | "red_flag"
  | "red_restart"
  | "weather"
  | "lightning"
  | "radio"
  | "prompt"
  | "order";

export interface SimEvent {
  tick: number;
  kind: SimEventKind;
  carId?: string;
  otherId?: string;
  text: string;
  /** Radio messages: which channel it was heard on. */
  channel?: RadioChannel;
  /** Radio messages from rival teams: what the message really was (hidden in the UI, used by AI listeners). */
  truth?: RadioTruth;
  /** Team id the message came from (rival feed). */
  team?: string;
}

export type Command =
  | { type: "pit"; carId: string; compound: Compound; setId?: string; swap?: boolean; fuel?: "min" | "std" | "full" }
  | { type: "boost"; carId: string }
  | { type: "defend"; carId: string }
  | { type: "cancelPit"; carId: string }
  | { type: "mode"; carId: string; mode: EnergyMode }
  | { type: "push"; carId: string; push: PushLevel }
  /** A team order to one of the player's cars. */
  | { type: "order"; carId: string; order: TeamOrder }
  /** Answer a driver's radio call (see Prompt). */
  | { type: "reply"; promptId: number; option: string }
  /** Send a decoy call on the open radio to mislead rivals. */
  | { type: "dummy"; carId: string }
  /** Online leagues: choose the starting tyre while the car is still on the grid before the lights. */
  | { type: "startTyre"; carId: string; compound: Compound; setId?: string };

export type TeamOrder = "hold" | "letby" | "free" | "pushnow" | "savetyres" | "stayout";

export interface LoggedCommand {
  tick: number;
  cmd: Command;
}

export type ResultStatus = "FIN" | "DNF" | "NC" | "DSQ";

export interface ResultRow {
  position: number;
  carId: string;
  laps: number;
  /** Finishing time including penalties, seconds. Infinity for non-finishers. */
  totalTime: number;
  /** Gap to the winner including penalties. */
  gap: number;
  bestLap: number;
  stops: number;
  dnf: boolean;
  dnfReason: string;
  points: number;
  status: ResultStatus;
  /** Seconds of penalty already included in totalTime. */
  penalty: number;
  penaltyNotes: string[];
  compoundsUsed: Compound[];
  /** Positions gained or lost against the grid (positive = gained). */
  delta: number;
}
