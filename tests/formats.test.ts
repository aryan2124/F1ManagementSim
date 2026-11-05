import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { apply } from "../src/career/reducer";
import { formatState, formatTraits, formatsMonthly, pickFormat, placeBid } from "../src/career/formats";
import { keystoneTraits } from "../src/career/keystones";

const withMods = (...ids: string[]) => {
  const s = newCareer("fer", 12);
  s.era.current = { ...(s.era.current ?? ({} as never)), modules: ids.map((id) => ({ id, intensity: 0.6 })) } as never;
  return s;
};

describe("ruleset choices", () => {
  it("a layout pick is fixed for the season and moves the car", () => {
    const s = withMods("sixWheels", "tyreWars");
    const before = keystoneTraits(s.teams[s.teamId]);
    expect(pickFormat(s, s.teamId, "sixWheels", "rear").ok).toBe(true);
    expect(pickFormat(s, s.teamId, "sixWheels", "front").ok).toBe(false);
    expect(pickFormat(s, s.teamId, "kitLibrary", "mixed").ok).toBe(false);
    const after = keystoneTraits(s.teams[s.teamId]);
    expect(after.drive).toBeGreaterThan(before.drive);
    expect(after.efficiency).toBeLessThan(before.efficiency);
    formatsMonthly(s);
    const others = Object.values(s.teams).filter((t) => t.id !== s.teamId);
    expect(others.every((t) => t.formats?.sixWheels)).toBe(true);
    expect(new Set(others.map((t) => t.formats!.sixWheels)).size).toBeGreaterThan(1);
  });
  it("the picks lapse when the rule goes", () => {
    const s = withMods("sixWheels");
    pickFormat(s, s.teamId, "sixWheels", "rear");
    s.era.current!.modules = [] as never;
    formatsMonthly(s);
    expect(s.teams[s.teamId].formats?.sixWheels).toBeUndefined();
    expect(formatTraits(s.teams[s.teamId]).drive ?? 0).toBe(0);
  });
  it("sealed bids: the top bidders win and pay, the rest keep their money", () => {
    const s = withMods("freedomAuction");
    s.teams[s.teamId].cash = 50;
    formatsMonthly(s);
    const au = formatState(s).auctions.freedomAuction;
    expect(au.done).toBe(false);
    expect(placeBid(s, s.teamId, "freedomAuction", 999).ok).toBe(false);
    expect(placeBid(s, s.teamId, "freedomAuction", 3).ok).toBe(true);
    const cash = s.teams[s.teamId].cash;
    s.day = au.closes + 1;
    formatsMonthly(s);
    expect(au.done).toBe(true);
    expect(au.winners).toHaveLength(3);
    expect(au.winners).toContain(s.teamId);
    expect(s.teams[s.teamId].cash).toBeCloseTo(cash - 3, 2);
    expect(s.teams[s.teamId].auctionWins).toContain("freedomAuction");
    const losers = Object.keys(s.teams).filter((id) => !au.winners.includes(id));
    expect(losers.length).toBeGreaterThan(0);
    expect(apply).toBeTypeOf("function");
  });
});

import { FORMATS, AUCTIONS } from "../src/career/formats";
import { MODULE_BY_ID } from "../src/career/modules";
import { TRAITS } from "../src/career/types";
describe("choice catalogue", () => {
  it("every choice belongs to a real ruleset, has at least two options, and every option has a gain and a price", () => {
    for (const f of FORMATS) {
      expect(MODULE_BY_ID[f.moduleId], f.moduleId).toBeTruthy();
      expect(f.options.length).toBeGreaterThanOrEqual(2);
      for (const o of f.options) {
        const v = Object.entries(o.fx);
        expect(v.every(([k]) => TRAITS.includes(k as never))).toBe(true);
        expect(v.some(([, x]) => (x as number) > 0), `${o.id} has no gain`).toBe(true);
      }
    }
    for (const a of AUCTIONS) expect(MODULE_BY_ID[a.moduleId]).toBeTruthy();
    expect(new Set([...FORMATS.map((f) => f.moduleId), ...AUCTIONS.map((a) => a.moduleId)]).size).toBeGreaterThanOrEqual(13);
  });
});
