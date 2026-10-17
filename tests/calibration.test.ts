import { describe, expect, it } from "vitest";
import { CALENDAR_2026, CIRCUITS, loadCircuit, scheduledLaps } from "../src/game/circuits";
import { RaceSim } from "../src/sim/engine";
import { buildEntries } from "../src/game/data";

function soloQualiLap(id: string): number {
  const { track } = loadCircuit(id);
  const entry = buildEntries("mer")[0];
  const sim = new RaceSim({ seed: 1, laps: 2, track, entries: [entry], grid: [entry.id], startTyres: { [entry.id]: "S" }, startFuel: 0.12, noIncidents: true });
  const car = sim.car(entry.id);
  car.push = 2;
  car.mode = "attack";
  car.soc = 1;
  sim.run(Math.ceil((track.nominalLap * 4) / 0.1));
  return car.bestLap;
}

describe("real circuits", () => {
  it("the 2026 calendar has 23 rounds in order", () => {
    expect(CALENDAR_2026).toHaveLength(23);
    CALENDAR_2026.forEach((c, i) => expect(c.round).toBe(i + 1));
  });

  it("scheduled race laps match the real distances", () => {
    const laps = (id: string) => scheduledLaps(CIRCUITS.find((c) => c.id === id)!);
    expect(laps("monaco")).toBe(78);
    expect(laps("spa")).toBe(44);
    expect(laps("silverstone")).toBe(52);
    expect(laps("monza")).toBe(53);
    expect(laps("marina-bay")).toBe(62);
  });

  it("every circuit builds a closed, sane model", () => {
    for (const m of CIRCUITS) {
      const { track } = loadCircuit(m.id);
      expect(track.length).toBeGreaterThan(3000);
      expect(track.length).toBeLessThan(7500);
      expect(track.nominalLap).toBeGreaterThan(55);
      expect(track.nominalLap).toBeLessThan(120);
    }
  });

  it("solo qualifying laps land within 2% of real pole times", () => {
    for (const m of CIRCUITS) {
      if (!m.poleRef) continue;
      const lap = soloQualiLap(m.id);
      expect(Math.abs(lap / m.poleRef - 1), `${m.id} ${lap.toFixed(2)} vs ${m.poleRef}`).toBeLessThan(0.02);
    }
  });
});
