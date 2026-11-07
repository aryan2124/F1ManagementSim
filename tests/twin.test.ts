import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { initDesigns } from "../src/career/design";
import { install, priceOf, treeOf } from "../src/career/ctree";
import { twinPick, twinRows } from "../src/career/twin";
import { startWeekend } from "../src/career/weekend";

const mk = (twin: boolean) => {
  const s = newCareer("fer", 21);
  initDesigns(s);
  s.era.current = { ...(s.era.current as object), startYear: s.year, length: 5, modules: twin ? [{ id: "twinChassis", intensity: 0.5 }] : [] } as never;
  const t = s.teams[s.teamId];
  const tr = treeOf(s, t);
  const [a, b] = tr.nodes.filter((n) => n.tier === 1).slice(0, 2);
  for (const n of [a, b]) tr.parts[n.id] = { id: n.id, day: s.day, copies: 2, onA: false, onB: false, tested: true };
  install(s, t, a.id, "A", true);
  install(s, t, b.id, "B", true);
  s.weekend = startWeekend(s);
  return { s, t, tr, a, b };
};

describe("twin chassis", () => {
  it("parts cost 30 percent more", () => {
    const x = mk(false), y = mk(true);
    expect(priceOf(y.s, y.a).cost / priceOf(x.s, x.a).cost).toBeCloseTo(1.3, 1);
  });
  it("after practice one chassis is picked for both cars, once, free", () => {
    const { s, tr, a, b } = mk(true);
    expect(twinPick(s, "A")).toMatch(/after practice/);
    s.weekend!.stage = "quali";
    const rows = twinRows(s);
    expect(rows[0].parts.length).toBe(1);
    const cash = s.teams[s.teamId].cash;
    expect(twinPick(s, "B")).toMatch(/chassis B/);
    expect(tr.parts[a.id].onA || tr.parts[a.id].onB).toBe(false);
    expect(tr.parts[b.id].onA && tr.parts[b.id].onB).toBe(true);
    expect(s.teams[s.teamId].cash).toBe(cash);
    expect(twinPick(s, "A")).toMatch(/already/);
  });
  it("keep leaves both cars as they were", () => {
    const { s, tr, a, b } = mk(true);
    s.weekend!.stage = "quali";
    twinPick(s, "keep");
    expect(tr.parts[a.id].onA && !tr.parts[a.id].onB).toBe(true);
    expect(tr.parts[b.id].onB && !tr.parts[b.id].onA).toBe(true);
  });
});
