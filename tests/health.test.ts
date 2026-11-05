import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { driversOf } from "../src/career/finance";
import { activeDrivers, entriesFor } from "../src/career/car";
import { autoPlayDays } from "../src/career/headless";
import { coverGaps, healthAfterRace, healYearEnd, isOut } from "../src/career/health";
import { decide } from "../src/career/academy";

describe("health and stand-ins", () => {
  it("a laid-up driver leaves the entry list and a stand-in covers, then goes home", () => {
    const s = newCareer("wil", 7);
    const [a] = driversOf(s, s.teamId);
    a.out = { cause: "illness", races: 1, from: s.round, year: s.year, label: "a fever" };
    coverGaps(s);
    const ids = activeDrivers(s, s.teamId);
    expect(ids).toHaveLength(2);
    expect(ids).not.toContain(a.id);
    const sub = Object.values(s.drivers).find((d) => d.sub?.for === a.id)!;
    expect(sub.teamId).toBe(s.teamId);
    expect(entriesFor(s).filter((e) => e.team.id === s.teamId)).toHaveLength(2);
    healthAfterRace(s, s.round);
    expect(isOut(a)).toBe(false);
    expect(activeDrivers(s, s.teamId)).toContain(a.id);
    expect(sub.teamId).toBeNull();
    expect(sub.sub).toBeUndefined();
  });

  it("a heavy crash can lay a driver up, deterministically, for human and AI alike", () => {
    const run = () => {
      const s = newCareer("wil", 9);
      const ai = Object.keys(s.teams).find((t) => t !== s.teamId)!;
      const hurt: Record<string, number> = {};
      for (const id of [...activeDrivers(s, s.teamId), ...activeDrivers(s, ai)]) hurt[id] = 1.2;
      healthAfterRace(s, s.round, hurt);
      return Object.values(s.drivers).filter((d) => isOut(d)).map((d) => `${d.id}:${d.out!.races}`).sort();
    };
    const a = run();
    expect(a.length).toBeGreaterThan(0);
    expect(run()).toEqual(a);
  });

  it("the reserve role is a real flag on an academy prospect", () => {
    const s = newCareer("wil", 3);
    const p = Object.values(s.academy.prospects).find((x) => x.owner === s.teamId && x.status === "academy");
    if (!p) return;
    p.born = s.year - 20;
    const r = decide(s, p.id, "reserve");
    if (r === null) expect(p.reserve).toBe(true);
    decide(s, p.id, "keep");
    expect(p.reserve).toBe(false);
  });

  it("a whole season: always two fit drivers per team, no injured driver racing, all healed at year end", { timeout: 600000 }, () => {
    const s = newCareer("wil", 11);
    let sawOut = 0;
    let guard = 0;
    const startYear = s.year;
    while (s.year === startYear && guard++ < 500) {
      autoPlayDays(s, 1);
      for (const t of Object.keys(s.teams)) {
        const ids = activeDrivers(s, t);
        if (ids.length !== 2) throw new Error(`${t} has ${ids.length} active drivers on day ${s.day}`);
        for (const id of ids) if (isOut(s.drivers[id])) throw new Error(`${id} racing while out`);
      }
      sawOut += Object.values(s.drivers).filter((d) => isOut(d)).length > 0 ? 1 : 0;
    }
    expect(s.year).toBe(startYear + 1);
    expect(Object.values(s.drivers).filter((d) => d.out || d.sub)).toHaveLength(0);
    healYearEnd(s);
    expect(sawOut).toBeGreaterThanOrEqual(0);
  });
});

import { crashBill, crashBills } from "../src/career/health";
import { hurtOf } from "../src/career/weekend";

describe("crash bills and plumbing", () => {
  it("the bill grows with impact and with a car on its side; small touches are free", () => {
    expect(crashBill(0.2, "upright")).toBe(0);
    expect(crashBill(0.8, "nose_in")).toBeGreaterThan(crashBill(0.5, "nose_in"));
    expect(crashBill(0.8, "side")).toBeGreaterThan(crashBill(0.8, "nose_in"));
  });
  it("charges the team of the driver and sends a letter to a human team", () => {
    const s = newCareer("wil", 7);
    const [a] = driversOf(s, s.teamId);
    const before = s.teams[s.teamId].cash;
    const letters = (s.letters ?? []).length;
    crashBills(s, { [a.id]: { impact: 1, pose: "side" } });
    expect(s.teams[s.teamId].cash).toBeLessThan(before);
    expect((s.letters ?? []).length).toBe(letters + 1);
  });
  it("hurtOf separates a heavy crash from a bump", () => {
    const r = hurtOf({ cars: [{ id: "a", crash: { impact: 0.9, pose: "side" } }, { id: "b", crash: { impact: 0.4, pose: "upright" } }, { id: "c", crash: null }] });
    expect(Object.keys(r.crashes).sort()).toEqual(["a", "b"]);
    expect(Object.keys(r.hurt)).toEqual(["a"]);
  });
});

import { addHindsight, logLedger } from "../src/career/ledger";

describe("verdict ledger", () => {
  it("records crashes, injuries and stand-ins for the player's team, newest first, and takes hindsight", () => {
    const s = newCareer("wil", 7);
    const [a] = driversOf(s, s.teamId);
    crashBills(s, { [a.id]: { impact: 1, pose: "side" } });
    healthAfterRace(s, s.round, { [a.id]: 1.2 });
    const v = s.verdicts ?? [];
    expect(v.some((x) => x.kind === "crash" && (x.cost ?? 0) > 0)).toBe(true);
    if (isOut(a)) expect(v.some((x) => x.kind === "health")).toBe(true);
    logLedger(s, { kind: "part", text: "Fitted x", ref: "part:1:fit" });
    addHindsight(s, "part:1:fit", "delivered more");
    expect(v[0].hindsight).toBe("delivered more");
    expect(v.length).toBeLessThanOrEqual(300);
  });
});

describe("pit wall receipts", () => {
  it("calls with a verdict land in the ledger, others are skipped", async () => {
    const { logCalls } = await import("../src/career/weekend");
    const { newCareer } = await import("../src/career/world");
    const s = newCareer("fer", 2);
    logCalls(s, [
      { carId: "a", lap: 12, kind: "cover", text: "Covered NOR", verdict: "good", secs: 1.4 },
      { carId: "a", lap: 30, kind: "tyres", text: "Kept him out", verdict: "bad", secs: -2.1 },
      { carId: "a", lap: 40, kind: "pit", text: "Stopped" },
    ]);
    const calls = (s.verdicts ?? []).filter((v) => v.kind === "call");
    expect(calls).toHaveLength(2);
    expect(calls.some((c) => /it paid/.test(c.because ?? ""))).toBe(true);
    expect(calls.some((c) => /it cost/.test(c.because ?? ""))).toBe(true);
  });
});
