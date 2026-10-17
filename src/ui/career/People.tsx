import { Sub } from "../skin/Sub";
import { useState } from "react";
import { ageOf, staffAsk } from "../../career/contracts";
import { TalkPanel, talkLabel } from "./Talks";
import { DRIVER_TOPICS, MANAGER_TOPICS, clientsOf, managerMood } from "../../career/talks";
import { driversOf } from "../../career/finance";
import { STAFF_LABEL } from "../../career/types";
import { fmtMoney, round2 } from "../../career/util";
import { StaffFit } from "./Engineering";
import { Bar, Tip, paceRank, paceWord, staffWords, teamOf, type Props } from "./common";
import { CAUSE_LABEL, G_STAGE, PROMISE_JUDGE, PROMISE_TEXT } from "../../career/people";
import { fmtDay } from "../../career/util";
import { DriverPortrait } from "../pixel/portraits";
import { teamColour } from "../../career/brand";
import { RIFT_CAUSE, RIFT_WORD, pressWord } from "../../career/dressing";
import { hex } from "./common";
import { PLink } from "./Profile";
import { CrewPanel } from "./Crew";
import { INTERN_PAY, readOffer } from "../../career/hiring";

function Why({ x }: { x: ReturnType<typeof Object.values<import("../../career/types").DriverState>>[number] }) {
  const rows = Object.entries(x.causes)
    .filter(([k, v]) => k !== "noResign" && Math.abs(v) >= 0.02)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  if (!rows.length) return <p className="dim small">Nothing is bothering him.</p>;
  return (
    <ul className="c-why">
      {rows.map(([k, v]) => (
        <li key={k} className={v < 0 ? "good" : ""}>{v < 0 ? "Helping: " : ""}{CAUSE_LABEL[k] ?? k} <em>{v < 0 ? "eases it" : v > 0.12 ? "a lot" : v > 0.06 ? "some" : "a little"}</em></li>
      ))}
    </ul>
  );
}

