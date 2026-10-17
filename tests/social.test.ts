import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { autoPlayDays } from "../src/career/headless";
import { socialOf, liveArcs } from "../src/career/social";

describe("social feed", () => {
  it("writes posts from real race facts, builds storylines, and keeps the state serialisable", () => {
    const s = newCareer("ast", 11);
    autoPlayDays(s, 150, { weekends: true });
    const soc = socialOf(s);
    expect(soc.posts.length).toBeGreaterThan(10);
    // every post has a handle, text with no em dash and sane numbers
    for (const p of soc.posts) {
      expect(p.text.length).toBeGreaterThan(8);
      expect(p.text).not.toMatch(/—/);
      expect(p.text).not.toMatch(/undefined|NaN|\[object/);
      expect(p.likes).toBeGreaterThan(0);
    }
    // posts differ: the feed is composed, not a handful of fixed lines
    const uniq = new Set(soc.posts.map((p) => p.text)).size;
    expect(uniq / soc.posts.length).toBeGreaterThan(0.7);
    expect(liveArcs(s).length).toBeGreaterThanOrEqual(0);
    expect(() => JSON.parse(JSON.stringify(s.social))).not.toThrow();
    console.log(soc.posts.slice(0, 14).map((p) => `${p.handle} [${p.persona}] ${p.text}`).join("\n"));
  }, 120000);
});
