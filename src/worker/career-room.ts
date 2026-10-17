import { DurableObject } from "cloudflare:workers";
import {
  CareerLeague,
  FINISH_GRACE_MS,
  HZ_INTERVAL_MS,
  MAX_DAYS_PER_ADVANCE,
  PROTOCOL,
  RateLimiter,
  SessionRelay,
  SKIP_SPEED,
  skipVerdict,
  loadChunked,
  parseClientMsg,
  saveChunked,
  type CareerEngine,
  type CareerEngineExtras,
  type ChunkIO,
  type ClientMsg,
  type CreateSettings,
  type GateAction,
  type LeagueData,
  type LeagueSettings,
  type RelayData,
  type ServerMsg,
} from "../shared/careerNet";

/**
 * Shared multiplayer career mode. ONE Durable Object per league code (route /api/career/:room).
 *
 *  - The authoritative CareerState lives here, behind the CareerEngine interface. Clients only get
 *    engine.view(state, theirTeam). LEAK RISK: whatever view() returns reaches that player's browser,
 *    so it must not contain hidden data (true car pace, rival R&D, AI budgets, the seed).
 *  - WebSocket hibernation API like LeagueRoom: the object can be evicted while sockets stay open.
 *    Everything needed is persisted: a small `meta` value (players, settings, session relay) and the
 *    big career state as gzip chunks `s:0..n` plus manifest `m`.
 *  - Alarms drive the countdown timer, seat release, and (during a session) the lockstep heartbeat.
 *  - The world is advanced by the engine; the lockstep sessions are NOT simulated here. The server only
 *    orders commands (see SessionRelay).
 */

// ---------------------------------------------------------------------------------------------
// Engine adapter
// ---------------------------------------------------------------------------------------------

let engine: CareerEngine<unknown> | null = null;
let extras: CareerEngineExtras = {};

/**
 * Plug in the real engine (src/career/multi.ts). Call once at module load, for example in
 * src/worker/index.ts:  setEngine(multiEngine);
 */
export function setEngine<S>(e: CareerEngine<S>, x: CareerEngineExtras = {}): void {
  engine = e as unknown as CareerEngine<unknown>;
  extras = x;
}

/** For tests. */
export function clearEngine(): void {
  engine = null;
  extras = {};
}

export class NoEngineError extends Error {
  constructor() {
    super("CareerRoom has no engine. Call setEngine(engine) from src/worker/index.ts with the implementation in src/career/multi.ts.");
    this.name = "NoEngineError";
  }
}

interface CareerEnv {
  /** Set to "1" (wrangler dev --var CAREER_STUB_ENGINE:1) to use the tiny built-in stub engine. Dev and smoke tests only. */
  CAREER_STUB_ENGINE?: string;
}

interface StubState {
  day: number;
  teams: Record<string, { human: string | null; cash: number }>;
  results: unknown[];
}

/** A deliberately tiny engine so the room can be smoke tested without the real game. Not for production. */
const devStubEngine: CareerEngine<StubState> = {
  create: ({ settings, teamId }) => {
    const ids = (settings as LeagueSettings).teamIds;
    const teams: StubState["teams"] = {};
    for (const id of ids) teams[id] = { human: id === teamId ? "host" : null, cash: 100 };
    return { day: 1, teams, results: [] };
  },
  assign: (s, teamId, humanId) => (s.teams[teamId] ? { ...s, teams: { ...s.teams, [teamId]: { ...s.teams[teamId], human: humanId } } } : s),
  reduceAs: (s, teamId, a) => {
    const act = a as { type?: string; n?: number };
    if (act.type === "spend" && typeof act.n === "number" && act.n > 0 && act.n <= s.teams[teamId].cash) {
      return { state: { ...s, teams: { ...s.teams, [teamId]: { ...s.teams[teamId], cash: s.teams[teamId].cash - act.n } } }, ok: true, message: "spent" };
    }
    if (act.type === "vote") return { state: s, ok: true, message: "vote noted" };
    return { state: s, ok: false, message: "unknown action" };
  },
  stepDay: (s) => {
    const day = s.day + 1;
    return { state: { ...s, day }, stop: day % 3 === 0 ? "decision" : null, weekend: day % 7 === 0, log: [`Day ${day}`] };
  },
  view: (s, teamId) => ({ day: s.day, me: s.teams[teamId] ?? null }),
  sessionPlan: (s, kind) => ({ kind, seed: s.day * 7919, laps: 3 }),
  applySession: (s, kind, results) => ({ ...s, day: s.day + 1, results: [...s.results, { kind, results }] }),
};

