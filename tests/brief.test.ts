import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { resolveCard } from "../src/career/tick";
import { fitParts, generateIdeas, startProject } from "../src/career/rnd";
import { diagnose, profileOf, upcomingRaces } from "../src/career/brief";
import { planOf } from "../src/career/rndplan";
import { AREA_TRAITS, TRAIT_GAIN_K } from "../src/career/traits";

function career(seed = 8) {
  const s = newCareer("mcl", seed);
  s.day += 30;
  return s;
}

describe("the development brief", () => {
  it("diagnoses three different problems, the same way twice", () => {
    const s = career();
    const a = diagnose(s);
    const b = diagnose(s);
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
    expect(new Set(a.map((p) => p.trait)).size).toBe(3);
    expect(a[0].races.length).toBeGreaterThan(0);
    expect(a[0].worth).toBeGreaterThanOrEqual(a[2].worth);
  });

  it("choosing a problem sends the office after it: three approaches on that trait, one of them with a certain side cost", () => {
    const s = career();
    const t = s.teams[s.teamId];
    const pick = diagnose(s)[0].trait;
    s.cards.push({ id: 7001, kind: "rndDirection", title: "t", body: "b", options: [{ id: `brief:${pick}`, label: "x" }], urgency: 2, deadline: s.day + 6, defaultOption: `brief:${pick}` } as never);
    resolveCard(s, 7001, `brief:${pick}`);
    const plan = planOf(t);
    expect(plan.brief?.trait).toBe(pick);
    t.ideas = [];
    s.day += 8;
    generateIdeas(s, s.teamId);
    const mine = t.ideas.filter((i) => i.trait === pick);
    expect(mine.map((i) => i.approach).sort()).toEqual(["proper", "quick", "rethink"]);
    const quick = mine.find((i) => i.approach === "quick")!;
    const proper = mine.find((i) => i.approach === "proper")!;
    const re = mine.find((i) => i.approach === "rethink")!;
    expect(quick.cost).toBeLessThan(proper.cost);
    expect(proper.cost).toBeLessThan(re.cost);
    expect(quick.days).toBeLessThanOrEqual(proper.days);
    expect(quick.side).toBeUndefined();
    expect(re.side).toBeTruthy();
    expect(AREA_TRAITS[re.area]).toContain(re.side!.trait);
    expect(re.side!.trait).not.toBe(pick);
    // at most a stray off-brief idea outside the brief
    expect(t.ideas.filter((i) => i.trait !== pick && !i.offBrief && !i.rookie).length).toBe(0);
    // it is made once per brief
    const n = t.ideas.length;
    s.day += 7;
    generateIdeas(s, s.teamId);
    expect(t.ideas.filter((i) => i.approach).length).toBe(3);
    expect(t.ideas.length).toBeGreaterThanOrEqual(n);
  });

  it("a rethink pays its side cost on the car when it is fitted, and the profile shows when it lands", () => {
    const s = career(11);
    const t = s.teams[s.teamId];
    const pick = diagnose(s)[0].trait;
    const area = (Object.keys(AREA_TRAITS) as (keyof typeof AREA_TRAITS)[]).find((a) => AREA_TRAITS[a].includes(pick))!;
    planOf(t).brief = { trait: pick, area, until: s.day + 40, day: s.day - 10 };
    t.ideas = [];
    generateIdeas(s, s.teamId);
    const re = t.ideas.find((i) => i.approach === "rethink")!;
    const prof = profileOf(s, re, 3);
    expect(prof.side?.trait).toBe(re.side!.trait);
    expect(prof.landsDay).toBe(s.day + re.days);
    expect(prof.fit.length).toBeGreaterThan(0);
    expect(upcomingRaces(s, 3).length).toBe(3);
    t.capLimit += 500;
    expect(startProject(s, s.teamId, re.id).ok).toBe(true);
    const p = t.projects.find((x) => x.id === re.id)!;
    expect(p.side).toEqual(re.side);
    p.status = "ready";
    p.hold = false;
    const before = { ...t.dna };
    fitParts(s, s.teamId);
    expect(t.dna[re.side!.trait]).toBeLessThan(before[re.side!.trait]);
    expect(before[re.side!.trait] - t.dna[re.side!.trait]).toBeCloseTo(re.side!.amount * TRAIT_GAIN_K, 1);
  });
});
