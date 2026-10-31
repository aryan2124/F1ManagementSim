import type { RaceSim } from "../sim/engine";
import { COMPOUNDS, speedFactor } from "../sim/engine";
import { pitLossOf } from "../sim/situation";

export interface ReportLine {
  tone: "good" | "bad" | "even";
  lap: number;
  car: string;
  text: string;
}

export interface StrategyReport {
  grade: "A" | "B" | "C" | "D";
  score: number;
  lines: ReportLine[];
  /** Standing orders that ran, so the player sees the plan at work. */
  summary: string;
}

/**
 * The strategy report card: every call the pit wall made for the player, judged on what the sim can actually measure,
 * plus what each stop cost or gained. No made-up numbers: tyre life left unused, laps past the limit, free stops under a
 * safety car, and whether a cover or an undercut held position.
 */
export function strategyReport(sim: RaceSim, humanIds: string[]): StrategyReport {
  const lines: ReportLine[] = [];
  let score = 0;
  const code = (id: string) => sim.car(id)?.entry.driver.code ?? "?";
  const N = sim.track.nominalLap;
  for (const rec of sim.stopLog) {
    if (!humanIds.includes(rec.carId)) continue;
    const car = sim.car(rec.carId);
    if (!car) continue;
    const who = code(rec.carId);
    if (rec.hurt) {
      lines.push({ tone: "even", lap: rec.lap, car: who, text: `Lap ${rec.lap}: stopped with damage. Unavoidable.` });
      continue;
    }
    const wear = rec.wearBefore ?? 0.8;
    const unused = Math.round(Math.max(0, 1 - wear / 0.85) * 100);
    if (rec.underNeutral && wear > 0.3) {
      lines.push({ tone: "good", lap: rec.lap, car: who, text: `Lap ${rec.lap}: a cheap stop under the safety car, tyres ${Math.round(wear * 100)}% worn.` });
      score += 1.5;
    } else if (rec.lap <= 3 || ((rec.ageBefore ?? 99) < 6 && wear < 0.3)) {
      lines.push({ tone: "bad", lap: rec.lap, car: who, text: `Lap ${rec.lap}: boxed with ${unused}% of the tyre life unused. A full stop costs about ${Math.round(pitLossOf(sim))} seconds.` });
      score -= 1.5;
    } else if (wear > 1.0) {
      const lossPerLap = N * (1 / speedFactor(car.entry, { compound: rec.from, wear }, car.fuel, 1, 0.004, 1) - 1 / speedFactor(car.entry, { compound: rec.from, wear: 0.85 }, car.fuel, 1, 0.004, 1));
      lines.push({ tone: "bad", lap: rec.lap, car: who, text: `Lap ${rec.lap}: stayed out until the ${COMPOUNDS[rec.from].name}s were ${Math.round(wear * 100)}% worn, costing about ${Math.max(0.1, lossPerLap).toFixed(1)}s a lap at the end.` });
      score -= 1.5;
    } else if (wear >= 0.55) {
      lines.push({ tone: "good", lap: rec.lap, car: who, text: `Lap ${rec.lap}: boxed with the ${COMPOUNDS[rec.from].name}s ${Math.round(wear * 100)}% worn, about right.` });
      score += 1;
    }
    if (rec.secs > 4) {
      lines.push({ tone: "bad", lap: rec.lap, car: who, text: `Lap ${rec.lap}: a slow stop, ${rec.secs.toFixed(1)}s stationary.` });
      score -= 0.5;
    }
  }
  const calls = sim.radio?.calls ?? [];
  for (const c of calls) {
    if (!humanIds.includes(c.carId)) continue;
    const who = code(c.carId);
    if (c.verdict) {
      lines.push({ tone: c.verdict === "good" ? "good" : "bad", lap: c.lap, car: who, text: `Lap ${c.lap}: ${c.text}. ${c.note ?? ""}`.trim() });
      score += c.verdict === "good" ? 2 : -2;
    } else if (c.kind === "standing") {
      lines.push({ tone: "even", lap: c.lap, car: who, text: `Lap ${c.lap}: standing order carried out (${c.text.toLowerCase()}).` });
    }
  }
  for (const st of sim.stackLog) {
    if (!humanIds.includes(st.carId) || st.wait < 2.5) continue;
    lines.push({ tone: "bad", lap: st.lap, car: code(st.carId), text: `Lap ${st.lap}: stacked behind the team-mate and waited ${st.wait.toFixed(1)}s in the pit lane.` });
    score -= 1;
  }
  lines.sort((a, b) => a.lap - b.lap);
  const grade = score >= 4 ? "A" : score >= 2 ? "B" : score >= 0 ? "C" : "D";
  const ran = new Set(calls.filter((c) => humanIds.includes(c.carId) && c.kind === "standing").map((c) => c.text)).size;
  let summary = ran ? `Your standing orders made ${ran} call${ran > 1 ? "s" : ""} for you.` : "";
  // D3: the pre-race call is judged too
  const g = sim.cfg.gamble;
  if (g && g !== "safe") {
    const mine = sim.stopLog.filter((x) => humanIds.includes(x.carId));
    const avg = mine.length ? mine.reduce((a, x) => a + x.secs, 0) / mine.length : 0;
    const name = g === "undercut" ? "Undercut ready" : "Long run";
    summary += `${summary ? " " : ""}Pre-race call, ${name}: ${mine.length ? `${mine.length} stop${mine.length > 1 ? "s" : ""}, average ${avg.toFixed(1)} s in the box.` : "you never stopped, so the quick crew was not needed."}`;
  }
  return { grade, score, lines, summary };
}
