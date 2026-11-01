import { useState } from "react";
import { createPortal } from "react-dom";
import { COMPOUNDS, fmtLap } from "../sim/engine";
import type { RaceSim } from "../sim/engine";
import type { Compound } from "../sim/types";
import { CompoundBadge } from "./Briefing";

const sec = (t: number) => (isFinite(t) && t > 0 ? t.toFixed(3) : "--");

/** Everything the timing screen knows about one car: stints, stops, every lap and the sectors of any lap you pick. */
export function DriverStats({ sim, carId, onClose }: { sim: RaceSim; carId: string; onClose: () => void }) {
  const car = sim.car(carId);
  const [pick, setPick] = useState<number | null>(null);
  const laps = sim.lapLog.get(carId) ?? [];
  const stops = sim.stopLog.filter((s) => s.carId === carId);
  const best = laps.length ? Math.min(...laps.filter((l) => !l.slow || laps.length < 3).map((l) => l.time)) : Infinity;
  const bestSec: [number, number, number] = [Infinity, Infinity, Infinity];
  for (const l of laps) l.sectors?.forEach((t, i) => { if (t > 0 && t < bestSec[i]) bestSec[i] = t; });

  // stints: one per stop taken, plus the one the car is on now
  const stints: { compound: Compound; from: number; to: number; laps: number; now?: boolean; wear?: number }[] = [];
  let at = 0;
  for (const s of stops) {
    const run = Math.max(0, s.lap - 1 - at);
    stints.push({ compound: s.from, from: at + 1, to: s.lap - 1, laps: run, wear: s.wearBefore });
    at = s.lap - 1;
  }
  if (car.status !== "dnf") stints.push({ compound: car.tyre.compound, from: at + 1, to: car.lap, laps: car.tyre.ageLaps, now: true, wear: car.tyre.wear });
  const total = stints.reduce((a, s) => a + s.laps, 0);
  const sel = pick !== null ? laps.find((l) => l.lap === pick) : undefined;
  const recent = laps.filter((l) => !l.slow).slice(-5);
  const avg = recent.length ? recent.reduce((a, l) => a + l.time, 0) / recent.length : 0;
  const gapNow = car.status === "dnf" ? "OUT" : car.position === 1 ? "LEADER" : `+${car.gapLeader.toFixed(1)}`;
  const body = (
    <div className="ds-back" onClick={onClose}>
      <div className="ds-box" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${car.entry.driver.name} full stats`}>
        <header className="ds-head" style={{ ["--team" as string]: `#${car.entry.team.color.toString(16).padStart(6, "0")}` }}>
          <div>
            <h3>P{car.position} {car.entry.driver.code} <small>{car.entry.driver.name} | {car.entry.team.name}</small></h3>
            <p className="dim small">{gapNow}{car.penalty > 0 ? ` | PENALTY +${car.penalty}s` : ""} | LAP {Math.min(car.lap + 1, sim.cfg.laps)} OF {sim.cfg.laps}{car.status === "dnf" ? " | RETIRED" : ""}</p>
          </div>
          <button className="btn" onClick={onClose}>CLOSE</button>
        </header>

        <div className="ds-grid">
          <div className="ds-card"><span>PIT STOPS</span><b>{stops.length}</b></div>
          <div className="ds-card"><span>TYRE SETS RUN</span><b>{stints.length}</b></div>
          <div className="ds-card"><span>BEST LAP</span><b>{isFinite(best) ? fmtLap(best) : "--"}</b></div>
          <div className="ds-card"><span>LAST LAP</span><b>{car.lastLap > 0 ? fmtLap(car.lastLap) : "--"}</b></div>
          <div className="ds-card"><span>AVERAGE, LAST 5</span><b>{avg ? fmtLap(avg) : "--"}</b></div>
          <div className="ds-card"><span>ON THE CAR NOW</span><b><CompoundBadge c={car.tyre.compound} size={18} /> {car.tyre.ageLaps} laps</b></div>
        </div>

        <h4>TYRES RUN</h4>
        <div className="ds-stints">
          {stints.map((s, i) => (
            <div key={i} className="ds-stint" style={{ flex: Math.max(1, s.laps), background: `#${COMPOUNDS[s.compound].color.toString(16).padStart(6, "0")}` }}>
              <b>{COMPOUNDS[s.compound].name.toUpperCase()}</b>
              <small>{s.laps} laps{s.now ? " (now)" : ""}</small>
            </div>
          ))}
        </div>
        <p className="small dim">{total} laps on {stints.length} set{stints.length === 1 ? "" : "s"} so far.</p>

        {stops.length > 0 && (
          <table className="ds-table">
            <thead><tr><th>STOP</th><th>LAP</th><th>STOOD STILL</th><th>TYRES</th><th>WORN WHEN OFF</th><th>POS BEFORE</th></tr></thead>
            <tbody>
              {stops.map((s, i) => (
                <tr key={i}>
                  <td>{i + 1}</td><td>{s.lap}</td><td>{s.secs.toFixed(1)}s</td>
                  <td><CompoundBadge c={s.from} size={14} /> to <CompoundBadge c={s.to} size={14} />{s.underNeutral ? " (safety car)" : ""}</td>
                  <td>{s.wearBefore !== undefined ? `${Math.round(s.wearBefore * 100)}%` : "--"}</td>
                  <td>P{s.posBefore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h4>EVERY LAP <small className="dim">(click a lap for its sectors)</small></h4>
        {sel && (
          <div className="ds-sel">
            <b>LAP {sel.lap}: {fmtLap(sel.time)}</b>
            <span>on <CompoundBadge c={sel.compound} size={14} /> | P{sel.pos}{sel.slow ? " | in/out lap or under a neutralisation" : ""}</span>
            <div className="ds-secs">
              {[0, 1, 2].map((i) => {
                const t = sel.sectors?.[i] ?? 0;
                return <div key={i} className={t > 0 && t <= bestSec[i] + 0.0005 ? "pb" : ""}><span>SECTOR {i + 1}</span><b>{sec(t)}</b><small>{t > 0 && isFinite(bestSec[i]) ? (t - bestSec[i] <= 0.0005 ? "his best this race" : `+${(t - bestSec[i]).toFixed(3)} off his best`) : ""}</small></div>;
              })}
            </div>
          </div>
        )}
        <div className="ds-laps">
          <table className="ds-table">
            <thead><tr><th>LAP</th><th>TIME</th><th>S1</th><th>S2</th><th>S3</th><th>TYRE</th><th>POS</th></tr></thead>
            <tbody>
              {[...laps].reverse().map((l) => (
                <tr key={l.lap} className={`${pick === l.lap ? "sel" : ""} ${l.time === best ? "bestlap" : ""} ${l.slow ? "slow" : ""}`} onClick={() => setPick(pick === l.lap ? null : l.lap)}>
                  <td>{l.lap}</td><td>{fmtLap(l.time)}</td>
                  {[0, 1, 2].map((i) => <td key={i} className={l.sectors && l.sectors[i] <= bestSec[i] + 0.0005 ? "pb" : ""}>{sec(l.sectors?.[i] ?? 0)}</td>)}
                  <td><CompoundBadge c={l.compound} size={14} /></td><td>P{l.pos}</td>
                </tr>
              ))}
              {laps.length === 0 && <tr><td colSpan={7} className="dim">No completed laps yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
  return createPortal(<div className="app ds-root">{body}</div>, document.body);
}
