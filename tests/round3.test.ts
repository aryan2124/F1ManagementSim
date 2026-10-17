import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { reduce } from "../src/career/reducer";
import { autoTo, skipTarget, weekendClamp } from "../src/career/autoplay";
import { advanceDay, resolveCard, stageDay } from "../src/career/tick";
import { agenda } from "../src/career/agenda";
import { applyDrops, planSession, practiceRun, recordSession, simulateWeekend, startWeekend } from "../src/career/weekend";
import { ALLOWANCE, fitNew, markDead, swapCost, wearOf } from "../src/career/powertrain";
import { driversOf } from "../src/career/finance";
import { inboxItems, unreadCount } from "../src/ui/career/Inbox";
import { TRACK_FOR } from "../src/ui/career/CareerApp";
import { liveSectorColors } from "../src/ui/sectorRows";
import { raceTrackFor } from "../src/audio/mood";
import { createWeekend, createQualiSession, simulateQualifying, raceConfigFrom, type WeekendSettings } from "../src/game/setup";
import { RaceSession } from "../src/game/session";
import type { CareerState } from "../src/career/types";

function quiet(s: CareerState, days: number) {
  for (let i = 0; i < days && !s.fired; i++) {
    s.weekend = null;
    for (const c of [...s.cards]) if (c.options.length > 1 && c.urgency >= 2) resolveCard(s, c.id, c.defaultOption ?? c.options[0].id);
    advanceDay(s);
  }
}

/** Walk the clock to the first day of the next weekend, the way the player does. */
function toWeekend(s: CareerState) {
  const race = s.calendar[s.round];
  let guard = 0;
  while (!s.weekend && guard++ < 400) {
    for (const c of [...s.cards]) if (c.options.length > 1 && c.urgency >= 2) resolveCard(s, c.id, c.defaultOption ?? c.options[0].id);
    advanceDay(s);
  }
  return race;
}

describe("skipping to an event day (items 10, 13)", () => {
  it("a skip into a weekend lands on the Friday, before practice, and nothing is simulated", () => {
    const s = newCareer("wil", 3);
    const race = s.calendar[0];
    const round = s.round;
    const r = autoTo(s, race.day, 400);
    expect(r.done).toBe(true);
    expect(s.day).toBe(race.day - 2);
    expect(s.weekend?.stage).toBe("practice");
    expect(s.round).toBe(round);
    expect(s.standings.races.length).toBe(0);
    // asking for the Saturday or the Sunday lands in the same place
    expect(weekendClamp(newCareer("wil", 3), race.day - 1)).toBe(race.day - 2);
    expect(skipTarget(newCareer("wil", 3), race.day)).toBe(race.day - 2);
  }, 60000);

  it("a skip past a weekend still plays it, and a skip to an event day arrives the day before", () => {
    const s = newCareer("wil", 3);
    const race2 = s.calendar[1];
    autoTo(s, race2.day + 3, 400);
    expect(s.standings.races.length).toBeGreaterThanOrEqual(1);
    const t = newCareer("wil", 3);
    const launch = agenda(t).find((x) => x.kind === "test" && x.day > t.day + 3);
    if (launch) expect(skipTarget(t, launch.day)).toBe(launch.day - 1);
  }, 120000);

  it("from inside a weekend the AI plays it out and the clock moves on", () => {
    const s = newCareer("wil", 3);
    const race = s.calendar[0];
    autoTo(s, race.day, 400);
    const r = autoTo(s, race.day + 5, 20);
    expect(r.done).toBe(true);
    expect(s.standings.races.length).toBe(1);
  }, 60000);
});

