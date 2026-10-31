import { SetPicker } from "./SetPicker";
import { advisePit, bestSet } from "../sim/tyreSets";
import { SkipPrompt, type NetSkip } from "./SkipPrompt";
import { useEffect, useRef, useState } from "react";
import { PLink } from "./career/Profile";
import type { RaceSession } from "../game/session";
import type { LiveSession, LiveSim, SpeedSetting } from "../game/live";
import { COMPOUNDS, fmtLap, FUEL_KG, LIGHTS_TICKS } from "../sim/engine";
import type { CircuitMeta } from "../game/circuits";
import type { CarState, Compound, EnergyMode, PushLevel, TeamOrder } from "../sim/types";
import { RaceView } from "../render/RaceView";
import { CompoundBadge } from "./Briefing";
import { useUiTick } from "./hooks";
import { hex, SECTOR_COLORS } from "./colors";
import { PromptBar, RadioFeed } from "./RadioPanel";
import { SectorsView } from "./SectorTable";
import { liveSectorColors } from "./sectorRows";
import { Director } from "../game/director";
import { RaceAudio } from "../audio/raceAudio";
import { music, type TrackName } from "../audio/music";
import { raceTrackFor } from "../audio/mood";
import { RadarPanel, WeatherChip } from "./WeatherPanel";
import { DriverPortrait } from "./pixel/portraits";
import { sessionTitle } from "./sessionTitle";
import { scrollTop } from "./hooks";

export { hex, SECTOR_COLORS };
export { RadioFeed };

