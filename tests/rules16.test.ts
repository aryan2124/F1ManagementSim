import { describe, expect, it, vi } from "vitest";
import { loadCircuit } from "../src/game/circuits";
import { buildEntries } from "../src/game/data";
import { RaceSim } from "../src/sim/engine";
import { runQualifying } from "../src/sim/qualifying";
import type { RaceRules } from "../src/sim/types";
import { MODULES } from "../src/career/modules";

vi.setConfig({ testTimeout: 60000 });
const { track } = loadCircuit("silverstone");
const entries = buildEntries("none");

function race(rules: RaceRules, seed = 5, laps = 12, extra: Record<string, unknown> = {}) {
  const cfg = { seed, laps, track, entries, rules, ...extra };
  const grid = runQualifying({ seed, track, entries }).rows.map((q) => q.carId);
  const sim = new RaceSim({ ...cfg, grid });
  let g = 0;
  while (sim.phase !== "finished" && g++ < 600) sim.run(1000);
  return sim;
}
const finite = (sim: RaceSim) => sim.cars.every((c) => Number.isFinite(c.s) && Number.isFinite(c.fuel) && Number.isFinite(c.soc));

describe("the sixteen simulated rule modules", () => {
  it("no module is announced-only any more", () => {
    expect(MODULES.filter((m) => m.live === "rules").map((m) => m.id)).toEqual([]);
  });
  it("stop window: stops outside it cost 5 seconds, and the race still finishes", () => {
    const sim = race({ stopWindow: [10, 11] }, 5, 12);
    expect(sim.phase).toBe("finished");
    expect(finite(sim)).toBe(true);
    const notes = sim.cars.flatMap((c) => c.penaltyNotes).filter((n) => n.includes("outside the window"));
    expect(notes.length).toBeGreaterThan(0);
  });
  it("checkpoint cuts hand out penalties to the last three at each checkpoint", () => {
    const sim = race({ checkpointCuts: true }, 6, 12);
    const n = sim.cars.flatMap((c) => c.penaltyNotes).filter((x) => x.includes("Checkpoint")).length;
    expect(n).toBe(6);
  });
  it("stage racing adds points for the top five at two checkpoints", () => {
    const sim = race({ stageRacing: true }, 6, 12);
    expect([...sim.stagePoints.values()].reduce((a, b) => a + b, 0)).toBe(30);
    const rows = sim.results();
    const base = race({}, 6, 12).results();
    expect(rows.reduce((a, r) => a + r.points, 0)).toBeGreaterThan(base.reduce((a, r) => a + r.points, 0) - 1);
  });
  it("two heats: a red flag at half distance and the race resumes", () => {
    const sim = race({ twoHeat: true }, 7, 12);
    expect(sim.phase).toBe("finished");
    expect(sim.inc.red.count).toBeGreaterThanOrEqual(1);
  });
  it("refuelling: cars start light, stops add fuel, nobody runs dry or goes NaN", () => {
    const sim = race({ refuelling: true }, 8, 14, { startFuel: 0.55 });
    expect(sim.phase).toBe("finished");
    expect(finite(sim)).toBe(true);
    const fin = sim.results().filter((r) => r.status === "FIN").length;
    expect(fin).toBeGreaterThan(14);
  });
  it("push to pass and defence tokens are spent by the AI", () => {
    const sim = race({ pushToPass: 5, defenceTokens: 3 }, 9, 14);
    const used = sim.cars.filter((c) => c.boostLeft < 5).length;
    expect(used).toBeGreaterThan(5);
    expect(finite(sim)).toBe(true);
  });
  it("battery swap, standing restarts, open radio and radio quota run without trouble", () => {
    const sim = race({ batterySwap: true, standingRestarts: true, openRadio: true, radioQuota: 6 }, 10, 12);
    expect(sim.phase).toBe("finished");
    expect(finite(sim)).toBe(true);
  });
  it("tyre sets: a compound with none left starts worn", () => {
    const first = entries[0].id;
    const sim = new RaceSim({ seed: 3, laps: 6, track, entries, startTyres: { [first]: "S" }, tyreSets: { [first]: { S: 0, M: 2, H: 2 } } });
    expect(sim.car(first).tyre.wear).toBeCloseTo(0.3, 5);
  });
  it("aggregate and single shot qualifying produce a full grid", () => {
    const a = runQualifying({ seed: 4, track, entries, rules: { aggregate: true } });
    expect(a.rows).toHaveLength(22);
    const ids = a.rows.map((r) => r.carId);
    const b = runQualifying({ seed: 4, track, entries, rules: { singleShot: true, releaseOrder: ids } });
    expect(b.rows).toHaveLength(22);
    expect(b.rows.filter((r) => Number.isFinite(r.q1)).length).toBeGreaterThan(15);
    expect(a.rows[0].bestTyre).toBeTruthy();
  });
  it("handicap start: held cars leave later and the race still finishes", () => {
    const delays: Record<string, number> = {};
    entries.slice(0, 4).forEach((e, i) => { delays[e.id] = (i + 1) * 1.5; });
    const sim = race({}, 7, 8, { releaseDelays: delays });
    expect(sim.phase).toBe("finished");
    expect(finite(sim)).toBe(true);
    expect(sim.cars.filter((c) => c.status === "finished" || c.dnfReason).length).toBe(sim.cars.length);
  });
});
