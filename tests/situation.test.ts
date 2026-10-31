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

describe("race IQ in the radio", () => {
  function raceWith(iq: number, seed: number) {
    const { track } = loadCircuit("spa");
    const entries = buildEntries("mer");
    for (const e of entries) if (e.human) e.driver = { ...e.driver, iq };
    const { rows } = runQualifying({ seed, track, entries });
    const sim = new RaceSim({ seed, laps: 30, track, entries, grid: rows.map((q) => q.carId), weather: undefined } as never);
    const mine = sim.cars.find((c) => c.entry.human)!;
    for (let i = 0; i < 200; i++) sim.step();
    return { sim, mine };
  }

  it("a raw driver misjudges his tyres more than a sharp one", () => {
    let sharp = 0;
    let raw = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const a = raceWith(0.95, seed);
      const b = raceWith(0.25, seed);
      a.mine.tyre.wear = 0.5;
      b.mine.tyre.wear = 0.5;
      sharp = Math.max(sharp, Math.abs(a.sim.radio!.perceivedWear(a.mine) - 0.5));
      raw = Math.max(raw, Math.abs(b.sim.radio!.perceivedWear(b.mine) - 0.5));
    }
    expect(sharp).toBeLessThan(0.02);
    expect(raw).toBeGreaterThan(0.06);
  }, 120000);

  it("a sharp driver speaks up when the wall boxes him on tyres that are barely used, a raw one does not", () => {
    let sharpSaid = 0;
    let rawSaid = 0;
    for (let seed = 1; seed <= 8; seed++) {
      for (const [iq, bump] of [[0.95, () => sharpSaid++], [0.2, () => rawSaid++]] as const) {
        const { sim, mine } = raceWith(iq, seed);
        mine.tyre = { compound: "M", wear: 0.1, ageLaps: 3 };
        mine.lap = 4;
        sim.command({ type: "pit", carId: mine.id, compound: "H" });
        for (let i = 0; i < 400; i++) sim.step();
        const said = (sim.radio?.log ?? []).some((l) => l.carId === mine.id && /laps? old|percent|percent worn/i.test(l.text) && /tyre|gone|worn|old/i.test(l.text));
        if (said) bump();
      }
    }
    expect(sharpSaid).toBeGreaterThan(0);
    expect(rawSaid).toBe(0);
  }, 120000);
});
