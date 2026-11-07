import { useEffect, useMemo, useState } from "react";
import { QualiScreen } from "../QualiScreen";
import { loadCircuit } from "../../game/circuits";
import { PracticeController } from "../../career/psession";
import { COMPS, nodeOf, treeOf, type CompId } from "../../career/ctree";
import { fitNumber, fitQuote } from "../../career/fitting";
import { carOf } from "../../career/treeplay";
import { TRIM } from "../../career/setup";
import { fmtMoney } from "../../career/util";
import { useUiTick } from "../hooks";
import { TreeLive } from "./Weekend";
import type { Programme } from "../../career/types";
import type { Props } from "./common";

const SHORT: Record<CompId, string> = { fw: "FRONT WING", rw: "REAR WING", floor: "FLOOR", pu: "POWER UNIT", cool: "COOLING", susp: "SUSPENSION" };
const RUNS: { p: Programme; label: string; help: string }[] = [
  { p: "part", label: "PART TEST", help: "Measures every fitted part against what the staff expected. Cleanest readings." },
  { p: "raceSim", label: "LONG RUN", help: "Heavy fuel, old tyres. Teaches race pace and tyre wear." },
  { p: "setup", label: "SETUP", help: "Tests your slider settings and the driver's complaints." },
  { p: "qualiSim", label: "QUALI SIM", help: "A low fuel flying lap. Builds one-lap confidence." },
];

/** FP1, FP2 and FP3 as a clocked session on the qualifying sim, with the garage drawer beside the cars. */
export function PracticeLive({ s, d, onDone }: Props & { onDone: () => void }) {
  const ws = s.weekend!;
  const ctl = useMemo(() => new PracticeController(s), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const id = window.setInterval(() => { if (ctl.poll().length) d({ type: "touch" }); }, 400);
    return () => window.clearInterval(id);
  }, [ctl, d]);
  const meta = loadCircuit(ws.circuitId).meta;
  return (
    <QualiScreen
      session={ctl.session}
      meta={meta}
      kind="fp"
      practice={{ index: ctl.index, extras: <GarageDrawer s={s} d={d} ctl={ctl} /> }}
      onDone={() => { ctl.finish(); d({ type: "touch" }); onDone(); }}
    />
  );
}

type Tab = "parts" | "runs" | "setup" | "readings" | "log";

/** The car setup sliders inside the session. A change costs minutes and needs both cars in the garage. */
function SetupPane({ s, ctl, act }: { s: Props["s"]; ctl: PracticeController; act: (r: { message: string }) => void }) {
  const ws = s.weekend!;
  const [v, setV] = useState<Record<string, number>>({ ...ws.setup });
  const rows = ws.axes.concat([{ id: TRIM, label: "Trim", low: "Race", high: "Quali" } as never]);
  const dirty = rows.some((a) => Math.abs((v[a.id] ?? 0) - (ws.setup[a.id] ?? 0)) > 1e-6);
  return (
    <div className="gd-setup">
      {rows.map((a) => (
        <label key={a.id} className="gd-slide">
          <span className="small"><b>{a.label.toUpperCase()}</b> <em className="dim">{(v[a.id] ?? 0).toFixed(2)}</em></span>
          <input type="range" min={-1} max={1} step={0.05} value={v[a.id] ?? 0} onChange={(e) => setV({ ...v, [a.id]: Number(e.target.value) })} />
          <span className="small dim">{a.low} / {a.high}</span>
        </label>
      ))}
      <div className="row-btns">
        <button className={`btn${dirty ? " primary" : ""}`} disabled={!dirty} onClick={() => act(ctl.changeSetup(v))}>{dirty ? "SAVE SETUP (3 MIN)" : "SETUP SAVED"}</button>
      </div>
    </div>
  );
}

