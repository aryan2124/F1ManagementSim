import type { RaceSim } from "./engine";
import { DT } from "./engine";
import type { CarState, CrashInfo, Pose } from "./types";

/**
 * What happens after a car stops: the marshals run to it, the driver is checked, a car on its side is turned back onto
 * its wheels, the driver climbs out, the car is removed by one of five methods, and the track is swept. Each stage has
 * a length that depends on the crash, and a neutralisation cannot end while any stage is still open. That is the link
 * to strategy: the time under the safety car is the sum of these stages, not a fixed number.
 *
 * Debris lives here too: pieces that fall off cars, what race control does about them, the marshals who go and pick them
 * up, and what happens to a car that drives over one.
 */

export type Method = "drive" | "push" | "tractor" | "crane" | "leave";
export type Stage = "dispatch" | "fire" | "check" | "right" | "driver_out" | "remove" | "sweep" | "done";
export const STAGES: Stage[] = ["dispatch", "fire", "check", "right", "driver_out", "remove", "sweep", "done"];

export interface Recovery {
  id: number;
  carId: string;
  /** Metres along the lap where the car came to rest, and which side of the track. */
  at: number;
  side: 1 | -1;
  pose: Pose;
  impact: number;
  fire: boolean;
  medical: boolean;
  method: Method;
  stage: Stage;
  stageStart: number;
  stageEnd: number;
  start: number;
  /** Planned length of every stage in ticks (0 = the stage is skipped). */
  plan: Record<Stage, number>;
  /** The driver is well enough to wave and walk off. */
  wave: boolean;
  barrier: boolean;
  /** What race control tells the pit wall to expect, in minutes. It can be wrong. */
  estimate: number;
}

export interface Debris {
  id: number;
  at: number;
  lat: number;
  size: 1 | 2 | 3;
  kind: "wing" | "tyre" | "bodywork" | "object";
  onLine: boolean;
  born: number;
  pickStart: number;
  pickEnd: number;
  gone: boolean;
  /** Which marshal post side the marshal comes from. */
  side: 1 | -1;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const mod = (a: number, n: number) => ((a % n) + n) % n;
/** All lengths below are in seconds of race time; the recovery crews are not quick. */
const sec = (s: number) => Math.round((s * 0.8) / DT);

/** The state a crashed car comes to rest in, from how it hit. The circumstance decides, never a flavour roll. */
export function pickPose(
  sim: RaceSim,
  o: { kind: "wall" | "spin_stall" | "gravel" | "collision" | "mech"; v: number; braking: boolean; spinning: boolean; contact: boolean; closing: number; wet: number },
): { pose: Pose; impact: number } {
  const rng = sim.rng;
  const base = clamp(Math.pow(o.v / 85, 2), 0, 1.1);
  if (o.kind === "gravel") return { pose: "buried", impact: 0.12 };
  if (o.kind === "spin_stall") return { pose: "spun", impact: 0.1 };
  if (o.kind === "mech") return { pose: "upright", impact: 0.05 };
  const contactBoost = o.contact ? 0.1 + clamp(o.closing / 80, 0, 0.3) : 0;
  // a car is only launched by something to launch from: another car, at a real closing speed
  if (o.contact && o.closing > 22 && o.v > 60 && rng.chance(0.28)) {
    const back = o.v > 72 && rng.chance(0.45);
    return { pose: back ? "back" : "side", impact: clamp(base + contactBoost + 0.1, 0, 1.2) };
  }
  // fast solo hit on a dry day with grippy ground under the wheels can tip a car, rarely
  if (!o.contact && o.v > 80 && o.wet < 0.3 && rng.chance(0.03)) return { pose: "side", impact: clamp(base + 0.1, 0, 1.2) };
  if (o.braking && o.v > 45) return { pose: "nose_in", impact: clamp(base + contactBoost, 0, 1.2) };
  if (o.spinning) return { pose: "rear_in", impact: clamp(base * 0.9 + contactBoost, 0, 1.2) };
  return { pose: "upright", impact: clamp(base * 0.7 + contactBoost, 0, 1.2) };
}

export function methodFor(pose: Pose, impact: number, fire: boolean): Method {
  if (pose === "buried") return "tractor";
  if (pose === "side" || pose === "back") return impact > 0.55 || fire ? "crane" : "tractor";
  if (pose === "nose_in" || pose === "rear_in") return impact > 0.7 || fire ? "crane" : impact > 0.35 ? "tractor" : "push";
  return fire ? "tractor" : "push";
}

export class RecoverySystem {
  recoveries: Recovery[] = [];
  debris: Debris[] = [];
  private nextId = 1;
  private byCar = new Map<string, Recovery>();

