import type { CareerState } from "../../career/types";
import { baseTeam } from "../../career/car";
import { CREW_ROLES, ROLE_LABEL, TEMPER_WORD, chemistry, crewEffect, ensureCrew, pairs } from "../../career/pitcrew";
import { Bar, type Dispatch } from "./common";

/** The pit crew: who stands where, how well they work together, and what that does to the stops. */
export function CrewPanel({ s, d }: { s: CareerState; d: Dispatch }) {
  const crew = ensureCrew(s, s.teamId, baseTeam(s.teamId).pitCrew);
  const fx = crewEffect(crew);
  const by = new Map(crew.members.map((m) => [m.id, m] as const));
  const ps = pairs(crew).sort((a, b) => a.quality - b.quality);
  const worst = ps.slice(0, 3);
  return (
    <div className="crew">
      <p className="small dim">
        Skill sets the usual time. Chemistry sets how often a stop goes wrong. Changing who stands where costs familiarity for the people who move.
      </p>
      <ul className="statgrid">
        <li><span>Chemistry</span><b>{Math.round(chemistry(crew) * 100)}%</b></li>
        <li><span>Skill</span><b>{Math.round(fx.skill * 100)}</b></li>
        <li><span>Chance of a bad stop</span><b>{(fx.fumble * 100).toFixed(1)}%</b></li>
        <li><span>Stops this career</span><b>{crew.stops}</b></li>
        <li><span>Slow ones</span><b>{crew.slow}</b></li>
        <li><span>Best stop</span><b>{crew.best ? `${crew.best.toFixed(2)} s` : "none yet"}</b></li>
      </ul>
      <Bar v={chemistry(crew)} />
      <div className="crew-slots">
        {CREW_ROLES.map((role, i) => {
          const m = by.get(crew.lineup[i]!);
          return (
            <label key={role} className="crew-slot">
              <span>{ROLE_LABEL[role]}</span>
              <select value={crew.lineup[i]} onChange={(e) => d({ type: "setCrew", slot: i, memberId: e.target.value })}>
                {crew.members.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name} | {Math.round(x.skill)} | {TEMPER_WORD[x.temper]}{crew.lineup.includes(x.id) && x.id !== crew.lineup[i] ? " (in the crew)" : ""}
                  </option>
                ))}
              </select>
              {m && <em className="small dim">{m.best === "jack" ? "jack man" : "gun operator"}, {m.stops} stops</em>}
            </label>
          );
        })}
      </div>
      <h5 className="small">Weakest partnerships</h5>
      <ul className="small">
        {worst.map((p, i) => <li key={i}>{p.a} and {p.b}: {p.note} ({p.stops} stops together)</li>)}
      </ul>
    </div>
  );
}
