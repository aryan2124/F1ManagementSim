import { buildEntries, TEAMS } from "./data";
import { loadCircuit, scheduledLaps, type CircuitMeta } from "./circuits";
import { QualiSession } from "./qsession";
import { runQualifying, type QualiRow } from "../sim/qualifying";
import { Rng } from "../sim/rng";
import { BRAINS, DEFAULT_BRAIN } from "../sim/strategy";
import type { TrackModel } from "../sim/track";
import type { Compound, EntrySpec, RaceConfig, RaceRules, WeatherSpec } from "../sim/types";
import { bestCompoundFor, makeWeather, targetWetness } from "../sim/weather";
import { circuitHash, climateFor } from "./climate";

export type Distance = "full" | "half" | "sprint" | "quick";

export const DISTANCES: { id: Distance; label: string; note: string }[] = [
  { id: "full", label: "Full distance", note: "The real race length, a little over 305 km" },
  { id: "half", label: "Half distance", note: "About 150 km. Same strategy shape, less waiting" },
  { id: "sprint", label: "Sprint, 100 km", note: "A short, flat out race" },
  { id: "quick", label: "Quick, 10 laps", note: "Fast to try out" },
];

export interface WeekendSettings {
  teamId: string;
  circuitId: string;
  distance: Distance;
  seed: number;
  /** Weather: random (default) or off. */
  weather?: "random" | "off";
  /** AI strategy strength, 0 easy, 1 normal, 2 hard. */
  difficulty?: 0 | 1 | 2;
  /** Test weekends: only these drivers start (all of them when missing). */
  field?: string[];
  /** Regulation tweaks for a test weekend, by id (see REG_OPTIONS). None means the standard rules. */
  regs?: string[];
}

/** Rules a quick weekend can switch on, mirroring the career regulation modules the race engine simulates. */
export const REG_OPTIONS: { id: string; label: string; note: string }[] = [
  { id: "fixedStop", label: "FIXED 3.0 s STOPS", note: "Every pit stop takes exactly 3.0 seconds for everyone, so pit crew skill stops mattering." },
  { id: "oneCompound", label: "ONE TYRE FOR ALL", note: "Everyone uses the same dry compound and no second compound is required." },
  { id: "tyreSev", label: "TYRES WEAR 50% FASTER", note: "Tyre wear is multiplied by 1.5, which forces more stops." },
  { id: "tyreLottery", label: "TYRE LOTTERY", note: "Each stint's wear gets a random luck factor." },
  { id: "scheduledSC", label: "SCHEDULED SAFETY CAR", note: "A safety car comes out at a fixed point of the race." },
  { id: "standingRestarts", label: "STANDING RESTARTS", note: "Every safety car ends with a standing start." },
  { id: "pushToPass", label: "PUSH TO PASS", note: "Three boost tokens per driver." },
  { id: "attackZones", label: "ATTACK ZONES", note: "Three boost tokens, but boost only works inside the marked zones on the long straights." },
  { id: "defenceTokens", label: "DEFENCE TOKENS", note: "Three hard-defence tokens per driver." },
  { id: "batterySwap", label: "BATTERY SWAP", note: "Swap the battery at a stop for 1.8 extra seconds and a full charge." },
  { id: "refuelling", label: "REFUELLING", note: "Start on a light fuel load and add fuel at stops." },
  { id: "stopWindow", label: "PIT WINDOW", note: "A stop made outside the allowed laps costs 5 seconds." },
  { id: "checkpointCuts", label: "CHECKPOINT CUTS", note: "At one third and two thirds distance the last three cars take a 5 second penalty." },
  { id: "stageRacing", label: "STAGE POINTS", note: "Points for the top five at two thirds distance." },
  { id: "twoHeat", label: "TWO HEATS", note: "Red flag at half distance: free tyres and a standing restart with the gaps wiped." },
  { id: "openRadio", label: "OPEN RADIO", note: "Rivals hear your pit calls and you hear theirs." },
  { id: "lapLed", label: "POINT FOR MOST LAPS LED", note: "One extra point for the most laps led." },
  { id: "fastestLapPoint", label: "FASTEST LAP POINT", note: "One point for the fastest lap of a classified top ten finisher." },
];