  constructor(private sim: RaceSim) {}

  // ------------------------------------------------------------------ queries

  active(): Recovery[] {
    return this.recoveries.filter((r) => r.stage !== "done");
  }

  /** True while any crew still has work on the circuit. A neutralisation cannot end then. */
  busy(): boolean {
    if (this.recoveries.some((r) => r.stage !== "done")) return true;
    return this.debris.some((d) => !d.gone && (d.size >= 2 || d.onLine) && this.sim.neutral.active);
  }

  forCar(carId: string): Recovery | undefined {
    return this.byCar.get(carId);
  }

  /** Remaining seconds for what is open, as the crews see it. */
  remainingSecs(): number {
    const t = this.sim.tick;
    let worst = 0;
    for (const r of this.active()) {
      let left = Math.max(0, r.stageEnd - t);
      const i = STAGES.indexOf(r.stage);
      for (let k = i + 1; k < STAGES.length; k++) left += r.plan[STAGES[k]];
      worst = Math.max(worst, left);
    }
    return worst * DT;
  }

  // ------------------------------------------------------------------ debris

  spawnDebris(from: CarState, size: 1 | 2 | 3, kind: Debris["kind"], onLineChance: number): Debris {
    const sim = this.sim;
    const L = sim.track.length;
    const onLine = sim.rng.chance(onLineChance);
    const lat = onLine ? sim.rng.range(-2.5, 2.5) : (from.incident?.side ?? 1) * sim.rng.range(5, 9);
    const d: Debris = {
      id: this.nextId++,
      at: mod(from.s + sim.rng.range(-10, 25), L),
      lat,
      size,
      kind,
      onLine,
      born: sim.tick,
      pickStart: -1,
      pickEnd: -1,
      gone: false,
      side: lat >= 0 ? 1 : -1,
    };
    this.debris.push(d);
    return d;
  }

  /**
   * Race control's call on debris with nothing stopped on the circuit: nothing for a small piece off the line, a virtual
   * safety car for one on the line while the field is bunched and a marshal has time, a safety car when it is large, the
   * field is stretched out, or tyres are already going.
   */
  raceControlForDebris(d: Debris, from: CarState, turn: string, punctures: number) {
    const sim = this.sim;
    if (sim.neutral.active || this.sim.inc.red.active) return;
    const racing = sim.cars.filter((c) => c.status === "racing");
    if (racing.length < 2) return;
    const front = Math.max(...racing.map((c) => c.s));
    const back = Math.min(...racing.map((c) => c.s));
    const bunched = front - back < sim.track.length * 0.45;
    const cause = `debris${turn} after ${from.entry.driver.code}`;
    if (d.size === 1 && !d.onLine) return;
    if (d.size === 3 || punctures >= 2 || (d.size === 2 && !bunched)) sim.deployNeutral("sc", cause);
    else if (d.onLine && bunched) sim.deployNeutral("vsc", cause);
  }

