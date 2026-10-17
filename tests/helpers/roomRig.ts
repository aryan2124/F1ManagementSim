import { CareerRoom } from "../../src/worker/career-room";
import type { LobbyView, ServerMsg } from "../../src/shared/careerNet";

const VALUE_LIMIT = 128 * 1024;

export class FakeStorage {
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

export class FakeWS {
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

export class FakeCtx {
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

export interface Rig {
  room: CareerRoom;
  ctx: FakeCtx;
  storage: FakeStorage;
  time: { t: number };
}

export async function rig(storage = new FakeStorage(), sockets: FakeWS[] = [], time = { t: 1_000_000 }): Promise<Rig> {
  const ctx = new FakeCtx(storage);
  ctx.sockets = sockets;
  time.t = time.t ?? 1_000_000;
  const room = new CareerRoom(ctx as never, {});
  room.clock = () => time.t;
  await ctx.ready;
  return { room, ctx, storage, time };
}

export const ID = (name: string) => `${name}-0000000000000000`;

export class Client {
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
  get view(): any {
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

export async function join(r: Rig, name: string, teamId?: string): Promise<Client> {
  const ws = new FakeWS();
  r.room.acceptConnection(ws as never);
  const c = new Client(r, ws, name);
  await c.send({ t: "join", v: 1, humanId: c.humanId, name, teamId });
  return c;
}


