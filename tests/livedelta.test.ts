import { it, expect } from "vitest";
import { loadCircuit } from "../src/game/circuits";
import { buildEntries } from "../src/game/data";
import { QualiSim } from "../src/sim/qualifying";

it("live delta runs through the lap once a reference lap is set", () => {
  const { track } = loadCircuit("monza");
  const sim = new QualiSim({ seed: 12, track, entries: buildEntries("none") });
  for (const c of sim.cars) c.auto = true;
  sim.startSegment();
  let seen = 0;
  for (let n = 0; sim.phase === "running" && n < 60000; n++) {
    sim.step();
    for (const c of sim.cars) {
      const d = sim.liveDelta(c);
      if (d !== null) { seen++; expect(Math.abs(d)).toBeLessThan(30); }
    }
  }
  expect(seen).toBeGreaterThan(0);
});
