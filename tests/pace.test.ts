import { describe, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { loadCircuit } from "../src/game/circuits";
import { buildEntries } from "../src/game/data";
import { RaceSim } from "../src/sim/engine";
import { runQualifying } from "../src/sim/qualifying";

vi.setConfig({ testTimeout: 1800000 });
const entries = buildEntries("none");

/** Paired pace measurement (PACE=1): the same seeds and grid, one mid-field car held at each pace step the whole race.
 *  Reports mean race time against standard, in seconds, and the standard error of that difference. */
function run(trackId: string, seed: number, push: 0 | 1 | 2, trim: 0 | 1, laps: number) {
  const { track } = loadCircuit(trackId);
  const grid = runQualifying({ seed, track, entries }).rows.map((q) => q.carId);
  const sim = new RaceSim({ seed, laps, track, entries, grid, rules: {} });
  const id = grid[9];
  let g = 0;
  while (sim.phase !== "finished" && g++ < 3000) {
    for (const c of sim.cars) if (c.id === id && c.status === "racing") { c.push = push; c.trim = trim; }
    sim.run(100);
  }
  const rows = sim.results();
  const r = rows.find((x) => x.carId === id)!;
  const clean = (sim.lapLog.get(id) ?? []).filter((l) => !l.slow && l.lap >= 3 && isFinite(l.time));
  const lap = clean.reduce((a, l) => a + l.time, 0) / Math.max(1, clean.length);
  return { t: r.dnf ? NaN : lap, wear: sim.cars.find((c) => c.id === id)!.tyre.wear, stops: r.stops, pos: rows.findIndex((x) => x.carId === id) + 1 };
}

describe.skipIf(!process.env.PACE)("paired pace", () => {
  it("measures", () => {
    const steps: [string, 0 | 1 | 2, 0 | 1][] = [["SAVE", 0, 0], ["SAVE+", 0, 1], ["STD", 1, 0], ["STD+", 1, 1], ["PUSH", 2, 0]];
    const out: string[] = [];
    for (const tid of ["silverstone", "monza"]) {
      const seeds = Array.from({ length: 10 }, (_, i) => i + 1);
      const res = steps.map(([, p, tr]) => seeds.map((sd) => run(tid, sd, p, tr, 20)));
      const std = res[2];
      steps.forEach(([name], k) => {
        const d = seeds.map((_, i) => res[k][i].t - std[i].t).filter((x) => isFinite(x));
        const m = d.reduce((a, b) => a + b, 0) / Math.max(1, d.length);
        const sd = Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, d.length - 1));
        const dp = seeds.map((_, i) => res[k][i].pos - std[i].pos);
        const dw = seeds.map((_, i) => res[k][i].wear - std[i].wear);
        const ds = seeds.map((_, i) => res[k][i].stops - std[i].stops);
        out.push(`${tid} ${name}: clean lap vs STD ${m.toFixed(3)} s (se ${(sd / Math.sqrt(d.length)).toFixed(3)}), wear at end ${(dw.reduce((a, b) => a + b, 0) / dw.length).toFixed(2)}, stops ${(ds.reduce((a, b) => a + b, 0) / ds.length).toFixed(2)}, places ${(dp.reduce((a, b) => a + b, 0) / dp.length).toFixed(2)}`);
      });
    }
    writeFileSync("/tmp/pace.txt", out.join("\n"));
  });
});
