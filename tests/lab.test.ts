import { describe, expect, it } from "vitest";
import { solveSection } from "../src/career/airfoil";
import { DESIGN_KEYS, NEUTRAL, designTraits, frontSection, rearSection, clampDesign } from "../src/career/design";
import { runLab, corrOf, trackCorrelates, applyDesign } from "../src/career/lab";
import { newCareer } from "../src/career/world";
import { TRAITS } from "../src/career/types";

describe("airfoil and design", () => {
  it("symmetric section at zero angle gives no lift and lift rises with angle", () => {
    const z = solveSection({ alpha: 0, camber: 0, pos: 0.4, thick: 0.12 });
    expect(Math.abs(z.cl)).toBeLessThan(0.03);
    const a = solveSection({ alpha: 3, camber: 0, pos: 0.4, thick: 0.12 }).cl;
    const b = solveSection({ alpha: 6, camber: 0, pos: 0.4, thick: 0.12 }).cl;
    expect(b).toBeGreaterThan(a);
    expect(b).toBeGreaterThan(0.4);
    expect(b).toBeLessThan(1.1);
  });
  it("wings are real sections and every trait stays in a sane range", () => {
    expect(solveSection(rearSection(0.9)).cl).toBeGreaterThan(solveSection(rearSection(0.3)).cl - 0.01);
    for (const k of DESIGN_KEYS) for (const v of [0, 1]) {
      const t = designTraits(clampDesign({ ...NEUTRAL, [k]: v }));
      for (const tr of TRAITS) expect(Math.abs(t[tr])).toBeLessThan(1.5);
    }
    void frontSection;
  });
});

describe("lab", () => {
  it("tests cost allowance, readings carry error, track running raises trust, January applies the plan", () => {
    const s = newCareer("mcl", 5);
    const t = s.teams[s.teamId];
    const before = t.tunnelLeft;
    const r = runLab(s, s.teamId, "tunnel", { ...NEUTRAL, rearWing: 0.8 });
    expect(r.ok).toBe(true);
    expect(t.tunnelLeft).toBeLessThan(before);
    expect(r.entry!.readings.length).toBeGreaterThan(0);
    const c0 = corrOf(t, "tunnel");
    trackCorrelates(s, s.teamId);
    expect(corrOf(t, "tunnel")).toBeGreaterThan(c0);
    t.designNext = { ...NEUTRAL, rearWing: 0.8 };
    const out = applyDesign(s, s.teamId, 1, 0.8);
    expect(out).not.toBeNull();
    expect(t.designNext).toBeUndefined();
    t.tunnelLeft = 0;
    expect(runLab(s, s.teamId, "tunnel", NEUTRAL).ok).toBe(false);
  });
});

import { setupFor } from "../src/career/setup";
import { apply } from "../src/career/reducer";
describe("per driver setup", () => {
  it("offsets change what a driver runs and clamp", () => {
    const s = newCareer("mcl", 9);
    s.weekend = { setup: { balance: 0.1 }, axes: [{ id: "balance", label: "b", low: "", high: "" }] } as any;
    const id = Object.values(s.drivers).find((d) => d.teamId === s.teamId)!.id;
    apply(s, { type: "setTweak", driverId: id, tweak: { balance: 0.9 } });
    expect(s.weekend!.tweak![id].balance).toBe(0.4);
    expect(setupFor(s.weekend!, id).balance).toBeCloseTo(0.5);
    expect(setupFor(s.weekend!, "other").balance).toBeCloseTo(0.1);
  });
});

import { REAL_WDC, REAL_WCC_LIST, realTitleCount } from "../src/career/realhistory";
import { REAL_WCC } from "../src/career/records";
describe("real history", () => {
  it("is complete and agrees with the game's own constructor titles", () => {
    expect(REAL_WDC.length).toBe(76);
    expect(REAL_WCC_LIST.length).toBe(68);
    expect(realTitleCount("Lewis Hamilton")).toBe(7);
    expect(realTitleCount("Michael Schumacher")).toBe(7);
    const mcl = REAL_WCC_LIST.filter((x) => x[1] === "McLaren").map((x) => x[0]);
    expect(mcl).toEqual(REAL_WCC.mcl);
    const fer = REAL_WCC_LIST.filter((x) => x[1] === "Ferrari").map((x) => x[0]);
    expect(fer).toEqual(REAL_WCC.fer);
  });
});

import { generateDriver } from "../src/game/people";
import { Rng } from "../src/sim/rng";
describe("driver codes never run out and never loop", () => {
  it("makes drivers even when most near-miss codes are taken", () => {
    const rng = new Rng(5);
    const taken = new Set<string>();
    const codes = new Set<string>();
    for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) for (const c of [65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90]) if (a < 80) codes.add(String.fromCharCode(a, b, c));
    for (let i = 0; i < 60; i++) expect(generateDriver(rng, "F4", taken, codes, `x${i}`).code).toMatch(/^[A-Z]{3}$/);
  });
});
