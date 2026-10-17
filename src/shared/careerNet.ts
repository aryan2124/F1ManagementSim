/**
 * Shared multiplayer CAREER MODE networking: protocol, the pure league state machine,
 * the lockstep session relay, a client lockstep driver and the chunked-storage helpers.
 *
 * Everything here is pure (time is injected, storage is an interface) so it runs unchanged in the
 * Durable Object, in the browser and in vitest. No Worker APIs except the standard
 * CompressionStream / DecompressionStream, which are optional (we fall back to raw bytes).
 *
 * SECURITY / LEAK NOTES
 *  - The client only ever receives `engine.view(state, teamId)`, never the full CareerState. If the
 *    owner's view() copies hidden data (true car pace, rivals' R&D, AI budgets, the RNG seed) the
 *    information leaks to every player. view() is the owner's job and is the single leak point.
 *  - `humanId` is the player's SECRET (it is what lets a rejoin reclaim a team). It is never sent to
 *    other players; everyone else sees only the public `pid`.
 *  - The lockstep sessions run on every client, so the plan returned by `sessionPlan()` (grid, car
 *    pace, weather, seed) is visible to all players in the session by construction. It must contain
 *    only what the session sim needs. This is inherent to lockstep.
 */

// ---------------------------------------------------------------------------------------------
// Engine interface (implemented later by the project owner in src/career/multi.ts)
// ---------------------------------------------------------------------------------------------

export interface CareerEngine<S> {
  /** New league state. `settings` is the full LeagueSettings object (settings.extra is game specific). */
  create(opts: { seed: number; teamId: string; settings: unknown }): S;
  /** Mark a team human (humanId is the public pid) or AI (null). Must be idempotent. */
  assign(state: S, teamId: string, humanId: string | null): S;
  reduceAs(state: S, teamId: string, action: unknown): { state: S; ok: boolean; message: string };
  /** Advance the world one day for all humans. */
  stepDay(state: S): { state: S; stop: string | null; weekend: boolean; log: string[] };
  /** What a player may see (hides rivals' secrets). */
  view(state: S, teamId: string): unknown;
  /** Deterministic session config for lockstep. kind is "qualifying" or "race". */
  sessionPlan(state: S, kind: string): unknown;
  /** results === null means the session was aborted and the engine should simulate it headless. */
  applySession(state: S, kind: string, results: unknown): S;
}

/** Optional hardening hooks. None is required for the room to work. */
export interface CareerEngineExtras {
  /** Return false to reject a lockstep command (for example a pit call for another team's car). */
  authorizeCommand?(plan: unknown, teamId: string, cmd: unknown): boolean;
  /** `action.type` values that clients may never send through `act` (the room always blocks "continue" and "day"). */
  blockedActionTypes?: string[];
}

// ---------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------

export const PROTOCOL = 1;
export const MAX_HUMANS = 11;
export const MAX_PLAYERS = 40; // humans plus spectators and reserved seats
/** Must equal TPS in src/sim/engine.ts (the sim runs 10 ticks per simulated second). */
export const SIM_TPS = 10;
/** Session speeds. 0 is pause. */
export const SPEEDS = [0, 1, 2, 4, 8, 16, 32] as const;
/** The clock speed a session runs at once the league has voted to skip the rest of it. Not a speed anyone can pick. */
export const SKIP_SPEED = 256;

/**
 * Settles the "skip the rest of the session" ballot. It is decided as soon as one side has more than half of the people who can
 * vote, or when all of them have voted. A tie is settled by `rand` (a number from 0 up to 1). Returns null while it is still open.
 */
export function skipVerdict(ballots: Record<string, string>, voters: string[], rand: () => number): "skip" | "watch" | null {
  if (!voters.length) return null;
  let skip = 0;
  let watch = 0;
  for (const t of voters) {
    if (ballots[t] === "skip") skip++;
    else if (ballots[t] === "watch") watch++;
  }
  const decided = skip * 2 > voters.length || watch * 2 > voters.length || skip + watch >= voters.length;
  if (!decided) return null;
  return skip > watch ? "skip" : watch > skip ? "watch" : rand() < 0.5 ? "skip" : "watch";
}
export const MAX_MSG_CHARS = 32768;
export const MAX_CMD_CHARS = 1024;
export const MAX_DAYS_PER_ADVANCE = 60;
export const MAX_IDLE_STEPS = 3;
export const RESERVE_MS = 10 * 60_000;
export const HZ_INTERVAL_MS = 250;
export const MARGIN_MS = 750;
export const HASH_EVERY_TICKS = 50;
export const FINISH_GRACE_MS = 20_000;
export const CHUNK_BYTES = 100 * 1024;
export const MAX_CHUNKS = 120;

// ---------------------------------------------------------------------------------------------
// Protocol
// ---------------------------------------------------------------------------------------------

export type Phase = "setup" | "world" | "weekend" | "sessionLobby" | "session";
export type AwayKind = "manual" | "timer";
export type SpeedMode = "majority" | "host";

export interface LeagueSettings {
  /** Seconds per stop, or null for no timer (a slow player then holds everyone up; use away). */
  timer: number | null;
  speedMode: SpeedMode;
  /** Every team id in the league. Humans take one each; AI runs the rest. Fixed after create. */
  teamIds: string[];
  seed: number;
  /** Opaque game settings handed to engine.create inside settings.extra. */
  extra: unknown;
}

export interface CreateSettings {
  timer?: number | null;
  speedMode?: SpeedMode;
  teamIds: string[];
  seed?: number;
  extra?: unknown;
}

export type ClientMsg =
  | { t: "join"; v: number; humanId: string; name: string; teamId?: string }
  | { t: "create"; teamId: string; settings: CreateSettings }
  | { t: "settings"; timer?: number | null; speedMode?: SpeedMode }
  | { t: "claim"; teamId: string }
  | { t: "leave" }
  | { t: "ready"; ready: boolean }
  | { t: "away"; away: boolean; target?: string }
  | { t: "act"; id: number; action: unknown }
  | { t: "vote"; topic: string; option: string }
  | { t: "clearVotes"; topic?: string }
  | { t: "cmd"; cmd: unknown }
  | { t: "speed"; speed: number }
  | { t: "hash"; tick: number; h: string }
  | { t: "finish"; results: unknown }
  | { t: "resync" }
  | { t: "abortSession" }
  | { t: "ping"; c: number };

