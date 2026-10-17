import { useEffect, useState } from "react";
import { askingSalary, ageOf, canApproach } from "../../career/contracts";
import { askRetainer } from "../../career/academy";
import { driversOf } from "../../career/finance";
import { managerMood } from "../../career/talks";
import { PROMISE_TEXT } from "../../career/people";
import type { DriverRole, Offer, PromiseKind, Talk } from "../../career/types";
import { fmtDay, fmtMoney, round2 } from "../../career/util";
import { Tip, paceWord, type Props } from "./common";

const ROLES: { k: DriverRole; label: string }[] = [
  { k: "number1", label: "NUMBER ONE" },
  { k: "equal", label: "EQUAL" },
  { k: "number2", label: "NUMBER TWO" },
];
const PROMISES: { k: PromiseKind; label: string }[] = [
  { k: "number1", label: "NO. 1" },
  { k: "seat", label: "SAFE SEAT" },
  { k: "noSwap", label: "NO SWAP" },
  { k: "title", label: "TOP 3 CAR" },
  { k: "academy", label: "ACADEMY SEAT" },
];
const INTEREST: Record<string, string> = {
  keen: "KEEN: he would like to hear from you",
  open: "OPEN: he would listen",
  cool: "COOL: settled, hard to move",
  cold: "COLD: not interested",
};

