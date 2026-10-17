import type { CarState, SimEvent } from "../sim/types";
import type { RaceSim } from "../sim/engine";

/**
 * The race director. It decides which car the broadcast camera shows, the way the F1 world feed does:
 *  - something dramatic (a crash, a spin, a car stopping) cuts in at once and holds long enough to see what happened;
 *  - a pass for position, a pit stop for a front runner, or a driver on the radio earns a cut;
 *  - otherwise the camera sits on the closest fight on track, weighted towards the front, and goes back to the leader when nothing is going on;
 *  - it never cuts faster than a few seconds, and avoids returning to the car it just showed.
 * Time is real time, so the pace of cutting stays the same at any race speed.
 */

interface Shot {
  id: string;
  score: number;
  until: number;
  why: string;
  at: number;
  urgent?: boolean;
}

const MIN_DWELL = 4200;

const WEIGHT: Partial<Record<SimEvent["kind"], { score: number; hold: number; label: string }>> = {
  crash: { score: 100, hold: 9000, label: "INCIDENT" },
  spin: { score: 92, hold: 7000, label: "SPIN" },
  contact: { score: 90, hold: 7000, label: "CONTACT" },
  wall: { score: 90, hold: 7000, label: "INCIDENT" },
  failure: { score: 88, hold: 7000, label: "TROUBLE" },
  damage: { score: 70, hold: 6000, label: "DAMAGE" },
  lockup: { score: 50, hold: 4500, label: "LOCK UP" },
  off_track: { score: 55, hold: 5000, label: "OFF THE TRACK" },
  gravel: { score: 85, hold: 6500, label: "IN THE GRAVEL" },
  overtake: { score: 78, hold: 6500, label: "OVERTAKE" },
  pit_in: { score: 56, hold: 6500, label: "IN THE PITS" },
  fastest_lap: { score: 60, hold: 5000, label: "FASTEST LAP" },
  penalty: { score: 58, hold: 5000, label: "PENALTY" },
  radio: { score: 66, hold: 5500, label: "ON THE RADIO" },
};

export class Director {
  shot: Shot | null = null;
  private last = new Map<string, number>();
  private pending: Shot | null = null;

  /** What the camera is showing and why, for the little caption on screen. */
  get caption(): string {
    return this.shot ? this.shot.why : "";
  }

  /** Feed every sim event in; the director remembers the ones worth a cut. */
  note(e: SimEvent, sim: RaceSim, human: string[], now: number): void {
    const w = WEIGHT[e.kind];
    if (!w || !e.carId) return;
    const car = sim.car(e.carId);
    let score = w.score;
    const mine = human.includes(e.carId) || (e.otherId ? human.includes(e.otherId) : false);
    const pos = car.position;
    if (e.kind === "overtake") {
      // a pass at the front matters; one in the pack only gets a look if it is close to the fight for the points or involves the player
      if (pos > 10 && !mine) return;
      score += (11 - Math.min(10, pos)) * 1.5;
    } else if (e.kind === "pit_in") {
      if (pos > 6 && !mine) return;
    } else if (e.kind === "radio") {
      if (e.team && !mine && pos > 8) return;
      // radio from a rival team's pit wall is only interesting for the cars up front
      if (e.channel === undefined && !mine && pos > 10) return;
    } else if (e.kind === "lockup" || e.kind === "off_track" || e.kind === "damage") {
      if (pos > 12 && !mine) return;
    }
    if (mine) score += 8;
    const why = `${w.label}: ${car.entry.driver.code}`;
    const shot: Shot = { id: e.carId, score, until: now + w.hold, why, at: now, urgent: w.score >= 85 };
    if (!this.pending || shot.score >= this.pending.score) this.pending = shot;
  }

  /** The car the camera should be on right now. */
  pick(sim: RaceSim, human: string[], now: number, current: string): string {
    const cur = this.shot;
    const holding = !!cur && now < cur.until && cur.id === current;
    const age = cur ? now - cur.at : Infinity;

    // an event shot takes over when it is urgent, bigger than the current shot, or the current one has run its course
    const p = this.pending;
    if (p) {
      const urgent = !!p.urgent;
      if (!cur || !holding || urgent || (age >= MIN_DWELL && p.score > cur.score)) {
        this.pending = null;
        return this.cut(p, now);
      }
      if (now > p.until) this.pending = null;
    }
    if (cur && holding) return cur.id;

    // nothing special: the best battle, or the leader
    const best = this.bestFight(sim, human, now);
    return this.cut({ id: best.id, score: best.score, until: now + MIN_DWELL + (best.score > 30 ? 2500 : 0), why: best.why, at: now }, now);
  }

  private cut(s: Shot, now: number): string {
    this.shot = { ...s, at: now };
    this.last.set(s.id, now);
    return s.id;
  }

  private bestFight(sim: RaceSim, human: string[], now: number): { id: string; score: number; why: string } {
    const racing = sim.order.filter((c: CarState) => c.status === "racing" || c.status === "pit_out");
    const leader = racing[0] ?? sim.order[0];
    let best = { id: leader.id, score: 20, why: sim.phase === "racing" && sim.tick < sim.lightsAt + 600 ? "THE START" : "THE LEADER" };
    if (sim.neutral.active) return { id: leader.id, score: 20, why: sim.neutral.kind === "vsc" ? "VIRTUAL SAFETY CAR" : "SAFETY CAR" };
    if (sim.phase === "grid") return best;
    for (const c of racing) {
      if (c.position === 1) continue;
      const gap = c.gapAhead;
      if (!(gap > 0) || gap > 1.6) continue;
      const ahead = sim.order[c.position - 2];
      const front = (22 - Math.min(21, c.position)) / 22 + 0.5;
      let score = (1.7 - gap) * 32 * front;
      if (human.includes(c.id) || (ahead && human.includes(ahead.id))) score += 10;
      if (c.position <= 3) score += 8;
      const seen = this.last.get(c.id);
      if (seen !== undefined && now - seen < 15000) score -= 22;
      if (score > best.score) best = { id: c.id, score, why: `BATTLE: ${c.entry.driver.code} CLOSING ON ${ahead?.entry.driver.code ?? "THE CAR AHEAD"}` };
    }
    // the leader keeps coming back when nothing beats them
    if (best.id !== leader.id) return best;
    const seenL = this.last.get(leader.id);
    if (seenL !== undefined && now - seenL < 9000) {
      const second = racing[1];
      if (second) return { id: second.id, score: 18, why: `P2: ${second.entry.driver.code}` };
    }
    return best;
  }
}