export interface PlayerView {
  pid: string;
  name: string;
  teamId: string | null;
  connected: boolean;
  ready: boolean;
  away: AwayKind | null;
  host: boolean;
}

export interface LobbyView {
  code: string;
  rev: number;
  phase: Phase;
  created: boolean;
  settings: { timer: number | null; speedMode: SpeedMode; teamIds: string[] };
  players: PlayerView[];
  freeTeams: string[];
  stop: string | null;
  steps: number;
  /** Server clock (epoch ms) when the current countdown ends, or null. */
  deadline: number | null;
  idlePaused: boolean;
  session: { kind: string; state: "lobby" | "running" } | null;
  votes: Record<string, Record<string, string>>;
  log: string[];
  serverNow: number;
  you: { pid: string; teamId: string | null; host: boolean } | null;
}

export interface SpeedSeg {
  atMs: number;
  tick: number;
  speed: number;
}

export interface StampedCommand {
  seq: number;
  tick: number;
  team: string;
  cmd: unknown;
}

export interface SessionInfo {
  id: string;
  kind: string;
  plan: unknown;
  teams: string[];
  state: "lobby" | "running";
  startMs: number | null;
  segs: SpeedSeg[];
  log: StampedCommand[];
  hashEvery: number;
  hz: number;
}

export type ServerMsg =
  | { t: "welcome"; v: number; you: { pid: string; teamId: string | null; host: boolean }; serverNow: number }
  | { t: "lobby"; lobby: LobbyView }
  | { t: "view"; rev: number; careerRev: number; teamId: string | null; view: unknown }
  | { t: "result"; id: number; ok: boolean; message: string }
  | { t: "error"; code: string; message: string }
  | { t: "log"; lines: string[] }
  | { t: "session"; info: SessionInfo }
  | { t: "cmd"; c: StampedCommand; hz: number }
  | { t: "hz"; tick: number }
  | { t: "speedSeg"; seg: SpeedSeg; hz: number }
  | { t: "desync"; tick: number; reason: string }
  | { t: "sessionEnd"; kind: string; applied: boolean }
  | { t: "pong"; c: number; serverNow: number };

// ---------------------------------------------------------------------------------------------
// Validation (never trust the client)
// ---------------------------------------------------------------------------------------------

const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const TEAM_RE = /^[A-Za-z0-9_-]{1,32}$/;
const TOKEN_RE = /^[A-Za-z0-9_.:-]{1,48}$/;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export type Parsed = { ok: true; msg: ClientMsg } | { ok: false; error: string };

export function cleanName(name: unknown): string {
  if (typeof name !== "string") return "Manager";
  // eslint-disable-next-line no-control-regex
  const n = name.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 18);
  return n || "Manager";
}

/** Reject prototype-pollution keys and absurd nesting in opaque payloads. */
export function safeJson(v: unknown, depth = 0): boolean {
  if (depth > 12) return false;
  if (v === null || typeof v !== "object") return typeof v !== "function" && typeof v !== "symbol" && typeof v !== "bigint";
  if (Array.isArray(v)) return v.every((x) => safeJson(x, depth + 1));
  for (const [k, x] of Object.entries(v)) {
    if (FORBIDDEN_KEYS.has(k)) return false;
    if (!safeJson(x, depth + 1)) return false;
  }
  return true;
}

function isInt(n: unknown, lo: number, hi: number): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi;
}

function parseTimer(v: unknown): number | null | undefined | "bad" {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return isInt(v, 5, 3600) ? v : "bad";
}

export function parseClientMsg(raw: string): Parsed {
  if (typeof raw !== "string" || raw.length > MAX_MSG_CHARS) return { ok: false, error: "message too large" };
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    return { ok: false, error: "bad json" };
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) return { ok: false, error: "bad message" };
  const m = o as Record<string, unknown>;
  const bad = (e: string): Parsed => ({ ok: false, error: e });
  switch (m.t) {
    case "join": {
      if (typeof m.humanId !== "string" || !ID_RE.test(m.humanId)) return bad("humanId must be 16-64 chars of A-Z a-z 0-9 _ -");
      if (m.v !== PROTOCOL) return bad(`protocol mismatch, expected ${PROTOCOL}`);
      if (m.teamId !== undefined && (typeof m.teamId !== "string" || !TEAM_RE.test(m.teamId))) return bad("bad teamId");
      return { ok: true, msg: { t: "join", v: PROTOCOL, humanId: m.humanId, name: cleanName(m.name), teamId: m.teamId as string | undefined } };
    }
    case "create": {
      const s = m.settings as Record<string, unknown> | undefined;
      if (typeof m.teamId !== "string" || !TEAM_RE.test(m.teamId)) return bad("bad teamId");
      if (!s || typeof s !== "object" || Array.isArray(s)) return bad("bad settings");
      const ids = s.teamIds;
      if (!Array.isArray(ids) || ids.length < 2 || ids.length > 32 || !ids.every((x) => typeof x === "string" && TEAM_RE.test(x)) || new Set(ids).size !== ids.length) {
        return bad("settings.teamIds must be 2-32 unique team ids");
      }
      const timer = parseTimer(s.timer);
      if (timer === "bad") return bad("timer must be null or 5-3600 seconds");
      if (s.speedMode !== undefined && s.speedMode !== "majority" && s.speedMode !== "host") return bad("bad speedMode");
      if (s.seed !== undefined && !isInt(s.seed, 0, 0xffffffff)) return bad("bad seed");
      if (s.extra !== undefined && (!safeJson(s.extra) || JSON.stringify(s.extra).length > 8192)) return bad("settings.extra rejected");
      return {
        ok: true,
        msg: { t: "create", teamId: m.teamId, settings: { timer, speedMode: s.speedMode as SpeedMode | undefined, teamIds: ids as string[], seed: s.seed as number | undefined, extra: s.extra } },
      };
    }
    case "settings": {
      const timer = parseTimer(m.timer);
      if (timer === "bad") return bad("timer must be null or 5-3600 seconds");
      if (m.speedMode !== undefined && m.speedMode !== "majority" && m.speedMode !== "host") return bad("bad speedMode");
      return { ok: true, msg: { t: "settings", timer, speedMode: m.speedMode as SpeedMode | undefined } };
    }
    case "claim":
      if (typeof m.teamId !== "string" || !TEAM_RE.test(m.teamId)) return bad("bad teamId");
      return { ok: true, msg: { t: "claim", teamId: m.teamId } };
    case "leave":
    case "resync":
    case "abortSession":
      return { ok: true, msg: { t: m.t } };
    case "ready":
      if (typeof m.ready !== "boolean") return bad("ready must be boolean");
      return { ok: true, msg: { t: "ready", ready: m.ready } };
    case "away":
      if (typeof m.away !== "boolean") return bad("away must be boolean");
      if (m.target !== undefined && (typeof m.target !== "string" || !/^p\d{1,6}$/.test(m.target))) return bad("bad target");
      return { ok: true, msg: { t: "away", away: m.away, target: m.target as string | undefined } };
    case "act": {
      if (!isInt(m.id, 0, 0x7fffffff)) return bad("bad id");
      const a = m.action;
      if (!a || typeof a !== "object" || Array.isArray(a) || !safeJson(a)) return bad("bad action");
      if (typeof (a as { type?: unknown }).type !== "string") return bad("action.type must be a string");
      return { ok: true, msg: { t: "act", id: m.id, action: a } };
    }
    case "vote":
      if (typeof m.topic !== "string" || !TOKEN_RE.test(m.topic) || typeof m.option !== "string" || !TOKEN_RE.test(m.option)) return bad("bad vote");
      return { ok: true, msg: { t: "vote", topic: m.topic, option: m.option } };
    case "clearVotes":
      if (m.topic !== undefined && (typeof m.topic !== "string" || !TOKEN_RE.test(m.topic))) return bad("bad topic");
      return { ok: true, msg: { t: "clearVotes", topic: m.topic as string | undefined } };
    case "cmd": {
      const c = m.cmd;
      if (!c || typeof c !== "object" || Array.isArray(c) || !safeJson(c)) return bad("bad cmd");
      if (JSON.stringify(c).length > MAX_CMD_CHARS) return bad("cmd too large");
      return { ok: true, msg: { t: "cmd", cmd: c } };
    }
    case "speed":
      if (typeof m.speed !== "number" || !(SPEEDS as readonly number[]).includes(m.speed)) return bad("bad speed");
      return { ok: true, msg: { t: "speed", speed: m.speed } };
    case "hash":
      if (!isInt(m.tick, 0, 10_000_000) || typeof m.h !== "string" || m.h.length > 64) return bad("bad hash");
      return { ok: true, msg: { t: "hash", tick: m.tick, h: m.h } };
    case "finish":
      if (m.results === undefined || !safeJson(m.results)) return bad("bad results");
      return { ok: true, msg: { t: "finish", results: m.results } };
    case "ping":
      if (!isInt(m.c, 0, 0x7fffffff)) return bad("bad ping");
      return { ok: true, msg: { t: "ping", c: m.c } };
    default:
      return bad("unknown message type");
  }
}

