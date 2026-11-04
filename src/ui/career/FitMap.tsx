import { fitMap, fitSummary } from "../../career/fitmap";
import { teamOf, type Props } from "./common";

const fmt = (x: number) => `${x >= 0 ? "+" : "-"}${Math.abs(x).toFixed(2)}s`;

/** Your car laid over the calendar: seconds a lap gained or lost against the average car at every race, with a range. */
export function FitMapPanel({ s }: Props) {
  const rows = fitMap(s, s.teamId);
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
      <div className="fm-grid">
        {rows.map((r) => (
          <div key={r.round} className={`fm-row ${r.raced ? "raced" : ""}`}>
            <span className="fm-gp">R{r.round + 1} {r.gp}</span>
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
