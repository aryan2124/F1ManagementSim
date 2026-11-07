import { describe, expect, it, vi } from "vitest";
import { loadCircuit } from "../src/game/circuits";
import { CIRCUITS } from "../src/game/circuits";
import { buildEntries } from "../src/game/data";
import { RaceSim } from "../src/sim/engine";
import { runQualifying } from "../src/sim/qualifying";
import { zoneLeft } from "../src/sim/track";

vi.setConfig({ testTimeout: 120000 });
const entries = buildEntries("none");

describe("attack zones", () => {
  it("every circuit has two or three zones of real length, inside the lap", () => {
    for (const c of CIRCUITS) {
      const { track } = loadCircuit(c.id);
      expect(track.zones.length, c.id).toBeGreaterThanOrEqual(2);
      expect(track.zones.length, c.id).toBeLessThanOrEqual(3);
      for (const z of track.zones) {
        expect(z.a, c.id).toBeGreaterThanOrEqual(0);
        expect(z.a, c.id).toBeLessThan(track.length);
        expect(z.b, c.id).toBeGreaterThanOrEqual(0);
        expect(z.b, c.id).toBeLessThan(track.length);
        const len = z.a <= z.b ? z.b - z.a : track.length - z.a + z.b;
        expect(len, c.id).toBeGreaterThan(40);
        expect(zoneLeft(track, (z.a + 5) % track.length), c.id).toBeGreaterThan(0);
      }
    }
  });
  it("boost is refused outside a zone, accepted inside, and costs the token only then", () => {
    const { track } = loadCircuit("silverstone");
    const seed = 5;
    const grid = runQualifying({ seed, track, entries }).rows.map((q) => q.carId);
    const sim = new RaceSim({ seed, laps: 6, track, entries, grid, rules: { pushToPass: 4, attackZones: true } });
    const me = entries[0].id;
    sim.command({ type: "boost", carId: me });
    // on the grid the car is not racing: nothing is spent
    expect(sim.car(me).boostLeft).toBe(4);
    let inside = false, refusedOutside = false, accepted = false;
    for (let g = 0; g < 4000 && !accepted; g++) {
      sim.run(10);
      const car = sim.car(me);
      if (car.status !== "racing") continue;
      const before = car.boostLeft;
      if (!car.inZone && !refusedOutside) {
        sim.command({ type: "boost", carId: me });
        expect(car.boostLeft).toBe(before);
        refusedOutside = true;
      } else if (car.inZone && car.boostUntil <= sim.tick) {
        sim.command({ type: "boost", carId: me });
        expect(car.boostLeft, `before ${before} until ${car.boostUntil} tick ${sim.tick}`).toBe(before - 1);
        inside = true;
        accepted = true;
      }
    }
    expect(refusedOutside).toBe(true);
    expect(inside).toBe(true);
  });
  it("computer cars spend tokens only inside zones, and the race finishes cleanly", () => {
    const { track } = loadCircuit("monza");
    const seed = 9;
    const grid = runQualifying({ seed, track, entries }).rows.map((q) => q.carId);
    const sim = new RaceSim({ seed, laps: 10, track, entries, grid, rules: { pushToPass: 4, attackZones: true } });
    let outsideBoost = 0;
    let g = 0;
    while (sim.phase !== "finished" && g++ < 800) {
      sim.run(25);
      for (const c of sim.cars) if (c.boostUntil > sim.tick && c.status === "racing" && !c.inZone && c.boostUntil - sim.tick > 130) outsideBoost++;
    }
    expect(sim.phase).toBe("finished");
    expect(outsideBoost).toBe(0);
    expect(sim.cars.filter((c) => c.boostLeft < 4).length).toBeGreaterThan(3);
  });
});