describe("weekend days (items 11, 12, 13)", () => {
  it("the calendar marks the whole weekend, with sprint weekends split over Friday and Saturday", () => {
    const s = newCareer("wil", 3);
    const items = agenda(s);
    for (const r of s.calendar.slice(0, 6)) {
      expect(items.some((x) => x.kind === "weekend" && x.day === r.day - 2)).toBe(true);
      expect(items.some((x) => x.kind === "weekend" && x.day === r.day - 1)).toBe(true);
      expect(items.some((x) => (x.kind === "race" || x.kind === "sprint") && x.day === r.day)).toBe(true);
    }
    expect(items.some((x) => x.kind === "weekend" && /sprint/i.test(x.label))).toBe(true);
  });

  it("the date follows the sessions: Friday practice, Saturday qualifying, Sunday race", () => {
    let s = newCareer("wil", 3);
    const race = toWeekend(s);
    expect(s.day).toBe(race.day - 2);
    expect(s.weekend?.stage).toBe("practice");
    expect(s.weekend?.entered).toBeFalsy();
    s = reduce(s, { type: "enterWeekend" }).state;
    expect(s.weekend?.entered).toBe(true);
    s = reduce(s, { type: "endPractice" }).state;
    expect(s.weekend?.stage).toBe(race.sprint ? "sq" : "quali");
    expect(s.day).toBe(stageDay(race.day, s.weekend!.stage));
    // play the rest through the same actions the screens use
    let guard = 0;
    while (s.weekend && s.weekend.stage !== "done" && guard++ < 6) {
      const st = s.weekend.stage;
      const ids = [...driversOf(s, s.teamId).map((x) => x.id), ...Object.keys(s.drivers).filter((x) => !driversOf(s, s.teamId).some((d) => d.id === x))];
      s = reduce(s, { type: "recordSession", kind: st as never, order: ids, points: {}, grid: ids, dnf: [] }).state;
      if (s.weekend && s.weekend.stage !== "done") expect(s.day).toBe(stageDay(race.day, s.weekend.stage));
    }
    expect(s.weekend?.stage).toBe("done");
    expect(s.day).toBe(race.day);
    // the dashboard releases it on Monday
    s = reduce(s, { type: "day" }).state;
    expect(s.weekend).toBeNull();
  }, 120000);
});

describe("inbox and conversations (items 2, 3)", () => {
  it("a conversation waiting on a reply is in the calendar, and survives a month skip as an unread message", () => {
    let s = newCareer("wil", 3);
    const mine = driversOf(s, s.teamId).map((x) => x.id);
    const target = Object.values(s.drivers).find((d) => d.teamId && d.teamId !== s.teamId && !mine.includes(d.id))!;
    s = reduce(s, { type: "talkOpen", kind: "driver", targetId: target.id }).state;
    expect(s.talks.length).toBe(1);
    const t = s.talks[0];
    t.status = "waiting";
    t.replyOn = s.day + 6;
    const item = agenda(s).find((x) => x.kind === "reply");
    expect(item).toBeTruthy();
    expect(item!.label).toContain(target.spec.name);
    expect(item!.day).toBe(s.day + 6);
    quiet(s, 40);
    const stillThere = s.talks.find((x) => x.id === t.id);
    expect(stillThere).toBeTruthy();
    expect(stillThere!.unread).toBe(true);
    const entry = inboxItems(s).find((x) => x.kind === "talk" && x.id === t.id);
    expect(entry).toBeTruthy();
    expect(entry!.unread).toBe(true);
    expect(unreadCount(s)).toBeGreaterThan(0);
    // opening it marks it read and keeps it listed
    s = reduce(s, { type: "markRead", what: "talk", id: t.id }).state;
    const after = inboxItems(s).find((x) => x.kind === "talk" && x.id === t.id);
    expect(after).toBeTruthy();
    expect(after!.unread).toBe(false);
  }, 60000);

  it("mail starts unread and stays listed when read", () => {
    let s = newCareer("wil", 3);
    s = reduce(s, { type: "huntSponsors", mode: "cold" } as never).state;
    quiet(s, 12);
    const mails = inboxItems(s).filter((x) => x.kind === "mail");
    if (mails.length) {
      expect(mails[0].unread).toBe(true);
      s = reduce(s, { type: "markRead", what: "card", id: mails[0].id }).state;
      expect(inboxItems(s).find((x) => x.key === mails[0].key)!.unread).toBe(false);
    }
  });
});

