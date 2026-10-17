// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildTrackArt } from "../src/render/trackArt";
import { TEAMS } from "../src/game/data";
import { CIRCUITS, loadCircuit } from "../src/game/circuits";

describe("track art (real PixiJS display objects, no renderer needed)", () => {
  it("builds a scene for every theme in use", () => {
    const seen = new Set<string>();
    for (const m of CIRCUITS) {
      if (seen.has(m.theme)) continue;
      seen.add(m.theme);
      const { track, meta } = loadCircuit(m.id);
      const art = buildTrackArt(track, TEAMS, meta);
      expect(art.container.children.length).toBeGreaterThan(8);
      const w = art.bounds.maxX - art.bounds.minX;
      expect(w).toBeGreaterThan(1000);
    }
    expect(seen.size).toBeGreaterThanOrEqual(9);
  });

  it("builds the largest circuit within a sane time", () => {
    const { track, meta } = loadCircuit("spa");
    const t0 = Date.now();
    buildTrackArt(track, TEAMS, meta);
    expect(Date.now() - t0).toBeLessThan(4000);
  });
});