/** Token bucket. `rate` tokens per second, up to `burst`. */
export class RateLimiter {
  private tokens: number;
  private last: number;
  constructor(
    private rate = 20,
    private burst = 40,
    now = 0,
  ) {
    this.tokens = burst;
    this.last = now;
  }
  allow(now: number): boolean {
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.rate);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/** Canonical JSON (sorted keys) so two clients' results compare equal regardless of key order. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const keys = Object.keys(v as object).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
}

// ---------------------------------------------------------------------------------------------
// CareerLeague: the pure state machine
// ---------------------------------------------------------------------------------------------

export interface PlayerRec {
  id: string; // humanId, secret
  pid: string; // public id
  name: string;
  teamId: string | null;
  order: number;
  connected: boolean;
  ready: boolean;
  away: AwayKind | null;
  /** When a disconnected player's seat is given back to the AI. */
  releaseAt: number | null;
}

export interface LeagueData {
  v: 1;
  code: string;
  created: boolean;
  settings: LeagueSettings;
  phase: Phase;
  hostId: string | null;
  players: Record<string, PlayerRec>;
  order: number;
  /** humanId to last team, so a returning player gets the same seat if it is still free. */
  memory: Record<string, string>;
  stop: string | null;
  steps: number;
  deadline: number | null;
  idleSteps: number;
  idlePaused: boolean;
  session: { kind: string } | null;
  votes: Record<string, Record<string, string>>;
  log: string[];
  rev: number;
}

export interface LeagueOpts {
  reserveMs?: number;
  maxIdleSteps?: number;
  maxHumans?: number;
}

export type GateAction = { do: "stepWorld" } | { do: "openSession"; kind: string } | { do: "startSession" };

export interface Assignment {
  teamId: string;
  pid: string | null;
}

type Result = { ok: true } | { ok: false; error: string };
const OK: Result = { ok: true };
const fail = (error: string): Result => ({ ok: false, error });

export function freshLeague(code: string): LeagueData {
  return {
    v: 1,
    code,
    created: false,
    settings: { timer: null, speedMode: "majority", teamIds: [], seed: 0, extra: null },
    phase: "setup",
    hostId: null,
    players: {},
    order: 0,
    memory: {},
    stop: null,
    steps: 0,
    deadline: null,
    idleSteps: 0,
    idlePaused: false,
    session: null,
    votes: {},
    log: [],
    rev: 0,
  };
}

export class CareerLeague {
  readonly d: LeagueData;
  private assignments: Assignment[] = [];
  private readonly reserveMs: number;
  private readonly maxIdle: number;
  private readonly maxHumans: number;

  constructor(data: LeagueData, opts: LeagueOpts = {}) {
    this.d = data;
    this.reserveMs = opts.reserveMs ?? RESERVE_MS;
    this.maxIdle = opts.maxIdleSteps ?? MAX_IDLE_STEPS;
    this.maxHumans = opts.maxHumans ?? MAX_HUMANS;
  }

  static create(code: string, opts?: LeagueOpts): CareerLeague {
    return new CareerLeague(freshLeague(code), opts);
  }

  static restore(json: LeagueData, opts?: LeagueOpts): CareerLeague {
    return new CareerLeague(structuredClone(json), opts);
  }

  toJSON(): LeagueData {
    return this.d;
  }

  // ---- queries ----

  player(humanId: string): PlayerRec | undefined {
    return this.d.players[humanId];
  }

  byPid(pid: string): PlayerRec | undefined {
    return Object.values(this.d.players).find((p) => p.pid === pid);
  }

  /** Players that own a team (connected or reserved). */
  humans(): PlayerRec[] {
    return Object.values(this.d.players).filter((p) => p.teamId !== null);
  }

  /** Connected players that own a team: the ones the day waits for. */
  activeHumans(): PlayerRec[] {
    return this.humans().filter((p) => p.connected);
  }

