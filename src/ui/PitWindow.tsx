import type { RaceSim } from "../sim/engine";
import type { CarState } from "../sim/types";
import { pitLossOf, readUndercut } from "../sim/situation";

/** The pit window: what a stop would do, worked out from the same numbers the pit wall uses. */
export function PitWindow({ sim, car }: { sim: RaceSim; car: CarState }) {
  if (car.status !== "racing" || sim.phase !== "racing") return null;
  const loss = pitLossOf(sim);
  const rejoin = car.gapLeader + loss;
  let behind = 0;
  let lastAhead: CarState | null = null;
  for (const o of sim.order) {
    if (o.id === car.id || o.status === "dnf") continue;
    if (o.gapLeader < rejoin) {
      behind++;
      lastAhead = o;
    }
  }
  const pos = behind + 1;
  const wear = car.tyre.wear;
  const per = wear / Math.max(1, car.tyre.ageLaps);
  const left = per > 0 ? Math.max(0, Math.floor((0.85 - wear) / per)) : 99;
  const ahead = sim.order[car.position - 2];
  const rd = ahead && ahead.status === "racing" && car.gapAhead > 0 ? readUndercut(sim, car, ahead, sim.chooseCompoundDry(car), car.gapAhead) : null;
  const free = sim.neutral.active;
  return (
    <div className="pitwin" title="Worked out from the same numbers the pit wall uses">
      <div className="pw-bar">
        <i style={{ width: `${Math.min(100, wear * 100)}%` }} className={wear > 0.85 ? "over" : wear > 0.65 ? "warn" : ""} />
        <b style={{ left: "85%" }} />
      </div>
      <div className="pw-lines">
        <span>TYRES: {car.tyre.ageLaps} laps old, about {left >= 99 ? "plenty" : `${left} laps`} before the cliff</span>
        <span>{free ? "SAFETY CAR: the stop costs about half" : `BOX NOW: rejoin about P${pos}${lastAhead ? `, behind ${lastAhead.entry.driver.code}` : ""}`}</span>
        {rd && <span>{rd.real ? `UNDERCUT ${ahead.entry.driver.code}: worth about +${Math.max(0, rd.value - rd.gap).toFixed(1)}s` : `UNDERCUT ${ahead.entry.driver.code}: ${rd.why === "fresh" ? "his tyres are too fresh" : rd.why === "late" ? "too late in the race" : rd.why === "traffic" ? "you would rejoin in traffic" : "not enough to jump him"}`}</span>}
      </div>
    </div>
  );
}
