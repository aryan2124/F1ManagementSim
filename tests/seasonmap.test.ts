import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { seasonMap } from "../src/career/seasonmap";
import { logLedger } from "../src/career/ledger";

describe("season map", () => {
  it("one row a race, with ledger events grouped to the race they led up to", () => {
    const s = newCareer("fer", 6);
    s.day = s.calendar[1].day + 1;
    logLedger(s, { kind: "money", text: "Test spend", cost: 0.3 });
    s.verdicts![0].day = s.calendar[1].day - 1;
    const rows = seasonMap(s);
    expect(rows).toHaveLength(s.calendar.length);
    expect(rows[1].events.some((e) => e.text === "Test spend")).toBe(true);
    expect(rows[0].events.some((e) => e.text === "Test spend")).toBe(false);
    for (const r of rows) expect(Number.isFinite(r.edge)).toBe(true);
  });
});
