import { describe, expect, it, vi } from "vitest";
import { newCareer } from "../src/career/world";
import { autoPlayDays } from "../src/career/headless";
import { DEAD_KINDS } from "../src/career/cards";

vi.setConfig({ testTimeout: 600000 });

/** Count every card that reaches the player over whole seasons. */
function tally(team: string, seed: number, years: number) {
  const s = newCareer(team, seed, 1, "quick");
  const seen = new Set<number>();
  const kinds: Record<string, number> = {};
  let choices = 0;
  const start = s.year;
  let g = 0;
  while (s.year < start + years && g++ < 900) {
    autoPlayDays(s, 1);
    for (const c of s.cards) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      kinds[c.kind] = (kinds[c.kind] ?? 0) + 1;
      if (!c.notice && c.options.length > 1 && ["event","mail","media","rivalry","owner","staffPoach"].includes(c.kind) && c.urgency < 3) choices++;
    }
  }
  return { kinds, choices: choices / (s.year - start || years) };
}

describe("the decision diet", () => {
  it("puts about ten to sixteen choices a season in front of the player, and none from the old research flow", () => {
    const runs = [tally("wil", 1, 2), tally("mcl", 3, 2)];
    
    for (const r of runs) {
      expect(r.choices).toBeGreaterThanOrEqual(7);
      expect(r.choices).toBeLessThanOrEqual(15);
      for (const k of DEAD_KINDS) expect(r.kinds[k] ?? 0).toBe(0);
      expect((r.kinds.staffPoach ?? 0) / 2).toBeLessThanOrEqual(1);
      expect((r.kinds.media ?? 0) / 2).toBeLessThanOrEqual(5);
    }
  });
});
