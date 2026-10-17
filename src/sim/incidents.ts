import type { RaceSim } from "./engine";
import { DT, GRID_GAP, LIGHTS_TICKS } from "./engine";
import type { CarState, Incident, IncidentKind } from "./types";
import { wetLoss } from "./weather";

/**
 * Things that go wrong on track: lock-ups, runs off, spins, gravel, walls, punctures, contact and
 * first lap pile-ups. Each one has a cause (the conditions, the driver, the tyres), an effect on
 * the car, and a consequence for the race (local yellows, safety cars, red flags).
 *
 * The rates are tuned by feel against what a modern season looks like (a safety car in roughly
 * half the races, a red flag in about one race in ten, one or two retirements from crashes), not
 * against published statistics.
 */

const BASE_RATE = 2.1e-4; // incidents per car per second, before modifiers
const RECOVER_TICKS = 1500; // marshals clear a stopped car after this long
const LATERAL: Record<IncidentKind, number> = { lockup: 0, off: 9, spin: 6.5, gravel: 11, wall: 9, stall: 8, puncture: 0, collision: 4 };

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const mod = (a: number, n: number) => ((a % n) + n) % n;

export interface RedFlag {
  active: boolean;
  cause: string;
  since: number;
  minUntil: number;
  /** Set once the cars are lined up and waiting for the lights. */
  gridded: boolean;
  count: number;
}

export class IncidentSystem {
  /** Tick until which each sector shows a local yellow. */
  yellowUntil: [number, number, number] = [0, 0, 0];
  private yellowShown: [boolean, boolean, boolean] = [false, false, false];
  red: RedFlag = { active: false, cause: "", since: 0, minUntil: 0, gridded: false, count: 0 };
  private stormTicks = 0;
  private wetStartChecked = false;

  constructor(private sim: RaceSim) {}

  get enabled(): boolean {
    return !this.sim.cfg.noIncidents && !this.sim.cfg.noCrashes;
  }

  yellowAt(sector: number): boolean {
    return this.yellowUntil[sector] > this.sim.tick;
  }

  sectorOf(car: CarState): number {
    const L = this.sim.track.length;
    return Math.min(2, Math.floor(mod(car.s, L) / (L / 3)));
  }

  // ------------------------------------------------------------------ hazards

  /** Called for every racing car on every tick. */
  roll(car: CarState, cw: number, wetHere: number) {
    const sim = this.sim;
    if (!this.enabled || car.incident || car.status !== "racing" || sim.tick < sim.lightsAt + 12) return;
    const d = car.entry.driver;
    // mechanical failure, anywhere on the lap
    const wear = car.entry.wear;
    const worn = wear ? 1 + 6 * Math.pow(1 - wear.pu, 3) : 1;
    const pFail = ((1 - car.entry.team.reliability) * 0.018 * DT * worn) / sim.track.nominalLap;
    if (wear && sim.rng.chance((0.0007 * DT * (1 + 6 * Math.pow(1 - wear.gb, 3))) / sim.track.nominalLap)) {
      sim.retire(car, "Gearbox failure");
      sim.emit("failure", car.id, undefined, `${d.code} stops on track with a gearbox failure${sim.cornerText(car)}.`);
      if (sim.rng.chance(0.3)) sim.deployNeutral("sc", `${d.code} stopped on track`);
      else if (sim.rng.chance(0.7)) sim.deployNeutral("vsc", `${d.code} stopped on track`);
      return;
    }
    if (sim.rng.chance(pFail)) {
      sim.retire(car, "Power unit failure");
      sim.emit("failure", car.id, undefined, `${d.code} stops on track with a power unit failure${sim.cornerText(car)}.`);
      if (sim.rng.chance(0.3)) sim.deployNeutral("sc", `${d.code} stopped on track`);
      else if (sim.rng.chance(0.7)) sim.deployNeutral("vsc", `${d.code} stopped on track`);
      return;
    }
    const risk = sim.track.def.risk ?? 1;
    const pushM = car.push === 2 ? 1.8 : car.push === 0 ? 0.6 : 1;
    const skill = 0.45 + 1.7 * (1 - d.consistency);
    const wearM = 1 + 3 * Math.max(0, car.tyre.wear - 0.8);
    let wetM = 1;
    if (sim.weather) {
      const mism = Math.max(0, wetLoss(car.tyre.compound, wetHere) - 0.12);
      wetM = 1 + 25 * mism;
      if (wetHere > 0.75) wetM *= 1 + (wetHere - 0.75) * 6;
      if (wetHere > 0.15) wetM *= clamp(1.7 - (d.wet ?? 0.5) * 1.2, 0.8, 1.6);
    }
    const lapM = car.lap === 0 ? 1.5 : 1;
    const dmgM = 1 + car.damage.aero * 1.5 + car.damage.flat;
    const errM = sim.tick < car.errorUntil ? 2.5 : 1;
    const neutralM = sim.neutral.active ? 0.05 : 1;
    const mor = car.entry.human && sim.radio ? sim.radio.mood(car.id).morale : 0.6;
    const moodM = 1 + 0.8 * Math.max(0, 0.45 - mor);
    const lam = BASE_RATE * risk * (0.12 + 0.88 * cw) * pushM * skill * wearM * wetM * lapM * dmgM * errM * neutralM * moodM;
    if (!sim.rng.chance(lam * DT)) return;
    this.begin(car, wetM);
  }