function getEngine(env: CareerEnv | undefined): CareerEngine<unknown> {
  if (engine) return engine;
  if (env?.CAREER_STUB_ENGINE === "1") return devStubEngine as unknown as CareerEngine<unknown>;
  throw new NoEngineError();
}

// ---------------------------------------------------------------------------------------------
// The room
// ---------------------------------------------------------------------------------------------

interface Attachment {
  humanId: string | null;
}

interface Meta {
  league: LeagueData;
  relay: RelayData | null;
  careerRev: number;
}

const HORIZON_SKIP_AFTER_WAKE = 100;

export class CareerRoom extends DurableObject<CareerEnv> {
  /** Injectable clock for tests. */
  clock: () => number = () => Date.now();

  private league: CareerLeague = CareerLeague.create("");
  private career: unknown = null;
  private careerRev = 0;
  private relay: SessionRelay | null = null;

  private queuedRev = -1;
  private savedChunks = 0;
  private lastMetaSig = "";
  private persistChain: Promise<void> = Promise.resolve();
  private alarmAt: number | null = null;

  private sentLobbyRev = -1;
  private buckets = new WeakMap<WebSocket, RateLimiter>();
  private strikes = new WeakMap<WebSocket, number>();
  private viewKey = new WeakMap<WebSocket, string>();
  private viewJson = new WeakMap<WebSocket, string>();
  private lastResync = new WeakMap<WebSocket, number>();

