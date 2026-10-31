import type { TyreSet } from "../sim/tyreSets";
import { useMusic } from "../audio/useMusic";
import { useMemo, useState } from "react";
import type { Weekend } from "../game/setup";
import { COMPOUNDS, fmtLap, tyreLifeFor } from "../sim/engine";
import type { QualiRow } from "../sim/qualifying";
import type { Compound } from "../sim/types";
import { raceWeather } from "../game/setup";
import { makeWeather } from "../sim/weather";
import { makeProfile, TeamRadar, intensityWord } from "../sim/radar";
import { BRAINS, DEFAULT_BRAIN } from "../sim/strategy";
import { NO_ORDERS, type StandingOrders } from "../sim/standing";
import { PitWall } from "./PitWall";

const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

export function CompoundBadge({ c, size = 22 }: { c: Compound; size?: number }) {
  return (
    <span className="tyre-badge" style={{ background: hex(COMPOUNDS[c].color), width: size, height: size, fontSize: size * 0.5 }}>
      {c}
    </span>
  );
}

export function Briefing({
  weekend,
  quali,
  onBack,
  onStart,
  locks,
  sets,
  setLists,
  pitLane,
  extraRules,
  title,
}: {
  weekend: Weekend;
  /** The session's own heading, for example a sprint instead of the Grand Prix. */
  title?: string;
  quali: QualiRow[];
  onBack: () => void;
  onStart: (tyres: Record<string, Compound>, startSets?: Record<string, string>, standing?: Record<string, StandingOrders>, gamble?: "safe" | "undercut" | "long") => void;
  /** Career: the physical sets each car can start on (keyed by driver, or by team when the pool rule is on). */
  setLists?: Record<string, TyreSet[]>;
  /** Career: start tyres fixed by the qualifying lock rule. */
  locks?: Record<string, Compound>;
  /** Career: fresh sets left per car (or per team when the pool rule is on). */
  sets?: Record<string, Partial<Record<Compound, number>>>;
  /** Career: both cars start from the pit lane. */
  pitLane?: boolean;
  /** Career: extra rule lines for this race. */
  extraRules?: string[];
}) {
  useMusic("garage");
  const [view, setView] = useState<"grid" | "wall">("grid");
  const [gamble, setGamble] = useState<"safe" | "undercut" | "long">("safe");
  const [startSets, setStartSets] = useState<Record<string, string>>({});
  const [orders, setOrders] = useState<Record<string, StandingOrders>>(() => Object.fromEntries(weekend.humanIds.map((id) => [id, NO_ORDERS])));
  const [tyres, setTyres] = useState<Record<string, Compound>>(() => Object.fromEntries(weekend.humanIds.map((id) => [id, (locks?.[id] ?? "M") as Compound])));
  const byId = new Map(weekend.entries.map((e) => [e.id, e]));
  const finite = quali.map((q) => q.time).filter((x) => isFinite(x));
  const pole = finite.length ? Math.min(...finite) : NaN;
  const laps = weekend.laps;
  const life = tyreLifeFor(laps, weekend.meta.tyreSeverity);
  const spec = raceWeather(weekend.settings);
  const radar = useMemo(() => {
    if (spec.mode === "off") return null;
    const w = makeWeather(spec, laps * 120);
    const brain = BRAINS[weekend.settings.teamId] ?? DEFAULT_BRAIN;
    return new TeamRadar(w, makeProfile(weekend.settings.teamId, brain.skill, weekend.settings.seed));
  }, [spec.seed, spec.mode, laps, weekend.settings.teamId, weekend.settings.seed]);
  const rainNow = radar ? radar.rain(0, 0) : 0;
  const rain15 = radar ? radar.rain(0, 900) : 0;
  const rain30 = radar ? radar.rain(0, 1800) : 0;
  const eta = radar ? radar.eta(0) : null;
  const mins = (x: number) => Math.max(1, Math.round(x / 60));
  const rivals = weekend.entries.filter((e) => !e.human).map((e) => e.team).filter((t, i, a) => a.findIndex((x) => x.id === t.id) === i);
  const segName = (q: QualiRow) => (q.dnq ? "107%" : q.out === 0 ? "Q3" : `Q${q.out}`);

  if (view === "wall") {
    const humans = weekend.humanIds.map((id) => byId.get(id)!).filter(Boolean);
    const rainStrip = Array.from({ length: 12 }, (_, i) => (radar ? radar.rain(0, (i / 11) * laps * 85) : 0));
    return (
      <PitWall
        entries={humans.map((e) => ({ id: e.id, code: e.driver.code, name: e.driver.name, number: e.driver.number, color: e.team.color }))}
        pos={Object.fromEntries(quali.map((q) => [q.carId, q.position]))}
        laps={laps}
        life={life}
        tyres={tyres}
        setTyres={setTyres}
        orders={orders}
        setOrders={setOrders}
        gamble={gamble}
        setGamble={setGamble}
        locks={locks}
        sets={sets ? Object.fromEntries(weekend.humanIds.map((id) => [id, sets[weekend.entries.find((x) => x.id === id)?.team.id ?? ""] ?? sets[id] ?? {}])) : undefined}
        setLists={setLists ? Object.fromEntries(weekend.humanIds.map((id) => [id, setLists[id] ?? setLists[weekend.entries.find((x) => x.id === id)?.team.id ?? ""] ?? []])) : undefined}
        startSets={startSets}
        setStartSets={setStartSets}
        rain={rainStrip}
        rainWords={radar ? `rain now: ${intensityWord(rainNow)}` : "dry weekend"}
        pitLane={pitLane}
        rules={extraRules ?? []}
        rivals={rivals.map((t) => ({ id: t.id, short: t.short, color: t.color, style: (BRAINS[t.id] ?? DEFAULT_BRAIN).style, blurb: (BRAINS[t.id] ?? DEFAULT_BRAIN).blurb }))}
        onBack={() => setView("grid")}
        onGo={() => onStart(tyres, startSets, orders, gamble)}
      />
    );
  }

  return (
    <div className="screen briefing">
      <header className="topline">
        <button className="tiny" onClick={onBack}>
          {"< PADDOCK"}
        </button>
        <h2>STARTING GRID</h2>
        <span className="dim">
          {title ?? weekend.meta.gp} | {laps} laps
        </span>
      </header>

      <div className="brief-grid">
        <section className="panel">
          <h3>QUALIFYING RESULT</h3>
          <table className="grid-table">
            <tbody>
              {quali.map((q, i) => {
                const e = byId.get(q.carId)!;
                return (
                  <tr key={q.carId} className={e.human ? "mine" : ""} style={{ ["--team" as string]: hex(e.team.color), animationDelay: `${(quali.length - 1 - i) * 70}ms` }}>
                    <td className="pos">P{q.position}</td>
                    <td>
                      <i className="chip" />
                    </td>
                    <td className="code">{e.driver.code}</td>
                    <td className="tm">{e.team.short}</td>
                    <td className="time">{isFinite(q.time) ? fmtLap(q.time) : "NO TIME"}</td>
                    <td className="gap">{isFinite(q.time) && q.time === pole ? "POLE" : isFinite(q.time) ? `+${(q.time - pole).toFixed(3)}` : ""}</td>
                    <td className="note">
                      {segName(q)}
                      {q.gridPenalty > 0 ? ` | -${q.gridPenalty} PEN` : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>


        <section className="panel versus">
          <h3>VERSUS</h3>
          {weekend.humanIds.map((id) => {
            const i = quali.findIndex((x) => x.carId === id);
            const me = byId.get(id)!;
            const ahead = quali[i - 1] ? byId.get(quali[i - 1].carId) : undefined;
            const behind = quali[i + 1] ? byId.get(quali[i + 1].carId) : undefined;
            return (
              <div key={id} className="vs-row">
                <span className="vs-side">{ahead ? `${ahead.driver.code} (${ahead.team.short})` : "OPEN ROAD"}</span>
                <b className="vs-me" style={{ color: hex(me.team.color) }}>{me.driver.code} P{i + 1}</b>
                <span className="vs-side">{behind ? `${behind.driver.code} (${behind.team.short})` : "LAST"}</span>
              </div>
            );
          })}
          <p className="dim small">Ahead is who you hunt. Behind is who hunts you.</p>
        </section>

        <section className="panel">
          <h3>THE FORECAST <small className="dim">(your radar, not the truth)</small></h3>
          <div className="forecast">
            {radar ? (
              <p>
                Now: <b>{intensityWord(rainNow)}</b>. In 15 min: <b>{intensityWord(rain15)}</b>. In 30 min: <b>{intensityWord(rain30)}</b>.{" "}
                {eta && eta.kind === "arrives" && <>Rain looks due in about {mins(eta.sec)} min.</>}
                {eta && eta.kind === "clears" && <>It should ease in about {mins(eta.sec)} min.</>}
                {eta && eta.kind === "steady" && <>Nothing big on the picture.</>}
              </p>
            ) : (
              <p className="dim">Weather is switched off. Dry all weekend.</p>
            )}
          </div>
          <p>Tyres last about <b>Soft {Math.round(life.S)}</b>, <b>Medium {Math.round(life.M)}</b>, <b>Hard {Math.round(life.H)}</b> laps at standard pace. The race is {laps} laps.</p>
          <button className="btn primary big" onClick={() => setView("wall")}>TO THE PIT WALL</button>
        </section>
      </div>
    </div>
  );
}
