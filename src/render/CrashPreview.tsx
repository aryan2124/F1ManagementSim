import { useEffect, useMemo } from "react";
import { createWeekend, raceConfigFrom, simulateQualifying } from "../game/setup";
import { RaceSession } from "../game/session";
import { RaceScreen } from "../ui/RaceScreen";
import { Swirl } from "../ui/skin/Swirl";
import type { Method, Stage } from "../sim/recovery";
import type { Pose } from "../sim/types";

/**
 * Developer preview: a crash scene frozen in a chosen state, for looking at the drawing (?demo=crash&pose=back&method=crane&stage=remove&medical=1&fire=1).
 * The sim is real: a real crash is found, then its recovery is put into the asked state and the clock is paused.
 */
export function CrashPreview({ params }: { params: URLSearchParams }) {
  const { session, meta } = useMemo(() => {
    const w = createWeekend({ teamId: "mer", circuitId: params.get("circuit") ?? "silverstone", distance: "quick", seed: 7 });
    const s = new RaceSession(raceConfigFrom(w, simulateQualifying(w), {}), w.humanIds);
    s.started = true;
    const sim = s.sim;
    // find a race with a stopped car
    let guard = 0;
    while (sim.phase !== "finished" && guard++ < 200000 && sim.inc.rec.recoveries.length === 0) sim.step();
    const r = sim.inc.rec.recoveries[0];
    if (r) {
      const pose = params.get("pose") as Pose | null;
      const method = params.get("method") as Method | null;
      const stage = (params.get("stage") as Stage | null) ?? r.stage;
      if (pose) r.pose = pose;
      if (method) r.method = method;
      r.medical = params.get("medical") === "1" ? true : r.medical;
      r.fire = params.get("fire") === "1" ? true : r.fire;
      r.barrier = params.get("barrier") === "1" ? true : r.barrier;
      r.stage = stage;
      const p = Number(params.get("p") ?? 0.5);
      const dur = Math.max(20, r.plan[stage] || 60);
      r.stageStart = sim.tick - Math.round(dur * p);
      r.stageEnd = r.stageStart + dur;
      s.followId = r.carId;
      s.directing = false;
    }
    s.speed = 0;
    return { session: s, meta: w.meta };
  }, [params]);
  useEffect(() => {
    const z = Number(params.get("zoom") ?? 4);
    const id = window.setTimeout(() => window.dispatchEvent(new CustomEvent("boxbox-zoom", { detail: z })), 1200);
    return () => window.clearTimeout(id);
  }, [params]);
  return (
    <div className="app">
      <Swirl />
      <RaceScreen session={session} meta={meta} onFinish={() => {}} donuts={() => []} />
    </div>
  );
}
