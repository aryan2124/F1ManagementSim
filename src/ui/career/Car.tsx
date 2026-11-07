import { useState } from "react";
import { COMPS, branchName, nodeOf, slotsOf, buildSpeed, skillOfFactory, treeOf, type CompId } from "../../career/ctree";
import { facilityCost } from "../../career/finance";
import { fmtDay, fmtMoney } from "../../career/util";
import { CARDS, isPromising } from "../../career/leadcards";
import { type Props } from "./common";
import { RadialTree } from "./RadialTree";
import { activeDrivers } from "../../career/car";
import type { Delegation, Level } from "../../career/types";

const LEVELS: { k: Level; label: string }[] = [
  { k: "advise", label: "ME" },
  { k: "do", label: "THEM" },
  { k: "hands", label: "HANDS OFF" },
];

export function SpendLog({ s }: { s: Props["s"] }) {
  const [kind, setKind] = useState<"cap" | "tunnel" | "cash">("cap");
  const rows = s.spendLog.filter((e) => e[kind] !== 0).slice(0, 14);
  const unit = (v: number) => (kind === "tunnel" ? `${v > 0 ? "+" : ""}${Math.round(v)} h` : `${v > 0 ? "+" : ""}${fmtMoney(v)}`);
  return (
    <section className="panel">
      <h3>WHERE DID IT GO?</h3>
      <div className="seg">
        {(["cap", "tunnel", "cash"] as const).map((k) => <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{k === "cap" ? "CAP ROOM" : k === "tunnel" ? "TUNNEL HOURS" : "CASH"}</button>)}
      </div>
      {rows.length === 0 && <p className="dim">Nothing logged yet.</p>}
      <ul className="c-notes small">
        {rows.map((e, i) => (
          <li key={i}><span className="dim">{fmtDay(e.day)}</span> {e.text} <b className={e[kind] < 0 ? "bad" : ""}>{unit(e[kind])}</b></li>
        ))}
      </ul>
    </section>
  );
}

/** The car and its six main components, one card each. Tap a card to open that component's skill tree. */
export function Car({ s, d }: Props) {
  const me = s.teams[s.teamId];
  const tr = treeOf(s, me);
  const [parts, setParts] = useState(false);
  const [msg, setMsg] = useState("");
  const slots = slotsOf(me);
  const busy = tr.builds.length;
  const skill = Math.round(skillOfFactory(s, s.teamId));
  const speed = buildSpeed(s, s.teamId);
  const leads = Object.values(s.staff).filter((x) => x.teamId === s.teamId && !x.intern && x.card);
  const promising = Object.values(s.staff).filter((x) => x.teamId === s.teamId && isPromising(x));
  const built = Object.values(tr.parts);
  const drivers = activeDrivers(s, s.teamId).map((id) => s.drivers[id]?.spec.code ?? id);

  const byId = (id: CompId) => COMPS.find((c) => c.id === id)!;

  return (
    <div className="car2" data-testid="car-screen">
      <section className="panel car2-fac">
        <div className="car2-slots" aria-label={`${busy} of ${slots} factory slots busy`}>
          <b>FACTORY</b>
          {Array.from({ length: slots }, (_, i) => <i key={i} className={i < busy ? "on" : ""} />)}
          <span className="dim small">{busy} of {slots} slots</span>
        </div>
        <span className="sk-chip" title="Average skill of your technical director, designer and the aero and power heads">SKILLED LABOUR {skill}</span>
        <span className="sk-chip" title="Days of work done per day">BUILD SPEED x{speed.toFixed(2)}</span>
        {leads.map((l) => {
          const c = CARDS.find((x) => x.id === l.card);
          const shown = c && (!c.hidden || l.cardSeen);
          return <span key={l.id} className={`sk-chip lead ${shown ? "" : "secret"}`} title={shown ? `${l.name}: ${c!.text}` : `${l.name} carries a card nobody has seen yet`}>{shown ? c!.name.toUpperCase() : "? ? ?"}</span>;
        })}
        {promising.map((p) => <span key={p.id} className="sk-chip promising" title={`${p.name} has something. Keep him working.`}>PROMISING: {p.name.split(" ").slice(-1)[0]}</span>)}
        <span className="car2-grow" />
        <button className={`btn ${parts ? "primary" : ""}`} onClick={() => setParts(!parts)}>PARTS MENU ({built.length})</button>
      </section>

      {parts && (
        <section className="panel car2-parts" data-testid="parts-menu">
          <h3>PARTS MENU</h3>
          <p className="dim small">One build covers both cars. Pick where each part goes. Locked from qualifying until the race is over.</p>
          {built.length === 0 && <p className="dim">Nothing built yet.</p>}
          {built.map((p) => {
            const nd = nodeOf(tr, p.id)!;
            return (
              <div className="car2-part" key={p.id}>
                <div><b>{nd.name}</b><small className="dim"> {byId(nd.comp).name} · {branchName(nd.comp, nd.branch)}{p.tested ? " · tested" : ""}{p.copies < 2 ? " · ONE LEFT" : ""}</small></div>
                <div className="seg">
                  <button className={p.onA ? "on" : ""} onClick={() => setMsg(d({ type: "treeInstall", id: p.id, car: "A", on: !p.onA }).message)}>{drivers[0] ?? "A"}</button>
                  <button className={p.onB ? "on" : ""} onClick={() => setMsg(d({ type: "treeInstall", id: p.id, car: "B", on: !p.onB }).message)}>{drivers[1] ?? "B"}</button>
                  {!p.tested && <button onClick={() => setMsg(d({ type: "treeTest", id: p.id }).message)}>TEST</button>}
                </div>
              </div>
            );
          })}
          {msg && <p className="c-msg">{msg}</p>}
        </section>
      )}

      <RadialTree s={s} d={d} />

      <section className="panel car2-set">
        <FactoryControls s={s} d={d} />
      </section>
    </div>
  );
}

function FactoryControls({ s, d }: Props) {
  const me = s.teams[s.teamId];
  const fac = me.facilities;
  return (
    <>
      <div className="c-row">
        <span>Factory level {fac.factory} <span className="dim small">(more slots, faster builds)</span></span>
        <button className="tiny" disabled={fac.factory >= 5 || !!fac.building} onClick={() => d({ type: "upgradeFacility", which: "factory" })}>{fac.factory >= 5 ? "MAX" : `UPGRADE ${fmtMoney(facilityCost(fac.factory))}`}</button>
      </div>
      {fac.building && <p className="small">Building: {fac.building.which}, done {fmtDay(fac.building.done)}.</p>}
      {(["rnd", "parts"] as (keyof Delegation)[]).map((k) => (
        <div className="c-row" key={k}>
          <span>{k === "rnd" ? "Who picks what to build" : "Who fits new parts"}</span>
          <div className="seg">{LEVELS.map((l) => <button key={l.k} className={me.delegation[k] === l.k ? "on" : ""} onClick={() => d({ type: "delegate", area: k, level: l.k })}>{l.label}</button>)}</div>
        </div>
      ))}
    </>
  );
}
