import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { setKeystone } from "../src/career/keystones";
import { carIdentity, compareCars, fitDistance } from "../src/career/carsig";

describe("careers fan out", () => {
  it("same seed, different early keystones: the cars end up measurably apart and named differently", () => {
    const a = newCareer("fer", 31);
    const b = newCareer("fer", 31);
    expect(fitDistance(a, b)).toBe(0);
    for (const [i, id] of ["deep-floor", "stiff-platform", "pullrod-front"].entries()) setKeystone(a, a.teamId, i, id);
    for (const [i, id] of ["low-drag-wing", "tight-sidepods", "high-power-mode"].entries()) setKeystone(b, b.teamId, i, id);
    expect(fitDistance(a, b)).toBeGreaterThan(0.04);
    expect(carIdentity(a, a.teamId).name).not.toBe(carIdentity(b, b.teamId).name);
    expect(carIdentity(a, a.teamId).famous).not.toEqual(carIdentity(b, b.teamId).famous);
  });
  it("compare cars is blurred and sharpens as races are run", () => {
    const s = newCareer("fer", 31);
    const rival = Object.keys(s.teams).find((x) => x !== s.teamId)!;
    const early = compareCars(s, rival)[0].range;
    s.round = 10;
    expect(compareCars(s, rival)[0].range).toBeLessThan(early);
  });
});
