import { describe, expect, it } from "vitest";
import { DRIVERS } from "../src/game/data";
import { iqFacets, raceIQ, stintBias } from "../src/sim/iq";

describe("race IQ", () => {
  it("spreads drivers across a believable range, with veterans sharper than rookies", () => {
    const all = Object.values(DRIVERS).flat();
    const iqs = all.map((d) => ({ code: d.code, iq: raceIQ(d) }));
    const lo = Math.min(...iqs.map((x) => x.iq));
    const hi = Math.max(...iqs.map((x) => x.iq));
    console.log(iqs.sort((a, b) => b.iq - a.iq).map((x) => `${x.code} ${Math.round(x.iq * 100)}`).join(", "));
    expect(hi - lo).toBeGreaterThan(0.35);
    const alo = all.find((d) => d.code === "GAR")!;
    const lin = all.find((d) => d.code === "WHI")!;
    expect(raceIQ(alo)).toBeGreaterThan(raceIQ(lin));
    // experience grows with the years
    expect(raceIQ(lin, 2036)).toBeGreaterThan(raceIQ(lin, 2026));
  });

  it("a fixed value wins, facets stay in range, and misreading is steady within a stint", () => {
    const d = { ...Object.values(DRIVERS).flat()[0], iq: 0.3 };
    expect(raceIQ(d)).toBe(0.3);
    const f = iqFacets(d);
    for (const v of Object.values(f)) expect(v).toBeGreaterThanOrEqual(0);
    expect(stintBias("a", 1)).toBe(stintBias("a", 1));
    expect(Math.abs(stintBias("a", 1))).toBeLessThanOrEqual(1);
  });
});
