import { describe, expect, it } from "vitest";
import { minSelfClearance } from "../src/sim/track";
import { loadCircuit } from "../src/game/circuits";
import { buildEntries } from "../src/game/data";
import { RaceSim, fmtLap } from "../src/sim/engine";
import { runQualifying } from "../src/sim/qualifying";

const { track } = loadCircuit("silverstone");
const entries = buildEntries("none"); // all 22 cars run by the team AI

function makeRace(seed: number, laps = 8) {
  const cfg = { seed, laps, track, entries };
  const { rows } = runQualifying(cfg);
  return new RaceSim({ ...cfg, grid: rows.map((q) => q.carId) });
}

describe("track", () => {
  it("is the real Silverstone: sane length, lap time and clearance", () => {
    expect(track.length).toBeGreaterThan(5700);
    expect(track.length).toBeLessThan(6100);
    expect(track.nominalLap).toBeGreaterThan(80);
    expect(track.nominalLap).toBeLessThan(92);
    expect(minSelfClearance(track)).toBeGreaterThan(40);
  });
});

describe("qualifying", () => {
  it("orders the grid by pace, reproducibly, with the Q1/Q2 cuts", () => {
    const cfg = { seed: 7, track, entries };
    const a = runQualifying(cfg);
    const b = runQualifying(cfg);
    expect(a.rows).toEqual(b.rows);
    expect(a.rows).toHaveLength(22);
    expect(new Set(a.rows.map((r) => r.carId)).size).toBe(22);
    expect(a.rows.filter((r) => r.out === 1)).toHaveLength(6);
    expect(a.rows.filter((r) => r.out === 2)).toHaveLength(6);
    expect(a.rows.filter((r) => r.out === 0)).toHaveLength(10);
    // everyone knocked out in Q1 starts behind everyone knocked out in Q2, who start behind the Q3 ten
    const pos = (o: number) => a.rows.filter((r) => r.out === o).map((r) => r.position);
    expect(Math.max(...pos(0))).toBeLessThanOrEqual(10 + a.rows.filter((r) => r.gridPenalty > 0).length * 3);
    expect(Math.min(...pos(1))).toBeGreaterThan(Math.min(...pos(2)));
    const times = a.rows.filter((r) => isFinite(r.time)).map((r) => r.time);
    const spread = Math.max(...times) - Math.min(...times);
    console.log("pole", fmtLap(a.rows[0].time), "spread", spread.toFixed(2));
    expect(a.rows[0].time).toBeGreaterThan(track.nominalLap * 0.9);
    expect(spread).toBeGreaterThan(0.5);
    expect(spread).toBeLessThan(8);
  });
});

describe("race", () => {
  it("is deterministic for the same seed", () => {
    const a = makeRace(42);
    const b = makeRace(42);
    a.run(3000);
    b.run(3000);
    expect(a.hash()).toBe(b.hash());
  });

  it("differs for a different seed", () => {
    const a = makeRace(42);
    const b = makeRace(43);
    a.run(3000);
    b.run(3000);
    expect(a.hash()).not.toBe(b.hash());
  });

  it("finishes with sensible results", () => {
    const sim = makeRace(2026, 8);
    sim.run(80000);
    expect(sim.phase).toBe("finished");
    const res = sim.results();
    const finishers = res.filter((r) => r.status === "FIN");
    expect(finishers.length).toBeGreaterThan(14);
    expect(finishers[0].laps).toBe(8);
    const avgLap = finishers[0].totalTime / 8;
    expect(avgLap).toBeGreaterThan(track.nominalLap * 0.98);
    expect(avgLap).toBeLessThan(track.nominalLap * 1.5);
    expect(res.reduce((a, r) => a + r.points, 0)).toBe(25 + 18 + 15 + 12 + 10 + 8 + 6 + 4 + 2 + 1);
  });

  it("tyres wear and fuel burns", () => {
    const sim = makeRace(11, 6);
    sim.run(50 + 700);
    const c = sim.cars[0];
    expect(c.tyre.wear).toBeGreaterThan(0.01);
    expect(c.fuel).toBeLessThan(1);
    expect(c.s).toBeGreaterThan(0);
  });

  it("cars never sit inside each other (outside overtakes and the pit lane)", () => {
    for (const seed of [99, 5]) {
      const sim = makeRace(seed, 8);
      let minGap = Infinity;
      let quietFrom = 0;
      for (let i = 0; i < 50 + 6000; i++) {
        sim.step();
        if (sim.phase === "finished") break;
        if (i % 3) continue;
        // local yellows and cars recovering from incidents bunch the field on purpose
        if ([0, 1, 2].some((k) => sim.inc.yellowAt(k)) || sim.cars.some((c) => c.incident)) quietFrom = sim.tick + 80;
        if (sim.tick < quietFrom) continue;
        const live = sim.cars.filter((c) => c.status === "racing" && Math.abs(c.lateral) < 5.5 && !c.incident).sort((a, b) => b.s - a.s);
        for (let k = 1; k < live.length; k++) {
          const near = live[k - 1].s - live[k].s < track.length * 0.5;
          const passing = live[k].overtaking !== null || live[k - 1].overtaking !== null || live[k].yielding || live[k - 1].yielding;
          const sideBySide = Math.abs(live[k - 1].lateral - live[k].lateral) >= 2.1; // cars are 2 m wide
          if (near && !passing && !sideBySide && sim.tick > 300) minGap = Math.min(minGap, live[k - 1].s - live[k].s);
        }
      }
      expect(minGap, `seed ${seed}`).toBeGreaterThan(4);
    }
  });
});
