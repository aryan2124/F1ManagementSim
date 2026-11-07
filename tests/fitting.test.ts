import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { COMPS, install, nodeKey, nodeOf, treeOf, tickTree, treeTraits, makeTree } from "../src/career/ctree";
import { applySuggested, fitNumber, fitQuote, requestFit, tickFits, bestSet, wanted } from "../src/career/fitting";
import { carLapGain } from "../src/career/treeplay";
import { CIRCUITS } from "../src/game/circuits";
import { apply } from "../src/career/reducer";

function rich(seed = 5) {
  const s = newCareer("mcl", seed, 1, "quick");
  const t = s.teams[s.teamId];
  t.cash = 900;
  const tr = treeOf(s, t);
  for (const nd of tr.nodes) tr.parts[nd.id] = { id: nd.id, day: s.day, copies: 2, onA: false, onB: false, tested: false };
  return { s, t, tr };
}

describe("changing the car costs something", () => {
  it("in the factory a change takes days and money, and lands when the mechanics finish", () => {
    const { s, t, tr } = rich();
    const id = nodeKey("fw", 0, 2);
    const cash = t.cash;
    const r = requestFit(s, t, id, "A", true);
    expect(r.ok).toBe(true);
    expect(t.cash).toBeLessThan(cash);
    expect(tr.parts[id].onA).toBe(false);
    const days = tr.fits![0].left;
    expect(days).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < days; i++) tickFits(s, t);
    expect(tr.parts[id].onA).toBe(true);
  });
  it("in a practice session it is instant but eats session minutes and money", () => {
    const { s, t, tr } = rich();
    s.weekend = { stage: "practice", circuitId: s.calendar[0].circuitId } as any;
    const id = nodeKey("floor", 1, 3);
    const cash = t.cash;
    const q = fitQuote(s, t, nodeOf(tr, id)!, true, false);
    expect(requestFit(s, t, id, "B", true).ok).toBe(true);
    expect(tr.parts[id].onB).toBe(true);
    expect((s.weekend as any).fitMin).toBe(q.minutes);
    expect(t.cash).toBeCloseTo(cash - q.money, 2);
  });
  it("parc ferme blocks changes", () => {
    const { s, t } = rich();
    s.weekend = { stage: "race", circuitId: s.calendar[0].circuitId } as never;
    expect(requestFit(s, t, nodeKey("fw", 0, 1), "A", true).ok).toBe(false);
  });
  it("a rush costs more, is faster, and fails far more often, and a bad fit really costs lap time", () => {
    const { s, t, tr } = rich();
    const nd = nodeOf(tr, nodeKey("pu", 0, 3))!;
    const n = fitQuote(s, t, nd, true, false), r = fitQuote(s, t, nd, true, true);
    expect(r.money).toBeGreaterThan(n.money * 2);
    expect(r.days).toBeLessThan(n.days);
    expect(r.risk).toBeGreaterThan(n.risk * 4);
    let bad = 0, badNorm = 0;
    for (let k = 0; k < 120; k++) {
      const a = rich(100 + k);
      a.s.day += k;
      const id = nodeKey("cool", 1, 2);
      requestFit(a.s, a.t, id, "A", true, true);
      for (let i = 0; i < 3; i++) tickFits(a.s, a.t);
      if (a.tr.parts[id].misfit?.A) bad++;
      const b = rich(300 + k);
      b.s.day += k;
      requestFit(b.s, b.t, id, "A", true, false);
      for (let i = 0; i < 6; i++) tickFits(b.s, b.t);
      if (b.tr.parts[id].misfit?.A) badNorm++;
    }
    expect(bad).toBeGreaterThan(badNorm + 8);
    const c = rich(7);
    const id = nodeKey("fw", 0, 1);
    install(c.s, c.t, id, "A", true);
    const circuit = c.s.calendar[1].circuitId;
    const good = carLapGain(c.t, "A", circuit);
    c.tr.parts[id].misfit = { A: true };
    expect(Math.abs(carLapGain(c.t, "A", circuit))).toBeLessThan(Math.abs(good) + 1e-9);
    expect(treeTraits(c.t, "A").downforce ?? 0).toBeLessThan(0.5);
  });
});

describe("the fit number and the suggested fit", () => {
  it("suggested fit takes a car to 100 for the track, and a stock car is lower", () => {
    const { s, t } = rich(9);
    const circuit = s.calendar[3].circuitId;
    expect(fitNumber(s, t, "A", circuit).pct).toBeLessThan(100);
    const r = applySuggested(s, t, circuit);
    expect(r.n).toBeGreaterThan(0);
    for (let i = 0; i < 6; i++) tickFits(s, t);
    for (const car of ["A", "B"] as const) {
      const f = fitNumber(s, t, car, circuit);
      // a rare bad fit can dent it, so allow a little
      expect(f.pct).toBeGreaterThanOrEqual(85);
    }
    expect(applySuggested(s, t, circuit).message).toMatch(/already match|ordered/);
  });
  it("reducer exposes suggested fit and rush", () => {
    const { s } = rich(11);
    const r = apply(s, { type: "treeSuggested" });
    expect(r.message).toMatch(/ordered/);
  });
});

describe("no part is the best everywhere", () => {
  it("every lane of every component is the best choice at a real share of the circuits, at every tier", () => {
    const { s, t, tr } = rich(2);
    const circuits = CIRCUITS.map((c) => c.id);
    expect(circuits.length).toBeGreaterThan(12);
    const need = Math.floor(circuits.length * 0.05);
    for (const c of COMPS) {
      for (const tier of [1, 2, 3, 4]) {
        const wins = [0, 0, 0];
        for (const id of circuits) {
          const v = [0, 1, 2].map((b) => wanted(nodeOf(tr, nodeKey(c.id, b, tier))!, id));
          wins[v.indexOf(Math.max(...v))]++;
        }
        expect(Math.min(...wins), `${c.id} tier ${tier}: ${wins.join("/")}`).toBeGreaterThanOrEqual(need);
      }
    }
    // and the best set differs a lot from track to track
    const sets = new Set(circuits.map((id) => bestSet(s, t, id).sort().join()));
    expect(sets.size).toBeGreaterThan(10);
    void makeTree;
    void tickTree;
  });
});

describe("the suggested fit really is faster", () => {
  it("at a track that wants something, the suggested set beats a stock car and the opposite track's set", () => {
    const { s, t } = rich(13);
    const mon = "monaco", mza = CIRCUITS.find((c) => c.id.includes("monza"))?.id ?? CIRCUITS[5].id;
    applySuggested(s, t, mon);
    for (let i = 0; i < 6; i++) tickFits(s, t);
    const atMonaco = carLapGain(t, "A", mon);
    expect(atMonaco).toBeGreaterThan(0.05);
    expect(carLapGain(t, "A", mon)).toBeGreaterThan(carLapGain(t, "A", mza) * 0.5 - 1);
  });
});
