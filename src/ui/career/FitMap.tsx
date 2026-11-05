import { useState } from "react";
import { fitMap, fitSummary } from "../../career/fitmap";
import { carIdentity, compareCars } from "../../career/carsig";
import { seasonMap } from "../../career/seasonmap";
import { KEYSTONES, SLOTS, SWAP_HOURS, activePairs, keystoneOf } from "../../career/keystones";
import { teamOf, type Props } from "./common";

const fmt = (x: number) => `${x >= 0 ? "+" : "-"}${Math.abs(x).toFixed(2)}s`;

/** Your car laid over the calendar: seconds a lap gained or lost against the average car at every race, with a range. */
export function FitMapPanel({ s, d }: Props) {
  const [ghost, setGhost] = useState<string[] | null>(null);
  const [msg, setMsg] = useState("");
  const me = s.teams[s.teamId];
  const fittedIds = me.keystones ?? [];
  const rows = fitMap(s, s.teamId, ghost ?? undefined);
  const base = ghost ? fitMap(s, s.teamId) : null;
  const ident = carIdentity(s, s.teamId);
  const [rival, setRival] = useState("");
  const guess = rival ? compareCars(s, rival) : [];
  const sum = fitSummary(rows);
  const span = Math.max(0.2, ...rows.map((r) => Math.max(Math.abs(r.low), Math.abs(r.high))));
  const pct = (x: number) => 50 + (x / span) * 48;
  const name = teamOf(s.teamId)?.name ?? "Your car";
  return (
    <section className="panel" data-testid="fitmap">
      <h3>FIT MAP: WHERE {name.toUpperCase()} IS QUICK</h3>
      <p className="small">Seconds a lap against the average car at each race. The line is the range we are unsure of, and it shrinks as races are run. The car suits {sum.covered} of {rows.length} tracks.</p>
      <p className="small">
        <b>Best:</b> {sum.best.map((r) => `${r.gp} ${fmt(r.edge)}`).join(", ")}. <b>Worst:</b> {sum.worst.map((r) => `${r.gp} ${fmt(r.edge)}`).join(", ")}.
      </p>
      <p className="small" data-testid="identity"><b>{ident.name}.</b> Signature: {ident.signatureWord.toLowerCase()}. Famous at {ident.famous.join(", ")}.</p>
      <div className="panel" data-testid="keystones">
        <h4>KEYSTONES ({fittedIds.length}/{SLOTS})</h4>
        <p className="small dim">The big choices that define the car. A swap costs {SWAP_HOURS} tunnel hours and dents what the team knows about the car. Hover a choice to see the map as it would be.</p>
        {Array.from({ length: SLOTS }, (_, i) => {
          const cur = fittedIds[i] ?? "";
          return (
            <label key={i} className="small" style={{ display: "block" }}>
              Slot {i + 1}:{" "}
              <select value={cur} onChange={(e) => setMsg(d({ type: "setKeystone", slot: i, id: e.target.value || null }).message)}>
                <option value="">(empty)</option>
                {KEYSTONES.filter((k) => k.id === cur || !fittedIds.includes(k.id)).map((k) => <option key={k.id} value={k.id}>{k.name} ({k.area})</option>)}
              </select>
            </label>
          );
        })}
        <div className="ks-chips">
          {KEYSTONES.filter((k) => !fittedIds.includes(k.id)).map((k) => (
            <button key={k.id} className="btn" title={k.blurb} onMouseEnter={() => setGhost([...fittedIds.slice(0, SLOTS - 1), k.id])} onMouseLeave={() => setGhost(null)} onFocus={() => setGhost([...fittedIds.slice(0, SLOTS - 1), k.id])} onBlur={() => setGhost(null)}>
              {k.name}
            </button>
          ))}
        </div>
        {ghost && base && (() => {
          const k = keystoneOf(ghost[ghost.length - 1]);
          const mean = (r: typeof rows) => r.reduce((a, x) => a + x.edge, 0) / Math.max(1, r.length);
          const diffs = rows.map((r, i) => ({ gp: r.gp, d: r.edge - base[i].edge }));
          const up = [...diffs].sort((a, b) => b.d - a.d)[0];
          const down = [...diffs].sort((a, b) => a.d - b.d)[0];
          return <p className="small" data-testid="ghost">Ghost: with {k?.name} the average edge goes from {fmt(mean(base))} to {fmt(mean(rows))}. Biggest gain at {up.gp} ({fmt(up.d)}), biggest loss at {down.gp} ({fmt(down.d)}).</p>;
        })()}
        {activePairs(fittedIds).map((p) => <p key={p.a + p.b} className="small dim">{p.text}</p>)}
        {msg && <p className="small">{msg}</p>}
      </div>
      <div className="panel" data-testid="compare">
        <h4>COMPARE CARS (WHAT YOU HAVE INFERRED)</h4>
        <select value={rival} onChange={(e) => setRival(e.target.value)}>
          <option value="">Pick a rival</option>
          {Object.keys(s.teams).filter((id) => id !== s.teamId).map((id) => <option key={id} value={id}>{teamOf(id)?.name ?? id}</option>)}
        </select>
        {guess.map((g) => <p key={g.trait} className="small">{g.name}: {g.gap >= 0 ? "they lead by" : "you lead by"} about {Math.abs(g.gap).toFixed(2)}s, give or take {g.range.toFixed(2)}.</p>)}
      </div>
      <div className="fm-grid">
        {rows.map((r) => (
          <div key={r.round} className={`fm-row ${r.raced ? "raced" : ""}`}>
            <span className="fm-gp" title={r.gp}>R{r.round + 1} {r.gp.replace(" Grand Prix", " GP")}</span>
            <span className="fm-bar" role="img" aria-label={`${r.gp}: ${fmt(r.edge)}, range ${fmt(r.low)} to ${fmt(r.high)}`}>
              <i className="fm-zero" />
              <i className={`fm-fill ${r.edge >= 0 ? "up" : "down"}`} style={{ left: `${Math.min(50, pct(r.edge))}%`, width: `${Math.abs(pct(r.edge) - 50)}%` }} />
              <i className="fm-range" style={{ left: `${pct(r.low)}%`, width: `${Math.max(1, pct(r.high) - pct(r.low))}%` }} />
            </span>
            <span className="fm-val">{fmt(r.edge)}</span>
            <span className="fm-lean dim small">{r.df > 0.15 ? "wants downforce" : r.df < -0.15 ? "wants top speed" : "balanced"}{r.sev > 1.15 ? ", hard on tyres" : ""}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

const READ = { above: "better than the car promised", "as expected": "about what the car promised", below: "worse than the car promised", "": "" } as const;

/** One row a race: the promise, the result and what the team decided on the way. */
export function SeasonMapPanel({ s }: Props) {
  const rows = seasonMap(s);
  return (
    <section className="panel" data-testid="seasonmap">
      <h3>SEASON MAP</h3>
      <p className="small dim">Each race: what the Fit Map promised, what happened, and what you decided or paid on the way there.</p>
      <ul className="c-notes">
        {rows.map((r) => (
          <li key={r.round}>
            <b>R{r.round + 1} {r.gp}</b> <span className="dim">promise {fmt(r.edge)}{r.raced && r.best ? `, best finish P${r.best}${r.reading ? `, ${READ[r.reading]}` : ""}` : r.raced ? ", no finish" : ""}</span>
            {r.events.map((e, i) => <div key={i} className="small dim">{e.text}{e.cost ? ` ($${e.cost.toFixed(2)}m)` : ""}{e.because ? `, ${e.because}` : ""}</div>)}
          </li>
        ))}
      </ul>
    </section>
  );
}
