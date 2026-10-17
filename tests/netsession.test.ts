import { describe, expect, it } from "vitest";
import { careerEngine as E, configFromPlan } from "../src/career/multi";
import { NetQualiSession, NetRaceSession, type NetLink } from "../src/game/netsession";
import { LockstepClient, SessionRelay, type LockstepSim } from "../src/shared/careerNet";
import type { QualiConfig } from "../src/sim/qualifying";
import type { RaceConfig } from "../src/sim/types";

interface Client {
  team: string;
  ls: LockstepClient;
  done: unknown;
  hashes: Array<{ tick: number; h: string }>;
}

function room(plan: unknown, teams: string[]) {
  let now = 1000;
  const relay = SessionRelay.create("t", "x", plan, teams);
  relay.start(now);
  const clients: Client[] = teams.map((team) => ({ team, ls: new LockstepClient(relay.info(now), () => now), done: null, hashes: [] }));
  const link = (c: Client): NetLink => ({
    cmd(cmd) {
      const r = relay.submit(c.team, cmd, now);
      if (!r) return false;
      for (const o of clients) o.ls.onCmd(r.c, r.hz);
      return true;
    },
    speed(n) {
      const r = relay.voteSpeed(c.team, n, "host", teams[0], teams, now);
      if (r) for (const o of clients) o.ls.onSeg(r.seg, r.hz);
      return true;
    },
    run(sim: LockstepSim, max = 200) {
      const r = c.ls.run(sim, max);
      c.hashes.push(...r.hashes);
      return r.steps;
    },
    finish(res) {
      c.done = res;
      return true;
    },
  });
  const tickClock = (ms: number) => {
    now += ms;
    const hz = relay.beat(now);
    for (const c of clients) c.ls.onHz(hz);
  };
  return { relay, clients, link, tickClock, now: () => now };
}

describe("networked sessions stay in lockstep", () => {
  it("two browsers run qualifying and the race to identical results", () => {
    let s = E.create({ seed: 77, teamId: "fer", settings: { extra: { raceLength: "quick" } } });
    s = E.assign(s, "fer", "p1");
    s = E.assign(s, "mcl", "p2");
    let weekend = false;
    for (let i = 0; i < 200 && !weekend; i++) {
      const r = E.stepDay(s);
      s = r.state;
      weekend = r.weekend;
    }
    expect(weekend).toBe(true);

    // qualifying
    const qplan = JSON.parse(JSON.stringify(E.sessionPlan(s, "qualifying"))) as { cfg: Record<string, unknown>; circuitId: string; humanIds: string[]; humanTeams: Record<string, string[]> };
    const qr = room(qplan, ["fer", "mcl"]);
    const qs = qr.clients.map((c) => new NetQualiSession(configFromPlan(qplan) as QualiConfig, qplan.humanIds, qr.link(c)));
    qs[0].speed = 8;
    let guard = 0;
    while (!qr.clients.every((c) => c.done) && guard++ < 20000) {
      qr.tickClock(250);
      qs.forEach((q) => q.advance(0.25));
    }
    expect(qr.clients[0].done).toBeTruthy();
    expect(JSON.stringify(qr.clients[0].done)).toBe(JSON.stringify(qr.clients[1].done));
    // every hash that both reported matches
    const a = new Map(qr.clients[0].hashes.map((h) => [h.tick, h.h]));
    for (const h of qr.clients[1].hashes) if (a.has(h.tick)) expect(a.get(h.tick)).toBe(h.h);
    s = E.applySession(s, "qualifying", JSON.parse(JSON.stringify(qr.clients[0].done)));

    // race, with a tyre choice during the grid hold and a pit call mid-race
    const rplan = JSON.parse(JSON.stringify(E.sessionPlan(s, "race"))) as { cfg: Record<string, unknown>; circuitId: string; humanIds: string[]; humanTeams: Record<string, string[]> };
    const rr = room(rplan, ["fer", "mcl"]);
    const rs = rr.clients.map((c) => new NetRaceSession(configFromPlan(rplan) as RaceConfig, rplan.humanIds, rr.link(c)));
    const carA = rplan.humanTeams.fer[0];
    const carB = rplan.humanTeams.mcl[0];
    rs[0].sim.command({ type: "startTyre", carId: carA, compound: "H" });
    rs[1].sim.command({ type: "startTyre", carId: carB, compound: "S" });
    rs[0].speed = 8;
    let pitted = false;
    guard = 0;
    while (!rr.clients.every((c) => c.done) && guard++ < 60000) {
      rr.tickClock(250);
      rs.forEach((r) => r.advance(0.25));
      if (!pitted && rs[0].sim.tick > 600) {
        pitted = true;
        rs[1].sim.command({ type: "pit", carId: carB, compound: "M" });
      }
    }
    expect(rr.clients[0].done).toBeTruthy();
    expect(rs[0].sim.car(carA).tyre.compound === "H" || rs[0].sim.car(carA).stops > 0).toBe(true);
    expect(JSON.stringify(rr.clients[0].done)).toBe(JSON.stringify(rr.clients[1].done));
    expect(rs[0].sim.hash()).toBe(rs[1].sim.hash());
    s = E.applySession(s, "race", JSON.parse(JSON.stringify(rr.clients[0].done)));
    expect(s.world.standings.races.length).toBe(1);
    expect(JSON.stringify(s)).not.toMatch(/NaN/);
  }, 280_000);
});
