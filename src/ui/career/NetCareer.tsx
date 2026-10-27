import { useEffect, useState } from "react";
import { shareOrigin, sharePath } from "../host";
import { TEAMS } from "../../game/data";
import type { CareerState, Guidance } from "../../career/types";
import { HelpPicker } from "./HelpPicker";
import { getPrefs, setPref } from "../prefs";
import { CareerApp } from "./CareerApp";
import { NetSession, PlayerStrip, SessionLobby } from "./NetParts";
import { careerHumanId, useCareerRoom, type CareerRoom } from "./net";
import { hex } from "./common";

const NAME_KEY = "boxbox-career-name";
const LEAGUES_KEY = "boxbox-career-leagues";

/** Leagues this browser has joined, newest first. The league itself is saved on the server after every step; this list is how you find it again. */
function recentLeagues(): { code: string; name: string; at: number }[] {
  try {
    const v = JSON.parse(localStorage.getItem(LEAGUES_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => x && typeof x.code === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}
function rememberLeague(code: string, name: string) {
  try {
    const rest = recentLeagues().filter((x) => x.code !== code);
    localStorage.setItem(LEAGUES_KEY, JSON.stringify([{ code, name, at: Date.now() }, ...rest].slice(0, 8)));
  } catch {
    /* private window */
  }
}
const newCode = () => Math.random().toString(36).slice(2, 8);

function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Pick a name and a league code, then go in. */
export function NetJoin({ onJoin, onBack, code0 }: { onJoin: (code: string, name: string) => void; onBack: () => void; code0?: string }) {
  const [name, setName] = useState(savedName());
  const [code, setCode] = useState(code0 ?? "");
  const go = (c: string) => {
    const n = name.trim() || "Manager";
    try {
      localStorage.setItem(NAME_KEY, n);
    } catch {
      /* private window */
    }
    rememberLeague(c.trim().toLowerCase(), n);
    onJoin(c.trim().toLowerCase(), n);
  };
  const recent = recentLeagues();
  const ok = /^[a-z0-9_-]{3,40}$/i.test(code.trim());
  return (
    <div className="screen menu nc">
      <header className="hero small">
        <h2>ONLINE LEAGUE</h2>
        <p>ONE SHARED CAREER. EACH MANAGER RUNS ONE TEAM. THE AI RUNS THE REST.</p>
      </header>
      <div className="nc-top"><button className="tiny" onClick={onBack}>{"< BACK"}</button></div>
      <section className="panel">
        <h3>YOUR NAME</h3>
        <input className="n-input" value={name} maxLength={20} placeholder="Manager" onChange={(e) => setName(e.target.value)} />
      </section>
      {recent.length > 0 && (
        <section className="panel">
          <h3>YOUR LEAGUES</h3>
          <p className="dim small">Leagues are saved on the server after every step. Pick one to carry on where it stopped.</p>
          {recent.map((r) => (
            <div className="c-row" key={r.code}>
              <span><b>{r.code.toUpperCase()}</b> <span className="dim small">as {r.name}, {new Date(r.at).toLocaleDateString()}</span></span>
              <button className="btn" onClick={() => go(r.code)}>LOAD</button>
            </div>
          ))}
        </section>
      )}
      <section className="panel">
        <h3>JOIN A LEAGUE</h3>
        <p className="dim small">Ask the host for the league code, or open the invite link they send you.</p>
        <input className="n-input" value={code} placeholder="league code" onChange={(e) => setCode(e.target.value)} />
        <div className="row-btns"><button className="btn primary big" disabled={!ok} onClick={() => go(code)}>JOIN</button></div>
      </section>
      <section className="panel">
        <h3>START A NEW LEAGUE</h3>
        <p className="dim small">You become the host. You choose your team and the rules, then share the code with your friends.</p>
        <div className="row-btns"><button className="btn big" onClick={() => go(newCode())}>CREATE A LEAGUE</button></div>
      </section>
    </div>
  );
}

const TIMERS: { v: number | null; label: string }[] = [
  { v: null, label: "No timer" },
  { v: 60, label: "1 min" },
  { v: 180, label: "3 min" },
  { v: 600, label: "10 min" },
];

function LeagueSetup({ room, code }: { room: CareerRoom; code: string }) {
  const [teamId, setTeamId] = useState("wil");
  const [timer, setTimer] = useState<number | null>(null);
  const [speedMode, setSpeedMode] = useState<"majority" | "host">("majority");
  const [difficulty, setDifficulty] = useState<0 | 1 | 2>(1);
  const [length, setLength] = useState<"full" | "half" | "quick">("half");
  const [eraMode, setEraMode] = useState<"natural" | "locked">("natural");
  const [help, setHelp] = useState<Guidance>(getPrefs().help);
  const link = `${shareOrigin()}${sharePath()}?league=${encodeURIComponent(code)}`;
  const create = () => {
    setPref("help", help);
    room.create(teamId, { timer, speedMode, teamIds: TEAMS.map((t) => t.id), extra: { difficulty, raceLength: length, eraMode, guidance: help } });
  };
  return (
    <div className="screen menu nc">
      <header className="hero small">
        <h2>NEW LEAGUE</h2>
        <p>LEAGUE CODE: <b>{code.toUpperCase()}</b></p>
      </header>
      <section className="panel">
        <h3>INVITE FRIENDS</h3>
        <p className="dim small">Send this link. They can join before or after you start. Up to 11 managers, one per team.</p>
        <input className="n-input" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
      </section>
      <section className="panel">
        <h3>YOUR TEAM</h3>
        <div className="nc-teams">
          {TEAMS.map((t) => (
            <button key={t.id} className={`nc-team ${teamId === t.id ? "on" : ""}`} style={{ borderColor: teamId === t.id ? hex(t.color) : undefined }} onClick={() => setTeamId(t.id)}>
              <i style={{ background: hex(t.color) }} />
              {t.name}
            </button>
          ))}
        </div>
      </section>
      <section className="panel">
        <h3>THE RULES OF THE LEAGUE</h3>
        <div className="c-row"><span>Waiting for slow players</span><div className="seg">{TIMERS.map((o) => <button key={String(o.v)} className={timer === o.v ? "on" : ""} onClick={() => setTimer(o.v)}>{o.label}</button>)}</div></div>
        <p className="dim small">With a timer, anyone who has not pressed ready when it runs out is skipped for that step. With no timer the league waits for everyone, and anyone can mark themselves away.</p>
        <div className="c-row"><span>Race speed</span><div className="seg"><button className={speedMode === "majority" ? "on" : ""} onClick={() => setSpeedMode("majority")}>MAJORITY VOTE</button><button className={speedMode === "host" ? "on" : ""} onClick={() => setSpeedMode("host")}>HOST DECIDES</button></div></div>
        <div className="c-row"><span>Difficulty</span><div className="seg">{(["EASY", "NORMAL", "HARD"] as const).map((l, i) => <button key={l} className={difficulty === i ? "on" : ""} onClick={() => setDifficulty(i as 0 | 1 | 2)}>{l}</button>)}</div></div>
        <div className="c-row"><span>Race length</span><div className="seg">{(["full", "half", "quick"] as const).map((l) => <button key={l} className={length === l ? "on" : ""} onClick={() => setLength(l)}>{l.toUpperCase()}</button>)}</div></div>
        <div className="c-row"><span>Rule changes</span><div className="seg"><button className={eraMode === "natural" ? "on" : ""} onClick={() => setEraMode("natural")}>THE ERAS TURN</button><button className={eraMode === "locked" ? "on" : ""} onClick={() => setEraMode("locked")}>RULES STAY PUT</button></div></div>
        <div className="c-row"><span>Your help level</span><HelpPicker value={help} onChange={setHelp} /></div>
        <p className="dim small">League races are full weekends without sprints. Everyone sees the same world; each manager keeps their own money, people and car.</p>
        <div className="row-btns"><button className="btn primary big" onClick={create}>START THE LEAGUE</button></div>
      </section>
    </div>
  );
}

function PickTeam({ room }: { room: CareerRoom }) {
  const free = room.lobby?.freeTeams ?? [];
  const [help, setHelp] = useState<Guidance>(getPrefs().help);
  return (
    <div className="screen menu nc">
      <header className="hero small">
        <h2>CHOOSE A TEAM</h2>
        <p>THE AI RUNS EVERY TEAM NOBODY TAKES.</p>
      </header>
      <section className="panel">
        <h3>YOUR HELP LEVEL</h3>
        <HelpPicker value={help} onChange={(g) => { setHelp(g); setPref("help", g); }} />
      </section>
      <section className="panel">
        <PlayerStrip players={room.players} youPid={room.you?.pid} />
        {free.length === 0 ? (
          <p className="warn">Every seat is taken. You can wait here: if someone leaves, a seat opens.</p>
        ) : (
          <div className="nc-teams">
            {free.map((id) => {
              const t = TEAMS.find((x) => x.id === id);
              return (
                <button key={id} className="nc-team" onClick={() => room.claim(id)}>
                  <i style={{ background: t ? hex(t.color) : "#888" }} />
                  {t?.name ?? id}
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

const Waiting = ({ text, onExit }: { text: string; onExit: () => void }) => (
  <div className="screen">
    <section className="panel">
      <h3>{text}</h3>
      <button className="tiny" onClick={onExit}>{"< LEAVE"}</button>
    </section>
  </div>
);

/** The online career: lobby, seat choice, then the normal career screens driven by the server. */
export function NetCareerApp({ code, name, onExit }: { code: string; name: string; onExit: () => void }) {
  const room = useCareerRoom(code, careerHumanId(), name);
  const lobby = room.lobby;
  const lastErr = room.errors[room.errors.length - 1];
  const exit = () => {
    room.leave();
    onExit();
  };
  // keep the last live session on screen until the player clicks out, so the podium, anthem and classification are not cut off
  const [held, setHeld] = useState<NonNullable<CareerRoom["session"]> | null>(null);
  useEffect(() => {
    if (room.session) setHeld(room.session);
  }, [room.session]);
  let body;
  if (room.conn === "closed") body = <Waiting text="This league was opened in another tab, or refused you." onExit={onExit} />;
  else if (!lobby) body = <Waiting text={room.conn === "reconnecting" ? "Reconnecting..." : "Connecting to the league..."} onExit={onExit} />;
  else if (!lobby.created) {
    body = room.isHost ? <LeagueSetup room={room} code={code} /> : <Waiting text="Waiting for the host to set up the league..." onExit={onExit} />;
  } else if (!room.you?.teamId) body = <PickTeam room={room} />;
  else if (!room.view) body = <Waiting text="Loading your team..." onExit={onExit} />;
  else if (lobby.phase === "session" && room.session) body = <NetSession room={room} held={held} onLeave={() => setHeld(null)} />;
  else if (held) body = <NetSession room={room} held={held} onLeave={() => setHeld(null)} />;
  else if (lobby.phase === "sessionLobby") body = <SessionLobby room={room} />;
  else body = <CareerApp key={code} initial={room.view as CareerState} net={room} onExit={exit} />;
  return (
    <>
      {room.conn === "reconnecting" && <div className="n-desync">Connection lost. Reconnecting...</div>}
      {lastErr && Date.now() - lastErr.at < 8000 && <div className="n-desync">{lastErr.message}</div>}
      {body}
    </>
  );
}