export function People({ s, d }: Props) {
  const [talkId, setTalkId] = useState<number | null>(null);
  const [market, setMarket] = useState<"free" | "expiring" | "all">("free");
  const [said, setSaid] = useState<Record<string, string>>({});
  const openTalks = (kind: "driver" | "junior", targetId: string) => {
    const r = d({ type: "talkOpen", kind, targetId });
    const t = r.state.talks.find((x) => x.targetId === targetId && x.status !== "closed");
    if (r.ok && t) setTalkId(t.id);
  };
  const talkTo = (kind: "driver" | "junior" | "manager", targetId: string, topic: string) => {
    const r = d({ type: "talkPrivate", kind, targetId, topic });
    setSaid((p) => ({ ...p, [`${kind}:${targetId}`]: r.message }));
  };
  const [role, setRole] = useState<string>("all");
  const me = driversOf(s, s.teamId);
  const staff = Object.values(s.staff).filter((x) => x.teamId === s.teamId);
  const freeDrivers = s.freeDrivers.map((id) => s.drivers[id]).filter((x) => x && !x.retired).sort((a, b) => b.spec.pace - a.spec.pace).slice(0, 12);
  const marketList = (market === "free" ? freeDrivers : Object.values(s.drivers).filter((x) => !x.retired && x.teamId && x.teamId !== s.teamId && (market === "all" || x.endYear <= s.year)).sort((a, b) => b.spec.pace - a.spec.pace).slice(0, 14));
  const myManagers = Object.values(s.managers ?? {}).filter((m) => m.mood[s.teamId] !== undefined || clientsOf(s, m).some((id) => s.drivers[id]?.teamId === s.teamId || s.academy.prospects[id]?.owner === s.teamId || s.talks.some((t) => t.targetId === id))).slice(0, 8);
  const freeStaff = s.freeStaff.map((id) => s.staff[id]).filter((x) => x && (role === "all" || x.role === role)).slice(0, 14);
  const [fd, setFd] = useState<string>("");
  const [bid, setBid] = useState<number>(1);
  const [yrs, setYrs] = useState<number>(2);
  const interns = (s.internPool ?? []).map((id) => s.staff[id]).filter((x) => x && !x.teamId);
  const myInterns = staff.filter((x) => x.intern);
  const open = s.promises.filter((p) => p.kept === undefined);
  return (
    <>
    {talkId !== null && <TalkPanel s={s} d={d} id={talkId} onClose={() => setTalkId(null)} />}
    <Sub id="people" tabs={[
      { k: "drivers", label: "DRIVERS", n: s.talks.filter((t) => t.status !== "closed").length },
      { k: "staff", label: "STAFF" },
      { k: "market", label: "DRIVER MARKET" },
      { k: "hire", label: "HIRING" },
      { k: "crew", label: "PIT CREW" },
      { k: "talks", label: "CONVERSATIONS", n: (s.convos ?? []).filter((c) => c.open).length },
    ]}>
      {(tab) => (
        <>
          {tab === "drivers" && (
            <div className="c-cols">
              <div>
                {s.talks.some((t) => t.status !== "closed") && (
          <section className="panel">
            <h3>TALKS IN PROGRESS</h3>
            <ul className="c-notes">
              {s.talks.filter((t) => t.status !== "closed").map((t) => <li key={t.id}><button className="linkish" onClick={() => setTalkId(t.id)}>{talkLabel(t, s)}</button></li>)}
            </ul>
            <p className="dim small">Replies take a day or two. Talks about replacing a driver can leak to the press, and the driver at risk reads it.</p>
          </section>
        )}
                <section className="panel">
          <h3>YOUR DRIVERS</h3>
          {me.map((x) => (
            <div className="c-item" key={x.id}>
              <div className="c-line">
                <DriverPortrait code={x.spec.code} teamColor={hex(teamColour(s))} seed={x.id} mood={x.gStage >= 5 ? "gone" : x.gStage >= 4 ? "angry" : x.gStage >= 2 ? "tense" : x.morale > 0.65 && x.gStage === 0 ? "happy" : "ok"} size={64} />
                <div>
                  <b><PLink kind="driver" id={x.id}>{x.spec.name}</PLink></b> {s.academy.graduates.includes(x.id) && <span className="tag" title="Raised in your academy. Fans and the board enjoy his points.">MADE HERE</span>} <span className="dim">age {ageOf(s, x)} | pace {paceWord(s, x)} (P{paceRank(s, x)} of the grid) | potential {x.potential > 0.75 ? "high" : x.potential > 0.5 ? "some" : "limited"}</span>
                  <p className="small">{fmtMoney(x.salary)} a year until {x.endYear} | {x.next ? "has signed elsewhere for next year" : x.role === "number1" ? "number one" : x.role === "number2" ? "number two" : "equal status"}</p>
                </div>
                <div className="c-acts">
                  <button className="btn" onClick={() => openTalks("driver", x.id)} title="Open talks about a new deal. He will not answer straight away.">EXTEND (TALKS)</button>
                  <button className="btn" onClick={() => d({ type: "meeting", driverId: x.id })} title="Sit down with him. He says what is on his mind and you answer. Once a week.">TALK TO HIM</button>
                </div>
              </div>
              <div className="c-row"><span>Happiness <Tip text="A full green bar means he is happy. It drains as real grievances build up (listed below) and he reacts at each step, from quiet to wanting out." /></span><b className={x.gStage >= 3 ? "bad" : x.gStage === 0 ? "good" : ""}>{G_STAGE[x.gStage]}</b><Bar v={1 - x.grievance} max={1} color={x.gStage >= 3 ? "var(--red)" : x.gStage >= 1 ? "var(--yellow)" : "var(--green)"} /></div>
              <div className="c-row"><span>Trust in you <Tip text="Does he believe what you say? Kept promises raise it, broken ones cut it. Low trust makes your promises worth little in contract talks." /></span><b className={x.trust < 0.35 ? "bad" : ""}>{x.trust > 0.7 ? "high" : x.trust > 0.45 ? "fair" : "low"}</b><Bar v={x.trust} max={1} color={x.trust < 0.35 ? "var(--red)" : "var(--hot)"} /></div>
              <Why x={x} />
              <div className="c-row"><span>Have a word <Tip text="A private conversation. He tells you something true if he trusts you, and the polite version if he does not. Each topic can be raised once every ten days." /></span><div className="seg">{DRIVER_TOPICS.map((tp) => <button key={tp.id} onClick={() => talkTo("driver", x.id, tp.id)} title={tp.hint}>{tp.label}</button>)}</div></div>
              {said[`driver:${x.id}`] && <p className="c-bubble them">{said[`driver:${x.id}`]}</p>}
              <div className="c-row"><span>Promise him <Tip text="Eases his unrest a little now. It is written down and judged on a date (shown when you make it). Kept: trust grows. Broken: trust falls and the grievance returns. Hover a button to see exactly what it means and how it is judged." /></span><div className="seg">{(["upgrade", "seat", "number1", "title", "academy", "noSwap"] as const).map((k) => <button key={k} onClick={() => d({ type: "promise", driverId: x.id, kind: k })} title={`${PROMISE_TEXT[k]}. ${PROMISE_JUDGE[k]}`}>{k === "number1" ? "NO. 1" : k === "seat" ? "SAFE SEAT" : k === "noSwap" ? "NO SWAP" : k === "title" ? "TOP 3 CAR" : k === "academy" ? "ACADEMY SEAT" : "UPGRADE"}</button>)}</div></div>
              <div className="c-row"><span>Status</span><div className="seg">{(["number1", "equal", "number2"] as const).map((r) => <button key={r} className={x.role === r ? "on" : ""} onClick={() => d({ type: "setRole", driverId: x.id, role: r })}>{r === "number1" ? "NUMBER ONE" : r === "equal" ? "EQUAL" : "NUMBER TWO"}</button>)}</div></div>
            </div>
          ))}
        </section>
                {open.length > 0 && (
          <section className="panel">
            <h3>PROMISES YOU MADE</h3>
            <ul className="c-notes small">
              {open.map((p) => <li key={p.id}><b>{s.drivers[p.driverId]?.spec.name}</b>: {p.text}. Judged on {fmtDay(p.due)}. <span className="dim">{PROMISE_JUDGE[p.kind]}</span></li>)}
            </ul>
            <p className="dim small">A promise kept builds trust. A promise broken costs trust and feeds his grievance for months.</p>
          </section>
        )}
              </div>
              <div>
                {me.length >= 2 && (
          <section className="panel">
            <h3>DRESSING ROOM AND PRESS</h3>
            <div className="c-row"><span>Between your drivers <Tip text="Two drivers of similar speed fight for the same seat at the front. Causes: equal pace, level points, contact, team orders, a shortage of upgrades. At feud level it costs consistency on track, and at open war a lot." /></span><b className={s.rift.stage >= 2 ? "bad" : ""}>{RIFT_WORD[s.rift.stage]}</b><Bar v={s.rift.heat} max={1} color={s.rift.stage >= 2 ? "var(--red)" : "var(--hot)"} /></div>
            {Object.entries(s.rift.causes).filter(([, v]) => v > 0.02).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => <p className="dim small" key={k}>{RIFT_CAUSE[k] ?? k}</p>)}
            <div className="c-row"><span>The press <Tip text="How the media feel about the team. It follows results, honesty and what you said before. It moves fan mood, sponsor mood and driver morale every week, and hurts the board when hostile." /></span><b className={s.press.mood < -0.3 ? "bad" : ""}>{pressWord(s.press.mood)}</b><Bar v={s.press.mood + 1} max={2} color={s.press.mood < -0.3 ? "var(--red)" : "var(--hot)"} /></div>
            {s.press.quotes.filter((q) => !q.called).slice(-3).map((q, i) => <p className="dim small" key={i}>On record, {fmtDay(q.day)}: "{q.text}"</p>)}
            <p className="dim small">Anything you say in a press conference is remembered. If the facts later disagree, the press will quote it back.</p>
          </section>
        )}
                <section className="panel">
          <h3>CONTRACT TIMELINE</h3>
          <div className="c-tl">
            {[0, 1, 2, 3, 4].map((k) => <span key={k} className="c-tl-y">{s.year + k}</span>)}
            {me.map((x) => (
              <div className="c-tl-row" key={x.id}>
                <b>{x.spec.code}</b>
                <i className="c-tl-bar" style={{ gridColumn: `2 / span ${Math.max(1, Math.min(5, x.endYear - s.year + 1))}` }}>{x.optionYear && x.optionYear > x.endYear ? "option" : fmtMoney(x.salary)}</i>
              </div>
            ))}
            {Object.values(s.staff).filter((x) => x.teamId === s.teamId && (x.role === "td" || x.role === "designer")).map((x) => (
              <div className="c-tl-row" key={x.id}>
                <b>{x.role === "td" ? "TD" : "DES"}</b>
                <i className="c-tl-bar alt" style={{ gridColumn: `2 / span ${Math.max(1, Math.min(5, x.endYear - s.year + 1))}` }}>{x.name.split(" ").pop()}</i>
              </div>
            ))}
          </div>
          <p className="dim small">Bars run to the last year of each deal. Expiring deals are the ones to talk about first.</p>
        </section>
              </div>
            </div>
          )}
          {tab === "staff" && (
            <div>
              <section className="panel">
          <h3>YOUR STAFF</h3>
          {staff.map((x) => (
            <div className="c-item" key={x.id}>
              <div className="c-line sf-line">
                <div>
                  <b><PLink kind="staff" id={x.id}>{x.name}</PLink></b> <span className="dim">{STAFF_LABEL[x.role]}{x.driverId ? ` for ${s.drivers[x.driverId]?.spec.code}` : ""}</span>
                  <p className="small">{staffWords(s, x)} | {x.traits.join(", ") || "no standout traits"} | {fmtMoney(x.salary)} until {x.endYear} | mood {x.mood > 0.65 ? "good" : x.mood > 0.45 ? "fair" : "low"}</p>
                  {x.role !== "mechanic" && x.role !== "strategy" && x.role !== "scout" && x.role !== "coach" && <StaffFit s={s} st={x} />}
                </div>
                <div className="c-acts">
                  {x.intern && <button className="btn" title="Make him a permanent member of the department" onClick={() => setSaid((p) => ({ ...p, [`staff:${x.id}`]: d({ type: "promoteIntern", staffId: x.id }).message }))}>PROMOTE</button>}
                  <button className="btn" onClick={() => d({ type: "releaseStaff", staffId: x.id })}>RELEASE</button>
                </div>
                {said[`staff:${x.id}`] && <p className="small c-bubble them">{said[`staff:${x.id}`]}</p>}
              </div>
            </div>
          ))}
        </section>
            </div>
          )}
          {tab === "market" && (
            <div className="c-cols">
              <div>
                <section className="panel">
          <h3>DRIVER MARKET</h3>
          <p className="dim small">Opening talks costs nothing, but nothing is instant: replies take days, and an agent may play you against other teams. A driver under contract elsewhere can only be sounded out until his deal runs down, and a tap-up can leak.</p>
          <div className="seg">
            {([["free", "FREE AGENTS"], ["expiring", "DEALS ENDING"], ["all", "UNDER CONTRACT"]] as const).map(([k, l]) => <button key={k} className={market === k ? "on" : ""} onClick={() => setMarket(k)}>{l}</button>)}
          </div>
          {marketList.map((x) => {
            const tk = s.talks.find((t) => t.targetId === x.id && t.status !== "closed");
            return (
              <div className="c-item" key={x.id}>
                <div className="c-line">
                  <div>
                    <b><PLink kind="driver" id={x.id}>{x.spec.name}</PLink></b> <span className="dim">age {ageOf(s, x)} | {paceWord(s, x)} | {x.teamId ? `${teamOf(x.teamId)?.short ?? ""}, deal ends ${x.endYear}` : "free agent"}</span>
                    {x.teamId && x.gStage >= 3 && <p className="small warn">Reported unhappy where he is.</p>}
                  </div>
                  <div className="c-acts"><button className="btn" onClick={() => (tk ? setTalkId(tk.id) : openTalks("driver", x.id))}>{tk ? "CONTINUE TALKS" : "OPEN TALKS"}</button></div>
                </div>
              </div>
            );
          })}
        </section>
              </div>
              <div>
                <section className="panel">
          <h3>AGENTS</h3>
          <p className="dim small">Agents speak for several drivers and juniors and talk to every team. How they feel about you carries across all their clients.</p>
          {myManagers.map((m) => {
            const mood = managerMood(m, s.teamId);
            const clients = clientsOf(s, m);
            return (
              <div className="c-item" key={m.id}>
                <b>{m.name}</b> <span className="dim">{m.style === "shark" ? "plays teams against each other" : m.style === "loyal" ? "loyal to his clients" : "quiet operator"} | {clients.length} clients | towards you: </span><b className={mood < 0.35 ? "bad" : mood > 0.7 ? "good" : ""}>{mood > 0.7 ? "warm" : mood > 0.45 ? "neutral" : mood > 0.3 ? "irritated" : "angry"}</b>
                <Bar v={mood} max={1} color={mood < 0.35 ? "var(--red)" : "var(--green)"} />
                <div className="seg">{MANAGER_TOPICS.map((tp) => <button key={tp.id} onClick={() => talkTo("manager", m.id, tp.id)} title={tp.hint}>{tp.label}</button>)}</div>
                {said[`manager:${m.id}`] && <p className="c-bubble them">{said[`manager:${m.id}`]}</p>}
              </div>
            );
          })}
        </section>
                <section className="panel">
          <h3>RUMOURS</h3>
          <p className="dim small">Paddock talk. Some of it is true: a team with a real interest will usually try to sign the driver when his deal ends. Some is noise.</p>
          {s.rumours.slice(0, 6).map((r, i) => <p key={i} className="small"><span className="dim">{fmtDay(r.day)}</span> {r.text}</p>)}
          {s.rumours.length === 0 && <p className="dim small">Quiet at the moment.</p>}
        </section>
              </div>
            </div>
          )}
          {tab === "crew" && (
            <section className="panel">
              <h3>PIT CREW</h3>
              <CrewPanel s={s} d={d} />
            </section>
          )}
          {tab === "talks" && (
            <section className="panel">
              <h3>CONVERSATIONS WITH YOUR DRIVERS</h3>
              <p className="dim small">Drivers ask for a word when something bothers them: their status, the car, their pay, a promise, a strategy call. What they say depends on what has happened. Use TALK TO HIM on a profile to start one yourself.</p>
              {(s.convos ?? []).slice().reverse().slice(0, 14).map((c) => (
                <div className="c-item" key={c.id}>
                  <b><PLink kind="driver" id={c.driverId}>{s.drivers[c.driverId]?.spec.name}</PLink></b> <span className="dim small">{fmtDay(c.day)} | {c.open ? "open" : c.outcome ?? "closed"}</span>
                  {c.lines.map((l, i) => <p key={i} className={`small ${l.who === "you" ? "dim" : ""}`}>{l.who === "him" ? "He: " : l.who === "you" ? "You: " : ""}{l.text}</p>)}
                </div>
              ))}
              {(s.convos ?? []).length === 0 && <p className="dim small">None yet.</p>}
            </section>
          )}
          {tab === "hire" && (
            <div>
              <section className="panel">
          <h3>STAFF MARKET</h3>
          <div className="c-row">
            <label className="dim small">Role <select value={role} onChange={(e) => setRole(e.target.value)}><option value="all">All</option>{Object.entries(STAFF_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="dim small">Engineer works with <select value={fd} onChange={(e) => setFd(e.target.value)}><option value="">(no driver)</option>{me.map((x) => <option key={x.id} value={x.id}>{x.spec.code}</option>)}</select></label>
          </div>
          <div className="c-row">
            <label className="dim small">Offer <select value={bid} onChange={(e) => setBid(Number(e.target.value))}><option value={0.9}>10% under the ask</option><option value={1}>the ask</option><option value={1.1}>10% over</option><option value={1.25}>25% over</option></select></label>
            <label className="dim small">Length <select value={yrs} onChange={(e) => setYrs(Number(e.target.value))}><option value={1}>1 year</option><option value={2}>2 years</option><option value={3}>3 years</option></select></label>
          </div>
          <p className="dim small">Pay is only part of an offer. Your team's name, money, mood and facilities change who says yes.</p>
          {freeStaff.map((x) => (
            <div className="c-item" key={x.id}>
              <div className="c-line sf-line">
                <div>
                  <b><PLink kind="staff" id={x.id}>{x.name}</PLink></b> <span className="dim">{STAFF_LABEL[x.role]}, age {x.age}</span>
                  <p className="small">{staffWords(s, x)} | {x.traits.join(", ") || "no standout traits"} | asks {fmtMoney(staffAsk(x))} | chance they accept {Math.round(readOffer(s, s.teamId, x, round2(staffAsk(x) * bid), yrs).chance * 100)}%</p>
                  {x.role !== "mechanic" && x.role !== "strategy" && x.role !== "scout" && x.role !== "coach" && <StaffFit s={s} st={x} />}
                  {said[`staff:${x.id}`] && <p className="small c-bubble them">{said[`staff:${x.id}`]}</p>}
                </div>
                <div className="c-acts"><button className="btn" onClick={() => setSaid((p) => ({ ...p, [`staff:${x.id}`]: d({ type: "signStaff", staffId: x.id, offerSalary: round2(staffAsk(x) * bid), years: yrs, forDriverId: x.role === "engineer" ? fd || undefined : undefined }).message }))}>OFFER {fmtMoney(staffAsk(x) * bid)}</button></div>
              </div>
            </div>
          ))}
          <h3 style={{ marginTop: 10 }}>TRAINEES</h3>
          <p className="dim small">Young engineers learning a department. {fmtMoney(INTERN_PAY)} a year each plus a sliver of cap room. They improve faster with a strong head of department, good tools and a calm team. Space: {myInterns.length} of {1 + Math.floor(s.teams[s.teamId].facilities.factory / 2)}.</p>
          {interns.map((x) => (
            <div className="c-item" key={x.id}>
              <div className="c-line">
                <div>
                  <b><PLink kind="staff" id={x.id}>{x.name}</PLink></b> <span className="dim">trainee {STAFF_LABEL[x.role].toLowerCase()}, age {x.age}</span>
                  <p className="small">Now about {Math.round(x.skill)}, could reach {x.known >= 0.3 ? Math.round(x.intern!.potential) : "somewhere between " + Math.round(x.intern!.potential - 15) + " and " + Math.round(x.intern!.potential + 15)}.</p>
                  {said[`staff:${x.id}`] && <p className="small c-bubble them">{said[`staff:${x.id}`]}</p>}
                </div>
                <div className="c-acts"><button className="btn" onClick={() => setSaid((p) => ({ ...p, [`staff:${x.id}`]: d({ type: "signIntern", staffId: x.id }).message }))}>TAKE ON</button></div>
              </div>
            </div>
          ))}
          <h3 style={{ marginTop: 10 }}>POACH FROM A RIVAL</h3>
          <p className="dim small">Offer more than they earn. The rival may counter, loyal people rarely move, and a team that loses its technical director or designer finds fewer ideas for about four months. Rivals do the same to you.</p>
          {Object.values(s.staff).filter((x) => x.teamId && x.teamId !== s.teamId && (role === "all" || x.role === role) && x.skill >= 66).sort((a, b) => b.skill - a.skill).slice(0, 8).map((x) => (
            <div className="c-item" key={x.id}>
              <div className="c-line">
                <div>
                  <b><PLink kind="staff" id={x.id}>{x.name}</PLink></b> <span className="dim">{STAFF_LABEL[x.role]} at {teamOf(x.teamId)?.name ?? x.teamId}</span>
                  <p className="small">{staffWords(s, x)} | {x.traits.join(", ") || "no standout traits"} | earns {fmtMoney(x.salary)}</p>
                </div>
                <div className="c-acts"><button className="btn" onClick={() => d({ type: "poachStaff", staffId: x.id, offerSalary: round2(Math.max(staffAsk(x), x.salary) * 1.3) })}>APPROACH {fmtMoney(Math.max(staffAsk(x), x.salary) * 1.3)}</button></div>
              </div>
            </div>
          ))}
        </section>
            </div>
          )}
        </>
      )}
    </Sub>
    </>
  );
}
