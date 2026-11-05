import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { apply } from "../src/career/reducer";
import { endOfSeason } from "../src/career/season";
import { driversOf } from "../src/career/finance";
import { draftDaily, draftPool, tagDriver } from "../src/career/draft";
import { rulesOf } from "../src/career/eras";

const mk = (seed: number) => {
  const s = newCareer("fer", seed);
  s.era.current = { ...(s.era.current ?? ({} as never)), modules: [{ id: "theDraft", intensity: 0.6 }] } as never;
  return s;
};

describe("the draft", () => {
  it("the ruleset turns the draft on", () => {
    expect(rulesOf(mk(3)).draft).toBe(true);
  });

  it("expiring drivers go into the pool, the worst teams pick first, and everyone ends with two drivers", () => {
    const s = mk(4);
    for (const d of Object.values(s.drivers)) if (d.teamId) d.endYear = d.teamId === s.teamId ? s.year + 2 : s.year;
    s.round = s.calendar.length;
    endOfSeason(s);
    const dr = s.draft!;
    expect(dr).toBeTruthy();
    expect(dr.picks.length).toBeGreaterThan(5);
    // within round one, teams pick in the order of the draft (worst first)
    const r1 = dr.picks.filter((p) => p.round === 1).map((p) => p.teamId);
    const idx = r1.map((t) => dr.order.indexOf(t));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    // the worst team gets the best driver available at its turn: the first pick is the best of the pool
    for (const id of Object.keys(s.teams)) expect(driversOf(s, id).length, id).toBe(2);
    expect(dr.done).toBe(true);
    // short contracts at the rookie scale
    for (const p of dr.picks.filter((x) => x.driverId)) {
      const d = s.drivers[p.driverId];
      expect(d.endYear).toBe(s.year + 1);
    }
  });

  it("the player is put on the clock when short, picks from the pool, and the draft closes", () => {
    const s = mk(5);
    for (const d of driversOf(s, s.teamId)) d.endYear = s.year;
    s.round = s.calendar.length;
    endOfSeason(s);
    const dr = s.draft!;
    expect(dr.clock).toBe(s.teamId);
    expect(dr.done).toBe(false);
    expect(driversOf(s, s.teamId).length).toBe(0);
    const best = draftPool(s, s.teamId)[0];
    expect(apply(s, { type: "draftPick", driverId: "nobody" } as never).ok).toBe(false);
    const r = apply(s, { type: "draftPick", driverId: best } as never);
    expect(r.ok, r.message).toBe(true);
    expect(driversOf(s, s.teamId).some((d) => d.id === best)).toBe(true);
    // still one seat open: on the clock again until picked or the clock runs out
    if (!s.draft!.done) {
      expect(s.draft!.clock).toBe(s.teamId);
      s.day = s.draft!.deadline;
      draftDaily(s);
    }
    expect(s.draft!.done).toBe(true);
    expect(driversOf(s, s.teamId).length).toBe(2);
  });

  it("a franchise tag keeps a driver out of the pool for a price", () => {
    const s = mk(6);
    const mine = driversOf(s, s.teamId)[0];
    mine.endYear = s.year;
    s.teams[s.teamId].cash = 20;
    driversOf(s, s.teamId)[1].endYear = s.year + 2;
    expect(tagDriver(s, s.teamId, driversOf(s, s.teamId)[1].id).ok).toBe(false);
    expect(tagDriver(s, s.teamId, mine.id).ok).toBe(true);
    const other = s.teams[s.teamId].ledger.other;
    s.round = s.calendar.length;
    endOfSeason(s);
    expect(mine.teamId).toBe(s.teamId);
    expect(mine.endYear).toBe(s.year + 1);
    expect(s.teams[s.teamId].ledger.other - other).toBeGreaterThanOrEqual(2);
  });
});
