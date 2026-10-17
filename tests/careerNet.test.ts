import { afterEach, describe, expect, it, vi } from "vitest";

// The Durable Object base class only exists inside workerd. A minimal stand-in lets us drive the real
// CareerRoom class in Node with fake storage and fake sockets.
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

import { CareerRoom, NoEngineError, clearEngine, setEngine } from "../src/worker/career-room";
import {
  CHUNK_BYTES,
  CareerLeague,
  LockstepClient,
  RateLimiter,
  SessionRelay,
  canonical,
  loadChunked,
  parseClientMsg,
  releasedTick,
  saveChunked,
  splitChunks,
  type CareerEngine,
  type ChunkIO,
  type LeagueSettings,
  type LobbyView,
  type LockstepSim,
  type ServerMsg,
  type StampedCommand,
} from "../src/shared/careerNet";

// ---------------------------------------------------------------------------------------------
// Stub engine (what src/career/multi.ts will be replaced by)
// ---------------------------------------------------------------------------------------------

interface TS {
  day: number;
  teams: Record<string, { human: string | null; cash: number; secret: number }>;
  votes: Record<string, Record<string, string>>;
  results: unknown[];
  big: string;
  assigns: number;
}

function lcgHex(n: number, seed = 12345): string {
  let x = seed;
  const out: string[] = [];
  for (let i = 0; i < n / 8; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    out.push(x.toString(16).padStart(8, "0"));
  }
  return out.join("");
}

function makeEngine(opts: { bigBytes?: number; failStep?: boolean } = {}): CareerEngine<TS> & { log: string[] } {
  const log: string[] = [];
  return {
    log,
    create: ({ settings, teamId, seed }: { settings: unknown; teamId: string; seed: number }) => {
      const ids = (settings as LeagueSettings).teamIds;
      const teams: TS["teams"] = {};
      for (const id of ids) teams[id] = { human: id === teamId ? "host" : null, cash: 100, secret: seed % 97 };
      return { day: 1, teams, votes: {}, results: [], big: opts.bigBytes ? lcgHex(opts.bigBytes) : "", assigns: 0 };
    },
    assign: (s, teamId, humanId) => ({ ...s, assigns: s.assigns + 1, teams: { ...s.teams, [teamId]: { ...s.teams[teamId], human: humanId } } }),
    reduceAs: (s, teamId, a) => {
      const act = a as { type: string; n?: number; topic?: string; option?: string };
      if (act.type === "spend" && typeof act.n === "number" && act.n > 0 && act.n <= s.teams[teamId].cash) {
        return { state: { ...s, teams: { ...s.teams, [teamId]: { ...s.teams[teamId], cash: s.teams[teamId].cash - act.n } } }, ok: true, message: "spent" };
      }
      if (act.type === "shrink") return { state: { ...s, big: "" }, ok: true, message: "shrunk" };
      if (act.type === "vote") {
        if (act.topic !== "rules.drs" || !["keep", "ban"].includes(act.option ?? "")) return { state: s, ok: false, message: "unknown vote" };
        return { state: { ...s, votes: { ...s.votes, [act.topic]: { ...(s.votes[act.topic] ?? {}), [teamId]: act.option as string } } }, ok: true, message: "ok" };
      }
      return { state: s, ok: false, message: "unknown action" };
    },
    stepDay: (s) => {
      if (opts.failStep) throw new Error("engine exploded");
      const day = s.day + 1;
      const weekend = day % 7 === 0;
      return { state: { ...s, day }, stop: weekend ? "raceweek" : day % 3 === 0 ? "decision" : null, weekend, log: [`Day ${day}`] };
    },
    // The leak surface: only own team data. teams[x].secret must never be returned for other teams.
    view: (s, teamId) => ({ day: s.day, me: { cash: s.teams[teamId].cash }, votes: s.votes }),
    sessionPlan: (s, kind) => ({ kind, seed: s.day * 7919 }),
    applySession: (s, kind, results) => ({ ...s, day: kind === "race" ? s.day + 1 : s.day, results: [...s.results, { kind, results }] }),
  };
}

// ---------------------------------------------------------------------------------------------
// Fakes for the Durable Object runtime
// ---------------------------------------------------------------------------------------------

const VALUE_LIMIT = 128 * 1024;

class FakeStorage {
  data = new Map<string, unknown>();
  alarm: number | null = null;
  writes = 0;
  maxValue = 0;

  private checkValue(k: string, v: unknown) {
    const size = v instanceof Uint8Array ? v.byteLength : JSON.stringify(v).length;
    this.maxValue = Math.max(this.maxValue, size);
    if (size > VALUE_LIMIT) throw new Error(`value for ${k} is ${size} bytes, over the ${VALUE_LIMIT} limit`);
  }
  async get(key: string | string[]): Promise<unknown> {
    if (Array.isArray(key)) {
      if (key.length > 128) throw new Error("get supports at most 128 keys");
      const m = new Map<string, unknown>();
      for (const k of key) if (this.data.has(k)) m.set(k, structuredClone(this.data.get(k)));
      return m;
    }
    return this.data.has(key) ? structuredClone(this.data.get(key)) : undefined;
  }
  async put(a: string | Record<string, unknown>, v?: unknown): Promise<void> {
    const entries = typeof a === "string" ? { [a]: v } : a;
    if (Object.keys(entries).length > 128) throw new Error("put supports at most 128 keys");
    for (const [k, x] of Object.entries(entries)) {
      this.checkValue(k, x);
      this.data.set(k, structuredClone(x));
      this.writes++;
    }
  }
  async delete(k: string | string[]): Promise<number | boolean> {
    const keys = Array.isArray(k) ? k : [k];
    if (keys.length > 128) throw new Error("delete supports at most 128 keys");
    let n = 0;
    for (const x of keys) if (this.data.delete(x)) n++;
    return Array.isArray(k) ? n : n > 0;
  }
  async setAlarm(t: number) {
    this.alarm = t;
  }
  async getAlarm() {
    return this.alarm;
  }
  async deleteAlarm() {
    this.alarm = null;
  }
}

class FakeWS {
  sent: ServerMsg[] = [];
  att: unknown = null;
  readyState = 1;
  closedWith: number | null = null;
  send(s: string) {
    this.sent.push(JSON.parse(s) as ServerMsg);
  }
  close(code?: number) {
    this.readyState = 3;
    this.closedWith = code ?? 1000;
  }
  serializeAttachment(v: unknown) {
    this.att = structuredClone(v);
  }
  deserializeAttachment() {
    return structuredClone(this.att);
  }
}

class FakeCtx {
  sockets: FakeWS[] = [];
  ready: Promise<void> = Promise.resolve();
  constructor(public storage: FakeStorage) {}
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T> {
    const p = fn();
    this.ready = p.then(() => undefined);
    return p;
  }
  acceptWebSocket(ws: FakeWS) {
    this.sockets.push(ws);
  }
  getWebSockets() {
    return this.sockets;
  }
}

