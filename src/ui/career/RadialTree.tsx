import { useEffect, useRef, useState } from "react";
import { CarSprite } from "../pixel/CarSprite";
import { teamColour } from "../../career/brand";
import { COMPS, TIER_FX, branchBlurb, branchName, isBuilding, isBuilt, lapOf, lockOf, nodeKey, nodeOf, treeOf, type CompId, type TreeNode } from "../../career/ctree";
import { rulesOf } from "../../career/eras";
import { lapDelta } from "../../career/util";
import { TRAIT_NAME } from "../../career/traits";
import type { Trait } from "../../career/types";
import { loadCircuit } from "../../game/circuits";
import { activeDrivers } from "../../career/car";
import { fitNumber } from "../../career/fitting";
import { partTrackExpect } from "../../career/treeplay";
import { teamOf, type Props } from "./common";
import { NodeDetail } from "./SkillTree";

const P = 1240;
const C = P / 2;
const R = [205, 290, 375, 460];
const HUB_R = 118;
const OFF = 19;
const ARM_COLOUR: Record<CompId, string> = { fw: "#5bc0ff", rw: "#b78cff", floor: "#57cc99", pu: "#ff7b6b", cool: "#6fe3e0", susp: "#ffd166" };
const SHORT: Record<CompId, string> = { fw: "FRONT WING", rw: "REAR WING", floor: "FLOOR", pu: "POWER UNIT", cool: "COOLING", susp: "SUSPENSION" };
const ORDER: CompId[] = ["fw", "cool", "pu", "rw", "floor", "susp"];

const armAngle = (ci: number) => -90 + ci * 60;
const at = (deg: number, r: number) => ({ x: C + r * Math.cos((deg * Math.PI) / 180), y: C + r * Math.sin((deg * Math.PI) / 180) });
const nodeAt = (ci: number, b: number, t: number) => at(armAngle(ci) + (b - 1) * OFF, R[t - 1]);

let lastArm: CompId | null = null;

function wedge(ci: number) {
  const a0 = armAngle(ci) - 30, a1 = armAngle(ci) + 30;
  const p0 = at(a0, HUB_R + 14), p1 = at(a0, 520), p2 = at(a1, 520), p3 = at(a1, HUB_R + 14);
  return `M ${p0.x} ${p0.y} L ${p1.x} ${p1.y} A 520 520 0 0 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${HUB_R + 14} ${HUB_R + 14} 0 0 0 ${p0.x} ${p0.y} Z`;
}

