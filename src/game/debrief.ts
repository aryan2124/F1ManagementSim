import type { RaceSim } from "../sim/engine";
import type { Compound, LapRec, StopRec } from "../sim/types";

/**
 * The post-race debrief, worked out from what the simulation recorded: lap by lap positions, every stint and stop, the incidents.
 * It says what happened, where places were won and lost, and what to do about it. Nothing here changes the race.
 */

export interface Stint {
  compound: Compound;
  from: number;
  to: number;
  laps: number;
  /** Median lap time of the clean laps in the stint, seconds (NaN when there were none). */
  pace: number;
  /** Share of the compound's life used up by the end of the stint. */
  used: number;
}

export interface DebriefCar {
  id: string;
  code: string;
  name: string;
  color: number;
  grid: number;
  finish: number;
  status: string;
  points: number;
  /** Position after each lap, starting with the grid slot. */
  trace: number[];
  stints: Stint[];
  stops: StopRec[];
  /** Median clean lap over the whole race and the car's rank among all cars (1 = quickest). */
  pace: number;
  paceRank: number;
  /** Seconds a lap slower than the quickest car's race pace. */
  paceGap: number;
  lessons: string[];
}

export interface Moment {
  lap: number;
  text: string;
  tone: "good" | "bad" | "info";
}

export interface Debrief {
  cars: DebriefCar[];
  moments: Moment[];
  field: { bestStop: number; bestStopBy: string; medianStop: number; laps: number };
  rivals: { id: string; code: string; color: number; trace: number[] }[];
  insights: string[];
}

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const a = [...xs].sort((p, q) => p - q);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

const clean = (laps: LapRec[]) => {
  // drop laps that say little about pace (in/out laps, the first lap, safety car laps), then drop the slowest tenth (traffic, mistakes)
  const ok = laps.filter((l) => !l.slow && isFinite(l.time) && l.time > 0).map((l) => l.time);
  if (ok.length < 4) return ok;
  const a = [...ok].sort((p, q) => p - q);
  return a.slice(0, Math.max(3, Math.floor(a.length * 0.9)));
};

const NAME: Record<string, string> = { S: "soft", M: "medium", H: "hard", I: "intermediate", W: "full wet" };