/** What the chosen regulation tweaks do to the race config. */
export function regConfig(regs: string[] | undefined, laps: number, seed: number): Partial<RaceConfig> {
  const on = new Set(regs ?? []);
  if (!on.size) return {};
  const rules: RaceRules = {};
  if (on.has("fixedStop")) rules.fixedStop = 3.0;
  if (on.has("oneCompound")) rules.oneCompound = true;
  if (on.has("tyreLottery")) rules.tyreLottery = true;
  if (on.has("scheduledSC")) rules.scheduledSC = true;
  if (on.has("standingRestarts")) rules.standingRestarts = true;
  if (on.has("pushToPass")) rules.pushToPass = 3;
  if (on.has("attackZones")) { rules.pushToPass = 3; rules.attackZones = true; }
  if (on.has("defenceTokens")) rules.defenceTokens = 3;
  if (on.has("batterySwap")) rules.batterySwap = true;
  if (on.has("refuelling")) rules.refuelling = true;
  if (on.has("checkpointCuts")) rules.checkpointCuts = true;
  if (on.has("stageRacing")) rules.stageRacing = true;
  if (on.has("twoHeat")) rules.twoHeat = true;
  if (on.has("openRadio")) rules.openRadio = true;
  if (on.has("lapLed")) rules.lapLed = true;
  if (on.has("fastestLapPoint")) rules.fastestLapPoint = true;
  if (on.has("stopWindow") && laps >= 8) {
    const r = new Rng(seed + 303).next();
    const a = Math.max(2, Math.round(laps * (0.2 + 0.12 * r)));
    rules.stopWindow = [a, Math.min(laps - 2, a + Math.round(laps * 0.38))];
  }
  return {
    rules,
    ...(on.has("oneCompound") ? { twoCompoundRule: false } : {}),
    ...(on.has("refuelling") ? { startFuel: 0.55 } : {}),
  };
}

export function qualiWeather(s: WeekendSettings): WeatherSpec {
  return { seed: s.seed * 7 + 1 + circuitHash(s.circuitId), mode: s.weather ?? "random", session: "quali", climate: climateFor(s.circuitId) };
}

export function raceWeather(s: WeekendSettings): WeatherSpec {
  return { seed: s.seed * 7 + 2 + circuitHash(s.circuitId), mode: s.weather ?? "random", session: "race", climate: climateFor(s.circuitId) };
}

export interface Weekend {
  settings: WeekendSettings;
  meta: CircuitMeta;
  track: TrackModel;
  entries: EntrySpec[];
  humanIds: string[];
  laps: number;
  aiTyres: Record<string, Compound>;
}

export function lapsFor(meta: CircuitMeta, track: TrackModel, distance: Distance): number {
  const full = scheduledLaps(meta);
  switch (distance) {
    case "full":
      return full;
    case "half":
      return Math.max(5, Math.round(full / 2));
    case "sprint":
      return Math.max(5, Math.ceil(100000 / track.length));
    case "quick":
      return 10;
  }
}

export function createWeekend(settings: WeekendSettings): Weekend {
  const { meta, track } = loadCircuit(settings.circuitId);
  const entries = buildEntries(settings.teamId, settings.field);
  const laps = lapsFor(meta, track, settings.distance);
  const rng = new Rng(settings.seed + 77);
  const aiTyres: Record<string, Compound> = {};
  const rw = raceWeather(settings);
  const w0 = rw.mode === "off" ? 0 : targetWetness(makeWeather(rw, 60).rainAt(0));
  for (const e of entries) {
    if (e.human) continue;
    const r = rng.next();
    const bold = (BRAINS[e.team.id] ?? DEFAULT_BRAIN).boldness;
    const pS = 0.1 + 0.4 * bold;
    aiTyres[e.id] = laps <= 12 ? (r < 0.5 ? "S" : "M") : r < pS ? "S" : r < 0.88 - 0.12 * (bold - 0.5) ? "M" : "H";
    if (w0 > 0.08) {
      const bias = (rng.next() - 0.5) * 0.12;
      aiTyres[e.id] = bestCompoundFor(w0 + bias, false);
    }
  }
  const humanIds = entries.filter((e) => e.human).map((e) => e.id);
  return { settings, meta, track, entries, humanIds, laps, aiTyres };
}

/** The live, playable qualifying session for this weekend. */
export function createQualiSession(w: Weekend): QualiSession {
  return new QualiSession({ seed: w.settings.seed, track: w.track, entries: w.entries, weather: qualiWeather(w.settings) }, w.humanIds);
}

/** Qualifying decided without playing it (the AI runs every car). */
export function simulateQualifying(w: Weekend): QualiRow[] {
  return runQualifying({ seed: w.settings.seed, track: w.track, entries: w.entries, weather: qualiWeather(w.settings) }).rows;
}

export function raceConfigFrom(w: Weekend, quali: QualiRow[], humanTyres: Record<string, Compound>): RaceConfig {
  return {
    seed: w.settings.seed,
    laps: w.laps,
    track: w.track,
    entries: w.entries,
    grid: quali.map((q) => q.carId),
    startTyres: { ...w.aiTyres, ...humanTyres },
    tyreSeverity: w.meta.tyreSeverity * (w.settings.regs?.includes("tyreSev") ? 1.5 : 1),
    weather: raceWeather(w.settings),
    difficulty: w.settings.difficulty ?? 1,
    // a sprint pays points to the top eight only and needs no second compound
    ...(w.settings.distance === "sprint" ? { pointsTable: [8, 7, 6, 5, 4, 3, 2, 1], twoCompoundRule: false } : {}),
    ...regConfig(w.settings.regs, w.laps, w.settings.seed),
  };
}

export function teamById(id: string) {
  return TEAMS.find((t) => t.id === id) ?? TEAMS[0];
}
