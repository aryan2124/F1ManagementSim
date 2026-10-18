import type { TyreSet } from "../sim/tyreSets";
import { setLabel } from "../sim/tyreSets";
import { CompoundBadge } from "./Briefing";

/** The one tyre-set list used on every car panel (practice, qualifying, race, pit stops). Click a set to choose that exact set. */
export function SetPicker({ sets, value, onChange, fitted, advice, only, auto = true }: {
  sets: TyreSet[];
  value: string;
  onChange: (id: string) => void;
  fitted?: string;
  advice?: string;
  only?: string[];
  auto?: boolean;
}) {
  const list = sets.filter((x) => !only || only.includes(x.compound));
  const groups = ["S", "M", "H", "I", "W"].map((c) => list.filter((x) => x.compound === c)).filter((g) => g.length);
  return (
    <div className="setpicker">
      {auto && (
        <button className={`setchip${value === "" ? " on" : ""}`} onClick={() => onChange("")} title="Let the garage choose the set">
          AUTO{advice ? "" : ""}
        </button>
      )}
      {groups.map((g) => (
        <div className="setgroup" key={g[0].compound}>
          <CompoundBadge c={g[0].compound} size={16} />
          {g.map((x) => {
            const dead = x.runs > 0 && x.wear >= 0.8;
            return (
              <button
                key={x.id}
                className={`setchip c-${x.compound}${value === x.id ? " on" : ""}${fitted === x.id ? " fitted" : ""}${advice === x.id ? " advised" : ""}`}
                disabled={dead && fitted !== x.id}
                onClick={() => onChange(x.id)}
                title={x.log.length ? `${x.id}: used in ${x.log.join(", ")}` : `${x.id}: never used`}
              >
                {x.id} <i>{dead ? "SPENT" : setLabel(x)}</i>{fitted === x.id ? " ON" : ""}{advice === x.id ? " *" : ""}
              </button>
            );
          })}
        </div>
      ))}
      {advice && <p className="small dim">* the engineers' pick</p>}
    </div>
  );
}
