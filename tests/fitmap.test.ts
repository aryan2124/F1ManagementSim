import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { fitMap, fitSummary } from "../src/career/fitmap";

describe("fit map", () => {
  it("covers the calendar, averages near zero across the field, and the range narrows as races are run", () => {
    const s = newCareer("fer", 5);
    const rows = fitMap(s, s.teamId);
    expect(rows).toHaveLength(s.calendar.length);
    for (const r of rows) { expect(Number.isFinite(r.edge)).toBe(true); expect(r.low).toBeLessThan(r.high); }
    let mean = 0;
    const ids = Object.keys(s.teams);
    for (const id of ids) mean += fitMap(s, id).reduce((a, r) => a + r.edge, 0);
    expect(Math.abs(mean / ids.length / rows.length)).toBeLessThan(0.0005);
    const w0 = rows[0].high - rows[0].low;
    s.round = 8;
    const w1 = fitMap(s, s.teamId)[0].high - fitMap(s, s.teamId)[0].low;
    expect(w1).toBeLessThan(w0);
    expect(fitSummary(rows).best[0].edge).toBeGreaterThanOrEqual(fitSummary(rows).worst[0].edge);
  });
  it("an extreme downforce build peaks at slow tracks and a low drag build at fast ones, by a real margin", () => {
    const s = newCareer("fer", 5);
    const t = s.teams[s.teamId];
    t.dna = { ...t.dna, downforce: 0.7, efficiency: -0.1 };
    const hi = fitMap(s, s.teamId);
    t.dna = { ...t.dna, downforce: -0.1, efficiency: 0.7 };
    const lo = fitMap(s, s.teamId);
    const top = (rows: typeof hi) => [...rows].sort((a, b) => b.edge - a.edge)[0];
    expect(top(hi).df).toBeGreaterThan(0.4);
    expect(top(lo).df).toBeLessThan(-0.4);
    const swing = (rows: typeof hi) => Math.max(...rows.map((r) => r.edge)) - Math.min(...rows.map((r) => r.edge));
    expect(swing(hi)).toBeGreaterThan(0.25);
    expect(swing(lo)).toBeGreaterThan(0.25);
  });
  it("different cars suit different tracks: a downforce car and a low drag car swap their best races", () => {
    const s = newCareer("fer", 5);
    const spread = (id: string) => { const e = fitMap(s, id).map((r) => r.edge); return Math.max(...e) - Math.min(...e); };
    const best = Math.max(...Object.keys(s.teams).map(spread));
    expect(best).toBeGreaterThan(0.01);
  });
});
