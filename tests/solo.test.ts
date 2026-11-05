import { it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { loadCircuit } from "../src/game/circuits";
import { buildEntries } from "../src/game/data";
import { RaceSim } from "../src/sim/engine";
vi.setConfig({ testTimeout: 600000 });
it.skipIf(!process.env.PACE)("solo lap time and wear per pace step", () => {
  const out: string[] = [];
  for (const tid of ["silverstone", "monza"]) {
    const { track } = loadCircuit(tid);
    const e = buildEntries("none").slice(0, 1);
    const base: Record<string, number> = {};
    for (const [name, p, tr] of [["SAVE", 0, 0], ["SAVE+", 0, 1], ["STD", 1, 0], ["STD+", 1, 1], ["PUSH", 2, 0]] as const) {
      const sim = new RaceSim({ seed: 3, laps: 10, track, entries: e, rules: {} });
      const id = e[0].id;
      let g = 0;
      while (sim.phase !== "finished" && g++ < 3000) { const c = sim.cars[0]; c.push = p; c.trim = tr; sim.run(100); }
      const laps = (sim.lapLog.get(id) ?? []).filter((l) => l.lap >= 2 && l.lap <= 9);
      const m = laps.reduce((a, l) => a + l.time, 0) / laps.length;
      if (name === "STD") base.std = m;
      out.push(`${tid} ${name}: total ${(sim.lapLog.get(id) ?? []).reduce((a, l) => a + l.time, 0).toFixed(1)} mean lap ${m.toFixed(3)} wear ${sim.cars[0].tyre.wear.toFixed(3)}`);
    }
  }
  writeFileSync("/tmp/solo.txt", out.join("\n"));
});
