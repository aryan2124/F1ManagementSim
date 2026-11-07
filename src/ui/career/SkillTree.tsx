import { branchName, expertise, isBuilding, lockOf, priceOf, rangeOf, treeOf, type TreeNode } from "../../career/ctree";
import { rulesOf } from "../../career/eras";
import { fmtMoney, lapDelta } from "../../career/util";
import { trackRow } from "../../game/trackdata";
import { loadCircuit } from "../../game/circuits";
import { TRAIT_NAME } from "../../career/traits";
import type { CareerState, Trait } from "../../career/types";
import type { Props } from "./common";

/** Which calendar rounds a part's main trait pays at: the "suits rounds 4 and 7" chip. */
export function suitedRounds(s: CareerState, nd: TreeNode): number[] {
  const main = (Object.keys(nd.fx) as Trait[]).sort((a, b) => Math.abs(nd.fx[b] ?? 0) - Math.abs(nd.fx[a] ?? 0))[0];
  const out: number[] = [];
  s.calendar.forEach((r, i) => {
    if (r.day < s.day - 2) return;
    const x = trackRow(r.circuitId);
    const sev = loadCircuit(r.circuitId).meta.tyreSeverity;
    const ok =
      main === "downforce" ? x.df >= 4 :
      main === "efficiency" || main === "output" || main === "drive" ? x.pow >= 4 :
      main === "capacity" || main === "packaging" ? x.cool >= 4 :
      main === "wear" || main === "warmup" ? sev >= 1.4 :
      main === "grip" || main === "platform" ? x.df >= 4 || x.brk >= 4 : false;
    if (ok) out.push(i + 1);
  });
  return out;
}

function Rounds({ s, nd }: { s: CareerState; nd: TreeNode }) {
  const r = suitedRounds(s, nd);
  if (!r.length) return <span className="sk-chip dim">no race left suits it</span>;
  return <span className="sk-chip" title="Rounds where this part pays most">suits {r.length > 4 ? `${r.length} races` : `round${r.length > 1 ? "s" : ""} ${r.join(", ")}`}</span>;
}

export function NodeDetail({ s, d, nd, act, flags }: Props & { nd: TreeNode; act: (r: { message: string }) => void; flags: ReturnType<typeof rulesOf> }) {
  const me = s.teams[s.teamId];
  const tr = treeOf(s, me);
  const lk = lockOf(s, me, nd, flags);
  const r = rangeOf(s, me, nd);
  const pr = priceOf(s, nd);
  const part = tr.parts[nd.id];
  const ex = expertise(tr, nd.comp, nd.branch);
  const pos = (v: number) => Math.max(0, Math.min(100, 50 + (v / 0.3) * 50));
  const lo = Math.min(pos(r.lo), pos(r.hi)), hi = Math.max(pos(r.lo), pos(r.hi));
  const traits = (Object.keys(nd.fx) as Trait[]);
  return (
    <>
      <h4>{nd.name}</h4>
      <p className="dim small">{branchName(nd.comp, nd.branch)} · tier {nd.tier} of 4</p>
      <div className="sk-range" aria-label={`about ${lapDelta(r.hi)} to ${lapDelta(r.lo)} seconds a lap`}>
        <div className="tf-track"><i className="tf-mid" /><b className={`tf-bar ${r.mid > 0 ? "up" : "down"}`} style={{ left: `${lo}%`, width: `${Math.max(2, hi - lo)}%` }} /></div>
        <div className="tf-ends"><span>SLOWER</span><span>{r.tested ? "MEASURED" : "STAFF GUESS"}</span><span>FASTER</span></div>
      </div>
      <div className="sk-chips">
        {traits.map((t) => <span key={t} className={`sk-chip ${(nd.fx[t] ?? 0) > 0 ? "up" : "down"}`}>{TRAIT_NAME[t]} {(nd.fx[t] ?? 0) > 0 ? "up" : "down"}</span>)}
        <Rounds s={s} nd={nd} />
      </div>
      <div className="sk-chips">
        <span className="sk-chip">{fmtMoney(pr.cost)} for both cars</span>
        <span className="sk-chip">{pr.days} days</span>
        <span className="sk-chip">team knows this lane {Math.round(Math.min(95, 20 + 17 * ex))}%</span>
      </div>
      {!part && lk.ok && <button className="btn primary" onClick={() => act(rawDispatch(d, { type: "treeBuild", id: nd.id }))}>BUILD</button>}
      {!part && !lk.ok && lk.why && <p className="warn small">{lk.why}</p>}
      {isBuilding(tr, nd.id) && <button className="btn" onClick={() => act(rawDispatch(d, { type: "treeScrap", id: nd.id }))}>CANCEL BUILD</button>}
      {part && (
        <>
          <div className="ct-slots">
            <button className={`btn ${part.onA ? "primary" : ""}`} onClick={() => act(rawDispatch(d, { type: "treeInstall", id: nd.id, car: "A", on: !part.onA }))}>CAR A {part.onA ? "ON" : "OFF"}</button>
            <button className={`btn ${part.onB ? "primary" : ""}`} onClick={() => act(rawDispatch(d, { type: "treeInstall", id: nd.id, car: "B", on: !part.onB }))}>CAR B {part.onB ? "ON" : "OFF"}</button>
          </div>
          {!part.tested && <button className="btn" onClick={() => act(rawDispatch(d, { type: "treeTest", id: nd.id }))}>TEST IN THE SIMULATOR ($0.4m, {tr.mods?.testDays ?? 4} days)</button>}
          {tr.tests.some((x) => x.id === nd.id) && <p className="small">In the simulator now.</p>}
          {part.copies < 2 && <p className="warn small">Only one of this part is left.</p>}
        </>
      )}
    </>
  );
}

function rawDispatch(d: Props["d"], a: Parameters<Props["d"]>[0]): { message: string } {
  return d(a);
}
