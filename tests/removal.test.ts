import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { factorTrial, FACTOR_NAMES, type FactorName } from "../src/career/factors";
import { boardMove } from "../src/career/board";
import { designQuality } from "../src/career/nextcar";
import { driverSpecFor, carSpec } from "../src/career/car";
import { monthlyBooks } from "../src/career/finance";
import { askingSalary } from "../src/career/contracts";
import { accuracy } from "../src/career/rnd";
import { quality } from "../src/career/know";
import { driversOf } from "../src/career/finance";
import { TRAITS } from "../src/career/types";
import { brandWeekly } from "../src/career/brand";
import { generateIdeas } from "../src/career/rnd";
import { runLab } from "../src/career/lab";
import { NEUTRAL } from "../src/career/design";

/** Each output is a pure read of the state under a pinned factor. */
function outputs(): Record<string, number> {
  const s = newCareer("wil", 4);
  s.day += 80; s.round = 3;
  const t = s.teams[s.teamId];
  const d = driversOf(s, s.teamId)[0];
  const g = structuredClone(s); boardMove(g, g.teams[g.teamId], 5, "x");
  const l = structuredClone(s); boardMove(l, l.teams[l.teamId], -5, "x");
  const m = structuredClone(s); const c0 = m.teams[m.teamId].cash; monthlyBooks(m);
  const gi = structuredClone(s); const ideas = generateIdeas(gi, gi.teamId);
  const lb = structuredClone(s); const lab = runLab(lb, lb.teamId, "desk", { ...NEUTRAL, rearWing: 0.8 });
  const bw = structuredClone(s); const f0 = bw.brand.fans; const sm0 = bw.teams[bw.teamId].sponsors.reduce((a, x) => a + x.mood, 0); brandWeekly(bw);
  return {
    fansDrift: bw.brand.fans - f0,
    sponsorMood: bw.teams[bw.teamId].sponsors.reduce((a, x) => a + x.mood, 0) - sm0,
    ideaGain: ideas.reduce((a, i) => a + i.trueGain, 0),
    labErr: lab.entry?.readings[0]?.err ?? 0,
    boardGain: g.teams[g.teamId].board - t.board,
    boardLoss: l.teams[l.teamId].board - t.board,
    designQuality: designQuality(s),
    pace: driverSpecFor(s, d.id, s.teamId).pace,
    pit: carSpec(s, s.teamId).pitCrew,
    books: m.teams[m.teamId].cash - c0,
    ask: askingSalary(s, d),
    accuracy: accuracy(s, s.teamId, "aero"),
    read: quality(s, s.teamId, TRAITS[0]),
  };
}

describe("removal test", () => {
  it("pinning any one factor to the floor changes at least three outputs", () => {
    const base = outputs();
    const report: string[] = [];
    for (const f of FACTOR_NAMES as readonly FactorName[]) {
      for (const k of Object.keys(factorTrial)) delete (factorTrial as any)[k];
      factorTrial[f] = 0.7;
      const low = outputs();
      for (const k of Object.keys(factorTrial)) delete (factorTrial as any)[k];
      const moved = Object.keys(base).filter((k) => Math.abs(low[k] - base[k]) > 1e-6);
      report.push(`${f}: ${moved.join(",")}`);
      expect(moved.length, `${f} moves ${moved.join(",")}`).toBeGreaterThanOrEqual(3);
    }
    console.log(report.join("\n"));
  });
});