describe("music stays constant (items 7, 8)", () => {
  it("every career screen plays the same track", () => {
    expect(new Set(Object.values(TRACK_FOR))).toEqual(new Set(["factory"]));
  });

  it("the race track does not depend on which car the camera follows", () => {
    const settings: WeekendSettings = { teamId: "mer", circuitId: "silverstone", distance: "quick", seed: 31 };
    const w = createWeekend(settings);
    const grid = simulateQualifying(w);
    const session = new RaceSession(raceConfigFrom(w, grid, { "f1-rus": "S", "f1-ant": "M" }), w.humanIds);
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      session.sim.run(300);
      const ids = session.sim.cars.map((c) => c.id);
      const tracks = new Set<string>();
      for (const id of ids.slice(0, 8)) {
        (session as unknown as { followId: string }).followId = id;
        tracks.add(raceTrackFor(session));
      }
      expect(tracks.size).toBe(1);
      seen.add([...tracks][0]);
      if (session.sim.phase === "finished") break;
    }
    expect(seen.size).toBeGreaterThan(0);
  }, 60000);
});

describe("qualifying sector colours (item 5)", () => {
  it("at most one car shows purple in each sector, at every moment of a whole session", () => {
    const settings: WeekendSettings = { teamId: "mer", circuitId: "silverstone", distance: "quick", seed: 31 };
    const w = createWeekend(settings);
    const q = createQualiSession(w);
    const sim = q.sim;
    for (const c of sim.cars) c.auto = true;
    let worst = 0;
    let checks = 0;
    for (let seg = 0; seg < 3; seg++) {
      sim.startSegment();
      let guard = 0;
      while (sim.phase === "running" && guard++ < 200000) {
        sim.step();
        if (guard % 25 !== 0) continue;
        const purple = [0, 0, 0];
        for (const c of sim.cars) {
          const col = liveSectorColors(c.sectors.color, c.sectors.last, c.sectors.best, sim.bestSector);
          for (let k = 0; k < 3; k++) if (col[k] === 3) purple[k]++;
        }
        worst = Math.max(worst, ...purple);
        checks++;
      }
      if (sim.phase === "break") sim.nextSegment();
    }
    expect(checks).toBeGreaterThan(100);
    expect(worst).toBeLessThanOrEqual(1);
  }, 120000);

  it("the stored colours alone do show two purples at times, which is the bug the live colours cure", () => {
    expect(liveSectorColors([3, 0, 0], [30.2, 0, 0], [30.2, 0, 0], [29.9, 0, 0])[0]).not.toBe(3);
    expect(liveSectorColors([3, 0, 0], [29.9, 0, 0], [29.9, 0, 0], [29.9, 0, 0])[0]).toBe(3);
  });
});

