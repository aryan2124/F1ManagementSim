import { useMemo, useState } from "react";
import { createWeekend, raceConfigFrom, simulateQualifying } from "../game/setup";
import { RaceSession } from "../game/session";
import { Podium } from "../ui/Podium";
import { RaceScreen } from "../ui/RaceScreen";
import { Swirl } from "../ui/skin/Swirl";

/** Developer preview: opens the podium straight away on a finished race (?demo=podium). Used for screenshots. */
export function PodiumPreview() {
  const [n, setN] = useState(0);
  const session = useMemo(() => {
    const w = createWeekend({ teamId: "mer", circuitId: "silverstone", distance: "quick", seed: 7 });
    const s = new RaceSession(raceConfigFrom(w, simulateQualifying(w), {}), w.humanIds);
    s.skipToEnd();
    return s;
  }, [n]);
  return (
    <div className="app">
      <Swirl />
      <Podium key={n} session={session} gp="British Grand Prix" onDone={() => setN((x) => x + 1)} />
    </div>
  );
}

/** Developer preview: a finished race where the first two finishers do donuts (?demo=donut). */
export function DonutPreview() {
  const { session, meta } = useMemo(() => {
    const w = createWeekend({ teamId: "mer", circuitId: "silverstone", distance: "quick", seed: 7 });
    const s = new RaceSession(raceConfigFrom(w, simulateQualifying(w), {}), w.humanIds);
    s.skipToEnd();
    return { session: s, meta: w.meta };
  }, []);
  return (
    <div className="app">
      <Swirl />
      <RaceScreen session={session} meta={meta} onFinish={() => {}} donuts={(sess) => sess.sim.results().filter((r) => r.status === "FIN").slice(0, 2).map((r) => r.carId)} />
    </div>
  );
}
