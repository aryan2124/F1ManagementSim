import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { initDesigns } from "../src/career/design";
import { setKeystone, keystoneTraits, SLOTS, SWAP_HOURS } from "../src/career/keystones";
import { fitMap } from "../src/career/fitmap";
import { effCar } from "../src/career/traits";

const mk = () => { const s = newCareer("fer", 11); initDesigns(s); return s; };

describe("keystones", () => {
  it("first fit is free, later swaps cost tunnel hours and understanding", () => {
    const s = mk(); const t = s.teams[s.teamId];
    t.keystones = []; t.keystonesSet = false; t.tunnelLeft = 200;
    expect(setKeystone(s, s.teamId, 0, "deep-floor").ok).toBe(true);
    expect(t.tunnelLeft).toBe(200);
    const err = t.know.downforce.err;
    expect(setKeystone(s, s.teamId, 0, "high-rake").ok).toBe(true);
    expect(t.tunnelLeft).toBe(200 - SWAP_HOURS);
    expect(t.know.downforce.err).toBeGreaterThan(err);
  });
  it("refuses duplicates, bad slots and swaps without hours", () => {
    const s = mk(); const t = s.teams[s.teamId];
    t.keystones = ["deep-floor"]; t.keystonesSet = true; t.tunnelLeft = 10;
    expect(setKeystone(s, s.teamId, SLOTS, "high-rake").ok).toBe(false);
    expect(setKeystone(s, s.teamId, 1, "deep-floor").ok).toBe(false);
    expect(setKeystone(s, s.teamId, 1, "high-rake").ok).toBe(false);
  });
  it("pairs add their own effect and the overlay moves the clock", () => {
    const s = mk(); const t = s.teams[s.teamId];
    const solo = keystoneTraits(t, ["deep-floor"]);
    const pair = keystoneTraits(t, ["deep-floor", "stiff-platform"]);
    expect(pair.downforce).toBeGreaterThan(solo.downforce);
    t.keystones = []; const a = effCar(s, t).aero;
    expect(effCar(s, t, undefined, ["deep-floor"]).aero).toBeGreaterThan(a);
  });
  it("the Fit Map ghost differs from the real map and AI teams carry keystones", () => {
    const s = mk();
    expect(Object.values(s.teams).filter((t) => t.id !== s.teamId).every((t: any) => (t.keystones?.length ?? 0) === 2)).toBe(true);
    const real = fitMap(s, s.teamId); const g = fitMap(s, s.teamId, ["low-drag-wing", "tight-sidepods", "big-inlets"]);
    expect(g.some((r, i) => r.edge !== real[i].edge)).toBe(true);
  });
});