  freeTeams(): string[] {
    const used = new Set(this.humans().map((p) => p.teamId));
    return this.d.settings.teamIds.filter((t) => !used.has(t));
  }

  isHost(humanId: string): boolean {
    return this.d.hostId === humanId;
  }

  gateActive(): boolean {
    return this.d.created && (this.d.phase === "world" || this.d.phase === "weekend" || this.d.phase === "sessionLobby");
  }

  /** Take (and clear) the engine.assign calls the room must now perform. */
  drainAssignments(): Assignment[] {
    const a = this.assignments;
    this.assignments = [];
    return a;
  }

  private bump() {
    this.d.rev++;
  }

  private log(line: string) {
    this.d.log.push(line.slice(0, 160));
    if (this.d.log.length > 40) this.d.log.splice(0, this.d.log.length - 40);
  }

  // ---- membership ----

  private release(p: PlayerRec) {
    if (p.teamId !== null) {
      this.d.memory[p.id] = p.teamId;
      this.assignments.push({ teamId: p.teamId, pid: null });
      p.teamId = null;
    }
    const keys = Object.keys(this.d.memory);
    if (keys.length > 64) delete this.d.memory[keys[0]];
  }

  private tryAssign(p: PlayerRec, prefer: Array<string | undefined>): boolean {
    if (!this.d.created || p.teamId !== null) return false;
    if (this.humans().length >= this.maxHumans) return false;
    const free = this.freeTeams();
    const pick = prefer.find((t): t is string => !!t && free.includes(t)) ?? free[0];
    if (!pick) return false;
    p.teamId = pick;
    this.d.memory[p.id] = pick;
    this.assignments.push({ teamId: pick, pid: p.pid });
    return true;
  }

  private transferHost(leaving: string | null, hard: boolean) {
    const d = this.d;
    if (d.hostId !== leaving) return;
    const others = Object.values(d.players)
      .filter((p) => p.id !== leaving)
      .sort((a, b) => a.order - b.order);
    const next = others.find((p) => p.connected) ?? (hard ? others[0] : undefined);
    if (next) {
      d.hostId = next.id;
      this.log(`${next.name} is now the host.`);
    } else if (hard) {
      d.hostId = null;
    }
  }

  join(humanId: string, name: string, wantTeam?: string): { ok: true; player: PlayerRec; isNew: boolean } | { ok: false; error: string } {
    const d = this.d;
    let p = d.players[humanId];
    let isNew = false;
    if (!p) {
      if (Object.keys(d.players).length >= MAX_PLAYERS) return { ok: false, error: "room is full" };
      isNew = true;
      d.order++;
      p = { id: humanId, pid: `p${d.order}`, name: cleanName(name), teamId: null, order: d.order, connected: true, ready: false, away: null, releaseAt: null };
      d.players[humanId] = p;
      if (!d.hostId) d.hostId = humanId;
      this.log(`${p.name} joined.`);
    } else {
      if (!p.connected) this.log(`${p.name} reconnected.`);
      p.name = cleanName(name);
      p.connected = true;
      p.releaseAt = null;
      p.away = null;
    }
    this.tryAssign(p, [wantTeam, d.memory[humanId]]);
    this.bump();
    return { ok: true, player: p, isNew };
  }

  /** The player's last socket closed. Their seat is held for reserveMs, then goes back to the AI. */
  disconnect(humanId: string, now: number) {
    const p = this.d.players[humanId];
    if (!p || !p.connected) return;
    p.connected = false;
    p.ready = false;
    p.away = null;
    if (p.teamId === null) {
      delete this.d.players[humanId];
      this.transferHost(humanId, true);
    } else {
      p.releaseAt = now + this.reserveMs;
      this.transferHost(humanId, false);
    }
    this.bump();
  }

  /** Explicit leave: the seat goes back to the AI at once. */
  leave(humanId: string) {
    const p = this.d.players[humanId];
    if (!p) return;
    this.release(p);
    delete this.d.players[humanId];
    this.log(`${p.name} left. The AI takes the team.`);
    this.transferHost(humanId, true);
    this.bump();
  }

  claim(humanId: string, teamId: string): Result {
    const p = this.d.players[humanId];
    if (!p) return fail("not joined");
    if (!this.d.created) return fail("league not created yet");
    if (p.teamId !== null) return fail("you already have a team, leave it first");
    if (!this.d.settings.teamIds.includes(teamId)) return fail("unknown team");
    if (!this.freeTeams().includes(teamId)) return fail("team is taken");
    if (this.humans().length >= this.maxHumans) return fail("the league has the maximum number of human players");
    this.tryAssign(p, [teamId]);
    this.log(`${p.name} takes over ${teamId}.`);
    this.bump();
    return OK;
  }

  /** After the room wakes from hibernation: align the connected flags with the live sockets. */
  reconcile(connectedIds: Set<string>, now: number) {
    for (const p of Object.values(this.d.players)) {
      if (p.connected && !connectedIds.has(p.id)) this.disconnect(p.id, now);
      else if (!p.connected && connectedIds.has(p.id)) {
        p.connected = true;
        p.releaseAt = null;
        this.bump();
      }
    }
  }

  // ---- setup ----

  validateCreate(actorId: string, teamId: string, s: CreateSettings): Result {
    if (this.d.created) return fail("league already created");
    if (this.d.hostId !== actorId) return fail("only the host can create the league");
    if (!s.teamIds.includes(teamId)) return fail("your team is not in teamIds");
    return OK;
  }

  commitCreate(actorId: string, teamId: string, s: CreateSettings, seed: number, now: number) {
    const d = this.d;
    d.settings = { timer: s.timer ?? null, speedMode: s.speedMode ?? "majority", teamIds: [...s.teamIds], seed, extra: s.extra ?? null };
    d.created = true;
    d.phase = "world";
    const host = d.players[actorId];
    host.teamId = teamId;
    d.memory[actorId] = teamId;
    this.assignments.push({ teamId, pid: host.pid });
    for (const p of Object.values(d.players).sort((a, b) => a.order - b.order)) {
      if (p.id !== actorId) this.tryAssign(p, [d.memory[p.id]]);
    }
    this.log(`${host.name} created the league.`);
    this.startGate(now);
  }

