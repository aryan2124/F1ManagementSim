import { PLink } from "./Profile";
import { useState } from "react";
import { ATTRS, ATTR_LABEL, FOCUS_LABEL, JUNIOR_CAL, SERIES, SERIES_COST, SERIES_LABEL, eventIn, f1Eligible, fitOf, levelOf, nextEvent, reportOf, visible, type Focus, type Prospect, type Series } from "../../career/academy";
import { JUNIOR_TOPICS, MANAGER_TOPICS, managerOf } from "../../career/talks";
import { TalkPanel } from "./Talks";
import { ymd } from "../../career/util";
import { fmtMoney } from "../../career/util";
import { Bar, Tip, type Props } from "./common";
import { ask } from "../Confirm";

const starText = (lo: number, hi: number) => (lo === hi ? `${lo} stars` : `${lo} to ${hi} stars`);

const MONTH = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function Detail({ s, d, p, say, openTalks }: Props & { p: Prospect; say: (m: string) => void; openTalks: (id: string) => void }) {
  const [said, setSaid] = useState("");
  const [years, setYears] = useState(3);
  const [retainer, setRetainer] = useState(0.3);
  const [buyout, setBuyout] = useState(2);
  const [first, setFirst] = useState(true);
  const rep = reportOf(s, p);
  const fit = fitOf(s, p);
  const mine = p.status === "academy" && p.owner === s.teamId;
  const run = (r: { message: string }) => say(r.message);
  const age = s.year - p.born;
  const myDrivers = Object.values(s.drivers).filter((x) => x.teamId === s.teamId);
  const scouts = Object.values(s.staff).filter((x) => x.teamId === s.teamId && x.role === "scout");
  return (
    <div className="c-pros">
      <h3>{p.name} <span className="dim">{p.nat}, {age}, {SERIES_LABEL[p.series]}</span></h3>
      <p>
        Rating <b>{starText(rep.stars.lo, rep.stars.hi)}</b> <Tip text="The range narrows as scouts watch him and when you run a trial day. A wide range means we do not know him yet." />
        {" "}Confidence <b>{Math.round(rep.confidence * 100)}%</b> <Bar v={rep.confidence} />
      </p>
      <p className="small">{rep.scout ? <>Report by <b>{rep.scout.name}</b>, who follows {SERIES_LABEL[p.series]}.</> : <span className="warn">Nobody scouts {SERIES_LABEL[p.series]} for you. This is paddock rumour: the range is wide. Assign a scout to {SERIES_LABEL[p.series]} in the SCOUTS tab.</span>}</p>
      <p className="dim small">{rep.styleNote}. {rep.bloomNote}. {p.status === "rival" ? "Another team has him." : p.status === "free" ? "Free to sign." : ""}</p>
      <div className="c-attrs">
        {ATTRS.map((k) => {
          const r = rep.attrs[k];
          return (
            <div key={k} className="c-attr">
              <span>{ATTR_LABEL[k]}</span>
              <div className="rng"><i style={{ left: `${r.lo * 100}%`, width: `${Math.max(2, (r.hi - r.lo) * 100)}%` }} /></div>
            </div>
          );
        })}
      </div>
      {(p.path?.length ?? 0) > 0 && (
        <>
          <h4>Career so far</h4>
          <ul className="c-notes small">
            {p.path!.slice().reverse().map((x) => <li key={x.year}>{x.year}: {SERIES_LABEL[x.series]}, P{x.rank}, {x.pts} points{x.wins ? `, ${x.wins} win${x.wins === 1 ? "" : "s"}` : ""}</li>)}
          </ul>
        </>
      )}
      <h4>Fit with your team</h4>
      <ul className="c-fit">
        {fit.lines.map((l) => (
          <li key={l.key} className={l.mark}><b>{l.label}</b> {l.text}</li>
        ))}
      </ul>
      <p className="small"><b>What would improve it:</b> {fit.tip}</p>
      {(() => {
        const mg = managerOf(s, p.id);
        return (
          <div className="c-talks">
            <h4>Talk to him</h4>
            {mg && <p className="dim small">His manager is <b>{mg.name}</b> ({mg.style === "shark" ? "shops him to every team" : mg.style === "loyal" ? "wants him looked after" : "lets the family decide"}).</p>}
            <div className="c-acts">
              {JUNIOR_TOPICS.map((tp) => <button key={tp.id} className="tiny" title={tp.hint} onClick={() => { const r = d({ type: "talkPrivate", kind: "junior", targetId: p.id, topic: tp.id }); setSaid(r.message); }}>{tp.label}</button>)}
              {mg && MANAGER_TOPICS.slice(0, 2).map((tp) => <button key={tp.id} className="tiny" title={`Ask ${mg.name}: ${tp.hint}`} onClick={() => { const r = d({ type: "talkPrivate", kind: "manager", targetId: mg.id, topic: tp.id }); setSaid(r.message); }}>MANAGER: {tp.label}</button>)}
              {mg && <button className="tiny" title="Smooth things over with his manager" onClick={() => { const r = d({ type: "talkPrivate", kind: "manager", targetId: mg.id, topic: "relationship" }); setSaid(r.message); }}>MANAGER: CLEAR THE AIR</button>}
              {!mine && p.status === "free" && <button className="tiny primary" onClick={() => openTalks(p.id)} title="Negotiate over several days instead of a one-shot offer">OPEN CONTRACT TALKS</button>}
            </div>
            {said && <p className="c-msg">{said}</p>}
          </div>
        );
      })()}
      {!mine && (
        <>
          <div className="c-acts">
            <button className="tiny" onClick={() => run(d({ type: "shortlist", id: p.id, on: !s.academy.shortlist.includes(p.id) }))}>{s.academy.shortlist.includes(p.id) ? "REMOVE FROM SHORTLIST" : "SHORTLIST"}</button>
            <button className="tiny" disabled={p.trial > 0 || s.academy.trialDays < 1} onClick={() => run(d({ type: "trialDay", id: p.id }))} title="A day in the simulator. It sharpens what we know about him a lot.">
              TRIAL DAY ({s.academy.trialDays} left)
            </button>
          </div>
          {p.status === "free" && (
            <div className="c-sign">
              <h4>Offer an academy deal</h4>
              <label>Years <input type="number" min={1} max={5} value={years} onChange={(e) => setYears(Number(e.target.value))} /></label>
              <label>Retainer $m a year <input type="number" min={0} step={0.1} value={retainer} onChange={(e) => setRetainer(Number(e.target.value))} /></label>
              <label>Buyout $m <input type="number" min={0} step={0.5} value={buyout} onChange={(e) => setBuyout(Number(e.target.value))} /></label>
              <label><input type="checkbox" checked={first} onChange={(e) => setFirst(e.target.checked)} /> First refusal <Tip text="If he reaches Formula 1, we get the first chance to sign him before any other team." /></label>
              <p className="dim small">Running him costs about {fmtMoney(SERIES_COST[p.series] + retainer)} a year from the academy budget.</p>
              <button onClick={() => run(d({ type: "signProspect", id: p.id, years, retainer, buyout, firstRefusal: first }))}>SIGN TO ACADEMY</button>
            </div>
          )}
        </>
      )}
      {mine && (
        <>
          <p className="small">Level <b>{Math.round(levelOf(p) * 100)}</b>. Super licence points (last three years): <b>{p.licence.slice(-3).reduce((a, b) => a + b, 0)}</b> of 40. {f1Eligible(s, p) ? "He can race in Formula 1." : ""}</p>
          <p className="dim small">Deal to {p.deal?.endYear}, retainer {fmtMoney(p.deal?.retainer ?? 0)}, buyout {fmtMoney(p.deal?.buyout ?? 0)}{p.deal?.firstRefusal ? ", first refusal" : ""}.</p>
          <h4>Training focus (up to two)</h4>
          <div className="c-acts">
            {(Object.keys(FOCUS_LABEL) as Focus[]).map((f) => {
              const on = p.training.includes(f);
              const next = on ? p.training.filter((x) => x !== f) : [...p.training, f].slice(-2);
              return <button key={f} className={`tiny ${on ? "on" : ""}`} onClick={() => run(d({ type: "training", id: p.id, focus: next }))}>{FOCUS_LABEL[f].toUpperCase()}</button>;
            })}
          </div>
          <h4>Series <Tip text={`Racing in a higher series is harder but teaches more. Costs a year: ${SERIES.map((x) => `${SERIES_LABEL[x]} ${fmtMoney(SERIES_COST[x])}`).join(", ")}.`} /></h4>
          <div className="c-acts">
            {SERIES.map((x) => <button key={x} className={`tiny ${p.series === x ? "on" : ""}`} disabled={p.series === x} onClick={() => run(d({ type: "moveSeries", id: p.id, series: x }))}>{SERIES_LABEL[x].toUpperCase()}</button>)}
          </div>
          <h4>Mentor</h4>
          <div className="c-acts">
            <button className={`tiny ${p.mentor === null ? "on" : ""}`} onClick={() => run(d({ type: "mentor", id: p.id, driverId: null }))}>NONE</button>
            {myDrivers.map((x) => <button key={x.spec.id} className={`tiny ${p.mentor === x.spec.id ? "on" : ""}`} onClick={() => run(d({ type: "mentor", id: p.id, driverId: x.spec.id }))}>{x.spec.name.toUpperCase()}</button>)}
          </div>
          <div className="c-acts">
            <button className="tiny" onClick={() => run(d({ type: "rookie", id: s.academy.rookieNominee === p.id ? null : p.id }))}>{s.academy.rookieNominee === p.id ? "NOT FOR THE ROOKIE WEEKEND" : "NOMINATE FOR A ROOKIE WEEKEND"}</button>
            {f1Eligible(s, p) && myDrivers.map((x, i) => (
              <button key={x.spec.id} className="tiny" onClick={() => ask(`${x.spec.name} will be released.`, () => run(d({ type: "promote", id: p.id, slot: i as 0 | 1, salary: 1.5, years: 3 })), { title: `REPLACE ${x.spec.name.toUpperCase()} WITH ${p.name.toUpperCase()}?`, yes: "REPLACE" })}>
                PROMOTE INTO {x.spec.name.split(" ").pop()?.toUpperCase()}'S SEAT
              </button>
            ))}
          </div>
        </>
      )}
      {p.log.length > 0 && (
        <>
          <h4>History</h4>
          {p.log.slice(0, 6).map((l, i) => <p key={i} className="dim small">{l}</p>)}
        </>
      )}
      {p.status === "rival" && p.deal && p.owner && (
        <div>
          <p className="small">Tied to {p.owner.toUpperCase()}'s academy until {p.deal.endYear}. Their buyout clause is {fmtMoney(p.deal.buyout)}; you can trigger it for {fmtMoney(p.deal.buyout * 1.2)}.</p>
          <button onClick={() => run(d({ type: "buyoutProspect", id: p.id }))}>PAY THE BUYOUT</button>
        </div>
      )}
      {scouts.length === 0 && !mine && <p className="warn small">You have no scout. Hire one in People so the ranges narrow faster.</p>}
    </div>
  );
}

