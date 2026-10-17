import { useEffect, useMemo, useRef, useState } from "react";
import { TEAMS } from "../../game/data";
import { loadCircuit } from "../../game/circuits";
import { configFromPlan } from "../../career/multi";
import { fmtDay } from "../../career/util";
import type { CareerState } from "../../career/types";
import type { QualiConfig } from "../../sim/qualifying";
import type { Compound, RaceConfig } from "../../sim/types";
import { NetQualiSession, NetRaceSession, type NetLink } from "../../game/netsession";
import { QualiScreen } from "../QualiScreen";
import { RaceScreen } from "../RaceScreen";
import { Results } from "../Results";
import type { PlayerView } from "../../shared/careerNet";
import type { CareerRoom } from "./net";
import { Practice } from "./Weekend";
import type { Props } from "./common";

const teamName = (id: string | null) => TEAMS.find((t) => t.id === id)?.name ?? id ?? "no team";

/** Who is ready, who is away, and the clock. Shared by the factory and the race weekend. */
export function PlayerStrip({ players, youPid }: { players: PlayerView[]; youPid?: string }) {
  return (
    <ul className="n-players">
      {players
        .filter((p) => p.teamId)
        .map((p) => (
          <li key={p.pid} className={`${p.ready ? "ready" : ""} ${p.away ? "away" : ""} ${p.connected ? "" : "off"} ${p.pid === youPid ? "me" : ""}`}>
            <b>{p.name}</b>
            <span>{teamName(p.teamId)}</span>
            <i>{!p.connected ? "OFFLINE" : p.ready ? "READY" : p.away ? (p.away === "timer" ? "TIMED OUT" : "AWAY") : "THINKING"}</i>
          </li>
        ))}
    </ul>
  );
}

function Countdown({ room }: { room: CareerRoom }) {
  if (room.lobby?.idlePaused) return <span className="warn small">Nobody is playing, the clock is paused until someone acts.</span>;
  if (room.secondsLeft === null) return <span className="dim small">No timer: the league waits for everyone.</span>;
  return <span className="n-clock">{Math.floor(room.secondsLeft / 60)}:{String(room.secondsLeft % 60).padStart(2, "0")}</span>;
}

/** A link a friend can open to join this league, from inside the game. */
export function InviteLink({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  if (!code) return null;
  const link = `${location.origin}${location.pathname}?league=${encodeURIComponent(code)}`;
  return (
    <div className="n-invite">
      <span className="dim small">INVITE A FRIEND</span>
      <input className="n-input" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
      <button
        className="tiny"
        onClick={() => {
          const done = () => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); };
          if (navigator.clipboard?.writeText) navigator.clipboard.writeText(link).then(done, () => undefined);
          else done();
        }}
      >
        {copied ? "COPIED" : "COPY LINK"}
      </button>
    </div>
  );
}

/** The online replacement for the CONTINUE button. */
export function ReadyDock({ room, s, onWeekend }: { room: CareerRoom; s: CareerState; onWeekend: () => void }) {
  const lobby = room.lobby;
  const me = room.me;
  const phase = lobby?.phase;
  const inWeekend = !!s.weekend && s.weekend.stage !== "done";
  const practising = inWeekend && s.weekend?.stage === "practice";
  const unspent = practising ? s.weekend?.runsLeft ?? 0 : 0;
  const [sure, setSure] = useState(false);
  const label = phase === "weekend" ? (practising ? (unspent > 0 ? "END PRACTICE: READY FOR QUALIFYING" : "READY FOR QUALIFYING") : "READY FOR QUALIFYING") : "READY: NEXT DAY";
  return (
    <div className="n-dock">
      <div className="n-top">
        <span className="dim small">{fmtDay(s.day, true)}{lobby?.stop ? `. ${lobby.stop}.` : ""}</span>
        <Countdown room={room} />
      </div>
      <PlayerStrip players={room.players} youPid={room.you?.pid} />
      <InviteLink code={lobby?.code ?? ""} />
      <div className="n-btns">
        {inWeekend && <button className="btn" onClick={onWeekend}>ENTER THE RACE WEEKEND</button>}
        <button className={`btn ${me?.away === "manual" ? "on" : ""}`} title="Do not wait for me. The league carries on without my say, and I am back as soon as I act." onClick={() => room.setAway(me?.away !== "manual")}>
          {me?.away === "manual" ? "I AM BACK" : "I AM AWAY"}
        </button>
        <button className={`btn primary big ${me?.ready ? "on" : room.me && !s.cards.some((c) => !c.notice) ? "pulse" : ""}`} onClick={() => {
          if (!me?.ready && practising && unspent > 0 && !sure) { setSure(true); return; }
          setSure(false);
          room.toggleReady();
        }}>
          {me?.ready ? "READY (CLICK TO TAKE BACK)" : sure ? `YOU HAVE ${unspent} RUNS LEFT: CLICK AGAIN TO SKIP THEM` : label}
        </button>
      </div>
      {lobby && lobby.log.length > 0 && <p className="dim small n-log">{lobby.log[lobby.log.length - 1]}</p>}
    </div>
  );
}