  setSettings(actorId: string, patch: { timer?: number | null; speedMode?: SpeedMode }, now: number): Result {
    if (this.d.hostId !== actorId) return fail("only the host can change settings");
    if (patch.timer !== undefined) this.d.settings.timer = patch.timer;
    if (patch.speedMode !== undefined) this.d.settings.speedMode = patch.speedMode;
    if (patch.timer !== undefined && this.gateActive()) {
      this.d.deadline = this.d.settings.timer === null ? null : now + this.d.settings.timer * 1000;
      this.d.idlePaused = false;
    }
    this.bump();
    return OK;
  }

  // ---- ready / away / actions ----

  /** Any real action by a player: they are back, and the league is no longer idle. */
  touch(humanId: string, now: number) {
    const p = this.d.players[humanId];
    if (!p) return;
    let changed = false;
    if (p.away) {
      p.away = null;
      changed = true;
    }
    if (this.d.idleSteps !== 0) {
      this.d.idleSteps = 0;
      changed = true;
    }
    if (this.d.idlePaused) {
      this.d.idlePaused = false;
      if (this.gateActive() && this.d.settings.timer !== null) this.d.deadline = now + this.d.settings.timer * 1000;
      changed = true;
    }
    if (changed) this.bump();
  }

  setReady(humanId: string, ready: boolean, now: number): Result {
    const p = this.d.players[humanId];
    if (!p || p.teamId === null) return fail("only a player with a team can be ready");
    if (!this.gateActive()) return fail("nothing to wait for right now");
    this.touch(humanId, now);
    p.ready = ready;
    p.away = null;
    this.bump();
    return OK;
  }

  setAway(actorId: string, targetPid: string | undefined, away: boolean, now: number): Result {
    const actor = this.d.players[actorId];
    if (!actor) return fail("not joined");
    const target = targetPid ? this.byPid(targetPid) : actor;
    if (!target) return fail("unknown player");
    if (target.id !== actorId && this.d.hostId !== actorId) return fail("only the host can mark someone else away");
    if (target.teamId === null) return fail("that player has no team");
    if (target.id === actorId && !away) {
      this.touch(actorId, now);
      return OK;
    }
    target.away = away ? "manual" : null;
    if (away) target.ready = false;
    this.log(away ? `${target.name} is away (the AI assistant is in charge).` : `${target.name} is back.`);
    this.bump();
    return OK;
  }

  // ---- votes ----

  castVote(humanId: string, topic: string, option: string, now: number): Result {
    const p = this.d.players[humanId];
    if (!p || p.teamId === null) return fail("only a player with a team can vote");
    const v = this.d.votes;
    if (!v[topic] && Object.keys(v).length >= 32) return fail("too many open votes");
    this.touch(humanId, now);
    (v[topic] ??= {})[p.teamId] = option;
    this.bump();
    return OK;
  }

  clearVotes(actorId: string, topic?: string): Result {
    if (this.d.hostId !== actorId) return fail("only the host can clear votes");
    if (topic) delete this.d.votes[topic];
    else this.d.votes = {};
    this.bump();
    return OK;
  }

  /** Record the outcome of a vote under its own topic so every client can read it, and close the ballot. */
  settleVote(topic: string, result: string): void {
    delete this.d.votes[topic];
    this.d.votes[`${topic}Result`] = { result };
    this.bump();
  }

  /** Forget a topic and its result, ready for a new session. */
  resetVote(topic: string): void {
    delete this.d.votes[topic];
    delete this.d.votes[`${topic}Result`];
  }

  tally(topic: string): Record<string, number> {
    const out: Record<string, number> = {};
    for (const o of Object.values(this.d.votes[topic] ?? {})) out[o] = (out[o] ?? 0) + 1;
    return out;
  }

  // ---- time ----

  /** Start a fresh waiting step: nobody is ready, timer-away flags clear, the countdown restarts. */
  startGate(now: number) {
    const d = this.d;
    for (const p of Object.values(d.players)) {
      p.ready = false;
      if (p.away === "timer") p.away = null;
    }
    d.deadline = d.settings.timer === null || d.idlePaused ? null : now + d.settings.timer * 1000;
    this.bump();
  }

  /** The next moment the league needs attention (timer expiry or a seat release), or null. */
  nextWake(): number | null {
    const ts: number[] = [];
    if (this.gateActive() && this.d.deadline !== null) ts.push(this.d.deadline);
    for (const p of Object.values(this.d.players)) if (p.releaseAt !== null) ts.push(p.releaseAt);
    return ts.length ? Math.min(...ts) : null;
  }

  /** Time-driven changes only: seats whose reservation expired go back to the AI. */
  tick(now: number) {
    for (const p of Object.values(this.d.players)) {
      if (!p.connected && p.releaseAt !== null && now >= p.releaseAt) {
        this.release(p);
        delete this.d.players[p.id];
        this.log(`${p.name} did not return. The AI takes the team.`);
        this.transferHost(p.id, true);
        this.bump();
      }
    }
  }

  /**
   * What should happen now? Returns an action when the day (or weekend step) may advance:
   *  - every connected human is ready or away, and at least one is actually ready; or
   *  - the countdown expired (unready humans become "timer" away for this step only).
   * With no timer a slow player holds everyone up, which is the point of "away".
   */
  poll(now: number): GateAction | null {
    const d = this.d;
    if (!this.gateActive() || d.idlePaused) return null;
    const humans = this.activeHumans();
    if (humans.length === 0) return null;
    const open = humans.every((p) => p.ready || p.away) && humans.some((p) => p.ready);
    if (!open) {
      if (d.deadline === null || now < d.deadline) return null;
      const anyReady = humans.some((p) => p.ready);
      if (!anyReady) {
        if (d.idleSteps >= this.maxIdle) {
          d.idlePaused = true;
          d.deadline = null;
          this.log("Nobody is playing. The clock is paused until someone acts.");
          this.bump();
          return null;
        }
        d.idleSteps++;
      }
      for (const p of humans) if (!p.ready && !p.away) p.away = "timer";
      this.bump();
    }
    if (d.phase === "world") return { do: "stepWorld" };
    if (d.phase === "weekend") return { do: "openSession", kind: "qualifying" };
    return { do: "startSession" };
  }

  afterStep(res: { stop: string | null; weekend: boolean; days: number; log: string[] }, now: number) {
    const d = this.d;
    d.stop = res.stop;
    d.steps += res.days;
    d.phase = res.weekend ? "weekend" : "world";
    for (const l of res.log.slice(-8)) this.log(l);
    this.startGate(now);
  }

  /** The engine threw. Keep the previous state and wait again. */
  stepFailed(message: string, now: number) {
    this.log(`The world could not advance: ${message}`.slice(0, 160));
    this.startGate(now);
  }