/** The conversation, with the offer you are working on underneath. */
export function TalkPanel({ s, d, id, onClose }: Props & { id: number; onClose: () => void }) {
  const t = s.talks.find((x) => x.id === id);
  const drv = t?.kind === "driver" ? s.drivers[t.targetId] : undefined;
  const pro = t?.kind === "junior" ? s.academy.prospects[t.targetId] : undefined;
  const mine = driversOf(s, s.teamId);
  const ask = drv ? askingSalary(s, drv) : 0;
  const [salary, setSalary] = useState(round2(ask || 1));
  const [years, setYears] = useState(2);
  const [role, setRole] = useState<DriverRole>("equal");
  const [promise, setPromise] = useState<PromiseKind | "">("");
  const [option, setOption] = useState(false);
  const [perf, setPerf] = useState(false);
  const [replaces, setReplaces] = useState<string | null | undefined>(undefined);
  const [ret, setRet] = useState(pro ? askRetainer(s, pro) : 0.6);
  const [buyout, setBuyout] = useState(3);
  const [fr, setFr] = useState(true);
  const unread = !!t?.unread;
  useEffect(() => {
    if (unread) d({ type: "markRead", what: "talk", id });
  }, [unread, id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!t || (!drv && !pro)) return null;
  const name = drv?.spec.name ?? pro!.name;
  const mgr = t.manager ? s.managers[t.manager] : null;
  const mood = mgr ? managerMood(mgr, s.teamId) : null;
  const can = drv ? canApproach(s, drv.id) : { ok: true };
  const needsReplace = t.kind === "driver" && t.topic !== "extend" && mine.length >= 2;
  const offer: Offer = { salary, years, role, ...(promise ? { promise } : {}), ...(option ? { option } : {}), ...(perf ? { perf } : {}) };
  const act = (a: Parameters<typeof d>[0]) => d(a);
  const fuzz = ask ? `${fmtMoney(ask * 0.85, 0)} to ${fmtMoney(ask * 1.15, 0)}` : "";
  const closed = t.status === "closed";
  const busy = t.status === "waiting";
  const canOffer = t.status === "open" || t.status === "agreed";
  const sendOffer = (o: Offer) => act({ type: "talkOffer", id: t.id, offer: o, replaces: t.topic === "extend" ? null : replaces });
  return (
    <section className="panel c-neg c-talk">
      <h3>{t.topic === "extend" ? "TALKS WITH" : t.kind === "junior" ? "ACADEMY TALKS WITH" : "TALKS WITH"} {name.toUpperCase()}</h3>
      <p className="dim small">
        {drv ? `Age ${ageOf(s, drv)}. ${paceWord(s, drv)}. ${drv.teamId && drv.teamId !== s.teamId ? "Under contract elsewhere." : drv.teamId === s.teamId ? "Your driver." : "A free agent."}` : `A ${pro!.series.toUpperCase()} prospect, age ${s.year - pro!.born}.`}
        {mgr && <> His agent is <b>{mgr.name}</b> ({mgr.style === "shark" ? "a shark: plays teams against each other" : mgr.style === "loyal" ? "loyal to his clients' happiness" : "a quiet operator"}). {mood !== null && <>Towards you: <b className={mood < 0.35 ? "bad" : ""}>{mood > 0.7 ? "warm" : mood > 0.45 ? "neutral" : mood > 0.3 ? "irritated" : "angry"}</b>.</>} <Tip text="An agent speaks for several drivers and talks to every team. Offers that insult him sour him towards you for all his clients, and an angry agent stops taking your calls for weeks." /></>}
      </p>
      {t.interest && <p className="small"><b>How he feels about a move: </b>{INTEREST[t.interest]}</p>}
      {t.priority && <p className="small"><b>What matters most to him: </b>{t.priority}</p>}
      <div className="c-chat" aria-live="polite">
        {t.lines.map((l, i) => (
          <p key={i} className={`c-bubble ${l.who}`}><em>{fmtDay(l.day)}</em> {l.text}</p>
        ))}
        {busy && <p className="c-bubble wait"><em>...</em> Waiting for a reply. Expected {t.replyOn ? fmtDay(t.replyOn) : "soon"}. You can carry on with the game in the meantime.</p>}
        {t.status === "agreed" && <p className="c-bubble deal">Agreed in principle. {t.agreedUntil ? `Sign by ${fmtDay(t.agreedUntil)} or it lapses.` : ""}</p>}
      </div>
      {t.leaked && <p className="warn small">This has leaked to the press.</p>}

      {!closed && canOffer && t.status === "open" && ((t.kind === "driver" && t.topic !== "extend" && !t.soundedOut) || !t.askedPriority) && (
        <div className="row-btns">
          {t.kind === "driver" && t.topic !== "extend" && !t.soundedOut && <button className="btn" onClick={() => act({ type: "talkSound", id: t.id })} title="A quiet, deniable feeler: would he listen to a team like yours? It can leak if he is under contract. You can do this once.">SOUND HIM OUT</button>}
          {!t.askedPriority && <button className="btn" onClick={() => act({ type: "talkAsk", id: t.id })} title="Ask what matters most to him: money, the car, status or something else. You can ask once.">ASK WHAT MATTERS TO HIM</button>}
        </div>
      )}

      {!closed && t.status === "agreed" && t.kind === "driver" && t.agreed && (
        <div className="c-deal">
          <p><b>Terms agreed:</b> {fmtMoney(t.agreed.salary)} a year for {t.agreed.years} years, {t.agreed.role === "number1" ? "number one" : t.agreed.role === "equal" ? "equal status" : "number two"}{t.agreed.promise ? `, promise: ${PROMISE_TEXT[t.agreed.promise].toLowerCase()}` : ""}.</p>
          {needsReplace && (
            <div className="c-row"><span>He replaces</span><div className="seg">{mine.map((m) => <button key={m.id} className={(replaces ?? t.replaces) === m.id ? "on" : ""} onClick={() => setReplaces(m.id)}>{m.spec.code}</button>)}</div></div>
          )}
          <div className="row-btns">
            <button className="btn primary big" disabled={needsReplace && !(replaces ?? t.replaces)} onClick={() => act({ type: "talkSign", id: t.id, replaces: replaces ?? t.replaces })}>{needsReplace && !(replaces ?? t.replaces) ? "CHOOSE WHO HE REPLACES" : "SIGN THE CONTRACT"}</button>
          </div>
          {needsReplace && <p className="dim small">The driver you pick is released with a payout of half his remaining deal, but only when you sign. Nothing happens to anyone before that.</p>}
        </div>
      )}
      {!closed && t.status === "agreed" && t.kind === "junior" && t.junior && (
        <div className="c-deal">
          <p><b>Terms agreed:</b> {fmtMoney(t.junior.retainer)} a year for {t.junior.years} years, buyout {fmtMoney(t.junior.buyout, 0)}{t.junior.firstRefusal ? ", first refusal on his F1 contract" : ""}.</p>
          <div className="row-btns"><button className="btn primary big" onClick={() => act({ type: "talkSign", id: t.id })}>SIGN HIM</button></div>
        </div>
      )}

      {!closed && canOffer && t.kind === "driver" && (
        <div className="c-offer">
          <h4>{t.status === "agreed" ? "OR CHANGE THE TERMS" : "YOUR OFFER"}</h4>
          {t.counter && <p className="small">Their last counter: about <b>{fmtMoney(t.counter.salary)}</b> a year. <button className="tiny" onClick={() => { setSalary(t.counter!.salary); }}>USE IT</button></p>}
          <p className="dim small">He is thought to be worth {fuzz}, but you will only know where the line is from how he reacts.</p>
          <div className="c-row"><span>Salary {fmtMoney(salary)}</span><input type="range" min={Math.max(0.5, ask * 0.4)} max={Math.max(ask * 2, 1)} step={0.1} value={salary} onChange={(e) => setSalary(round2(Number(e.target.value)))} /></div>
          <div className="c-row"><span>Years</span><div className="seg">{[1, 2, 3, 4].map((y) => <button key={y} className={years === y ? "on" : ""} onClick={() => setYears(y)}>{y}</button>)}</div></div>
          <div className="c-row"><span>Role</span><div className="seg">{ROLES.map((r) => <button key={r.k} className={role === r.k ? "on" : ""} onClick={() => setRole(r.k)}>{r.label}</button>)}</div></div>
          <div className="c-row"><span>Promise <Tip text="A sweetener written into the talks. He weighs it like money, more if he cares about it. It is judged on a date: kept builds trust, broken costs trust and feeds a grievance." /></span><div className="seg"><button className={promise === "" ? "on" : ""} onClick={() => setPromise("")}>NONE</button>{PROMISES.map((p) => <button key={p.k} className={promise === p.k ? "on" : ""} onClick={() => setPromise(p.k)} title={PROMISE_TEXT[p.k]}>{p.label}</button>)}</div></div>
          {promise && <p className="dim small">{PROMISE_TEXT[promise]}.</p>}
          <div className="c-row"><span>Clauses</span><label className="small"><input type="checkbox" checked={option} onChange={(e) => setOption(e.target.checked)} /> TEAM OPTION YEAR</label> <label className="small"><input type="checkbox" checked={perf} onChange={(e) => setPerf(e.target.checked)} /> PERFORMANCE BONUS</label></div>
          {needsReplace && (
            <div className="c-row"><span>If he signs, he replaces <Tip text="You must say who. Talks about replacing a driver can leak, and the driver you name will read about it. Nobody is released until you sign." /></span><div className="seg">{mine.map((m) => <button key={m.id} className={replaces === m.id ? "on" : ""} onClick={() => setReplaces(m.id)}>{m.spec.code}</button>)}</div></div>
          )}
          {!can.ok && <p className="dim small">{can.why} Until his deal runs down you can only sound him out and ask what matters to him.</p>}
          <div className="row-btns">
            <button className="btn primary" disabled={(!can.ok && t.topic === "sound") || (needsReplace && replaces === undefined)} onClick={() => sendOffer(offer)}>{needsReplace && replaces === undefined ? "CHOOSE WHO HE REPLACES" : "MAKE THE OFFER"}</button>
          </div>
        </div>
      )}
      {!closed && canOffer && t.kind === "junior" && (
        <div className="c-offer">
          <h4>YOUR ACADEMY OFFER</h4>
          <p className="dim small">His camp is thought to want about {fmtMoney(askRetainer(s, pro!), 2)} a year. A high buyout and first-refusal clauses cost you goodwill.</p>
          <div className="c-row"><span>Retainer {fmtMoney(ret, 2)}</span><input type="range" min={0.2} max={3} step={0.05} value={ret} onChange={(e) => setRet(round2(Number(e.target.value)))} /></div>
          <div className="c-row"><span>Years</span><div className="seg">{[1, 2, 3].map((y) => <button key={y} className={years === y ? "on" : ""} onClick={() => setYears(y)}>{y}</button>)}</div></div>
          <div className="c-row"><span>Buyout {fmtMoney(buyout, 0)}</span><input type="range" min={1} max={10} step={1} value={buyout} onChange={(e) => setBuyout(Number(e.target.value))} /></div>
          <div className="c-row"><span>First refusal</span><label className="small"><input type="checkbox" checked={fr} onChange={(e) => setFr(e.target.checked)} /> HE MUST OFFER YOU HIS F1 DEAL FIRST</label></div>
          <div className="row-btns"><button className="btn primary" onClick={() => act({ type: "talkJuniorOffer", id: t.id, years, retainer: ret, buyout, firstRefusal: fr })}>MAKE THE OFFER</button></div>
        </div>
      )}
      <div className="row-btns">
        {!closed && <button className="btn" onClick={() => { act({ type: "talkClose", id: t.id }); }}>END THE TALKS</button>}
        <button className="btn" onClick={onClose}>HIDE</button>
      </div>
    </section>
  );
}

export function talkLabel(t: Talk, s: Props["s"]): string {
  const n = s.drivers[t.targetId]?.spec.name ?? s.academy.prospects[t.targetId]?.name ?? t.targetId;
  const st = t.status === "waiting" ? `waiting for a reply (${t.replyOn ? fmtDay(t.replyOn) : ""})` : t.status === "agreed" ? "terms agreed: sign it" : t.status === "open" ? "your move" : "over";
  return `${n}: ${st}`;
}