export function Academy({ s, d }: Props) {
  const [tab, setTab] = useState<"scout" | "mine" | "ladder" | "scouts">("scout");
  const [talkId, setTalkId] = useState<number | null>(null);
  const month = ymd(s.day).m;
  const openTalks = (id: string) => {
    const r = d({ type: "talkOpen", kind: "junior", targetId: id });
    const tk = r.state.talks.find((x) => x.targetId === id && x.status !== "closed");
    if (r.ok && tk) setTalkId(tk.id);
    else setMsg(r.message);
  };
  const [sel, setSel] = useState<string | null>(null);
  const [filter, setFilter] = useState<Series | "all">("all");
  const [msg, setMsg] = useState("");
  const a = s.academy;
  const list = visible(s).filter((p) => filter === "all" || p.series === filter);
  const mine = Object.values(a.prospects).filter((p) => p.status === "academy" && p.owner === s.teamId);
  const sp = sel ? a.prospects[sel] : null;
  const scouts = Object.values(s.staff).filter((x) => x.teamId === s.teamId && x.role === "scout");
  const budget = s.budgets.academy;
  const spent = s.teams[s.teamId].ledger.academy ?? 0;
  const decisions = a.decisions.map((id) => a.prospects[id]).filter(Boolean);

  const row = (p: Prospect) => {
    const r = reportOf(s, p);
    return (
      <li key={p.id} className={sel === p.id ? "on" : ""} onClick={() => setSel(p.id)}>
        <b><PLink kind="prospect" id={p.id}>{p.name}</PLink></b> <span className="dim">{SERIES_LABEL[p.series]}, {s.year - p.born}</span>
        <span className="rt">{starText(r.stars.lo, r.stars.hi)}</span>
      </li>
    );
  };

  return (
    <div>
      <section className="panel">
        <h3>ACADEMY</h3>
        <p className="small">Pay young drivers in the junior series to get first refusal on them when they reach Formula 1. Budget used this year: <b>{fmtMoney(spent)}</b> of <b>{fmtMoney(budget)}</b>. This is paid from cash and does not use cost cap room.</p>
        <nav className="sub">
          {([["scout", "SCOUTING"], ["mine", `MY ACADEMY (${mine.length})`], ["ladder", "SEASONS"], ["scouts", "SCOUTS"]] as const).map(([k, l]) => (
            <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
          ))}
        </nav>
        {msg && <p className="c-msg">{msg}</p>}
      </section>
      {decisions.length > 0 && (
        <section className="panel">
          <h3>END OF YEAR DECISIONS</h3>
          {decisions.map((p) => (
            <div key={p.id} className="c-line">
              <span><b><PLink kind="prospect" id={p.id}>{p.name}</PLink></b> <span className="dim">{SERIES_LABEL[p.series]}, level {Math.round(levelOf(p) * 100)}</span></span>
              <span className="c-acts">
                {(["keep", "loan", "reserve", "sell", "release"] as const).map((x) => (
                  <button key={x} className="tiny" onClick={() => setMsg(d({ type: "decide", id: p.id, decision: x }).message)}>{x.toUpperCase()}</button>
                ))}
              </span>
            </div>
          ))}
        </section>
      )}
      {(tab === "scout" || tab === "mine") && (
        <div className="c-cols">
          <section className="panel">
            {tab === "scout" && (
              <div className="c-acts">
                {(["all", ...SERIES] as const).map((x) => <button key={x} className={`tiny ${filter === x ? "on" : ""}`} onClick={() => setFilter(x)}>{x === "all" ? "ALL" : SERIES_LABEL[x].toUpperCase()}</button>)}
              </div>
            )}
            <ul className="c-plist">
              {(tab === "scout" ? list : mine).map(row)}
              {(tab === "scout" ? list : mine).length === 0 && <li className="dim">{tab === "scout" ? "Nobody on your list yet. Scouts find new names each month." : "Nobody in your academy. Sign someone from Scouting."}</li>}
            </ul>
          </section>
          <section className="panel">{talkId !== null && <TalkPanel s={s} d={d} id={talkId} onClose={() => setTalkId(null)} />}{sp ? <Detail s={s} d={d} p={sp} say={setMsg} openTalks={openTalks} /> : <p className="dim">Pick a driver to see the scout's report.</p>}</section>
        </div>
      )}
      {tab === "ladder" && (
        <div className="c-cols">
          {SERIES.map((x) => {
            const rows = Object.values(a.prospects).filter((p) => p.series === x && p.status !== "gone" && p.status !== "f1").sort((p, q) => q.pts - p.pts || q.wins - p.wins).slice(0, 8);
            const cal = JUNIOR_CAL[x];
            const done = (a.results ?? []).filter((r) => r.series === x && r.year === s.year);
            const last = done[done.length - 1];
            const nx = nextEvent(x, month + (eventIn(x, month) && done.some((r) => r.month === month) ? 1 : 0));
            const watched = scouts.filter((sc) => (a.scouts[sc.id] ?? "f4") === x);
            return (
              <section key={x} className="panel">
                <h3>{SERIES_LABEL[x].toUpperCase()} {s.year}</h3>
                <p className="small dim">{done.length} of {cal.length} {x === "kart" ? "championships" : "rounds"} run. {nx ? <>Next: <b>{nx.name}</b> in {MONTH[nx.month]}.</> : "Season over."} {watched.length ? `Watched by ${watched.map((w) => w.name).join(", ")}.` : "No scout of yours is watching."}</p>
                <div className="c-cal">{cal.map((e) => <i key={e.name} className={done.some((r) => r.name === e.name) ? "done" : ""} title={`${e.name}, ${MONTH[e.month]}`}>{e.name.slice(0, 3).toUpperCase()}</i>)}</div>
                {last && <p className="small">Last: <b>{last.name}</b>. {last.top.map((r, i) => `${i + 1}. ${r.name}`).join("  ")}</p>}
                <ol className="c-table">
                  {rows.map((p) => <li key={p.id} className={p.owner === s.teamId ? "mine" : ""} onClick={() => { setSel(p.id); setTab("scout"); }}><PLink kind="prospect" id={p.id}>{p.name}</PLink> <span className="dim">{p.owner ? (p.owner === s.teamId ? "yours" : s.teams[p.owner] ? p.owner : "") : a.shortlist.includes(p.id) ? "on your list" : ""}</span> <b>{p.pts}</b></li>)}
                </ol>
              </section>
            );
          })}
          {a.champions.length > 0 && (
            <section className="panel">
              <h3>RECENT CHAMPIONS</h3>
              {a.champions.slice(-8).reverse().map((c, i) => <p key={i} className="small">{c.year} {SERIES_LABEL[c.series]}: {c.name}</p>)}
            </section>
          )}
        </div>
      )}
      {tab === "mine" && (
        <p className="dim small">Academy places: {mine.length} of {3 + s.teams[s.teamId].facilities.academy}. Each academy level adds one place. Scouts are a separate hire and have no cap, but each one watches a single series.</p>
      )}
      {tab === "scouts" && (
        <section className="panel">
          <h3>YOUR SCOUTS</h3>
          <p className="small">Each scout follows one series. In its season he goes to the rounds, watches the front of the field and your shortlist, and files a report. Out of season he only reviews tapes. A series with no scout is just rumour. Better scouts give tighter ranges. Hire more in People.</p>
          {scouts.length === 0 && <p className="warn">You have no scouts.</p>}
          {scouts.map((sc) => {
            const ser = a.scouts[sc.id] ?? "f4";
            const nx = nextEvent(ser, month);
            const inSeason = !!eventIn(ser, month);
            const watching = Object.values(a.prospects).filter((p) => p.series === ser && a.shortlist.includes(p.id)).length;
            return (
              <div key={sc.id} className="c-line">
                <span><b>{sc.name}</b> <span className="dim">skill {sc.skill}, {sc.traits.join(", ") || "no quirks"}</span><br /><span className="small dim">{inSeason ? `At ${eventIn(ser, month)!.name} this month.` : nx ? `Off the road. Next: ${nx.name} in ${MONTH[nx.month]}.` : "Season over, reviewing tapes."} Following {watching} on your list.</span></span>
                <span className="c-acts">
                  {SERIES.map((x) => <button key={x} className={`tiny ${ser === x ? "on" : ""}`} onClick={() => setMsg(d({ type: "assignScout", staffId: sc.id, series: x }).message)}>{SERIES_LABEL[x].toUpperCase()}</button>)}
                </span>
              </div>
            );
          })}
          {SERIES.filter((x) => !scouts.some((sc) => (a.scouts[sc.id] ?? "f4") === x)).length > 0 && scouts.length > 0 && <p className="dim small">Not covered: {SERIES.filter((x) => !scouts.some((sc) => (a.scouts[sc.id] ?? "f4") === x)).map((x) => SERIES_LABEL[x]).join(", ")}.</p>}
          <p className="dim small">Stars shown for a driver are a range from the scout. The 1 in 40 generational talent exists in the world but you only see him through the same ranges.</p>
        </section>
      )}
    </div>
  );
}
