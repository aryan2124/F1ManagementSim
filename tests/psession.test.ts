import { describe, expect, it, vi } from "vitest";
import { newCareer } from "../src/career/world";
import { startWeekend } from "../src/career/weekend";
import { PracticeController } from "../src/career/psession";
import { nodeKey, install, treeOf } from "../src/career/ctree";

vi.setConfig({ testTimeout: 300000 });

function setup(seed = 8) {
  const s = newCareer("mcl", seed, 1, "quick");
  const t = s.teams[s.teamId];
  t.cash = 500;
  const tr = treeOf(s, t);
  for (const id of [nodeKey("fw", 0, 1), nodeKey("floor", 1, 1)]) tr.parts[id] = { id, day: s.day, copies: 2, onA: false, onB: false, tested: false };
  install(s, t, nodeKey("fw", 0, 1), "A", true);
  install(s, t, nodeKey("fw", 0, 1), "B", true);
  s.weekend = startWeekend(s);
  return { s, t, tr };
}

/** Run the sim until a predicate holds or a time cap, polling like the screen does. */
function until(c: PracticeController, f: () => boolean, maxTicks = 40000) {
  for (let i = 0; i < maxTicks && !f(); i++) {
    c.sim.step();
    if (i % 20 === 0) c.poll();
  }
}

describe("a practice session on the qualifying sim", () => {
  it("runs on one clock, and a finished run feeds the engineers and the part readings", () => {
    const { s } = setup();
    const c = new PracticeController(s);
    expect(c.sim.clock).toBe(3600);
    c.start();
    expect(c.sim.phase).toBe("running");
    const a = c.humanIds[0];
    c.programme[a] = "part";
    until(c, () => c.sim.car(a).phase === "garage" && c.sim.tick > c.sim.car(a).readyTick, 200);
    c.sim.command({ type: "go", carId: a, compound: "S", fresh: true, laps: 1 });
    until(c, () => c.sim.car(a).runsDone >= 1);
    c.poll();
    const ws = s.weekend!;
    expect(c.sim.car(a).runsDone).toBeGreaterThanOrEqual(1);
    expect(ws.runs!.length).toBeGreaterThanOrEqual(1);
    // the clock only counts down
    expect(c.sim.clock).toBeLessThan(3600);
    // the fitted front wing got a stopwatch reading for this session
    const col = ws.tp?.cols[0] ?? {};
    expect(Object.keys(col)).toContain(nodeKey("fw", 0, 1));
    expect(c.log.length).toBeGreaterThan(0);
    // untouched: the session did not use up the legacy run budget
    expect(ws.runsLeft).toBeGreaterThan(0);
  });

  it("a change in the garage costs session minutes and money, and holds the car", () => {
    const { s, t } = setup();
    const c = new PracticeController(s);
    c.start();
    const a = c.humanIds[0];
    c.sim.step();
    const car = c.sim.car(a);
    const cash = t.cash;
    const r = c.fit(nodeKey("floor", 1, 1), "A", true);
    expect(r.ok).toBe(true);
    expect(t.cash).toBeLessThan(cash);
    expect(s.weekend!.fitMin).toBeGreaterThan(0);
    // held in the garage for those minutes
    expect(car.readyTick).toBeGreaterThan(c.sim.tick + 600);
    // a car out on the track cannot be worked on
    car.phase = "out";
    expect(c.fit(nodeKey("floor", 1, 1), "A", false).ok).toBe(false);
  });

  it("the session ends with the clock, sets go back and the next session is one closer", () => {
    const { s } = setup();
    const c = new PracticeController(s);
    const ws = s.weekend!;
    const left = ws.sessionsLeft;
    c.start();
    until(c, () => c.over, 60000);
    expect(c.over).toBe(true);
    c.finish();
    expect(ws.sessionsLeft).toBe(left - 1);
    c.finish();
    expect(ws.sessionsLeft).toBe(left - 1);
  });
});

describe("delegated practice", () => {
  it("the staff fit their best set and run the session without the player", async () => {
    const { autoPractice } = await import("../src/career/weekend");
    const { s, tr } = setup(9);
    const before = Object.values(tr.parts).filter((p) => p.onA || p.onB).length;
    autoPractice(s, false);
    expect(s.weekend!.notes.join(" ")).toMatch(/engineers/);
    expect(Object.values(tr.parts).filter((p) => p.onA || p.onB).length).toBeGreaterThanOrEqual(Math.min(before, 1));
    expect(Number.isFinite(s.teams[s.teamId].cash)).toBe(true);
  });
});
