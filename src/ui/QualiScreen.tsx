import { DriverPortrait } from "./pixel/portraits";
import { QualiKindCtx, sessionTitle, useQPrefix, useQualiName } from "./sessionTitle";
import { SkipPrompt, type NetSkip } from "./SkipPrompt";
import { useMusic } from "../audio/useMusic";
import { useEffect, useState } from "react";
import { PLink } from "./career/Profile";
import type { QualiSession } from "../game/qsession";
import type { SpeedSetting } from "../game/live";
import type { CircuitMeta } from "../game/circuits";
import { QUALI_SETS, type QCar } from "../sim/qualifying";
import { COMPOUNDS, fmtLap } from "../sim/engine";
import type { Compound } from "../sim/types";
import { RaceView } from "../render/RaceView";
import { CompoundBadge } from "./Briefing";
import { Minimap, RadioFeed, SECTOR_COLORS, fmtClock, hex } from "./RaceScreen";
import { SectorsView } from "./SectorTable";
import { RadarPanel, WeatherChip } from "./WeatherPanel";
import { useUiTick } from "./hooks";
import { TimingBar } from "./TimingBar";
import { liveSectorColors } from "./sectorRows";
import { RaceAudio } from "../audio/raceAudio";

const SPEED_LIST: { v: SpeedSetting; label: string }[] = [
  { v: 0, label: "||" },
  { v: 1, label: "1x" },
  { v: 2, label: "2x" },
  { v: 4, label: "4x" },
  { v: 8, label: "8x" },
  { v: 16, label: "16x" },
  { v: 32, label: "32x" },
];

const PHASE_LABEL: Record<QCar["phase"], string> = {
  garage: "GARAGE",
  queue: "PIT EXIT",
  out: "OUT LAP",
  push: "FLYING",
  in: "IN LAP",
  entering: "PIT IN",
  crashed: "CRASHED",
};

function fmtTime(t: number) {
  return isFinite(t) ? fmtLap(t) : "--:--.---";
}

type QTab = "radio" | "sectors" | "radar";

export function QualiScreen(props: { session: QualiSession; meta: CircuitMeta; onDone: () => void; skip?: NetSkip; kind?: "quali" | "sq" }) {
  return (
    <QualiKindCtx.Provider value={props.kind ?? "quali"}>
      <QualiScreenInner {...props} />
    </QualiKindCtx.Provider>
  );
}