export function GarageDrawer({ s, d, ctl }: Props & { ctl: PracticeController }) {
  useUiTick(250);
  const [tab, setTab] = useState<Tab>("parts");
  const [rush, setRush] = useState(false);
  const [msg, setMsg] = useState("");
  const me = s.teams[s.teamId];
  const tr = treeOf(s, me);
  const ws = s.weekend!;
  const built = Object.values(tr.parts).map((p) => ({ p, nd: nodeOf(tr, p.id)! })).filter((x) => x.nd);
  const act = (r: { message: string }) => { setMsg(r.message); d({ type: "touch" }); };
  const drivers = ctl.humanIds.map((h) => ({ id: h, car: carOf(s, me.id, h), code: s.drivers[h]?.spec.code ?? h }));
  return (
    <section className="panel gd" data-testid="garage-drawer">
      <h3>GARAGE DRAWER</h3>
      <div className="seg gd-tabs">
        {([["parts", "PARTS"], ["runs", "RUN FOR"], ["setup", "SETUP"], ["readings", "READINGS"], ["log", "LOG"]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <p className="dim small">Minutes spent on changes: <b>{ws.fitMin ?? 0}</b> of 60. A car being worked on stays in the garage.</p>
      {tab === "parts" && (
        <>
          <label className="small rt-rush"><input type="checkbox" checked={rush} onChange={(e) => setRush(e.target.checked)} /> RUSH changes: quicker, dearer, and a real chance of a bad fit</label>
          <div className="row-btns">
            <button className="tiny" onClick={() => act(ctl.suggested(rush))}>SUGGESTED FIT</button>
          </div>
          <div className="gd-cars">
            {drivers.map((dv) => {
              const car = ctl.sim.car(dv.id);
              const inGarage = car.phase === "garage";
              const fit = fitNumber(s, me, dv.car, ws.circuitId);
              return (
                <div key={dv.id} className="gd-car">
                  <b>CAR {dv.car} {dv.code} <span className="dim">fit {fit.pct}%</span></b>
                  {!inGarage && <p className="warn small">On track. Bring the car in to change parts.</p>}
                  {COMPS.map((c) => {
                    const mine = built.filter((x) => x.nd.comp === c.id);
                    const on = mine.filter((x) => (dv.car === "A" ? x.p.onA : x.p.onB));
                    const off = mine.filter((x) => !(dv.car === "A" ? x.p.onA : x.p.onB));
                    return (
                      <div key={c.id} className="gd-row">
                        <span className="gd-comp">{SHORT[c.id]}</span>
                        {on.length === 0 && <em className="dim">stock</em>}
                        {on.map((x) => (
                          <button key={x.p.id} className="tiny on" disabled={!inGarage} title="Take it off" onClick={() => act(ctl.fit(x.p.id, dv.car, false, rush))}>
                            {x.nd.name} {(dv.car === "A" ? x.p.misfit?.A : x.p.misfit?.B) ? "(BAD FIT)" : "x"}
                          </button>
                        ))}
                        {off.length > 0 && (
                          <select disabled={!inGarage} value="" onChange={(e) => { if (e.target.value) act(ctl.fit(e.target.value, dv.car, true, rush)); }} aria-label={`Fit a ${SHORT[c.id]} part to car ${dv.car}`}>
                            <option value="">+ FIT</option>
                            {off.map((x) => {
                              const q = fitQuote(s, me, x.nd, true, rush);
                              return <option key={x.p.id} value={x.p.id}>{x.nd.name} ({q.minutes} min, {fmtMoney(q.money)})</option>;
                            })}
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </>
      )}
      {tab === "setup" && <SetupPane s={s} ctl={ctl} act={act} />}
      {tab === "runs" && (
        <div className="gd-cars">
          {drivers.map((dv) => (
            <div key={dv.id} className="gd-car">
              <b>CAR {dv.car} {dv.code}</b>
              <div className="gd-progs">
                {RUNS.map((r) => (
                  <button key={r.p} className={`tiny ${ctl.programme[dv.id] === r.p ? "on primary" : ""}`} title={r.help} onClick={() => { ctl.programme[dv.id] = r.p; d({ type: "touch" }); }}>{r.label}</button>
                ))}
              </div>
              <p className="dim small">{RUNS.find((r) => r.p === ctl.programme[dv.id])?.help}</p>
            </div>
          ))}
          <p className="dim small">Pick what a run is for before you send the car out. It counts when the car comes back in.</p>
        </div>
      )}
      {tab === "readings" && <TreeLive s={s} d={d} />}
      {tab === "log" && (
        <ul className="c-notes small">
          {ctl.log.length === 0 && <li className="dim">Nothing yet. Send a car out.</li>}
          {ctl.log.slice(0, 14).map((n, i) => <li key={i} className={i < 3 ? "" : "dim"}>{n}</li>)}
        </ul>
      )}
      {msg && <p className="c-msg">{msg}</p>}
    </section>
  );
}
