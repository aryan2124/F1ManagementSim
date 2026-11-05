import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { apply } from "../src/career/reducer";
import { liveLoopholes, loopholesMonthly, loopState, LOOPHOLES } from "../src/career/loopholes";
import { effCar } from "../src/career/traits";

function withModule(id: string) {
  const s = newCareer("fer", 8);
  s.era.current = { ...(s.era.current ?? ({} as never)), modules: [{ id, intensity: 0.5 }] } as never;
  return s;
}

describe("loopholes", () => {
  it("a live rule exposes its gap and working it moves the clock", () => {
    const s = withModule("playoff");
    expect(liveLoopholes(s).map((l) => l.id)).toContain("sandbag");
    const before = JSON.stringify(effCar(s, s.teams[s.teamId]));
    expect(apply(s, { type: "exploit", id: "sandbag", on: true }).ok).toBe(true);
    expect(JSON.stringify(effCar(s, s.teams[s.teamId]))).not.toBe(before);
    expect(apply(s, { type: "exploit", id: "zonepark", on: true }).ok).toBe(false);
  });
  it("heat brings a hint, then a patch and a fine, and the gain is gone", () => {
    const s = withModule("playoff");
    apply(s, { type: "exploit", id: "sandbag", on: true });
    const cash = s.teams[s.teamId].cash;
    for (let i = 0; i < 12; i++) { s.day += 28; loopholesMonthly(s); }
    const st = loopState(s);
    expect(st.hinted).toContain("sandbag");
    expect(st.patched).toContain("sandbag");
    expect(s.teams[s.teamId].loops ?? []).not.toContain("sandbag");
    expect(s.teams[s.teamId].cash).toBeLessThan(cash);
    expect(liveLoopholes(s).map((l) => l.id)).not.toContain("sandbag");
  });
  it("every loophole names a real module", async () => {
    const { MODULE_BY_ID } = await import("../src/career/modules");
    for (const l of LOOPHOLES) expect(MODULE_BY_ID[l.mod], l.id).toBeTruthy();
  });
});