interface Rig {
  room: CareerRoom;
  ctx: FakeCtx;
  storage: FakeStorage;
  time: { t: number };
}

async function rig(storage = new FakeStorage(), sockets: FakeWS[] = [], time = { t: 1_000_000 }): Promise<Rig> {
  const ctx = new FakeCtx(storage);
  ctx.sockets = sockets;
  time.t = time.t ?? 1_000_000;
  const room = new CareerRoom(ctx as never, {});
  room.clock = () => time.t;
  await ctx.ready;
  return { room, ctx, storage, time };
}

const ID = (name: string) => `${name}-0000000000000000`;

class Client {
  constructor(
    public rig: Rig,
    public ws: FakeWS,
    public name: string,
  ) {}
  get humanId() {
    return ID(this.name);
  }
  async send(m: unknown) {
    await this.rig.room.webSocketMessage(this.ws as never, JSON.stringify(m));
  }
  all<T extends ServerMsg["t"]>(t: T): Array<Extract<ServerMsg, { t: T }>> {
    return this.ws.sent.filter((m) => m.t === t) as Array<Extract<ServerMsg, { t: T }>>;
  }
  last<T extends ServerMsg["t"]>(t: T): Extract<ServerMsg, { t: T }> | undefined {
    return this.all(t).at(-1);
  }
  get lobby(): LobbyView {
    return this.last("lobby")!.lobby;
  }
  get view(): { day: number; me: { cash: number } } {
    return this.last("view")!.view as never;
  }
  get errors(): string[] {
    return this.all("error").map((e) => e.code);
  }
  clear() {
    this.ws.sent = [];
  }
  ready(b = true) {
    return this.send({ t: "ready", ready: b });
  }
}

async function join(r: Rig, name: string, teamId?: string): Promise<Client> {
  const ws = new FakeWS();
  r.room.acceptConnection(ws as never);
  const c = new Client(r, ws, name);
  await c.send({ t: "join", v: 1, humanId: c.humanId, name, teamId });
  return c;
}

const TEAMS = ["A", "B", "C", "D"];

async function league(opts: { timer?: number | null; bigBytes?: number; speedMode?: "majority" | "host" } = {}) {
  setEngine(makeEngine({ bigBytes: opts.bigBytes }));
  const r = await rig();
  const alice = await join(r, "alice");
  await alice.send({ t: "create", teamId: "A", settings: { teamIds: TEAMS, timer: opts.timer ?? null, speedMode: opts.speedMode ?? "majority" } });
  return { r, alice };
}

afterEach(() => clearEngine());

// ---------------------------------------------------------------------------------------------
// Protocol validation
// ---------------------------------------------------------------------------------------------

