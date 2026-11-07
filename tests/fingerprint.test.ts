import { describe, expect, it, vi } from "vitest";
import { newCareer } from "../src/career/world";
import { autoPlayDays } from "../src/career/headless";
import { makePrint, printOf, ARC_POOL } from "../src/career/fingerprint";

vi.setConfig({ testTimeout: 900000 });

describe("career fingerprint", () => {
  it("makes careers different: temperaments, rivals and arcs vary across seeds, and are stable for one seed", () => {
    const tempers = new Set<string>();
    const arcSets = new Set<string>();
    const rivalSets = new Set<string>();
    for (let seed = 1; seed <= 24; seed++) {
      const s = newCareer(["fer", "mcl", "wil", "mer"][seed % 4], seed, 1, "quick");
      const p = printOf(s);
      tempers.add(p.temper);
      arcSets.add(p.arcs.join());
      rivalSets.add(p.rivals.map((r) => r.team).join());
      expect(new Set(p.arcs).size).toBe(3);
      expect(p.arcs.every((a) => ARC_POOL.includes(a))).toBe(true);
      expect(p.rivals[0].team).not.toBe(p.rivals[1].team);
      expect(p.rivals.some((r) => r.team === s.teamId)).toBe(false);
      expect(JSON.stringify(makePrint(s))).toBe(JSON.stringify(p));
    }
    expect(tempers.size).toBe(4);
    expect(arcSets.size).toBeGreaterThan(12);
    expect(rivalSets.size).toBeGreaterThan(5);
  });

  it("fairness: every career gets the same three big beats and a similar number of optional letters in a season", () => {
    const beats: number[] = [];
    const letters: number[] = [];
    const teams = ["wil", "fer", "mcl", "mer", "hss", "alp"];
    for (let k = 0; k < 6; k++) {
      const s = newCareer(teams[k], 100 + k, 1, "quick");
      const seen = new Set<number>();
      let n = 0;
      let g = 0;
      const y = s.year;
      while (s.year === y && g++ < 500) {
        autoPlayDays(s, 1);
        for (const c of s.cards) {
          if (seen.has(c.id)) continue;
          seen.add(c.id);
          if (!c.notice && c.urgency < 3 && ["event", "mail", "media"].includes(c.kind)) n++;
        }
      }
      beats.push(s.story.beats?.[y]?.n ?? 0);
      letters.push(n);
    }
    expect(beats).toEqual([3, 3, 3, 3, 3, 3]);
    expect(Math.max(...letters) - Math.min(...letters)).toBeLessThanOrEqual(7);
    expect(Math.min(...letters)).toBeGreaterThanOrEqual(8);
    expect(Math.max(...letters)).toBeLessThanOrEqual(17);
  });
});
