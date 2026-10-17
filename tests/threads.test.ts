import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { autoTo } from "../src/career/autoplay";
import { resolveCard, advanceDay } from "../src/career/tick";
import { forceThread, advanceThread, threadsWeekly, resolveThread, liveThreads, TELLERS, type ThreadKind } from "../src/career/threads";

describe("story threads", () => {
  it("each kind opens, asks, and ends with a chronicle line and a ledger fact", () => {
    const kinds: ThreadKind[] = ["defector", "prodigy", "heritage", "gamble", "rivalry"];
    let opened = 0;
    for (const k of kinds) {
      const s = newCareer("mcl", 21);
      s.day += 200; s.round = 5;
      for (const st of Object.values(s.staff)) if (st.teamId === s.teamId && st.role === "td") st.skill = 80;
      if (k === "prodigy") { const st = Object.values(s.staff).find((x) => x.teamId === s.teamId && x.role === "designer")!; st.intern = { potential: 0.9, since: s.year }; }
      if (k === "gamble") s.teams[s.teamId].designNext = { frontWing: 1, rearWing: 1, floor: 1, rake: 1, sidepod: 0, inlet: 0, stiffness: 1, wheelbase: 0 };
      if (k === "rivalry") { const ids = Object.keys(s.standings.drivers); s.standings.drivers[ids[0]] = 40; s.standings.drivers[ids[1]] = 35; }
      if (!forceThread(s, k)) continue;
      opened++;
      const th = s.threads![0];
      for (let i = 0; i < 6 && !th.done; i++) {
        advanceThread(s, th);
        for (const c of [...s.cards]) if (c.data?.tid === th.id) { resolveThread(s, String(c.data.ev), c.options[0].id, c.data as any); s.cards = s.cards.filter((x) => x.id !== c.id); }
        th.next = 0;
      }
      expect(th.done, k).toBe(true);
      expect(s.chronicle!.length).toBeGreaterThan(0);
      expect((s.facts ?? []).some((f) => f.kind === `thread:${k}`)).toBe(true);
      expect(/—/.test(th.ending ?? "")).toBe(false);
    }
    expect(opened).toBeGreaterThanOrEqual(4);
  });
  it("the director respects its cap over several seasons and stories leave a chronicle", () => {
    const s = newCareer("fer", 36);
    s.teller = "steady";
    const start = s.day;
    let maxLive = 0;
    for (let k = 0; k < 4; k++) {
      autoTo(s, start + 110 * (k + 1), 400);
      maxLive = Math.max(maxLive, liveThreads(s).length);
    }
    for (let d = 0; d < 365 * 3; d++) {
      s.weekend = null;
      for (const c of [...s.cards]) if (c.options.length > 1) resolveCard(s, c.id, c.defaultOption ?? c.options[0].id);
      advanceDay(s);
      maxLive = Math.max(maxLive, liveThreads(s).length);
    }
    expect(maxLive).toBeLessThanOrEqual(TELLERS.steady.cap);
    expect((s.chronicle ?? []).length).toBeGreaterThan(0);
    const kinds = new Set((s.threads ?? []).map((t) => t.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(2);
  }, 280000);
});
void resolveCard; void advanceDay; void threadsWeekly;

import { chaseOf } from "../src/career/records";
import { askingSalary } from "../src/career/contracts";
import { careerEngine as E } from "../src/career/multi";

describe("twenty seasons of stories and the new wires", () => {
  it("runs twenty years without a stuck thread, a leak or a dash in the chronicle", () => {
    const s = newCareer("wil", 77);
    s.teller = "drama";
    let maxLive = 0;
    for (let d = 0; d < 365 * 20; d++) {
      s.weekend = null;
      s.fired = false;
      s.teams[s.teamId].board = Math.max(s.teams[s.teamId].board, 60);
      s.teams[s.teamId].cash = Math.max(s.teams[s.teamId].cash, 30);
      // give the director raw material each year: a title fight, a bold January plan and a gifted trainee
      if (d % 365 === 100) {
        const ids = Object.keys(s.standings.drivers);
        s.round = Math.max(s.round, 4);
        s.standings.drivers[ids[0]] = 60; s.standings.drivers[ids[1]] = 52;
        s.teams[s.teamId].designNext = { frontWing: 1, rearWing: 1, floor: 1, rake: 1, sidepod: 0, inlet: 0, stiffness: 1, wheelbase: 0 };
        const st = Object.values(s.staff).find((x) => x.teamId === s.teamId && x.role === "designer");
        if (st && !st.intern) st.intern = { potential: 0.9, since: s.year };
      }
      for (const c of [...s.cards]) if (c.options.length > 1) resolveCard(s, c.id, c.options[(s.day + c.id) % c.options.length].id);
      advanceDay(s);
      maxLive = Math.max(maxLive, liveThreads(s).length);
    }
    expect(maxLive).toBeLessThanOrEqual(TELLERS.drama.cap);
    const chron = s.chronicle ?? [];
    expect(chron.length).toBeGreaterThan(5);
    expect(new Set(chron.map((c) => c.kind)).size).toBeGreaterThanOrEqual(3);
    expect(chron.every((c) => !/—/.test(c.text))).toBe(true);
    // nothing lives forever
    expect(liveThreads(s).every((t) => s.day - t.born < 500)).toBe(true);
  }, 280000);
  it("a record chase raises the asking price and ledger lines stay private in a league", () => {
    const s = newCareer("mcl", 3);
    const d = Object.values(s.drivers)[0];
    const base = askingSalary(s, d);
    d.rec = { ...(d.rec ?? { p1: 0, p2: 0, p3: 0, poles: 0, fl: 0, sprintWins: 0, sprintPodiums: 0, wdc: [], firsts: {}, dnfs: 0 }), wdc: [1, 2, 3, 4, 5, 6] } as any;
    expect(chaseOf(s, d).on).toBe(true);
    expect(askingSalary(s, d)).toBeGreaterThan(base);
    let ms = E.create({ seed: 5, teamId: "fer", settings: { extra: { raceLength: "quick" } } });
    ms = E.assign(ms, "fer", "p1");
    ms = E.assign(ms, "mcl", "p2");
    const NEUTRAL = { frontWing: 0.5, rearWing: 0.9, floor: 0.5, rake: 0.5, sidepod: 0.5, inlet: 0.5, stiffness: 0.5, wheelbase: 0.5 };
    ms = E.reduceAs(ms, "fer", { type: "runLab", inst: "desk", model: NEUTRAL }).state;
    const theirs = E.view(ms, "mcl") as { facts?: { kind: string; who: string[] }[] };
    expect((theirs.facts ?? []).some((f) => f.kind === "lab" && !f.who.includes("mcl"))).toBe(false);
  });
});