/** Practice and the wait for qualifying, for an online weekend. */
export function NetWeekend({ room, s, d, msg, onExit }: Props & { room: CareerRoom; msg: string; onExit: () => void }) {
  const ws = s.weekend;
  if (!ws || ws.stage === "done") {
    return (
      <div className="screen">
        <section className="panel">
          <h3>WEEKEND COMPLETE</h3>
          <button className="btn primary big" onClick={onExit}>BACK TO THE FACTORY</button>
        </section>
      </div>
    );
  }
  return (
    <div className="screen">
      <div className="row-btns">
        <button className="tiny" onClick={onExit}>{"< FACTORY"}</button>
        <span className="dim small">Practice is yours alone. Qualifying and the race start once the whole league is ready.</span>
      </div>
      {ws.stage === "practice" ? (
        <Practice s={s} d={d} msg={msg} net />
      ) : (
        <section className="panel">
          <h3>PRACTICE IS OVER</h3>
          <p className="dim">The setup is locked in for qualifying. Press ready when you are, or change nothing and wait for the others.</p>
        </section>
      )}
      <section className="panel">
        <ReadyDock room={room} s={s} onWeekend={() => undefined} />
      </section>
    </div>
  );
}

interface Plan {
  v: 1;
  kind: "quali" | "race";
  circuitId: string;
  gp: string;
  laps: number;
  humanIds: string[];
  humanTeams: Record<string, string[]>;
  locks: Record<string, Compound> | null;
  cfg: Record<string, unknown> & { tyreSets?: Record<string, Record<Compound, number>> };
}

/** Between sessions: the lobby where everyone says they are ready. */
export function SessionLobby({ room }: { room: CareerRoom }) {
  const kind = room.lobby?.session?.kind ?? "session";
  const plan = room.session?.plan as Plan | undefined;
  const me = room.me;
  return (
    <div className="screen">
      <section className="panel n-lobby">
        <h3>{kind === "qualifying" ? "QUALIFYING" : "THE RACE"}{plan ? `: ${plan.gp}` : ""}</h3>
        <p className="dim">
          {kind === "qualifying"
            ? "Every team runs qualifying at the same time. Send your cars out from the panel during the session."
            : "On the grid you get a minute to pick your starting tyres. After that the lights go out for everyone together."}
        </p>
        <Countdown room={room} />
        <PlayerStrip players={room.players} youPid={room.you?.pid} />
        <div className="n-btns">
          <button className={`btn ${me?.away === "manual" ? "on" : ""}`} onClick={() => room.setAway(me?.away !== "manual")}>{me?.away === "manual" ? "I AM BACK" : "I AM AWAY"}</button>
          <button className={`btn primary big ${me?.ready ? "on" : ""}`} onClick={room.toggleReady}>{me?.ready ? "READY (CLICK TO TAKE BACK)" : "READY"}</button>
        </div>
      </section>
    </div>
  );
}

