import { SetPicker } from "./SetPicker";
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
  onStart: (tyres: Record<string, Compound>, startSets?: Record<string, string>) => void;
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
  const [startSets, setStartSets] = useState<Record<string, string>>({});
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
                  <tr key={q.carId} className={e.human ? "mine" : ""} style={{ ["--team" as string]: hex(e.team.color), animationDelay: `${i * 40}ms` }}>
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

        <section className="panel">
          <h3>YOUR STRATEGY</h3>
          <p className="dim">
            Tyre life at standard pace here, roughly: <b>Soft {Math.round(life.S)} laps</b>, <b>Medium {Math.round(life.M)}</b>, <b>Hard {Math.round(life.H)}</b>. Push harder and they die sooner. A stop costs about 21 seconds.
          </p>
          <div className="forecast">
            <h4>FORECAST (YOUR RADAR, NOT THE TRUTH)</h4>
            {radar ? (
              <p>
                Now: <b>{intensityWord(rainNow)}</b>. In 15 min: <b>{intensityWord(rain15)}</b>. In 30 min: <b>{intensityWord(rain30)}</b>.{" "}
                {eta && eta.kind === "arrives" && <>Rain looks due in about {mins(eta.sec)} min.</>}
                {eta && eta.kind === "clears" && <>It should ease in about {mins(eta.sec)} min.</>}
                {eta && eta.kind === "steady" && <>Nothing big on the picture.</>} Other teams read the same sky differently. Watch the sectors and the rivals' tyres.
              </p>
            ) : (
              <p className="dim">Weather is switched off. Dry all weekend.</p>
            )}
          </div>
          {weekend.humanIds.map((id) => {
            const e = byId.get(id)!;
            const q = quali.find((x) => x.carId === id)!;
            const wetTyre = tyres[id] === "I" || tyres[id] === "W";
            const l = wetTyre ? Infinity : life[tyres[id] as "S" | "M" | "H"];
            const needsStop = l * 1.05 < laps;
            return (
              <div className="strat" key={id} style={{ ["--team" as string]: hex(e.team.color) }}>
                <div className="strat-head">
                  <i className="chip" />
                  <b>
                    #{e.driver.number} {e.driver.name}
                  </b>
                  <span className="dim">{pitLane ? "starts from the pit lane (setup changed after parc ferme)" : `starts P${q.position}`}</span>
                </div>
                <div className="seg wide">
                  {(["S", "M", "H", "I", "W"] as Compound[]).map((c) => (
                    <button key={c} className={tyres[id] === c ? "on" : ""} disabled={!!locks?.[id] && locks[id] !== c} onClick={() => setTyres({ ...tyres, [id]: c })}>
                      <CompoundBadge c={c} /> {COMPOUNDS[c].name.toUpperCase()}
                      {sets && (c === "S" || c === "M" || c === "H") ? <small> ({(sets[weekend.entries.find((x) => x.id === id)?.team.id ?? ""] ?? sets[id])?.[c] ?? 0} fresh)</small> : null}
                    </button>
                  ))}
                </div>
                {setLists && (() => {
                  const list = setLists[id] ?? setLists[weekend.entries.find((x) => x.id === id)?.team.id ?? ""] ?? [];
                  if (!list.length) return null;
                  const lock = locks?.[id];
                  const mine = Object.values(startSets);
                  return (
                    <div className="ctl col">
                      <span>START SET</span>
                      <SetPicker
                        sets={list.filter((x) => (!lock || x.compound === lock) && !(x.runs > 0 && x.wear >= 0.8) && !mine.includes(x.id) || startSets[id] === x.id)}
                        value={startSets[id] ?? ""}
                        onChange={(sid) => {
                          const x = list.find((y) => y.id === sid);
                          const next = { ...startSets };
                          if (x) { next[id] = x.id; setTyres({ ...tyres, [id]: x.compound }); } else delete next[id];
                          setStartSets(next);
                        }}
                      />
                    </div>
                  );
                })()}
                {locks?.[id] && <p className="hint">Qualifying tyre lock: the fastest Q3 lap was on {COMPOUNDS[locks[id]].name}s, so that is the start tyre.</p>}
                {sets && (() => {
                  const inv = sets[weekend.entries.find((x) => x.id === id)?.team.id ?? ""] ?? sets[id];
                  const c = tyres[id];
                  return inv && (c === "S" || c === "M" || c === "H") && (inv[c] ?? 0) <= 0 ? <p className="hint warn">No fresh {COMPOUNDS[c].name} sets left after qualifying. This one starts used and worn.</p> : null;
                })()}
                <p className="hint">
                  {wetTyre
                    ? "Wet tyres are a gamble on a dry grid: they overheat and fall apart on a drying track. Using them frees you from the two compound rule."
                    : `${needsStop ? `This set will not last ${laps} laps.` : `This set could go the distance.`} You still must use two different dry compounds, so a stop is compulsory.`}
                </p>
              </div>
            );
          })}
          <div className="rulebook">
            <h4>RULES IN FORCE</h4>
            <ul>
              <li>Two different dry compounds, or a disqualification. Run the inters or wets at any point and the rule is waived.</li>
              <li>Heavy rain: safety car start, or a red flag and a standing restart.</li>
              <li>Jump starts, track limits and contact earn time penalties.</li>
              <li>Safety car and virtual safety car. Pit lane limited to 80 km/h.</li>
              <li>Classified if you complete 90% of the winner's laps.</li>
              <li>Points: 25, 18, 15, 12, 10, 8, 6, 4, 2, 1.</li>
              {(extraRules ?? []).map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
          <div className="rulebook">
            <h4>THE OTHER PIT WALLS</h4>
            <ul className="brains">
              {rivals.map((t) => (
                <li key={t.id}>
                  <b style={{ color: hex(t.color) }}>{t.short}</b> <span className="dim">{(BRAINS[t.id] ?? DEFAULT_BRAIN).style}</span> {(BRAINS[t.id] ?? DEFAULT_BRAIN).blurb}
                </li>
              ))}
            </ul>
          </div>
          <button className="btn primary big" onClick={() => onStart(tyres, startSets)}>
            GO TO THE GRID
          </button>
        </section>
      </div>
    </div>
  );
}
