import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { rulesOf } from "../src/career/eras";
import { auditMonthly, liveLoopholes } from "../src/career/loopholes";
import { startWeekend } from "../src/career/weekend";
import { agenda } from "../src/career/agenda";
import { MODULE_BY_ID } from "../src/career/modules";

const withMods = (...ids: string[]) => {
  const s = newCareer("fer", 12);
  s.era.current = { ...(s.era.current ?? ({} as never)), modules: ids.map((id) => ({ id, intensity: 0.6 })) } as never;
  return s;
};

describe("first wave rulesets", () => {
  it("all four exist and turn on their flags", () => {
    const s = withMods("openCooling", "attackZones", "twoRaceWeekend", "auditor");
    const r = rulesOf(s);
    expect(r.openCooling).toBeGreaterThan(0);
    expect(r.attackZones).toBe(true);
    expect(r.pushToPass).toBeGreaterThan(0);
    expect(r.allSprints).toBe(true);
    expect(r.auditor).toBeGreaterThan(10);
    for (const id of ["openCooling", "attackZones", "twoRaceWeekend", "auditor"]) expect(MODULE_BY_ID[id]).toBeTruthy();
  });
  it("two-race weekend makes every weekend a sprint weekend", () => {
    const s = withMods("twoRaceWeekend");
    expect(agenda(s).filter((a) => a.kind === "sprint").length).toBe(s.calendar.length);
    expect(startWeekend(s).sprint).toBe(true);
  });
  it("the auditor fines overspend once a quarter and the gap is a loophole", () => {
    const s = withMods("auditor");
    const t = s.teams[s.teamId];
    t.ledger.rnd = 60;
    const cash = t.cash;
    auditMonthly(s);
    expect(t.cash).toBeLessThan(cash);
    const after = t.cash;
    s.day += 28; auditMonthly(s);
    expect(t.cash).toBe(after);
    s.day += 70; auditMonthly(s);
    expect(t.cash).toBeLessThan(after);
    expect(liveLoopholes(s).map((l) => l.id)).toContain("consultancy");
  });
});