export function buildDebrief(sim: RaceSim, humanIds: string[]): Debrief {
  const rows = sim.results();
  const rowOf = new Map(rows.map((r) => [r.carId, r]));
  const gridOf = new Map(sim.cars.map((c) => [c.id, c.startPosition]));
  const paces = new Map<string, number>();
  for (const c of sim.cars) paces.set(c.id, median(clean(sim.lapLog.get(c.id) ?? [])));
  const ranked = [...paces.entries()].filter(([, p]) => isFinite(p)).sort((a, b) => a[1] - b[1]);
  const fastest = ranked[0]?.[1] ?? NaN;
  const stopSecs = sim.stopLog.map((s) => s.secs).filter((x) => x > 0);
  const bestStop = stopSecs.length ? Math.min(...stopSecs) : NaN;
  const best = sim.stopLog.find((s) => s.secs === bestStop);
  const laps = sim.cfg.laps;

  const cars: DebriefCar[] = humanIds.map((id) => {
    const c = sim.car(id);
    const r = rowOf.get(id);
    const log = sim.lapLog.get(id) ?? [];
    const stops = sim.stopLog.filter((s) => s.carId === id);
    const trace = [gridOf.get(id) ?? c.startPosition, ...log.map((l) => l.pos)];
    // stints are the laps between stops
    const stints: Stint[] = [];
    let from = 1;
    let comp: Compound = log[0]?.compound ?? c.tyre.compound;
    const cut = [...stops.map((s) => s.lap - 1), log.length];
    for (let k = 0; k < cut.length; k++) {
      const to = Math.max(from, Math.min(log.length, cut[k]));
      const part = log.filter((l) => l.lap >= from && l.lap <= to);
      if (part.length) {
        comp = part[0].compound;
        const life = sim.life[comp] ?? 12;
        stints.push({ compound: comp, from, to, laps: part.length, pace: median(clean(part)), used: part.length / Math.max(1, life) });
      }
      from = to + 1;
    }
    const pace = paces.get(id) ?? NaN;
    const paceRank = ranked.findIndex(([x]) => x === id) + 1;
    const finish = r && r.status === "FIN" ? r.position : 0;
    const lessons: string[] = [];
    const grid = trace[0];
    const lap1 = trace.length > 1 ? trace[1] : grid;
    if (lap1 - grid >= 2) lessons.push(`A poor first lap: down from P${grid} to P${lap1}. Starts are won by tyre choice and a clear run to turn one.`);
    else if (grid - lap1 >= 2) lessons.push(`A strong first lap: up from P${grid} to P${lap1}.`);
    for (const st of stints.slice(0, -1)) {
      if (st.used < 0.55 && st.laps >= 4) lessons.push(`The ${NAME[st.compound]} stint ended after ${st.laps} laps with about ${Math.round((1 - st.used) * 100)}% of the tyre left. A longer stint could have saved a stop or let you attack later.`);
      else if (st.used > 1.02) lessons.push(`You stayed out on the ${NAME[st.compound]}s for ${st.laps} laps, past their life. The last laps of the stint were slow.`);
    }
    for (const s of stops) {
      if (isFinite(bestStop) && s.secs > bestStop + 1.2) lessons.push(`Lap ${s.lap} stop took ${s.secs.toFixed(1)} s, against the best of the race at ${bestStop.toFixed(1)} s. Pit crew work is worth a look.`);
    }
    if (isFinite(pace) && paceRank > 0 && finish > 0) {
      if (finish < paceRank - 1) lessons.push(`You finished P${finish} with the ${ordinal(paceRank)} fastest race pace: strategy and racecraft added places.`);
      else if (finish > paceRank + 1) lessons.push(`You finished P${finish} with the ${ordinal(paceRank)} fastest race pace: the car was quicker than the result. Look at the start, the stops and any incident.`);
      else lessons.push(`P${finish} was about where the pace put you (${ordinal(paceRank)} fastest).`);
    }
    if (r && r.status !== "FIN") lessons.push(`Retired: ${r.dnfReason || "out of the race"}.`);
    if (r && r.penalty > 0) lessons.push(`Penalties cost ${r.penalty} s: ${r.penaltyNotes.join(", ") || "see the stewards' decisions"}.`);
    return {
      id,
      code: c.entry.driver.code,
      name: c.entry.driver.name,
      color: c.entry.team.color,
      grid,
      finish,
      status: r?.status ?? "FIN",
      points: r?.points ?? 0,
      trace,
      stints,
      stops,
      pace,
      paceRank,
      paceGap: isFinite(pace) && isFinite(fastest) ? pace - fastest : NaN,
      lessons,
    };
  });

  const moments: Moment[] = [];
  const mine = new Set(humanIds);
  for (const e of sim.keyEvents) {
    const involved = (e.carId && mine.has(e.carId)) || (e.otherId && mine.has(e.otherId));
    const global = e.kind === "sc_deployed" || e.kind === "vsc" || e.kind === "red_flag" || e.kind === "weather" || e.kind === "lightning";
    if (!involved && !global) continue;
    if (e.kind === "lockup") continue;
    const tone: Moment["tone"] = e.kind === "overtake" ? (e.carId && mine.has(e.carId) ? "good" : "bad") : e.kind === "fastest_lap" ? "good" : e.kind === "weather" || global ? "info" : "bad";
    moments.push({ lap: e.lap, text: e.text, tone });
  }
  for (const s of sim.stopLog) if (mine.has(s.carId)) moments.push({ lap: s.lap, text: `${sim.car(s.carId).entry.driver.code} pits for ${NAME[s.to]}s (${s.secs.toFixed(1)} s stationary).`, tone: "info" });
  moments.sort((a, b) => a.lap - b.lap);

  const rivals = rows
    .slice(0, 6)
    .filter((r) => !mine.has(r.carId))
    .map((r) => {
      const c = sim.car(r.carId);
      return { id: r.carId, code: c.entry.driver.code, color: c.entry.team.color, trace: [gridOf.get(r.carId) ?? c.startPosition, ...(sim.lapLog.get(r.carId) ?? []).map((l) => l.pos)] };
    });

  const insights: string[] = [];
  const total = cars.reduce((a, c) => a + c.points, 0);
  const bestCar = [...cars].sort((a, b) => (a.paceRank || 99) - (b.paceRank || 99))[0];
  if (bestCar && isFinite(bestCar.paceGap)) insights.push(bestCar.paceGap < 0.15 ? `Your best race pace was within ${bestCar.paceGap.toFixed(2)} s a lap of the quickest car in the field.` : `The quickest car was ${bestCar.paceGap.toFixed(2)} s a lap faster than yours on race pace. That gap is what the factory has to close.`);
  insights.push(total > 0 ? `The weekend earned ${total} point${total === 1 ? "" : "s"}.` : "No points this weekend.");
  return { cars, moments, field: { bestStop: bestStop, bestStopBy: best ? sim.car(best.carId).entry.driver.code : "", medianStop: median(stopSecs), laps }, rivals, insights };
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
