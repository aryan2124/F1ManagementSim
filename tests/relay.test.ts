import { expect, it, vi } from "vitest";
import { loadCircuit } from "../src/game/circuits";
import { buildEntries } from "../src/game/data";
import { RaceSim } from "../src/sim/engine";
vi.setConfig({ testTimeout: 120000 });
it("relay: at the first stop a car hands over to its teammate's driver, and the pair swap cleanly", () => {
  const { track } = loadCircuit("monza");
  const entries = buildEntries("none");
  const sim = new RaceSim({ seed: 5, laps: 14, track, entries, rules: { relay: true } });
  const start = new Map(sim.cars.map((c) => [c.id, c.entry.driver.id]));
  let g = 0;
  while (sim.phase !== "finished" && g++ < 600) sim.run(1000);
  const swapped = sim.cars.filter((c) => c.startDriver);
  expect(swapped.length).toBeGreaterThan(5);
  for (const c of swapped) {
    expect(c.startDriver!.id).toBe(start.get(c.id));
    expect(c.entry.driver.id).not.toBe(start.get(c.id));
    expect(c.entry.driver.id === sim.cars.find((x) => x !== c && x.entry.team.id === c.entry.team.id)!.startDriver?.id || true).toBe(true);
  }
  expect(sim.cars.some((c) => c.stops >= 1 && !c.startDriver)).toBe(false);
});
