import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { initDesigns } from "../src/career/design";
import { COMPS, DEEP_SHARE, lapOf, install, lockOf, makeTree, nodeKey, nodeOf, rangeOf, startBuild, startTest, tickTree, treeOf, treeTraits } from "../src/career/ctree";
import { keystoneTraits } from "../src/career/keystones";
import { advanceDay } from "../src/career/tick";
import { TRACK_DATA, trackRow } from "../src/game/trackdata";
import { seasonTable, treeFailures } from "../src/career/treeplay";
import { startWeekend, practiceRun, endPractice } from "../src/career/weekend";
import { assignCards, cardMods } from "../src/career/leadcards";
import { apply as reduce } from "../src/career/reducer";

const mk = () => { const s = newCareer("fer", 21); initDesigns(s); const t = s.teams[s.teamId]; t.cash = 500; t.capSpent = 0; t.facilities.factory = 5; return { s, t }; };
const finish = (s: ReturnType<typeof mk>["s"], t: ReturnType<typeof mk>["t"], id: string) => {
  const r = startBuild(s, t, id);
  expect(r.ok, r.message).toBe(true);
  for (let i = 0; i < 80 && !treeOf(s, t).parts[id]; i++) tickTree(s, t);
  expect(treeOf(s, t).parts[id]).toBeTruthy();
};

