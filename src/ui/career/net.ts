import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiHost, wsProto } from "../host";
import {
  LockstepClient,
  PROTOCOL,
  type ClientMsg,
  type CreateSettings,
  type LobbyView,
  type LockstepSim,
  type ServerMsg,
  type SessionInfo,
} from "../../shared/careerNet";

export type CareerConn = "idle" | "connecting" | "online" | "reconnecting" | "closed";

export interface CareerError {
  at: number;
  code: string;
  message: string;
}

export interface CareerYou {
  pid: string;
  teamId: string | null;
  host: boolean;
}

/** Reconnect delay: 0.5s, 1s, 2s ... capped at 10s, with up to 30 percent jitter. */
export function backoffMs(attempt: number, rng: () => number = Math.random): number {
  const base = Math.min(10_000, 500 * 2 ** Math.max(0, attempt));
  return Math.round(base * (1 + rng() * 0.3));
}

/** A stable secret per browser. It is what lets you get your team back after a reconnect. */
export function careerHumanId(): string {
  try {
    let id = localStorage.getItem("boxbox-career-id");
    if (!id || id.length < 16) {
      id = crypto.randomUUID();
      localStorage.setItem("boxbox-career-id", id);
    }
    return id;
  } catch {
    return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}0000000000`.slice(0, 32);
  }
}

export interface ActResult {
  ok: boolean;
  message: string;
}

/**
 * Connects to the shared career league room.
 * Pass roomCode = null to stay disconnected. Close codes 4001 (opened in another tab) and 4003 (join
 * refused) do not reconnect; everything else reconnects with backoff and rejoins with the same humanId,
 * which hands the same team back.
 */
export function useCareerRoom(roomCode: string | null, humanId: string, name: string) {
  const [conn, setConn] = useState<CareerConn>("idle");
  const [lobby, setLobby] = useState<LobbyView | null>(null);
  const [you, setYou] = useState<CareerYou | null>(null);
  const [view, setView] = useState<unknown>(null);
  const [revs, setRevs] = useState<{ rev: number; careerRev: number }>({ rev: 0, careerRev: 0 });
  const [errors, setErrors] = useState<CareerError[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [sessionEnd, setSessionEnd] = useState<{ kind: string; applied: boolean; n: number } | null>(null);
  const [desync, setDesync] = useState<{ tick: number; reason: string; n: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const wsRef = useRef<WebSocket | null>(null);
  const offsetRef = useRef(0);
  const bestRtt = useRef(Infinity);
  const lockstepRef = useRef<LockstepClient | null>(null);
  const pending = useRef(new Map<number, (r: ActResult) => void>());
  const nextId = useRef(1);
  const endCount = useRef(0);

  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);

  useEffect(() => {
    if (!roomCode) {
      setConn("idle");
      setLobby(null);
      setView(null);
      setYou(null);
      setSession(null);
      lockstepRef.current = null;
      return;
    }
    let closed = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let hb: ReturnType<typeof setInterval> | null = null;
    const pend = pending.current;

    const failPending = () => {
      for (const [, cb] of pend) cb({ ok: false, message: "Disconnected." });
      pend.clear();
    };
    const pushError = (code: string, message: string) => setErrors((e) => [...e.slice(-9), { at: Date.now(), code, message }]);

    const open = () => {
      setConn(attempt === 0 ? "connecting" : "reconnecting");
      const sock = new WebSocket(`${wsProto()}://${apiHost()}/api/career/${encodeURIComponent(roomCode)}`);
      wsRef.current = sock;
      let t0 = 0;
      const ping = () => {
        if (sock.readyState !== WebSocket.OPEN) return;
        t0 = Date.now();
        sock.send(JSON.stringify({ t: "ping", c: t0 % 0x7fffffff } satisfies ClientMsg));
      };

      sock.onopen = () => {
        attempt = 0;
        setConn("online");
        sock.send(JSON.stringify({ t: "join", v: PROTOCOL, humanId, name } satisfies ClientMsg));
        ping();
        hb = setInterval(ping, 15_000);
      };

      sock.onmessage = (ev) => {
        let m: ServerMsg;
        try {
          m = JSON.parse(String(ev.data)) as ServerMsg;
        } catch {
          return;
        }
        switch (m.t) {
          case "welcome":
            offsetRef.current = m.serverNow - Date.now();
            setYou(m.you);
            break;
          case "pong": {
            const rtt = Date.now() - t0;
            if (rtt < bestRtt.current + 20) {
              bestRtt.current = Math.min(bestRtt.current, rtt);
              offsetRef.current = m.serverNow + rtt / 2 - Date.now();
            }
            break;
          }
          case "lobby":
            setLobby(m.lobby);
            setYou(m.lobby.you);
            break;
          case "view":
            setView(m.view);
            setRevs({ rev: m.rev, careerRev: m.careerRev });
            break;
          case "result": {
            const cb = pend.get(m.id);
            if (cb) {
              pend.delete(m.id);
              cb({ ok: m.ok, message: m.message });
            }
            break;
          }
          case "error":
            pushError(m.code, m.message);
            break;
          case "log":
            setLog((l) => [...l, ...m.lines].slice(-60));
            break;
          case "session":
            lockstepRef.current = new LockstepClient(m.info, () => Date.now() + offsetRef.current);
            setSession(m.info);
            break;
          case "cmd":
            lockstepRef.current?.onCmd(m.c, m.hz);
            break;
          case "hz":
            lockstepRef.current?.onHz(m.tick);
            break;
          case "speedSeg":
            lockstepRef.current?.onSeg(m.seg, m.hz);
            break;
          case "desync":
            setDesync((d) => ({ tick: m.tick, reason: m.reason, n: (d?.n ?? 0) + 1 }));
            break;
          case "sessionEnd":
            lockstepRef.current = null;
            setSession(null);
            setSessionEnd({ kind: m.kind, applied: m.applied, n: ++endCount.current });
            break;
        }
      };

      const lost = (code: number) => {
        if (hb) clearInterval(hb);
        hb = null;
        if (wsRef.current === sock) wsRef.current = null;
        failPending();
        if (closed) return;
        if (code === 4001 || code === 4003 || code === 1000) {
          setConn("closed");
          return;
        }
        setConn("reconnecting");
        timer = setTimeout(open, backoffMs(attempt++));
      };
      sock.onclose = (ev) => lost(ev.code);
      sock.onerror = () => {
        /* onclose follows */
      };
    };

    open();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      if (hb) clearInterval(hb);
      failPending();
      wsRef.current?.close(1000);
      wsRef.current = null;
    };
  }, [roomCode, humanId, name]);

  // Countdown clock for the timer display.
  const deadline = lobby?.deadline ?? null;
  useEffect(() => {
    if (deadline === null) return;
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(i);
  }, [deadline]);
  const secondsLeft = deadline === null ? null : Math.max(0, Math.ceil((deadline - (now + offsetRef.current)) / 1000));

  const send = useCallback((msg: ClientMsg): boolean => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(msg));
    return true;
  }, []);

  const api = useMemo(
    () => ({
      create: (teamId: string, settings: CreateSettings) => send({ t: "create", teamId, settings }),
      setSettings: (s: { timer?: number | null; speedMode?: "majority" | "host" }) => send({ t: "settings", ...s }),
      claim: (teamId: string) => send({ t: "claim", teamId }),
      leave: () => send({ t: "leave" }),
      setReady: (ready: boolean) => send({ t: "ready", ready }),
      setAway: (away: boolean, targetPid?: string) => send({ t: "away", away, target: targetPid }),
      vote: (topic: string, option: string) => send({ t: "vote", topic, option }),
      clearVotes: (topic?: string) => send({ t: "clearVotes", topic }),
      cmd: (cmd: unknown) => send({ t: "cmd", cmd }),
      speed: (speed: number) => send({ t: "speed", speed }),
      finish: (results: unknown) => send({ t: "finish", results }),
      resync: () => send({ t: "resync" }),
      abortSession: () => send({ t: "abortSession" }),
      /** Send a career action as your own team. Resolves with the engine's verdict (or a timeout). */
      act: (action: { type: string } & Record<string, unknown>): Promise<ActResult> =>
        new Promise((resolve) => {
          const id = nextId.current++;
          const timer = setTimeout(() => {
            pending.current.delete(id);
            resolve({ ok: false, message: "The server did not answer." });
          }, 10_000);
          pending.current.set(id, (r) => {
            clearTimeout(timer);
            resolve(r);
          });
          if (!send({ t: "act", id, action })) {
            clearTimeout(timer);
            pending.current.delete(id);
            resolve({ ok: false, message: "Not connected." });
          }
        }),
      /**
       * Call once per animation frame during a session. Steps your local sim as far as the server allows
       * and reports the state hashes the server asked for. Returns the number of ticks stepped.
       */
      runLockstep: (sim: LockstepSim, maxSteps = 200): number => {
        const ls = lockstepRef.current;
        if (!ls) return 0;
        const r = ls.run(sim, maxSteps);
        for (const h of r.hashes) send({ t: "hash", tick: h.tick, h: h.h });
        return r.steps;
      },
    }),
    [send],
  );

  const toggleReady = useCallback(() => {
    const me = lobby?.players.find((p) => p.pid === you?.pid);
    return send({ t: "ready", ready: !me?.ready });
  }, [lobby, you, send]);

  const me = lobby?.players.find((p) => p.pid === you?.pid) ?? null;

  return {
    conn,
    lobby,
    players: lobby?.players ?? [],
    you,
    me,
    isHost: !!you?.host,
    view,
    revs,
    errors,
    log,
    secondsLeft,
    serverNow,
    session,
    lockstep: lockstepRef.current,
    sessionEnd,
    desync,
    toggleReady,
    ...api,
    send,
  };
}

/** The value `useCareerRoom` returns. */
export type CareerRoom = ReturnType<typeof useCareerRoom>;
