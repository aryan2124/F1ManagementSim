import { useEffect, useMemo, useState } from "react";
import { Person } from "./career/DevRoom";
import type { DevReact, Staff } from "../career/types";
import "./career/devroom.css";
import type { RaceSession } from "../game/session";
import { buildDebrief, type DebriefCar } from "../game/debrief";
import { COMPOUNDS, fmtLap } from "../sim/engine";
import { CompoundBadge } from "./Briefing";
import type { SetupReview } from "../career/weekend";
import { strategyReport } from "../game/strategyReport";

const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

/** Position after every lap, one line per car. Lower is better, so the chart runs top (P1) to bottom. */
function Trace({ cars, rivals, n }: { cars: DebriefCar[]; rivals: { id: string; color: number; code: string; trace: number[] }[]; n: number }) {
  const W = 640;
  const H = 220;
  const laps = Math.max(2, ...cars.map((c) => c.trace.length), ...rivals.map((r) => r.trace.length));
  const maxPos = Math.max(10, n);
  const x = (i: number) => 28 + (i / (laps - 1)) * (W - 44);
  const y = (p: number) => 12 + ((p - 1) / (maxPos - 1)) * (H - 30);
  const line = (t: number[]) => t.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(" ");
  return (
    <svg className="db-trace" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Position after each lap">
      {[1, 3, 5, 10, 15, 20].filter((p) => p <= maxPos).map((p) => (
        <g key={p}>
          <line x1={26} x2={W - 14} y1={y(p)} y2={y(p)} stroke="#2d2a52" strokeWidth={1} />
          <text x={2} y={y(p) + 3} fill="#8a7fb8" fontSize={9}>P{p}</text>
        </g>
      ))}
      {rivals.map((r) => <path key={r.id} d={line(r.trace)} fill="none" stroke={hex(r.color)} strokeWidth={1} opacity={0.35} />)}
      {cars.map((c) => <path key={c.id} d={line(c.trace)} fill="none" stroke={hex(c.color)} strokeWidth={3} strokeLinejoin="round" />)}
      {cars.map((c) => c.stops.map((s) => <circle key={c.id + s.lap} cx={x(Math.min(laps - 1, s.lap))} cy={y(c.trace[Math.min(c.trace.length - 1, s.lap)] ?? 1)} r={4} fill="#14182a" stroke="#fff" strokeWidth={1.5} />))}
      <text x={W - 14} y={H - 2} textAnchor="end" fill="#8a7fb8" fontSize={9}>LAPS (white rings are your pit stops)</text>
    </svg>
  );
}

function StintBar({ c, laps }: { c: DebriefCar; laps: number }) {
  return (
    <div className="db-stints">
      {c.stints.map((st, i) => (
        <div key={i} className="db-stint" style={{ flex: Math.max(1, st.laps) / Math.max(1, laps), ["--tc" as string]: hex(COMPOUNDS[st.compound].color) }}>
          <CompoundBadge c={st.compound} size={14} />
          <b>{st.laps} laps</b>
          <small>{isFinite(st.pace) ? fmtLap(st.pace) : "-"}</small>
          <i style={{ width: `${Math.min(100, st.used * 100)}%` }} className={st.used > 1 ? "over" : ""} />
        </div>
      ))}
    </div>
  );
}

