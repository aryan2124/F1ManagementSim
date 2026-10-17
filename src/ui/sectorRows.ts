import type { LiveSim } from "../game/live";
import type { CarState } from "../sim/types";
import type { QCar, QualiSim } from "../sim/qualifying";
import { RaceSim } from "../sim/engine";
import { hex } from "./colors";

export interface SessionRow {
  id: string;
  code: string;
  color: string;
  position: number;
  human: boolean;
  out: boolean;
  last: [number, number, number];
  bestSecs: [number, number, number];
  colors: [number, number, number];
  lapLast: number;
  lapBest: number;
}

/**
 * The colour a sector box shows right now. A purple stored when the time was set only stays purple while it is still the best of everyone:
 * once someone goes faster, the earlier holder drops to green (their own best) or yellow, so only one car holds purple on a sector.
 */
export function liveSectorColors(
  stored: ArrayLike<number>,
  last: ArrayLike<number>,
  personalBest: ArrayLike<number>,
  best: ArrayLike<number>,
): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const c = stored[k] ?? 0;
    if (c === 3 && !(last[k] <= best[k] + 1e-6)) out[k] = last[k] <= personalBest[k] + 1e-6 ? 2 : 1;
    else out[k] = c;
  }
  return out;
}

/** One row per driver, whatever the session. */
export function sessionRows(sim: LiveSim): { rows: SessionRow[]; best: [number, number, number] } {
  if (sim instanceof RaceSim) {
    const rows = sim.order.map((c: CarState): SessionRow => ({
      id: c.id,
      code: c.entry.driver.code,
      color: hex(c.entry.team.color),
      position: c.position,
      human: c.entry.human,
      out: c.status === "dnf",
      last: c.sectors.last,
      bestSecs: c.bestLapSec,
      colors: liveSectorColors(c.sectors.color, c.sectors.last, c.sectors.best, sim.bestSector),
      lapLast: c.lastLap,
      lapBest: c.bestLap,
    }));
    return { rows, best: sim.bestSector };
  }
  const q = sim as unknown as QualiSim;
  const seg = q.segment - 1;
  const rows = q.order.map((c: QCar): SessionRow => ({
    id: c.id,
    code: c.entry.driver.code,
    color: hex(c.entry.team.color),
    position: c.position,
    human: c.entry.human,
    out: c.eliminatedIn !== 0 && c.eliminatedIn < q.segment,
    last: c.sectors.last,
    bestSecs: c.sectors.best,
    colors: liveSectorColors(c.sectors.color, c.sectors.last, c.sectors.best, q.bestSector),
    lapLast: c.lastLap,
    lapBest: c.best[seg],
  }));
  return { rows, best: q.bestSector };
}
