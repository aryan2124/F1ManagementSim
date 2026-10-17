import { partVerdict } from "../../career/weekend";
import { fmtRange } from "../../career/util";
import type { Project } from "../../career/types";

/** The staff's guess against what the bench said, on one line you can read at a glance. */
export function BenchGauge({ p }: { p: Project }) {
  const v = partVerdict(p);
  const lo = Math.min(0, p.predLo, p.tested ?? 0) - 0.03;
  const hi = Math.max(p.predHi, p.tested ?? 0) + 0.03;
  const at = (x: number) => `${((x - lo) / (hi - lo)) * 100}%`;
  return (
    <div className="c-bench">
      <div className="c-bench-bar" role="img" aria-label="Predicted range against bench result">
        <i className="zero" style={{ left: at(0) }} title="No change" />
        <i className="pred" style={{ left: at(p.predLo), width: `${((p.predHi - p.predLo) / (hi - lo)) * 100}%` }} title="Staff's guess" />
        {p.tested !== undefined && <i className={`got ${v?.tone ?? ""}`} style={{ left: at(p.tested) }} title="Bench result" />}
      </div>
      <div className="c-bench-key small dim"><span>slower</span><span>teal band: staff's guess{p.tested !== undefined ? ", marker: bench result" : ""}</span><span>faster</span></div>
      {v ? (
        <p className={`small c-verdict ${v.tone}`}><b>{v.word}</b> Bench: about {fmtRange(p.tested! - 0.03, p.tested! + 0.03)} (guess {fmtRange(p.predLo, p.predHi)}). {v.advice}</p>
      ) : (
        <p className="small dim">Not tested yet. A PART TEST run in practice measures the real gain on the bench. The staff's band is only a guess.</p>
      )}
    </div>
  );
}
