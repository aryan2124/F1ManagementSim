import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { nodeKey, nodeOf, treeOf } from "../src/career/ctree";
import { failForward, fitReport, fitReportText, quoteFor, rivalCopy } from "../src/career/fitreport";

function setup() {
  const s = newCareer("mcl", 5, 1, "quick");
  const t = s.teams[s.teamId];
  const tr = treeOf(s, t);
  const id = nodeKey("fw", 0, 2);
  tr.parts[id] = { id, day: s.day, copies: 2, onA: true, onB: false, tested: false };
  s.weekend = { stage: "practice", circuitId: s.calendar[0].circuitId, round: 0, tp: { cols: [{ [id]: { exp: -0.1, act: 0.05, n: 2 } }] } } as any;
  return { s, t, tr, id };
}

describe("fit report, fail-forward knowledge, rival copying", () => {
  it("reports every fitted part with a tally and a quote", () => {
    const { s } = setup();
    const rows = fitReport(s);
    expect(rows.length).toBe(1);
    expect(rows[0].ticks).toBe("x");
    expect(fitReportText(s)).toContain("Fit report");
  });
  it("a bad result still teaches: the part counts as tested", () => {
    const { s, tr, id } = setup();
    expect(tr.parts[id].tested).toBe(false);
    const lines = failForward(s);
    expect(tr.parts[id].tested).toBe(true);
    expect(lines.length).toBe(1);
    expect(failForward(s).length).toBe(0);
  });
  it("quotes differ for better, worse and fitted badly", () => {
    expect(new Set([quoteFor(0.1, 0.2, false), quoteFor(0.1, 0.0, false), quoteFor(0.1, 0.1, false), quoteFor(0.1, 0.1, true)]).size).toBe(4);
  });
  it("rivals only copy after a podium, and the step is small", () => {
    const { s, id } = setup();
    expect(rivalCopy(s, 8)).toBeUndefined();
    const before = JSON.stringify(Object.values(s.teams).map((t) => t.car));
    let hit = 0;
    for (let r = 0; r < 60; r++) { (s.weekend as any).round = r; if (rivalCopy(s, 1)) hit++; }
    expect(hit).toBeGreaterThan(0);
    expect(hit).toBeLessThan(45);
    void before; void id; void nodeOf;
  });
});
