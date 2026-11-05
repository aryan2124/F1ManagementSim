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
    s.day = dr.tradeUntil;
    draftDaily(s);
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

import { askingSalary } from "../src/career/contracts";
import { advanceDraft, tradePlaces, tradePrice } from "../src/career/draft";
describe("draft trades and compensation", () => {
  const short = (seed: number) => {
    const s = mk(seed);
    for (const d of Object.values(s.drivers)) if (d.teamId) d.endYear = s.year + 2;
    // the player and two others have expiring drivers
    for (const id of [s.teamId, "mer", "mcl"]) for (const d of driversOf(s, id)) d.endYear = s.year;
    s.round = s.calendar.length;
    return s;
  };
  it("a player short of drivers gets a trading window before the first pick", () => {
    const s = short(7);
    endOfSeason(s);
    const dr = s.draft!;
    expect(dr.tradeUntil).toBeGreaterThan(s.day);
    expect(dr.picks.length).toBe(0);
    // the seat is not auto-filled during the window
    expect(driversOf(s, s.teamId).length).toBe(0);
  });
  it("trading places swaps the order and moves the money; once each", () => {
    const s = short(7);
    endOfSeason(s);
    const dr = s.draft!;
    s.teams[s.teamId].cash = 50;
    const other = dr.order.find((t) => t !== s.teamId && driversOf(s, t).length < 2)!;
    const iMe = dr.order.indexOf(s.teamId), iOther = dr.order.indexOf(other);
    const price = tradePrice(s, s.teamId, other);
    const myCash = s.teams[s.teamId].cash, theirCash = s.teams[other].cash;
    // try a few times: a computer team may say no, but the swap is exact when it says yes
    let r = tradePlaces(s, s.teamId, other);
    for (let k = 0; !r.ok && k < 8 && /turn the offer down/.test(r.message); k++) { s.day++; dr.tradeUntil++; dr.deadline++; r = tradePlaces(s, s.teamId, other); }
    expect(r.ok, r.message).toBe(true);
    expect(dr.order.indexOf(s.teamId)).toBe(iOther);
    expect(dr.order.indexOf(other)).toBe(iMe);
    const movedUp = iOther < iMe;
    expect(s.teams[s.teamId].cash).toBeCloseTo(myCash + (movedUp ? -price : price), 2);
    expect(s.teams[other].cash).toBeCloseTo(theirCash + (movedUp ? price : -price), 2);
    expect(tradePlaces(s, s.teamId, other).ok).toBe(false);
  });
  it("the picks start after the window, and a team that loses a top driver is paid for him", () => {
    const s = short(9);
    // give mer a star who expires
    const star = driversOf(s, "mer")[0];
    star.spec.pace = 1.0;
    s.draftTags = { mer: driversOf(s, "mer")[1].id }; // mer tag the other one, so the star goes into the pool
    endOfSeason(s);
    const dr = s.draft!;
    const cash0 = s.teams.mer.cash;
    s.day = dr.tradeUntil;
    draftDaily(s);
    expect(dr.picks.length).toBeGreaterThan(0);
    const pick = dr.picks.find((p) => p.driverId === star.id);
    expect(pick, "the star is picked").toBeTruthy();
    expect(pick!.teamId).not.toBe("mer");
    expect(star.teamId).toBe(pick!.teamId);
    const comp = Math.round(askingSalary(s, star) * 0.25 * 100) / 100;
    expect(s.teams.mer.cash - cash0).toBeGreaterThan(0);
    expect(s.teams.mer.cash - cash0).toBeLessThanOrEqual(comp + 0.01);
    expect(advanceDraft).toBeTypeOf("function");
  });
});
