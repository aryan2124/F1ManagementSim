import { usePersist } from "../skin/persist";
import { useState } from "react";
import { circuitMeta } from "../../game/circuits";
import { fmtDay } from "../../career/util";
import { legacyScore, CAUSE_LABEL } from "../../career/people";
import { NewsAnchor } from "../pixel/NewsAnchor";
import { teamColour, teamLabel } from "../../career/brand";
import { driverName, hex, teamOf, type Props } from "./common";
import { PLink, Cup, Linked } from "./Profile";
import { Social } from "./Social";
import { achievementsFor } from "../../career/records";
import { TEAMS } from "../../game/data";
import { driversOf } from "../../career/finance";
import { REAL_WDC, REAL_WCC_LIST } from "../../career/realhistory";
import { liveThreads, TELLERS, tellerOf, type Teller } from "../../career/threads";

type Sub = "season" | "grid" | "social" | "feats" | "news" | "records" | "history" | "legacy";
const TAGS = ["all", "people", "academy", "junior", "ai", "record", "rivalry", "rumour"];
const TAG_LABEL: Record<string, string> = { ai: "rivals" };

export function World({ s, d }: Props) {
  const [sub, setSub] = useState<Sub>("season");
  const [imp, setImp] = useState<1 | 2 | 3>(2);
  const [tag, setTag] = usePersist<string>("world", "all");
  const drivers = Object.entries(s.standings.drivers).sort((a, b) => b[1] - a[1]);
  const teams = Object.entries(s.standings.teams).sort((a, b) => b[1] - a[1]);
  const news = s.news.filter((n) => (n.importance ?? 1) >= imp && (tag === "all" || n.tag === tag)).slice(0, 60);
  const leg = legacyScore(s);
  return (
    <div>
      <nav className="sub">
        {([["season", "SEASON"], ["grid", "THE GRID"], ["social", "SOCIAL"], ["feats", "ACHIEVEMENTS"], ["news", "NEWS"], ["records", "RECORDS AND RIVALS"], ["history", "HISTORY"], ["legacy", "LEGACY"]] as const).map(([k, l]) => (
          <button key={k} className={sub === k ? "on" : ""} onClick={() => setSub(k)}>{l}</button>
        ))}
      </nav>
      {sub === "social" && <Social s={s} />}
      {sub === "grid" && (
        <div className="c-cols grid-dir">
          {TEAMS.filter((tm) => s.teams[tm.id]).map((tm) => (
            <section key={tm.id} className="panel" style={{ ["--team" as string]: hex(tm.color) }}>
              <h3><i className="chip" /> <PLink kind="team" id={tm.id}>{tm.name}</PLink> <span className="dim small">{(s.teams[tm.id]?.wcc ?? []).length} <Cup tone="wcc" /></span></h3>
              <ul className="traits">
                {driversOf(s, tm.id).map((x) => (
                  <li key={x.id}><PLink kind="driver" id={x.id}>{x.spec.name}</PLink> <span className="dim small">{x.rec ? `${x.rec.p1} wins, ${x.rec.wdc.length} titles` : ""}</span></li>
                ))}
              </ul>
            </section>
          ))}
          <p className="dim small">Click a name to see the trophy cabinet and what you know about them.</p>
        </div>
      )}
      {sub === "feats" && (
        <section className="panel">
          <h3>ACHIEVEMENTS THIS CAREER</h3>
          <ul className="achlist">
            {achievementsFor(s, { minTier: 2 }).slice(0, 120).map((a) => (
              <li key={a.id} className={`t${a.tier}`}>
                <span className="dim">{a.year} R{a.round}</span> {a.text}
                {a.driverId && <> <PLink kind="driver" id={a.driverId}>{driverName(s, a.driverId)}</PLink></>}
              </li>
            ))}
            {achievementsFor(s, { minTier: 2 }).length === 0 && <li className="dim">Nothing yet. Wins, poles, milestones and titles are recorded here as they happen.</li>}
          </ul>
        </section>
      )}
      {sub === "season" && (
        <div className="c-cols">
          <section className="panel">
            <h3>CALENDAR {s.year}</h3>
            <div className="c-season">
              {s.calendar.map((r) => {
                const w = s.standings.races.find((x) => x.round === r.round)?.winner;
                return (
                  <div key={r.round} className={`c-calrow ${r.round - 1 < s.round ? "done" : r.round - 1 === s.round ? "next" : ""}`}>
                    <span className="rd">R{r.round}</span>
                    <span className="gp">{circuitMeta(r.circuitId).short}</span>
                    <span className="dt">{fmtDay(r.day)}</span>
                    {r.sprint ? <em className="tag">SPRINT</em> : <span />}
                    {w && <span className="dim win">Won by <PLink kind="driver" id={w}>{driverName(s, w)}</PLink></span>}
                  </div>
                );
              })}
            </div>
          </section>
          <div>
            <section className="panel">
              <h3>CONSTRUCTORS</h3>
              <ol className="c-table">
                {teams.map(([id, p]) => (
                  <li key={id} className={id === s.teamId ? "mine" : ""} style={{ ["--team" as string]: hex(teamColour(s, id)) }}><i className="chip" /> <PLink kind="team" id={id}>{teamLabel(s, id)}</PLink> <b>{p}</b></li>
                ))}
              </ol>
            </section>
            <section className="panel">
              <h3>DRIVERS</h3>
              <ol className="c-table">
                {drivers.map(([id, p]) => (
                  <li key={id} className={s.drivers[id]?.teamId === s.teamId ? "mine" : ""}><PLink kind="driver" id={id}>{driverName(s, id)}</PLink> <span className="dim">{teamOf(s.drivers[id]?.teamId)?.short ?? ""}</span> <b>{p}</b></li>
                ))}
              </ol>
            </section>
          </div>
        </div>
      )}
      {sub === "news" && (
        <section className="panel theme-news">
          <NewsAnchor headline={(news[0]?.text ?? "A quiet day in the paddock").toUpperCase()} breaking={(news[0]?.importance ?? 1) >= 3} />
          <div className="c-acts">
            {([1, 2, 3] as const).map((n) => <button key={n} className={`tiny ${imp === n ? "on" : ""}`} onClick={() => setImp(n)}>{n === 1 ? "EVERYTHING" : n === 2 ? "IMPORTANT" : "BIG ONLY"}</button>)}
          </div>
          <div className="c-acts">
            {TAGS.map((t) => <button key={t} className={`tiny ${tag === t ? "on" : ""}`} onClick={() => setTag(t)}>{(TAG_LABEL[t] ?? t).toUpperCase()}</button>)}
          </div>
          <ul className="c-news">
            {news.map((n, i) => (
              <li key={i}>
                <span className="dim">{fmtDay(n.day)}</span> <Linked s={s} text={n.text} />
                {n.cause && <p className="dim small">Why: {CAUSE_LABEL[n.cause] ?? n.cause}</p>}
              </li>
            ))}
            {news.length === 0 && <li className="dim">Nothing matches.</li>}
          </ul>
        </section>
      )}
      {sub === "records" && (
        <div className="c-cols">
          <section className="panel">
            <h3>RECORDS</h3>
            <p className="dim small">Records start at zero in this world. They are set by the drivers you see racing.</p>
            {Object.values(s.records).length === 0 && <p className="dim">No records yet.</p>}
            {Object.values(s.records).map((r) => <p key={r.key} className="small"><b>{r.label}</b>: {r.holder} ({r.value}), {r.year}</p>)}
          </section>
          <section className="panel">
            <h3>RIVALRIES</h3>
            {s.rivalries.length === 0 && <p className="dim">No feuds yet.</p>}
            {s.rivalries.map((r, i) => (
              <div key={i}>
                <p className="small"><b><PLink kind="driver" id={r.a}>{driverName(s, r.a)}</PLink> and <PLink kind="driver" id={r.b}>{driverName(s, r.b)}</PLink></b> <span className="dim">heat {Math.round(r.heat)}</span></p>
                {r.lines.slice(0, 2).map((l, j) => <p key={j} className="dim small">{l}</p>)}
              </div>
            ))}
          </section>
          <section className="panel">
            <h3>HALL OF FAME</h3>
            {s.hall.length === 0 && <p className="dim">Nobody yet.</p>}
            {s.hall.slice(-12).reverse().map((h, i) => <p key={i} className="small">{h.year} <b>{h.name}</b> {h.text}</p>)}
          </section>
        </div>
      )}
      {sub === "history" && (
        <section className="panel">
          <h3>HISTORY</h3>
          {s.history.length === 0 ? <p className="dim">No finished seasons yet.</p> : (
            <table className="class-table">
              <thead><tr><th>YEAR</th><th>CHAMPION</th><th>CONSTRUCTORS</th><th>YOU</th></tr></thead>
              <tbody>{s.history.map((h) => <tr key={h.year}><td>{h.year}</td><td>{h.champion}</td><td>{teamOf(h.constructors)?.name ?? h.constructors}</td><td>P{h.playerPos}, {h.playerPoints} pts</td></tr>)}</tbody>
            </table>
          )}
          <h3>THE RECORD, 1950 TO 2025</h3>
          <p className="dim small">Champions for the years before your game began.</p>
          <table className="class-table">
            <thead><tr><th>YEAR</th><th>DRIVER</th><th>TEAM</th><th>CONSTRUCTORS</th></tr></thead>
            <tbody>{REAL_WDC.slice().reverse().map(([y, n, tm]) => <tr key={y}><td>{y}</td><td>{n}</td><td>{tm}</td><td>{REAL_WCC_LIST.find((c) => c[0] === y)?.[1] ?? "none awarded"}</td></tr>)}</tbody>
          </table>
        </section>
      )}
      {sub === "legacy" && (
        <div className="c-cols">
          <section className="panel">
            <h3>LEGACY SCORE: {leg.score}</h3>
            {leg.parts.map((p) => <p key={p.label} className="small">{p.label}: <b>{p.v}</b></p>)}
            <p className="dim small">These numbers are this game's own design, not a rating from anywhere else.</p>
          </section>
          <section className="panel">
            <h3>LIVE STORIES</h3>
            <div className="seg">
              {(Object.keys(TELLERS) as Teller[]).map((k) => <button key={k} title={TELLERS[k].blurb} className={tellerOf(s) === k ? "on" : ""} onClick={() => d({ type: "setTeller", teller: k })}>{TELLERS[k].label}</button>)}
            </div>
            <p className="small dim">{TELLERS[tellerOf(s)].blurb}</p>
            {liveThreads(s).length === 0 && <p className="dim small">Nothing is brewing at the moment.</p>}
            {liveThreads(s).map((th) => <p key={th.id} className="small"><b>{th.kind.toUpperCase()}</b> · heat {Math.round(th.heat * 100)}%</p>)}
            <h3>CHRONICLE</h3>
            {!(s.chronicle ?? []).length && <p className="dim small">Stories that finish are written down here.</p>}
            {(s.chronicle ?? []).slice().reverse().slice(0, 20).map((c, i) => <p key={i} className="small">{c.year}: {c.text}</p>)}
          </section>
          <section className="panel">
            <h3>YOUR STORY</h3>
            {s.legacy.length === 0 && <p className="dim">Your story starts when the first season ends.</p>}
            {s.legacy.slice().reverse().map((l, i) => <p key={i} className="small">{l.year}: {l.text}</p>)}
          </section>
        </div>
      )}
    </div>
  );
}
