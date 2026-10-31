import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { reduce } from "../src/career/reducer";
import { focusWeekly, delegated, pepTalk } from "../src/career/focus";
import { driversOf } from "../src/career/finance";
import { loadCircuit } from "../src/game/circuits";
import { buildEntries } from "../src/game/data";
import { RaceSim, DT } from "../src/sim/engine";
import { runQualifying } from "../src/sim/qualifying";

describe("weekly focus", () => {
  it("the drivers focus raises morale and costs cash; the money focus saves cash and costs fans", () => {
    const s = newCareer("wil", 3);
    const mine = driversOf(s, s.teamId);
    for (const d of mine) d.morale = 0.5;
    const cash = s.teams[s.teamId].cash;
    s.focus = { kind: "drivers", since: s.day };
    focusWeekly(s);
    expect(mine.every((d) => d.morale > 0.5)).toBe(true);
    expect(s.teams[s.teamId].cash).toBeLessThan(cash);
    const fans = s.brand.fans;
    const cash2 = s.teams[s.teamId].cash;
    s.focus = { kind: "money", since: s.day };
    focusWeekly(s);
    expect(s.teams[s.teamId].cash).toBeGreaterThan(cash2);
    expect(s.brand.fans).toBeLessThan(fans);
  });

  it("the setFocus action stores the choice", () => {
    const s = newCareer("wil", 3);
    const r = reduce(s, { type: "setFocus", kind: "academy" });
    expect(r.state.focus?.kind).toBe("academy");
  });
});

describe("pep talk", () => {
  it("lifts an unhappy driver more with calm, and only once per weekend", () => {
    const s = newCareer("wil", 3);
    s.weekend = { round: 0 } as never;
    const [d] = driversOf(s, s.teamId);
    d.morale = 0.3;
    pepTalk(s, "calm");
    expect(d.morale).toBeCloseTo(0.38, 5);
    pepTalk(s, "fire");
    expect(d.morale).toBeCloseTo(0.38, 5);
  });
});

describe("delegation", () => {
  it("hands over non-urgent decisions of a department, never urgent ones", () => {
    const s = newCareer("wil", 3);
    s.delegate = { people: true };
    expect(delegated(s, "contractOffer", 2)).toBe(true);
    expect(delegated(s, "contractOffer", 3)).toBe(false);
    expect(delegated(s, "sponsorOffer", 2)).toBe(false);
  });
});

describe("pit release", () => {
  function inBox() {
    const { track } = loadCircuit("spa");
    const entries = buildEntries("mer");
    const { rows } = runQualifying({ seed: 4, track, entries });
    const sim = new RaceSim({ seed: 4, laps: 30, track, entries, grid: rows.map((q) => q.carId), weather: undefined } as never);
    const car = sim.order[0];
    car.status = "pit_stop";
    car.pitTimer = Math.ceil(3 / DT);
    car.stopSecs = 3;
    return { sim, car };
  }
  it("too early costs a second", () => {
    const { sim, car } = inBox();
    const before = car.pitTimer;
    sim.command({ type: "pitRelease", carId: car.id });
    expect(car.pitTimer).toBeGreaterThan(before);
    expect(car.stopSecs).toBeCloseTo(4, 5);
  });
  it("in the green window saves the remaining time, and a second press does nothing", () => {
    const { sim, car } = inBox();
    car.pitTimer = Math.ceil(0.4 / DT);
    sim.command({ type: "pitRelease", carId: car.id });
    expect(car.pitTimer).toBe(0);
    const secs = car.stopSecs;
    sim.command({ type: "pitRelease", carId: car.id });
    expect(car.stopSecs).toBe(secs);
  });
});
