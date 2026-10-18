import { describe, expect, it } from "vitest";
import { rulesDemo, tutorialCareer } from "../src/career/tutorial";

describe("tutorial", () => {
  it("gives the same practice career every time and never touches the real state", () => {
    const a = tutorialCareer("wil");
    const b = tutorialCareer("wil");
    expect(a.seed).toBe(b.seed);
    expect(a.raceLength).toBe("quick");
    expect(a.guidance).toBe("full");
  });
  it("the mock race changes the order when the rules are rewritten, and leaves the career alone", () => {
    const s = tutorialCareer("wil");
    const snap = JSON.stringify(s);
    const r = rulesDemo(s);
    expect(JSON.stringify(s)).toBe(snap);
    expect(r.before.length).toBeGreaterThanOrEqual(10);
    expect(r.after.length).toBe(r.before.length);
    expect(r.before.map((x) => x.id)).not.toEqual(r.after.map((x) => x.id));
    expect(r.weights).toHaveLength(6);
    expect(r.weights.slice(0, 3).every((x) => x.to < x.from)).toBe(true);
    expect(r.weights.slice(3).every((x) => x.to > x.from)).toBe(true);
    expect(rulesDemo(s).after.map((x) => x.id)).toEqual(r.after.map((x) => x.id));
  }, 120000);
});
