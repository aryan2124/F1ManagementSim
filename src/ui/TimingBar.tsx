import { useRef } from "react";
import type { QualiSession } from "../game/qsession";
import type { QCar } from "../sim/qualifying";
import { DT, fmtLap } from "../sim/engine";
import { CompoundBadge } from "./Briefing";
import { SECTOR_COLORS, hex } from "./colors";

/**
 * A broadcast-style timing bar for the car the camera is on. Conventions used here follow the usual television graphics:
 * a running lap clock, three sector boxes that fill in as each sector is completed (purple is the best of everyone, green a personal best,
 * yellow slower than the driver's own best), a gap to the benchmark at each sector, and the final lap time with the position it earns.
 * Out laps and in laps are shown quietly, with no clock.
 */

const sec = (t: number) => (isFinite(t) && t > 0 ? t.toFixed(3) : "--.---");
const gapStr = (g: number) => `${g >= 0 ? "+" : "-"}${Math.abs(g).toFixed(3)}`;

interface Hold {
  until: number;
  car: string;
  time: number;
  secs: [number, number, number];
  cols: [number, number, number];
  valid: boolean;
  pos: number;
  gap: number;
  isBest: boolean;
}

export function TimingBar({ session }: { session: QualiSession }) {
  const sim = session.sim;
  const car: QCar = sim.car(session.followId);
  const hold = useRef<Hold | null>(null);
  const lastSeen = useRef<{ id: string; lap: number }>({ id: "", lap: 0 });
  const seg = sim.segment - 1;
  const leader = sim.order[0];
  const now = Date.now();

  // a finished lap holds on screen for a few seconds, like the broadcast
  if (lastSeen.current.id !== car.id) lastSeen.current = { id: car.id, lap: car.lastLap };
  else if (car.lastLap !== lastSeen.current.lap && car.lastLap > 0) {
    lastSeen.current.lap = car.lastLap;
    const lead = leader?.best[seg] ?? Infinity;
    const mine = car.best[seg];
    hold.current = {
      until: now + 6500,
      car: car.id,
      time: car.lastLap,
      secs: [...car.sectors.last] as [number, number, number],
      cols: [...car.sectors.color] as [number, number, number],
      valid: car.lastValid,
      pos: car.position,
      gap: isFinite(mine) && isFinite(lead) ? mine - lead : 0,
      isBest: car.lastValid && Math.abs(mine - car.lastLap) < 1e-6,
    };
  }
  const h = hold.current && hold.current.car === car.id && hold.current.until > now ? hold.current : null;

  const team = hex(car.entry.team.color);
  const flying = car.phase === "push" && car.lapStartTick >= 0;
  const clock = flying ? (sim.tick - car.lapStartTick) * DT : 0;
  const secNow = flying ? (sim.tick - car.sectorStartTick) * DT : 0;

  // the benchmark is the leader's best sectors, so the gap at each sector is against the fastest lap so far
  let cum = 0;
  let cumBench = 0;
  let gap: number | null = null;
  if (flying) {
    for (let i = 0; i < car.sectorIdx; i++) {
      cum += car.sectors.last[i];
      cumBench += leader && leader.id !== car.id ? leader.sectors.best[i] : NaN;
    }
    if (car.sectorIdx > 0 && isFinite(cumBench)) gap = cum - cumBench;
  }

  const head = (
    <div className="tb-id" style={{ ["--team" as string]: team }}>
      <i className="tb-pos">{car.position}</i>
      <i className="tb-chip" />
      <b>{car.entry.driver.code}</b>
      <CompoundBadge c={car.compound} size={14} />
    </div>
  );

  if (h) {
    return (
      <div className="tbar hold">
        {head}
        <div className="tb-secs">
          {[0, 1, 2].map((i) => (
            <div key={i} className="tb-sec" style={{ borderColor: h.valid ? SECTOR_COLORS[h.cols[i]] : "#555" }}>
              <small>S{i + 1}</small>
              <b>{sec(h.secs[i])}</b>
            </div>
          ))}
        </div>
        <div className="tb-final">
          <b className={h.valid ? "" : "del"}>{h.valid ? fmtLap(h.time) : "LAP DELETED"}</b>
          <span>{h.valid ? `P${h.pos}${h.pos > 1 ? " " + gapStr(h.gap) : " FASTEST"}` : "Track limits or a mistake"}</span>
        </div>
      </div>
    );
  }

  if (car.phase === "out" || car.phase === "in" || car.phase === "queue" || car.phase === "entering" || car.phase === "garage" || car.phase === "crashed") {
    const label = car.phase === "out" ? "OUT LAP" : car.phase === "in" ? "IN LAP" : car.phase === "queue" ? "WAITING AT PIT EXIT" : car.phase === "entering" ? "ENTERING THE PITS" : car.phase === "crashed" ? "CRASHED" : "IN THE GARAGE";
    return (
      <div className="tbar quiet">
        {head}
        <div className="tb-quiet">
          <b>{label}</b>
          <span>{isFinite(car.best[seg]) ? `Best this session ${fmtLap(car.best[seg])}` : "No time set yet"}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="tbar">
      {head}
      <div className="tb-secs">
        {[0, 1, 2].map((i) => {
          const done = i < car.sectorIdx;
          const live = i === car.sectorIdx;
          return (
            <div key={i} className={`tb-sec ${done ? "done" : live ? "live" : ""}`} style={{ borderColor: done ? SECTOR_COLORS[car.sectors.color[i]] : undefined }}>
              <small>S{i + 1}</small>
              <b>{done ? sec(car.sectors.last[i]) : live ? sec(secNow) : "--.---"}</b>
            </div>
          );
        })}
      </div>
      <div className="tb-clock">
        <b>{fmtLap(clock)}</b>
        <span className={gap === null ? "" : gap <= 0 ? "ahead" : "behind"}>{gap === null ? (!leader || leader.id === car.id || car.sectorIdx >= 1 ? "Setting the benchmark" : "Gap after S1") : `${gapStr(gap)} to the fastest`}</span>
      </div>
    </div>
  );
}
