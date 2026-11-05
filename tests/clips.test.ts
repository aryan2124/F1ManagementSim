import { expect, it, vi } from "vitest";
import { loadCircuit } from "../src/game/circuits";
import { buildEntries } from "../src/game/data";
import { RaceSim } from "../src/sim/engine";
vi.setConfig({ testTimeout: 300000 });
it("films incidents with frames before and after", () => {
  const { track } = loadCircuit("monaco");
  let found = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const sim = new RaceSim({ seed, laps: 20, track, entries: buildEntries("none") });
    let g = 0;
    while (sim.phase !== "finished" && g++ < 800) sim.run(1000);
    for (const c of sim.clips.clips) {
      found++;
      expect(c.frames.length).toBeGreaterThan(3);
      expect(c.frames.some((f) => f.tick > c.tick)).toBe(true);
      expect(c.cars.length).toBeGreaterThan(0);
    }
  }
  expect(found).toBeGreaterThan(0);
});
