import { DurableObject } from "cloudflare:workers";
import { applyMessage, newLeague, type ClientMsg, type LeagueState, type LeagueView, type ServerMsg } from "../shared/league";

interface Attachment {
  id: string;
}

/**
 * One league = one Durable Object. It holds the authoritative state, speaks WebSocket
 * (hibernation API, so an idle league costs nothing), and only advances the calendar when
 * every active manager has clicked READY.
 */
export class LeagueRoom extends DurableObject {
  private league: LeagueState | null = null;

  private async load(leagueId: string): Promise<LeagueState> {
    if (!this.league) {
      this.league = (await this.ctx.storage.get<LeagueState>("league")) ?? newLeague(leagueId);
    }
    return this.league;
  }

  private async save(next: LeagueState) {
    this.league = next;
    await this.ctx.storage.put("league", next);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    const leagueId = new URL(request.url).pathname.split("/")[3] ?? "league";
    await this.load(leagueId);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string") return;
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw) as ClientMsg;
    } catch {
      return;
    }
    const state = await this.load("league");
    let attachment = ws.deserializeAttachment() as Attachment | null;
    if (msg.t === "join") {
      if (typeof msg.id !== "string" || msg.id.length > 64) return;
      attachment = { id: msg.id };
      ws.serializeAttachment(attachment);
    }
    if (!attachment) return; // must join first
    const next = applyMessage(state, attachment.id, msg);
    if (next !== state) await this.save(next);
    this.broadcast();
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    ws.close(code, "closed");
    this.broadcast();
  }

  private broadcast() {
    const state = this.league;
    if (!state) return;
    const sockets = this.ctx.getWebSockets();
    const online = new Set<string>();
    for (const s of sockets) {
      const a = s.deserializeAttachment() as Attachment | null;
      if (a) online.add(a.id);
    }
    const members: LeagueView["members"] = {};
    for (const [id, m] of Object.entries(state.members)) members[id] = { ...m, online: online.has(id) };
    const view: LeagueView = { ...state, members };
    for (const s of sockets) {
      const a = s.deserializeAttachment() as Attachment | null;
      const payload: ServerMsg = { t: "state", state: view, you: a?.id ?? null };
      try {
        s.send(JSON.stringify(payload));
      } catch {
        /* socket already gone */
      }
    }
  }
}
