import { RaceSim } from "./engine";
import type { Command, LoggedCommand, RaceConfig, ResultRow } from "./types";

/** A branch of the race: from a given tick, these commands go in on top of what was really done. */
export interface Fork {
  name: string;
  /** Tick the branch leaves the real race. Commands the player really gave from then on are dropped. */
  fromTick: number;
  cmds: Command[];
}

export interface ForkResult {
  name: string;
  rows: ResultRow[];
  /** Finishing place of each car asked about (0 when it did not finish). */
  places: Record<string, number>;
}

/** Plays the race again from the start under the same seed, with the real commands, then the branch's commands. */
export function replayFork(cfg: RaceConfig, log: LoggedCommand[], fork: Fork | null, carIds: string[]): ForkResult {
  const sim = new RaceSim(cfg);
  const real = [...log].sort((a, b) => a.tick - b.tick);
  let i = 0;
  let guard = 0;
  while (sim.phase !== "finished" && guard++ < 400000) {
    while (i < real.length && real[i].tick <= sim.tick) {
      const lc = real[i++];
      if (fork && lc.tick >= fork.fromTick) continue;
      sim.command(lc.cmd, false);
    }
    if (fork && sim.tick === fork.fromTick) for (const c of fork.cmds) sim.command(c, false);
    sim.run(1);
  }
  const rows = sim.results();
  const places: Record<string, number> = {};
  for (const id of carIds) places[id] = rows.find((r) => r.carId === id && !r.dnf)?.position ?? 0;
  return { name: fork?.name ?? "As it happened", rows, places };
}

/** The real race and each branch side by side. */
export function forkRace(cfg: RaceConfig, log: LoggedCommand[], forks: Fork[], carIds: string[]): ForkResult[] {
  return [replayFork(cfg, log, null, carIds), ...forks.map((f) => replayFork(cfg, log, f, carIds))];
}
