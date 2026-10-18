import { buildEntries, TEAMS } from "./data";
import { loadCircuit, scheduledLaps, type CircuitMeta } from "./circuits";
import { QualiSession } from "./qsession";
import { runQualifying, type QualiRow } from "../sim/qualifying";
import { Rng } from "../sim/rng";
import { BRAINS, DEFAULT_BRAIN } from "../sim/strategy";
import type { TrackModel } from "../sim/track";
import type { Compound, EntrySpec, RaceConfig, WeatherSpec } from "../sim/types";
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
    tyreSeverity: w.meta.tyreSeverity,
    weather: raceWeather(w.settings),
    difficulty: w.settings.difficulty ?? 1,
  };
}

export function teamById(id: string) {
  return TEAMS.find((t) => t.id === id) ?? TEAMS[0];
}
