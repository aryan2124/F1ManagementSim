import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { initDesigns } from "../src/career/design";
import { carSpec } from "../src/career/car";
import { GRENADE_POOL, aiGrenades, commitGrenades, grenadeLeft, grenadeUsed, setGrenade } from "../src/career/grenade";
import { startWeekend } from "../src/career/weekend";

const mk = () => {
  const s = newCareer("fer", 21);
  initDesigns(s);
  s.era.current = { ...(s.era.current as object), startYear: s.year, length: 5, modules: [{ id: "grenadeEra", intensity: 0.5 }] } as never;
  s.weekend = startWeekend(s);
  return s;
};

describe("grenade era engine pool", () => {
  it("a run gives power and costs reliability, and goes back when cancelled", () => {
    const s = mk();
    const before = carSpec(s, s.teamId);
    expect(grenadeLeft(s, s.teamId)).toBe(GRENADE_POOL);
    expect(setGrenade(s, true)).toMatch(/on/);
    const on = carSpec(s, s.teamId);
    expect(on.power).toBeGreaterThan(before.power);
    expect(on.reliability).toBeLessThan(before.reliability);
    expect(grenadeLeft(s, s.teamId)).toBe(GRENADE_POOL - 1);
    setGrenade(s, false);
    expect(carSpec(s, s.teamId).power).toBe(before.power);
    expect(grenadeLeft(s, s.teamId)).toBe(GRENADE_POOL);
  });
  it("the pool runs dry: runs are booked after the race and cannot be exceeded", () => {
    const s = mk();
    for (let i = 0; i < GRENADE_POOL; i++) {
      s.weekend!.grenade = {};
      s.weekend!.grenadeSpent = false;
      expect(setGrenade(s, true)).toMatch(/on/);
      commitGrenades(s);
    }
    expect(grenadeUsed(s, s.teamId)).toBe(GRENADE_POOL);
    s.weekend!.grenade = {}; s.weekend!.grenadeSpent = false;
    expect(setGrenade(s, true)).toMatch(/No grenade runs/);
  });
  it("AI teams burn runs too, and only from their own pool", () => {
    const s = mk();
    let burned = 0;
    for (let r = 0; r < 12; r++) { s.round = r; s.weekend!.grenade = {}; s.weekend!.grenadeSpent = false; aiGrenades(s, s.weekend!); burned += Object.keys(s.weekend!.grenade!).length; commitGrenades(s); }
    expect(burned).toBeGreaterThan(5);
    for (const id of Object.keys(s.teams)) expect(grenadeUsed(s, id)).toBeLessThanOrEqual(GRENADE_POOL);
  });
  it("a new season refills the pool", () => {
    const s = mk();
    s.weekend!.grenade = {}; setGrenade(s, true); commitGrenades(s);
    expect(grenadeUsed(s, s.teamId)).toBe(1);
    s.year += 1;
    expect(grenadeUsed(s, s.teamId)).toBe(0);
  });
});