/** One big tree around the car: six arms, three lanes each, four rings. The outer ring is the keystone ring. */
export function RadialTree({ s, d }: Props) {
  const me = s.teams[s.teamId];
  const tr = treeOf(s, me);
  const flags = rulesOf(s);
  const [pick, setPick] = useState<string | null>(null);
  const [heat, setHeat] = useState(true);
  const [msg, setMsg] = useState("");
  const [view, setView] = useState({ x: 0, y: 0, k: 0.5 });
  const vp = useRef<HTMLDivElement>(null);
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; k: number } | null>(null);
  const drag = useRef<{ px: number; py: number; vx: number; vy: number } | null>(null);
  const drivers = activeDrivers(s, s.teamId).map((id) => s.drivers[id]?.spec.code ?? id);

  const next = s.calendar.findIndex((r) => r.day >= s.day - 2);
  const nextRound = next >= 0 ? next + 1 : 0;
  const nextName = next >= 0 ? loadCircuit(s.calendar[next].circuitId).meta.gp : "";

  const focus = (comp: CompId) => {
    lastArm = comp;
    const el = vp.current;
    if (!el) return;
    const ci = ORDER.indexOf(comp);
    const pt = at(armAngle(ci), 330);
    const k = el.clientWidth < 700 ? 0.78 : 1.0;
    setView({ k, x: el.clientWidth / 2 - k * pt.x, y: el.clientHeight / 2 - k * pt.y });
  };
  const fitAll = () => {
    const el = vp.current;
    if (!el) return;
    const k = Math.min(el.clientWidth / (P - 20), el.clientHeight / (P - 20));
    setView({ k, x: (el.clientWidth - P * k) / 2, y: (el.clientHeight - P * k) / 2 });
  };
  const firstArm = (): CompId | null => lastArm ?? (tr.builds.length ? (nodeOf(tr, tr.builds[0].id)?.comp ?? null) : null);

  useEffect(() => {
    const el = vp.current;
    if (!el) return;
    const start = () => {
      const a = firstArm();
      if (el.clientWidth < 700 || a) focus(a ?? "fw");
      else fitAll();
    };
    start();
    const on = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      setView((v) => {
        const k = Math.min(1.8, Math.max(0.28, v.k * (e.deltaY < 0 ? 1.12 : 0.89)));
        return { k, x: cx - ((cx - v.x) / v.k) * k, y: cy - ((cy - v.y) / v.k) * k };
      });
    };
    el.addEventListener("wheel", on, { passive: false });
    return () => el.removeEventListener("wheel", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gain = (comp: CompId) => {
    let g = 0;
    for (const p of Object.values(tr.parts)) {
      const nd = nodeOf(tr, p.id);
      if (nd?.comp === comp) g += lapOf(nd) * ((p.onA ? 0.5 : 0) + (p.onB ? 0.5 : 0));
    }
    return g;
  };
  const sel = pick ? nodeOf(tr, pick) : undefined;
  const act = (r: { message: string }) => setMsg(r.message);
  const nextId = next >= 0 ? s.calendar[next].circuitId : "";
  // hot = the dozen parts this track pays most over an average track (none at a track that asks nothing unusual)
  const hotSet = new Set<string>();
  if (heat && nextId) {
    tr.nodes
      .map((nd) => ({ id: nd.id, v: (partTrackExpect(nd, nextId) - Object.values(nd.fx).reduce((a, x) => a + (x ?? 0), 0)) / TIER_FX[nd.tier - 1] }))
      .filter((x) => x.v > 0.1)
      .sort((a, b) => b.v - a.v)
      .slice(0, 12)
      .forEach((x) => hotSet.add(x.id));
  }
  const wanted = (nd: TreeNode) => hotSet.has(nd.id);

  const down = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), k: view.k };
      drag.current = null;
    } else drag.current = { px: e.clientX, py: e.clientY, vx: view.x, vy: view.y };
  };
  const move = (e: React.PointerEvent) => {
    if (ptrs.current.has(e.pointerId)) ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 2 && pinch.current) {
      const [a, b] = [...ptrs.current.values()];
      const k = Math.min(1.8, Math.max(0.28, (pinch.current.k * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.dist));
      setView((v) => ({ ...v, k }));
      return;
    }
    const g = drag.current;
    if (g) setView((v) => ({ ...v, x: g.vx + e.clientX - g.px, y: g.vy + e.clientY - g.py }));
  };
  const up = (e: React.PointerEvent) => {
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size < 2) pinch.current = null;
    drag.current = null;
  };

  return (
    <div className="rt" data-testid="radial-tree">
      <div className="rt-arms" role="tablist" aria-label="Car areas">
        {ORDER.map((c) => {
          const def = COMPS.find((x) => x.id === c)!;
          const n = tr.nodes.filter((x) => x.comp === c && isBuilt(tr, x.id)).length;
          const working = tr.nodes.some((x) => x.comp === c && isBuilding(tr, x.id));
          const g = gain(c);
          return (
            <button key={c} className={`rt-arm ${working ? "work" : ""}`} style={{ borderColor: ARM_COLOUR[c] }} onClick={() => focus(c)} aria-label={`${def.name}, ${n} of 12 built`} data-comp={c}>
              <b>{SHORT[c]}</b>
              <small>{n}/12 · {g === 0 ? "stock" : `${lapDelta(g)} s`}</small>
            </button>
          );
        })}
        <span className="rt-grow" />
        <button className={`tiny ${heat ? "primary" : ""}`} onClick={() => setHeat(!heat)} title="Glow on the parts the next track rewards">TRACK HEAT {heat ? "ON" : "OFF"}</button>
        <button className="tiny" onClick={() => setMsg(d({ type: "treeSuggested" }).message)} title="Fit the best set your built parts allow for the next track, at the normal price">SUGGESTED FIT</button>
        <button className="tiny" onClick={fitAll}>SEE ALL</button>
        <button className="tiny" aria-label="Zoom out" onClick={() => setView((v) => ({ ...v, k: Math.max(0.28, v.k - 0.12) }))}>-</button>
        <button className="tiny" aria-label="Zoom in" onClick={() => setView((v) => ({ ...v, k: Math.min(1.8, v.k + 0.12) }))}>+</button>
      </div>
      <p className="dim small rt-heatline">Diamonds on the outer ring are keystones: big gains that always cost something.{heat && nextRound > 0 ? (hotSet.size ? ` Glowing parts suit round ${nextRound}, ${nextName}.` : ` Round ${nextRound}, ${nextName}, asks nothing unusual of the car.`) : ""}</p>
      <div className="rt-main">
        <div className="rt-vp" ref={vp} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <div className="rt-plane" style={{ width: P, height: P, transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
            <svg className="rt-lines" width={P} height={P} aria-hidden="true">
              {ORDER.map((c, ci) => (
                <g key={c}>
                  <path d={wedge(ci)} fill={ARM_COLOUR[c]} opacity={0.07} />
                  {[0, 1, 2].map((b) => {
                    const cls = (t: number) => (isBuilt(tr, nodeKey(c, b, t)) ? "done" : isBuilding(tr, nodeKey(c, b, t)) ? "work" : "");
                    const h = at(armAngle(ci) + (b - 1) * OFF, HUB_R);
                    const p1 = nodeAt(ci, b, 1);
                    return (
                      <g key={b}>
                        <line x1={h.x} y1={h.y} x2={p1.x} y2={p1.y} className={`rt-edge ${cls(1)}`} />
                        {[1, 2, 3].map((t) => {
                          const a = nodeAt(ci, b, t), z = nodeAt(ci, b, t + 1);
                          return <line key={t} x1={a.x} y1={a.y} x2={z.x} y2={z.y} className={`rt-edge ${cls(t + 1)}`} />;
                        })}
                      </g>
                    );
                  })}
                </g>
              ))}
              {R.map((r, i) => <circle key={r} cx={C} cy={C} r={r} className={`rt-ring ${i === 3 ? "key" : ""}`} />)}
              <circle cx={C} cy={C} r={HUB_R} className="rt-hubring" />
            </svg>
            <div className="rt-hub" style={{ left: C - HUB_R, top: C - HUB_R, width: HUB_R * 2, height: HUB_R * 2 }}>
              <CarSprite teamColor={teamColour(s)} accent={teamOf(s.teamId)?.accent ?? 0xffffff} size={150} />
            </div>
            {ORDER.map((c, ci) => (
              <div key={`lab${c}`}>
                <div className="rt-comp" style={{ left: at(armAngle(ci), 560).x, top: at(armAngle(ci), 560).y, color: ARM_COLOUR[c] }}>{SHORT[c]}</div>
                {[0, 1, 2].map((b) => {
                  const p = at(armAngle(ci) + (b - 1) * OFF, 515);
                  return <div key={b} className="rt-lane" style={{ left: p.x, top: p.y }}>{branchName(c, b)}</div>;
                })}
              </div>
            ))}
            {tr.nodes.map((nd) => {
              const ci = ORDER.indexOf(nd.comp);
              const p = nodeAt(ci, nd.branch, nd.tier);
              const lk = lockOf(s, me, nd, flags).state;
              const part = tr.parts[nd.id];
              const build = tr.builds.find((b) => b.id === nd.id);
              return (
                <button
                  key={nd.id}
                  className={`rt-node ${lk} t${nd.tier} ${pick === nd.id ? "on" : ""} ${wanted(nd) ? "hot" : ""}`}
                  style={{ left: p.x, top: p.y, borderColor: lk === "built" || lk === "building" ? undefined : ARM_COLOUR[nd.comp] }}
                  onClick={() => { setPick(nd.id); lastArm = nd.comp; setMsg(""); }}
                  aria-label={`${nd.name}, ${SHORT[nd.comp]}, tier ${nd.tier}, ${lk}`}
                  title={`${nd.name} (${branchName(nd.comp, nd.branch)} lane, tier ${nd.tier}): ${(Object.keys(nd.fx) as Trait[]).map((t) => `${(nd.fx[t] ?? 0) > 0 ? "+" : "-"} ${TRAIT_NAME[t].toLowerCase()}`).join(", ")}. Click for details.`}
                >
                  <span>{nd.tier === 4 ? "K" : ["I", "II", "III"][nd.tier - 1]}</span>
                  {part && (part.onA || part.onB) && <i className="rt-fit">{part.onA ? "A" : ""}{part.onB ? "B" : ""}</i>}
                  {build && <i className="rt-prog" style={{ width: `${Math.min(100, (build.progress / build.days) * 100)}%` }} />}
                </button>
              );
            })}
          </div>
        </div>
        <aside className="rt-side">
          <section className="panel sk-detail" aria-live="polite">
            {!sel && (
              <>
                <h4>PICK A PART</h4>
                <p className="dim small">Each lane is a design philosophy. Go deep in one lane and the best parts open up. The outer ring parts are keystones: big gains that always cost something.</p>
              </>
            )}
            {sel && <p className="dim small">{branchName(sel.comp, sel.branch)} lane: {branchBlurb(sel.comp, sel.branch)}</p>}
            {sel && <NodeDetail s={s} d={d} nd={sel} act={act} flags={flags} />}
            {msg && <p className="c-msg">{msg}</p>}
          </section>
          <section className="panel rt-slots" aria-label="What is fitted to each car">
            <h4>ON THE CARS NOW</h4>
            {nextId && <p className="dim small">Fit for round {nextRound}: {(["A", "B"] as const).map((c, i) => `${drivers[i] ?? c} ${fitNumber(s, me, c, nextId).pct}%`).join(", ")}</p>}
            <div className="rt-slotgrid">
              {(["A", "B"] as const).map((car, i) => (
                <div key={car} className="rt-slotcard">
                  <b>CAR {car} <span className="dim">{drivers[i] ?? ""}</span></b>
                  {ORDER.map((c) => {
                    const on = Object.values(tr.parts).map((p) => ({ p, nd: nodeOf(tr, p.id)! })).filter((x) => x.nd.comp === c && (car === "A" ? x.p.onA : x.p.onB));
                    return (
                      <button key={c} className="rt-slotrow" onClick={() => focus(c)}>
                        <span style={{ color: ARM_COLOUR[c] }}>{SHORT[c]}</span>
                        <em>{on.length ? on.map((x) => x.nd.name).join(", ") : "stock"}</em>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