function GridPick({ session, plan, myCars }: { session: NetRaceSession; plan: Plan; myCars: string[] }) {
  const [, force] = useState(0);
  useEffect(() => {
    const i = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(i);
  }, []);
  if (session.held >= session.hold) return null;
  return (
    <div className="n-grid">
      <h3>ON THE GRID: PICK YOUR START TYRES</h3>
      <p className="dim small">Lights in {Math.ceil(session.holdLeft)} s. Use the speed buttons to hurry the league along; the pick is final when the lights begin.</p>
      {myCars.map((id) => {
        const car = session.sim.car(id);
        const lock = plan.locks?.[id];
        const sets = plan.cfg.tyreSets?.[id];
        return (
          <div className="c-row" key={id}>
            <span>{car.entry.driver.code} starts P{car.startPosition}</span>
            {lock ? (
              <b>locked to {lock}</b>
            ) : (
              <div className="seg">
                {(["S", "M", "H"] as Compound[]).map((c) => (
                  <button key={c} className={car.tyre.compound === c ? "on" : ""} disabled={sets ? (sets[c] ?? 0) <= 0 : false} onClick={() => { session.sim.command({ type: "startTyre", carId: id, compound: c }); force((n) => n + 1); }}>
                    {c}{sets ? ` (${sets[c] ?? 0})` : ""}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The live session for an online league: qualifying or the race, in lockstep with everyone else. */
export function NetSession({ room, held, onLeave }: { room: CareerRoom; held?: NonNullable<CareerRoom["session"]> | null; onLeave?: () => void }) {
  // the league may move on the moment the last team reports, so the screen keeps its own copy of the session until you click out
  const info = room.session ?? held ?? null;
  const plan = info?.plan as Plan | undefined;
  const roomRef = useRef(room);
  roomRef.current = room;
  const link: NetLink = useMemo(
    () => ({
      cmd: (c) => roomRef.current.cmd(c),
      speed: (n) => roomRef.current.speed(n),
      run: (sim, max) => roomRef.current.runLockstep(sim, max),
      finish: (r) => roomRef.current.finish(r),
    }),
    [],
  );
  const myTeam = room.you?.teamId ?? "";
  const myCars = plan?.humanTeams[myTeam] ?? [];
  const [done, setDone] = useState(false);
  const live = useMemo(() => {
    if (!info || !plan) return null;
    const cfg = configFromPlan({ circuitId: plan.circuitId, cfg: plan.cfg });
    return plan.kind === "quali" ? new NetQualiSession(cfg as QualiConfig, myCars, link, plan.humanIds) : new NetRaceSession(cfg as RaceConfig, myCars, link, plan.humanIds);
  }, [info?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [view, setView] = useState<"race" | "results">("race");
  const skip = plan ? { allHumanIds: plan.humanIds, votes: room.lobby?.votes ?? {}, myTeam, cast: (o: "skip" | "watch") => room.vote("skip", o) } : undefined;
  useEffect(() => {
    setDone(false);
    setView("race");
  }, [info?.id]);

  if (!info || !plan || !live) return <div className="screen"><section className="panel"><p>Loading the session...</p></section></div>;
  const meta = loadCircuit(plan.circuitId).meta;
  const banner = room.desync ? (
    <div className="n-desync">
      <b>The simulations drifted apart.</b> The server noticed a difference around tick {room.desync.tick}.
      <button className="tiny" onClick={room.resync}>RESYNC</button>
    </div>
  ) : null;
  if (done) {
    return (
      <div className="screen">
        <section className="panel">
          <h3>SESSION OVER</h3>
          <p className="dim">{room.session ? "Waiting for the other teams to finish. The league moves on by itself." : "The league has moved on."}</p>
          {!room.session && onLeave && <button className="btn primary big" onClick={onLeave}>CONTINUE</button>}
        </section>
      </div>
    );
  }
  if (live instanceof NetQualiSession) {
    return (
      <>
        {banner}
        <QualiScreen session={live} meta={meta} onDone={() => setDone(true)} skip={skip} />
      </>
    );
  }
  const rs = live as NetRaceSession;
  if (view === "results" || rs.finished) {
    return <Results session={rs} gp={meta.gp} menuLabel={room.session ? "WAIT FOR THE LEAGUE" : "CONTINUE"} onMenu={() => { setDone(true); if (!room.session) onLeave?.(); }} />;
  }
  return (
    <>
      {banner}
      <RaceScreen session={rs} meta={meta} onFinish={() => setView("results")} skip={skip} />
      <GridPick session={rs} plan={plan} myCars={myCars} />
    </>
  );
}
