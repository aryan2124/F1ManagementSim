import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { initDesigns } from "../src/career/design";
import { install, treeOf } from "../src/career/ctree";
import { copyRival, isDisclosureRound, publish, publishable, settlePaddock, COPY_GAIN, RIVAL_GAIN } from "../src/career/paddock";
import { startWeekend } from "../src/career/weekend";

const mk = (round = 2) => {
  const s = newCareer("fer", 21);
  initDesigns(s);
  s.era.current = { ...(s.era.current as object), startYear: s.year, length: 5, modules: [{ id: "transparentPaddock", intensity: 0.5 }] } as never;
  const t = s.teams[s.teamId];
  const tr = treeOf(s, t);
  const n = tr.nodes.find((x) => x.tier === 1)!;
  tr.parts[n.id] = { id: n.id, day: s.day, copies: 2, onA: false, onB: false, tested: true };
  install(s, t, n.id, "A", true);
  s.round = round;
  s.weekend = startWeekend(s);
  return s;
};

describe("transparent paddock", () => {
  it("only every third round is a disclosure weekend", () => {
    expect([0, 1, 2, 3, 4, 5].filter(isDisclosureRound)).toEqual([2, 5]);
    expect(mk(1).weekend!.paddock).toBeUndefined();
    expect(mk(2).weekend!.paddock!.rivals.length).toBe(3);
  });
  it("publishing is once, from a fitted part", () => {
    const s = mk();
    expect(publishable(s).length).toBe(1);
    expect(publish(s, undefined, true)).toMatch(/truthfully/);
    expect(publish(s, undefined, true)).toMatch(/already/);
  });
  it("copying moves your car by the honest or decoy amount, once", () => {
    const s = mk();
    const r = s.weekend!.paddock!.rivals[0];
    const before = s.teams[s.teamId].car[r.area];
    copyRival(s, r.team);
    const after = s.teams[s.teamId].car[r.area];
    expect(Math.abs(after - before)).toBeGreaterThan(0.01);
    expect(after > before).toBe(r.honest);
    if (r.honest) expect(after - before).toBeCloseTo(COPY_GAIN, 3);
    expect(copyRival(s, r.team)).toMatch(/already/);
  });
  it("a truthful disclosure helps a rival; a decoy hurts one; an unpublished one defaults to honest", () => {
    const s = mk();
    const snap = JSON.stringify(Object.values(s.teams).map((t) => t.car));
    publish(s, undefined, true);
    settlePaddock(s, s.weekend!);
    const total = (x: string) => (JSON.parse(x) as Record<string, number>[]).reduce((a, c) => a + Object.values(c).reduce((p, q) => p + q, 0), 0);
    const now = JSON.stringify(Object.values(s.teams).map((t) => t.car));
    expect(total(now) - total(snap)).toBeCloseTo(RIVAL_GAIN, 3);
    const s2 = mk();
    settlePaddock(s2, s2.weekend!);
    expect(s2.weekend!.paddock!.published!.honest).toBe(true);
    const s3 = mk();
    publish(s3, undefined, false);
    const snap3 = JSON.stringify(Object.values(s3.teams).map((t) => t.car));
    settlePaddock(s3, s3.weekend!);
    expect(total(JSON.stringify(Object.values(s3.teams).map((t) => t.car))) - total(snap3)).toBeLessThan(0);
  });
});
