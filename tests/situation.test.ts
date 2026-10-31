import { describe, expect, it } from "vitest";
import { loadCircuit } from "../src/game/circuits";
import { buildEntries } from "../src/game/data";
import { RaceSim } from "../src/sim/engine";
import { runQualifying } from "../src/sim/qualifying";
import { evidence, readUndercut, stopKind } from "../src/sim/situation";

function make(laps = 30) {
  const { track } = loadCircuit("spa");
  const entries = buildEntries("mer");
  const { rows } = runQualifying({ seed: 4, track, entries });
  return new RaceSim({ seed: 4, laps, track, entries, grid: rows.map((q) => q.carId), weather: undefined } as never);
}

describe("strategy rulebook", () => {
  it("a lap 1 stop is never an undercut, and a rival on fresh tyres cannot be undercut", () => {
    const sim = make();
    const [y, x] = sim.order;
    y.tyre = { compound: "M", wear: 0.02, ageLaps: 1 };
    const r = readUndercut(sim, x, y, "H", 1.2);
    expect(r.real).toBe(false);
    expect(r.why).toBe("fresh");
    expect(stopKind({ carId: x.id, lap: 1, secs: 2.4, from: "M", to: "H", posBefore: 2 })).toBe("early");
    expect(stopKind({ carId: x.id, lap: 12, secs: 2.4, from: "M", to: "H", posBefore: 2, ageBefore: 12 })).toBe("normal");
    expect(stopKind({ carId: x.id, lap: 12, secs: 2.4, from: "M", to: "H", posBefore: 2, ageBefore: 12, hurt: true })).toBe("damage");
  });

  it("an undercut is real only when the rival's tyres are old and the gap is small enough to jump", () => {
    const sim = make(40);
    const [y, x] = sim.order;
    for (const c of sim.cars) c.lap = 14;
    y.tyre = { compound: "S", wear: 0.75, ageLaps: 14 };
    x.tyre = { compound: "S", wear: 0.6, ageLaps: 12 };
    const close = readUndercut(sim, x, y, "H", 0.8);
    expect(close.perLap).toBeGreaterThan(0.35);
    expect(close.real).toBe(true);
    expect(evidence(close).length).toBeGreaterThan(2);
    const far = readUndercut(sim, x, y, "H", 9);
    expect(far.real).toBe(false);
    // too close to the flag, nobody calls an undercut
    for (const c of sim.cars) c.lap = 37;
    expect(readUndercut(sim, x, y, "H", 0.8).why).toBe("late");
  });
});
