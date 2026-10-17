// Runs against a live `wrangler dev` (npm run dev:worker). Skipped unless E2E_URL is set:
//   E2E_URL=ws://localhost:8787 npx vitest run tests/e2e/workerd.test.ts
import { describe, expect, it } from "vitest";
import { configFromPlan } from "../../src/career/multi";
import { TEAMS } from "../../src/game/data";
import { LockstepClient, type LobbyView, type LockstepSim, type ServerMsg, type SessionInfo } from "../../src/shared/careerNet";
import { NetQualiSession, NetRaceSession, type NetLink } from "../../src/game/netsession";
import type { QualiConfig } from "../../src/sim/qualifying";
import type { RaceConfig } from "../../src/sim/types";

const URL_ = process.env.E2E_URL;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Peer {
  ws!: WebSocket;
  lobby: LobbyView | null = null;
  view: any = null;
  ls: LockstepClient | null = null;
  sess: NetQualiSession | NetRaceSession | null = null;
  sessId = "";
  ends: string[] = [];
  desyncs = 0;
  errors: string[] = [];
  constructor(public code: string, public name: string, public team?: string) {}
  id() {
    return `${this.name}-0000000000000000`;
  }
  async open() {
    this.ws = new WebSocket(`${URL_}/api/career/${this.code}`);
    this.ws.onmessage = (ev) => this.on(JSON.parse(String(ev.data)) as ServerMsg);
    await new Promise<void>((res, rej) => {
      this.ws.onopen = () => res();
      this.ws.onerror = () => rej(new Error("socket error"));
    });
    this.send({ t: "join", v: 1, humanId: this.id(), name: this.name, teamId: this.team });
  }
  send(m: unknown) {
    this.ws.send(JSON.stringify(m));
  }
  link(): NetLink {
    return {
      cmd: (cmd) => (this.send({ t: "cmd", cmd }), true),
      speed: (n) => (this.send({ t: "speed", speed: n }), true),
      run: (sim: LockstepSim, max = 200) => {
        if (!this.ls) return 0;
        const r = this.ls.run(sim, max);
        for (const h of r.hashes) this.send({ t: "hash", tick: h.tick, h: h.h });
        return r.steps;
      },
      finish: (res) => (this.send({ t: "finish", results: res }), true),
    };
  }
  on(m: ServerMsg) {
    switch (m.t) {
      case "lobby":
        this.lobby = m.lobby;
        break;
      case "view":
        this.view = m.view;
        break;
      case "error":
        this.errors.push(`${m.code}: ${m.message}`);
        break;
      case "desync":
        this.desyncs++;
        break;
      case "session":
        this.ls = new LockstepClient(m.info as SessionInfo, () => Date.now());
        if (m.info.state === "running" && this.sessId !== m.info.id) {
          this.sessId = m.info.id;
          const plan = m.info.plan as { kind: string; circuitId: string; cfg: Record<string, unknown>; humanIds: string[]; humanTeams: Record<string, string[]> };
          const cfg = configFromPlan({ circuitId: plan.circuitId, cfg: plan.cfg });
          const own = plan.humanTeams[this.lobby?.you?.teamId ?? ""] ?? [];
          this.sess = plan.kind === "quali" ? new NetQualiSession(cfg as QualiConfig, own, this.link(), plan.humanIds) : new NetRaceSession(cfg as RaceConfig, own, this.link(), plan.humanIds);
          this.sess.speed = 32;
        }
        break;
      case "cmd":
        this.ls?.onCmd(m.c, m.hz);
        break;
      case "hz":
        this.ls?.onHz(m.tick);
        break;
      case "speedSeg":
        this.ls?.onSeg(m.seg, m.hz);
        break;
      case "sessionEnd":
        this.ends.push(m.kind);
        this.sess = null;
        this.ls = null;
        break;
    }
  }
}

describe.skipIf(!URL_)("live workerd league", () => {
  it("runs a weekend over real websockets", async () => {
    const code = `e2e${Math.random().toString(36).slice(2, 8)}`;
    const a = new Peer(code, "alice");
    const b = new Peer(code, "bob", "mcl");
    await a.open();
    await sleep(200);
    a.send({ t: "create", teamId: "fer", settings: { teamIds: TEAMS.map((t) => t.id), timer: null, speedMode: "host", extra: { raceLength: "quick" } } });
    await sleep(500);
    await b.open();
    await sleep(500);
    expect(a.errors).toEqual([]);
    expect(b.view).toBeTruthy();
    let guard = 0;
    while (a.lobby?.phase !== "weekend" && guard++ < 100) {
      a.send({ t: "ready", ready: true });
      b.send({ t: "ready", ready: true });
      await sleep(250);
    }
    expect(a.lobby?.phase).toBe("weekend");
    a.send({ t: "ready", ready: true });
    b.send({ t: "ready", ready: true });
    await sleep(500);
    expect(a.lobby?.phase).toBe("sessionLobby");
    a.send({ t: "ready", ready: true });
    b.send({ t: "ready", ready: true });
    const t0 = Date.now();
    let raced = false;
    while (Date.now() - t0 < 200_000 && !(a.ends.includes("race") && b.ends.includes("race"))) {
      for (const p of [a, b]) p.sess?.advance(0.05);
      if (a.ends.includes("qualifying") && !raced && a.lobby?.phase === "sessionLobby") {
        raced = true;
        a.send({ t: "ready", ready: true });
        b.send({ t: "ready", ready: true });
      }
      await sleep(40);
    }
    console.log("DIAG", a.lobby?.phase, a.lobby?.session, a.errors, b.errors, a.sess?.sim.tick, b.sess?.sim.tick, a.ls?.target(), a.ls?.violations, a.desyncs, b.desyncs, a.lobby?.players.map((p) => [p.name, p.ready, p.connected]));
    expect(a.ends).toEqual(["qualifying", "race"]);
    expect(a.desyncs + b.desyncs).toBe(0);
    await sleep(500);
    expect(a.lobby?.phase).toBe("world");
    expect(a.view.standings.races.length).toBe(1);
    expect(a.errors.filter((e) => !e.startsWith("no_session"))).toEqual([]);
  }, 300_000);
});