describe("message validation", () => {
  const J = (o: unknown) => JSON.stringify(o);
  it("accepts good messages and rejects junk", () => {
    expect(parseClientMsg(J({ t: "join", v: 1, humanId: ID("x"), name: "  Al\u0000ice<script>  " })).ok).toBe(true);
    const bad = [
      "not json",
      J([]),
      J({ t: "nope" }),
      J({ t: "join", v: 1, humanId: "short", name: "x" }),
      J({ t: "join", v: 2, humanId: ID("x"), name: "x" }),
      J({ t: "ready", ready: "yes" }),
      J({ t: "act", id: 1, action: { nottype: 1 } }),
      J({ t: "act", id: 1.5, action: { type: "x" } }),
      '{"t":"act","id":1,"action":{"type":"x","__proto__":{"a":1}}}',
      J({ t: "cmd", cmd: "pit" }),
      J({ t: "cmd", cmd: { k: "x".repeat(2000) } }),
      J({ t: "speed", speed: 3 }),
      J({ t: "vote", topic: "a b", option: "x" }),
      J({ t: "hash", tick: -1, h: "x" }),
      J({ t: "settings", timer: 2 }),
      J({ t: "settings", timer: 99999 }),
      J({ t: "create", teamId: "A", settings: { teamIds: ["A"] } }),
      J({ t: "create", teamId: "A", settings: { teamIds: ["A", "A"] } }),
      "x".repeat(40000),
    ];
    for (const b of bad) expect(parseClientMsg(b).ok, b.slice(0, 60)).toBe(false);
  });

  it("cleans names", () => {
    const p = parseClientMsg(J({ t: "join", v: 1, humanId: ID("x"), name: "  Al\u0000ice<b>   Smith  and a very long tail " }));
    expect(p.ok && p.msg.t === "join" && p.msg.name).toBe("Aliceb Smith and a");
  });

  it("token bucket limits bursts and refills", () => {
    const rl = new RateLimiter(10, 5, 0);
    const burst = Array.from({ length: 8 }, () => rl.allow(0));
    expect(burst.filter(Boolean)).toHaveLength(5);
    expect(rl.allow(1000)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// CareerLeague, pure
// ---------------------------------------------------------------------------------------------

describe("CareerLeague (pure)", () => {
  const mk = (timer: number | null = null) => {
    const L = CareerLeague.create("x", { reserveMs: 1000 });
    L.join(ID("a"), "A", undefined);
    L.join(ID("b"), "B", undefined);
    L.commitCreate(ID("a"), "T1", { teamIds: ["T1", "T2", "T3"], timer }, 7, 0);
    L.join(ID("c"), "C", undefined);
    return L;
  };

  it("assigns the host and later joiners to free teams, spectates when full", () => {
    const L = mk();
    expect(L.player(ID("a"))!.teamId).toBe("T1");
    expect(L.player(ID("b"))!.teamId).toBe("T2");
    expect(L.player(ID("c"))!.teamId).toBe("T3");
    L.join(ID("d"), "D");
    expect(L.player(ID("d"))!.teamId).toBeNull();
    expect(L.drainAssignments().map((a) => a.teamId)).toEqual(["T1", "T2", "T3"]);
  });

  it("everyone ready opens the gate, one missing does not, and the gate resets", () => {
    const L = mk();
    L.setReady(ID("a"), true, 0);
    L.setReady(ID("b"), true, 0);
    expect(L.poll(0)).toBeNull();
    L.setReady(ID("c"), true, 0);
    expect(L.poll(0)).toEqual({ do: "stepWorld" });
    L.afterStep({ stop: "decision", weekend: false, days: 2, log: ["x"] }, 5);
    expect(L.activeHumans().every((p) => !p.ready)).toBe(true);
    expect(L.poll(5)).toBeNull();
    expect(L.d.steps).toBe(2);
  });

  it("away players do not block, but at least one human must be ready", () => {
    const L = mk();
    L.setAway(ID("b"), undefined, true, 0);
    L.setAway(ID("a"), "p3", true, 0); // host marks c away
    expect(L.poll(0)).toBeNull(); // everybody away, nobody ready: the world does not run on its own
    L.setReady(ID("a"), true, 0);
    expect(L.poll(0)).toEqual({ do: "stepWorld" });
  });

  it("only the host can mark someone else away; any action clears away", () => {
    const L = mk();
    expect(L.setAway(ID("b"), "p3", true, 0).ok).toBe(false);
    expect(L.setAway(ID("a"), "p3", true, 0).ok).toBe(true);
    expect(L.player(ID("c"))!.away).toBe("manual");
    L.touch(ID("c"), 0);
    expect(L.player(ID("c"))!.away).toBeNull();
    L.setAway(ID("c"), undefined, true, 0);
    L.castVote(ID("c"), "t", "o", 0);
    expect(L.player(ID("c"))!.away).toBeNull();
  });

  it("no timer: waits forever. timer: expiry makes unready humans away for that step only", () => {
    const none = mk(null);
    none.setReady(ID("a"), true, 0);
    expect(none.poll(10 ** 9)).toBeNull();

    const L = mk(30);
    expect(L.d.deadline).toBe(30_000);
    L.setReady(ID("a"), true, 0);
    expect(L.poll(29_999)).toBeNull();
    expect(L.poll(30_000)).toEqual({ do: "stepWorld" });
    expect(L.player(ID("b"))!.away).toBe("timer");
    expect(L.player(ID("a"))!.away).toBeNull();
    L.afterStep({ stop: null, weekend: false, days: 1, log: [] }, 30_000);
    expect(L.player(ID("b"))!.away).toBeNull();
    expect(L.d.deadline).toBe(60_000);
  });

  it("pauses after repeated empty timer expiries and resumes on action", () => {
    const L = mk(10);
    let t = 0;
    for (let i = 0; i < 3; i++) {
      t += 10_000;
      expect(L.poll(t)).toEqual({ do: "stepWorld" });
      L.afterStep({ stop: null, weekend: false, days: 1, log: [] }, t);
    }
    t += 10_000;
    expect(L.poll(t)).toBeNull();
    expect(L.d.idlePaused).toBe(true);
    expect(L.d.deadline).toBeNull();
    L.setReady(ID("a"), true, t);
    expect(L.d.idlePaused).toBe(false);
    expect(L.d.deadline).toBe(t + 10_000);
  });

  it("changing the timer restarts the countdown", () => {
    const L = mk(null);
    L.setSettings(ID("a"), { timer: 20 }, 1000);
    expect(L.d.deadline).toBe(21_000);
    L.setSettings(ID("a"), { timer: null }, 2000);
    expect(L.d.deadline).toBeNull();
    expect(L.setSettings(ID("b"), { timer: 5 }, 0).ok).toBe(false);
  });

  it("disconnect keeps the seat, same id gets it back, and it expires to the AI", () => {
    const L = mk();
    L.disconnect(ID("b"), 100);
    expect(L.player(ID("b"))!.teamId).toBe("T2");
    expect(L.activeHumans().map((p) => p.pid)).toEqual(["p1", "p3"]);
    L.join(ID("b"), "B2");
    expect(L.player(ID("b"))!.teamId).toBe("T2");
    expect(L.player(ID("b"))!.name).toBe("B2");
    L.disconnect(ID("b"), 100);
    L.drainAssignments();
    L.tick(1099);
    expect(L.player(ID("b"))).toBeDefined();
    L.tick(1100);
    expect(L.player(ID("b"))).toBeUndefined();
    expect(L.drainAssignments()).toEqual([{ teamId: "T2", pid: null }]);
    // came back later: the old seat is free and remembered
    L.join(ID("b"), "B");
    expect(L.player(ID("b"))!.teamId).toBe("T2");
  });

  it("explicit leave frees the seat for a newcomer and the newcomer takes the team over", () => {
    const L = mk();
    L.drainAssignments();
    L.leave(ID("c"));
    expect(L.drainAssignments()).toEqual([{ teamId: "T3", pid: null }]);
    L.join(ID("n"), "Newbie");
    expect(L.player(ID("n"))!.teamId).toBe("T3");
    expect(L.drainAssignments()).toEqual([{ teamId: "T3", pid: "p4" }]);
  });

  it("claim rules", () => {
    const L = mk();
    L.join(ID("d"), "D");
    expect(L.claim(ID("d"), "T1").ok).toBe(false); // taken, and no free team anyway
    expect(L.claim(ID("a"), "T1").ok).toBe(false); // already has a team
    L.leave(ID("c"));
    expect(L.claim(ID("d"), "T9").ok).toBe(false);
    expect(L.claim(ID("d"), "T3").ok).toBe(true);
  });

  it("the maximum number of humans is enforced", () => {
    const L = CareerLeague.create("x", { maxHumans: 2 });
    L.join(ID("a"), "A");
    L.commitCreate(ID("a"), "T1", { teamIds: ["T1", "T2", "T3"] }, 1, 0);
    L.join(ID("b"), "B");
    L.join(ID("c"), "C");
    expect(L.player(ID("c"))!.teamId).toBeNull();
    expect(L.claim(ID("c"), "T3").ok).toBe(false);
  });

  it("host transfers to the earliest connected player when the host leaves or disconnects", () => {
    const L = mk();
    expect(L.d.hostId).toBe(ID("a"));
    L.disconnect(ID("a"), 0);
    expect(L.d.hostId).toBe(ID("b"));
    L.join(ID("a"), "A");
    expect(L.d.hostId).toBe(ID("b")); // the old host does not take it back
    L.leave(ID("b"));
    expect(L.d.hostId).toBe(ID("a"));
    L.leave(ID("a"));
    L.leave(ID("c"));
    expect(L.d.hostId).toBeNull();
  });

  it("a host who is the only one connected keeps the host role while disconnected", () => {
    const L = CareerLeague.create("x");
    L.join(ID("a"), "A");
    L.disconnect(ID("a"), 0);
    expect(L.d.hostId).toBeNull(); // spectator records are dropped, so the next joiner becomes host
    L.join(ID("z"), "Z");
    expect(L.d.hostId).toBe(ID("z"));
  });

  it("vote tally by team, a revote replaces, only the host clears", () => {
    const L = mk();
    L.castVote(ID("a"), "drs", "keep", 0);
    L.castVote(ID("b"), "drs", "ban", 0);
    L.castVote(ID("c"), "drs", "ban", 0);
    expect(L.tally("drs")).toEqual({ keep: 1, ban: 2 });
    L.castVote(ID("c"), "drs", "keep", 0);
    expect(L.tally("drs")).toEqual({ keep: 2, ban: 1 });
    expect(L.clearVotes(ID("b"), "drs").ok).toBe(false);
    expect(L.clearVotes(ID("a"), "drs").ok).toBe(true);
    expect(L.tally("drs")).toEqual({});
    L.join(ID("s"), "Spectator");
    L.leave(ID("c"));
    L.leave(ID("b"));
    expect(L.castVote(ID("s"), "drs", "keep", 0).ok).toBe(false); // spectators cannot vote (no team free? they take one)
  });

  it("reconcile after hibernation fixes connected flags", () => {
    const L = mk();
    L.reconcile(new Set([ID("a")]), 50);
    expect(L.player(ID("b"))!.connected).toBe(false);
    expect(L.player(ID("b"))!.releaseAt).toBe(1050);
    L.reconcile(new Set([ID("a"), ID("b")]), 60);
    expect(L.player(ID("b"))!.connected).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// SessionRelay and lockstep, pure
// ---------------------------------------------------------------------------------------------

describe("SessionRelay", () => {
  it("orders commands with a global sequence and never stamps into the published horizon", () => {
    const r = SessionRelay.create("s", "race", {}, ["A", "B"]);
    expect(r.submit("A", { k: 1 }, 0)).toBeNull(); // not started
    r.start(1000);
    let maxHz = 0;
    const stamped: StampedCommand[] = [];
    for (let t = 1000; t < 5000; t += 130) {
      const hz = r.beat(t);
      expect(hz).toBeGreaterThanOrEqual(maxHz);
      maxHz = hz;
      const s = r.submit(t % 2 ? "A" : "B", { k: t }, t)!;
      expect(s.c.tick).toBeGreaterThanOrEqual(hz);
      stamped.push(s.c);
    }
    expect(stamped.map((c) => c.seq)).toEqual(stamped.map((_, i) => i + 1));
    for (let i = 1; i < stamped.length; i++) expect(stamped[i].tick).toBeGreaterThanOrEqual(stamped[i - 1].tick);
    expect(r.submit("Z", { k: 1 }, 5000)).toBeNull(); // not a participant
  });

  it("speed by majority needs more than half; host mode follows the host only", () => {
    const r = SessionRelay.create("s", "race", {}, ["A", "B", "C"]);
    r.start(0);
    const voters = ["A", "B", "C"];
    expect(r.voteSpeed("A", 4, "majority", "A", voters, 1000)).toBeNull();
    const seg = r.voteSpeed("B", 4, "majority", "A", voters, 2000)!;
    expect(seg.seg.speed).toBe(4);
    expect(r.speed()).toBe(4);
    expect(releasedTick(r.d.segs, 3000)).toBe(r.d.segs[1].tick + 40);
    expect(r.voteSpeed("C", 1, "majority", "A", voters, 3000)).toBeNull(); // 2 of 3 still want 4

    const h = SessionRelay.create("s", "race", {}, ["A", "B"]);
    h.start(0);
    expect(h.voteSpeed("B", 8, "host", "A", ["A", "B"], 100)).toBeNull();
    expect(h.voteSpeed("A", 8, "host", "A", ["A", "B"], 200)!.seg.speed).toBe(8);
  });

  it("pause stops the released tick", () => {
    const r = SessionRelay.create("s", "race", {}, ["A"]);
    r.start(0);
    r.voteSpeed("A", 0, "majority", "A", ["A"], 1000);
    const t = r.released(1000);
    expect(r.released(60_000)).toBe(t);
  });

  it("detects a desynced client by strict majority, and flags everyone on a tie", () => {
    const r = SessionRelay.create("s", "race", {}, ["A", "B", "C"]);
    r.start(0);
    expect(r.reportHash("p1", 50, "h1", 3, 0)).toEqual([]);
    expect(r.reportHash("p2", 50, "h1", 3, 0)).toEqual([]);
    expect(r.reportHash("p3", 50, "BAD", 3, 0)).toEqual(["p3"]);
    expect(r.reportHash("p1", 100, "x", 3, 0)).toEqual([]);
    expect(r.reportHash("p2", 100, "x", 3, 0)).toEqual([]);
    expect(r.reportHash("p3", 100, "x", 3, 0)).toEqual([]);
    const t = SessionRelay.create("s", "race", {}, ["A", "B"]);
    t.start(0);
    t.reportHash("p1", 50, "a", 2, 0);
    expect(t.reportHash("p2", 50, "b", 2, 0).sort()).toEqual(["p1", "p2"]);
  });

  it("sweeps ticks that a lagging client never reported", () => {
    const r = SessionRelay.create("s", "race", {}, ["A", "B", "C"]);
    r.start(0);
    r.reportHash("p1", 50, "a", 3, 0);
    r.reportHash("p2", 50, "b", 3, 0);
    expect(r.sweepHashes(1000)).toEqual([]);
    expect(r.sweepHashes(6000)).toEqual([[50, ["p1", "p2"]]]);
  });

  it("final results: waits for all, takes the majority, splits on a tie", () => {
    const r = SessionRelay.create("s", "race", {}, ["A", "B", "C"]);
    r.start(0);
    r.reportFinal("p1", { order: [1, 2], z: 1 }, 0);
    expect(r.resolveFinal(["p1", "p2", "p3"], false).status).toBe("wait");
    r.reportFinal("p2", { z: 1, order: [1, 2] }, 0); // key order must not matter
    r.reportFinal("p3", { order: [2, 1], z: 1 }, 0);
    const res = r.resolveFinal(["p1", "p2", "p3"], false);
    expect(res.status).toBe("ok");
    if (res.status === "ok") expect(res.dissent).toEqual(["p3"]);

    const t = SessionRelay.create("s", "race", {}, ["A", "B"]);
    t.start(0);
    t.reportFinal("p1", 1, 0);
    t.reportFinal("p2", 2, 0);
    expect(t.resolveFinal(["p1", "p2"], false).status).toBe("split");
    expect(t.d.splits).toBe(1);
    t.reportFinal("p1", 1, 0);
    expect(t.resolveFinal(["p1", "p2"], false).status).toBe("wait");
    expect(t.resolveFinal(["p1", "p2"], true).status).toBe("ok"); // grace period over, one report is all we have
  });

  it("canonical json sorts keys", () => {
    expect(canonical({ b: 1, a: { d: 2, c: [3, { y: 1, x: 2 }] } })).toBe('{"a":{"c":[3,{"x":2,"y":1}],"d":2},"b":1}');
  });
});

/** A tiny deterministic "sim". Order of commands relative to ticks changes the hash. */
class MiniSim implements LockstepSim {
  t = 0;
  x = 1;
  tick() {
    return this.t;
  }
  step() {
    this.x = (this.x * 31 + this.t) % 1000003;
    this.t++;
  }
  apply(c: StampedCommand) {
    this.x = (this.x * 17 + ((c.cmd as { v: number }).v | 0)) % 1000003;
  }
  hash() {
    return `${this.t}:${this.x}`;
  }
}

describe("lockstep end to end (pure)", () => {
  it("clients with different frame rates and latencies end up bit identical", () => {
    const relay = SessionRelay.create("s", "race", { seed: 1 }, ["A", "B"], { hashEvery: 20 });
    relay.start(0);
    let now = 0;
    const mk = () => new LockstepClient(relay.info(0), () => now);
    const c1 = mk();
    const c2 = mk();
    const s1 = new MiniSim();
    const s2 = new MiniSim();
    const inbox2: Array<{ at: number; fn: () => void }> = [];
    const hashes1 = new Map<number, string>();
    const hashes2 = new Map<number, string>();
    let nv = 0;
    for (now = 0; now <= 20_000; now += 10) {
      // server heartbeat every 250 ms
      if (now % 250 === 0) {
        const hz = relay.beat(now);
        c1.onHz(hz);
        const at = now + 400; // client 2 has high latency
        inbox2.push({ at, fn: () => c2.onHz(hz) });
      }
      if (now % 370 === 0) {
        const s = relay.submit(now % 740 ? "A" : "B", { v: ++nv }, now)!;
        c1.onCmd(s.c, s.hz);
        inbox2.push({ at: now + 400, fn: () => c2.onCmd(s.c, s.hz) });
      }
      if (now === 8000) {
        expect(relay.voteSpeed("A", 4, "majority", "A", ["A", "B"], now)).toBeNull(); // 1 of 2 is no majority
        relay.voteSpeed("B", 4, "majority", "A", ["A", "B"], now);
        const seg2 = relay.d.segs.at(-1)!;
        c1.onSeg(seg2, relay.d.horizon);
        inbox2.push({ at: now + 400, fn: () => c2.onSeg(seg2, relay.d.horizon) });
      }
      while (inbox2.length && inbox2[0].at <= now) inbox2.shift()!.fn();
      // client 1 renders every 10 ms, client 2 only every 100 ms with a bigger step budget
      for (const h of c1.run(s1, 50).hashes) hashes1.set(h.tick, h.h);
      if (now % 100 === 0) for (const h of c2.run(s2, 500).hashes) hashes2.set(h.tick, h.h);
    }
    expect(s1.t).toBeGreaterThan(300);
    expect(c1.violations).toBe(0);
    expect(c2.violations).toBe(0);
    expect(hashes1.size).toBeGreaterThan(5);
    for (const [tick, h] of hashes1) if (hashes2.has(tick)) expect(hashes2.get(tick)).toBe(h);
    // run both to the same final tick
    while (s2.t < s1.t) s2.step();
    const ref = new MiniSim();
    const log = [...relay.d.log];
    const ref2 = new LockstepClient({ ...relay.info(0), hz: relay.d.horizon, log }, () => 10 ** 9);
    while (ref.t < s1.t) ref2.run(ref, s1.t - ref.t);
    expect(ref.t).toBe(s1.t);
    expect(ref.hash()).toBe(s1.hash());
  });

  it("a command that arrives late is counted as a violation", () => {
    const relay = SessionRelay.create("s", "race", {}, ["A"]);
    relay.start(0);
    let now = 5000;
    const c = new LockstepClient(relay.info(0), () => now);
    c.onHz(10_000);
    const sim = new MiniSim();
    c.run(sim, 1000);
    expect(sim.t).toBe(50);
    c.onCmd({ seq: 1, tick: 10, team: "A", cmd: { v: 1 } }, 10_000);
    c.run(sim, 1000);
    expect(c.violations).toBe(1);
  });

  it("the client never steps past the horizon even if its clock runs ahead", () => {
    const relay = SessionRelay.create("s", "race", {}, ["A"]);
    relay.start(0);
    const c = new LockstepClient(relay.info(0), () => 3_600_000);
    const sim = new MiniSim();
    c.run(sim, 100000);
    expect(sim.t).toBe(relay.d.horizon);
  });
});

// ---------------------------------------------------------------------------------------------
// Chunked persistence helpers
// ---------------------------------------------------------------------------------------------

function memIO(): { io: ChunkIO; data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    io: {
      getMany: async (keys) => new Map(keys.filter((k) => data.has(k)).map((k) => [k, data.get(k)])),
      putMany: async (e) => {
        for (const [k, v] of Object.entries(e)) data.set(k, v);
      },
      deleteMany: async (keys) => {
        for (const k of keys) data.delete(k);
      },
    },
  };
}

describe("chunked storage helpers", () => {
  it("splits into copies of at most the chunk size", () => {
    const parts = splitChunks(new Uint8Array(CHUNK_BYTES * 2 + 5));
    expect(parts.map((p) => p.length)).toEqual([CHUNK_BYTES, CHUNK_BYTES, 5]);
    expect(parts[0].buffer.byteLength).toBe(CHUNK_BYTES); // a copy, not a view of the big buffer
  });

  it("round trips with gzip, and falls back to raw bytes without CompressionStream", async () => {
    const text = JSON.stringify({ a: "x".repeat(500_000), n: [1, 2, 3] });
    const gz = memIO();
    const m1 = await saveChunked(gz.io, text, 1, 0, 0);
    expect(m1.codec).toBe("gzip");
    expect(m1.bytes).toBeLessThan(m1.raw / 10);
    expect((await loadChunked(gz.io))!.text).toBe(text);

    const saved = (globalThis as { CompressionStream?: unknown }).CompressionStream;
    (globalThis as { CompressionStream?: unknown }).CompressionStream = undefined;
    try {
      const raw = memIO();
      const m2 = await saveChunked(raw.io, text, 1, 0, 0);
      expect(m2.codec).toBe("none");
      expect(m2.n).toBeGreaterThan(m1.n);
      expect((await loadChunked(raw.io))!.text).toBe(text);
    } finally {
      (globalThis as { CompressionStream?: unknown }).CompressionStream = saved;
    }
  });

  it("detects corruption and refuses states that are too large", async () => {
    const { io, data } = memIO();
    await saveChunked(io, lcgHex(400_000), 1, 0, 0);
    const c = data.get("s:0") as Uint8Array;
    c[3] ^= 0xff;
    await expect(loadChunked(io)).rejects.toThrow(/checksum|gzip|incorrect|invalid/i);
    await expect(saveChunked(memIO().io, lcgHex(2_000_000), 1, 0, 0, {}, 1000)).rejects.toThrow(/too large/);
  });
});

// ---------------------------------------------------------------------------------------------
// The real CareerRoom class with a stub engine
// ---------------------------------------------------------------------------------------------

describe("CareerRoom: lobby and day advance", () => {
  it("create, join, everyone ready advances to the next stop, views hide rivals", async () => {
    const { r, alice } = await league();
    const bob = await join(r, "bob");
    expect(alice.lobby.players.map((p) => [p.name, p.teamId, p.host])).toEqual([
      ["alice", "A", true],
      ["bob", "B", false],
    ]);
    expect(bob.last("welcome")!.you.teamId).toBe("B");
    expect(bob.view).toEqual({ day: 1, me: { cash: 100 }, votes: {} });
    expect(JSON.stringify(bob.ws.sent)).not.toContain("secret");
    expect(JSON.stringify(bob.ws.sent)).not.toContain(ID("alice")); // humanIds are never shown to others

    await alice.ready();
    expect(alice.view.day).toBe(1);
    expect(bob.lobby.players[0].ready).toBe(true);
    await bob.ready();
    expect(alice.view.day).toBe(3); // days 2 and 3, stopping at the "decision" stop
    expect(alice.lobby.stop).toBe("decision");
    expect(alice.lobby.players.every((p) => !p.ready)).toBe(true);
    expect(alice.all("log").at(-1)!.lines).toEqual(["Day 2", "Day 3"]);
  });

  it("without a timer a slow player holds everyone up, until the host marks them away", async () => {
    const { r, alice } = await league();
    const bob = await join(r, "bob");
    await alice.ready();
    r.time.t += 3_600_000;
    await r.room.alarm();
    expect(alice.view.day).toBe(1);
    expect(r.storage.alarm).toBeNull();
    await alice.send({ t: "away", away: true, target: "p2" });
    expect(alice.view.day).toBe(3);
    // bob acts, so he is back
    await bob.send({ t: "act", id: 1, action: { type: "spend", n: 5 } });
    expect(alice.lobby.players[1].away).toBeNull();
    expect(bob.last("result")).toEqual({ t: "result", id: 1, ok: true, message: "spent" });
    expect(bob.view.me.cash).toBe(95);
  });

  it("with a timer the countdown drives an alarm and unready humans are away for that step", async () => {
    const { r, alice } = await league({ timer: 30 });
    const bob = await join(r, "bob");
    const t0 = r.time.t;
    expect(alice.lobby.deadline).toBe(t0 + 30_000);
    expect(r.storage.alarm).toBe(t0 + 30_000);
    await alice.ready();
    expect(alice.view.day).toBe(1);
    r.time.t = t0 + 29_000;
    await r.room.alarm();
    expect(alice.view.day).toBe(1);
    r.time.t = t0 + 30_000;
    await r.room.alarm();
    expect(alice.view.day).toBe(3);
    expect(bob.lobby.players[1].away).toBeNull(); // timer-away lasts for one step only
    expect(alice.lobby.deadline).toBe(t0 + 60_000);
    expect(r.storage.alarm).toBe(t0 + 60_000);
  });

  it("leave frees the team for the AI; a new player takes it over in its current state", async () => {
    const { r, alice } = await league();
    const bob = await join(r, "bob");
    await bob.send({ t: "act", id: 1, action: { type: "spend", n: 40 } });
    await bob.send({ t: "leave" });
    expect(bob.ws.closedWith).toBe(1000);
    expect(alice.lobby.players.map((p) => p.name)).toEqual(["alice"]);
    expect(alice.lobby.freeTeams).toContain("B");
    const carl = await join(r, "carl", "B");
    expect(carl.view.me.cash).toBe(60); // took over the team as the previous manager left it
    expect(alice.lobby.players.map((p) => p.teamId)).toEqual(["A", "B"]);
  });

  it("a rejoin with the same id gets the same team back, and a second tab replaces the first", async () => {
    const { r, alice } = await league();
    const bob = await join(r, "bob");
    bob.ws.readyState = 3;
    await r.room.webSocketClose(bob.ws as never);
    expect(alice.lobby.players[1].connected).toBe(false);
    expect(alice.lobby.freeTeams).not.toContain("B");
    r.time.t += 60_000;
    const bob2 = await join(r, "bob");
    expect(bob2.last("welcome")!.you.teamId).toBe("B");
    const bob3 = await join(r, "bob");
    expect(bob2.ws.closedWith).toBe(4001);
    r.ctx.sockets = r.ctx.sockets.filter((s) => s !== bob2.ws);
    await r.room.webSocketClose(bob2.ws as never);
    expect(alice.lobby.players[1].connected).toBe(true); // bob3 is still there
    expect(bob3.last("welcome")!.you.teamId).toBe("B");
  });

  it("an absent player's seat goes back to the AI after the reservation, via the alarm", async () => {
    const { r, alice } = await league();
    const bob = await join(r, "bob");
    bob.ws.readyState = 3;
    await r.room.webSocketClose(bob.ws as never);
    const at = r.storage.alarm!;
    expect(at).toBe(r.time.t + 10 * 60_000);
    r.time.t = at;
    await r.room.alarm();
    expect(alice.lobby.players.map((p) => p.name)).toEqual(["alice"]);
    expect(alice.lobby.freeTeams).toContain("B");
  });

  it("the day waits only for connected humans, and a disconnect can open the gate", async () => {
    const { r, alice } = await league();
    const bob = await join(r, "bob");
    await alice.ready();
    bob.ws.readyState = 3;
    await r.room.webSocketClose(bob.ws as never);
    expect(alice.view.day).toBe(3);
  });

  it("host moves to the next connected player when the host disconnects", async () => {
    const { r, alice } = await league();
    const bob = await join(r, "bob");
    alice.ws.readyState = 3;
    await r.room.webSocketClose(alice.ws as never);
    expect(bob.lobby.players.find((p) => p.host)!.name).toBe("bob");
    expect(bob.last("lobby")!.lobby.you!.host).toBe(true);
  });

  it("votes go through the engine, are stored per team and shown in the lobby", async () => {
    const { r, alice } = await league();
    const bob = await join(r, "bob");
    await alice.send({ t: "vote", topic: "rules.drs", option: "ban" });
    await bob.send({ t: "vote", topic: "rules.drs", option: "keep" });
    await bob.send({ t: "vote", topic: "rules.nope", option: "keep" });
    expect(bob.errors).toEqual(["vote_rejected"]);
    expect(alice.lobby.votes).toEqual({ "rules.drs": { A: "ban", B: "keep" } });
    expect(alice.view.me).toBeDefined();
    await bob.send({ t: "clearVotes" });
    expect(bob.errors).toEqual(["vote_rejected", "forbidden"]);
    await alice.send({ t: "clearVotes", topic: "rules.drs" });
    expect(alice.lobby.votes).toEqual({});
  });

  it("settings are host only", async () => {
    const { r, alice } = await league();
    const bob = await join(r, "bob");
    await bob.send({ t: "settings", timer: 10 });
    expect(bob.errors).toEqual(["forbidden"]);
    await alice.send({ t: "settings", timer: 10, speedMode: "host" });
    expect(bob.lobby.settings).toMatchObject({ timer: 10, speedMode: "host" });
  });
});

describe("CareerRoom: validation and abuse", () => {
  it("rejects everything before join, junk, blocked actions, and rate-limits floods", async () => {
    const { r, alice } = await league();
    const ws = new FakeWS();
    r.room.acceptConnection(ws as never);
    const anon = new Client(r, ws, "anon");
    await anon.send({ t: "ready", ready: true });
    await anon.send({ t: "act", id: 1, action: { type: "spend", n: 1 } });
    expect(anon.errors).toEqual(["join_first", "join_first"]);
    await r.room.webSocketMessage(ws as never, "{{{");
    expect(anon.errors.at(-1)).toBe("bad_message");

    await alice.send({ t: "act", id: 5, action: { type: "continue" } });
    expect(alice.last("result")).toMatchObject({ id: 5, ok: false });
    await alice.send({ t: "act", id: 6, action: { type: "day" } });
    expect(alice.last("result")).toMatchObject({ id: 6, ok: false });
    await alice.send({ t: "act", id: 7, action: { type: "spend", n: 99999 } });
    expect(alice.last("result")).toMatchObject({ id: 7, ok: false, message: "unknown action" });
    expect(alice.view.me.cash).toBe(100);

    for (let i = 0; i < 100; i++) await alice.send({ t: "ping", c: i });
    expect(alice.errors.filter((c) => c === "rate_limited").length).toBeGreaterThan(40);
    r.time.t += 10_000;
    await alice.send({ t: "ping", c: 1000 });
    expect(alice.last("pong")!.c).toBe(1000);
  });

  it("a player cannot act for another team or create twice, and a non-host cannot create", async () => {
    const { r, alice } = await league();
    const bob = await join(r, "bob");
    await bob.send({ t: "act", id: 1, action: { type: "spend", n: 10 }, team: "A" }); // the team field is ignored
    expect(bob.view.me.cash).toBe(90);
    expect(alice.view.me.cash).toBe(100);
    await bob.send({ t: "create", teamId: "B", settings: { teamIds: TEAMS } });
    expect(bob.errors).toContain("create_failed");
    await alice.send({ t: "create", teamId: "A", settings: { teamIds: TEAMS } });
    expect(alice.errors).toContain("create_failed");
  });

  it("an engine that throws on step leaves the state alone and tells everyone", async () => {
    setEngine(makeEngine({ failStep: true }));
    const r = await rig();
    const alice = await join(r, "alice");
    await alice.send({ t: "create", teamId: "A", settings: { teamIds: TEAMS } });
    await alice.ready();
    expect(alice.errors).toContain("step_failed");
    expect(alice.view.day).toBe(1);
    expect(alice.lobby.players[0].ready).toBe(false);
  });

  it("without an engine, create fails with a clear error and nothing crashes", async () => {
    clearEngine();
    const r = await rig();
    const alice = await join(r, "alice");
    await alice.send({ t: "create", teamId: "A", settings: { teamIds: TEAMS } });
    expect(alice.errors).toEqual(["no_engine"]);
    expect(alice.all("error")[0].message).toContain("setEngine");
    expect(new NoEngineError().message).toContain("src/career/multi.ts");
    expect(alice.lobby.created).toBe(false);
  });
});

describe("CareerRoom: race weekend with lockstep sessions", () => {
  async function toWeekend() {
    const { r, alice } = await league();
    const bob = await join(r, "bob");
    for (let i = 0; i < 4 && alice.lobby.phase !== "weekend"; i++) {
      await alice.ready();
      await bob.ready();
    }
    return { r, alice, bob };
  }

  it("practice is individual, then qualifying and race run once for everybody", async () => {
    const { r, alice, bob } = await toWeekend();
    expect(alice.lobby.phase).toBe("weekend");
    expect(alice.lobby.stop).toBe("raceweek");
    expect(alice.view.day).toBe(7);
    // individual practice and setup actions are still allowed
    await alice.send({ t: "act", id: 1, action: { type: "spend", n: 1 } });
    expect(alice.last("result")!.ok).toBe(true);
    // commands are refused when no session is running
    await alice.send({ t: "cmd", cmd: { k: "pit" } });
    expect(alice.errors).toContain("no_session");

    await alice.ready();
    await bob.ready();
    expect(alice.lobby.phase).toBe("sessionLobby");
    expect(alice.lobby.session).toEqual({ kind: "qualifying", state: "lobby" });
    const info0 = bob.last("session")!.info;
    expect(info0).toMatchObject({ kind: "qualifying", state: "lobby", teams: ["A", "B"] });
    expect(info0.plan).toEqual({ kind: "qualifying", seed: 7 * 7919 });

    // a session starts when all humans press start
    await alice.ready();
    expect(alice.lobby.phase).toBe("sessionLobby");
    await bob.ready();
    expect(alice.lobby.phase).toBe("session");
    const run = bob.last("session")!.info;
    expect(run.state).toBe("running");
    expect(run.segs).toHaveLength(1);

    // ordered, tick-stamped commands reach everyone identically
    r.time.t += 500;
    await alice.send({ t: "cmd", cmd: { k: "pit", car: 1 } });
    await bob.send({ t: "cmd", cmd: { k: "push", car: 2 } });
    const a = alice.all("cmd").map((m) => m.c);
    const b = bob.all("cmd").map((m) => m.c);
    expect(a).toEqual(b);
    expect(a.map((c) => c.seq)).toEqual([1, 2]);
    expect(a.map((c) => c.team)).toEqual(["A", "B"]);
    expect(a[0].tick).toBeGreaterThanOrEqual(run.hz);
    await alice.send({ t: "act", id: 9, action: { type: "spend", n: 1 } });
    expect(alice.last("result")).toMatchObject({ ok: false });

    // speed is by majority of humans, never one player
    await alice.send({ t: "speed", speed: 4 });
    expect(alice.all("speedSeg")).toHaveLength(0);
    await bob.send({ t: "speed", speed: 4 });
    expect(alice.last("speedSeg")!.seg.speed).toBe(4);

    // heartbeat via alarm
    r.time.t += 300;
    await r.room.alarm();
    expect(alice.last("hz")!.tick).toBeGreaterThan(a[0].tick - 1);

    // a desynced client is told
    await alice.send({ t: "hash", tick: 50, h: "50:1" });
    await bob.send({ t: "hash", tick: 50, h: "50:2" });
    expect(alice.last("desync")).toBeDefined();
    expect(bob.last("desync")).toBeDefined();
    await alice.send({ t: "resync" });
    expect(alice.last("session")!.info.log).toHaveLength(2);

    // results: majority decides; the engine applies them
    await alice.send({ t: "finish", results: { grid: [2, 1] } });
    expect(alice.lobby.phase).toBe("session");
    await bob.send({ t: "finish", results: { grid: [2, 1] } });
    expect(alice.last("sessionEnd")).toEqual({ t: "sessionEnd", kind: "qualifying", applied: true });
    expect(alice.lobby.phase).toBe("sessionLobby");
    expect(alice.lobby.session).toEqual({ kind: "race", state: "lobby" });

    await alice.ready();
    await bob.ready();
    await alice.send({ t: "finish", results: { win: "A" } });
    await bob.send({ t: "finish", results: { win: "A" } });
    expect(alice.last("sessionEnd")).toEqual({ t: "sessionEnd", kind: "race", applied: true });
    expect(alice.lobby.phase).toBe("world");
    expect(alice.view.day).toBe(8);
  });

  it("the grace period settles a session when a client never reports, and abort falls back to the engine", async () => {
    const { r, alice, bob } = await toWeekend();
    await alice.ready();
    await bob.ready();
    await alice.ready();
    await bob.ready();
    await alice.send({ t: "finish", results: { a: 1 } });
    expect(alice.lobby.phase).toBe("session");
    r.time.t += 21_000;
    await r.room.alarm();
    expect(alice.last("sessionEnd")).toMatchObject({ kind: "qualifying", applied: true });

    await alice.ready();
    await bob.ready();
    await bob.send({ t: "abortSession" });
    expect(bob.errors).toContain("forbidden");
    await alice.send({ t: "abortSession" });
    expect(alice.last("sessionEnd")).toEqual({ t: "sessionEnd", kind: "race", applied: false });
    expect(alice.lobby.phase).toBe("world");
  });

  it("commands can be vetoed by the engine's authorizeCommand hook", async () => {
    setEngine(makeEngine(), { authorizeCommand: (_p, team, cmd) => (cmd as { car?: string }).car === team });
    const r = await rig();
    const alice = await join(r, "alice");
    await alice.send({ t: "create", teamId: "A", settings: { teamIds: TEAMS } });
    const bob = await join(r, "bob");
    for (let i = 0; i < 4 && alice.lobby.phase !== "weekend"; i++) {
      await alice.ready();
      await bob.ready();
    }
    for (let i = 0; i < 4; i++) {
      await alice.ready();
      await bob.ready();
    }
    expect(alice.lobby.phase).toBe("session");
    await alice.send({ t: "cmd", cmd: { car: "B" } });
    expect(alice.errors).toContain("cmd_rejected");
    await alice.send({ t: "cmd", cmd: { car: "A" } });
    expect(alice.all("cmd")).toHaveLength(1);
  });
});

describe("CareerRoom: persistence of a multi-MB state", () => {
  it("writes gzip chunks of at most 100 KiB, restores after eviction, and keeps playing", async () => {
    const { r, alice } = await league({ bigBytes: 6_000_000 });
    const bob = await join(r, "bob");
    await alice.ready();
    await bob.ready();
    expect(alice.view.day).toBe(3);
    expect(alice.errors).toEqual([]);

    const st = r.storage;
    const man = st.data.get("m") as { n: number; raw: number; bytes: number; codec: string; rev: number };
    expect(man.codec).toBe("gzip");
    expect(man.raw).toBeGreaterThan(6_000_000);
    expect(man.n).toBeGreaterThan(20); // hex noise compresses about 2:1, so several MB of chunks
    expect(man.n).toBeLessThanOrEqual(120);
    for (let i = 0; i < man.n; i++) expect((st.data.get(`s:${i}`) as Uint8Array).byteLength).toBeLessThanOrEqual(100 * 1024);
    expect(st.data.has(`s:${man.n}`)).toBe(false);
    expect(st.maxValue).toBeLessThanOrEqual(128 * 1024);

    // eviction: a brand new object over the same storage and the same live sockets
    const r2 = await rig(st, r.ctx.sockets, r.time);
    expect(r2.room).not.toBe(r.room);
    const writesBefore = st.writes;
    await alice.send({ t: "ping", c: 1 }); // goes to the OLD object; use the new one below
    const alice2 = new Client(r2, alice.ws, "alice");
    alice2.clear();
    await alice2.send({ t: "act", id: 1, action: { type: "spend", n: 10 } });
    expect(alice2.last("result")).toMatchObject({ ok: true });
    expect(alice2.view.day).toBe(3);
    expect(alice2.view.me.cash).toBe(90);
    expect(alice2.lobby.players.map((p) => [p.name, p.teamId, p.host, p.connected])).toEqual([
      ["alice", "A", true, true],
      ["bob", "B", false, true],
    ]);
    expect(st.writes).toBeGreaterThan(writesBefore);

    // and the restored object can advance the world again
    const bob2 = new Client(r2, bob.ws, "bob");
    await alice2.ready();
    await bob2.ready();
    expect(alice2.view.day).toBe(6);

    // a third object sees exactly what the second wrote
    const r3 = await rig(st, r.ctx.sockets, r.time);
    const alice3 = new Client(r3, alice.ws, "alice");
    alice3.clear();
    await alice3.send({ t: "ready", ready: false });
    expect(alice3.view.day).toBe(6);
    expect(alice3.view.me.cash).toBe(90);
  });

  it("deletes stale chunks when the state shrinks, and saves nothing big when only metadata changes", async () => {
    const { r, alice } = await league({ bigBytes: 2_000_000 });
    const man1 = r.storage.data.get("m") as { n: number };
    expect(man1.n).toBeGreaterThan(5);
    const keysBefore = [...r.storage.data.keys()].filter((k) => k.startsWith("s:")).length;
    expect(keysBefore).toBe(man1.n);

    const chunkBefore = Buffer.from(r.storage.data.get("s:0") as Uint8Array).toString("base64");
    const writesBefore = r.storage.writes;
    await alice.send({ t: "settings", timer: 30 }); // metadata only
    expect(r.storage.writes - writesBefore).toBe(1); // just the small meta value
    expect(Buffer.from(r.storage.data.get("s:0") as Uint8Array).toString("base64")).toBe(chunkBefore);

    await alice.send({ t: "act", id: 1, action: { type: "shrink" } });
    const man2 = r.storage.data.get("m") as { n: number };
    expect(man2.n).toBe(1);
    expect([...r.storage.data.keys()].filter((k) => k.startsWith("s:"))).toEqual(["s:0"]);
  });

  it("refuses to start from a corrupted store instead of silently resetting the league", async () => {
    const { r } = await league({ bigBytes: 1_000_000 });
    const c = r.storage.data.get("s:1") as Uint8Array;
    c[10] ^= 0xff;
    const ctx = new FakeCtx(r.storage);
    const room = new CareerRoom(ctx as never, {});
    room.clock = () => r.time.t;
    await expect(ctx.ready).rejects.toThrow();
  });

  it("a state too large to persist is reported to the players", async () => {
    const { r, alice } = await league({ bigBytes: 100_000 });
    // 40 MB of noise would exceed 120 chunks; build it through the engine by replacing the state size
    setEngine({
      ...makeEngine(),
      reduceAs: (s) => ({ state: { ...s, big: lcgHex(26_000_000, 99) }, ok: true, message: "big" }),
    });
    await alice.send({ t: "act", id: 1, action: { type: "grow" } });
    expect(alice.errors).toContain("persist_failed");
    expect(r.storage.maxValue).toBeLessThanOrEqual(128 * 1024);
  }, 60_000);
});
