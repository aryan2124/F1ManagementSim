import { APPROACH_LABEL, APPROACH_TEXT, designQuality, effortOf, nextCarOf } from "../../career/nextcar";
import type { NextCarPlan } from "../../career/types";
import type { Props } from "./common";

const QWORD = (q: number) => (q > 0.8 ? "strong" : q > 0.62 ? "decent" : q > 0.48 ? "thin" : "weak");

/** The big decision: what kind of car goes into January, and how much of the office builds it. */
export function NextCarPanel({ s, d }: Props) {
  const p = nextCarOf(s);
  const q = designQuality(s);
  const e = effortOf(p);
  const set = (approach: NextCarPlan["approach"], share: number) => d({ type: "nextCar", approach, share });
  return (
    <section className="panel nc-panel">
      <h3>NEXT YEAR'S CAR</h3>
      <p className="dim small">The car for January is built now, by the same people who build this year's upgrades. Every share you give next year is taken from this season. You will not know how good it is until the test.</p>
      <div className="seg" style={{ flexWrap: "wrap" }}>
        {(["evolve", "revolve", "copy"] as const).map((a) => <button key={a} className={p.approach === a ? "on" : ""} onClick={() => set(a, p.share)}>{APPROACH_LABEL[a]}</button>)}
      </div>
      <p className="small">{APPROACH_TEXT[p.approach]}</p>
      <label className="small nc-share">
        DESIGN OFFICE ON NEXT YEAR: <b>{Math.round(p.share * 100)}%</b>
        <input type="range" min={0} max={100} step={5} value={Math.round(p.share * 100)} onChange={(e2) => set(p.approach, Number(e2.target.value) / 100)} />
      </label>
      <div className="bar"><i style={{ width: `${Math.min(100, (e / 1.3) * 100)}%` }} /></div>
      <p className="dim small">Work so far: {Math.round(e * 100)}% of a full programme. Your design team is {QWORD(q)}.{!p.decided ? " You have not chosen yet: a small evolution is running." : ""}</p>
      {p.approach === "revolve" && q < 0.6 && <p className="small warn">A revolution with a {QWORD(q)} design team is the classic way to build a bad car.</p>}
      {p.share < 0.15 && <p className="small warn">With almost nothing on next year, the January car will fall behind the field.</p>}
    </section>
  );
}