  constructor(ctx: DurableObjectState, env: CareerEnv) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(() => this.load());
  }

  // ---- persistence ----

  private io(): ChunkIO {
    const st = this.ctx.storage;
    return {
      getMany: async (keys) => (await st.get(keys)) as Map<string, unknown>,
      putMany: (entries) => st.put(entries),
      deleteMany: async (keys) => {
        await st.delete(keys);
      },
    };
  }

  private async load(): Promise<void> {
    const now = this.clock();
    const meta = await this.ctx.storage.get<Meta>("meta");
    if (meta) {
      this.league = CareerLeague.restore(meta.league);
      this.careerRev = meta.careerRev;
      if (meta.relay) {
        this.relay = new SessionRelay(structuredClone(meta.relay));
        // The horizon is persisted lazily. Jump it forward so a command can never be stamped into a tick
        // that a client was already allowed to simulate before this object was evicted.
        if (this.relay.running) this.relay.d.horizon = Math.max(this.relay.d.horizon, this.relay.released(now)) + HORIZON_SKIP_AFTER_WAKE;
      }
      // Throws on a corrupt or missing chunk on purpose: never silently start from an empty career.
      const chunked = await loadChunked(this.io());
      if (chunked) {
        this.career = JSON.parse(chunked.text);
        this.savedChunks = chunked.manifest.n;
        this.queuedRev = chunked.manifest.rev;
        this.careerRev = chunked.manifest.rev;
      } else if (meta.league.created) {
        throw new Error("league is created but its career state is missing from storage");
      }
      this.league.reconcile(this.connectedIds(), now);
      this.lastMetaSig = this.metaSig();
    }
  }

  private metaSig(): string {
    const r = this.relay?.d;
    return JSON.stringify({ l: this.league.d, r: r ? { ...r, horizon: Math.floor(r.horizon / 50) } : null, c: this.careerRev });
  }

  /** Snapshot synchronously, write asynchronously and in order. */
  private persist(): Promise<void> {
    const sig = this.metaSig();
    const needState = this.career !== null && this.careerRev !== this.queuedRev;
    if (sig === this.lastMetaSig && !needState) return this.persistChain;
    this.lastMetaSig = sig;
    const meta: Meta = { league: this.league.d, relay: this.relay?.d ?? null, careerRev: this.careerRev };
    const metaJson = JSON.stringify(meta);
    const stateJson = needState ? JSON.stringify(this.career) : null;
    const rev = this.careerRev;
    if (needState) this.queuedRev = rev;
    const now = this.clock();
    this.persistChain = this.persistChain
      .then(async () => {
        const metaCopy = JSON.parse(metaJson) as Meta;
        if (stateJson !== null) {
          const man = await saveChunked(this.io(), stateJson, rev, now, this.savedChunks, { meta: metaCopy });
          this.savedChunks = man.n;
        } else {
          await this.ctx.storage.put("meta", metaCopy);
        }
      })
      .catch((err: unknown) => {
        this.queuedRev = -1;
        this.lastMetaSig = "";
        console.error("career persist failed", err);
        this.broadcast({ t: "error", code: "persist_failed", message: `The league could not be saved: ${errText(err)}` });
      });
    return this.persistChain;
  }

  // ---- sockets ----

  private joined(): Array<{ ws: WebSocket; humanId: string }> {
    const out: Array<{ ws: WebSocket; humanId: string }> = [];
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a?.humanId) out.push({ ws, humanId: a.humanId });
    }
    return out;
  }

  private connectedIds(except?: WebSocket): Set<string> {
    const ids = new Set<string>();
    for (const { ws, humanId } of this.joined()) {
      if (ws === except) continue;
      if (typeof ws.readyState === "number" && ws.readyState > 1) continue;
      ids.add(humanId);
    }
    return ids;
  }

  private send(ws: WebSocket, msg: ServerMsg): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* socket already gone */
    }
  }

  private broadcast(msg: ServerMsg): void {
    const text = JSON.stringify(msg);
    for (const { ws } of this.joined()) {
      try {
        ws.send(text);
      } catch {
        /* socket already gone */
      }
    }
  }

  private err(ws: WebSocket, code: string, message: string): void {
    this.send(ws, { t: "error", code, message });
  }

  /** Test seam: the fetch handler cannot be driven from Node (a 101 Response is not constructible). */
  acceptConnection(server: WebSocket): void {
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ humanId: null } satisfies Attachment);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    if (!this.league.d.code) this.league.d.code = new URL(request.url).pathname.split("/")[3] ?? "league";
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.acceptConnection(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const now = this.clock();
    if (typeof raw !== "string") return;
    let bucket = this.buckets.get(ws);
    if (!bucket) {
      bucket = new RateLimiter(20, 40, now);
      this.buckets.set(ws, bucket);
    }
    if (!bucket.allow(now)) {
      const n = (this.strikes.get(ws) ?? 0) + 1;
      this.strikes.set(ws, n);
      this.err(ws, "rate_limited", "Slow down.");
      if (n > 50) ws.close(4008, "rate limited");
      return;
    }
    const parsed = parseClientMsg(raw);
    if (!parsed.ok) {
      this.err(ws, "bad_message", parsed.error);
      return;
    }
    try {
      this.handle(ws, parsed.msg, now);
    } catch (e) {
      if (e instanceof NoEngineError) this.err(ws, "no_engine", e.message);
      else {
        console.error("career handler failed", e);
        this.err(ws, "internal", errText(e));
      }
    }
    await this.settle(now);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      ws.close(1000, "closed");
    } catch {
      /* already closed */
    }
    await this.dropSocket(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.dropSocket(ws);
  }

  private async dropSocket(ws: WebSocket): Promise<void> {
    const now = this.clock();
    const a = ws.deserializeAttachment() as Attachment | null;
    if (a?.humanId && !this.connectedIds(ws).has(a.humanId)) this.league.disconnect(a.humanId, now);
    await this.settle(now);
  }

  async alarm(): Promise<void> {
    const now = this.clock();
    this.alarmAt = null;
    const relay = this.relay;
    if (relay?.running) {
      // a ballot to skip the session can be settled by someone leaving, not only by someone voting
      if (this.league.d.votes.skip && !this.league.d.votes.skipResult) this.settleSkip(now);
      this.broadcast({ t: "hz", tick: relay.beat(now) });
      for (const [tick, bad] of relay.sweepHashes(now)) this.flagDesync(bad, tick);
      if (relay.firstFinishAt !== null && now - relay.firstFinishAt >= FINISH_GRACE_MS) {
        try {
          this.tryResolveSession(now, true);
        } catch (e) {
          this.broadcast({ t: "error", code: "session_apply_failed", message: errText(e) });
        }
      }
    }
    await this.settle(now);
  }

  // ---- message handling ----

  private handle(ws: WebSocket, msg: ClientMsg, now: number): void {
    const att = (ws.deserializeAttachment() as Attachment | null) ?? { humanId: null };
    const L = this.league;

    if (msg.t === "ping") {
      this.send(ws, { t: "pong", c: msg.c, serverNow: now });
      return;
    }
    if (msg.t === "join") {
      if (att.humanId) return this.err(ws, "already_joined", "This connection already joined.");
      const r = L.join(msg.humanId, msg.name, msg.teamId);
      if (!r.ok) {
        this.err(ws, "join_failed", r.error);
        ws.close(4003, r.error);
        return;
      }
      ws.serializeAttachment({ humanId: msg.humanId } satisfies Attachment);
      for (const other of this.joined()) {
        if (other.humanId === msg.humanId && other.ws !== ws) {
          try {
            other.ws.close(4001, "replaced by a newer connection");
          } catch {
            /* ignore */
          }
        }
      }
      this.send(ws, { t: "welcome", v: PROTOCOL, you: { pid: r.player.pid, teamId: r.player.teamId, host: L.isHost(msg.humanId) }, serverNow: now });
      if (this.relay) this.send(ws, { t: "session", info: this.relay.info(now) });
      this.applyAssignments();
      return;
    }

    const humanId = att.humanId;
    if (!humanId) return this.err(ws, "join_first", "Send join first.");
    const me = L.player(humanId);
    if (!me) return this.err(ws, "not_in_room", "You are not in this league any more. Join again.");

    switch (msg.t) {
      case "create": {
        const v = L.validateCreate(humanId, msg.teamId, msg.settings);
        if (!v.ok) return this.err(ws, "create_failed", v.error);
        const eng = getEngine(this.env);
        const seed = msg.settings.seed ?? randomSeed();
        this.career = eng.create({ seed, teamId: msg.teamId, settings: buildSettings(msg.settings, seed) });
        this.careerRev++;
        L.commitCreate(humanId, msg.teamId, msg.settings, seed, now);
        this.applyAssignments();
        return;
      }
      case "settings": {
        const r = L.setSettings(humanId, { timer: msg.timer, speedMode: msg.speedMode }, now);
        if (!r.ok) this.err(ws, "forbidden", r.error);
        return;
      }
      case "claim": {
        const r = L.claim(humanId, msg.teamId);
        if (!r.ok) return this.err(ws, "claim_failed", r.error);
        this.applyAssignments();
        return;
      }
      case "leave": {
        L.leave(humanId);
        this.applyAssignments();
        try {
          ws.serializeAttachment({ humanId: null } satisfies Attachment);
          ws.close(1000, "left");
        } catch {
          /* ignore */
        }
        return;
      }
      case "ready": {
        const r = L.setReady(humanId, msg.ready, now);
        if (!r.ok) this.err(ws, "not_allowed", r.error);
        return;
      }
      case "away": {
        const r = L.setAway(humanId, msg.target, msg.away, now);
        if (!r.ok) this.err(ws, "not_allowed", r.error);
        return;
      }
      case "act": {
        const team = me.teamId;
        const ph = L.d.phase;
        if (!team || !L.d.created) return this.reply(ws, msg.id, false, "You have no team.");
        if (ph === "session") return this.reply(ws, msg.id, false, "Not while a session is running.");
        const type = (msg.action as { type: string }).type;
        if (type === "continue" || type === "day" || extras.blockedActionTypes?.includes(type)) return this.reply(ws, msg.id, false, "That action is not available in a shared league.");
        L.touch(humanId, now);
        const r = getEngine(this.env).reduceAs(this.career, team, msg.action);
        if (r.ok) {
          this.career = r.state;
          this.careerRev++;
        }
        this.reply(ws, msg.id, r.ok, r.message);
        return;
      }
      case "vote": {
        const team = me.teamId;
        if (!team || !L.d.created) return this.err(ws, "vote_rejected", "You have no team.");
        // The engine validates topic, option and stage. A vote is stored in the room only if it accepts it.
        const r = getEngine(this.env).reduceAs(this.career, team, { type: "vote", topic: msg.topic, option: msg.option });
        if (!r.ok) return this.err(ws, "vote_rejected", r.message || "The vote was not accepted.");
        this.career = r.state;
        this.careerRev++;
        L.castVote(humanId, msg.topic, msg.option, now);
        if (msg.topic === "skip") this.settleSkip(now);
        return;
      }
      case "clearVotes": {
        const r = L.clearVotes(humanId, msg.topic);
        if (!r.ok) this.err(ws, "forbidden", r.error);
        return;
      }
      case "cmd": {
        const relay = this.relay;
        const team = me.teamId;
        if (!relay || !relay.running || L.d.phase !== "session") return this.err(ws, "no_session", "No session is running.");
        if (!team || !relay.d.teams.includes(team)) return this.err(ws, "not_allowed", "Your team is not in this session.");
        if (extras.authorizeCommand && !extras.authorizeCommand(relay.d.plan, team, msg.cmd)) return this.err(ws, "cmd_rejected", "That command is not allowed for your team.");
        L.touch(humanId, now);
        const s = relay.submit(team, msg.cmd, now);
        if (!s) return this.err(ws, "cmd_rejected", "The command was not accepted.");
        this.broadcast({ t: "cmd", c: s.c, hz: s.hz });
        return;
      }
      case "speed": {
        const relay = this.relay;
        const team = me.teamId;
        if (!relay || !relay.running || !team) return this.err(ws, "no_session", "No session is running.");
        L.touch(humanId, now);
        const hostTeam = L.d.hostId ? (L.player(L.d.hostId)?.teamId ?? null) : null;
        const voters = L.activeHumans().map((p) => p.teamId as string).filter((t) => relay.d.teams.includes(t));
        const r = relay.voteSpeed(team, msg.speed, L.d.settings.speedMode, hostTeam, voters, now);
        // everyone can see who voted for what speed
        L.castVote(humanId, "speed", String(msg.speed), now);
        if (r) this.broadcast({ t: "speedSeg", seg: r.seg, hz: r.hz });
        return;
      }
      case "hash": {
        const relay = this.relay;
        if (!relay || !relay.running) return;
        const expected = this.connectedIds().size;
        const bad = relay.reportHash(me.pid, msg.tick, msg.h, expected, now);
        if (bad.length) this.flagDesync(bad, msg.tick);
        return;
      }
      case "finish": {
        const relay = this.relay;
        if (!relay || !relay.running) return;
        relay.reportFinal(me.pid, msg.results, now);
        this.tryResolveSession(now, false);
        return;
      }
      case "resync": {
        const relay = this.relay;
        if (!relay) return this.err(ws, "no_session", "No session.");
        const last = this.lastResync.get(ws) ?? 0;
        if (now - last < 3000) return this.err(ws, "rate_limited", "Resync is limited to once every 3 seconds.");
        this.lastResync.set(ws, now);
        this.send(ws, { t: "session", info: relay.info(now) });
        return;
      }
      case "abortSession": {
        if (!L.isHost(humanId)) return this.err(ws, "forbidden", "Only the host can abort a session.");
        if (!this.relay || L.d.phase !== "session") return this.err(ws, "no_session", "No session is running.");
        this.finalizeSession(null, now);
        return;
      }
    }
  }

  private reply(ws: WebSocket, id: number, ok: boolean, message: string): void {
    this.send(ws, { t: "result", id, ok, message: message.slice(0, 300) });
  }

  private flagDesync(pids: string[], tick: number): void {
    for (const { ws, humanId } of this.joined()) {
      const p = this.league.player(humanId);
      if (p && pids.includes(p.pid)) this.send(ws, { t: "desync", tick, reason: "state hash differs from the majority" });
    }
  }

  // ---- engine side effects ----

  private applyAssignments(): void {
    const list = this.league.drainAssignments();
    if (!list.length || this.career === null) return;
    const eng = getEngine(this.env);
    for (const a of list) {
      this.career = eng.assign(this.career, a.teamId, a.pid);
      this.careerRev++;
    }
  }

  /** Run every gate that is open. Each action restarts the gate, so this terminates quickly. */
  private pump(now: number): void {
    this.league.tick(now);
    try {
      this.applyAssignments();
    } catch (e) {
      console.error("assign failed", e);
    }
    for (let i = 0; i < 10; i++) {
      const a = this.league.poll(now);
      if (!a) break;
      this.execute(a, now);
    }
  }

  private execute(a: GateAction, now: number): void {
    if (a.do === "stepWorld") return this.stepWorld(now);
    if (a.do === "openSession") return this.openSession(a.kind, now);
    this.relay?.start(now);
    this.league.beginSession();
    if (this.relay) this.broadcast({ t: "session", info: this.relay.info(now) });
  }

  private stepWorld(now: number): void {
    try {
      const eng = getEngine(this.env);
      let s = this.career;
      let days = 0;
      let stop: string | null = null;
      let weekend = false;
      const lines: string[] = [];
      while (days < MAX_DAYS_PER_ADVANCE) {
        const r = eng.stepDay(s);
        s = r.state;
        days++;
        for (const l of r.log) lines.push(String(l).slice(0, 160));
        stop = r.stop;
        weekend = r.weekend;
        if (stop !== null || weekend) break;
      }
      this.career = s;
      this.careerRev++;
      this.league.afterStep({ stop, weekend, days, log: lines }, now);
      if (lines.length) this.broadcast({ t: "log", lines: lines.slice(-30) });
    } catch (e) {
      this.league.stepFailed(errText(e), now);
      this.broadcast({ t: "error", code: e instanceof NoEngineError ? "no_engine" : "step_failed", message: errText(e) });
    }
  }

  /**
   * Everyone's cars are out and the league is deciding whether to skip the rest of the session. It is settled as soon as one
   * side has more than half of the people who can vote, or when all of them have voted. A tie is settled at random.
   */
  private settleSkip(now: number): void {
    const relay = this.relay;
    const L = this.league;
    if (!relay?.running || L.d.votes.skipResult) return;
    const voters = L.activeHumans().map((p) => p.teamId as string).filter((t) => relay.d.teams.includes(t));
    if (!voters.length) return;
    const result = skipVerdict(L.d.votes.skip ?? {}, voters, Math.random);
    if (!result) return;
    L.settleVote("skip", result);
    if (result === "skip") {
      const r = relay.forceSpeed(SKIP_SPEED, now);
      if (r) this.broadcast({ t: "speedSeg", seg: r.seg, hz: r.hz });
    }
  }

  private openSession(kind: string, now: number): void {
    try {
      const plan = getEngine(this.env).sessionPlan(this.career, kind);
      const teams = this.league.humans().map((p) => p.teamId as string);
      this.relay = SessionRelay.create(`${kind}-${this.league.d.steps}-${now.toString(36)}`, kind, plan, teams);
      this.league.resetVote("skip");
      this.league.resetVote("speed");
      this.league.openSession(kind, now);
      this.broadcast({ t: "session", info: this.relay.info(now) });
    } catch (e) {
      this.relay = null;
      this.league.abortWeekend(now);
      this.broadcast({ t: "error", code: "session_plan_failed", message: errText(e) });
    }
  }

  private tryResolveSession(now: number, force: boolean): void {
    const relay = this.relay;
    if (!relay?.running) return;
    const expected = [...this.connectedIds()].map((id) => this.league.player(id)?.pid).filter((x): x is string => !!x);
    const r = relay.resolveFinal(expected, force);
    if (r.status === "wait") return;
    if (r.status === "split") {
      if (relay.d.splits >= 3) {
        this.broadcast({ t: "error", code: "session_split", message: "Clients could not agree on the results. The session is settled by the engine instead." });
        this.finalizeSession(null, now);
      } else {
        this.broadcast({ t: "desync", tick: -1, reason: "final results differ between clients, resync and finish again" });
      }
      return;
    }
    this.finalizeSession(r.results, now);
  }

  private finalizeSession(results: unknown, now: number): void {
    const relay = this.relay;
    if (!relay) return;
    const kind = relay.d.kind;
    this.career = getEngine(this.env).applySession(this.career, kind, results);
    this.careerRev++;
    this.relay = null;
    this.broadcast({ t: "sessionEnd", kind, applied: results !== null });
    const next = this.league.finishSession(now);
    if (next) this.openSession(next, now);
  }

  // ---- fan-out, persistence, alarms ----

  private async settle(now: number): Promise<void> {
    this.pump(now);
    this.fanOut(now);
    await this.persist();
    this.scheduleAlarm(now);
  }

  private fanOut(now: number): void {
    const lobbyChanged = this.league.d.rev !== this.sentLobbyRev;
    this.sentLobbyRev = this.league.d.rev;
    for (const { ws, humanId } of this.joined()) {
      if (lobbyChanged) this.send(ws, { t: "lobby", lobby: this.league.view(now, humanId) });
      this.sendView(ws, humanId);
    }
  }

  private sendView(ws: WebSocket, humanId: string): void {
    const p = this.league.player(humanId);
    const teamId = p?.teamId ?? null;
    const key = `${this.careerRev}:${teamId ?? ""}`;
    if (this.viewKey.get(ws) === key) return;
    let view: unknown = null;
    if (teamId && this.career !== null) {
      try {
        view = getEngine(this.env).view(this.career, teamId);
      } catch (e) {
        this.viewKey.set(ws, key);
        this.err(ws, e instanceof NoEngineError ? "no_engine" : "view_failed", errText(e));
        return;
      }
    }
    this.viewKey.set(ws, key);
    const json = JSON.stringify(view ?? null);
    const fp = `${teamId ?? ""}|${json}`;
    if (this.viewJson.get(ws) === fp) return;
    this.viewJson.set(ws, fp);
    try {
      ws.send(`{"t":"view","rev":${this.league.d.rev},"careerRev":${this.careerRev},"teamId":${JSON.stringify(teamId)},"view":${json}}`);
    } catch {
      /* socket already gone */
    }
  }

  private scheduleAlarm(now: number): void {
    const ts: number[] = [];
    const w = this.league.nextWake();
    if (w !== null) ts.push(w);
    if (this.relay?.running) {
      ts.push(now + HZ_INTERVAL_MS);
      if (this.relay.firstFinishAt !== null) ts.push(this.relay.firstFinishAt + FINISH_GRACE_MS);
    }
    if (!ts.length) {
      if (this.alarmAt !== null) {
        this.alarmAt = null;
        void this.ctx.storage.deleteAlarm();
      }
      return;
    }
    const at = Math.max(Math.min(...ts), now + 1);
    if (this.alarmAt !== null && Math.abs(this.alarmAt - at) < 50) return;
    this.alarmAt = at;
    void this.ctx.storage.setAlarm(at);
  }
}

function buildSettings(s: CreateSettings, seed: number): LeagueSettings {
  return { timer: s.timer ?? null, speedMode: s.speedMode ?? "majority", teamIds: [...s.teamIds], seed, extra: s.extra ?? null };
}

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

function errText(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 200);
}
