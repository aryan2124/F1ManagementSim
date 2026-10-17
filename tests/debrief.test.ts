import { describe, expect, it } from "vitest";
import { loadCircuit } from "../src/game/circuits";
import { buildEntries } from "../src/game/data";
import { RaceSim } from "../src/sim/engine";
import { runQualifying } from "../src/sim/qualifying";
import { buildDebrief } from "../src/game/debrief";
import { Director } from "../src/game/director";
import { liveSectorColors } from "../src/ui/sectorRows";

const { track } = loadCircuit("silverstone");
const entries = buildEntries("mer");

function run(seed: number, laps = 12) {
  const cfg = { seed, laps, track, entries };
  const { rows } = runQualifying(cfg);
  const sim = new RaceSim({ ...cfg, grid: rows.map((q) => q.carId) });
  let n = 0;
  while (sim.phase !== "finished" && n++ < 200000) sim.step();
  return sim;
}

describe("debrief", () => {
  it("records every lap and stop and builds a readable report", () => {
    const sim = run(11);
    const human = entries.filter((e) => e.human).map((e) => e.id);
    const db = buildDebrief(sim, human);
    expect(db.cars).toHaveLength(human.length);
    for (const c of db.cars) {
      expect(c.trace.length).toBeGreaterThan(5);
      expect(c.trace[0]).toBe(c.grid);
      expect(c.stints.length).toBe(c.stops.length + 1);
      expect(c.lessons.length).toBeGreaterThan(0);
      for (const l of c.lessons) expect(l).not.toMatch(/—/);
    }
    expect(db.insights.length).toBeGreaterThan(0);
    expect(sim.lapLog.size).toBeGreaterThan(10);
  });

  it("is the same twice", () => {
    const h = entries.filter((e) => e.human).map((e) => e.id);
    expect(JSON.stringify(buildDebrief(run(5, 8), h))).toBe(JSON.stringify(buildDebrief(run(5, 8), h)));
  });
});

describe("director", () => {
  it("cuts to a crash at once, holds a few seconds, and never leaves the grid empty", () => {
    const sim = run(3, 3);
    const d = new Director();
    const human = entries.filter((e) => e.human).map((e) => e.id);
    const first = d.pick(sim, human, 0, sim.order[0].id);
    expect(first).toBeTruthy();
    const victim = sim.order[7].id;
    d.note({ tick: 1, kind: "crash", carId: victim, text: "x" }, sim, human, 100);
    expect(d.pick(sim, human, 200, first)).toBe(victim);
    // within the hold it stays
    expect(d.pick(sim, human, 2000, victim)).toBe(victim);
    expect(d.caption).toMatch(/INCIDENT/);
  });
  it("does not cut faster than the dwell for an ordinary pass", () => {
    const sim = run(3, 3);
    const d = new Director();
    const human = entries.filter((e) => e.human).map((e) => e.id);
    const a = d.pick(sim, human, 0, sim.order[0].id);
    d.note({ tick: 1, kind: "overtake", carId: sim.order[2].id, otherId: sim.order[3].id, text: "p" }, sim, human, 500);
    expect(d.pick(sim, human, 1000, a)).toBe(a);
  });
});

describe("sector colours", () => {
  it("only the current holder stays purple", () => {
    const best: [number, number, number] = [30, 40, 25];
    expect(liveSectorColors([3, 3, 2], [31, 41, 26], [31, 41, 26], best)).toEqual([2, 2, 2]);
    expect(liveSectorColors([3, 3, 2], [31, 41, 26], [29, 45, 26], best)).toEqual([1, 2, 2]);
    expect(liveSectorColors([3, 3, 3], [30, 40, 25], [30, 40, 25], best)).toEqual([3, 3, 3]);
  });
});
