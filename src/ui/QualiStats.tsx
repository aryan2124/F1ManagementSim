import { useState } from "react";
import { createPortal } from "react-dom";
import type { QualiSim } from "../sim/qualifying";
import { CompoundBadge } from "./Briefing";

const fmt = (t: number) => {
  if (!isFinite(t) || t <= 0) return "--";
  const m = Math.floor(t / 60);
  return `${m}:${(t - m * 60).toFixed(3).padStart(6, "0")}`;
};
const sec = (t: number) => (isFinite(t) && t > 0 ? t.toFixed(3) : "--");
const delta = (a: number, b: number) => (isFinite(a) && isFinite(b) && a > 0 && b > 0 ? `${a - b >= 0 ? "+" : "-"}${Math.abs(a - b).toFixed(3)}` : "");

/** Everything qualifying knows about one driver, and the same beside a second driver when one is chosen. */
export function QualiStats({ sim, carId, onClose }: { sim: QualiSim; carId: string; onClose: () => void }) {
  const [otherId, setOtherId] = useState<string>("");
  const a = sim.cars.find((c) => c.id === carId)!;
  const b = otherId ? sim.cars.find((c) => c.id === otherId) : undefined;
  const pole = sim.order[0];
  const cols = [a, ...(b ? [b] : [])];
  const seg = Math.max(0, Math.min(2, sim.segment - 1));
  const poleBest = pole ? pole.best[seg] : Infinity;

  const rows: { label: string; get: (c: typeof a) => string; num?: (c: typeof a) => number }[] = [
    { label: "POSITION", get: (c) => `P${c.position || sim.order.indexOf(c) + 1}` },
    ...[0, 1, 2].map((k) => ({ label: `Q${k + 1} BEST`, get: (c: typeof a) => fmt(c.best[k]), num: (c: typeof a) => c.best[k] })),
    ...[0, 1, 2].map((k) => ({ label: `Q${k + 1} TYRE`, get: (c: typeof a) => (c.bestComp[k] ? c.bestComp[k]! : "--") })),
    { label: "BEST SECTOR 1", get: (c) => sec(c.sectors.best[0]), num: (c) => c.sectors.best[0] },
    { label: "BEST SECTOR 2", get: (c) => sec(c.sectors.best[1]), num: (c) => c.sectors.best[1] },
    { label: "BEST SECTOR 3", get: (c) => sec(c.sectors.best[2]), num: (c) => c.sectors.best[2] },
    { label: "LAST LAP", get: (c) => (c.lastLap > 0 ? `${fmt(c.lastLap)}${c.lastValid ? "" : " (deleted)"}` : "--") },
    { label: "RUNS", get: (c) => String(c.runsDone) },
  ];

  const body = (
    <div className="ds-back" onClick={onClose}>
      <div className="ds-box" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${a.entry.driver.name} qualifying stats`} data-testid="quali-stats">
        <header className="ds-head" style={{ ["--team" as string]: `#${a.entry.team.color.toString(16).padStart(6, "0")}` }}>
          <div>
            <h3>{a.entry.driver.code} <small>{a.entry.driver.name} | {a.entry.team.name}</small></h3>
            <p className="dim small">
              {a.eliminatedIn ? `OUT IN Q${a.eliminatedIn}` : a.crashedOut ? "CRASHED" : a.dnq ? "FAILED 107%" : `Q${sim.segment}`}
              {a.note ? ` | ${a.note}` : ""}
              {isFinite(poleBest) && isFinite(a.best[seg]) && a !== pole ? ` | ${delta(a.best[seg], poleBest)} TO POLE` : ""}
            </p>
          </div>
          <button className="btn" onClick={onClose}>CLOSE</button>
        </header>
        <div className="ds-grid">
          <div className="ds-card"><span>ON THE CAR</span><b><CompoundBadge c={a.compound} size={18} /> {Math.round(a.wear * 100)}% worn</b></div>
          <div className="ds-card"><span>SETS LEFT</span><b>S{a.sets.S} M{a.sets.M} H{a.sets.H}</b></div>
        </div>
        <h4>COMPARE WITH</h4>
        <select aria-label="Compare with" value={otherId} onChange={(e) => setOtherId(e.target.value)}>
          <option value="">Nobody</option>
          {sim.order.filter((c) => c.id !== a.id).map((c) => <option key={c.id} value={c.id}>{c.entry.driver.code} {c.entry.driver.name}</option>)}
        </select>
        <table className="ds-table">
          <thead><tr><th></th>{cols.map((c) => <th key={c.id}>{c.entry.driver.code}</th>)}{b && <th>GAP</th>}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                {cols.map((c) => <td key={c.id}>{r.get(c)}</td>)}
                {b && <td>{r.num ? delta(r.num(a), r.num(b)) : ""}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small dim">A negative gap means {a.entry.driver.code} is quicker.</p>
      </div>
    </div>
  );
  return createPortal(body, document.body);
}
