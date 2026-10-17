import { describe, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 60000 });
import { newCareer } from "../src/career/world";
import { reduce } from "../src/career/reducer";
import { parseCareer, exportCareer } from "../src/career/save";
import { autoPlayDays } from "../src/career/headless";
import { reportOf, confidenceOf } from "../src/career/academy";
import { stageOfGrievance } from "../src/career/people";
import { agenda } from "../src/career/agenda";
import { MODULES } from "../src/career/modules";
import { rulesOf } from "../src/career/eras";
import { fmtMoney } from "../src/career/util";

const mk = (seed = 7) => newCareer("wil", seed, 1, "quick");

describe("state purity and saves", () => {
  it("reduce never changes the state it was given", () => {
    const s = mk();
    const before = JSON.stringify(s);
    reduce(s, { type: "continue" });
    reduce(s, { type: "setBudget", key: "academy", value: 4 });
    expect(JSON.stringify(s)).toBe(before);
  });
  it("a save round trips as plain JSON", () => {
    const s = mk();
    autoPlayDays(s, 120);
    const back = parseCareer(exportCareer(s))!;
    expect(back).not.toBeNull();
    expect(JSON.stringify(back)).toBe(JSON.stringify(s));
  });
  it("an old save without the new fields loads and keeps playing", () => {
    const s = mk();
    const old = JSON.parse(exportCareer(s));
    for (const k of ["era", "academy", "budgets", "spendLog", "promises", "rumours", "rivalries", "records", "owner", "story", "legacy", "hall", "lastMonth"]) delete old[k];
    const back = parseCareer(JSON.stringify(old));
    expect(back).not.toBeNull();
    autoPlayDays(back!, 60);
    expect(back!.budgets.academy).toBeGreaterThanOrEqual(0);
  });
});

describe("money", () => {
  it("only the R&D line uses cap room, not driver or staff pay", () => {
    const s = mk();
    const cap0 = s.teams[s.teamId].capSpent;
    autoPlayDays(s, 90);
    // pay and facilities moved cash, but the cap line only moves with new parts and the like
    expect(s.teams[s.teamId].capSpent).toBeLessThan(cap0 + 60);
    expect(s.teams[s.teamId].ledger.drivers).toBeGreaterThan(0);
  });
  it("a budget ceiling stops a signing that would break it", () => {
    const s = mk();
    s.budgets.drivers = 1;
    const free = s.freeDrivers[0];
    const r = reduce(s, { type: "sign", driverId: free, slot: 0, offer: { salary: 20, years: 2, role: "equal" } });
    expect(r.ok).toBe(false);
  });
  it("every spend leaves a line in the log with a reason", () => {
    const s = mk();
    autoPlayDays(s, 200);
    for (const e of s.spendLog) expect(e.text.length).toBeGreaterThan(3);
    expect(fmtMoney(1.5)).toContain("1.5");
  }, 60000);
});

describe("academy", () => {
  it("about 1 in 40 prospects is generational, and the scout range narrows with trial days", () => {
    let n = 0;
    let g = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = mk(seed);
      for (const p of Object.values(s.academy.prospects)) {
        n++;
        if (p.generational) g++;
      }
    }
    expect(n).toBeGreaterThan(300);
    expect(g / n).toBeGreaterThan(0.25 / 40);
    expect(g / n).toBeLessThan(3 / 40);
    const s = mk(3);
    const p = Object.values(s.academy.prospects)[0];
    const w0 = (() => { const r = reportOf(s, p).stars; return r.hi - r.lo; })();
    p.seen = 40;
    p.trial = 1;
    const w1 = (() => { const r = reportOf(s, p).stars; return r.hi - r.lo; })();
    expect(confidenceOf(p)).toBeGreaterThan(0.8);
    expect(w1).toBeLessThanOrEqual(w0);
  });
});

describe("people and calendar", () => {
  it("grievance steps up through named stages", () => {
    expect(stageOfGrievance(0)).toBe(0);
    expect(stageOfGrievance(0.99)).toBeGreaterThanOrEqual(4);
  });
  it("the calendar lists races, the test, the launch and the winter shutdown", () => {
    const s = mk();
    const kinds = new Set(agenda(s).map((x) => x.kind));
    for (const k of ["race", "test", "launch", "shutdown", "contract"]) expect(kinds.has(k as never)).toBe(true);
  });
});

describe("eras", () => {
  it("the module library has 50 modules and flags are well formed", () => {
    expect(MODULES).toHaveLength(50);
    const live = { sim: 0, career: 0, rules: 0 };
    for (const m of MODULES) {
      live[m.live]++;
      expect(typeof m.flags(0.5)).toBe("object");
    }
    expect(live.sim + live.career).toBeGreaterThanOrEqual(30);
  });
  it("a season plays through with the era engine and nothing goes NaN", () => {
    const s = mk(11);
    autoPlayDays(s, 400);
    expect(Number.isFinite(s.teams[s.teamId].cash)).toBe(true);
    expect(rulesOf(s)).toBeTruthy();
    expect(JSON.stringify(s).length).toBeLessThan(6_000_000);
  }, 60000);
});
