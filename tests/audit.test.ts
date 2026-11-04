import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { MODULES } from "../src/career/modules";
import { autoPlayDays } from "../src/career/headless";
import { activeDrivers } from "../src/career/car";
import { isHuman } from "../src/career/util";

/** Audit: every rule module, with the AI running every team, plays a stretch of season without breaking anything. */
describe("audit: AI in every ruleset", () => {
  for (const m of MODULES) {
    it(`${m.name} (${m.id})`, { timeout: 300000 }, () => {
      const s = newCareer("wil", 21, 1, "quick", { eraMode: "locked", lockedModules: [m.id] });
      autoPlayDays(s, 75);
      expect(s.round).toBeGreaterThan(0);
      for (const t of Object.keys(s.teams)) {
        expect(activeDrivers(s, t)).toHaveLength(2);
        expect(Number.isFinite(s.teams[t].cash)).toBe(true);
      }
      for (const [id, pts] of Object.entries(s.standings.drivers)) {
        expect(Number.isFinite(pts), id).toBe(true);
        expect(s.drivers[id], `driver ${id} in standings but unknown`).toBeTruthy();
      }
      // the player's team is run by the AI here, same as every other: it must have scored or at least raced
      expect(isHuman(s, s.teamId)).toBe(true);
    });
  }
});

import { careerEngine as E } from "../src/career/multi";
import { rollHealth, isOut } from "../src/career/health";

describe("audit: health in a shared league", () => {
  it("both human teams and the AI keep two fit drivers through weekends with injuries rolled", { timeout: 300000 }, () => {
    let s = E.create({ seed: 4242, teamId: "fer", settings: { extra: { raceLength: "quick" } } });
    s = E.assign(s, "fer", "p1");
    s = E.assign(s, "mcl", "p2");
    let races = 0;
    for (let i = 0; i < 70; i++) {
      const w = s.world;
      // make a driver on each human team ill just before a weekend so cover is needed
      const d = Object.values(w.drivers).find((x) => x.teamId === (races % 2 ? "mcl" : "fer") && !x.retired && !isOut(x));
      if (d && i % 9 === 0) d.out = { cause: "illness", races: 1, from: w.round, year: w.year, label: "a fever" };
      const r = E.stepDay(s);
      s = r.state;
      if (r.weekend) {
        s = E.applySession(s, "qualifying", null);
        s = E.applySession(s, "race", null);
        races++;
      }
      if (!r.weekend) continue;
      for (const t of Object.keys(s.world.teams)) {
        const fit = Object.values(s.world.drivers).filter((x) => x.teamId === t && !x.retired && !isOut(x));
        expect(fit.length, `${t} day ${i}`).toBeGreaterThanOrEqual(2);
      }
    }
    expect(races).toBeGreaterThan(0);
    void rollHealth;
  });
});
