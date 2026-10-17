import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { apply, reduce } from "../src/career/reducer";
import { ymd } from "../src/career/util";

describe("career start", () => {
  it("builds a full world", () => {
    const s = newCareer("wil", 1);
    expect(Object.keys(s.teams)).toHaveLength(11);
    expect(Object.values(s.drivers).filter((d) => d.teamId).length).toBe(22);
    expect(s.calendar).toHaveLength(23);
    expect(ymd(s.day).m).toBe(1);
  });
});

describe("clock", () => {
  it("is pure through the reducer", () => {
    const a = newCareer("mcl", 3);
    const day0 = a.day;
    const r = reduce(a, { type: "day" });
    expect(a.day).toBe(day0);
    expect(r.state.day).toBe(day0 + 1);
  });
  it("stops at the first race weekend", () => {
    const s = newCareer("mcl", 4);
    for (let i = 0; i < 40; i++) apply(s, { type: "continue" });
    expect(s.weekend).not.toBeNull();
  });
});