  openSession(kind: string, now: number) {
    this.d.phase = "sessionLobby";
    this.d.session = { kind };
    this.startGate(now);
  }

  beginSession() {
    const d = this.d;
    d.phase = "session";
    d.deadline = null;
    for (const p of Object.values(d.players)) {
      p.ready = false;
      if (p.away === "timer") p.away = null;
    }
    this.bump();
  }

  /** The weekend cannot continue (a session could not be planned). Back to normal days. */
  abortWeekend(now: number) {
    this.d.session = null;
    this.d.phase = "world";
    this.d.stop = null;
    this.startGate(now);
  }

  /** Session results are in. Returns the next session kind (race after qualifying) or null. */
  finishSession(now: number): string | null {
    const d = this.d;
    const kind = d.session?.kind;
    d.session = null;
    if (kind === "qualifying") {
      d.phase = "session"; // the room opens the race lobby right away
      this.bump();
      return "race";
    }
    d.phase = "world";
    d.stop = null;
    this.startGate(now);
    return null;
  }

  // ---- view ----

  view(now: number, forId: string | null): LobbyView {
    const d = this.d;
    const me = forId ? d.players[forId] : undefined;
    return {
      code: d.code,
      rev: d.rev,
      phase: d.phase,
      created: d.created,
      settings: { timer: d.settings.timer, speedMode: d.settings.speedMode, teamIds: d.settings.teamIds },
      players: Object.values(d.players)
        .sort((a, b) => a.order - b.order)
        .map((p) => ({ pid: p.pid, name: p.name, teamId: p.teamId, connected: p.connected, ready: p.ready, away: p.away, host: d.hostId === p.id })),
      freeTeams: this.freeTeams(),
      stop: d.stop,
      steps: d.steps,
      deadline: this.gateActive() ? d.deadline : null,
      idlePaused: d.idlePaused,
      session: d.session ? { kind: d.session.kind, state: d.phase === "session" ? "running" : "lobby" } : null,
      votes: d.votes,
      log: d.log.slice(-12),
      serverNow: now,
      you: me ? { pid: me.pid, teamId: me.teamId, host: d.hostId === me.id } : null,
    };
  }
}

// ---------------------------------------------------------------------------------------------
// SessionRelay: server side of lockstep
// ---------------------------------------------------------------------------------------------

export interface RelayData {
  id: string;
  kind: string;
  plan: unknown;
  teams: string[];
  state: "lobby" | "running";
  startMs: number | null;
  segs: SpeedSeg[];
  seq: number;
  horizon: number;
  log: StampedCommand[];
  speedVotes: Record<string, number>;
  hashEvery: number;
  splits: number;
}

export interface RelayOpts {
  marginMs?: number;
  maxLog?: number;
}

/** Ticks released by the speed schedule at server time `nowMs`. Used by both server and clients. */
export function releasedTick(segs: SpeedSeg[], nowMs: number): number {
  if (!segs.length) return 0;
  let s = segs[0];
  for (const x of segs) {
    if (x.atMs <= nowMs) s = x;
    else break;
  }
  const dt = Math.max(0, nowMs - s.atMs);
  return s.tick + Math.floor((dt / 1000) * SIM_TPS * s.speed);
}

/**
 * LOCKSTEP. The sim is deterministic, so every client runs the identical session locally. The server
 * never simulates. It only
 *   1. orders commands: each gets a global `seq` and a `tick` at or after the current HORIZON,
 *   2. publishes the horizon: "no command will ever be stamped before tick H". A client may step its sim
 *      while sim.tick < H, so it can never have passed a tick for which a command is still in flight,
 *   3. paces the session with a speed schedule (segments), chosen by majority vote or by the host,
 *   4. compares state hashes from clients to flag desyncs, and compares the final results.
 * Horizon invariant: every stamped tick >= every horizon ever published (the horizon is monotonic).
 */
export class SessionRelay {
  readonly d: RelayData;
  private readonly marginMs: number;
  private readonly maxLog: number;
  private hashes = new Map<number, { at: number; by: Map<string, string> }>();
  private finals = new Map<string, string>();
  private finalValues = new Map<string, unknown>();
  firstFinishAt: number | null = null;

  constructor(d: RelayData, opts: RelayOpts = {}) {
    this.d = d;
    this.marginMs = opts.marginMs ?? MARGIN_MS;
    this.maxLog = opts.maxLog ?? 4000;
  }

  static create(id: string, kind: string, plan: unknown, teams: string[], opts?: RelayOpts & { hashEvery?: number }): SessionRelay {
    return new SessionRelay(
      { id, kind, plan, teams: [...teams], state: "lobby", startMs: null, segs: [], seq: 0, horizon: 0, log: [], speedVotes: {}, hashEvery: opts?.hashEvery ?? HASH_EVERY_TICKS, splits: 0 },
      opts,
    );
  }

  get running(): boolean {
    return this.d.state === "running";
  }

  speed(): number {
    const s = this.d.segs;
    return s.length ? s[s.length - 1].speed : 1;
  }

  start(now: number) {
    const d = this.d;
    d.state = "running";
    d.startMs = now;
    d.segs = [{ atMs: now, tick: 0, speed: 1 }];
    d.horizon = 0;
    this.beat(now);
  }

  released(now: number): number {
    return releasedTick(this.d.segs, now);
  }

  private marginTicks(): number {
    return Math.max(2, Math.ceil((this.marginMs / 1000) * SIM_TPS * Math.max(1, this.speed())));
  }

  /** Publish a (monotonic) horizon. Call on every heartbeat. */
  beat(now: number): number {
    const h = this.released(now) + this.marginTicks();
    if (h > this.d.horizon) this.d.horizon = h;
    return this.d.horizon;
  }

  /** Order a command from a participant team. Returns null if it cannot be accepted. */
  submit(team: string, cmd: unknown, now: number): { c: StampedCommand; hz: number } | null {
    const d = this.d;
    if (!this.running || !d.teams.includes(team) || d.log.length >= this.maxLog) return null;
    const hz = this.beat(now);
    const c: StampedCommand = { seq: ++d.seq, tick: hz, team, cmd };
    d.log.push(c);
    return { c, hz };
  }

