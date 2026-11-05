import { describe, expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { loadCircuit } from "../src/game/circuits";
import { buildEntries } from "../src/game/data";
import { RaceSim } from "../src/sim/engine";
import { runQualifying } from "../src/sim/qualifying";
import type { RaceRules } from "../src/sim/types";

vi.setConfig({ testTimeout: 900000 });
const { track } = loadCircuit("silverstone");
const entries = buildEntries("none");

/** The Feel Index: same races with and without a rule, compared on six measures the engine exposes. A rule feels different
 *  when it moves most measures by more than a tenth. Run with FEEL=1; the table goes to /tmp/feel.txt. */
export interface Measures { overtakes: number; stops: number; wearMean: number; shuffle: number; retired: number; spread: number }
export function measure(rules: RaceRules, seeds: number[], laps = 12): Measures {
  const acc: Measures = { overtakes: 0, stops: 0, wearMean: 0, shuffle: 0, retired: 0, spread: 0 };
  for (const seed of seeds) {
    const grid = runQualifying({ seed, track, entries }).rows.map((q) => q.carId);
    const sim = new RaceSim({ seed, laps, track, entries, grid, rules });
    let g = 0;
    while (sim.phase !== "finished" && g++ < 600) sim.run(1000);
    const rows = sim.results();
    acc.overtakes += sim.keyEvents.filter((e) => e.kind === "overtake").length;
    acc.stops += sim.stopLog.length;
    acc.wearMean += sim.cars.reduce((a, c) => a + c.tyre.wear, 0) / sim.cars.length;
    acc.shuffle += rows.reduce((a, r, i) => a + Math.abs(grid.indexOf(r.carId) - i), 0) / rows.length;
    acc.retired += rows.filter((r) => r.dnf).length;
    const times = rows.filter((r) => !r.dnf).map((r) => (r as unknown as { time?: number }).time ?? 0);
    const mean = times.reduce((a, b) => a + b, 0) / Math.max(1, times.length);
    acc.spread += Math.sqrt(times.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, times.length));
  }
  for (const k of Object.keys(acc) as (keyof Measures)[]) acc[k] /= seeds.length;
  return acc;
}
export const feelIndex = (a: Measures, b: Measures) => {
  const keys = Object.keys(a) as (keyof Measures)[];
  const moved = keys.filter((k) => Math.abs(b[k] - a[k]) > 0.1 * Math.max(0.5, Math.abs(a[k])));
  return { moved, share: moved.length / keys.length };
};

describe("feel index helper", () => {
  it("counts a measure as moved when it changes by more than a tenth", () => {
    const a = { overtakes: 10, stops: 20, wearMean: 0.5, shuffle: 3, retired: 1, spread: 5 };
    expect(feelIndex(a, a).share).toBe(0);
    expect(feelIndex(a, { ...a, overtakes: 14, stops: 30 }).moved).toEqual(["overtakes", "stops"]);
  });
});

describe.skipIf(!process.env.FEEL)("feel index of the sim-live rules", () => {
  it("measures", () => {
    const seeds = [1, 2, 3, 4, 5, 6];
    const base = measure({}, seeds);
    const sets: Record<string, RaceRules> = {
      pushToPass: { pushToPass: 5 }, twoHeat: { twoHeat: true }, refuelling: { refuelling: true }, stopWindow: { stopWindow: [4, 8] },
      stageRacing: { stageRacing: true }, standingRestarts: { standingRestarts: true }, batterySwap: { batterySwap: true },
    };
    const out = ["base " + JSON.stringify(base)];
    for (const [k, r] of Object.entries(sets)) {
      const m = measure(r, seeds);
      const f = feelIndex(base, m);
      out.push(`${k}: ${(f.share * 100).toFixed(0)}% moved: ${f.moved.join(",")}`);
    }
    writeFileSync("/tmp/feel.txt", out.join("\n"));
  });
});
