import { describe, expect, it } from "vitest";
import { TEAMS, DRIVERS } from "../src/game/data";
import { fillTier, realPeople, TIER_SEATS } from "../src/game/people";

describe("real drivers first", () => {
  it("has the real 2026 F1 grid: 11 teams, 22 drivers, unique numbers and codes", () => {
    expect(TEAMS).toHaveLength(11);
    const all = TEAMS.flatMap((t) => DRIVERS[t.id]);
    expect(all).toHaveLength(22);
    expect(new Set(all.map((d) => d.code)).size).toBe(22);
    expect(new Set(all.map((d) => d.number)).size).toBe(22);
    const names = all.map((d) => d.name);
    for (const n of ["Daan Brouwer", "Toby Carrow", "Lionel Hargrave", "Matteo Bellandi", "Joaquín Palermo", "Eero Lahtinen"]) expect(names).toContain(n);
  });

  it("each ladder fills every seat", () => {
    for (const tier of ["F2", "F3", "FRECA"] as const) {
      const list = fillTier(tier, TIER_SEATS[tier]);
      expect(list.length).toBe(TIER_SEATS[tier]);
    }
  });

  it("made-up names only appear after the real pool for a tier is exhausted", () => {
    const real = realPeople().byTier.F2.length;
    const list = fillTier("F2", real + 5);
    expect(list.slice(0, real).every((p) => !p.fictional)).toBe(true);
    expect(list.slice(real).every((p) => p.fictional)).toBe(true);
    // invented names never collide with a real person
    const realNames = realPeople().names;
    for (const p of list.slice(real)) expect(realNames.has(p.name)).toBe(false);
  });

  it("every driver has a unique 3 letter code across all tiers", () => {
    const codes: string[] = [];
    for (const t of Object.values(realPeople().byTier)) for (const p of t) codes.push(p.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
