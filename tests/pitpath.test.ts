import { describe, expect, it } from "vitest";
import { loadCircuit } from "../src/game/circuits";
import { buildEntries } from "../src/game/data";
import { RaceSim } from "../src/sim/engine";
import { runQualifying } from "../src/sim/qualifying";
import { pitPathLat, PIT_LANE_LAT, pitApproachStart, pitRoadEnd } from "../src/sim/pitpath";

describe("pit road", () => {
  it("is continuous and reaches the lane on either side of the track", () => {
    for (const id of ["silverstone", "albert-park", "monza"]) {
      const { track } = loadCircuit(id);
      let prev: number | null = null;
      const L = track.length;
      // walk the whole lap in 1 m steps: the offset never jumps more than a car-width-ish step
      for (let p = 0; p < L; p += 1) {
        const v = pitPathLat(track, p);
        if (v !== null && prev !== null) expect(Math.abs(v - prev)).toBeLessThan(1.2);
        prev = v;
      }
      expect(Math.abs(pitPathLat(track, L - 5)!)).toBe(PIT_LANE_LAT);
      expect(Math.sign(pitPathLat(track, track.pitOut - 5)!)).toBe(track.pitSide);
      expect(pitPathLat(track, pitRoadEnd(track) + 5)).toBeNull();
      expect(pitPathLat(track, pitApproachStart(track) - 1)).toBeNull();
    }
  });

  it("every pitting car in a race follows the road (no floating across the grass)", () => {
    const { track } = loadCircuit("silverstone");
    const entries = buildEntries("none");
    const cfg = { seed: 3, laps: 6, track, entries, noCrashes: true };
    const { rows } = runQualifying(cfg);
    const sim = new RaceSim({ ...cfg, grid: rows.map((q) => q.carId) });
    // ask a handful of cars to pit on lap 2
    for (const c of sim.cars.slice(0, 8)) sim.command({ type: "pit", carId: c.id, compound: "H" } as never, false);
    let samples = 0;
    let worst = 0;
    const L = track.length;
    for (let i = 0; i < 40000 && sim.phase !== "finished"; i++) {
      sim.step();
      for (const c of sim.cars) {
        if (!c.viaPit || c.incident) continue;
        const p = ((c.s % L) + L) % L;
        const want = pitPathLat(track, p);
        if (want === null) continue;
        samples++;
        worst = Math.max(worst, Math.abs(c.lateral - want));
      }
    }
    expect(samples).toBeGreaterThan(200);
    expect(worst).toBeLessThan(2.5);
  });

  it("qualifying cars follow the road too", () => {
    const { track } = loadCircuit("silverstone");
    const entries = buildEntries("none");
    const res = runQualifying({ seed: 4, track, entries });
    expect(res.rows).toHaveLength(22);
  });
});