function QualiScreenInner({ session, meta, onDone, skip, kind }: { session: QualiSession; meta: CircuitMeta; onDone: () => void; skip?: NetSkip; kind?: "quali" | "sq" }) {
  const QP = useQPrefix();
  const QN = useQualiName();
  useMusic("quali");
  // the sound of the car on camera, the crowd and the weather, same as in the race
  useEffect(() => {
    const audio = new RaceAudio(session);
    const id = window.setInterval(() => audio.update(), 90);
    return () => {
      window.clearInterval(id);
      audio.stop();
    };
  }, [session]);
  useUiTick(120);
  const sim = session.sim;
  const [tab, setTab] = useState<QTab>("radio");
  const [secMode, setSecMode] = useState<"last" | "best">("last");
  const teamId = sim.car(session.humanIds[0]).entry.team.id;

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
        session.speed = session.speed === 0 ? 8 : 0;
      }
      const map: Record<string, SpeedSetting> = { "1": 1, "2": 2, "3": 4, "4": 8, "5": 16, "6": 32 };
      if (map[e.key]) session.speed = map[e.key];
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session]);

  const flag = sim.red.active ? "RED FLAG" : sim.chequered && sim.phase === "running" ? "CHEQUERED" : sim.phase === "running" ? "GREEN" : "PIT LANE CLOSED";
  const flagClass = sim.red.active ? "red" : sim.chequered ? "chq" : sim.phase === "running" ? "green" : "sc";

  return (
    <div className="screen race">
      <header className="racebar">
        <div className="logo-sm">
          BOX<span>BOX</span>
        </div>
        <div className="lapcount">
          <b>{QP}{sim.segment}</b> {QN}
        </div>
        <div className="clock big">{fmtClock(sim.clock)}</div>
        <div className="gpname">{sessionTitle(meta.gp, kind ?? "quali").toUpperCase()}</div>
        <WeatherChip session={session} />
        <div className={`flag ${flagClass}`}>{flag}</div>
        <div className="speeds">
          {SPEED_LIST.map((s) => (
            <button key={s.v} className={session.speed === s.v ? "on" : ""} onClick={() => (session.speed = s.v)}>
              {s.label}
            </button>
          ))}
        </div>
      </header>
      <SkipPrompt session={session} net={skip} />

      <div className="race-grid">
        <QualiBoard session={session} />
        <div className="center">
          <div className="viewbox">
            <RaceView session={session} meta={meta}>
              <QualiOverlay session={session} onDone={onDone} />
            </RaceView>
            <Minimap session={session} />
            {sim.phase !== "ready" && sim.phase !== "break" && sim.phase !== "done" && <TimingBar session={session} />}
          </div>
          <div className="btabs">
            {(["radio", "sectors", "radar"] as QTab[]).map((t) => (
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
            <QualiCard key={id} session={session} car={sim.car(id)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function QualiOverlay({ session, onDone }: { session: QualiSession; onDone: () => void }) {
  const QP = useQPrefix();
  const QN = useQualiName();
  const sim = session.sim;
  const net = !!(session as { net?: boolean }).net;
  const cut = sim.keepers[sim.segment - 1];
  const out = sim.cars.length - cut;
  const eliminated = sim.segmentOrder[sim.segment - 1] ?? [];
  const names = sim.cars.filter((c) => c.eliminatedIn === sim.segment).sort((a, b) => a.position - b.position);

  if (sim.phase === "ready") {
    return (
      <div className="finish-overlay grid-intro">
        <h2>{QP}{sim.segment}</h2>
        <p>
          {sim.minutes[sim.segment - 1]} minutes.{" "}
          {sim.segment < 3 ? `The slowest ${sim.segment === 1 ? out : sim.active.length - cut} drivers are out at the end.` : "Ten drivers fight for pole position."}
          <br />
          Send your cars out from the panel on the right, or let the team run them. A lap only counts if it starts before the chequered flag.
        </p>
        {net ? <p className="dim">The league starts every segment together.</p> : (
          <button className="btn primary big" onClick={() => session.startSegment()}>
            START {QP}{sim.segment}
          </button>
        )}
      </div>
    );
  }
  if (sim.phase === "break") {
    return (
      <div className="finish-overlay">
        <h2>{QP}{sim.segment} COMPLETE</h2>
        {names.length > 0 && (
          <p className="elim">
            Eliminated: {names.map((c) => `P${c.position} ${c.entry.driver.code}`).join(", ")}
          </p>
        )}
        {net ? <p className="dim">{QP}{sim.segment + 1} starts in a moment.</p> : (
          <button className="btn primary big" onClick={() => session.nextSegment()}>
            ON TO {QP}{sim.segment + 1}
          </button>
        )}
      </div>
    );
  }
  if (sim.phase === "done") {
    return (
      <div className="finish-overlay">
        <h2>{QN} COMPLETE</h2>
        <p className="elim">Pole: {sim.order[0].entry.driver.name}</p>
        <button className="btn primary big" onClick={onDone}>
          VIEW THE GRID
        </button>
      </div>
    );
  }
  void eliminated;
  return (
    <>
      {sim.red.active && <div className="banner red">RED FLAG</div>}
      {sim.chequered && !sim.red.active && <div className="banner chq">CHEQUERED FLAG</div>}
    </>
  );
}

function QualiBoard({ session }: { session: QualiSession }) {
  const QP = useQPrefix();
  const sim = session.sim;
  const [exact, setExact] = useState(false);
  const seg = sim.segment - 1;
  const cut = sim.keepers[seg];
  const rows = sim.order;
  const lead = rows[0]?.best[seg] ?? Infinity;
  return (
    <section className="tower panel qboard">
      <h3>{QP}{sim.segment} TIMING</h3>
      <ol>
        {rows.map((c, i) => {
          const out = c.eliminatedIn !== 0 && c.eliminatedIn < sim.segment;
          const t = out ? c.best[c.eliminatedIn - 1] : c.best[seg];
          const gap = i === 0 || !isFinite(t) || !isFinite(lead) ? "" : `+${(t - lead).toFixed(3)}`;
          const showCut = sim.phase !== "done" && !out && sim.segment < 3 && i === cut - 1;
          return (
            <li
              key={c.id}
              className={`${c.entry.human ? "mine" : ""} ${session.followId === c.id ? "follow" : ""} ${out ? "out" : ""} ${showCut ? "cutline" : ""}`}
              style={{ ["--team" as string]: hex(c.entry.team.color) }}
              onClick={() => (session.followId = c.id)}
            >
              <span className="p">{i + 1}</span>
              <i className="chip" />
              <span className="code">{c.entry.driver.code}</span>
              <span className="secs">
                {[0, 1, 2].map((k) => (
                  <u key={k} style={{ background: SECTOR_COLORS[liveSectorColors(c.sectors.color, c.sectors.last, c.sectors.best, sim.bestSector)[k]] }} />
                ))}
              </span>
              <span className="gap">{isFinite(t) && (i === 0 || exact) ? fmtTime(t) : gap || (out ? `${QP}${c.eliminatedIn}` : PHASE_LABEL[c.phase])}</span>
              <CompoundBadge c={c.compound} size={14} />
            </li>
          );
        })}
      </ol>
      <div className="seg tower-mode" title="GAP shows the distance to the fastest time. EXACT shows every driver's own best lap time to the thousandth.">
        <button className={!exact ? "on" : ""} onClick={() => setExact(false)}>GAP TO LEADER</button>
        <button className={exact ? "on" : ""} onClick={() => setExact(true)}>EXACT TIMES</button>
      </div>
    </section>
  );
}

function QualiCard({ session, car }: { session: QualiSession; car: QCar }) {
  const QP = useQPrefix();
  const sim = session.sim;
  const e = car.entry;
  const seg = sim.segment - 1;
  const [compound, setCompound] = useState<Compound>("S");
  const [fresh, setFresh] = useState(true);
  const [laps, setLaps] = useState<1 | 2>(1);
  const out = car.eliminatedIn !== 0 && car.eliminatedIn < sim.segment;
  const live = sim.phase === "running" && !sim.chequered && !sim.red.active;
  const left = car.sets[compound];
  const fitted = car.compound === compound;
  const canNew = left > 0;
  const canUsed = fitted;
  const wantNew = fresh || !canUsed;
  const ready = live && car.phase === "garage" && sim.tick >= car.readyTick && !out;
  const choiceOk = wantNew ? canNew : canUsed;
  const canGo = ready && choiceOk;
  const why = !ready ? "" : wantNew && !canNew ? `No new ${COMPOUNDS[compound].name} sets left. Pick another tyre${canUsed ? " or USED" : ""}.` : false ? `USED only works on the tyre already fitted (${COMPOUNDS[car.compound].name}). A different compound always needs a NEW set.` : "";

  return (
    <section className={`panel carcard ${out ? "dead" : ""}`} style={{ ["--team" as string]: hex(e.team.color) }}>
      <div className="ch">
        <DriverPortrait code={e.driver.code} teamColor={hex(e.team.color)} seed={e.driver.id} size={56} mood={out ? "gone" : "ok"} />
        <div>
          <b>
            #{e.driver.number} <PLink kind="driver" id={e.driver.id}>{e.driver.name}</PLink>
          </b>
          <span className="dim">{e.team.name}</span>
        </div>
        <div className="posbig">P{car.position}</div>
      </div>

      {out ? (
        <p className="warn">Out in {QP}{car.eliminatedIn}. Starts P{car.position}.</p>
      ) : (
        <>
          <div className="qstate">
            <b className={`ph ${car.phase}`}>{PHASE_LABEL[car.phase]}</b>
            <span>
              BEST <b>{fmtTime(car.best[seg])}</b>
            </span>
            <span>
              LAST <b>{car.lastLap ? `${fmtTime(car.lastLap)}${car.lastValid ? "" : " DELETED"}` : "--"}</b>
            </span>
          </div>
          <div className="sets">
            {(["S", "M", "H", "I", "W"] as Compound[]).map((c) => (
              <span key={c} title={`${COMPOUNDS[c].name} sets left`}>
                <CompoundBadge c={c} size={16} /> x{car.sets[c]}/{QUALI_SETS[c]}
              </span>
            ))}
          </div>
          <div className="ctl">
            <span>TYRE</span>
            <div className="seg five">
              {(["S", "M", "H", "I", "W"] as Compound[]).map((c) => (
                <button key={c} className={compound === c ? "on" : ""} onClick={() => setCompound(c)}>
                  <CompoundBadge c={c} size={16} />
                </button>
              ))}
            </div>
          </div>
          <div className="ctl">
            <span>SET</span>
            <div className="seg">
              <button className={wantNew ? "on" : ""} disabled={!canNew} title="A fresh set: full grip, uses up one of your sets" onClick={() => setFresh(true)}>
                {canNew ? `NEW x${left}` : "NONE LEFT"}
              </button>
              <button className={!wantNew ? "on" : ""} disabled={!canUsed} title="Reuse the set already on the car, with the wear it has" onClick={() => setFresh(false)}>
                {canUsed ? `USED ${Math.round(car.wear * 100)}% worn` : "USED n/a"}
              </button>
            </div>
          </div>
          <div className="ctl">
            <span>LAPS</span>
            <div className="seg">
              <button className={laps === 1 ? "on" : ""} onClick={() => setLaps(1)}>
                1 FLYING
              </button>
              <button className={laps === 2 ? "on" : ""} onClick={() => setLaps(2)}>
                2 FLYING
              </button>
            </div>
          </div>
          <div className="ctl pit">
            <span>RUN</span>
            <div className="seg">
              <button disabled={!canGo || car.auto} onClick={() => sim.command({ type: "go", carId: car.id, compound, fresh: wantNew, laps })}>
                GO OUT
              </button>
              <button disabled={car.phase !== "push" && car.phase !== "out"} onClick={() => sim.command({ type: "box", carId: car.id })}>
                BOX
              </button>
              <button className={car.auto ? "on" : ""} onClick={() => sim.command({ type: "auto", carId: car.id, auto: !car.auto })}>
                TEAM RUNS
              </button>
            </div>
          </div>
          {why && <p className="warn small">{why}</p>}
          {car.note && <p className="hint">{car.note}</p>}
          <button className="tiny wide" onClick={() => (session.followId = car.id)}>
            CAM: {e.driver.code}
          </button>
        </>
      )}
    </section>
  );
}
