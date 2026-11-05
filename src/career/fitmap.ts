import { carSpec } from "./car";
import { CFG } from "./config";
import { circuitMeta } from "../game/circuits";
import { trackNeed } from "./traits";
import type { CareerState } from "./types";

/**
 * The Fit Map: for every race on the calendar, what your car gains or loses against the average car there, in seconds a lap,
 * with a range that narrows as real track data arrives (races run this season). It reads the same track needs and trait
 * weights the clock uses, so the map can never disagree with the racing.
 */
export interface FitRow {
  round: number;
  circuitId: string;
  gp: string;
  /** Seconds a lap against the field average at this circuit; positive is quicker. */
  edge: number;
  low: number;
  high: number;
  /** The circuit's lean: negative wants straight-line speed, positive wants downforce. */
  df: number;
  /** Tyre severity (1 is normal). */
  sev: number;
  raced: boolean;
}

/** Lap-time worth of a team's spec, as the rating the game already uses. */
const worth = (s: CareerState, teamId: string, circuitId: string, ks?: string[]) => {
  const spec = carSpec(s, teamId, circuitId, ks);
  return (spec.aero - 0.98) / CFG.specPerSecAero * 0.55 + (spec.power - 0.98) / CFG.specPerSecPower * 0.45;
};

/** `ghost` is a hypothetical set of keystones for your own car: the map then shows the car as it would be. */
export function fitMap(s: CareerState, teamId: string, ghost?: string[]): FitRow[] {
  const ids = Object.keys(s.teams);
  const run = Math.max(0, Math.min(s.round, s.calendar.length));
  // before any race the picture is blurry; every race run sharpens it
  const sigma = 0.3 / (1 + 0.15 * run);
  return s.calendar.map((c) => {
    const mine = worth(s, teamId, c.circuitId, ghost);
    const avg = ids.reduce((a, id) => a + worth(s, id, c.circuitId, id === teamId ? ghost : undefined), 0) / ids.length;
    const edge = Math.round((mine - avg) * 1000) / 1000;
    const need = trackNeed(c.circuitId);
    return {
      round: c.round,
      circuitId: c.circuitId,
      gp: circuitMeta(c.circuitId).gp,
      edge,
      low: Math.round((edge - sigma) * 1000) / 1000,
      high: Math.round((edge + sigma) * 1000) / 1000,
      df: need.df,
      sev: need.sev,
      raced: c.round < s.round,
    };
  });
}

/** The three tracks that suit the car best and the three that suit it worst, in plain words. */
export function fitSummary(rows: FitRow[]): { best: FitRow[]; worst: FitRow[]; covered: number } {
  const sorted = [...rows].sort((a, b) => b.edge - a.edge);
  return { best: sorted.slice(0, 3), worst: sorted.slice(-3).reverse(), covered: rows.filter((r) => r.edge > 0).length };
}