  private debrisStep() {
    const sim = this.sim;
    const L = sim.track.length;
    for (const d of this.debris) {
      if (d.gone) continue;
      const calm = sim.neutral.active || sim.inc.red.active;
      // who goes: a small piece off the line, at once under local yellows; anything else once the field is slowed
      if (d.pickStart < 0 && (calm || (d.size === 1 && !d.onLine)) && sim.tick - d.born > 20) {
        d.pickStart = sim.tick + sim.rng.range(40, 90);
        d.pickEnd = d.pickStart + (d.size === 3 ? 90 : d.size === 2 ? 60 : 40);
      }
      if (d.pickStart >= 0 && sim.tick >= d.pickEnd) {
        d.gone = true;
        sim.emit("recovery", undefined, undefined, `Marshals have cleared the debris${this.cornerAt(d.at)}.`);
        continue;
      }
      // cars that drive over it
      for (const c of sim.cars) {
        if (c.status !== "racing" && c.status !== "pit_out") continue;
        if (c.incident) continue;
        const ahead = mod(d.at - c.s, L);
        if (ahead > c.v * DT + 0.5 || ahead < 0) continue;
        if (Math.abs(c.lateral - d.lat) > 2.2) continue;
        // marshals on the circuit with the field slowed make a strike unlikely
        const p = (d.size === 3 ? 0.6 : d.size === 2 ? 0.25 : 0.06) * (sim.neutral.active ? 0.25 : 1);
        if (!sim.rng.chance(p)) continue;
        this.strike(c, d);
      }
    }
    if (this.debris.length > 60) this.debris = this.debris.filter((d) => !d.gone || sim.tick - d.pickEnd < 600);
  }

  private strike(c: CarState, d: Debris) {
    const sim = this.sim;
    const code = c.entry.driver.code;
    if (sim.rng.chance(0.55)) {
      c.damage.puncture = true;
      sim.emit("damage", c.id, undefined, `${code} runs over debris and has a puncture!`);
    } else {
      c.damage.floor = clamp(c.damage.floor + sim.rng.range(0.1, 0.35), 0, 1);
      sim.emit("damage", c.id, undefined, `${code} runs over debris and has floor damage.`);
    }
    if (d.size >= 2 && sim.rng.chance(0.3)) d.gone = true; // the car carries or scatters it
  }

  private cornerAt(at: number): string {
    const cs = this.sim.track.corners;
    if (!cs.length) return "";
    let best = cs[0];
    for (const c of cs) if (Math.abs(c.s - at) < Math.abs(best.s - at)) best = c;
    return ` at Turn ${best.n}`;
  }

  // ------------------------------------------------------------------ recoveries

  private begin(car: CarState) {
    const sim = this.sim;
    const crash: CrashInfo = car.crash ?? {
      pose: "upright", impact: 0.05, fire: false, speed: 0, blame: "none", cause: car.dnfReason, mech: true, side: 1,
    };
    const pose = crash.pose;
    const impact = crash.impact;
    const fire = crash.fire;
    const medical = impact >= 0.75 || fire;
    const method = methodFor(pose, impact, fire);
    const rng = sim.rng;
    const barrier = (pose === "nose_in" || pose === "rear_in") && impact > 0.7;
    const plan: Record<Stage, number> = {
      dispatch: sec(rng.range(6, 11)),
      fire: fire ? sec(rng.range(12, 22)) : 0,
      check: sec(rng.range(5, 9)),
      right: pose === "side" ? sec(rng.range(10, 18)) : pose === "back" ? sec(rng.range(16, 28)) : 0,
      driver_out: medical ? sec(rng.range(35, 60)) : sec(rng.range(9, 16)),
      remove: sec(method === "crane" ? rng.range(40, 65) : method === "tractor" ? rng.range(24, 40) : method === "push" ? rng.range(12, 20) : 0),
      sweep: sec(rng.range(7, 12) + (barrier ? rng.range(25, 45) : 0)),
      done: 0,
    };
    const total = Object.values(plan).reduce((a, b) => a + b, 0) * DT;
    // race control's estimate, in whole minutes: it is a guess and can be off in either direction
    const estimate = Math.max(1, Math.round((total * rng.range(0.7, 1.35)) / 60));
    const rec: Recovery = {
      id: this.nextId++,
      carId: car.id,
      at: mod(car.s, sim.track.length),
      side: crash.side,
      pose,
      impact,
      fire,
      medical,
      method,
      stage: "dispatch",
      stageStart: sim.tick,
      stageEnd: sim.tick + plan.dispatch,
      start: sim.tick,
      plan,
      wave: !medical && impact < 0.6,
      barrier,
      estimate,
    };
    this.recoveries.push(rec);
    this.byCar.set(car.id, rec);
    sim.radio?.crashCall(car);
    const code = car.entry.driver.code;
    const turn = sim.cornerText(car);
    sim.emit("recovery", car.id, undefined, `Marshals are running to ${code}'s car${turn}.${medical ? " The medical car has left the pit lane." : ""} Race control expects about ${estimate} minute${estimate === 1 ? "" : "s"}.`);
    if (fire) sim.emit("recovery", car.id, undefined, `${code}'s car is on fire! The fire marshals are on it.`);
  }

