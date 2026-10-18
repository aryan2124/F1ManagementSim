import { teamColour } from "../../career/brand";
import { LabBay } from "./LabBay";
import { useMemo, useState } from "react";
import { DESIGN_ENDS, DESIGN_HINT, DESIGN_KEYS, DESIGN_LABEL, clampDesign, describeDesign, designOf, frontSection, rearSection, type Design } from "../../career/design";
import { solveSection } from "../../career/airfoil";
import { INSTRUMENTS, INST_ORDER, allowanceCost, corrOf, type InstId, type LabEntry } from "../../career/lab";
import { TRAIT_NAME } from "../../career/traits";
import { fmtMoney } from "../../career/util";
import { hex, teamOf, type Props } from "./common";

/** Pressure plot from the real solver: suction on top, pressure below, drawn the stylised way. */
function CpPlot({ sec, title }: { sec: ReturnType<typeof frontSection>; title: string }) {
  const r = useMemo(() => solveSection(sec), [sec.alpha, sec.camber, sec.pos, sec.thick]);
  const W = 220, H = 110;
  const X = (x: number) => 8 + x * (W - 16);
  const Y = (cp: number) => 14 + Math.max(-5, Math.min(1.2, cp)) * 12 + 56;
  const line = (xs: number[], cp: number[]) => xs.map((x, i) => `${i ? "L" : "M"}${X(x).toFixed(1)},${Y(cp[i]).toFixed(1)}`).join(" ");
  const out = (xs: number[], u: number[], l: number[]) => xs.map((x, i) => `${i ? "L" : "M"}${X(x).toFixed(1)},${(98 - u[i] * 90).toFixed(1)}`).join(" ") + " " + xs.map((_, i) => `L${X(xs[xs.length - 1 - i]).toFixed(1)},${(98 - l[xs.length - 1 - i] * 90).toFixed(1)}`).join(" ");
  return (
    <figure className="lab-cp">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${title} pressure plot`}>
        <rect width={W} height={H} fill="#0d0f1c" />
        <path d={line(r.x, r.cpUpper)} stroke="#6cf" fill="none" strokeWidth="1.6" />
        <path d={line(r.x, r.cpLower)} stroke="#f96" fill="none" strokeWidth="1.6" />
        <path d={out(r.x, r.yUpper, r.yLower)} fill="#9aa" opacity="0.8" />
      </svg>
      <figcaption className="small dim">{title}: lift {r.cl.toFixed(2)}, drag {r.cd.toFixed(3)}{r.stalled ? ", STALLED" : ""}</figcaption>
    </figure>
  );
}

function Readings({ e }: { e: LabEntry }) {
  const max = Math.max(0.05, ...e.readings.map((r) => Math.abs(r.value) + r.err));
  return (
    <div className="lab-read">
      {e.readings.map((r) => (
        <div key={r.trait} className="lab-row">
          <span>{TRAIT_NAME[r.trait]}</span>
          <div className="lab-bar">
            <i className={r.value >= 0 ? "up" : "down"} style={{ left: r.value >= 0 ? "50%" : `${50 - (Math.abs(r.value) / max) * 50}%`, width: `${(Math.abs(r.value) / max) * 50}%` }} />
            <u style={{ left: `${50 + ((r.value - r.err) / max) * 50}%`, width: `${((2 * r.err) / max) * 50}%` }} />
          </div>
          <b>{r.value >= 0 ? "+" : ""}{r.value.toFixed(2)}s</b>
        </div>
      ))}
    </div>
  );
}

export function DesignLab({ s, d }: Props) {
  const me = s.teams[s.teamId];
  const cur = designOf(me);
  const [model, setModel] = useState<Design>(me.designNext ?? cur);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const set = (k: (typeof DESIGN_KEYS)[number], v: number) => setModel(clampDesign({ ...model, [k]: v }));
  const [bay, setBay] = useState<InstId | null>(null);
  const run = (inst: InstId) => {
    const r = d({ type: "runLab", inst, model });
    setMsg(r.message);
    if (r.ok) setBay(inst);
  };
  const book = me.notebook ?? [];
  const shown = book.find((e) => e.id === open) ?? book[0];
  const rivals = Object.values(s.teams).filter((t) => t.id !== s.teamId && !t.id.startsWith("x")).slice(0, 4);
  return (
    <div className="c-cols">
      <div>
        <section className="panel lab-panel">
          <h3>CANDIDATE SHAPE</h3>
          <p className="dim small">Eight dials describe the car. Nobody can read the true effect: test the shape in the lab, compare the readings with what you already run, then commit it for January. Nothing here changes this season's car.</p>
          {DESIGN_KEYS.map((k) => (
            <label key={k} className="lab-dial small" title={DESIGN_HINT[k]}>
              <span>{DESIGN_LABEL[k]}</span>
              <input type="range" min={0} max={100} value={Math.round(model[k] * 100)} onChange={(e) => set(k, Number(e.target.value) / 100)} />
              <em className="dim">{DESIGN_ENDS[k][0]} / {DESIGN_ENDS[k][1]}</em>
            </label>
          ))}
          <div className="seg">
            <button onClick={() => setModel(cur)}>RESET TO CURRENT</button>
            <button className="on" onClick={() => setMsg(d({ type: "setDesignNext", model }).message)}>COMMIT FOR JANUARY</button>
            {me.designNext && <button onClick={() => setMsg(d({ type: "setDesignNext", model: null }).message)}>CLEAR PLAN</button>}
          </div>
          <p className="small dim">Now: {describeDesign(cur).join(", ") || "a balanced car"}. {me.designNext ? "A January shape is committed." : "No shape committed."}</p>
          {msg && <p className="small">{msg}</p>}
        </section>
        <section className="panel">
          <h3>WING SECTIONS</h3>
          <CpPlot sec={frontSection(model.frontWing)} title="Front wing" />
          <CpPlot sec={rearSection(model.rearWing)} title="Rear wing" />
        </section>
      </div>
      <div>
        <section className="panel">
          <h3>TEST THE SHAPE</h3>
          {bay && <LabBay inst={bay} model={model} color={hex(teamColour(s))} onDone={() => setBay(null)} />}
          {INST_ORDER.map((id) => {
            const I = INSTRUMENTS[id];
            const why = allowanceCost(id, me);
            return (
              <div key={id} className="lab-inst">
                <button className="btn" disabled={!!why} title={why ?? I.blurb} onClick={() => run(id)}>{I.label.toUpperCase()}</button>
                <span className="small dim">{I.hours ? `${I.hours} h` : I.cash ? fmtMoney(I.cash, 2) : "free"} · trust {Math.round(corrOf(me, id) * 100)}%</span>
              </div>
            );
          })}
          <p className="small dim">Trust grows when a test is followed by track running. A tool you never use drifts back to guesswork. Tunnel hours left: {Math.floor(me.tunnelLeft)}.</p>
        </section>
        <section className="panel">
          <h3>NOTEBOOK</h3>
          {!book.length && <p className="dim small">No tests yet.</p>}
          {book.slice(0, 8).map((e) => <button key={e.id} className={`btn lab-entry ${shown?.id === e.id ? "on" : ""}`} onClick={() => setOpen(e.id)}>{INSTRUMENTS[e.inst].label}, day {e.day}</button>)}
          {shown && (
            <>
              <p className="small dim">{INSTRUMENTS[shown.inst].blurb} {shown.note}</p>
              <Readings e={shown} />
              <button className="btn" onClick={() => setModel(shown.model)}>LOAD THIS SHAPE</button>
              <button className="btn primary" disabled={!!shown.sent} title="The drawing office builds the best gain in these readings as a part. You still decide whether to back it." onClick={() => setMsg(d({ type: "labToIdea", entryId: shown.id }).message)}>{shown.sent ? "WITH THE DRAWING OFFICE" : "SEND TO THE DRAWING OFFICE"}</button>
            </>
          )}
        </section>
        <section className="panel">
          <h3>RIVAL PHOTOS</h3>
          {rivals.map((t) => <p key={t.id} className="small"><b>{teamOf(t.id)?.short ?? t.id}</b>: {describeDesign(designOf(t)).join(", ") || "nothing unusual"}.</p>)}
        </section>
      </div>
    </div>
  );
}
