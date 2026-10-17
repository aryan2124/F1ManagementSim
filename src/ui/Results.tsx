import { useMusic } from "../audio/useMusic";
import { Podium } from "./Podium";
import { getPrefs } from "./prefs";
import type { RaceSession } from "../game/session";
import { fmtLap } from "../sim/engine";
import { CompoundBadge } from "./Briefing";
import { useState } from "react";
import { Debrief } from "./Debrief";
import type { SetupReview } from "../career/weekend";

const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

function fmtTotal(t: number) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, "0")}`;
}

export function Results({ session, gp, onAgain, onMenu, menuLabel = "BACK TO PADDOCK", againLabel = "NEW WEEKEND, SAME TEAM", review }: { session: RaceSession; gp: string; onAgain?: () => void; onMenu: () => void; menuLabel?: string; againLabel?: string; review?: SetupReview | null }) {
  useMusic("results");
  const [podium, setPodium] = useState(() => getPrefs().podium && session.sim.phase === "finished");
  const [tab, setTab] = useState<"class" | "debrief">("class");
  const sim = session.sim;
  const rows = sim.results();
  const mine = rows.filter((r) => sim.car(r.carId).entry.human);
  const pts = mine.reduce((a, r) => a + r.points, 0);
  const best = sim.bestLapCar;
  const rivalCalls = session.log.filter((l) => l.channel === "rival" && (l.truth === "bluff" || l.truth === "hint" || l.truth === "honest"));
  const bluffs = rivalCalls.filter((l) => l.truth === "bluff").length;
  const hints = rivalCalls.filter((l) => l.truth === "hint" || l.truth === "honest").length;
  const verdict = pts >= 33 ? "A dominant weekend. The board is delighted." : pts >= 12 ? "Solid points. The board nods approvingly." : pts > 0 ? "A few points. Room to improve." : "No points. The board wants a word.";

  if (podium) return <Podium session={session} gp={gp} onDone={() => setPodium(false)} />;
  return (
    <div className="screen results">
      <header className="hero small">
        <h2>{gp.toUpperCase()}: CLASSIFICATION</h2>
        <p>
          YOUR TEAM SCORED <b className="hot">{pts}</b> POINTS. {verdict}
        </p>
      </header>
      <div className="seg res-tabs">
        <button className={tab === "class" ? "on" : ""} onClick={() => setTab("class")}>CLASSIFICATION</button>
        <button className={tab === "debrief" ? "on" : ""} onClick={() => setTab("debrief")}>DEBRIEF</button>
      </div>
      {tab === "debrief" && <Debrief session={session} review={review} />}
      {tab === "class" && (
      <section className="panel">
        <table className="class-table">
          <thead>
            <tr>
              <th>POS</th>
              <th></th>
              <th>DRIVER</th>
              <th>TEAM</th>
              <th>LAPS</th>
              <th>TIME / GAP</th>
              <th>BEST</th>
              <th>TYRES</th>
              <th>GRID</th>
              <th>PTS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const c = sim.car(r.carId);
              return (
                <tr key={r.carId} className={`${c.entry.human ? "mine" : ""} ${r.status !== "FIN" ? "dnf" : ""}`} style={{ ["--team" as string]: hex(c.entry.team.color), animationDelay: `${i * 45}ms` }}>
                  <td className="pos">{r.status === "FIN" ? r.position : r.status}</td>
                  <td>
                    <i className="chip" />
                  </td>
                  <td>
                    {c.entry.driver.name} <span className="dim">{c.entry.driver.code}</span>
                  </td>
                  <td>{c.entry.team.short}</td>
                  <td>{r.laps}</td>
                  <td title={r.penaltyNotes.join(", ")}>
                    {r.status === "DNF" || r.status === "DSQ" ? r.dnfReason : r.position === 1 ? fmtTotal(r.totalTime) : r.laps < rows[0].laps ? `+${rows[0].laps - r.laps} LAP${rows[0].laps - r.laps > 1 ? "S" : ""}` : `+${r.gap.toFixed(3)}`}
                    {r.penalty > 0 && <span className="pen"> (+{r.penalty}s)</span>}
                  </td>
                  <td className={best === r.carId ? "purple" : ""}>{fmtLap(r.bestLap)}</td>
                  <td className="tyres">
                    {r.compoundsUsed.map((k, j) => (
                      <CompoundBadge key={j} c={k} size={14} />
                    ))}
                    <span className="dim"> {r.stops}-stop</span>
                  </td>
                  <td className={r.delta > 0 ? "up" : r.delta < 0 ? "down" : ""}>{r.delta > 0 ? `+${r.delta}` : r.delta === 0 ? "=" : r.delta}</td>
                  <td className="pts">{r.points || ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rivalCalls.length > 0 && (
          <div className="review">
            <h3>RADIO REVIEW: WHAT THE RIVALS REALLY MEANT</h3>
            <p className="dim small">
              {bluffs} of {rivalCalls.length} rival messages were bluffs and {hints} were genuine hints. How many did you fall for? Teams hide their real plans on the open channel.
            </p>
            <ul>
              {rivalCalls.slice(-14).map((l) => (
                <li key={l.id} className={l.truth}>
                  <b>{(l.truth ?? "noise").toUpperCase()}</b> {l.text}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
      )}
      <section className="panel">
        <div className="row-btns">
          <button className={onAgain ? "btn" : "btn primary"} onClick={onMenu}>
            {menuLabel}
          </button>
          {onAgain && (
            <button className="btn primary" onClick={onAgain}>
              {againLabel}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
