import type { Compound } from "../sim/types";
import type { TyreSet } from "../sim/tyreSets";
import { CompoundBadge } from "./Briefing";

const NAME: Record<Compound, string> = { S: "SOFT", M: "MEDIUM", H: "HARD", I: "INTER", W: "WET" };
const COL: Record<Compound, string> = { S: "#ff4d5e", M: "#f9c74f", H: "#e8e8e8", I: "#57cc99", W: "#4cc9f0" };

/**
 * The one tyre rack used on every sim screen (practice, qualifying, race, pit stops, briefing).
 * Each set is a round tyre: the coloured ring is the life it has left, the number is its id, the caption says NEW or how worn it is.
 */
export function SetPicker({ sets, value, onChange, fitted, advice, only, auto = true, readonly = false, note = true }: {
  sets: TyreSet[];
  value?: string;
  onChange?: (id: string) => void;
  fitted?: string;
  advice?: string;
  only?: string[];
  auto?: boolean;
  readonly?: boolean;
  note?: boolean;
}) {
  const list = sets.filter((x) => !only || only.includes(x.compound));
  const groups = (["S", "M", "H", "I", "W"] as Compound[]).map((c) => list.filter((x) => x.compound === c)).filter((g) => g.length);
  return (
    <div className="rack">
      {!readonly && auto && onChange && (
        <button className={`rack-auto${value === "" || value === undefined ? " on" : ""}`} onClick={() => onChange("")} title="Let the garage choose the set">
          AUTO: GARAGE CHOOSES
        </button>
      )}
      {groups.map((g) => {
        const c = g[0].compound;
        const fresh = g.filter((x) => x.runs === 0).length;
        return (
          <div className="rack-row" key={c}>
            <div className="rack-head" style={{ color: COL[c] }}>
              <CompoundBadge c={c} size={14} />
              <b>{NAME[c]}</b>
              <small>{fresh} new of {g.length}</small>
            </div>
            <div className="rack-sets">
              {g.map((x) => {
                const life = x.runs === 0 ? 1 : Math.max(0, 1 - Math.min(1, x.wear));
                const spent = x.runs > 0 && x.wear >= 0.8;
                const cls = ["tyre", x.runs === 0 ? "new" : "used", value === x.id ? "on" : "", fitted === x.id ? "fitted" : "", advice === x.id ? "advised" : "", spent ? "spent" : ""].join(" ");
                const tip = `${NAME[c]} ${x.id}: ${x.runs === 0 ? "never used" : `${Math.round(Math.min(1, x.wear) * 100)}% worn, used in ${x.log.join(", ")}`}${fitted === x.id ? " (on the car now)" : ""}${advice === x.id ? " (engineers' pick)" : ""}`;
                const inner = (
                  <>
                    <span className="disc" style={{ ["--life" as string]: `${Math.round(life * 100)}%`, ["--c" as string]: COL[c] }}><b>{x.id.slice(1)}</b></span>
                    <small>{spent ? "SPENT" : x.runs === 0 ? "NEW" : `${Math.round(Math.min(1, x.wear) * 100)}%`}</small>
                    {fitted === x.id && <em>ON</em>}
                    {advice === x.id && <i>*</i>}
                  </>
                );
                return readonly || !onChange ? (
                  <span key={x.id} className={cls} title={tip}>{inner}</span>
                ) : (
                  <button key={x.id} className={cls} title={tip} disabled={spent && fitted !== x.id} onClick={() => onChange(x.id)}>{inner}</button>
                );
              })}
            </div>
          </div>
        );
      })}
      {note && !readonly && <p className="rack-note">One pool for the whole weekend. A set used now is not there on Sunday.{advice ? " * is the engineers' pick." : ""}</p>}
    </div>
  );
}
