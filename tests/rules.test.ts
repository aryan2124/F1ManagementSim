import { describe, expect, it } from "vitest";
import { loadCircuit } from "../src/game/circuits";
import { buildEntries } from "../src/game/data";
import { RaceSim, POINTS } from "../src/sim/engine";
import { QualiSim } from "../src/sim/qualifying";

const { track } = loadCircuit("monza");

function race(team: string, laps: number, extra: object = {}, seed = 3) {
  const entries = buildEntries(team);
  return new RaceSim({ seed, laps, track, entries, ...extra });
}

describe("F1 sporting rules", () => {
  it("disqualifies a driver who never uses a second dry compound", () => {
    const sim = race("mer", 6);
    sim.run(60000);
    const res = sim.results();
    const mine = res.filter((r) => sim.car(r.carId).entry.human);
    expect(mine).toHaveLength(2);
    for (const r of mine) {
      expect(r.status).toBe("DSQ");
      expect(r.points).toBe(0);
    }
    // the AI teams all satisfied the rule
    expect(res.filter((r) => !sim.car(r.carId).entry.human && r.status === "DSQ")).toHaveLength(0);
  });

  it("accepts a stop onto a different compound, and lets the player be classified", () => {
    const sim = race("mer", 6);
    const ids = sim.cars.filter((c) => c.entry.human).map((c) => c.id);
    sim.run(60);
    for (const id of ids) sim.command({ type: "pit", carId: id, compound: sim.car(id).tyre.compound === "H" ? "M" : "H" });
    sim.run(60000);
    for (const id of ids) {
      const r = sim.results().find((x) => x.carId === id)!;
      expect(r.status).not.toBe("DSQ");
      expect(r.compoundsUsed.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("does not disqualify anyone when the rule is switched off", () => {
    const sim = race("mer", 4, { twoCompoundRule: false });
    sim.run(60000);
    expect(sim.results().filter((r) => r.status === "DSQ")).toHaveLength(0);
  });

  it("awards 25-18-15-12-10-8-6-4-2-1 to the classified top ten only", () => {
    const sim = race("none", 6);
    sim.run(60000);
    const res = sim.results();
    const winner = res[0];
    expect(winner.points).toBe(POINTS[0]);
    res.slice(0, 10).forEach((r, i) => expect(r.points).toBe(r.status === "FIN" ? POINTS[i] : 0));
    res.slice(10).forEach((r) => expect(r.points).toBe(0));
  });

  it("adds time penalties to the finishing time", () => {
    const sim = race("none", 5);
    sim.run(2000);
    const car = sim.cars[8];
    (sim as unknown as { givePenalty(c: unknown, s: number, short: string, text: string): void }).givePenalty(car, 5, "Test", "test penalty");
    sim.run(60000);
    const r = sim.results().find((x) => x.carId === car.id)!;
    expect(r.penalty).toBeGreaterThanOrEqual(5);
    expect(r.penaltyNotes.join(" ")).toContain("Test");
  });

  it("runs a safety car that bunches the field, then releases it", () => {
    const sim = race("none", 10, { noPenalties: true });
    sim.run(600);
    (sim as unknown as { deployNeutral(k: string, why: string): void }).deployNeutral("sc", "test");
    expect(sim.neutral.active).toBe(true);
    let sawBunched = false;
    for (let i = 0; i < 20000 && sim.neutral.active; i++) {
      sim.step();
      const live = sim.order.filter((c) => c.status === "racing");
      if (live.length > 4 && sim.neutral.active) {
        const top = Math.max(...live.map((c) => c.v));
        if (top <= 52) sawBunched = true;
      }
    }
    expect(sawBunched).toBe(true);
    expect(sim.neutral.active).toBe(false);
  });
});

describe("safety car detail", () => {
  it("shows a safety car that dives into the pit lane at the end, then locks overtaking until the line", () => {
    const sim = race("none", 12, { noPenalties: true, noIncidents: true }, 4);
    sim.run(600);
    sim.drainEvents();
    (sim as unknown as { deployNeutral(k: string, why: string): void }).deployNeutral("sc", "test");
    let sawCar = false;
    let sawIn = false;
    let dived = false;
    for (let i = 0; i < 30000 && sim.neutral.active; i++) {
      sim.step();
      if (sim.sc.vis) sawCar = true;
      if (sim.neutral.announcedEnd) {
        sawIn = true;
        if (Math.abs(sim.sc.lat) > 8) dived = true;
      }
    }
    expect(sawCar).toBe(true);
    expect(sawIn).toBe(true);
    expect(dived).toBe(true);
    // by the time the leader crosses the line and the green flag is out, the safety car is inside the pit lane
    expect(Math.abs(sim.sc.lat)).toBeGreaterThan(20);
    expect(Math.sign(sim.sc.lat)).toBe(sim.track.pitSide);
    expect(sim.neutral.lockLap).toBe(sim.neutral.endLap);
    const texts = sim.drainEvents().map((e) => e.text);
    expect(texts.some((x) => /Safety car in this lap/.test(x))).toBe(true);
    // no passes until every car has crossed the line
    let passes = 0;
    for (let i = 0; i < 4000; i++) {
      sim.step();
      if (sim.cars.every((c) => c.status !== "racing" || c.lap >= sim.neutral.lockLap)) break;
      passes += sim.drainEvents().filter((e) => e.kind === "overtake").length;
    }
    expect(passes).toBe(0);
    for (let i = 0; i < 400; i++) sim.step();
    expect(sim.sc.vis).toBe(false);
  });

  it("announces the end of a virtual safety car", () => {
    const sim = race("none", 12, { noPenalties: true, noIncidents: true }, 5);
    sim.run(600);
    sim.drainEvents();
    (sim as unknown as { deployNeutral(k: string, why: string): void }).deployNeutral("vsc", "test");
    for (let i = 0; i < 30000 && sim.neutral.active; i++) sim.step();
    expect(sim.drainEvents().map((e) => e.text).some((x) => /VSC ending/.test(x))).toBe(true);
  });
});

describe("qualifying rules", () => {
  it("only counts laps that start before the chequered flag, and tracks the cut line", () => {
    const entries = buildEntries("none");
    const sim = new QualiSim({ seed: 12, track, entries });
    sim.startSegment();
    let guard = 0;
    while (sim.phase === "running" && guard++ < 100000) sim.step();
    expect(sim.chequered).toBe(true);
    expect(["break", "done"]).toContain(sim.phase);
    expect(sim.keepers).toEqual([16, 10, 10]);
    const out = sim.cars.filter((c) => c.eliminatedIn === 1);
    expect(out).toHaveLength(6);
    // the six slowest Q1 times (or no time) are the ones eliminated
    const slowestKept = Math.max(...sim.cars.filter((c) => c.eliminatedIn === 0).map((c) => c.best[0]));
    for (const c of out) expect(c.best[0] >= slowestKept || !isFinite(c.best[0])).toBe(true);
  });

  it("lets the player send a car out and records a lap", () => {
    const entries = buildEntries("mer");
    const sim = new QualiSim({ seed: 4, track, entries });
    const id = entries.find((e) => e.human)!.id;
    sim.startSegment();
    for (let i = 0; i < 40; i++) sim.step();
    sim.command({ type: "go", carId: id, compound: "S", fresh: true, laps: 1 });
    for (let i = 0; i < 20000 && sim.phase === "running"; i++) sim.step();
    const car = sim.car(id);
    expect(car.sets.S).toBe(3);
    expect(isFinite(car.best[0])).toBe(true);
  });
});