describe("engines, gearboxes, parc ferme and grid drops (items 14, 15)", () => {
  function weekend(seed = 3) {
    const s = newCareer("wil", seed);
    toWeekend(s);
    return s;
  }

  it("units within the allowance are free, the one beyond it costs ten places", () => {
    const s = weekend();
    const id = driversOf(s, s.teamId)[0].id;
    for (let i = 1; i < ALLOWANCE.pu; i++) {
      expect(swapCost(s, id, "pu", false).places).toBe(0);
      fitNew(s, id, "pu");
    }
    expect(wearOf(s, id).pu.n).toBe(ALLOWANCE.pu);
    expect(swapCost(s, id, "pu", false).places).toBe(10);
    fitNew(s, id, "pu");
    expect(s.weekend!.drops![id].reduce((a, x) => a + x.places, 0)).toBe(10);
  });

  it("swapping after parc ferme is allowed and costs five extra places", () => {
    let s = weekend();
    const id = driversOf(s, s.teamId)[0].id;
    s = reduce(s, { type: "endPractice" }).state;
    // qualifying result puts parc ferme on
    const ids = Object.keys(s.drivers);
    const sprint = s.weekend!.sprint;
    s = reduce(s, { type: "recordSession", kind: sprint ? "sq" : "quali", order: ids, points: {}, grid: ids, dnf: [] }).state;
    expect(s.weekend!.parc).toBe(true);
    const r = reduce(s, { type: "swapPart", driverId: id, part: "pu" });
    expect(r.ok).toBe(true);
    const total = r.state.weekend!.drops![id].reduce((a, x) => a + x.places, 0);
    expect(total).toBe(5);
    expect(r.state.weekend!.drops![id][0].why).toContain("parc ferme");
  }, 120000);

  it("the drop moves the car back on the race grid and the briefing grid shows it", () => {
    expect(applyDrops(["a", "b", "c", "d", "e"], { a: 2 })).toEqual(["b", "c", "a", "d", "e"]);
    expect(applyDrops(["a", "b", "c"], { a: 10 })).toEqual(["b", "c", "a"]);
    const s = weekend();
    const me = driversOf(s, s.teamId)[0].id;
    const w = s.weekend!;
    w.stage = "race";
    const order = Object.keys(s.drivers);
    w.results.quali = { kind: "quali", order, points: {}, grid: order, dnf: [] };
    const before = planSession(s, "race").raceCfg!.grid!.indexOf(me);
    w.drops = { [me]: [{ places: 4, why: "test" }] };
    const plan = planSession(s, "race");
    expect(plan.drops![me]).toBe(4);
    expect(plan.raceCfg!.grid!.indexOf(me)).toBe(Math.min(plan.raceCfg!.grid!.length - 1, before + 4));
  }, 60000);

  it("a unit that blows in practice stops the weekend until it is replaced", () => {
    let s = weekend();
    const id = driversOf(s, s.teamId)[0].id;
    wearOf(s, id).pu.life = 0.02;
    let blown = false;
    for (let i = 0; i < 30 && !blown; i++) {
      const w = s.weekend!;
      w.runsLeft = 3;
      w.sessionsLeft = 3;
      const out = practiceRun(s, "setup", w.setup, id);
      blown = !!s.weekend!.dead?.[id]?.length;
      if (!blown) wearOf(s, id).pu.life = 0.02;
      void out;
    }
    expect(blown).toBe(true);
    expect(wearOf(s, id).pu.life).toBe(0);
    s = reduce(s, { type: "swapPart", driverId: id, part: "pu" }).state;
    expect(s.weekend!.dead?.[id]).toBeUndefined();
    expect(wearOf(s, id).pu.life).toBe(1);
  }, 60000);

  it("a power unit that dies in the race is replaced for the next one and the penalty carries over", () => {
    const s = weekend();
    const id = driversOf(s, s.teamId)[0].id;
    // use up the allowance so that the replacement costs places
    for (let i = 1; i < ALLOWANCE.pu; i++) wearOf(s, id).pu.n += 0, fitNew(s, id, "pu");
    s.weekend!.drops = {};
    const w = s.weekend!;
    w.stage = "race";
    const ids = Object.keys(s.drivers);
    recordSession(s, "race", ids, {}, ids, [id], undefined, { failed: { [id]: "pu" } });
    expect(s.weekend!.stage).toBe("done");
    expect(s.gridDrops?.[id]?.reduce((a, x) => a + x.places, 0)).toBe(10);
    expect(wearOf(s, id).pu.life).toBe(1);
    expect((s.letters ?? []).some((l) => l.subject.includes("power unit"))).toBe(true);
    // the next weekend starts with the penalty already on the car
    s.weekend = null;
    s.round = Math.min(s.round, s.calendar.length - 1);
    const next = startWeekend(s);
    expect(next.drops![id].reduce((a, x) => a + x.places, 0)).toBe(10);
    expect(s.gridDrops![id] ?? []).toHaveLength(0);
    expect(next.ruleNotes.some((n) => n.includes("10 places"))).toBe(true);
  }, 60000);

  it("worn units fail far more often in the race sim than fresh ones", () => {
    const settings: WeekendSettings = { teamId: "mer", circuitId: "monza", distance: "full", seed: 5 };
    const count = (wear: { pu: number; gb: number } | undefined) => {
      let fails = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const w = createWeekend({ ...settings, seed });
        const cfg = raceConfigFrom(w, simulateQualifying(w), {});
        cfg.laps = 20;
        cfg.entries = cfg.entries.map((e) => (e.human ? { ...e, wear } : e));
        const rs = new RaceSession(cfg, w.humanIds);
        let guard = 0;
        while (rs.sim.phase !== "finished" && guard++ < 400) rs.sim.run(2000);
        fails += rs.sim.results().filter((r) => r.dnf && /unit|Gearbox/.test(r.dnfReason) && w.humanIds.includes(r.carId)).length;
      }
      return fails;
    };
    expect(count({ pu: 0, gb: 0 })).toBeGreaterThan(count({ pu: 1, gb: 1 }));
  }, 240000);

  it("simulating a weekend replaces anything dead on its own", () => {
    const s = weekend();
    const id = driversOf(s, s.teamId)[0].id;
    markDead(s, id, "gb");
    simulateWeekend(s);
    expect(s.weekend!.stage).toBe("done");
    expect(wearOf(s, id).gb.life).toBeGreaterThan(0);
  }, 60000);
});


