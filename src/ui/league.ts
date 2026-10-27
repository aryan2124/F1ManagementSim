import { useCallback, useEffect, useRef, useState } from "react";
import { apiHost, wsProto } from "./host";
import type { ClientMsg, LeagueView, ServerMsg } from "../shared/league";

export type LeagueConn = "idle" | "connecting" | "online" | "offline";

function memberId(): string {
  try {
    let id = localStorage.getItem("boxbox-id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("boxbox-id", id);
    }
    return id;
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

/** Connects to the league Durable Object over WebSocket. Pass code=null to stay disconnected. */
export function useLeague(code: string | null, name: string) {
  const [state, setState] = useState<LeagueView | null>(null);
  const [you, setYou] = useState<string | null>(null);
  const [conn, setConn] = useState<LeagueConn>("idle");
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!code) {
      setConn("idle");
      setState(null);
      return;
    }
    let closed = false;
    setConn("connecting");
    const sock = new WebSocket(`${wsProto()}://${apiHost()}/api/league/${encodeURIComponent(code)}/ws`);
    ws.current = sock;
    sock.onopen = () => {
      setConn("online");
      const msg: ClientMsg = { t: "join", id: memberId(), name };
      sock.send(JSON.stringify(msg));
    };
    sock.onmessage = (ev) => {
      try {
        const m = JSON.parse(String(ev.data)) as ServerMsg;
        if (m.t === "state") {
          setState(m.state);
          setYou(m.you);
        }
      } catch {
        /* ignore */
      }
    };
    sock.onclose = () => {
      if (!closed) setConn("offline");
    };
    sock.onerror = () => {
      if (!closed) setConn("offline");
    };
    return () => {
      closed = true;
      sock.close();
    };
  }, [code, name]);

  const send = useCallback((msg: ClientMsg) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(msg));
  }, []);

  return { state, you, conn, send };
}
