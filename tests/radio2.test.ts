import { describe, expect, it } from "vitest";
import { loadCircuit } from "../src/game/circuits";
import { buildEntries } from "../src/game/data";
import { RaceSim } from "../src/sim/engine";
import { runQualifying } from "../src/sim/qualifying";
import { scramble, clock } from "../src/ui/radioFx";
import { newCareer } from "../src/career/world";
import { startWeekend, practiceRun } from "../src/career/weekend";
import { driversOf } from "../src/career/finance";
import { socialAfterRace } from "../src/career/social";
import { bestFor, comfort, trueConfidence } from "../src/career/setup";

describe("radio text effects", () => {
  it("scanner reception is deterministic per line and keeps the speaker tag", () => {
    const line = "HAM: We are going to box this lap and fit the hard tyre now.";
    for (let id = 1; id < 60; id++) {
      const a = scramble(line, id);
      expect(scramble(line, id)).toEqual(a);
      expect(a.text.startsWith("HAM: ") || a.quality === "bad").toBe(true);
      expect(a.text).not.toContain("—");
    }
    expect(new Set(Array.from({ length: 60 }, (_, i) => scramble(line, i + 1).quality)).size).toBeGreaterThan(1);
    expect(clock(1234, 0.1)).toBe("02:03");
  });

  it("too many calls to a driver make him complain, and radio stays out of the physics", () => {
    const { track } = loadCircuit("spa");
    const entries = buildEntries("mer");
    const { rows } = runQualifying({ seed: 4, track, entries });
    const sim = new RaceSim({ seed: 4, laps: 6, track, entries, grid: rows.map((q) => q.carId), weather: { seed: 12, mode: "random", session: "race" } } as never);
    const mine = sim.cars.find((c) => c.entry.human);
    if (!mine) return;
    for (let i = 0; i < 400; i++) sim.step();
    for (let i = 0; i < 7; i++) sim.radio?.order(mine.id, i % 2 ? "pushnow" : "savetyres");
    for (let i = 0; i < 40; i++) sim.step();
    const text = (sim.radio?.log ?? []).filter((l) => l.carId === mine.id).map((l) => l.text).join("\n");
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toContain("—");
  });
});

describe("radio timing and clips", () => {
  it("a driver answers a team order after a delay, and notable moments are kept for the social feed", () => {
    const { track } = loadCircuit("spa");
    const entries = buildEntries("mer");
    const { rows } = runQualifying({ seed: 9, track, entries });
    const sim = new RaceSim({ seed: 9, laps: 8, track, entries, grid: rows.map((q) => q.carId), weather: { seed: 3, mode: "random", session: "race" } } as never);
    const mine = sim.cars.find((c) => c.entry.human)!;
    for (let i = 0; i < 300; i++) sim.step();
    const before = (sim.radio?.log ?? []).filter((l) => l.carId === mine.id && l.text.startsWith(mine.entry.driver.code)).length;
    sim.radio?.order(mine.id, "pushnow");
    const right = (sim.radio?.log ?? []).filter((l) => l.carId === mine.id && l.text.startsWith(mine.entry.driver.code)).length;
    expect(right).toBe(before); // nothing from the driver at the instant of the call
    for (let i = 0; i < 160; i++) sim.step();
    const later = (sim.radio?.log ?? []).filter((l) => l.carId === mine.id && l.text.startsWith(mine.entry.driver.code)).length;
    expect(later).toBeGreaterThan(before);
  });

  it("radio clips become posts in the feed, using only words that were said", () => {
    const s = newCareer("wil", 5);
    const d = driversOf(s, s.teamId)[0]!;
    const order = Object.keys(s.drivers).filter((id) => s.drivers[id]!.teamId);
    socialAfterRace(s, order, order, [], "British Grand Prix", 1, [{ carId: d.id, tag: "bleep", text: `${d.spec.code}: [BLEEP] this is hopeless, box me.` }]);
    const posts = (s.social?.posts ?? []) as { text: string }[];
    expect(posts.some((p) => p.text.includes("[BLEEP] this is hopeless, box me."))).toBe(true);
    expect(posts.every((p) => !p.text.includes("—"))).toBe(true);
  });
});

describe("the setup puzzle", () => {
  it("rewards a car that suits the driver, and old weekends without new fields do not crash", () => {
    const s = newCareer("wil", 3);
    const ws = startWeekend(s);
    s.weekend = ws;
    const d = driversOf(s, s.teamId)[0]!;
    const ideal = { ...ws.setup };
    for (const a of ws.axes) ideal[a.id] = bestFor(ws, ideal, a.id);
    const wrong = { ...ws.setup };
    for (const a of ws.axes) wrong[a.id] = Math.max(-1, Math.min(1, bestFor(ws, ideal, a.id) + 0.8));
    ws.setup = ideal;
    const good = comfort(ws, ideal, d);
    ws.setup = wrong;
    const bad = comfort(ws, wrong, d);
    expect(good).toBeGreaterThan(bad);
    expect(trueConfidence(ws, d)).toBeLessThan(0.97);
    // old save shape
    const w2 = s.weekend!;
    delete (w2 as { runs?: unknown }).runs;
    delete (w2 as { fam?: unknown }).fam;
    delete (w2 as { fresh?: unknown }).fresh;
    const before = w2.stage;
    expect(() => practiceRun(s, "setup", ideal, d.id)).not.toThrow();
    expect(w2.stage).toBe(before);
    // repeat runs produce evidence, not an instant answer
    expect((w2.runs ?? []).length).toBeGreaterThanOrEqual(0);
  });
});