export function fmtClock(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

type BottomTab = "radio" | "sectors" | "radar";

export function RaceScreen({ session, meta, onFinish, skip, donuts, kind }: { session: RaceSession; meta: CircuitMeta; onFinish: () => void; skip?: NetSkip; donuts?: (session: RaceSession) => string[]; kind?: "sprint" | "race" }) {
  useEffect(() => { scrollTop(); }, []);
  useUiTick(120);
  const sim = session.sim;
  const [tab, setTab] = useState<BottomTab>("radio");
  const [secMode, setSecMode] = useState<"last" | "best">("last");
  const teamId = sim.car(session.humanIds[0]).entry.team.id;

  // the race director picks the camera until the player chooses a car by hand
  const director = useRef(new Director());
  useEffect(() => {
    session.directing = true;
    const d = director.current;
    const off = session.onEvent((e) => d.note(e, sim, session.humanIds, performance.now()));
    const id = window.setInterval(() => {
      if (!session.directing || session.speed === 0) return;
      if (sim.phase === "finished") {
        session.cutTo(sim.order[0].id);
        return;
      }
      session.cutTo(d.pick(sim, session.humanIds, performance.now(), session.followId));
      session.cameraNote = d.caption;
    }, 250);
    return () => {
      off();
      window.clearInterval(id);
    };
  }, [session, sim]);

  // the music follows the story of the race: it does not change more than every few seconds unless something big happens
  useEffect(() => {
    let cur: TrackName | null = null;
    let since = 0;
    const id = window.setInterval(() => {
      const want = raceTrackFor(session);
      const now = performance.now();
      const big = want === "raceSC" || want === "results";
      if (want !== cur && (cur === null || big || now - since > 9000)) {
        cur = want;
        since = now;
        music.play(want);
      }
    }, 700);
    return () => window.clearInterval(id);
  }, [session]);

  // the sound of the race follows the camera
  useEffect(() => {
    const audio = new RaceAudio(session);
    const id = window.setInterval(() => audio.update(), 90);
    return () => {
      window.clearInterval(id);
      audio.stop();
    };
  }, [session]);

  // a driver asking a question slows the race so there is time to answer
  useEffect(() => {
    return session.onEvent((e) => {
      if (e.kind === "prompt" && session.speed > 2) session.speed = 2;
    });
  }, [session]);

  // opening the dashboard from a solo session holds the clock, and closing it puts the speed back
  useEffect(() => {
    let was: SpeedSetting | null = null;
    const onHold = (e: Event) => {
      const on = (e as CustomEvent<boolean>).detail;
      if (on && was === null) { was = session.speed as SpeedSetting; session.speed = 0; }
      else if (!on && was !== null) { session.speed = was; was = null; }
    };
    window.addEventListener("boxbox-hold", onHold);
    return () => window.removeEventListener("boxbox-hold", onHold);
  }, [session]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.code === "Space") {
        e.preventDefault();
        session.speed = session.speed === 0 ? 4 : 0;
      }
      if (e.key === "1") session.speed = 1;
      if (e.key === "2") session.speed = 2;
      if (e.key === "3") session.speed = 4;
      if (e.key === "4") session.speed = 8;
      if (e.key === "5") session.speed = 16;
      if (e.key === "6") session.speed = 32;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session]);

  const speeds: { v: SpeedSetting; label: string }[] = [
    { v: 0, label: "||" },
    { v: 1, label: "1x" },
    { v: 2, label: "2x" },
    { v: 4, label: "4x" },
    { v: 8, label: "8x" },
    { v: 16, label: "16x" },
    { v: 32, label: "32x" },
  ];

  return (
    <div className="screen race">
      <header className="racebar">
        <div className="logo-sm">
          BOX<span>BOX</span>
        </div>
        <div className="lapcount">
          LAP <b>{sim.leaderLap}</b>/{sim.cfg.laps}
        </div>
        <div className="gpname">{sessionTitle(meta.gp, kind).toUpperCase()}</div>
        <div className="clock">{fmtClock(sim.raceTime)}</div>
        <WeatherChip session={session} />
        <div className={`flag ${sim.inc.red.active ? "red" : sim.neutral.active ? "sc" : sim.chequered ? "chq" : sim.inc.yellowUntil.some((u) => u > sim.tick) ? "yellow" : "green"}`}>
          {sim.inc.red.active ? "RED FLAG" : sim.neutral.active ? (sim.neutral.kind === "vsc" ? "VIRTUAL SC" : "SAFETY CAR") : sim.chequered ? "CHEQUERED" : sim.inc.yellowUntil.some((u) => u > sim.tick) ? `YELLOW S${sim.inc.yellowUntil.map((u, i) => (u > sim.tick ? i + 1 : 0)).filter(Boolean).join("+")}` : "GREEN"}
        </div>
        <div className="speeds">
          {speeds.map((s) => (
            <button key={s.v} className={session.speed === s.v ? "on" : ""} onClick={() => (session.speed = s.v)}>
              {s.label}
              {skip?.votes.speed && Object.values(skip.votes.speed).filter((x) => Number(x) === s.v).length > 0 && <small className="vote-dot">{Object.values(skip.votes.speed).filter((x) => Number(x) === s.v).length}</small>}
            </button>
          ))}
          {skip?.votes.speed && <span className="vote-list" title="Who voted for which speed">{Object.entries(skip.votes.speed).map(([team, v]) => `${team.toUpperCase()} ${v}x`).join("  ")}</span>}
        </div>
      </header>
      <SkipPrompt session={session} net={skip} />
      {session.canSkipRed && (
        <div className="redskip">
          <span>RED FLAG: the race is stopped.</span>
          <button className="btn primary" onClick={() => session.skipRedFlag()}>SKIP RED FLAG</button>
        </div>
      )}

      <div className="race-grid">
        <TimingTower session={session} />
        <div className="center">
          <div className="viewbox">
            <RaceView session={session} meta={meta}>
              <RaceOverlay session={session} onFinish={onFinish} donuts={donuts} />
            </RaceView>
            <Minimap session={session} />
          </div>
          <PromptBar session={session} />
          <div className="btabs">
            {(["radio", "sectors", "radar"] as BottomTab[]).map((t) => (
              <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
                {t === "radio" ? "RADIO" : t === "sectors" ? "SECTORS" : "WEATHER RADAR"}
              </button>
            ))}
            {tab === "sectors" && (
              <span className="seg">
                <button className={secMode === "last" ? "on" : ""} onClick={() => setSecMode("last")}>
                  LAST LAP
                </button>
                <button className={secMode === "best" ? "on" : ""} onClick={() => setSecMode("best")}>
                  BEST LAP
                </button>
              </span>
            )}
          </div>
          {tab === "radio" && <RadioFeed session={session} />}
          {tab === "sectors" && (
            <section className="panel">
              <SectorsView session={session} mode={secMode} />
            </section>
          )}
          {tab === "radar" && <RadarPanel session={session} teamId={teamId} />}
        </div>
        <div className="cars">
          {session.humanIds.map((id) => (
            <CarCard key={id} session={session} car={sim.car(id)} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Everything race control says right now, stacked so nothing sits on top of anything else. */
function RaceControl({ sim, humans }: { sim: RaceSession["sim"]; humans: string[] }) {
  const items: { cls: string; text: string; sub?: string }[] = [];
  const n = sim.neutral;
  if (sim.inc.red.active) items.push({ cls: "red", text: `RED FLAG: ${sim.inc.red.cause.toUpperCase()}` });
  else if (n.active) {
    if (n.kind === "vsc") items.push({ cls: "vsc", text: n.announcedEnd ? "VIRTUAL SAFETY CAR ENDING" : "VIRTUAL SAFETY CAR", sub: n.announcedEnd ? "Be ready to go green" : "Keep to the delta" });
    else items.push({ cls: "sc", text: n.announcedEnd ? "SAFETY CAR IN THIS LAP" : "SAFETY CAR", sub: n.announcedEnd ? "It goes into the pit lane at the end of the lap" : "No overtaking. Pit lane is open" });
  } else if (sim.tick - n.endedTick < 45 && sim.phase === "racing") {
    items.push({ cls: "green", text: n.endedKind === "vsc" ? "VSC ENDED: GREEN FLAG" : "GREEN FLAG", sub: n.endedKind === "sc" ? "No overtaking until the line" : undefined });
  } else if (n.lockLap > 0 && humans.some((id) => sim.car(id).lap < n.lockLap && sim.car(id).status === "racing")) {
    items.push({ cls: "lock", text: "NO OVERTAKING UNTIL THE LINE" });
  }
  if (sim.chequered && sim.phase !== "finished") items.push({ cls: "chq", text: "CHEQUERED FLAG" });
  if (!items.length) return null;
  return (
    <div className="rc-stack" aria-live="polite">
      {items.map((it) => (
        <div key={it.cls} className={`rc-item ${it.cls}`}>
          <b>{it.text}</b>
          {it.sub && <span>{it.sub}</span>}
        </div>
      ))}
    </div>
  );
}

function RaceOverlay({ session, onFinish, donuts }: { session: RaceSession; onFinish: () => void; donuts?: (session: RaceSession) => string[] }) {
  const sim = session.sim;
  const [, bump] = useState(0);
  const finished = sim.phase === "finished";
  // when the flag falls on the last race, the champion and anyone retiring do donuts before the classification
  useEffect(() => {
    if (!finished || session.celebrateDecided) return;
    session.celebrateDecided = true;
    const ids = (donuts?.(session) ?? []).filter((id) => session.sim.car(id).status === "finished");
    session.donutIds = ids;
    if (ids.length === 0) return;
    const t = window.setInterval(() => bump((n) => n + 1), 300);
    window.setTimeout(() => window.clearInterval(t), 3500 + 3200 * Math.min(3, ids.length) + 2000);
    return () => window.clearInterval(t);
  }, [finished, session, donuts]);
  const celebrating = finished && session.donutIds.length > 0 && (session.celebrateFrom === 0 || session.celebrating);
  const since = sim.tick - (sim.lightsAt - LIGHTS_TICKS);
  const lightsOn = sim.phase === "grid" && session.started ? Math.max(0, Math.min(5, Math.floor(since / (LIGHTS_TICKS / 5)) + 1)) : 0;
  const showLights = session.started && (sim.phase === "grid" || (sim.phase === "racing" && sim.tick < sim.lightsAt + 25));
  const a = sim.car(session.humanIds[0]);
  const b = sim.car(session.humanIds[1] ?? session.humanIds[0]);
  return (
    <>
      {session.directing && session.started && session.cameraNote && <div className="dircap"><i>DIRECTOR</i> {session.cameraNote}</div>}
      {!session.started && (
        <div className="finish-overlay grid-intro">
          <h2>ON THE GRID</h2>
          <p>
            You start P{a.startPosition} and P{b.startPosition}. Everyone must use two different dry compounds, so plan a stop.
            <br />
            Space = pause. Keys 1 to 6 = speed. Click a timing row to change camera.
          </p>
          <button className="btn primary big" onClick={() => session.start()}>
            START LIGHTS
          </button>
        </div>
      )}
      {showLights && (
        <div className={`startlights ${sim.phase === "racing" ? "out" : ""}`}>
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className={i < lightsOn ? "on" : ""} />
          ))}
          <b>{sim.phase === "racing" ? "LIGHTS OUT" : "GET READY"}</b>
        </div>
      )}
      <RaceControl sim={sim} humans={session.humanIds} />
      {celebrating && (
        <div className="dircap donut-cap">
          <i>VICTORY LAP</i> {session.donutIds.map((id) => session.sim.car(id).entry.driver.name).join(" and ")} {session.donutIds.length > 1 ? "put on a show" : "puts on a show"}
          <button className="btn tiny" onClick={() => { session.celebrateFrom = 1; session.celebrateMs = 0; bump((n) => n + 1); }}>SKIP</button>
        </div>
      )}
      {finished && !celebrating && (
        <div className="finish-overlay">
          <h2>RACE COMPLETE</h2>
          <button className="btn primary big" onClick={onFinish}>
            VIEW CLASSIFICATION
          </button>
        </div>
      )}
    </>
  );
}

function TimingTower({ session }: { session: RaceSession }) {
  const sim = session.sim;
  const [exact, setExact] = useState(false);
  const L = sim.track.length;
  const leader = sim.order[0];
  return (
    <section className="tower panel">
      <h3>TIMING</h3>
      <ol>
        {sim.order.map((c) => {
          const lapsDown = Math.floor(leader.s / L) - Math.floor(c.s / L);
          let gap = "";
          if (c.status === "dnf") gap = "OUT";
          else if (c.status === "pit_in" || c.status === "pit_stop" || c.status === "pit_out") gap = "PIT";
          else if (c.position === 1) gap = c.status === "finished" ? "WIN" : "LEADER";
          else if (lapsDown >= 1 && c.status !== "finished") gap = `+${lapsDown}L`;
          else gap = exact ? `+${c.gapLeader.toFixed(3)}` : `+${c.gapLeader.toFixed(1)}`;
          if (exact && c.status === "racing" && c.lastLap > 0) gap = fmtLap(c.lastLap);
          const cols = liveSectorColors(c.sectors.color, c.sectors.last, c.sectors.best, sim.bestSector);
          return (
            <li
              key={c.id}
              className={`${c.entry.human ? "mine" : ""} ${session.followId === c.id ? "follow" : ""} ${c.status === "dnf" ? "out" : ""}`}
              style={{ ["--team" as string]: hex(c.entry.team.color) }}
              onClick={() => (session.followId = c.id)}
            >
              <span className="p">{c.position}</span>
              <i className="chip" />
              <span className="code">{c.entry.driver.code}</span>
              <span className="secs">
                {[0, 1, 2].map((i) => (
                  <u key={i} style={{ background: SECTOR_COLORS[cols[i]] }} />
                ))}
              </span>
              <span className="gap">{gap}</span>
              <em className="pen">{c.penalty > 0 ? `+${c.penalty}s` : ""}</em>
              <CompoundBadge c={c.tyre.compound} size={14} />
            </li>
          );
        })}
      </ol>
      <div className="seg tower-mode" title="GAP shows the distance to the leader. EXACT shows each driver's last lap time to the thousandth.">
        <button className={!exact ? "on" : ""} onClick={() => setExact(false)}>GAP TO LEADER</button>
        <button className={exact ? "on" : ""} onClick={() => setExact(true)}>EXACT LAP</button>
      </div>
      <button className={`tiny wide dir ${session.directing ? "on" : ""}`} title="The race director cuts between the action like the TV feed: crashes, passes, battles, pit stops and radio calls." onClick={() => { session.directing = !session.directing; }}>
        {session.directing ? "DIRECTOR CAM: ON" : "DIRECTOR CAM: OFF"}
      </button>
      <button className="tiny wide" onClick={() => (session.followId = leader.id)}>
        CAM: LEADER
      </button>
      <div className="fl">
        FASTEST LAP
        <b>{sim.bestLapCar ? `${sim.car(sim.bestLapCar).entry.driver.code} ${fmtLap(sim.bestLapAll)}` : "--"}</b>
      </div>
    </section>
  );
}

function Meter({ label, value, color, text }: { label: string; value: number; color: string; text?: string }) {
  return (
    <div className="meter">
      <span>{label}</span>
      <div className="mbar">
        <i style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`, background: color }} />
      </div>
      <em>{text ?? `${Math.round(value * 100)}%`}</em>
    </div>
  );
}

function CarCard({ session, car }: { session: RaceSession; car: CarState }) {
  const sim = session.sim;
  const e = car.entry;
  const wear = car.tyre.wear;
  const wearColor = wear < 0.5 ? "#57cc99" : wear < 0.8 ? "#f9c74f" : "#e63946";
  const life = sim.life[car.tyre.compound];
  const trueLeft = Math.max(0, life * (1 - wear));
  // without a tyre study in practice the engineers only know roughly how long the rubber lasts: the estimate is biased and shown as a range
  const know = sim.cfg.intel?.tyre;
  const unsure = know === undefined ? 0 : (1 - know) * 0.32;
  const bias = know === undefined ? 0 : (((car.id.charCodeAt(0) * 7 + car.id.charCodeAt(car.id.length - 1) * 13 + sim.cfg.seed) % 21) - 10) / 10;
  const lapsLeft = Math.max(0, Math.round(trueLeft * (1 + bias * unsure)));
  const lapsPlus = Math.round(life * unsure * 0.6);
  const inPit = car.status === "pit_in" || car.status === "pit_stop" || car.status === "pit_out";
  const canPit = car.status === "racing" && (car.lap + 1 < sim.cfg.laps || sim.inc.red.active) && !car.pitRequest;
  const [swap, setSwap] = useState(false);
  const [pitSet, setPitSet] = useState("");
  const list = sim.setListFor(car);
  const pitAdv = list.length ? advisePit(list, Math.max(1, sim.cfg.laps - car.lap - 1), 1 / Math.max(10, sim.life.M), !!sim.weather && car.wetD > 0.3, car.setId) : undefined;
  const [fuel, setFuel] = useState<"min" | "std" | "full">("std");
  const rl = sim.cfg.rules;
  const boosting = car.boostUntil > sim.tick;
  const defending = car.defendUntil > sim.tick;
  const sets = sim.setsFor(car);
  const mood = sim.radio?.mood(car.id);
  const mate = sim.cars.find((c) => c.entry.human && c.id !== car.id);
  const orders: { o: TeamOrder; label: string; tip: string; needsMate?: boolean }[] = [
    { o: "hold", label: "HOLD POSITION", tip: "Do not attack your team-mate", needsMate: true },
    { o: "letby", label: "LET MATE BY", tip: "Give way to your team-mate", needsMate: true },
    { o: "free", label: "FREE RACE", tip: "Race each other, keep it clean", needsMate: true },
    { o: "pushnow", label: "PUSH NOW", tip: "Four laps flat out" },
    { o: "savetyres", label: "SAVE TYRES", tip: "Four laps of lifting and coasting" },
    { o: "stayout", label: "STAY OUT", tip: "Cancel the stop for now" },
  ];
  const moodWord = (m: number) => (m > 0.7 ? "HAPPY" : m > 0.5 ? "FINE" : m > 0.3 ? "ANNOYED" : "FURIOUS");
  const dead = car.status === "dnf";
  const push: { v: PushLevel; label: string }[] = [
    { v: 0, label: "SAVE" },
    { v: 1, label: "STD" },
    { v: 2, label: "PUSH" },
  ];
  const modes: { v: EnergyMode; label: string }[] = [
    { v: "harvest", label: "HARVEST" },
    { v: "balanced", label: "BALANCE" },
    { v: "attack", label: "ATTACK" },
  ];

  return (
    <section className={`panel carcard ${dead ? "dead" : ""}`} style={{ ["--team" as string]: hex(e.team.color) }}>
      <div className="ch">
        <DriverPortrait code={e.driver.code} teamColor={hex(e.team.color)} seed={e.driver.id} size={56} mood={dead ? "gone" : mood ? (mood.grievance > 0.55 ? "angry" : mood.morale > 0.7 ? "happy" : mood.morale < 0.4 ? "tense" : "ok") : "ok"} />
        <div>
          <b>
            #{e.driver.number} <PLink kind="driver" id={e.driver.id}>{e.driver.name}</PLink>
          </b>
          <span className="dim">{e.team.name}</span>
        </div>
        <div className="posbig">P{car.position}</div>
      </div>

      {dead ? (
        <p className="warn">RETIRED: {car.dnfReason}</p>
      ) : (
        <>
          <div className={`rule ${sim.ruleDone(car) ? "ok" : "todo"}`}>
            {sim.ruleDone(car) ? "TWO COMPOUNDS DONE" : "MUST USE A 2ND COMPOUND"}
            {car.penalty > 0 && <b> | PENALTY +{car.penalty}s</b>}
          </div>
          <div className="tyre-row">
            <CompoundBadge c={car.tyre.compound} size={26} />
            <Meter label="TYRE" value={1 - wear} color={wearColor} text={lapsPlus >= 1 ? `~${lapsLeft}L \u00b1${lapsPlus}` : `${lapsLeft}L`} />
          </div>
          <Meter label="FUEL" value={car.fuel} color={car.fuel < 0.04 ? "#e63946" : "#4cc9f0"} text={`${(car.fuel * FUEL_KG).toFixed(1)} kg`} />
          <Meter label="BATT" value={car.soc} color="#ff7a1a" />
          {(() => {
            const mine = sim.stopLog.filter((r) => r.carId === car.id);
            if (!mine.length) return null;
            const last = mine[mine.length - 1];
            const best = Math.min(...mine.map((r) => r.secs));
            return <div className="damage"><span>LAST STOP <b>{last.secs.toFixed(1)}s</b></span><span>BEST <b>{best.toFixed(1)}s</b></span><span>STOPS <b>{mine.length}</b></span></div>;
          })()}
          <div className="laps">
            <span>
              LAST <b>{fmtLap(car.lastLap)}</b>
            </span>
            <span>
              BEST <b>{fmtLap(car.bestLap)}</b>
            </span>
          </div>

          <div className="ctl">
            <span>PACE</span>
            <div className="seg">
              {push.map((p) => (
                <button key={p.v} className={car.push === p.v ? "on" : ""} onClick={() => sim.command({ type: "push", carId: car.id, push: p.v })}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="ctl">
            <span>ENERGY</span>
            <div className="seg">
              {modes.map((m) => (
                <button key={m.v} className={car.mode === m.v ? "on" : ""} onClick={() => sim.command({ type: "mode", carId: car.id, mode: m.v })}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {(rl?.pushToPass || rl?.defenceTokens) && (
            <div className="ctl">
              <span>RULES</span>
              <div className="seg">
                {rl?.pushToPass ? (
                  <button className={boosting ? "on" : ""} disabled={car.boostLeft <= 0 || boosting || car.status !== "racing"} title="Push to pass: about 12 seconds of extra power" onClick={() => sim.command({ type: "boost", carId: car.id })}>
                    {boosting ? "BOOSTING" : `BOOST (${car.boostLeft})`}
                  </button>
                ) : null}
                {rl?.defenceTokens ? (
                  <button className={defending ? "on" : ""} disabled={car.defendLeft <= 0 || defending || car.status !== "racing"} title="Defend hard for about 15 seconds. Costs a little pace." onClick={() => sim.command({ type: "defend", carId: car.id })}>
                    {defending ? "DEFENDING" : `DEFEND (${car.defendLeft})`}
                  </button>
                ) : null}
              </div>
            </div>
          )}
          {(rl?.refuelling || rl?.stopWindow || rl?.radioQuota !== undefined || sets) && (
            <div className="damage">
              {rl?.refuelling && <span>FUEL <b>{(car.fuel * FUEL_KG).toFixed(1)} kg</b></span>}
              {rl?.stopWindow && <span>WINDOW <b>L{rl.stopWindow[0]}-{rl.stopWindow[1]}</b></span>}
              {rl?.radioQuota !== undefined && <span>RADIO <b>{car.radioLeft}</b> left</span>}
              {sets && !list.length && (
                <div className="setsrow">
                  <em>FRESH SETS</em>
                  {(["S", "M", "H", "I", "W"] as const).filter((k) => sets[k] !== undefined).map((k) => (
                    <b key={k} className="setchip" style={{ color: hex(COMPOUNDS[k].color), borderColor: hex(COMPOUNDS[k].color) }}>
                      <i>{k}</i>
                      {sets[k] ?? 0}
                    </b>
                  ))}
                </div>
              )}
            </div>
          )}
          {(rl?.batterySwap || rl?.refuelling) && !car.pitRequest && !inPit && (
            <div className="ctl">
              <span>STOP</span>
              <div className="seg">
                {rl?.batterySwap && <button className={swap ? "on" : ""} onClick={() => setSwap(!swap)} title="Swap the battery at the next stop: +1.8 s, full charge">SWAP BATTERY</button>}
                {rl?.refuelling && (["min", "std", "full"] as const).map((f) => <button key={f} className={fuel === f ? "on" : ""} onClick={() => setFuel(f)} title="How much fuel to take on at the next stop">{f === "min" ? "FUEL LEAN" : f === "std" ? "FUEL STD" : "FUEL FULL"}</button>)}
              </div>
            </div>
          )}
          <div className="ctl pit">
            <span>PIT</span>
            {inPit ? (
              <div className="pitstate">{car.status === "pit_stop" ? "STOPPED: CHANGING TYRES" : "IN THE PIT LANE"}</div>
            ) : car.pitRequest ? (
              <div className="pitplan">
                <b>
                  BOX BOX: <CompoundBadge c={car.pitRequest} size={16} /> {COMPOUNDS[car.pitRequest].name.toUpperCase()}
                </b>
                <button className="tiny" onClick={() => sim.command({ type: "cancelPit", carId: car.id })}>
                  CANCEL
                </button>
              </div>
            ) : (
              list.length ? (
                <div className="pitpick">
                  <SetPicker sets={list} value={pitSet} onChange={setPitSet} advice={pitAdv?.set?.id} fitted={car.setId} live={car.setId ? { id: car.setId, wear: car.tyre.wear } : undefined} lockFitted />
                  {pitAdv?.why && <small className="dim">{pitAdv.why}</small>}
                  <button className="btn" disabled={!canPit} onClick={() => {
                    const x = list.find((y) => y.id === pitSet) ?? pitAdv?.set ?? bestSet(list, car.tyre.compound, car.setId);
                    if (x) sim.command({ type: "pit", carId: car.id, compound: x.compound, setId: x.id, swap, fuel });
                  }}>BOX FOR {pitSet || pitAdv?.set?.id || "AUTO"}</button>
                </div>
              ) : (
              <div className="seg five">
                {(["S", "M", "H", "I", "W"] as Compound[]).map((c) => (
                  <button key={c} disabled={!canPit} className={sets && (sets[c] ?? 1) <= 0 ? "used" : ""} title={sets && (sets[c] ?? 1) <= 0 ? `No fresh ${COMPOUNDS[c].name}s left: a used set goes on` : `Box for ${COMPOUNDS[c].name}${sets && sets[c] !== undefined ? ` (${sets[c]} fresh left)` : ""}`} onClick={() => sim.command({ type: "pit", carId: car.id, compound: c, swap, fuel })}>
                    <CompoundBadge c={c} size={16} />
                    {sets && sets[c] !== undefined && <small>{sets[c] <= 0 ? "used" : sets[c]}</small>}
                  </button>
                ))}
              </div>
              )
            )}
          </div>
          {(car.damage.aero > 0.03 || car.damage.floor > 0.03 || car.damage.flat > 0.03 || car.damage.puncture) && (
            <div className="damage">
              <b>DAMAGE</b>
              {car.damage.puncture && <span className="bad">PUNCTURE</span>}
              {car.damage.aero > 0.03 && <span>AERO {Math.round(car.damage.aero * 100)}%</span>}
              {car.damage.floor > 0.03 && <span>FLOOR {Math.round(car.damage.floor * 100)}%</span>}
              {car.damage.flat > 0.03 && <span>FLAT SPOT {Math.round(car.damage.flat * 100)}%</span>}
            </div>
          )}
          {sim.weather && (
            <div className={`surface w${Math.min(4, Math.floor(car.wetD * 5))}`}>
              UNDER THE WHEELS: <b>{car.wetD < 0.06 ? "DRY" : car.wetD < 0.22 ? "DAMP" : car.wetD < 0.45 ? "WET" : car.wetD < 0.75 ? "VERY WET" : "STANDING WATER"}</b>
            </div>
          )}
          {mood && (
            <div className="mood">
              <div className="ctl">
                <span>MOOD</span>
                <div className="mbar">
                  <i style={{ width: `${Math.round(mood.morale * 100)}%`, background: mood.morale > 0.5 ? "#57cc99" : mood.morale > 0.3 ? "#f9c74f" : "#e63946" }} />
                </div>
                <em>{moodWord(mood.morale)}</em>
              </div>
              <div className="ctl">
                <span>TRUST</span>
                <div className="mbar">
                  <i style={{ width: `${Math.round(mood.trust * 100)}%`, background: "#4cc9f0" }} />
                </div>
                <em>{Math.round(mood.trust * 100)}%</em>
              </div>
              {mood.grievance > 0.15 && (
                <div className="ctl">
                  <span>GRUDGE</span>
                  <div className="mbar">
                    <i style={{ width: `${Math.round(mood.grievance * 100)}%`, background: "#ff7a1a" }} />
                  </div>
                  <em>{mood.grievance > 0.55 ? "BOILING" : "SIMMERING"}</em>
                </div>
              )}
            </div>
          )}
          <div className="orders">
            <span>TEAM ORDERS</span>
            <div className="oBtns">
              {orders.map((o) => (
                <button key={o.o} title={o.tip} disabled={o.needsMate && (!mate || mate.status === "dnf")} onClick={() => sim.command({ type: "order", carId: car.id, order: o.o })}>
                  {o.label}
                </button>
              ))}
              <button title="Send a fake pit call on the open radio. Rivals may cover it." onClick={() => sim.command({ type: "dummy", carId: car.id })}>
                DECOY CALL
              </button>
            </div>
          </div>
          <button className="tiny wide" onClick={() => (session.followId = car.id)}>
            CAM: {e.driver.code}
          </button>
        </>
      )}
    </section>
  );
}

export function Minimap({ session }: { session: LiveSession<LiveSim> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const t = session.sim.track;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < t.n; i++) {
      minX = Math.min(minX, t.x[i]);
      maxX = Math.max(maxX, t.x[i]);
      minY = Math.min(minY, t.y[i]);
      maxY = Math.max(maxY, t.y[i]);
    }
    const W = canvas.width;
    const H = canvas.height;
    const pad = 8;
    const k = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxY - minY));
    const ox = (W - (maxX - minX) * k) / 2 - minX * k;
    const oy = (H - (maxY - minY) * k) / 2 - minY * k;
    const path = new Path2D();
    for (let i = 0; i < t.n; i += 2) {
      const x = t.x[i] * k + ox;
      const y = t.y[i] * k + oy;
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    path.closePath();
    let raf = 0;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#0b0814";
      ctx.lineWidth = 6;
      ctx.stroke(path);
      ctx.strokeStyle = "#8a7fb8";
      ctx.lineWidth = 3;
      ctx.stroke(path);
      for (const c of session.sim.cars) {
        if (c.status === "dnf") continue;
        const i = Math.floor(((((c.s % t.length) + t.length) % t.length) / t.ds) % t.n);
        const x = t.x[i] * k + ox;
        const y = t.y[i] * k + oy;
        ctx.fillStyle = hex(c.entry.team.color);
        const r = c.entry.human ? 4 : 3;
        ctx.fillRect(Math.round(x - r / 2), Math.round(y - r / 2), r, r);
        if (c.id === session.followId) {
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1;
          ctx.strokeRect(Math.round(x - 4), Math.round(y - 4), 8, 8);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [session]);
  return <canvas className="minimap" ref={ref} width={200} height={110} />;
}
