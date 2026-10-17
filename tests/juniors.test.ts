import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { apply } from "../src/career/reducer";
import { advanceDay } from "../src/career/tick";
import { JUNIOR_CAL, SERIES, academyYearEnd, reportOf, scoutFor } from "../src/career/academy";
import { changeLivery, liveryPreview, baseColour } from "../src/career/brand";
import type { CareerState } from "../src/career/types";

function run(s: CareerState, days: number) {
  for (let i = 0; i < days; i++) {
    s.weekend = null;
    advanceDay(s);
  }
}

describe("junior seasons and scouts", () => {
  it("every series races its calendar and keeps results, paths and champions", () => {
    const s = newCareer("wil", 31, 1);
    const y = s.year;
    run(s, 400);
    const res = s.academy.results ?? [];
    for (const series of SERIES) {
      const mine = res.filter((r) => r.series === series && r.year === y);
      expect(mine.length, series).toBe(JUNIOR_CAL[series].length);
      expect(mine[0].top.length).toBeGreaterThan(0);
    }
    academyYearEnd(s);
    expect(s.academy.champions.some((c) => c.series === "kart" && c.year === s.year)).toBe(true);
    const withPath = Object.values(s.academy.prospects).filter((p) => (p.path?.length ?? 0) > 0);
    expect(withPath.length).toBeGreaterThan(20);
  });

  it("only the scout assigned to a series reads its drivers", () => {
    const s = newCareer("wil", 32, 1);
    const scout = Object.values(s.staff).find((x) => x.teamId === s.teamId && x.role === "scout");
    expect(scout).toBeTruthy();
    s.academy.scouts[scout!.id] = "f3";
    const f3 = Object.values(s.academy.prospects).find((p) => p.series === "f3")!;
    const kart = Object.values(s.academy.prospects).find((p) => p.series === "kart")!;
    expect(scoutFor(s, f3)?.id).toBe(scout!.id);
    expect(scoutFor(s, kart)).toBeUndefined();
    expect(reportOf(s, f3).scout?.name).toBe(scout!.name);
    expect(reportOf(s, kart).scout).toBeNull();
  });

  it("a scout at a karting championship files a report", () => {
    const s = newCareer("wil", 33, 1);
    const scout = Object.values(s.staff).find((x) => x.teamId === s.teamId && x.role === "scout")!;
    s.academy.scouts[scout.id] = "kart";
    run(s, 400);
    const reports = s.cards.filter((c) => c.kind === "academy" && c.title.startsWith("Scout report"));
    const news = s.news.filter((n) => n.tag === "junior");
    expect(reports.length + news.length).toBeGreaterThan(0);
  });
});

describe("livery", () => {
  it("previews the cost, applies it, and refuses a second change within a year", () => {
    const s = newCareer("fer", 34, 1);
    const pv = liveryPreview(s, 0x1f6bff);
    expect(pv.ok).toBe(true);
    expect(pv.fans).toBeLessThan(0);
    const before = s.brand.fans;
    const r = apply(s, { type: "livery", color: 0x1f6bff });
    expect(r.ok).toBe(true);
    expect(s.brand.color).toBe(0x1f6bff);
    expect(s.brand.fans).toBeLessThan(before);
    expect(apply(s, { type: "livery", color: 0x8bd600 }).ok).toBe(false);
    run(s, 366);
    const back = changeLivery(s, null);
    expect(back.ok).toBe(true);
    expect(s.brand.color).toBeNull();
    expect(s.brand.color ?? baseColour(s)).toBe(baseColour(s));
  });
});
