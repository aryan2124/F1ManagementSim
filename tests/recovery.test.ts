import { describe, expect, it } from "vitest";
import { loadCircuit } from "../src/game/circuits";
import { buildEntries } from "../src/game/data";
import { RaceSim } from "../src/sim/engine";
import { runQualifying } from "../src/sim/qualifying";
import { STAGES } from "../src/sim/recovery";

function race(seed: number, id = "silverstone", laps = 14) {
  const { track } = loadCircuit(id);
  const cfg = { seed, laps, track, entries: buildEntries("none") };
  const { rows } = runQualifying(cfg);
  return new RaceSim({ ...cfg, grid: rows.map((q) => q.carId) });
}

describe("crashes, debris and recovery", () => {
  it("every stopped car gets a crew that goes through the stages in order and clears it, and no safety car ends over open work", () => {
    let recs = 0;
    let poses = new Set<string>();
    let methods = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const sim = race(seed * 7 + 1, seed % 2 ? "silverstone" : "albert-park");
      const seen = new Map<number, number>();
      let busyEnd = 0;
      for (let i = 0; i < 60000 && sim.phase !== "finished"; i++) {
        const wasActive = sim.neutral.active;
        sim.step();
        for (const r of sim.inc.rec.recoveries) {
          const idx = STAGES.indexOf(r.stage);
          expect(idx).toBeGreaterThanOrEqual(seen.get(r.id) ?? 0);
          seen.set(r.id, idx);
        }
        if (wasActive && !sim.neutral.active && sim.inc.rec.active().length > 0 && !sim.inc.red.active) busyEnd++;
      }
      expect(busyEnd).toBe(0);
      for (const r of sim.inc.rec.recoveries) {
        recs++;
        poses.add(r.pose);
        methods.add(r.method);
        const car = sim.car(r.carId);
        if (r.stage === "done") expect(car.removed).toBe(true);
      }
      // every car that stopped on the circuit is eventually cleared, unless the race ended first
      for (const c of sim.cars) if (c.status === "dnf" && !c.removed) expect(sim.tick - c.retireTick).toBeLessThan(6000);
    }
    expect(recs).toBeGreaterThan(5);
    console.log("recoveries", recs, [...poses], [...methods]);
  }, 240000);

  it("is deterministic: the same seed gives the same crashes", () => {
    const run = () => {
      const sim = race(11);
      sim.run(30000);
      return JSON.stringify([sim.inc.rec.recoveries.map((r) => [r.carId, r.pose, r.method, r.estimate]), sim.inc.rec.debris.length]);
    };
    expect(run()).toBe(run());
  });
});
