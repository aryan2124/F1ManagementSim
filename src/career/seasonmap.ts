import { fitMap } from "./fitmap";
import type { CareerState } from "./types";
import type { LedgerEntry } from "./ledger";

/**
 * The Season Map: one row a race. What the Fit Map promised, what the team got, and what it spent or decided on the way
 * there. Rows for races already run carry the hindsight: the edge the car had against the finish it earned.
 */
export interface SeasonRow {
  round: number;
  circuitId: string;
  gp: string;
  day: number;
  edge: number;
  raced: boolean;
  /** The best finish of the team's cars, 0 when not run. */
  best: number;
  /** A one-word reading of how the race went against what the car promised. */
  reading: "" | "above" | "as expected" | "below";
  events: LedgerEntry[];
}

export function seasonMap(s: CareerState): SeasonRow[] {
  const fit = fitMap(s, s.teamId);
  const ledger = (s.verdicts ?? []).filter((v) => v.year === s.year);
  const ids = Object.keys(s.teams);
  // the mean of the edges tells which finish a given edge should earn
  const sorted = [...fit].sort((a, b) => b.edge - a.edge);
  return s.calendar.map((c, i) => {
    const rec = s.standings.races.find((r) => r.round === c.round);
    const best = rec?.playerPos?.length ? Math.min(...rec.playerPos.filter((x) => x > 0)) : 0;
    const prevDay = i === 0 ? -Infinity : s.calendar[i - 1].day;
    const events = ledger.filter((v) => v.day > prevDay && v.day <= c.day).slice(0, 5);
    const edge = fit[i].edge;
    let reading: SeasonRow["reading"] = "";
    if (best > 0) {
      // a car in the top third of edges should finish near the front of the field
      const rank = sorted.findIndex((r) => r.round === c.round) / Math.max(1, sorted.length - 1);
      const base = standingBase(s, ids.length);
      const expected = base + (rank - 0.5) * -2 * (ids.length / 4);
      reading = best < expected - 1.5 ? "above" : best > expected + 1.5 ? "below" : "as expected";
    }
    return { round: c.round, circuitId: c.circuitId, gp: fit[i].gp, day: c.day, edge, raced: c.round < s.round, best, reading, events };
  });
}

/** Where the team usually lands: its constructors' rank, as a finishing place for its better car. */
function standingBase(s: CareerState, n: number): number {
  const order = Object.keys(s.teams).sort((a, b) => (s.standings.teams[b] ?? 0) - (s.standings.teams[a] ?? 0));
  const rank = order.indexOf(s.teamId);
  return Math.min(20, 1 + rank * (20 / Math.max(1, n)) * 1.0);
}
