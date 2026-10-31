import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { reduce } from "../src/career/reducer";
import { delegated, pepTalk } from "../src/career/focus";
import { resolveWeekPlan } from "../src/career/week";
import { driversOf } from "../src/career/finance";

describe("weekly plan", () => {
  it("the drivers choice raises morale and costs cash; the money choice saves cash and costs fans", () => {
    const s = newCareer("wil", 3);
    const mine = driversOf(s, s.teamId);
    for (const d of mine) d.morale = 0.5;
    const cash = s.teams[s.teamId].cash;
    resolveWeekPlan(s, "drivers");
    expect(mine.every((d) => d.morale > 0.5)).toBe(true);
    expect(s.teams[s.teamId].cash).toBeLessThan(cash);
    const fans = s.brand.fans;
    const cash2 = s.teams[s.teamId].cash;
    resolveWeekPlan(s, "money");
    expect(s.teams[s.teamId].cash).toBeGreaterThan(cash2);
    expect(s.brand.fans).toBeLessThan(fans);
    expect(s.lastWeek?.length).toBeGreaterThan(0);
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
