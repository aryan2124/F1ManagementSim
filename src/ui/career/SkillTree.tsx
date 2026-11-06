import { useEffect, useRef, useState } from "react";
import { COMP, DEEP_SHARE, branchBlurb, branchName, branchShare, expertise, isBuilding, isBuilt, lockOf, nodeKey, nodeOf, priceOf, rangeOf, slotsOf, treeOf, type CompId, type TreeNode } from "../../career/ctree";
import { rulesOf } from "../../career/eras";
import { fmtMoney, lapDelta } from "../../career/util";
import { trackRow } from "../../game/trackdata";
import { loadCircuit } from "../../game/circuits";
import { TRAIT_NAME } from "../../career/traits";
import type { CareerState, Trait } from "../../career/types";
import type { Props } from "./common";

const NW = 158;
const NH = 92;
const GX = 54;
const GY = 34;
const HUB = 120;

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

export function SkillTree({ s, d, comp, onBack }: Props & { comp: CompId; onBack: () => void }) {
  const me = s.teams[s.teamId];
  const tr = treeOf(s, me);
  const def = COMP(comp);
  const flags = rulesOf(s);
  const [pick, setPick] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ px: number; py: number; vx: number; vy: number } | null>(null);
  const vp = useRef<HTMLDivElement>(null);
  const W = HUB + 4 * (NW + GX);
  const H = 3 * NH + 2 * GY + 40;
  // fit the tree to the width it is shown in
  useEffect(() => {
    const el = vp.current;
    if (!el) return;
    const fit = () => setView({ x: 0, y: 0, k: Math.min(1, Math.max(0.55, (el.clientWidth - 8) / W)) });
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, comp]);
  useEffect(() => {
    const el = vp.current;
    if (!el) return;
    const on = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setView((v) => ({ ...v, k: Math.min(1.6, Math.max(0.3, v.k * (e.deltaY < 0 ? 1.1 : 0.9))) }));
    };
    el.addEventListener("wheel", on, { passive: false });
    return () => el.removeEventListener("wheel", on);
  }, []);

  const pos = (b: number, t: number) => ({ x: HUB + (t - 1) * (NW + GX), y: 20 + b * (NH + GY) });
  const sel = pick ? nodeOf(tr, pick) : undefined;
  const act = (r: { message: string }) => setMsg(r.message);
  const nodeClass = (nd: TreeNode) => {
    const lk = lockOf(s, me, nd, flags);
    return lk.state;
  };

  return (
    <div className="sk" data-testid="skill-tree">
      <div className="sk-bar">
        <button className="btn" onClick={onBack}>BACK TO THE CAR</button>
        <h3>{def.name.toUpperCase()}</h3>
        <span className="dim small">{def.blurb} A new tree for every set of rules{tr.era ? ` (cut for ${tr.era})` : ""}.</span>
        <div className="sk-zoom">
          <button className="tiny" aria-label="Zoom out" onClick={() => setView((v) => ({ ...v, k: Math.max(0.3, v.k - 0.1) }))}>-</button>
          <button className="tiny" aria-label="Zoom in" onClick={() => setView((v) => ({ ...v, k: Math.min(1.6, v.k + 0.1) }))}>+</button>
          <button className="tiny" onClick={() => setView((v) => ({ ...v, x: 0, y: 0 }))}>RESET</button>
        </div>
      </div>
      <div className="sk-wrap">
        <div
          className="sk-vp"
          ref={vp}
          style={{ height: Math.max(240, Math.round(H * view.k) + 16) }}
          onPointerDown={(e) => { if ((e.target as HTMLElement).closest("button")) return; drag.current = { px: e.clientX, py: e.clientY, vx: view.x, vy: view.y }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => { const g = drag.current; if (g) setView((v) => ({ ...v, x: g.vx + e.clientX - g.px, y: g.vy + e.clientY - g.py })); }}
          onPointerUp={() => { drag.current = null; }}
        >
          <div className="sk-plane" style={{ width: W, height: H, transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
            <svg className="sk-lines" width={W} height={H} aria-hidden="true">
              {[0, 1, 2].map((b) => {
                const hub = { x: HUB - 18, y: H / 2 - 20 };
                const p1 = pos(b, 1);
                const first = `M ${hub.x} ${hub.y} C ${hub.x + 40} ${hub.y}, ${p1.x - 40} ${p1.y + NH / 2}, ${p1.x} ${p1.y + NH / 2}`;
                const cls = (t: number) => (isBuilt(tr, nodeKey(comp, b, t)) ? "done" : isBuilding(tr, nodeKey(comp, b, t)) ? "work" : "");
                return (
                  <g key={b}>
                    <path d={first} className={`sk-edge ${cls(1)}`} />
                    {[1, 2, 3].map((t) => {
                      const a = pos(b, t), z = pos(b, t + 1);
                      return <path key={t} d={`M ${a.x + NW} ${a.y + NH / 2} L ${z.x} ${z.y + NH / 2}`} className={`sk-edge ${cls(t + 1)}`} />;
                    })}
                  </g>
                );
              })}
            </svg>
            <div className="sk-hub" style={{ left: 8, top: H / 2 - 52 }}>
              <b>{def.name}</b>
              <small>{tr.nodes.filter((n) => n.comp === comp && isBuilt(tr, n.id)).length} of 12 built</small>
            </div>
            {[0, 1, 2].map((b) => {
              const p = pos(b, 1);
              const sh = branchShare(tr, comp, b);
              return (
                <div className="sk-lane" key={`l${b}`} style={{ left: p.x, top: p.y - 18, width: 4 * (NW + GX) - GX }}>
                  <b>{branchName(comp, b).toUpperCase()}</b>
                  <i className="sk-depth" title={`${Math.round(sh * 100)}% of the factory's work. Tier 3 needs ${DEEP_SHARE[2] * 100}%, tier 4 needs ${DEEP_SHARE[3] * 100}%.`}>
                    <u style={{ width: `${Math.min(100, sh * 100)}%` }} />
                    <s style={{ left: `${DEEP_SHARE[2] * 100}%` }} />
                    <s style={{ left: `${DEEP_SHARE[3] * 100}%` }} />
                  </i>
                  <span className="dim">{branchBlurb(comp, b)}</span>
                </div>
              );
            })}
            {tr.nodes.filter((n) => n.comp === comp).map((nd) => {
              const p = pos(nd.branch, nd.tier);
              const st = nodeClass(nd);
              const part = tr.parts[nd.id];
              const build = tr.builds.find((b) => b.id === nd.id);
              const r = rangeOf(s, me, nd);
              const fade = nd.tier === 4 ? Math.round(30 + 70 * (1 - Math.min(1, (s.year - (s.era.current?.startYear ?? s.year)) / Math.max(1, s.era.current?.length ?? 1)))) : 100;
              return (
                <button key={nd.id} className={`sk-node ${st} t${nd.tier} ${pick === nd.id ? "on" : ""}`} style={{ left: p.x, top: p.y + 14, width: NW, height: NH, opacity: st === "capped" ? 0.55 : fade < 60 && st !== "built" ? 0.8 : 1 }} onClick={() => setPick(nd.id)} aria-label={`${nd.name}, tier ${nd.tier}, ${st}`}>
                  <span className="sk-tier">{["I", "II", "III", "IV"][nd.tier - 1]}</span>
                  <b>{nd.name}</b>
                  <em className={r.mid > 0 ? "up" : "down"}>{r.tested ? lapDelta(r.mid) : `${lapDelta(r.hi)} to ${lapDelta(r.lo)}`} s</em>
                  <small>
                    {st === "built" ? (<>BUILT {part?.onA ? <i className="sk-car">A</i> : null}{part?.onB ? <i className="sk-car">B</i> : null}{part?.tested ? " · TESTED" : ""}</>) :
                      st === "building" ? <>BUILDING {Math.round(((build?.progress ?? 0) / (build?.days || 1)) * 100)}%</> :
                      st === "available" ? <>{fmtMoney(priceOf(s, nd).cost)} · {priceOf(s, nd).days}d</> :
                      st === "deep" ? "NEEDS DEPTH" : st === "labour" ? "NEEDS SKILL" : st === "capped" ? "UNFINISHED" : st === "frozen" ? "FROZEN" : "LOCKED"}
                  </small>
                  {build && <i className="sk-prog" style={{ width: `${Math.min(100, (build.progress / build.days) * 100)}%` }} />}
                </button>
              );
            })}
          </div>
        </div>
        <section className="panel sk-detail" aria-live="polite">
          {!sel && (
            <>
              <h4>PICK A PART</h4>
              <p className="dim small">Each lane is a design philosophy. Go deep in one and the best parts open up. Spread out and they stay locked, however much money you have.</p>
              <p className="small">Factory: {tr.builds.length} of {slotsOf(me)} slots busy.</p>
            </>
          )}
          {sel && <NodeDetail s={s} d={d} nd={sel} act={act} flags={flags} />}
          {msg && <p className="c-msg">{msg}</p>}
        </section>
      </div>
    </div>
  );
}

function NodeDetail({ s, d, nd, act, flags }: Props & { nd: TreeNode; act: (r: { message: string }) => void; flags: ReturnType<typeof rulesOf> }) {
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