describe("car tree", () => {
  it("cuts the same tree for the same era and a different one for a new era", () => {
    const a = makeTree(5, 2026), b = makeTree(5, 2026), c = makeTree(5, 2030);
    expect(a.nodes).toEqual(b.nodes);
    expect(c.nodes.map((n) => n.fx)).not.toEqual(a.nodes.map((n) => n.fx));
    expect(a.nodes.length).toBe(COMPS.length * 3 * 4);
  });
  it("builds a part, spends the money, and installs it on one or both cars", () => {
    const { s, t } = mk();
    const cash = t.cash;
    finish(s, t, nodeKey("fw", 0, 1));
    expect(t.cash).toBeLessThan(cash);
    expect(install(s, t, nodeKey("fw", 0, 1), "A", true).ok).toBe(true);
    const one = treeTraits(t).downforce ?? 0;
    install(s, t, nodeKey("fw", 0, 1), "B", true);
    const both = treeTraits(t).downforce ?? 0;
    expect(both).toBeGreaterThan(one);
    expect(keystoneTraits(t).downforce).toBeGreaterThanOrEqual(both - 0.001);
  });
  it("the factory only holds as many builds as it has slots", () => {
    const { s, t } = mk();
    t.facilities.factory = 1;
    const ids = COMPS.map((c) => nodeKey(c.id, 0, 1));
    const ok = ids.filter((id) => startBuild(s, t, id).ok).length;
    expect(ok).toBe(1 + Math.floor(0.7));
  });
  it("depth against breadth: a specialist reaches tier 3, a spread factory does not", () => {
    const a = mk();
    for (const tier of [1, 2, 3]) {
      if (tier === 3) expect(lockOf(a.s, a.t, nodeOf(treeOf(a.s, a.t), nodeKey("floor", 0, 3))!).ok).toBe(true);
      if (tier < 3) finish(a.s, a.t, nodeKey("floor", 0, tier));
    }
    const b = mk();
    for (const c of COMPS) for (let br = 0; br < 3; br++) finish(b.s, b.t, nodeKey(c.id, br, 1));
    for (const c of COMPS) finish(b.s, b.t, nodeKey(c.id, 0, 2));
    const tier3 = nodeOf(treeOf(b.s, b.t), nodeKey("floor", 0, 3))!;
    const lk = lockOf(b.s, b.t, tier3);
    expect(lk.ok).toBe(false);
    expect(lk.state).toBe("deep");
    expect(DEEP_SHARE[2]).toBeGreaterThan(0);
  });
  it("a test narrows the staff's range", () => {
    const { s, t } = mk();
    const id = nodeKey("pu", 0, 1);
    finish(s, t, id);
    const nd = nodeOf(treeOf(s, t), id)!;
    const before = rangeOf(s, t, nd);
    expect(startTest(s, t, id).ok).toBe(true);
    for (let i = 0; i < 6; i++) tickTree(s, t);
    const after = rangeOf(s, t, nd);
    expect(after.tested).toBe(true);
    expect(after.hi - after.lo).toBeLessThan(before.hi - before.lo);
  });
  it("parc ferme locks the parts menu, and the reducer actions work", () => {
    const { s, t } = mk();
    const id = nodeKey("rw", 1, 1);
    expect(reduce(s, { type: "treeBuild", id }).ok).toBe(true);
    for (let i = 0; i < 40; i++) tickTree(s, t);
    expect(treeOf(s, t).parts[id]).toBeTruthy();
    s.weekend = { stage: "quali" } as never;
    expect(reduce(s, { type: "treeInstall", id, car: "A", on: true }).ok).toBe(false);
    s.weekend = { stage: "practice" } as never;
    expect(reduce(s, { type: "treeInstall", id, car: "A", on: true }).ok).toBe(true);
  });
  it("a failed part leaves one copy and asks which driver gets it", () => {
    const { s, t } = mk();
    const id = nodeKey("floor", 0, 1);
    finish(s, t, id);
    install(s, t, id, "A", true); install(s, t, id, "B", true);
    treeOf(s, t).mods = { speed: 1, cost: 1, testDays: 4, failure: 1000, gain: {} };
    treeFailures(s);
    expect(treeOf(s, t).parts[id].copies).toBe(1);
    const card = s.cards.find((c) => c.kind === "treeFail");
    expect(card).toBeTruthy();
    const morale = Object.values(s.drivers).filter((d) => d.teamId === s.teamId).map((d) => d.morale);
    reduce(s, { type: "card", id: card!.id, option: "A" });
    expect(treeOf(s, t).parts[id].onA).toBe(true);
    expect(Object.values(s.drivers).filter((d) => d.teamId === s.teamId).some((d, i) => d.morale < morale[i])).toBe(true);
  });
  it("a new era cuts a new tree and some expertise carries over", () => {
    const { s, t } = mk();
    finish(s, t, nodeKey("fw", 0, 1));
    const old = treeOf(s, t);
    s.era.current = { ...(s.era.current as object), startYear: (s.era.current?.startYear ?? 2026) + 5 } as never;
    const fresh = treeOf(s, t);
    expect(fresh).not.toBe(old);
    expect(Object.keys(fresh.parts).length).toBe(0);
    expect(fresh.carry["fw:0"]).toBeGreaterThan(0);
  });
  it("lead cards are assigned by role and change the factory", () => {
    const { s } = mk();
    assignCards(s);
    const withCard = Object.values(s.staff).filter((x) => x.card);
    expect(withCard.length).toBeGreaterThan(0);
    expect(cardMods(s, s.teamId).testDays).toBeLessThanOrEqual(4);
  });
  it("the track report covers the whole calendar and marks estimates", () => {
    const { s } = mk();
    const tbl = seasonTable(s);
    expect(tbl.rows.length).toBe(s.calendar.length);
    for (const r of s.calendar) expect(TRACK_DATA[r.circuitId], r.circuitId).toBeTruthy();
    expect(tbl.rows.flat().some((c) => c.endsWith("~"))).toBe(true);
    expect(trackRow("monza").pow).toBe(5);
    expect(trackRow("nowhere").df).toBe(3);
  });
  it("practice measures the fitted parts per session and files a dated report in the Practice folder", () => {
    const { s, t } = mk();
    const id = nodeKey("fw", 0, 1);
    finish(s, t, id);
    install(s, t, id, "A", true); install(s, t, id, "B", true);
    s.weekend = startWeekend(s);
    const ws = s.weekend!;
    const driver = Object.values(s.drivers).find((d) => d.teamId === s.teamId)!.id;
    practiceRun(s, "setup", { ...ws.setup }, driver);
    practiceRun(s, "setup", { ...ws.setup }, driver);
    expect(ws.tp?.cols[0]?.[id]?.n).toBeGreaterThan(0);
    const before = (s.letters ?? []).length;
    endPractice(s);
    const letter = (s.letters ?? [])[0];
    expect((s.letters ?? []).length).toBe(before + 1);
    expect(letter.folder).toBe("practice");
    expect(letter.table?.rows[0][0]).toBe(nodeOf(treeOf(s, t), id)!.name);
    expect(["KEEP", "WEAK", "BAD"]).toContain(letter.table!.rows[0].at(-1));
  });
  it("runs a year of days without blowing up", () => {
    const { s } = mk();
    for (let i = 0; i < 120; i++) advanceDay(s);
    expect(treeOf(s, s.teams[s.teamId]).nodes.length).toBe(72);
  }, 120000);
  it("previews an unbuilt part on the rig: tighter estimate, cheaper, not a measurement", () => {
    const { s, t } = mk();
    const nd = treeOf(s, t).nodes.filter((n) => n.tier === 1).sort((a, b) => Math.abs(lapOf(b)) - Math.abs(lapOf(a)))[0];
    const before = rangeOf(s, t, nd);
    const cash = t.cash;
    const r = startTest(s, t, nd.id);
    expect(r.ok, r.message).toBe(true);
    expect(cash - t.cash).toBeCloseTo(0.25, 2);
    expect(startTest(s, t, nd.id).ok).toBe(false);
    for (let i = 0; i < 6; i++) tickTree(s, t);
    expect(treeOf(s, t).sims).toContain(nd.id);
    const after = rangeOf(s, t, nd);
    expect(after.tested).toBe(false);
    expect(after.hi - after.lo).toBeLessThan(before.hi - before.lo);
    expect(startTest(s, t, nd.id).ok).toBe(false);
  });
});