  private enter(r: Recovery, stage: Stage) {
    const sim = this.sim;
    const car = sim.car(r.carId);
    const code = car.entry.driver.code;
    r.stage = stage;
    r.stageStart = sim.tick;
    r.stageEnd = sim.tick + r.plan[stage];
    switch (stage) {
      case "right":
        sim.emit("recovery", r.carId, undefined, `Marshals are turning ${code}'s car back onto its wheels.`);
        break;
      case "driver_out":
        sim.radio?.crashAfter(car);
        sim.emit("recovery", r.carId, undefined, r.medical ? `${code} is being treated by the medical team at the car.` : `${code} climbs out of the car${r.wave ? " and waves to the crowd" : ""}.`);
        break;
      case "remove": {
        const how: Record<Method, string> = {
          drive: `${code} drives it away.`,
          push: `Marshals push ${code}'s car out through the gate.`,
          tractor: `A recovery tractor is dragging ${code}'s car clear.`,
          crane: `A crane is lifting ${code}'s car off the circuit.`,
          leave: `${code}'s car is left behind the barrier.`,
        };
        sim.emit("recovery", r.carId, undefined, how[r.method]);
        // heavy equipment next to the circuit means a full safety car, never a virtual one
        if ((r.method === "crane" || r.method === "tractor") && sim.neutral.active && sim.neutral.kind === "vsc") sim.deployNeutral("sc", "recovery vehicle at the circuit side");
        break;
      }
      case "sweep":
        sim.emit("recovery", r.carId, undefined, r.barrier ? "The barrier is damaged. A repair crew is out on the circuit." : "Marshals are clearing the debris.");
        break;
      case "done":
        car.removed = true;
        sim.emit("recovery", r.carId, undefined, `${code}'s car has been recovered. Track clear${this.cornerAt(r.at)}.`);
        break;
      default:
        break;
    }
  }

  step() {
    const sim = this.sim;
    // a car that has come to rest and is not in the pit lane gets a crew
    for (const c of sim.cars) {
      if (c.status !== "dnf" || c.removed || this.byCar.has(c.id)) continue;
      if (c.v >= 2 || Math.abs(c.lateral) > 14) continue;
      if (sim.tick - c.retireTick < 15) continue;
      this.begin(c);
    }
    for (const r of this.recoveries) {
      if (r.stage === "done" || sim.tick < r.stageEnd) continue;
      let i = STAGES.indexOf(r.stage) + 1;
      while (i < STAGES.length - 1 && r.plan[STAGES[i]] === 0) i++;
      this.enter(r, STAGES[i]);
    }
    this.debrisStep();
  }

  /** Is there a crew or a piece of debris in this sector? (for the yellow flag). */
  hazardInSector(sector: number): boolean {
    const L = this.sim.track.length;
    const sw = L / 3;
    for (const r of this.recoveries) if (r.stage !== "done" && Math.floor(mod(r.at, L) / sw) === sector) return true;
    for (const d of this.debris) if (!d.gone && Math.floor(mod(d.at, L) / sw) === sector) return true;
    return false;
  }
}
