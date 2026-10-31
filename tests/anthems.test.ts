import { describe, expect, it } from "vitest";
import { ANTHEM_CODES, anthemLength, anthemTune, hasAnthem, parseTune } from "../src/audio/anthems";
import { ANTHEM_CREDITS, ANTHEM_RECORDS } from "../src/audio/anthemData.generated";

describe("anthems", () => {
  it("every anthem has a sane melody, range, length and a source", () => {
    expect(ANTHEM_CODES.length).toBeGreaterThan(30);
    for (const nat of ANTHEM_CODES) {
      const t = anthemTune(nat);
      expect(t, nat).not.toBeNull();
      expect(t!.notes.length, nat).toBeGreaterThan(8);
      for (const n of t!.notes) {
        expect(n.midi, nat).toBeGreaterThan(30);
        expect(n.midi, nat).toBeLessThan(100);
        expect(n.len, nat).toBeGreaterThan(0);
      }
      expect(t!.secs, nat).toBeGreaterThan(6);
      expect(t!.secs, nat).toBeLessThan(45);
      expect(ANTHEM_CREDITS[t!.rec.codes[0] ? Object.keys(ANTHEM_RECORDS).find((k) => ANTHEM_RECORDS[k] === t!.rec)! : ""], nat).toMatch(/https?:\/\//);
    }
  });
  it("covers the nations the game uses where a sourced score exists, and others get a fanfare", () => {
    for (const n of ["GBR", "FRA", "ITA", "GER", "ESP", "NED", "MEX", "FIN", "JPN", "USA", "CAN", "AUS", "AUT", "DEN", "CHN"]) expect(hasAnthem(n), n).toBe(true);
    expect(hasAnthem("THA")).toBe(false);
    expect(anthemLength("THA")).toBeGreaterThan(2);
    expect(parseTune("nonsense")).toBeNull();
    expect(parseTune("C4 90 4 | 9/1")).toBeNull();
  });
  it("the melody of God Save the King opens G G A, F# G A (checked against the published tune)", () => {
    const t = anthemTune("GBR")!;
    expect(t.notes.slice(0, 6).map((n) => n.midi % 12)).toEqual([7, 7, 9, 6, 7, 9]);
  });
});

import { newCareer } from "../src/career/world";
import { planRetirements } from "../src/career/contracts";
import { donutDrivers } from "../src/career/sendoff";
import { driversOf } from "../src/career/finance";

describe("send-off", () => {
  it("only the last race has donuts: the new champion and the retiring", () => {
    const s = newCareer("ast", 3);
    expect(donutDrivers(s, {}, ["dr-gar"])).toEqual([]);
    s.round = s.calendar.length - 1;
    const [a, b] = driversOf(s, "ast");
    s.standings.drivers[a!.id] = 10;
    s.standings.drivers[b!.id] = 9;
    const ran = Object.keys(s.drivers).filter((id) => s.drivers[id]!.teamId);
    // a retirement decision rolled before the race is announced and is what the year end then follows
    b!.spec.pace = 0.95;
    b!.spec.born = s.year - 41;
    planRetirements(s);
    expect(b!.retireRolled).toBe(s.year);
    const ids = donutDrivers(s, { [b!.id]: 25 }, ran);
    expect(ids[0]).toBe(b!.id); // he wins the race and the title
    expect(planRetirements(s)).toEqual([]); // rolled once
  });
});
