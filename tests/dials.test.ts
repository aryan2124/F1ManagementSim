import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { resolveCard } from "../src/career/tick";
import { addBoost, boostsFor, fitParts, injectIdea, startProject, tickRnd, wearOutParts } from "../src/career/rnd";
import { devEventsWeekly, regulationShock } from "../src/career/crises";
import { applyNextCar } from "../src/career/nextcar";
import { previewIdea } from "../src/career/brief";
import { planOf } from "../src/career/rndplan";
import { AREA_TRAITS } from "../src/career/traits";
import type { CareerState, Idea } from "../src/career/types";

function career() {
  const s = newCareer("mcl", 11);
  s.day += 30;
  return s;
}
function idea(s: CareerState): Idea {
  const i = injectIdea(s, s.teamId, "chassis", "safe", { gainMul: 1 });
  i.trait = AREA_TRAITS.chassis[0];
  i.trueGain = 0.1;
  i.predLo = 0.06;
  i.predHi = 0.14;
  return i;
}
function build(s: CareerState, id: number) {
  const t = s.teams[s.teamId];
  const p = t.projects.find((x) => x.id === id)!;
  p.progress = p.days;
  p.status = "ready";
  return p;
}

describe("weekend data", () => {
  it("makes a matching project cheaper and quicker, once", () => {
    const s = career();
    const t = s.teams[s.teamId];
    const i = idea(s);
    const base = { cost: i.cost, days: i.days };
    addBoost(s, s.teamId, i.trait!, 0.2, "Test data");
    expect(boostsFor(s, s.teamId, i.trait).pct).toBe(0.2);
    expect(previewIdea(s, i, { life: "long", horizon: "now" }).cost).toBeLessThan(base.cost);
    expect(startProject(s, s.teamId, i.id).ok).toBe(true);
    const p = t.projects.find((x) => x.id === i.id)!;
    expect(p.cost).toBeLessThan(base.cost);
    expect(p.days).toBeLessThanOrEqual(base.days);
    expect(p.boost?.pct).toBe(0.2);
    expect(boostsFor(s, s.teamId, i.trait).pct).toBe(0);
  });
  it("lapses", () => {
    const s = career();
    addBoost(s, s.teamId, "grip", 0.2, "x");
    s.day += 40;
    expect(boostsFor(s, s.teamId, "grip").pct).toBe(0);
  });
});

describe("part life", () => {
  it("a short-life part gains more, costs less, and gives out after its races", () => {
    const s = career();
    const t = s.teams[s.teamId];
    const i = idea(s);
    const i2 = { ...i };
    const longCost = i.cost;
    startProject(s, s.teamId, i.id, { life: "short" });
    const p = build(s, i.id);
    expect(p.life).toBe("short");
    expect(p.trueGain).toBeGreaterThan(0.1);
    expect(p.cost).toBeLessThan(longCost);
    void i2;
    const before = t.dna[p.trait!];
    fitParts(s, s.teamId);
    expect(t.dna[p.trait!]).toBeGreaterThan(before);
    s.round = (p.fittedRound ?? 0) + 3;
    expect(wearOutParts(s, s.teamId)).toHaveLength(0);
    s.round = (p.fittedRound ?? 0) + 6;
    expect(wearOutParts(s, s.teamId)).toHaveLength(1);
    expect(t.dna[p.trait!]).toBeCloseTo(before, 1);
    expect(p.worn).toBe(true);
    expect(wearOutParts(s, s.teamId)).toHaveLength(0);
  });
});

describe("next year's car", () => {
  it("a banked part never races this year and goes on the car in January", () => {
    const s = career();
    const t = s.teams[s.teamId];
    const i = idea(s);
    startProject(s, s.teamId, i.id, { horizon: "next" });
    const p = build(s, i.id);
    expect(p.forNext).toBe(true);
    expect(p.trueGain).toBeCloseTo(0.15, 2);
    const before = t.dna[p.trait!];
    expect(fitParts(s, s.teamId)).toHaveLength(0);
    expect(t.dna[p.trait!]).toBe(before);
    s.year += 1;
    applyNextCar(s);
    expect(p.status).toBe("fitted");
    expect(t.dna[p.trait!]).toBeGreaterThan(before);
  });
  void tickRnd;
});

describe("development crises", () => {
  it("a copied part can be protested, answered, or accepted", () => {
    const s = career();
    const t = s.teams[s.teamId];
    const i = idea(s);
    startProject(s, s.teamId, i.id);
    const p = build(s, i.id);
    fitParts(s, s.teamId);
    p.fittedYear = s.year;
    s.round = 3;
    for (let k = 0; k < 400 && !s.cards.some((c) => c.kind === "devEvent"); k++) { s.day += 7; planOf(t).eventDay = undefined; devEventsWeekly(s); }
    const c = s.cards.find((x) => x.kind === "devEvent");
    expect(c).toBeTruthy();
    expect(c!.options.length).toBeGreaterThanOrEqual(2);
    resolveCard(s, c!.id, c!.options[c!.options.length - 1].id);
    expect(s.cards.some((x) => x.kind === "devEvent")).toBe(false);
  });
  it("a cracked part can be redesigned", () => {
    const s = career();
    const t = s.teams[s.teamId];
    const i = idea(s);
    startProject(s, s.teamId, i.id);
    const p = build(s, i.id);
    fitParts(s, s.teamId);
    s.cards.push({ id: 9100, kind: "devEvent", title: "x", body: "y", options: [{ id: "redesign", label: "r" }], urgency: 2, deadline: s.day + 5, defaultOption: "redesign", data: { kind: "cracked", projectId: p.id, redoCost: 1, redoDays: 6 } } as never);
    const g = t.dna[p.trait!];
    resolveCard(s, 9100, "redesign");
    expect(t.dna[p.trait!]).toBeLessThan(g);
    expect(t.projects.some((x) => x.name.startsWith("Redesign") && x.status === "building")).toBe(true);
  });
});

describe("rules reset", () => {
  it("makes the team less sure of what traits are worth and voids groundwork", () => {
    const s = career();
    const t = s.teams[s.teamId];
    const before = { ...s.regW! };
    s.regW!.grip = before.grip + 0.5;
    planOf(t).synergy = { chassis: 0.3 };
    const e0 = t.regKnow.grip.err;
    regulationShock(s, before);
    expect(t.regKnow.grip.err).toBeGreaterThan(e0 - 0.0001);
    expect(planOf(t).synergy.chassis).toBeUndefined();
  });
});
