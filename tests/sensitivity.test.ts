import { describe, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { loadCircuit } from "../src/game/circuits";
import { buildEntries } from "../src/game/data";
import { RaceSim } from "../src/sim/engine";
import { runQualifying } from "../src/sim/qualifying";

vi.setConfig({ testTimeout: 600000 });
const { track } = loadCircuit("silverstone");
const entries = buildEntries("none");

/** Measurement, not a pass/fail test: how much does each pace level move a mid-field car? Run with SENS=1. */
function run(seed: number, level: 0 | 1 | 2 | 3 | 4, laps = 20) {
  const grid = runQualifying({ seed, track, entries }).rows.map((q) => q.carId);
  const sim = new RaceSim({ seed, laps, track, entries, grid, rules: {} });
  const id = grid[10];
  let g = 0;
  while (sim.phase !== "finished" && g++ < 3000) {
    for (const c of sim.cars) if (c.id === id && c.status === "racing") c.push = level <= 2 ? (level as 0 | 1 | 2) : level === 3 ? (c.lap >= laps - 4 ? 2 : 1) : c.lap < laps / 2 ? 0 : 2;
    sim.run(100);
  }
  const rows = sim.results();
  const i = rows.findIndex((r) => r.carId === id);
  return { pos: i + 1, wear: sim.cars.find((c) => c.id === id)!.tyre.wear };
}

describe.skipIf(!process.env.SENS)("pace sensitivity", () => {
  it("measures", () => {
    const out: string[] = [];
    for (const level of [0, 1, 2, 3, 4] as const) {
      const ps: number[] = [];
      for (let seed = 1; seed <= 8; seed++) ps.push(run(seed, level).pos);
      out.push(`level ${level}: mean finish ${(ps.reduce((a, b) => a + b, 0) / ps.length).toFixed(2)} (${ps.join(",")})`);
    }
    writeFileSync("/tmp/sens.txt", out.join("\n"));
  });
});
