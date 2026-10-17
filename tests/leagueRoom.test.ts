import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    ctx: unknown;
    env: unknown;
    constructor(ctx: unknown, env: unknown) {
      this.ctx = ctx;
      this.env = env;
    }
  },
}));

import { setEngine } from "../src/worker/career-room";
import { careerEngine, configFromPlan } from "../src/career/multi";
import { TEAMS } from "../src/game/data";
import { LockstepClient, type LockstepSim } from "../src/shared/careerNet";
import { NetQualiSession, NetRaceSession, type NetLink } from "../src/game/netsession";
import type { QualiConfig } from "../src/sim/qualifying";
import type { RaceConfig } from "../src/sim/types";
import { join, rig, type Client } from "./helpers/roomRig";

/** One browser: owns a client socket, a lockstep client and a networked session. */
class Browser {
  ls: LockstepClient | null = null;
  sess: NetQualiSession | NetRaceSession | null = null;
  sessId = "";
  consumed = 0;
  finished = false;
  constructor(public c: Client, public time: { t: number }) {}
  link(): NetLink {
    return {
      cmd: (cmd) => (void this.c.send({ t: "cmd", cmd }), true),
      speed: (n) => (void this.c.send({ t: "speed", speed: n }), true),
      run: (sim: LockstepSim, max = 200) => {
        if (!this.ls) return 0;
        const r = this.ls.run(sim, max);
        for (const h of r.hashes) void this.c.send({ t: "hash", tick: h.tick, h: h.h });
        return r.steps;
      },
      finish: (res) => ((this.finished = true), void this.c.send({ t: "finish", results: res }), true),
    };
  }
  /** Read what the room sent since last time. */
  sync() {
    const msgs = this.c.ws.sent.slice(this.consumed);
    this.consumed = this.c.ws.sent.length;
    for (const m of msgs) {
      if (m.t === "session") {
        this.ls = new LockstepClient(m.info, () => this.time.t);
        if (m.info.state === "running" && this.sessId !== m.info.id) {
          this.sessId = m.info.id;
          this.finished = false;
          const plan = m.info.plan as { kind: string; circuitId: string; cfg: Record<string, unknown>; humanIds: string[]; humanTeams: Record<string, string[]> };
          const mine = plan.humanTeams[this.c.rig.room ? (m.info.teams.find((t) => t) as string) : ""] ?? [];
          void mine;
          const cfg = configFromPlan({ circuitId: plan.circuitId, cfg: plan.cfg });
          const team = this.c.lobby.you?.teamId ?? "";
          const own = plan.humanTeams[team] ?? [];
          this.sess = plan.kind === "quali" ? new NetQualiSession(cfg as QualiConfig, own, this.link(), plan.humanIds) : new NetRaceSession(cfg as RaceConfig, own, this.link(), plan.humanIds);
          this.sess.speed = 8;
        }
      } else if (m.t === "cmd") this.ls?.onCmd(m.c, m.hz);
      else if (m.t === "hz") this.ls?.onHz(m.tick);
      else if (m.t === "speedSeg") this.ls?.onSeg(m.seg, m.hz);
      else if (m.t === "sessionEnd") {
        this.sess = null;
        this.ls = null;
      }
    }
  }
}

describe("a real league room with the real engine", () => {
  it("two managers go from the factory through qualifying and the race, and the world moves on", async () => {
    setEngine(careerEngine, careerEngine);
    const r = await rig();
    const alice = await join(r, "alice");
    await alice.send({ t: "create", teamId: "fer", settings: { teamIds: TEAMS.map((t) => t.id), timer: null, speedMode: "host", extra: { raceLength: "quick" } } });
    const bob = await join(r, "bob", "mcl");
    expect(alice.errors).toEqual([]);
    expect(bob.lobby.you?.teamId).toBe("mcl");
    expect(bob.view).toBeTruthy();
    // bob cannot see ferrari's real car
    expect(JSON.stringify(bob.view.teams.fer.car)).toBe(JSON.stringify(bob.view.teams.fer.believed));

    // run days until the race weekend opens
    let guard = 0;
    while (alice.lobby.phase !== "weekend" && guard++ < 80) {
      await alice.ready();
      await bob.ready();
    }
    expect(alice.lobby.phase).toBe("weekend");

    // individual practice through the normal action path
    await alice.send({ t: "act", id: 1, action: { type: "endPractice" } });
    expect(alice.last("result")!.ok).toBe(true);

    const A = new Browser(alice, r.time);
    const B = new Browser(bob, r.time);

    await alice.ready();
    await bob.ready();
    expect(alice.lobby.phase).toBe("sessionLobby");
    // start qualifying
    await alice.ready();
    await bob.ready();
    expect(alice.lobby.phase).toBe("session");

    const drive = async (kind: string) => {
      let n = 0;
      while (n++ < 4000) {
        A.sync();
        B.sync();
        if (alice.last("sessionEnd")?.kind === kind && A.sess === null) break;
        r.time.t += 250;
        await r.room.alarm();
        A.sync();
        B.sync();
        for (const b of [A, B]) b.sess?.advance(0.25);
        await new Promise((res) => setTimeout(res, 0));
      }
      expect(n).toBeLessThan(4000);
    };
    await drive("qualifying");
    expect(alice.lobby.phase).toBe("sessionLobby");
    expect(alice.lobby.session?.kind).toBe("race");

    await alice.ready();
    await bob.ready();
    expect(alice.lobby.phase).toBe("session");
    await drive("race");
    expect(alice.lobby.phase).toBe("world");
    expect(alice.errors.filter((e) => e !== "no_session")).toEqual([]);
    expect(alice.all("desync")).toEqual([]);
    // both teams got their race record; the world has one result
    expect(alice.view.standings.races).toHaveLength(1);
    expect(bob.view.standings.races).toHaveLength(1);
    expect(r.storage.maxValue).toBeLessThan(128 * 1024);
  }, 280_000);
});
