import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { nodeKey, install, startBuild, tickTree, treeOf } from "../src/career/ctree";
import { startWeekend, practiceRun } from "../src/career/weekend";
import { activeDrivers, entriesFor } from "../src/career/car";
import { carLapGain, carOf, partTrackGain, rivalMoves, trackFactor } from "../src/career/treeplay";
import { nodeOf } from "../src/career/ctree";
import { loadCircuit, pitLimitFor } from "../src/game/circuits";
import { trackRow } from "../src/game/trackdata";
import { buildEntries } from "../src/game/data";
import { RaceSim } from "../src/sim/engine";
import { runQualifying } from "../src/sim/qualifying";

function built(seed = 21, comp: "fw" | "pu" = "fw") {
  const s = newCareer("fer", seed);
  const t = s.teams[s.teamId];
  t.cash = 500;
  const id = nodeKey(comp, 0, 1);
  startBuild(s, t, id);
  for (let i = 0; i < 60; i++) tickTree(s, t);
  return { s, t, id };
}

describe("parts are per car", () => {
  it("a part fitted to car A only changes car A's spec and not car B's", () => {
    const { s, t, id } = built();
    const ds = activeDrivers(s, t.id);
    const before = entriesFor(s);
    const a0 = before.find((e) => e.id === ds[0])!.team;
    const b0 = before.find((e) => e.id === ds[1])!.team;
    expect(a0.aero).toBe(b0.aero);
    install(s, t, id, "A", true);
    const after = entriesFor(s);
    const a1 = after.find((e) => e.id === ds[0])!.team;
    const b1 = after.find((e) => e.id === ds[1])!.team;
    expect(b1.aero).toBeCloseTo(b0.aero, 6);
    expect(a1.aero).not.toBeCloseTo(a0.aero, 6);
    expect(carOf(s, t.id, ds[0])).toBe("A");
    expect(carOf(s, t.id, ds[1])).toBe("B");
  });
});

describe("practice lap uses the parts and the circuit", () => {
  it("only the car with the part gains lap time, and a downforce part is worth more where downforce matters", () => {
    const { s, t, id } = built();
    install(s, t, id, "A", true);
    s.weekend = startWeekend(s);
    const circuit = s.weekend.circuitId;
    expect(carLapGain(t, "A", circuit)).toBeGreaterThan(0);
    expect(carLapGain(t, "B", circuit)).toBe(0);
    expect(trackFactor("downforce", "monaco")).toBeGreaterThan(trackFactor("downforce", "las-vegas"));
    const nd = nodeOf(treeOf(s, t), id)!;
    expect(partTrackGain(treeOf(s, t), nd, "monaco")).not.toBe(partTrackGain(treeOf(s, t), nd, "las-vegas"));
    const ds = activeDrivers(s, t.id);
    practiceRun(s, "setup", { ...s.weekend.setup }, ds[1]);
    expect(Object.keys(s.weekend.tp?.cols[0] ?? {})).toHaveLength(0);
    practiceRun(s, "setup", { ...s.weekend.setup }, ds[0]);
    const col = s.weekend.tp!.cols[0];
    expect(col[id]).toBeTruthy();
    expect(col[id].exp).toBeLessThan(0);
  });
});

describe("a rival's upgrade reaches the engineers", () => {
  it("names a team whose car moved and stays quiet when nothing moved", () => {
    const s = newCareer("fer", 5);
    const race = s.calendar[0].circuitId;
    expect(rivalMoves(s, race)).toEqual([]);
    expect(rivalMoves(s, race)).toEqual([]);
    const rival = Object.keys(s.teams).find((id) => id !== s.teamId)!;
    s.teams[rival].car.aero += 0.4;
    const lines = rivalMoves(s, race);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("aero");
    expect(rivalMoves(s, race)).toEqual([]);
  });
});

describe("pit loss follows the sourced seconds", () => {
  it("a slow, costly track gets a slower lane limit than a quick one", () => {
    const lim = (id: string) => loadCircuit(id).track.pitLimit!;
    expect(trackRow("marina-bay").pit).toBeGreaterThan(trackRow("montreal").pit);
    expect(lim("marina-bay")).toBeLessThan(lim("montreal"));
    expect(lim("montreal")).toBeLessThanOrEqual(22);
    const T = loadCircuit("monza").track;
    expect(pitLimitFor(T, 24)).toBeCloseTo(T.pitLimit!, 6);
  });
  it("a stop in the simulator costs about the sourced seconds", () => {
    for (const id of ["monaco", "monza", "marina-bay"]) {
      const { track } = loadCircuit(id);
      const cfg = { seed: 3, laps: 5, track, entries: buildEntries("none"), noCrashes: true, noWeather: true } as never;
      const grid = runQualifying(cfg).rows.map((q) => q.carId);
      const sim = new RaceSim({ ...(cfg as object), grid } as never);
      const L = track.length;
      const lo = -track.pitIn - 250, hi = track.pitOut + 350;
      const t: Record<string, number> = {};
      let sent = false;
      for (let i = 0; i < 80000 && sim.phase !== "finished" && t["2b"] === undefined; i++) {
        sim.step();
        const c = sim.cars.find((x) => x.id === grid[0])!;
        if (!sent && c.s > L * 1.3) { sim.command({ type: "pit", carId: grid[0], compound: "H" } as never, false); sent = true; }
        for (const k of [1, 2]) for (const [nm, off] of [["a", lo], ["b", hi]] as const) if (t[k + nm] === undefined && c.s >= k * L + off) t[k + nm] = sim.time;
      }
      const loss = t["2b"] - t["2a"] - (t["1b"] - t["1a"]);
      expect(Math.abs(loss - trackRow(id).pit), id).toBeLessThan(3.2);
    }
  }, 120000);
});
