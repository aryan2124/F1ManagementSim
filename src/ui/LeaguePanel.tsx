import { useState } from "react";
import { useLeague } from "./league";

/** Click-to-advance multiplayer lobby. Needs the Cloudflare Worker running (npm run dev:worker). */
export function LeaguePanel() {
  const [code, setCode] = useState(() => localStorage.getItem("boxbox-league") ?? "paddock-1");
  const [name, setName] = useState(() => localStorage.getItem("boxbox-name") ?? "Manager");
  const [active, setActive] = useState<string | null>(null);
  const { state, you, conn, send } = useLeague(active, name);

  const connect = () => {
    const clean = code.trim().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "paddock-1";
    localStorage.setItem("boxbox-league", clean);
    localStorage.setItem("boxbox-name", name);
    setCode(clean);
    setActive(clean);
  };

  const me = state && you ? state.members[you] : null;
  const isHost = !!(state && you && state.hostId === you);

  return (
    <section className="panel league">
      <h3>MULTIPLAYER LEAGUE</h3>
      {!active ? (
        <>
          <p className="dim">Friends join the same code. The calendar only moves when everyone clicks continue.</p>
          <label className="field">
            <span>YOUR NAME</span>
            <input value={name} maxLength={18} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>LEAGUE CODE</span>
            <input value={code} maxLength={40} onChange={(e) => setCode(e.target.value)} />
          </label>
          <button className="btn" onClick={connect}>
            JOIN LEAGUE
          </button>
        </>
      ) : (
        <>
          <div className="league-head">
            <span className={`dot ${conn}`} /> {code} <b className="day">DAY {state?.day ?? "-"}</b>
          </div>
          {conn === "offline" && <p className="warn">Cannot reach the league server. Run `npm run dev:worker` in another terminal, or deploy to Cloudflare.</p>}
          <ul className="members">
            {state &&
              Object.entries(state.members).map(([id, m]) => (
                <li key={id} className={m.ready ? "ready" : ""}>
                  <span className={`dot ${m.online ? "online" : "offline"}`} />
                  <span className="mname">
                    {m.name}
                    {state.hostId === id ? " (host)" : ""}
                    {id === you ? " (you)" : ""}
                  </span>
                  <span className="mstate">{m.away ? "AWAY" : m.ready ? "READY" : "THINKING"}</span>
                  {(isHost || id === you) && (
                    <button className="tiny" onClick={() => send({ t: "away", target: id, away: !m.away })}>
                      {m.away ? "BACK" : "AWAY"}
                    </button>
                  )}
                </li>
              ))}
          </ul>
          <button
            className={`btn primary ${me?.ready ? "pressed" : ""}`}
            disabled={conn !== "online"}
            onClick={() => send({ t: "ready", ready: !me?.ready })}
          >
            {me?.ready ? "WAITING FOR OTHERS..." : "CONTINUE >>"}
          </button>
          <div className="league-log">{state?.log.slice(-4).map((l, i) => <div key={i}>{l}</div>)}</div>
          <button className="tiny" onClick={() => setActive(null)}>
            LEAVE
          </button>
        </>
      )}
    </section>
  );
}
