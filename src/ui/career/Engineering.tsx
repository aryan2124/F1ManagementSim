import { AREAS, AREA_LABEL, type Staff } from "../../career/types";
import { AREA_TRAITS } from "../../career/traits";
import { fitFor, staffReadout } from "../../career/capability";
import type { Props } from "./common";

/** Position and width (in percent) of an error band on a bar running from `min` to `max`, kept inside the bar. */
function bandStyle(est: number, half: number, min: number, max: number) {
  const at = (v: number) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
  const lo = at(est - half);
  const hi = at(est + half);
  return { left: `${lo}%`, width: `${Math.max(1, hi - lo)}%` };
}
const atOn = (v: number, min: number, max: number) => `${Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100))}%`;

/** A number with its error bar: the marker is the best estimate, the band is how far off it could be. */
export function StaffFit({ s, st }: { s: Props["s"]; st: Staff }) {
  const r = staffReadout(s, st);
  const me = s.teams[s.teamId];
  const tr = AREA_TRAITS[r.best][0];
  const f = fitFor(s, st, me.concept, tr);
  return (
    <div className="sf">
      {AREAS.map((a) => (
        <div className="sf-row" key={a} title={`${AREA_LABEL[a]}: ${Math.round(r.spec[a] * 100)}% +/- ${Math.round(r.half * 100)}`}>
          <span>{AREA_LABEL[a].split(" ")[0]}</span>
          <div className="tr-bar sm"><i className="tr-band" style={bandStyle(r.spec[a], r.half, 0, 1)} /><i className="tr-mark" style={{ left: atOn(r.spec[a], 0, 1) }} /></div>
        </div>
      ))}
      <p className="small dim">Leans {r.phil.df > 0.25 ? "downforce" : r.phil.df < -0.25 ? "low drag" : "neutral"}, {r.phil.risk > 0.25 ? "radical" : r.phil.risk < -0.25 ? "proven" : "balanced"}, {r.phil.innov > 0.25 ? "inventive" : r.phil.innov < -0.25 ? "refining" : "balanced"} (read to +/- {Math.round(r.half * 100)}). With your concept: fit x{f.mult.toFixed(2)}.</p>
    </div>
  );
}