/** The race engineer walks you through the race: a playhead runs along the laps and he reacts to each key moment as it comes up. */
function EngineerReplay({ db, n }: { db: ReturnType<typeof buildDebrief>; n: number }) {
  const laps = Math.max(2, db.field.laps);
  const [lap, setLap] = useState(0);
  const [play, setPlay] = useState(false);
  useEffect(() => {
    if (!play) return;
    const id = setInterval(() => setLap((l) => (l >= laps ? (setPlay(false), l) : l + 1)), Math.max(60, Math.min(220, 14000 / laps)));
    return () => clearInterval(id);
  }, [play, laps]);
  const moments = useMemo(() => [...db.moments].sort((a, b) => a.lap - b.lap), [db.moments]);
  const cur = [...moments].reverse().find((m) => m.lap <= lap);
  const fresh = cur && lap - cur.lap < 6;
  const react: DevReact | undefined = fresh ? (cur.tone === "good" ? "grin" : cur.tone === "bad" ? "stung" : undefined) : undefined;
  const eng = { id: db.cars[0]?.id ?? "eng", name: "Your race engineer", role: "engineer", traits: [] } as unknown as Staff;
  const say = lap === 0 ? "Right, let us go through it together. Press play and I will tell you where the race was won and lost." : lap >= laps ? `That is the flag. ${db.cars.map((c) => `${c.name.split(" ").slice(-1)[0]} ${c.finish ? "P" + c.finish : c.status} from P${c.grid}`).join(", ")}.` : fresh ? `Lap ${cur.lap}: ${cur.text}` : "Nothing much happening here. Both cars are doing their job.";
  return (
    <section className="panel dr-replay">
      <h3>THE RACE ENGINEER'S REPLAY</h3>
      <div className="dr-row">
        <Person st={eng} say={say} react={react} size={72} />
        <div className="dr-col">
          <div className="dr-timeline" role="slider" aria-valuemin={0} aria-valuemax={laps} aria-valuenow={lap} aria-label="Race lap">
            {moments.slice(0, 60).map((m, i) => <i key={i} className={`m-${m.tone}`} style={{ left: `${(m.lap / laps) * 100}%` }} title={`L${m.lap}: ${m.text}`} />)}
            <b style={{ left: `${(lap / laps) * 100}%` }} />
          </div>
          <div className="dr-tower">
            {db.cars.map((c) => {
              const pos = c.trace[Math.min(lap, c.trace.length - 1)] ?? c.grid;
              return <span key={c.id} style={{ borderColor: hex(c.color) }}><small>{c.code}</small><b>P{pos}</b><i style={{ width: `${Math.max(4, 100 - ((pos - 1) / Math.max(1, n - 1)) * 100)}%`, background: hex(c.color) }} /></span>;
            })}
            <span className="dim small">Lap {lap} of {laps}</span>
          </div>
          <div className="dr-foot">
            <button className="btn" onClick={() => { setLap(0); setPlay(true); }}>{lap ? "REPLAY" : "PLAY"}</button>
            <button className="tiny" onClick={() => setPlay((p) => !p)}>{play ? "PAUSE" : "RESUME"}</button>
            <button className="tiny" onClick={() => { setPlay(false); setLap(laps); }}>SKIP TO THE FLAG</button>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Debrief({ session, review }: { session: RaceSession; review?: SetupReview | null }) {
  const sim = session.sim;
  const db = useMemo(() => buildDebrief(sim, session.humanIds), [sim, session]);
  const report = useMemo(() => strategyReport(sim, session.humanIds), [sim, session]);
  const laps = db.field.laps;
  return (
    <div className="debrief">
      <EngineerReplay db={db} n={sim.cars.length} />
      <section className="panel">
        <h3>THE RACE IN ONE PICTURE</h3>
        <Trace cars={db.cars} rivals={db.rivals} n={sim.cars.length} />
        <p className="dim small">Your cars are the thick lines, the top six rivals the faint ones.</p>
      </section>
      <div className="c-cols">
        {db.cars.map((c) => (
          <section className="panel db-car" key={c.id} style={{ ["--team" as string]: hex(c.color) }}>
            <h3>{c.name.toUpperCase()}: {c.finish ? `P${c.finish}` : c.status} FROM P{c.grid}</h3>
            <p className="dim small">{c.points} points. {isFinite(c.paceGap) ? `Race pace ${c.paceRank > 0 ? `ranked ${c.paceRank}` : ""}, ${c.paceGap < 0.005 ? "the quickest in the field" : `${c.paceGap.toFixed(2)} s a lap off the quickest`}.` : "Too few clean laps to rate the pace."}</p>
            <h4>STINTS</h4>
            <StintBar c={c} laps={laps} />
            <p className="dim small">The bar under each stint shows how much of that tyre's life was used. Red means you ran past it.</p>
            {c.stops.length > 0 && (
              <ul className="db-list">
                {c.stops.map((s, i) => (
                  <li key={i}>Lap {s.lap}: stop for {COMPOUNDS[s.to].name.toLowerCase()}s, {s.secs.toFixed(1)} s{isFinite(db.field.bestStop) && s.secs <= db.field.bestStop + 0.05 ? " (best of the race)" : ""}.</li>
                ))}
              </ul>
            )}
            <h4>WHAT WE LEARNT</h4>
            <ul className="db-list">{c.lessons.map((l, i) => <li key={i}>{l}</li>)}</ul>
          </section>
        ))}
      </div>
      {report.lines.length > 0 && (
        <section className="panel db-report">
          <h3>YOUR STRATEGY REPORT CARD <span className={`db-grade g-${report.grade}`}>{report.grade}</span></h3>
          {report.summary && <p className="dim small">{report.summary}</p>}
          <ul className="db-calls">
            {report.lines.map((l, i) => (
              <li key={i} className={`t-${l.tone}`}><b>{l.car}</b> {l.text}</li>
            ))}
          </ul>
        </section>
      )}
      <section className="panel">
        <h3>KEY MOMENTS</h3>
        {db.moments.length === 0 ? <p className="dim">A quiet race for your cars.</p> : (
          <ul className="db-moments">
            {db.moments.slice(0, 40).map((m, i) => (
              <li key={i} className={m.tone}><b>L{m.lap}</b> {m.text}</li>
            ))}
          </ul>
        )}
        {isFinite(db.field.bestStop) && <p className="dim small">Fastest stop of the race: {db.field.bestStop.toFixed(1)} s by {db.field.bestStopBy}. Median stop {db.field.medianStop.toFixed(1)} s.</p>}
      </section>
      {review && (
        <section className="panel">
          <h3>THE SETUP, NOW THAT WE KNOW</h3>
          <p className="dim small">Now the weekend is over the engineers can compare what you ran with what the track really wanted.</p>
          <ul className="db-list">{review.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
          <p>{review.lapCost < 0.02 ? "The setup cost almost nothing on track." : `The setup cost about ${review.lapCost.toFixed(2)} s a lap compared with the best one.`}{review.tyreCost > 0.02 ? " The balance also chewed through the tyres a little faster." : ""}</p>
          <p className="dim small">What practice taught: tyre study {Math.round(review.tyreKnow * 100)}% (less wear, and a sharper laps-left estimate), race simulation {Math.round(review.raceKnow * 100)}% (steadier drivers in the race), qualifying simulation {Math.round(review.qualiKnow * 100)}% (steadier drivers over one lap).</p>
        </section>
      )}
      <section className="panel">
        <h3>THE VERDICT</h3>
        <ul className="db-list">{db.insights.map((l, i) => <li key={i}>{l}</li>)}</ul>
      </section>
    </div>
  );
}