  /**
   * One speed vote per participant team. mode "host": the host's vote is the speed. mode "majority":
   * a speed needs strictly more than half of the connected voters, otherwise the speed stays.
   * Returns the new segment if the speed changed.
   */
  voteSpeed(team: string, speed: number, mode: SpeedMode, hostTeam: string | null, voters: string[], now: number): { seg: SpeedSeg; hz: number } | null {
    const d = this.d;
    if (!this.running || !d.teams.includes(team) || !(SPEEDS as readonly number[]).includes(speed)) return null;
    d.speedVotes[team] = speed;
    let next = this.speed();
    if (mode === "host") {
      if (team === hostTeam) next = speed;
    } else {
      const counts = new Map<number, number>();
      for (const t of voters) {
        const v = d.speedVotes[t] ?? this.speed();
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      for (const [v, n] of counts) if (n * 2 > voters.length) next = v;
    }
    if (next === this.speed()) return null;
    const seg: SpeedSeg = { atMs: now, tick: this.released(now), speed: next };
    d.segs.push(seg);
    if (d.segs.length > 200) d.segs.splice(1, d.segs.length - 200);
    return { seg, hz: this.beat(now) };
  }

  /** The league voted to skip the rest of the session: run the clock flat out from now. */
  forceSpeed(speed: number, now: number): { seg: SpeedSeg; hz: number } | null {
    const d = this.d;
    if (!this.running || speed === this.speed()) return null;
    const seg: SpeedSeg = { atMs: now, tick: this.released(now), speed };
    d.segs.push(seg);
    if (d.segs.length > 200) d.segs.splice(1, d.segs.length - 200);
    d.speedVotes = {};
    return { seg, hz: this.beat(now) };
  }

  /**
   * Record a client state hash. When every expected reporter has reported this tick, returns the
   * reporters whose hash is not the strict majority (all of them on a tie). Otherwise returns [].
   */
  reportHash(by: string, tick: number, hash: string, expected: number, now: number): string[] {
    if (!this.running) return [];
    let rec = this.hashes.get(tick);
    if (!rec) {
      rec = { at: now, by: new Map() };
      this.hashes.set(tick, rec);
      if (this.hashes.size > 40) this.hashes.delete(this.hashes.keys().next().value as number);
    }
    rec.by.set(by, hash);
    if (rec.by.size < Math.max(2, expected)) return [];
    this.hashes.delete(tick);
    return verdict(rec.by);
  }

  /** Evaluate ticks that some client never reported (lagging or gone). Returns [tick, offenders]. */
  sweepHashes(now: number, olderThanMs = 5000): Array<[number, string[]]> {
    const out: Array<[number, string[]]> = [];
    for (const [tick, rec] of this.hashes) {
      if (now - rec.at < olderThanMs) continue;
      this.hashes.delete(tick);
      if (rec.by.size >= 2) {
        const bad = verdict(rec.by);
        if (bad.length) out.push([tick, bad]);
      }
    }
    return out;
  }

  /** A client finished its local sim and reports the results. */
  reportFinal(by: string, results: unknown, now: number) {
    if (!this.running) return;
    this.finals.set(by, canonical(results));
    this.finalValues.set(by, results);
    if (this.firstFinishAt === null) this.firstFinishAt = now;
  }

  /**
   * Decide the session results. `expected` are the connected reporters. Waits until all of them have
   * reported (or `force`, after the grace period). The plurality must be a strict majority of the
   * reports, otherwise status is "split" (clients resync and report again; the room aborts after 3).
   */
  resolveFinal(expected: string[], force: boolean): { status: "wait" } | { status: "ok"; results: unknown; dissent: string[] } | { status: "split" } {
    const got = [...this.finals.keys()];
    if (got.length === 0) return { status: "wait" };
    const missing = expected.filter((e) => !this.finals.has(e));
    if (missing.length > 0 && !force) return { status: "wait" };
    const groups = new Map<string, string[]>();
    for (const [by, c] of this.finals) groups.set(c, [...(groups.get(c) ?? []), by]);
    let best: string[] = [];
    for (const v of groups.values()) if (v.length > best.length) best = v;
    if (best.length * 2 <= got.length && got.length > 1) {
      this.d.splits++;
      this.finals.clear();
      this.finalValues.clear();
      this.firstFinishAt = null;
      return { status: "split" };
    }
    return { status: "ok", results: this.finalValues.get(best[0]), dissent: got.filter((g) => !best.includes(g)) };
  }

  info(now: number): SessionInfo {
    const d = this.d;
    return { id: d.id, kind: d.kind, plan: d.plan, teams: d.teams, state: d.state, startMs: d.startMs, segs: d.segs, log: d.log, hashEvery: d.hashEvery, hz: this.running ? this.beat(now) : 0 };
  }
}

function verdict(by: Map<string, string>): string[] {
  const groups = new Map<string, string[]>();
  for (const [who, h] of by) groups.set(h, [...(groups.get(h) ?? []), who]);
  if (groups.size <= 1) return [];
  let best: string[] = [];
  for (const v of groups.values()) if (v.length > best.length) best = v;
  const strict = best.length * 2 > by.size;
  return [...by.keys()].filter((k) => !strict || !best.includes(k));
}

// ---------------------------------------------------------------------------------------------
// LockstepClient: the client half. The app owns the sim; this decides how far it may step.
// ---------------------------------------------------------------------------------------------

export interface LockstepSim {
  tick(): number;
  step(): void;
  /** Apply one stamped command (call sim.command with the right mapping). */
  apply(c: StampedCommand): void;
  hash(): string;
}

export class LockstepClient {
  /** Unapplied commands, sorted by (tick, seq). */
  private pending: StampedCommand[];
  private seen = new Set<number>();
  private horizon: number;
  private segs: SpeedSeg[];
  /** Commands that arrived after the sim had already passed their tick. Any value above 0 means a desync is likely. */
  violations = 0;

  constructor(
    readonly info: SessionInfo,
    private serverNow: () => number,
  ) {
    this.pending = [...info.log].sort(cmpCmd);
    for (const c of info.log) this.seen.add(c.seq);
    this.horizon = info.hz;
    this.segs = [...info.segs];
  }

  onCmd(c: StampedCommand, hz: number) {
    if (!this.seen.has(c.seq)) {
      this.seen.add(c.seq);
      this.pending.push(c);
      this.pending.sort(cmpCmd);
    }
    this.onHz(hz);
  }

  onHz(tick: number) {
    if (tick > this.horizon) this.horizon = tick;
  }

  onSeg(seg: SpeedSeg, hz: number) {
    if (!this.segs.some((s) => s.atMs === seg.atMs && s.speed === seg.speed)) this.segs.push(seg);
    this.onHz(hz);
  }