  private begin(car: CarState, wetM: number) {
    const sim = this.sim;
    const bad = Math.min(0.35, (wetM - 1) * 0.04) + (car.v > 70 ? 0.05 : 0);
    const r = sim.rng.next();
    const side: 1 | -1 = sim.rng.chance(0.5) ? 1 : -1;
    const code = car.entry.driver.code;
    const turn = sim.cornerText(car);
    const at = mod(car.s, sim.track.length);
    const mk = (kind: IncidentKind, ticks: number, terminal = false): Incident => ({ kind, start: sim.tick, until: sim.tick + ticks, at, side, terminal });
    const rr = (a: number, b: number) => Math.floor(sim.rng.range(a, b));

    if (r < 0.4 - bad) {
      car.incident = mk("lockup", rr(12, 20));
      car.damage.flat = clamp(car.damage.flat + sim.rng.range(0.04, 0.28), 0, 1);
      sim.emit("lockup", car.id, undefined, `${code} locks up${turn}.`);
      return;
    }
    if (r < 0.66 - bad * 0.7) {
      car.incident = mk("off", rr(30, 60));
      sim.emit("off_track", car.id, undefined, `${code} runs wide${turn}.`);
      car.warnings++;
      if (!sim.cfg.noPenalties) {
        if (car.warnings % 3 === 0) {
          sim.givePenalty(car, 5, "Track limits", `${code} has exceeded track limits for the third time: 5 seconds`);
        } else {
          sim.emit("warning", car.id, undefined, `Track limits: ${code} off${turn} (warning ${car.warnings % 3} of 3).`);
        }
      }
      return;
    }
    if (r < 0.82 - bad * 0.4) {
      const stalled = sim.rng.chance(0.12 + bad * 0.3);
      car.incident = mk("spin", rr(55, 100), stalled);
      sim.emit("spin", car.id, undefined, `${code} spins${turn}!`);
      if (stalled) {
        sim.emit("spin", car.id, undefined, `${code} has stalled and cannot restart.`);
        sim.retire(car, "Spun and stalled");
        this.consequence(car, "spin_stall", turn);
      } else this.consequence(car, "spin", turn);
      return;
    }
    if (r < 0.92 - bad * 0.2) {
      const beached = sim.rng.chance(0.35 + bad * 0.5);
      car.incident = mk("gravel", rr(60, 110), beached);
      sim.emit("gravel", car.id, undefined, `${code} goes into the gravel${turn}.`);
      if (beached) {
        sim.emit("gravel", car.id, undefined, `${code} is beached and cannot get out.`);
        sim.retire(car, "Beached in the gravel");
        this.consequence(car, "gravel_stuck", turn);
      } else this.consequence(car, "gravel", turn);
      return;
    }
    // the wall
    const terminal = sim.rng.chance(0.45 + bad * 0.5);
    car.incident = mk("wall", rr(40, 70), terminal);
    car.damage.aero = clamp(car.damage.aero + sim.rng.range(0.2, 0.75), 0, 1);
    car.damage.floor = clamp(car.damage.floor + sim.rng.range(0.05, 0.4), 0, 1);
    if (sim.rng.chance(0.3)) car.damage.puncture = true;
    sim.emit("wall", car.id, undefined, `${code} hits the wall${turn}!`);
    if (terminal) {
      sim.retire(car, "Accident damage");
      sim.emit("crash", car.id, undefined, `${code} is out of the race${turn}.`);
      this.consequence(car, "wall_out", turn);
    } else {
      sim.emit("damage", car.id, undefined, `${code} has damage to the front wing but carries on.`);
      this.consequence(car, "wall", turn);
    }
  }

