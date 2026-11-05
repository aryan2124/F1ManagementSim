import { describe, expect, it, vi } from "vitest";
import { loadCircuit } from "../src/game/circuits";
import { buildEntries } from "../src/game/data";
import { RaceSim } from "../src/sim/engine";
import { forkRace, replayFork } from "../src/sim/whatif";

vi.setConfig({ testTimeout: 120000 });
const { track } = loadCircuit("monza");

describe("what-if replay", () => {
  const entries = buildEntries("mer");
  const cfg = { seed: 21, laps: 8, track, entries };
  const sim = new RaceSim(cfg);
  sim.run(1500);
  const id = sim.cars.find((c) => c.entry.human)!.id;
  sim.command({ type: "push", carId: id, push: 2 });
  sim.run(4000);
  sim.command({ type: "pit", carId: id, compound: "H" });
  let g = 0;
  while (sim.phase !== "finished" && g++ < 600) sim.run(1000);
  const real = sim.results();

  it("replays the real race exactly from the command log", () => {
    const again = replayFork(cfg, sim.commandLog, null, [id]);
    expect(again.rows.map((r) => r.carId)).toEqual(real.map((r) => r.carId));
    expect(again.rows[0].totalTime).toBeCloseTo(real[0].totalTime, 3);
  });

  it("a branch that changes the call can end somewhere else", () => {
    const out = forkRace(cfg, sim.commandLog, [
      { name: "Never pit", fromTick: sim.commandLog.find((l) => l.cmd.type === "pit")!.tick, cmds: [] },
      { name: "Push all race", fromTick: 1500, cmds: [{ type: "push", carId: id, push: 2 }] },
    ], [id]);
    expect(out).toHaveLength(3);
    const times = out.map((o) => o.rows.find((r) => r.carId === id)!.totalTime);
    expect(new Set(times.map((t) => t.toFixed(2))).size).toBeGreaterThan(1);
  });
});