  get started(): boolean {
    return this.info.state === "running" && this.segs.length > 0;
  }

  /** The tick the sim should be at right now: the speed schedule, capped by the safe horizon. */
  target(): number {
    if (!this.started) return 0;
    return Math.min(this.horizon, releasedTick(this.segs, this.serverNow()));
  }

  /**
   * Step `sim` toward the target. Commands due at tick t are applied before stepping from t. Returns the
   * state hashes due (taken right after reaching a multiple of hashEvery, before that tick's commands).
   */
  run(sim: LockstepSim, maxSteps = 200): { steps: number; hashes: Array<{ tick: number; h: string }> } {
    const hashes: Array<{ tick: number; h: string }> = [];
    let steps = 0;
    const target = this.target();
    while (steps < maxSteps) {
      this.applyDue(sim);
      if (sim.tick() >= target) break;
      sim.step();
      steps++;
      if (sim.tick() % this.info.hashEvery === 0) hashes.push({ tick: sim.tick(), h: sim.hash() });
    }
    return { steps, hashes };
  }

  private applyDue(sim: LockstepSim) {
    while (this.pending.length && this.pending[0].tick <= sim.tick()) {
      const c = this.pending.shift() as StampedCommand;
      if (c.tick < sim.tick()) this.violations++;
      sim.apply(c);
    }
  }
}

function cmpCmd(a: StampedCommand, b: StampedCommand): number {
  return a.tick - b.tick || a.seq - b.seq;
}

// ---------------------------------------------------------------------------------------------
// Chunked, compressed persistence for multi-MB states
// ---------------------------------------------------------------------------------------------

export interface ChunkIO {
  getMany(keys: string[]): Promise<Map<string, unknown>>;
  putMany(entries: Record<string, unknown>): Promise<void>;
  deleteMany(keys: string[]): Promise<void>;
}

export interface Manifest {
  v: 1;
  codec: "gzip" | "none";
  n: number;
  /** Stored (compressed) bytes and original bytes. */
  bytes: number;
  raw: number;
  sum: number;
  rev: number;
  at: number;
}

export function fnv1a(bytes: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

async function pipeBytes(bytes: Uint8Array, stream: { readable: ReadableStream; writable: WritableStream }): Promise<Uint8Array> {
  const src = new Blob([bytes as unknown as ArrayBuffer]).stream();
  const out = src.pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(out as ReadableStream).arrayBuffer());
}

export async function encodeText(text: string): Promise<{ bytes: Uint8Array; codec: "gzip" | "none"; raw: number }> {
  const raw = new TextEncoder().encode(text);
  const CS = (globalThis as { CompressionStream?: new (f: string) => { readable: ReadableStream; writable: WritableStream } }).CompressionStream;
  if (CS) {
    try {
      const z = await pipeBytes(raw, new CS("gzip"));
      if (z.length < raw.length) return { bytes: z, codec: "gzip", raw: raw.length };
    } catch {
      /* fall through to raw bytes */
    }
  }
  return { bytes: raw, codec: "none", raw: raw.length };
}

export async function decodeText(bytes: Uint8Array, codec: "gzip" | "none"): Promise<string> {
  if (codec === "none") return new TextDecoder().decode(bytes);
  const DS = (globalThis as { DecompressionStream?: new (f: string) => { readable: ReadableStream; writable: WritableStream } }).DecompressionStream;
  if (!DS) throw new Error("stored state is gzip but DecompressionStream is unavailable");
  return new TextDecoder().decode(await pipeBytes(bytes, new DS("gzip")));
}

/** Copies, not views: structured clone of a view would serialise the whole backing buffer. */
export function splitChunks(bytes: Uint8Array, size = CHUNK_BYTES): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) out.push(bytes.slice(i, Math.min(bytes.length, i + size)));
  if (out.length === 0) out.push(new Uint8Array(0));
  return out;
}

export function joinChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

/**
 * Write `text` as chunks s:0..n-1 plus manifest key "m". `extra` entries (the small room metadata) are
 * written in the same final put as the manifest. All puts happen back to back with no other awaits, which
 * Durable Object storage commits atomically, and the manifest carries a checksum as a second guard.
 */
export async function saveChunked(io: ChunkIO, text: string, rev: number, now: number, prevN: number, extra: Record<string, unknown> = {}, chunkSize = CHUNK_BYTES): Promise<Manifest> {
  const enc = await encodeText(text);
  const chunks = splitChunks(enc.bytes, chunkSize);
  if (chunks.length > MAX_CHUNKS) throw new Error(`state too large to persist: ${chunks.length} chunks (max ${MAX_CHUNKS})`);
  const manifest: Manifest = { v: 1, codec: enc.codec, n: chunks.length, bytes: enc.bytes.length, raw: enc.raw, sum: fnv1a(enc.bytes), rev, at: now };
  for (let i = 0; i < chunks.length; i += 100) {
    const batch: Record<string, unknown> = {};
    chunks.slice(i, i + 100).forEach((c, j) => (batch[`s:${i + j}`] = c));
    await io.putMany(batch);
  }
  await io.putMany({ ...extra, m: manifest });
  if (prevN > chunks.length) {
    const stale: string[] = [];
    for (let i = chunks.length; i < prevN; i++) stale.push(`s:${i}`);
    for (let i = 0; i < stale.length; i += 100) await io.deleteMany(stale.slice(i, i + 100));
  }
  return manifest;
}

export async function loadChunked(io: ChunkIO): Promise<{ text: string; manifest: Manifest } | null> {
  const m = (await io.getMany(["m"])).get("m") as Manifest | undefined;
  if (!m) return null;
  if (m.v !== 1) throw new Error(`unknown state manifest version ${String(m.v)}`);
  const parts: Uint8Array[] = [];
  for (let i = 0; i < m.n; i += 100) {
    const keys: string[] = [];
    for (let j = i; j < Math.min(m.n, i + 100); j++) keys.push(`s:${j}`);
    const got = await io.getMany(keys);
    for (const k of keys) {
      const v = got.get(k);
      if (!(v instanceof Uint8Array)) throw new Error(`missing state chunk ${k}`);
      parts.push(v);
    }
  }
  const bytes = joinChunks(parts);
  if (bytes.length !== m.bytes || fnv1a(bytes) !== m.sum) throw new Error("stored state failed its checksum");
  return { text: await decodeText(bytes, m.codec), manifest: m };
}