  private consequence(car: CarState, what: string, turn: string) {
    const sim = this.sim;
    const wet = sim.wx ? sim.wx.wetMean > 0.45 : false;
    const w = wet ? 0.18 : 0;
    const cause = `${car.entry.driver.code} stopped on track${turn}`;
    const roll = sim.rng.next();
    switch (what) {
      case "wall_out":
        if (roll < 0.07 + w * 0.6) this.startRed(`barrier repairs needed${turn}`, 420);
        else if (roll < 0.7 + w) sim.deployNeutral("sc", cause);
        else sim.deployNeutral("vsc", cause);
        break;
      case "gravel_stuck":
      case "spin_stall":
        if (roll < 0.45 + w) sim.deployNeutral("sc", cause);
        else sim.deployNeutral("vsc", cause);
        break;
      case "wall":
        if (roll < 0.2 + w) sim.deployNeutral("vsc", `debris${turn}`);
        break;
      case "gravel":
        if (roll < 0.12 + w) sim.deployNeutral("vsc", `${car.entry.driver.code} in the gravel${turn}`);
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------------ car effects

  /** Adjusts the car's target speed while an incident plays out. */
  apply(car: CarState, target: number): number {
    const inc = car.incident;
    if (!inc) {
      if (car.spin !== 0) car.spin = Math.abs(car.spin) < 0.1 ? 0 : car.spin * 0.8;
      return target;
    }
    const sim = this.sim;
    const t = sim.tick;
    const p = clamp((t - inc.start) / Math.max(1, inc.until - inc.start), 0, 1);
    if (!inc.terminal && t >= inc.until) {
      car.incident = null;
      return target;
    }
    switch (inc.kind) {
      case "lockup":
        return target * 0.86;
      case "off":
        return Math.min(target, Math.max(18, target * 0.55));
      case "spin": {
        const spinT = (t - inc.start) / 16;
        car.spin = spinT < 1 ? spinT * Math.PI * 3 : Math.PI;
        if (p > 0.85) car.spin = Math.PI * (1 - (p - 0.85) / 0.15);
        return p > 0.9 ? Math.min(target, 12) : 0;
      }
      case "gravel":
        return p < 0.8 ? 0 : Math.min(target, 10);
      case "wall":
        return p < 0.7 ? 0 : Math.min(target, 18);
      case "stall":
        return 0;
      default:
        return target;
    }
  }

  /** Lateral target (metres from the line) for a car with an incident, or null. */
  lateral(car: CarState): number | null {
    const inc = car.incident;
    if (!inc) return null;
    const t = this.sim.tick;
    const p = clamp((t - inc.start) / Math.max(1, inc.until - inc.start), 0, 1);
    if (inc.kind === "lockup") return null;
    if (!inc.terminal && p > 0.8) return 0;
    return LATERAL[inc.kind] * inc.side;
  }

  /** Pace penalty from damage and punctures. */
  damageFactor(car: CarState, cw: number): number {
    const d = car.damage;
    let f = 1 - 0.1 * d.aero * (0.4 + 0.6 * cw) - 0.05 * d.floor - 0.025 * d.flat;
    if (d.puncture) f *= 0.62;
    return f;
  }

  // ------------------------------------------------------------------ contact

  /** First lap and restart scrums: cars on top of each other in the first braking zones. */
  firstLap(car: CarState, ahead: CarState, gapM: number, curvAbs: number) {
    const sim = this.sim;
    if (!this.enabled || sim.cfg.noPenalties) return;
    if (sim.tick - sim.lightsAt > 650 || gapM > 5 || curvAbs < 0.0025 || car.incident || ahead.incident) return;
    if (sim.neutral.active) return;
    const wetM = sim.wx ? 1 + 1.4 * sim.wx.wetMean : 1;
    const p = (0.0003 / (sim.track.def.risk ?? 1)) * wetM * (0.6 + 0.8 * car.entry.driver.aggression);
    if (!sim.rng.chance(p)) return;
    this.collide(car, ahead, true);
  }

  /** Contact between two cars. `scrum` is a first lap tangle, which can take out more than two. */
  collide(attacker: CarState, victim: CarState, scrum = false) {
    const sim = this.sim;
    const a = attacker.entry.driver.code;
    const v = victim.entry.driver.code;
    const turn = sim.cornerText(victim);
    attacker.errorUntil = Math.max(attacker.errorUntil, sim.tick + 20);
    victim.errorUntil = Math.max(victim.errorUntil, sim.tick + 20);
    sim.emit("contact", attacker.id, victim.id, scrum ? `Contact at the first corners! ${a} and ${v}${turn}.` : `Contact between ${a} and ${v}${turn}!`);
    if (!sim.cfg.noPenalties) {
      if (sim.rng.chance(scrum ? 0.4 : 0.6)) sim.givePenalty(attacker, 5, "Causing a collision", `${a} is given 5 seconds for causing a collision with ${v}`);
      else sim.emit("contact", attacker.id, victim.id, `Stewards: ${a} and ${v}, a racing incident. No further action.`);
    }
    let anyOut = false;
    for (const [car, other] of [[attacker, victim], [victim, attacker]] as const) {
      if (car.incident || car.status !== "racing") continue;
      car.damage.aero = clamp(car.damage.aero + sim.rng.range(0, 0.55), 0, 1);
      if (sim.rng.chance(0.18)) {
        car.damage.puncture = true;
        sim.emit("damage", car.id, other.id, `${car.entry.driver.code}: I have a puncture! Box, box!`);
      } else if (car.damage.aero > 0.2) {
        sim.emit("damage", car.id, other.id, `${car.entry.driver.code} has damage after the contact.`);
      }
      const roll = sim.rng.next();
      const side: 1 | -1 = sim.rng.chance(0.5) ? 1 : -1;
      const at = mod(car.s, sim.track.length);
      if (roll < 0.1 + (scrum ? 0.08 : 0)) {
        car.incident = { kind: "wall", start: sim.tick, until: sim.tick + 60, at, side, terminal: true };
        sim.retire(car, "Collision damage");
        sim.emit("crash", car.id, other.id, `${car.entry.driver.code} is out after the contact${turn}.`);
        anyOut = true;
      } else if (roll < 0.38) {
        car.incident = { kind: "spin", start: sim.tick, until: sim.tick + 55 + Math.floor(sim.rng.range(0, 35)), at, side, terminal: false };
        sim.emit("spin", car.id, undefined, `${car.entry.driver.code} is spun around${turn}.`);
      } else if (roll < 0.55) {
        car.incident = { kind: "off", start: sim.tick, until: sim.tick + 40, at, side, terminal: false };
      }
    }
    if (anyOut) {
      if (sim.rng.chance(scrum ? 0.1 : 0.04)) this.startRed(`multiple cars stopped${turn}`, 420);
      else sim.deployNeutral(sim.rng.chance(0.7) ? "sc" : "vsc", `contact${turn}`);
    } else if (attacker.damage.aero > 0.35 || victim.damage.aero > 0.35 || scrum) {
      if (sim.rng.chance(0.25)) sim.deployNeutral("vsc", `debris${turn}`);
    }
    if (scrum) {
      // the cars behind may not have anywhere to go
      const L = sim.track.length;
      for (const c of sim.cars) {
        if (c === attacker || c === victim || c.status !== "racing" || c.incident) continue;
        const d = mod(attacker.s - c.s, L);
        if (d > 0 && d < 40 && sim.rng.chance(0.28)) {
          c.damage.aero = clamp(c.damage.aero + sim.rng.range(0, 0.4), 0, 1);
          if (sim.rng.chance(0.25)) c.damage.puncture = true;
          c.errorUntil = Math.max(c.errorUntil, sim.tick + 30);
          sim.emit("damage", c.id, undefined, `${c.entry.driver.code} is caught up in it and picks up damage.`);
        }
      }
    }
  }

  // ------------------------------------------------------------------ per-tick management

  step() {
    const sim = this.sim;
    this.updateYellows();
    this.recoverCars();
    if (this.red.active) {
      sim.maxTicks++;
      this.stepRed();
      return;
    }
    // sustained violent weather stops the race
    if (sim.wx && this.enabled && sim.phase === "racing" && !sim.neutral.active) {
      if (sim.wx.rain > 0.93 && sim.wx.wetMean > 0.85) this.stormTicks++;
      else this.stormTicks = Math.max(0, this.stormTicks - 2);
      if (this.stormTicks > 600 && sim.rng.chance(0.01) && this.red.count < 2) {
        this.stormTicks = 0;
        this.startRed("extreme weather", 600, true);
      }
    }
  }

  private updateYellows() {
    const sim = this.sim;
    const L = sim.track.length;
    const now: [boolean, boolean, boolean] = [false, false, false];
    for (const c of sim.cars) {
      if (c.removed) continue;
      const sec = Math.min(2, Math.floor(mod(c.s, L) / (L / 3)));
      if (c.status === "dnf" && c.v < 8 && sim.tick - c.retireTick < RECOVER_TICKS && !this.red.active) now[sec] = true;
      else if (c.incident && c.status === "racing" && c.v < 30 && c.incident.kind !== "lockup" && c.incident.kind !== "off") now[sec] = true;
      else if (c.incident && c.incident.kind === "off" && c.status === "racing") now[sec] = true;
    }
    for (let k = 0; k < 3; k++) {
      if (now[k]) this.yellowUntil[k] = sim.tick + 40;
      const active = this.yellowUntil[k] > sim.tick;
      if (active && !this.yellowShown[k]) {
        this.yellowShown[k] = true;
        sim.emit("yellow", undefined, undefined, `YELLOW FLAG in sector ${k + 1}.`);
      } else if (!active && this.yellowShown[k]) {
        this.yellowShown[k] = false;
        sim.emit("yellow_clear", undefined, undefined, `Sector ${k + 1} clear. Green flag.`);
      }
    }
  }

  private recoverCars() {
    const sim = this.sim;
    if (sim.tick % 10 !== 0 || this.red.active) return;
    for (const c of sim.cars) {
      if (c.status === "dnf" && !c.removed && c.v < 1 && sim.tick - c.retireTick > RECOVER_TICKS) c.removed = true;
    }
  }

  // ------------------------------------------------------------------ start in the wet

  /** At lights out: very wet conditions mean a safety car start. */
  onGreen() {
    const sim = this.sim;
    if (this.wetStartChecked && !this.red.gridded) return;
    this.wetStartChecked = true;
    const wx = sim.wx;
    if (wx && wx.wetMean > 0.72 && wx.rain > 0.45) {
      sim.deployNeutral("sc", "extreme conditions, the race starts behind the safety car");
    }
    this.red.gridded = false;
  }

  // ------------------------------------------------------------------ red flag

  startRed(cause: string, minSeconds: number, weather = false) {
    const sim = this.sim;
    if (this.red.active || sim.phase !== "racing") return;
    this.red = { active: true, cause, since: sim.tick, minUntil: sim.tick + minSeconds * 10, gridded: false, count: this.red.count + 1 };
    sim.neutral.active = false;
    sim.emit("red_flag", undefined, undefined, `RED FLAG (${cause}). All cars return to the pit lane.`);
    for (const c of sim.cars) {
      if (c.status === "racing") {
        c.redStop = true;
        if (!c.entry.human || !c.pitRequest) c.pitRequest = c.entry.human ? c.tyre.compound : sim.chooseCompound(c);
        if (c.incident && !c.incident.terminal) c.incident = null;
      }
    }
    void weather;
  }

  private stepRed() {
    const sim = this.sim;
    const R = this.red;
    // keep deciding for the AI as the weather changes
    if (sim.tick % 50 === 0) for (const c of sim.cars) if (!c.entry.human && c.redStop && c.status !== "dnf") c.pitRequest = sim.chooseCompound(c);
    const waiting = sim.cars.every((c) => c.status === "dnf" || c.status === "finished" || c.status === "pit_stop" || (c.status === "pit_in" && (c.stackWait ?? 0) > 0 && c.v < 0.5));
    const weatherOk = !sim.wx || (sim.wx.rain < 0.7 && sim.wx.wetMean < 0.92);
    const longEnough = sim.tick >= R.minUntil && weatherOk;
    const tooLong = sim.tick - R.since > 27000;
    if (waiting && (longEnough || tooLong)) this.restart();
  }

  private restart() {
    const sim = this.sim;
    const L = sim.track.length;
    const alive = sim.order.filter((c) => c.status !== "dnf" && c.status !== "finished");
    const loopLen = L / 60;
    sim.lightsAt = sim.tick + LIGHTS_TICKS;
    alive.forEach((c, slot) => {
      c.s = c.lap * L - 6 - slot * GRID_GAP;
      c.v = 0;
      c.status = "grid";
      c.lateral = slot % 2 === 0 ? 3 : -3;
      if (c.pitRequest) {
        c.tyre = { compound: c.pitRequest, wear: 0, ageLaps: 0 };
        if (!c.compoundsUsed.includes(c.pitRequest)) c.compoundsUsed.push(c.pitRequest);
        c.pitRequest = null;
      }
      c.damage.aero = 0;
      c.damage.flat = 0;
      c.damage.puncture = false;
      c.incident = null;
      c.spin = 0;
      c.redStop = false;
      c.stackWait = 0;
      c.stackAsked = false;
      c.overtaking = null;
      c.yielding = false;
      c.errorUntil = 0;
      c.jumpStart = false;
      c.reaction = 1 + Math.floor(sim.rng.range(0, 4));
      c.lapStartTick = -1;
      c.sectorIdx = 0;
      c.stintLaps = 0;
      c.loopCount = Math.max(0, Math.floor(c.s / loopLen));
      if (c.loopCount < c.loops.length) c.loops[c.loopCount] = sim.lightsAt + slot * 2;
    });
    sim.phase = "grid";
    this.red.active = false;
    this.red.gridded = true;
    for (let k = 0; k < 3; k++) this.yellowUntil[k] = 0;
    sim.emit("red_restart", undefined, undefined, "The cars are lining up on the grid for a standing restart.");
  }
}