describe("who decides: delegation really does something", () => {
  it("setup delegation: the engineers run practice (do) or the whole practice is closed (hands)", () => {
    for (const level of ["do", "hands"] as const) {
      const s = newCareer("wil", 4);
      s.teams[s.teamId].delegation.setup = level;
      toWeekend(s);
      const ws = s.weekend!;
      const learnt = ws.axes.reduce((a, x) => a + ws.known[x.id], 0);
      expect(learnt).toBeGreaterThan(0);
      expect(ws.runsLeft + ws.sessionsLeft).toBe(0);
      expect(ws.axes.every((a) => ws.setup[a.id] === ws.hint[a.id])).toBe(true);
      expect(ws.stage).toBe(level === "do" ? "practice" : s.calendar[s.round].sprint ? "sq" : "quali");
    }
    const s = newCareer("wil", 4);
    toWeekend(s);
    expect(s.weekend!.runsLeft).toBeGreaterThan(0);
  }, 60000);

  it("parts delegation: a part that tests no faster is scrapped, a good one is fitted, held or not", () => {
    const s = newCareer("wil", 3);
    const me = s.teams[s.teamId];
    me.delegation.parts = "do";
    const mk = (id: number, gain: number, hold: boolean) => ({ id, area: "power" as const, size: "S" as const, name: `Test part ${id}`, cost: 1, days: 1, tunnelHours: 0, predLo: 0.02, predHi: 0.06, trueGain: gain, start: s.day, progress: 1, status: "ready" as const, hold });
    me.projects.push(mk(9001, 0.08, true), mk(9002, -0.05, false));
    const before = me.car.power;
    toWeekend(s);
    const good = me.projects.find((p) => p.id === 9001)!;
    const bad = me.projects.find((p) => p.id === 9002)!;
    expect(good.status).toBe("fitted");
    expect(bad.status).toBe("scrapped");
    expect(me.car.power).toBeGreaterThan(before + 0.03);
  }, 60000);

  it("R&D delegation: do and hands both get projects started, hands says nothing about it", () => {
    const started: Record<string, number> = {};
    const said: Record<string, number> = {};
    for (const level of ["advise", "do", "hands"] as const) {
      const s = newCareer("wil", 3);
      s.teams[s.teamId].delegation.rnd = level;
      quiet(s, 60);
      started[level] = s.teams[s.teamId].projects.length;
      said[level] = s.recap.filter((l) => l.includes("designers started")).length;
    }
    expect(started.advise).toBe(0);
    expect(started.do).toBeGreaterThan(0);
    expect(started.hands).toBeGreaterThan(0);
    expect(said.hands).toBe(0);
  }, 60000);
});
