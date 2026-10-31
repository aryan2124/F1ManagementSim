import type { QualiSim, QCar } from "../sim/qualifying";
import { DT } from "../sim/engine";

/**
 * The qualifying director. Like the real world feed it follows cars on flying laps, in this order of interest:
 * a car that is quick against pole, a car in the drop zone (about to be knocked out) late in the segment, the player's cars,
 * two cars close together, a purple sector, then trouble (spin, crash, red flag). Out laps and in laps are skipped
 * unless it is the player's car. A shot is held a few seconds, it never leaves a car in the last sector, and a finished
 * lap stays on screen for the result. It never shows replays.
 */
const MIN_DWELL = 3800;
const AFTER_LAP = 6500;

export class QualiDirector {
  private cur = { id: "", at: 0, why: "" };
  private lapSeen = new Map<string, number>();
  private holdUntil = 0;

  get caption(): string {
    return this.cur.why;
  }

  pick(sim: QualiSim, human: string[], now: number, current: string): string {
    const cars = sim.order as QCar[];
    // a lap that has just finished stays on screen for the result
    for (const c of cars) {
      const seen = this.lapSeen.get(c.id) ?? c.lastLap;
      if (c.lastLap !== seen && c.lastLap > 0 && (this.cur.id === c.id || c.entry.human)) {
        this.holdUntil = now + AFTER_LAP;
        if (this.cur.id !== c.id) this.cur = { id: c.id, at: now, why: `LAP DONE: ${c.entry.driver.code}` };
      }
      this.lapSeen.set(c.id, c.lastLap);
    }
    if (now < this.holdUntil && this.cur.id) return this.cur.id;

    const seg = sim.segment - 1;
    const cut = sim.segment < 3 ? sim.keepers[seg] : 0;
    const pole = cars[0];
    const flying = cars.filter((c) => c.phase === "push" && c.lapStartTick >= 0);
    let best: { id: string; score: number; why: string } | null = null;
    const take = (id: string, score: number, why: string) => {
      if (!best || score > best.score) best = { id, score, why };
    };
    for (const c of flying) {
      const code = c.entry.driver.code;
      let s = 10 + c.sectorIdx * 2;
      let why = `FLYING LAP: ${code}`;
      // quick against pole so far
      if (pole && pole.id !== c.id && c.sectorIdx > 0) {
        let d = 0;
        for (let i = 0; i < c.sectorIdx; i++) d += c.sectors.last[i] - pole.sectors.best[i];
        if (isFinite(d) && d < 0.15) { s += d <= 0 ? 24 : 14; why = d <= 0 ? `UP ON POLE: ${code}` : `CLOSE TO POLE: ${code}`; }
      }
      // on the bubble with the clock running down
      if (cut && c.position >= cut - 2 && c.position <= cut + 3 && sim.clock < 150) { s += 18; why = `IN THE DROP ZONE: ${code}`; }
      if (c.entry.human) s += 8;
      if (c.sectors.color.some((k, i) => k === 3 && i < c.sectorIdx)) { s += 6; why = `PURPLE SECTOR: ${code}`; }
      // two flying cars close together
      for (const o of flying) {
        if (o.id !== c.id && Math.abs(o.lapStartTick - c.lapStartTick) * DT < 1.5) { s += 6; why = `HEAD TO HEAD: ${code} AND ${o.entry.driver.code}`; break; }
      }
      take(c.id, s, why);
    }
    for (const c of cars) {
      if (c.phase === "crashed") take(c.id, 40, `TROUBLE: ${c.entry.driver.code}`);
    }
    if (!best) {
      const mine = cars.find((c) => human.includes(c.id) && c.phase !== "garage");
      const pick = mine ?? pole;
      best = { id: pick.id, score: 1, why: mine ? `YOUR CAR: ${mine.entry.driver.code}` : `PIT LANE: ${pole.entry.driver.code}` };
    }
    const b = best as { id: string; score: number; why: string };
    // keep the current shot unless the new one is clearly better, and never leave a car in its last sector
    const curCar = cars.find((c) => c.id === this.cur.id);
    const curFlying = !!curCar && curCar.phase === "push" && curCar.lapStartTick >= 0;
    if (curFlying && (curCar!.sectorIdx >= 2 || now - this.cur.at < MIN_DWELL) && b.id !== this.cur.id && b.score < 60) {
      return this.cur.id;
    }
    if (b.id !== this.cur.id) this.cur = { id: b.id, at: now, why: b.why };
    else this.cur.why = b.why;
    return this.cur.id || current;
  }
}
