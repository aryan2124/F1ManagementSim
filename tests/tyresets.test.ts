import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { driversOf } from "../src/career/finance";
import { startWeekend, practiceRun, setAlloc, setKeyFor, allocTotal, planSession, runQualiWithSets } from "../src/career/weekend";
import { loadCircuit } from "../src/game/circuits";
import { buildEntries } from "../src/game/data";
import { RaceSim } from "../src/sim/engine";
import { runQualifying } from "../src/sim/qualifying";
import { advisePit, adviseQuali, makeSets } from "../src/sim/tyreSets";

function fresh(seed = 5) {
  const s = newCareer("wil", seed);
  s.weekend = startWeekend(s);
  return s;
}

describe("tyre sets across the weekend", () => {
  it("recommends a split that adds up, and the player can confirm only once", () => {
    const s = fresh();
    const ws = s.weekend!;
    const rec = ws.allocRec!;
    expect(rec.alloc.S + rec.alloc.M + rec.alloc.H).toBe(allocTotal(ws.sprint));
    expect(rec.why.length).toBeGreaterThan(1);
    expect(setAlloc(s, { S: 1, M: 1, H: 1 }).ok).toBe(false);
    expect(setAlloc(s, { S: 0, M: rec.alloc.S + rec.alloc.M, H: rec.alloc.H }).ok).toBe(false);
    const r = setAlloc(s, rec.alloc);
    expect(r.ok).toBe(true);
    expect(setAlloc(s, rec.alloc).ok).toBe(false);
    const list = ws.setList![setKeyFor(s, driversOf(s, s.teamId)[0].id)];
    expect(list.filter((x) => x.compound === "S")).toHaveLength(rec.alloc.S);
  });

  it("a practice run wears the named set, and the wear is still there for the next run", () => {
    const s = fresh();
    const ws = s.weekend!;
    setAlloc(s, ws.allocRec!.alloc);
    const id = driversOf(s, s.teamId)[0].id;
    const key = setKeyFor(s, id);
    const set = ws.setList![key].find((x) => x.compound === "M")!;
    expect(set.runs).toBe(0);
    practiceRun(s, "tyres", ws.setup, id, { setId: set.id });
    expect(set.runs).toBe(1);
    expect(set.wear).toBeGreaterThan(0.2);
    const w1 = set.wear;
    ws.runsLeft = 3;
    practiceRun(s, "setup", ws.setup, id, { setId: set.id });
    expect(set.runs).toBe(2);
    expect(set.wear).toBeGreaterThan(w1);
    // other sets are untouched
    expect(ws.setList![key].filter((x) => x.runs > 0)).toHaveLength(1);
  });

  it("the same choices give the same sets", () => {
    const run = () => {
      const s = fresh(9);
      const ws = s.weekend!;
      setAlloc(s, ws.allocRec!.alloc);
      const id = driversOf(s, s.teamId)[0].id;
      practiceRun(s, "raceSim", ws.setup, id, { setId: "H1" });
      return JSON.stringify([ws.setList, ws.runs]);
    };
    expect(run()).toBe(run());
  });

  it("qualifying uses sets from the list and hands the wear back", () => {
    const s = fresh(12);
    const ws = s.weekend!;
    setAlloc(s, ws.allocRec!.alloc);
    const plan = planSession(s, "quali", true);
    const { rows, sets } = runQualiWithSets(plan);
    expect(rows.length).toBe(22);
    const mine = Object.values(sets).flat();
    expect(mine.some((x) => x.runs > 0 && x.log.some((l) => l.startsWith("Q")))).toBe(true);
  });

  it("advice is sensible", () => {
    const l = makeSets({ S: 4, M: 4, H: 4 });
    l[0].runs = 1; l[0].wear = 0.2;
    expect(adviseQuali(l, 1, false)!.id).toBe("S1");
    expect(adviseQuali(l, 3, false)!.id).toBe("S2");
    expect(advisePit(l, 10, 0.02, false).set!.compound).toBe("S");
    expect(advisePit(l, 50, 0.02, false).set!.compound).toBe("H");
    expect(advisePit(l, 10, 0.02, true).set!.compound).toBe("I");
  });
});

describe("small test fields", () => {
  const { track } = loadCircuit("silverstone");
  for (const n of [2, 3, 5, 9, 11]) {
    it(`runs qualifying and a race with ${n} cars`, () => {
      const all = buildEntries("mcl").map((e) => e.id);
      const mine = buildEntries("mcl").filter((e) => e.human).map((e) => e.id);
      const field = [...mine, ...all.filter((id) => !mine.includes(id))].slice(0, n);
      const entries = buildEntries("mcl", field);
      expect(entries).toHaveLength(n);
      const cfg = { seed: 3, track, entries, weather: { seed: 4, mode: "random" as const, session: "race" as const } };
      const q = runQualifying(cfg);
      expect(q.rows).toHaveLength(n);
      expect(new Set(q.rows.map((r) => r.carId)).size).toBe(n);
      const sim = new RaceSim({ ...cfg, laps: 6, grid: q.rows.map((r) => r.carId), rules: { tyrePool: true } } as never);
      let g = 0;
      while (sim.phase !== "finished" && g++ < 300) sim.run(2000);
      expect(sim.phase).toBe("finished");
      expect(sim.results().length).toBe(n);
    }, 120000);
  }
});
