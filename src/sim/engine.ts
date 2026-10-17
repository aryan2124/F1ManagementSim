import { Rng } from "./rng";
import { accelAt, brakeAt, sampleTrack, type TrackModel } from "./track";
import { IncidentSystem } from "./incidents";
import { Strategist } from "./strategy";
import { RadioSystem } from "./radio";
import { Weather, makeWeather, targetWetness, wetBrakeFactor, wetSpeedFactor, wetWearFactor, type WeatherNow } from "./weather";
import type {
  CarState,
  Command,
  Compound,
  EnergyMode,
  EntrySpec,
  LapRec,
  LoggedCommand,
  PushLevel,
  RaceConfig,
  ResultRow,
  ResultStatus,
  SimEvent,
  SimEventKind,
  StopRec,
} from "./types";

const KEY_KINDS = new Set<SimEventKind>(["overtake", "crash", "spin", "contact", "penalty", "failure", "sc_deployed", "vsc", "red_flag", "damage", "gravel", "wall", "lockup", "fastest_lap", "weather", "lightning"]);
import { isWetCompound } from "./types";

/** Fixed simulation step in seconds. Everything is deterministic at this step. */
export const DT = 0.1;
export const TPS = 10;
export const LIGHTS_TICKS = 50;
export const LOOPS = 60;
export const CAR_LEN = 5.5;
export const GRID_GAP = 9;
export const PIT_LIMIT = 22;
export const BOX_SPACING = 12;
/** Metres behind the box where a second car of the team waits. */
const STACK_GAP = 9;
export const SC_SPEED = 48;
/** Share of its own braking capacity a following car plans to use when it keeps its distance. */
const FOLLOW_BRAKE_SHARE = 0.8;
/** Virtual safety car: everyone runs at this fraction of their normal speed. */
const VSC_FACTOR = 0.62;
export const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
/** A race is stopped at the end of the lap on which this much time has passed (the 2 hour rule). */
const MAX_RACE_SECONDS = 7200;
/** A driver must complete this share of the winner's laps to be classified. */
const CLASSIFIED_SHARE = 0.9;

export const COMPOUNDS: Record<Compound, { name: string; grip: number; life: number; color: number }> = {
  S: { name: "Soft", grip: 1.0, life: 8, color: 0xe5383b },
  M: { name: "Medium", grip: 0.9925, life: 13, color: 0xf4d03f },
  H: { name: "Hard", grip: 0.985, life: 20, color: 0xf2f2f2 },
  I: { name: "Intermediate", grip: 0.93, life: 16, color: 0x43b02a },
  W: { name: "Full wet", grip: 0.88, life: 24, color: 0x2e86de },
};

/** Race fuel capacity in kg and the reserve a car keeps when there is no refuelling. */
export const FUEL_KG = 110;
export const FUEL_RESERVE = 0.012;

/** Share of the race distance each compound lasts at standard pace on an average circuit. */
export const LIFE_SHARE: Record<Compound, number> = { S: 0.4, M: 0.62, H: 0.9, I: 0.7, W: 0.9 };

export function tyreLifeFor(laps: number, severity = 1): Record<Compound, number> {
  const f = (c: Compound, floor: number) => Math.max(floor, (LIFE_SHARE[c] * laps) / severity);
  return { S: f("S", 3), M: f("M", 4.5), H: f("H", 6), I: f("I", 6), W: f("W", 8) };
}

const PUSH_GRIP = [0.99, 1.0, 1.007];
const PUSH_WEAR = [0.7, 1.0, 1.45];
const PUSH_FUEL = [0.94, 1.0, 1.06];

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const mod = (a: number, n: number) => ((a % n) + n) % n;

/**
 * How close to the track's ideal speed profile a car can run, given tyres, fuel, driver and car.
 * Shared by the race and qualifying simulations.
 */
export function speedFactor(
  e: EntrySpec,
  tyre: { compound: Compound; wear: number },
  fuel: number,
  push: PushLevel,
  curvAbs: number,
  dirty: number,
): number {
  const cw = Math.min(1, curvAbs / 0.006);
  const comp = COMPOUNDS[tyre.compound];
  const w = tyre.wear;
  const wearF = 1 - 0.04 * Math.pow(Math.min(w, 1.4), 1.4) - (w > 0.8 ? (w - 0.8) * 0.14 : 0) - (w > 1 ? (w - 1) * 0.2 : 0);
  const fuelF = 1 - 0.011 * fuel;
  const grip = comp.grip * wearF * fuelF * PUSH_GRIP[push] * dirty * e.driver.pace;
  const carF = 1 - (1 - e.team.aero) * cw * 0.75 - (1 - e.team.power) * (1 - cw) * 0.6;
  const gripWeight = 0.4 + 0.6 * cw;
  return (1 - (1 - grip) * gripWeight) * carF;
}

/** ERS deployment multiplier for the current mode on this part of the track. */
export function ersFactor(mode: EnergyMode, soc: number, straight: boolean): number {
  if (straight) {
    if (mode === "attack") return soc > 0.02 ? 1.022 : 0.995;
    if (mode === "balanced") return soc > 0.02 ? 1.01 : 0.995;
    return 1.0;
  }
  return mode === "harvest" ? 0.998 : 1;
}

export type NeutralKind = "sc" | "vsc";

export class RaceSim {
  readonly cfg: RaceConfig;
  readonly track: TrackModel;
  readonly rng: Rng;
  readonly cars: CarState[] = [];
  /** Tyre life in laps for this race. */
  readonly life: Record<Compound, number>;
  /** Classification order, updated every tick. */
  order: CarState[] = [];
  tick = 0;
  phase: "grid" | "racing" | "finished" = "grid";
  /** Safety car or virtual safety car. Ends when the leader completes `endLap` laps. */
  neutral = { active: false, kind: "sc" as NeutralKind, endLap: 0, announcedEnd: false, id: 0, endedTick: -9999, endedKind: "sc" as NeutralKind, lockLap: 0 };
  /** The safety car itself: leads the leader, and dives into the pit lane on the in lap. */
  sc = { vis: false, s: 0, lat: 0 };
  chequered = false;
  bestLapAll = Infinity;
  bestLapCar = "";
  bestSector: [number, number, number] = [Infinity, Infinity, Infinity];
  readonly commandLog: LoggedCommand[] = [];
  private events: SimEvent[] = [];
  byId = new Map<string, CarState>();
  private ahead = new Map<string, CarState | null>();
  /** Positions at the start of the current tick, so followers measure gaps consistently. */
  private snap = new Map<string, number>();
  maxTicks: number;
  private ruleWarned = new Map<string, number>();
  private scPitChecked = new Map<string, number>();
  private ledLaps = new Map<string, number>();
  /** Lap by lap record of every car, for the debrief. */
  readonly lapLog = new Map<string, LapRec[]>();
  readonly stopLog: StopRec[] = [];
  /** Every time a second car had to wait behind his team-mate. */
  readonly stackLog: { carId: string; lap: number; wait: number }[] = [];
  /** Events worth telling afterwards: passes, incidents, penalties, neutralisations. */
  readonly keyEvents: Array<SimEvent & { lap: number }> = [];
  private scheduledDone = false;
  private checkpointDone = new Set<number>();
  /** Fresh sets left (copy of the config, so replays stay clean). */
  private setsLeft: Record<string, Partial<Record<Compound, number>>> = {};
  private heatDone = false;
  /** Stage racing: points banked at the end of each stage, by car id. */
  stagePoints = new Map<string, number>();
  /** A repeatable 0..1 luck number for a car's current stint (tyre lottery rule). */
  private stintLuck(car: CarState): number {
    let h = (this.cfg.seed * 31 + car.stops * 977 + car.id.length * 131 + car.id.charCodeAt(car.id.length - 1) * 17) >>> 0;
    h = (Math.imul(h ^ (h >>> 15), 2246822519) >>> 0) % 100000;
    return h / 100000;
  }
  /** The truth about the weather, or null when weather is switched off. */
  weather: Weather | null = null;
  /** Cached weather reading, refreshed once a second. */
  wx: WeatherNow | null = null;
  /** Race Director has declared the race wet: the two compound rule no longer applies. */
  wetDeclared = false;
  /** Crashes, yellows, red flags. */
  inc!: IncidentSystem;
  /** The AI pit walls. */
  strat!: Strategist;
  /** Radio chatter, moods and team orders. */
  radio: RadioSystem | null = null;
  /** Tick at which the lights go out (moves on a red flag restart). */
  lightsAt = LIGHTS_TICKS;
  private rainFlag: [boolean, boolean, boolean] = [false, false, false];

  constructor(cfg: RaceConfig) {
    this.cfg = cfg;
    this.inc = new IncidentSystem(this);
    this.track = cfg.track;
    this.rng = new Rng(cfg.seed);
    this.life = cfg.tyreLife ?? tyreLifeFor(cfg.laps, cfg.tyreSeverity ?? 1);
    if (cfg.weather && cfg.weather.mode !== "off") {
      this.weather = makeWeather(cfg.weather, MAX_RACE_SECONDS + 600);
      const w0 = this.weather;
      for (let k = 0; k < 3; k++) w0.wet[k] = targetWetness(w0.rainSector(k, 0));
      this.wx = w0.now();
      this.rainFlag = [0, 1, 2].map((k) => w0.rainSector(k, 0) > 0.06) as [boolean, boolean, boolean];
    }
    const gridIds = cfg.grid ?? cfg.entries.map((e) => e.id);
    const entryById = new Map(cfg.entries.map((e) => [e.id, e]));
    this.setsLeft = JSON.parse(JSON.stringify(cfg.tyreSets ?? {}));
    const stealth = cfg.noPenalties || cfg.noIncidents;
    gridIds.forEach((id, slot) => {
      const entry = entryById.get(id) as EntrySpec;
      const want = cfg.startTyres?.[id] ?? "M";
      const compound = cfg.rules?.oneCompound && (want === "S" || want === "H") ? "M" : want;
      const jump = !stealth && this.rng.chance(0.001 + 0.002 * entry.driver.aggression);
      const car: CarState = {
        id,
        entry,
        status: "grid",
        s: -6 - slot * GRID_GAP,
        v: 0,
        lap: 0,
        lapStartTick: -1,
        lastLap: 0,
        bestLap: Infinity,
        sectors: { last: [0, 0, 0], best: [Infinity, Infinity, Infinity], color: [0, 0, 0] },
        sectorStartTick: 0,
        tyre: { compound, wear: 0, ageLaps: 0 },
        fuel: cfg.startFuel ?? 1,
        soc: 0.8,
        mode: "balanced",
        push: 1,
        pitRequest: null,
        pitTimer: 0,
        stops: 0,
        overtaking: null,
        overtakeUntil: 0,
        yielding: false,
        cooldownUntil: 0,
        lateral: slot % 2 === 0 ? 3 : -3,
        gapAhead: 0,
        gapLeader: 0,
        position: slot + 1,
        startPosition: slot + 1,
        finishTick: 0,
        dnfReason: "",
        reaction: jump ? 0 : 1 + Math.floor(this.rng.range(0, 4) * (1.25 - 0.5 * (entry.driver.launch ?? 0.5))),
        loops: new Float64Array(LOOPS * (cfg.laps + 3)).fill(-1),
        loopCount: 0,
        errorUntil: 0,
        sectorIdx: 0,
        aiPlan: this.rng.range(0.56, 0.76),
        boxOff: 0,
        compoundsUsed: [compound],
        penalty: 0,
        penaltyNotes: [],
        warnings: 0,
        jumpStart: jump,
        retireTick: 0,
        aiStops: this.rng.chance(0.3) ? 2 : 1,
        wetD: 0,
        damage: { aero: 0, floor: 0, flat: 0, puncture: false },
        incident: null,
        spin: 0,
        redStop: false,
        bestLapSec: [Infinity, Infinity, Infinity],
        stintLaps: 0,
        removed: false,
        boostLeft: cfg.rules?.pushToPass ?? 0,
        boostUntil: 0,
        defendLeft: cfg.rules?.defenceTokens ?? 0,
        defendUntil: 0,
        pitSwap: false,
        pitFuel: "std",
        radioLeft: entry.human ? (cfg.rules?.radioQuota ?? 999) : 999,
        restartUntil: 0,
      };
      this.cars.push(car);
      this.byId.set(id, car);
      this.takeSet(car, compound, true);
    });
    const teamIds = [...new Set(cfg.entries.map((e) => e.team.id))];
    for (const c of this.cars) c.boxOff = teamIds.indexOf(c.entry.team.id) * BOX_SPACING;
    this.strat = new Strategist(this, cfg.difficulty ?? 1);
    this.strat.init();
    if (!cfg.noRadio) this.radio = new RadioSystem(this);
    this.order = [...this.cars];
    this.maxTicks = Math.ceil((cfg.laps * this.track.nominalLap * 3.2 + 60) / DT);
    this.emit("lights", undefined, undefined, "Five red lights. Hold your nerve.");
  }

  car(id: string): CarState {
    return this.byId.get(id) as CarState;
  }

  get time(): number {
    return this.tick * DT;
  }

  /** Race clock in seconds since lights out. */
  get raceTime(): number {
    return Math.max(0, (this.tick - LIGHTS_TICKS) * DT);
  }

  get leaderLap(): number {
    const l = this.order.find((c) => c.status !== "dnf");
    return l ? Math.min(this.cfg.laps, Math.max(1, l.lap + 1)) : 1;
  }

  /** True once this car has used two different dry compounds. */
  ruleDone(car: CarState): boolean {
    if (this.wetDeclared || car.compoundsUsed.some(isWetCompound)) return true;
    return new Set(car.compoundsUsed).size >= 2;
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  emit(kind: SimEventKind, carId: string | undefined, otherId: string | undefined, text: string) {
    const ev: SimEvent = { tick: this.tick, kind, carId, otherId, text };
    this.events.push(ev);
    if (KEY_KINDS.has(kind) && this.keyEvents.length < 600) this.keyEvents.push({ ...ev, lap: this.leaderLap });
    if (this.radio) this.radio.observe(ev);
  }

  /** Add an event that has already been built (radio messages). */
  pushEvent(e: SimEvent) {
    this.events.push(e);
  }

  command(cmd: Command, log = true) {
    if (cmd.type === "reply") {
      if (log) this.commandLog.push({ tick: this.tick, cmd });
      if (this.cfg.rules?.radioQuota !== undefined) {
        const pr = this.radio?.prompts.find((x) => x.id === cmd.promptId);
        const pc = pr?.carId ? this.byId.get(pr.carId) : undefined;
        if (pc && pc.entry.human) {
          if (pc.radioLeft <= 0) {
            this.emit("rule", pc.id, undefined, `RADIO QUOTA: no messages left for ${pc.entry.driver.code}.`);
            return;
          }
          pc.radioLeft--;
        }
      }
      this.radio?.reply(cmd.promptId, cmd.option);
      return;
    }
    const car = this.byId.get(cmd.carId);
    if (!car) return;
    if (log) this.commandLog.push({ tick: this.tick, cmd });
    if ((cmd.type === "pit" || cmd.type === "order") && car.entry.human && this.cfg.rules?.radioQuota !== undefined) {
      if (car.radioLeft <= 0) {
        this.emit("rule", car.id, undefined, `RADIO QUOTA: no messages left for ${car.entry.driver.code}. He makes his own calls.`);
        return;
      }
      car.radioLeft--;
    }
    switch (cmd.type) {
      case "startTyre":
        if (this.phase === "grid" && this.tick < this.lightsAt - 5 && car.entry.human && !this.cfg.startLocks?.[car.id]) {
          const c = this.cfg.rules?.oneCompound && (cmd.compound === "S" || cmd.compound === "H") ? "M" : cmd.compound;
          car.tyre = { compound: c, wear: 0, ageLaps: 0 };
        }
        break;
      case "pit":
        if (car.status === "racing" && car.lap + 1 < this.cfg.laps) {
          car.pitRequest = cmd.compound;
          car.pitSwap = !!cmd.swap && !!this.cfg.rules?.batterySwap;
          car.pitFuel = cmd.fuel ?? "std";
          this.emit("pit_in", car.id, undefined, `${car.entry.driver.code}: Copy, box this lap for ${COMPOUNDS[cmd.compound].name}s.`);
          if (this.cfg.rules?.openRadio) this.rivalsHear(car);
        }
        break;
      case "boost":
        if (car.status === "racing" && car.boostLeft > 0 && this.tick >= car.boostUntil) {
          car.boostLeft--;
          car.boostUntil = this.tick + 120;
          this.emit("radio", car.id, undefined, `${car.entry.driver.code}: Boost on! ${car.boostLeft} left.`);
        }
        break;
      case "defend":
        if (car.status === "racing" && car.defendLeft > 0 && this.tick >= car.defendUntil) {
          car.defendLeft--;
          car.defendUntil = this.tick + 150;
          this.emit("radio", car.id, undefined, `${car.entry.driver.code}: Defending hard! ${car.defendLeft} left.`);
        }
        break;
      case "cancelPit":
        if (car.status === "racing") car.pitRequest = null;
        break;
      case "mode":
        car.mode = cmd.mode;
        break;
      case "push":
        car.push = cmd.push;
        break;
      case "order":
        this.radio?.order(cmd.carId, cmd.order);
        break;
      case "dummy":
        this.radio?.decoy(cmd.carId);
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------------ stepping

  step(): void {
    if (this.phase === "finished") return;
    this.tick++;
    if (this.weather) this.stepWeather();
    if (this.phase === "grid") {
      this.updateOrder();
      if (this.tick >= this.lightsAt) {
        this.phase = "racing";
        for (const c of this.cars) {
          const delay = this.cfg.releaseDelays?.[c.id] ?? 0;
          if (c.status !== "grid") continue;
          if (delay > 0) c.holdUntil = this.tick + Math.round(delay / DT);
          else c.status = "racing";
        }
        this.emit("green", undefined, undefined, this.cfg.releaseDelays ? "Lights out. The cars are released in intervals, the strongest teams last." : "Lights out and away we go!");
        for (const c of this.cars) {
          if (c.jumpStart) this.givePenalty(c, 5, "Jump start", "5 second time penalty for a jump start");
        }
        this.inc.onGreen();
      }
      return;
    }
    for (const c of this.cars) if (c.holdUntil !== undefined && c.status === "grid" && this.tick >= c.holdUntil) { c.status = "racing"; c.holdUntil = undefined; }
    this.inc.step();
    this.updateOrder();
    this.updateNeutral();
    this.updateAhead();
    for (const c of this.cars) this.snap.set(c.id, c.s);
    // front-to-back, so followers react to the leader's speed from this very tick (no one-tick braking lag)
    const L = this.track.length;
    const proc = [...this.cars].sort((a, b) => mod(b.s, L) - mod(a.s, L));
    for (const car of proc) this.stepCar(car);
    this.updateOrder();
    this.updateGaps();
    this.checkFinished();
    if (this.radio) this.radio.tick();
  }

  private stepWeather() {
    const w = this.weather as Weather;
    w.step(DT);
    if (this.tick % TPS !== 0) return;
    this.wx = w.now();
    for (let k = 0; k < 3; k++) {
      const r = w.rainSector(k, w.t);
      const was = this.rainFlag[k];
      if (!was && r > 0.08) {
        this.rainFlag[k] = true;
        this.emit("weather", undefined, undefined, `RACE CONTROL: Rain reported in sector ${k + 1}.`);
      } else if (was && r < 0.03) {
        this.rainFlag[k] = false;
        if (!this.rainFlag.some(Boolean)) this.emit("weather", undefined, undefined, "RACE CONTROL: The rain has stopped.");
      }
    }
    for (const _ of w.drainFlashes()) this.emit("lightning", undefined, undefined, "Lightning over the circuit.");
  }

  /** Run until `ticks` more steps have been taken or the race is over. */
  run(ticks: number) {
    for (let i = 0; i < ticks && this.phase !== "finished"; i++) this.step();
  }

  // ------------------------------------------------------------------ neutralisation

  leader(): CarState | undefined {
    return this.order.find((c) => c.status === "racing" || c.status === "pit_in" || c.status === "pit_stop" || c.status === "pit_out");
  }

  private updateNeutral() {
    const n = this.neutral;
    if (n.active) {
      const lead = this.leader();
      if (lead) {
        const vsc = n.kind === "vsc";
        if (!n.announcedEnd && lead.lap >= n.endLap - 1) {
          n.announcedEnd = true;
          this.emit(vsc ? "vsc_ending" : "sc_ending", undefined, undefined, vsc ? "VSC ending. Be ready to go green." : "Safety car in this lap.");
        }
        if (lead.lap >= n.endLap) {
          n.active = false;
          n.endedTick = this.tick;
          n.endedKind = n.kind;
          // after a safety car there is no overtaking until each car has crossed the line
          if (!vsc) n.lockLap = n.endLap;
          if (this.cfg.rules?.standingRestarts && !vsc) for (const c of this.cars) if (c.status === "racing") c.restartUntil = this.tick + 70;
          this.emit(vsc ? "vsc_in" : "sc_in", undefined, undefined, vsc ? "VSC ended. Racing resumes." : "Green flag. Racing resumes. No overtaking until the line.");
        }
      }
    }
    this.updateScCar();
  }

  private updateScCar() {
    const n = this.neutral;
    const sc = this.sc;
    const L = this.track.length;
    const T = this.track;
    if (n.active && n.kind === "sc") {
      const lead = this.leader();
      if (!lead) return;
      if (!sc.vis) {
        sc.vis = true;
        sc.lat = 0;
      }
      sc.s = lead.s + 55;
      const lp = mod(sc.s, L);
      // on the in lap it peels off early enough to be inside the pit lane (same side and lane offset as the cars) by the pit entry line
      const dive = n.announcedEnd && (lp >= L - T.pitIn - 150 || lp < T.pitOut);
      sc.lat += clamp((dive ? 24 * T.pitSide : 0) - sc.lat, -8 * DT, 8 * DT);
    } else if (sc.vis) {
      // the leader is released: the safety car carries on down the pit lane and is gone
      sc.s += 38 * DT;
      sc.lat += clamp(24 * T.pitSide - sc.lat, -8 * DT, 8 * DT);
      if (this.tick - n.endedTick > 160) sc.vis = false;
    }
  }

  deployNeutral(kind: NeutralKind, cause: string) {
    const n = this.neutral;
    const lead = this.leader();
    const lap = lead ? lead.lap : 0;
    const laps = kind === "sc" ? 2 + Math.floor(this.rng.range(0, 3)) : 1 + Math.floor(this.rng.range(0, 2));
    if (!n.active) {
      n.id++;
      n.kind = kind;
      n.endLap = Math.min(this.cfg.laps, lap + laps);
      n.announcedEnd = false;
      n.active = true;
      this.emit(
        kind === "sc" ? "sc_deployed" : "vsc",
        undefined,
        undefined,
        kind === "sc" ? `SAFETY CAR deployed (${cause}). Pit lane is open. No overtaking.` : `VIRTUAL SAFETY CAR (${cause}). Keep to the delta.`,
      );
      // AI teams react immediately: a stop under neutralisation is cheap
      for (const c of this.cars) if (!c.entry.human) this.aiNeutralPit(c);
    } else if (kind === "sc" && n.kind === "vsc") {
      // upgrade a VSC to a full safety car
      n.kind = "sc";
      n.endLap = Math.min(this.cfg.laps, lap + laps);
      n.announcedEnd = false;
      this.emit("sc_deployed", undefined, undefined, `VSC upgraded to SAFETY CAR (${cause}).`);
    } else {
      n.endLap = Math.min(this.cfg.laps, Math.max(n.endLap, lap + 1));
    }
  }

  /** Uses a fresh set of this compound. When none is left the car gets a used one: it starts worn. */
  private takeSet(car: CarState, compound: Compound, start: boolean) {
    const key = this.cfg.rules?.tyrePool ? car.entry.team.id : car.id;
    const inv = this.setsLeft[key];
    if (!inv || inv[compound] === undefined) return;
    if ((inv[compound] as number) > 0) inv[compound] = (inv[compound] as number) - 1;
    else {
      car.tyre.wear = 0.3;
      if (!start) this.emit("rule", car.id, undefined, `${car.entry.driver.code}: no fresh ${COMPOUNDS[compound].name}s left, a used set goes on.`);
    }
  }

  /** Fresh sets this car can still use, for the pit wall display. */
  setsFor(car: CarState): Partial<Record<Compound, number>> | undefined {
    return this.setsLeft[this.cfg.rules?.tyrePool ? car.entry.team.id : car.id];
  }

  /** Fuel that would be added at a stop now, by the stop choice (refuelling rule). */
  fuelToAdd(car: CarState): number {
    const left = Math.max(0, this.cfg.laps - car.lap - 1);
    const need = (left / this.cfg.laps) * 1.06 + 0.03;
    const want = car.pitFuel === "full" ? 1 : car.pitFuel === "min" ? Math.min(1, need * 0.8) : Math.min(1, need);
    return Math.max(0, Math.min(1 - car.fuel, want - car.fuel));
  }

  /** Open radio: rivals behind react to a human pit call. */
  private rivalsHear(caller: CarState) {
    for (const c of this.cars) {
      if (c.entry.human || c.status !== "racing" || c.pitRequest || c.position <= caller.position) continue;
      if (c.position - caller.position > 3 || this.cfg.laps - c.lap < 4) continue;
      if (this.rng.chance(0.55)) {
        c.pitRequest = this.chooseCompound(c);
        this.emit("radio", c.id, undefined, `${c.entry.team.id.toUpperCase()} heard the call and respond: ${c.entry.driver.code} boxes too.`);
      }
    }
  }

  private updateAhead() {
    const L = this.track.length;
    this.ahead.clear();
    const racers = this.cars.filter((c) => c.status === "racing");
    for (const c of racers) {
      let best: CarState | null = null;
      let bestD = 90;
      for (const o of racers) {
        if (o === c) continue;
        if (Math.abs(o.lateral) > 5.5 && o.v < 25) continue; // stricken car off the racing line
        const d = mod(o.s - c.s, L);
        if (d < bestD) {
          bestD = d;
          best = o;
        }
      }
      this.ahead.set(c.id, best);
    }
  }

  // ------------------------------------------------------------------ stewards

  givePenalty(car: CarState, seconds: number, short: string, text: string) {
    if (this.cfg.noPenalties) return;
    car.penalty += seconds;
    car.penaltyNotes.push(`${short} (+${seconds}s)`);
    this.emit("penalty", car.id, undefined, `PENALTY ${car.entry.driver.code}: ${text}.`);
  }

  private stepCar(car: CarState) {
    const T = this.track;
    const L = T.length;
    const e = car.entry;

    // ---- ghost / non-racing states
    if (car.status === "dnf") {
      car.v = Math.max(0, car.v - 22 * DT);
      car.s += car.v * DT;
      car.lateral += clamp(13 - car.lateral, -6 * DT, 6 * DT);
      return;
    }
    if (car.status === "finished") {
      car.v += clamp(40 - car.v, -30 * DT, 8 * DT);
      car.s += car.v * DT;
      car.lateral += clamp(0 - car.lateral, -4 * DT, 4 * DT);
      return;
    }
    if (car.status === "grid") return;

    const lapPos = mod(car.s, L);
    const tr = sampleTrack(T, car.s);
    const profV = tr.speed;
    const straight = tr.straight;
    const curvAbs = Math.abs(tr.curv);
    const cw = Math.min(1, curvAbs / 0.006);

    // ---- pit entry
    if (car.status === "racing" && car.pitRequest && !car.incident) {
      if (car.lap + 1 >= this.cfg.laps && !this.inc.red.active) car.pitRequest = null;
      else if (lapPos >= L - T.pitIn && lapPos <= L - 125) {
        car.status = "pit_in";
        car.overtaking = null;
      }
    }

    const inPit = car.status === "pit_in" || car.status === "pit_stop" || car.status === "pit_out";
    const ah = inPit ? null : (this.ahead.get(car.id) ?? null);
    const gapM = ah ? mod((this.snap.get(ah.id) as number) - car.s, L) - CAR_LEN : Infinity;
    const racingFree = ah === null || gapM > 45;

    const overtakingNow = car.overtaking !== null;
    const dirty =
      ah && gapM < 45 && !(overtakingNow && ah.id === car.overtaking) ? 1 - 0.014 * (1 - gapM / 45) * (0.3 + 0.7 * cw) : 1;

    let factor = speedFactor(e, car.tyre, car.fuel, car.push, curvAbs, dirty);
    if (this.tick < car.errorUntil) factor *= 0.93;
    if (car.defendUntil > this.tick) factor *= 0.992; // a hard defence compromises the line
    if (car.restartUntil > this.tick) {
      // standing-style restart: the start skill and how fast the tyres come in decide it
      const warm = car.tyre.compound === "S" ? 0.012 : car.tyre.compound === "M" ? 0.004 : -0.004;
      factor *= 0.975 + 0.03 * e.driver.consistency + warm + 0.008 * (e.driver.aggression - 0.5);
    }
    const secNow = Math.min(2, Math.floor(lapPos / (L / 3)));
    const wetHere = this.weather ? this.weather.wet[secNow] : 0;
    car.wetD = wetHere;
    this.inc.roll(car, cw, wetHere);
    factor *= this.inc.damageFactor(car, cw);
    let brakeScale = 1;
    if (this.weather) {
      factor *= wetSpeedFactor(car.tyre.compound, wetHere, e.driver.wet ?? 0.5, cw);
      brakeScale = wetBrakeFactor(car.tyre.compound, wetHere);
    }

    // ---- ERS deployment on straights
    const ers = ersFactor(car.mode, car.soc, straight);

    const boosting = car.boostUntil > this.tick;
    const free = profV * factor * ers * (boosting ? 1.022 : 1);
    let target = free;

    // ---- safety car / virtual safety car
    const sc = this.neutral.active && this.neutral.kind === "sc";
    const vsc = this.neutral.active && this.neutral.kind === "vsc";
    if (this.cfg.rules?.refuelling && car.fuel <= 0.001 && car.status === "racing") target *= 0.3; // out of fuel
    if (sc) target = Math.min(target, SC_SPEED);
    if (vsc) target = Math.min(target, profV * VSC_FACTOR);
    const redNow = this.inc.red.active;
    const neutral = sc || vsc || redNow;
    if (redNow && car.status === "racing") target = Math.min(target, 55);
    else if (!neutral && car.status === "racing" && this.inc.yellowAt(secNow) && !car.incident) target *= 0.78;

    // ---- traffic following / overtaking
    if (ah) {
      if (car.status === "racing" && car.lap <= 1) this.inc.firstLap(car, ah, gapM, curvAbs);
      const target0 = ah.id;
      const passing = car.overtaking === target0 && !car.yielding;
      if (!passing) {
        const minGap = sc ? 14 : 3.2;
        const cap = ah.v + Math.max(-ah.v, (gapM - minGap) * 0.55);
        // braking-aware safe speed: the car must be able to stop in the room that is left behind the car ahead
        const room = Math.max(0, gapM - minGap);
        // (assume the car ahead may brake flat out while we only plan to use part of our own braking)
        const bF = FOLLOW_BRAKE_SHARE * brakeAt(car.v) * brakeScale;
        const bL = brakeAt(ah.v) * (this.weather ? wetBrakeFactor(ah.tyre.compound, ah.wetD) : 1);
        const safe = Math.sqrt((bF / bL) * ah.v * ah.v + 2 * bF * room);
        target = Math.min(target, Math.max(0, Math.min(cap, safe)));
      } else {
        target *= 1.012;
        // while alongside the target, still leave room for whoever is in front of it
        const ah2 = this.ahead.get(ah.id);
        if (ah2 && ah2.id !== car.id && ah2.status === "racing") {
          const gap2 = mod((this.snap.get(ah2.id) as number) - car.s, L) - CAR_LEN;
          if (gap2 < L * 0.25) {
            const room2 = Math.max(0, gap2 - 3.2);
            const bF2 = FOLLOW_BRAKE_SHARE * brakeAt(car.v) * brakeScale;
            const bL2 = brakeAt(ah2.v) * (this.weather ? wetBrakeFactor(ah2.tyre.compound, ah2.wetD) : 1);
            target = Math.min(target, Math.max(0, Math.sqrt((bF2 / bL2) * ah2.v * ah2.v + 2 * bF2 * room2)));
          }
        }
      }

      // try to start an overtake
      if (!neutral && !car.overtaking && car.lap >= this.neutral.lockLap && this.tick >= car.cooldownUntil && ah.status === "racing" && !this.inc.yellowAt(secNow) && !(this.radio && this.radio.blocksOvertake(car, ah))) {
        const attackReach = car.mode === "attack" && car.soc > 0.03 ? 10 : 0;
        if (straight && gapM < 34 + attackReach && gapM > -5) {
          const lapped = ah.s < car.s - L * 0.5;
          const delta = free - ah.v;
          let score =
            0.45 * delta +
            2.2 * (e.driver.aggression - 0.5) -
            1.6 * (ah.entry.driver.aggression - 0.5) +
            (car.mode === "attack" && car.soc > 0.03 ? 1.4 : 0) +
            (ah.mode === "harvest" ? 0.5 : 0);
          if (lapped) score += 6;
          if (ah.defendUntil > this.tick && !lapped) score -= 3.5;
          if (car.boostUntil > this.tick) score += 1.6;
          if (this.radio) score += this.radio.letByBonus(car, ah);
          const p = clamp(0.006 + 0.022 * score, 0, 0.2);
          if (this.rng.chance(p)) {
            car.overtaking = ah.id;
            car.overtakeUntil = this.tick + 55;
          }
        }
      }
    }
    if (car.overtaking) {
      const t = this.byId.get(car.overtaking);
      if (!t || t.status !== "racing") {
        car.overtaking = null;
        car.yielding = false;
      } else {
        const rel = mod((this.snap.get(t.id) as number) - car.s + L / 2, L) - L / 2; // signed distance to target (tick-start), + = target ahead
        if (rel < -(CAR_LEN + 3)) {
          const sameLap = Math.abs(t.s - car.s) < L * 0.5;
          if (sameLap) this.emit("overtake", car.id, t.id, `${car.entry.driver.code} passes ${t.entry.driver.code}.`);
          car.overtaking = null;
          car.yielding = false;
          car.cooldownUntil = this.tick + 25;
        } else if (!car.yielding && this.tick >= car.overtakeUntil) {
          car.yielding = true; // move failed: back out, stay offset until clear
          this.maybeContact(car, t);
        } else if (car.yielding && rel > CAR_LEN + 3) {
          car.overtaking = null;
          car.yielding = false;
          car.cooldownUntil = this.tick + 40;
        }
      }
    }

    if (this.radio && car.entry.human && straight && !neutral) {
      const behindCar = this.order[car.position] ?? null;
      if (behindCar && this.radio.yielding(car, behindCar) && behindCar.gapAhead < 1.4) target *= 0.955;
    }

    // ---- pit lane logic
    let pitCap = Infinity;
    if (car.status === "pit_in") {
      const boxS = T.boxS + car.boxOff;
      const k = Math.floor((car.s - boxS) / L) + 1;
      const boxAbs = k * L + boxS;
      const dist = boxAbs - car.s;
      if (lapPos < L / 2) {
        pitCap = PIT_LIMIT;
      } else {
        const dLim = L - 110 - lapPos;
        pitCap = Math.sqrt(PIT_LIMIT * PIT_LIMIT + 2 * 40 * Math.max(0, dLim));
      }
      // double stack: one box per team. The second car queues a car length behind unless the first will be gone by the time he arrives
      let stopDist = dist;
      let queued = false;
      const mate = this.cars.find((m) => m !== car && m.entry.team.id === e.team.id && (m.status === "pit_stop" || m.status === "pit_in"));
      if (mate) {
        const mateLeft = mate.status === "pit_stop" ? (mate.pitTimer * DT) : mate.status === "pit_in" && (mate.s - car.s) > 0 && (mate.s - car.s) < 120 ? 4 + (mate.stopSecs ?? 3) : 0;
        const eta = dist / Math.max(8, Math.min(car.v + 6, PIT_LIMIT));
        if (mateLeft > 0.05 && mateLeft > eta - 0.2) {
          queued = true;
          stopDist = dist - STACK_GAP;
        }
      }
      if (queued) {
        car.stackWait = (car.stackWait ?? 0) + DT;
      }
      const vBox = Math.sqrt(2 * 7 * Math.max(0, stopDist));
      pitCap = Math.min(pitCap, Math.max(queued && stopDist < 0.6 ? 0 : 1.2, vBox));
      if (queued && stopDist < 0.6) pitCap = 0;
      if (!queued && ((dist < 1.5 && car.v < 3) || dist < -0.5)) {
        car.s = boxAbs;
        car.v = 0;
        car.status = "pit_stop";
        car.stopFrom = car.tyre.compound;
        const fixed = this.cfg.rules?.fixedStop;
        const crewT = fixed !== undefined ? fixed + (car.damage.aero > 0.05 ? 4 : 0) : 2.0 + (1 - e.team.pitCrew) * 1.6 + this.rng.range(0, 0.7) + (this.rng.chance(e.team.pitFumble ?? 0.04) ? 3 : 0) + (car.damage.aero > 0.05 ? 4 : 0);
        if (fixed === undefined && crewT > 4.6) car.slowStop = true;
        let extra = 0;
        if (car.pitSwap && this.cfg.rules?.batterySwap) extra += 1.8;
        if (this.cfg.rules?.refuelling) extra += this.fuelToAdd(car) / 0.045;
        car.pitTimer = Math.ceil((crewT + extra) / DT);
        car.stopSecs = crewT + extra;
      }
    } else if (car.status === "pit_stop") {
      car.v = 0;
      if (!this.inc.red.active) car.pitTimer--;
      if (car.pitTimer <= 0) {
        car.damage.aero = 0;
        car.damage.flat = 0;
        car.damage.puncture = false;
        car.stintLaps = 0;
        const req = car.pitRequest ?? "M";
        const nc = this.cfg.rules?.oneCompound && (req === "S" || req === "M" || req === "H") ? "M" : req;
        car.tyre = { compound: nc, wear: 0, ageLaps: 0 };
        this.takeSet(car, nc, false);
        if (!car.compoundsUsed.includes(nc)) car.compoundsUsed.push(nc);
        car.stops++;
        this.stopLog.push({ carId: car.id, lap: car.lap + 1, secs: car.stopSecs ?? 0, from: car.stopFrom ?? "M", to: nc, posBefore: car.position });
        if (this.cfg.rules?.refuelling) car.fuel = Math.min(1, car.fuel + this.fuelToAdd(car));
        if (car.pitSwap && this.cfg.rules?.batterySwap) {
          car.soc = 1;
          this.emit("radio", car.id, undefined, `${e.driver.code}: New battery in. Fully charged.`);
        }
        car.pitSwap = false;
        const win = this.cfg.rules?.stopWindow;
        if (win && !this.neutral.active && !this.inc.red.active && (car.lap + 1 < win[0] || car.lap + 1 > win[1])) {
          this.givePenalty(car, 5, "Stop outside the window", `${e.driver.code} stopped outside the stop window (laps ${win[0]} to ${win[1]}): 5 seconds`);
        }
        car.pitRequest = null;
        car.status = "pit_out";
        if (car.stackWait) this.stackLog.push({ carId: car.id, lap: car.lap + 1, wait: car.stackWait });
        car.stackWait = 0;
        car.stackAsked = false;
        this.emit("pit_out", car.id, undefined, `${e.driver.code}: Box complete. On ${COMPOUNDS[nc].name}s, stop number ${car.stops}.`);
      }
    } else if (car.status === "pit_out") {
      pitCap = PIT_LIMIT;
      if (lapPos > T.pitOut && lapPos < L / 2) car.status = "racing";
    }
    if (pitCap < Infinity) target = Math.min(target, pitCap);

    target = this.inc.apply(car, target);

    // ---- launch
    if (this.tick < this.lightsAt + car.reaction) target = 0;

    // ---- integrate speed
    if (car.status !== "pit_stop") {
      const acc = accelAt(car.v);
      const dv = clamp(target - car.v, -brakeAt(car.v) * brakeScale * DT, acc * DT);
      car.v = Math.max(0, car.v + dv);
      car.s += car.v * DT;
    }

    // ---- ERS state of charge
    const braking = target < car.v - 1.2;
    if (straight) {
      if (car.mode === "attack") car.soc -= 0.0165 * DT;
      else if (car.mode === "balanced") car.soc -= 0.0055 * DT;
      else car.soc += 0.0035 * DT;
    }
    if (braking) car.soc += (car.mode === "harvest" ? 0.022 : car.mode === "balanced" ? 0.012 : 0.009) * DT;
    car.soc = clamp(car.soc, 0, 1);

    // ---- tyre wear + fuel
    if (!inPit) {
      const cornerLoad = Math.min(1, (car.v * car.v * curvAbs) / 31);
      const lifeLaps = this.life[car.tyre.compound];
      let rate =
        (1 / (lifeLaps * T.nominalLap)) *
        1.18 *
        PUSH_WEAR[car.push] *
        (1.25 - 0.5 * e.driver.tyreMgmt) *
        (0.55 + 0.9 * cornerLoad);
      if (!racingFree) rate *= 1.1;
      if (this.cfg.rules?.tyreLottery) rate *= 0.72 + 0.7 * this.stintLuck(car);
      if (this.weather && this.wx) {
        rate *= wetWearFactor(car.tyre.compound, wetHere);
        if (!isWetCompound(car.tyre.compound)) rate *= Math.min(1.25, Math.max(0.85, 1 + 0.012 * (this.wx.trackC - 38)));
      }
      if (sc) rate *= 0.35;
      else if (vsc) rate *= 0.5;
      car.tyre.wear += rate * DT;
      const burn = (PUSH_FUEL[car.push] / (this.cfg.laps * T.nominalLap * 1.06)) * DT * (sc ? 0.5 : vsc ? 0.6 : 1) * (1 - 0.06 * ((e.driver.fuelSave ?? 0.5) - 0.5));
      // without refuelling a car always keeps a small reserve in the tank (it lifts and coasts instead of running dry)
      car.fuel = Math.max(this.cfg.rules?.refuelling ? 0 : FUEL_RESERVE, car.fuel - burn);
    }

    // ---- lateral offset (render only)
    const incLat = this.inc.lateral(car);
    const latTarget = incLat !== null ? incLat : inPit ? 24 * T.pitSide : car.overtaking ? 5 : 0;
    car.lateral += clamp(latTarget - car.lateral, -9 * DT, 9 * DT);

    // ---- loops (timing gaps)
    const loopLen = L / LOOPS;
    const loopsDone = Math.floor(car.s / loopLen);
    while (car.loopCount < loopsDone && car.loopCount < car.loops.length - 1) {
      const idx = car.loopCount + 1;
      if (idx >= 0) {
        const over = car.s - idx * loopLen;
        car.loops[idx] = this.tick - (car.v > 1 ? over / (car.v * DT) : 0);
      }
      car.loopCount++;
    }

    // ---- sectors
    const secLen = L / 3;
    const sIdx = Math.floor(lapPos / secLen);
    if (car.lapStartTick >= 0 && sIdx === car.sectorIdx + 1) this.completeSector(car, car.sectorIdx);

    // ---- lap crossing
    const crossed = Math.floor(car.s / L) + 1;
    if (crossed === 1 && car.lapStartTick < 0) {
      car.lapStartTick = this.tick - car.s / Math.max(car.v * DT, 0.001);
      car.sectorStartTick = car.lapStartTick;
      car.sectorIdx = 0;
    } else if (car.lapStartTick < 0 && crossed === car.lap + 1 && car.lap > 0 && car.status === "racing") {
      car.lapStartTick = this.tick - (car.s - car.lap * L) / Math.max(car.v * DT, 0.001);
      car.sectorStartTick = car.lapStartTick;
      car.sectorIdx = 0;
    } else if (crossed - 1 > car.lap && car.lapStartTick >= 0) {
      this.completeLap(car, crossed - 1);
    }
  }

  /** A failed overtake can end in contact. The attacker is usually (not always) at fault. */
  private maybeContact(attacker: CarState, victim: CarState) {
    if (this.cfg.noIncidents || this.cfg.noCrashes) return;
    const p = 0.0006 + 0.0016 * attacker.entry.driver.aggression;
    if (!this.rng.chance(p)) return;
    this.inc.collide(attacker, victim);
  }

  private completeSector(car: CarState, idx: number) {
    const t = (this.tick - car.sectorStartTick) * DT;
    car.sectors.last[idx] = t;
    let colour = 1;
    if (t < this.bestSector[idx]) {
      this.bestSector[idx] = t;
      colour = 3;
    } else if (t < car.sectors.best[idx]) colour = 2;
    if (t < car.sectors.best[idx]) car.sectors.best[idx] = t;
    car.sectors.color[idx] = colour;
    car.sectorStartTick = this.tick;
    car.sectorIdx = idx + 1;
    if (idx === 1 && !car.entry.human) this.strat.decide(car, true);
  }

  private completeLap(car: CarState, lapNo: number) {
    const L = this.track.length;
    const crossTick = this.tick - (car.s - lapNo * L) / Math.max(car.v * DT, 0.001);
    const lapTime = (crossTick - car.lapStartTick) * DT;
    // finish sector 3
    const t3 = (crossTick - car.sectorStartTick) * DT;
    car.sectors.last[2] = t3;
    let colour = 1;
    if (t3 < this.bestSector[2]) {
      this.bestSector[2] = t3;
      colour = 3;
    } else if (t3 < car.sectors.best[2]) colour = 2;
    if (t3 < car.sectors.best[2]) car.sectors.best[2] = t3;
    car.sectors.color[2] = colour;
    car.sectorIdx = 0;
    car.sectorStartTick = crossTick;

    car.lap = lapNo;
    car.lastLap = lapTime;
    car.lapStartTick = crossTick;
    car.tyre.ageLaps++;
    car.stintLaps++;
    if (lapTime < car.bestLap) {
      car.bestLap = lapTime;
      car.bestLapSec = [...car.sectors.last] as [number, number, number];
    }
    if (lapTime < this.bestLapAll && !this.neutral.active) {
      this.bestLapAll = lapTime;
      this.bestLapCar = car.id;
      this.emit("fastest_lap", car.id, undefined, `${car.entry.driver.code} sets the fastest lap: ${fmtLap(lapTime)}.`);
    }
    this.emit("lap", car.id, undefined, `${car.entry.driver.code} lap ${lapNo}: ${fmtLap(lapTime)}`);
    {
      let rec = this.lapLog.get(car.id);
      if (!rec) this.lapLog.set(car.id, (rec = []));
      rec.push({ lap: lapNo, pos: car.position, time: lapTime, compound: car.tyre.compound, slow: car.status !== "racing" || this.neutral.active || lapNo === 1, gap: car.gapLeader });
    }
    if (this.cfg.rules?.lapLed && this.leader()?.id === car.id) this.ledLaps.set(car.id, (this.ledLaps.get(car.id) ?? 0) + 1);
    if (this.cfg.rules?.scheduledSC && !this.scheduledDone && lapNo >= Math.max(3, Math.floor(this.cfg.laps * 0.42)) && lapNo < this.cfg.laps - 3 && this.leader()?.id === car.id) {
      this.scheduledDone = true;
      this.deployNeutral("sc", "scheduled by the rules");
    }

    this.formatHooks(car, lapNo);

    // finishing: the leader takes the flag at the scheduled distance, or when two hours have passed
    const timeUp = this.raceTime >= MAX_RACE_SECONDS;
    if (lapNo >= this.cfg.laps || this.chequered || timeUp) {
      if (!this.chequered) {
        this.chequered = true;
        this.emit("chequered", car.id, undefined, `${car.entry.driver.code} takes the chequered flag!`);
      }
      car.status = "finished";
      car.finishTick = crossTick;
      car.pitRequest = null;
      this.emit("finish", car.id, undefined, `${car.entry.driver.code} finishes the race.`);
      return;
    }

    if (car.tyre.wear > 0.85) {
      this.emit("tyre_warning", car.id, undefined, `${car.entry.driver.code}: Tyres are really going away, I need new ones.`);
    }

    // the compound rule: remind the player while there is still time to satisfy it
    if (car.entry.human && this.cfg.twoCompoundRule !== false && !this.ruleDone(car)) {
      const remaining = this.cfg.laps - lapNo;
      const stage = remaining <= Math.ceil(this.cfg.laps * 0.25) ? 2 : remaining <= Math.ceil(this.cfg.laps * 0.5) ? 1 : 0;
      if (stage > (this.ruleWarned.get(car.id) ?? 0)) {
        this.ruleWarned.set(car.id, stage);
        this.emit(
          "rule",
          car.id,
          undefined,
          stage === 2
            ? `RULES: ${car.entry.driver.code} still has not used a second dry compound. Box NOW or be disqualified.`
            : `RULES: ${car.entry.driver.code} must use a second dry compound before the flag.`,
        );
      }
    }

    // incidents, track limits
    if (!this.cfg.noIncidents && car.status === "racing" && !this.neutral.active) {
      const d = car.entry.driver;
      const pushM = car.push === 2 ? 1.8 : car.push === 0 ? 0.6 : 1;
      const pErr = (1 - d.consistency) * 0.06 * pushM;
      if (this.rng.chance(pErr)) car.errorUntil = this.tick + 25;
      if (!this.cfg.noPenalties && this.rng.chance(0.005 + 0.04 * (1 - d.consistency) * pushM)) {
        car.warnings++;
        const turn = this.randomCorner();
        if (car.warnings % 3 === 0) {
          this.givePenalty(car, 5, "Track limits", `${d.code} has exceeded track limits at Turn ${turn} for the third time: 5 seconds`);
        } else {
          this.emit("warning", car.id, undefined, `Track limits: ${d.code} off at Turn ${turn} (warning ${car.warnings % 3} of 3).`);
        }
      }
    }

    if (!car.entry.human) this.aiDecide(car);
    if (this.radio) this.radio.lap(car);
  }

  /** Race-format rules that act when the leader completes a lap. */
  private formatHooks(car: CarState, lapNo: number) {
    const r = this.cfg.rules;
    if (!r || this.leader()?.id !== car.id) return;
    const laps = this.cfg.laps;
    const third = [Math.ceil(laps / 3), Math.ceil((2 * laps) / 3)];
    if (r.checkpointCuts && third.includes(lapNo) && !this.checkpointDone.has(lapNo) && lapNo < laps - 1) {
      this.checkpointDone.add(lapNo);
      const running = this.order.filter((c) => c.status === "racing" || c.status === "pit_in" || c.status === "pit_out" || c.status === "pit_stop");
      const last = running.slice(-3);
      this.emit("rule", undefined, undefined, `CHECKPOINT: the last three cars take a pit lane penalty (${last.map((c) => c.entry.driver.code).join(", ")}).`);
      for (const c of last) this.givePenalty(c, 5, "Checkpoint cut", `${c.entry.driver.code} is in the bottom three at the checkpoint: 5 seconds`);
    }
    if (r.stageRacing && third.includes(lapNo) && lapNo !== laps) {
      const stage = third.indexOf(lapNo) + 1;
      const top = this.order.filter((c) => c.status !== "dnf").slice(0, 5);
      const pts = [5, 4, 3, 2, 1];
      top.forEach((c, i) => this.stagePoints.set(c.id, (this.stagePoints.get(c.id) ?? 0) + pts[i]));
      this.emit("rule", undefined, undefined, `STAGE ${stage} ends: ${top.map((c, i) => `${c.entry.driver.code} +${pts[i]}`).join(", ")}.`);
    }
    if (r.twoHeat && !this.heatDone && lapNo === Math.floor(laps / 2) && laps >= 8) {
      this.heatDone = true;
      this.emit("rule", undefined, undefined, "END OF HEAT ONE: the race is stopped. Free tyres, then a standing restart with the gaps wiped.");
      this.inc.startRed("heat break", 25);
    }
  }

  retire(car: CarState, reason: string) {
    car.status = "dnf";
    car.dnfReason = reason;
    car.pitRequest = null;
    car.retireTick = this.tick;
  }

  randomCorner(): number {
    const cs = this.track.corners;
    return cs.length ? cs[Math.floor(this.rng.next() * cs.length) % cs.length].n : 1;
  }

  cornerText(car: CarState): string {
    const cs = this.track.corners;
    if (!cs.length) return "";
    const pos = mod(car.s, this.track.length);
    let best = cs[0];
    for (const c of cs) if (Math.abs(c.s - pos) < Math.abs(best.s - pos)) best = c;
    return ` at Turn ${best.n}`;
  }

  // ------------------------------------------------------------------ AI strategy

  /**
   * Pick the next tyre. Prefers the softest compound that can reach the flag, and always
   * satisfies the two compound rule if it is still open.
   */
  chooseCompound(car: CarState): Compound {
    return this.strat.next(car);
  }

  /** The dry choice: the softest compound that can reach the flag, satisfying the two compound rule. */
  chooseCompoundDry(car: CarState): Compound {
    if (this.cfg.rules?.oneCompound) return "M";
    const remaining = this.cfg.laps - car.lap;
    const need = this.cfg.twoCompoundRule !== false && !this.ruleDone(car);
    const order: Compound[] = ["S", "M", "H"];
    let pool = order.filter((c) => (need ? !car.compoundsUsed.includes(c) : c !== car.tyre.compound || car.compoundsUsed.length > 1));
    if (!pool.length) pool = order;
    const finishers = pool.filter((c) => this.life[c] * 0.95 >= remaining);
    if (finishers.length) return finishers[0];
    // nothing can go the distance: take the longest-lasting one
    return pool.reduce((a, b) => (this.life[b] > this.life[a] ? b : a));
  }

  private aiNeutralPit(car: CarState) {
    if (car.status !== "racing" || car.pitRequest) return;
    const remaining = this.cfg.laps - car.lap;
    if (remaining <= 3) return;
    const L = this.track.length;
    const lapPos = mod(car.s, L);
    if (lapPos > L - 125 && lapPos < L) return; // already past the entry
    if (this.scPitChecked.get(car.id) === this.neutral.id) return;
    this.scPitChecked.set(car.id, this.neutral.id);
    if (this.strat.neutralCall(car)) car.pitRequest = this.chooseCompound(car);
  }

  private aiDecide(car: CarState) {
    const laps = this.cfg.laps;
    const remaining = laps - car.lap; // laps still to run, incl. the one just starting
    const ruleOpen = this.cfg.twoCompoundRule !== false && !this.ruleDone(car);
    if (!car.pitRequest && car.status === "racing" && remaining > 1) {
      this.strat.decide(car);
    }
    if (!car.pitRequest && car.status === "racing" && remaining > 1) {
      const lifeLeft = this.life[car.tyre.compound] * (1 - car.tyre.wear) * 1.15;
      let want = false;
      if (car.stops < car.aiStops && (car.tyre.wear > car.aiPlan || lifeLeft < 1.2)) want = true;
      if (car.stops >= car.aiStops && (car.tyre.wear > 0.93 || lifeLeft < 0.6) && remaining > 2) want = true;
      // never leave the compound rule too late
      if (ruleOpen && remaining <= Math.max(3, Math.ceil(laps * 0.34))) want = true;
      if (car.damage.puncture || car.damage.aero > 0.3 || car.damage.flat > 0.55) want = true;
      if (this.neutral.active) this.aiNeutralPit(car);
      if (want && !car.pitRequest) car.pitRequest = this.chooseCompound(car);
    }
    const rl = this.cfg.rules;
    if (rl && car.status === "racing") {
      if (rl.refuelling && !car.pitRequest && remaining > 2) {
        const perLap = 0.95 / laps;
        if (car.fuel < perLap * 2.2 && car.fuel < ((remaining - 1) / laps) * 1.0) car.pitRequest = this.chooseCompound(car);
      }
      if (rl.stopWindow && car.pitRequest && !this.neutral.active && !this.inc.red.active) {
        const nxt = car.lap + 1;
        if (nxt < rl.stopWindow[0] && car.tyre.wear < 0.88 && car.fuel > 0.12) car.pitRequest = null;
      }
      if (rl.stopWindow && !car.pitRequest && car.stops === 0 && car.lap + 1 >= rl.stopWindow[1] - 1 && remaining > 2) car.pitRequest = this.chooseCompound(car);
      if (rl.batterySwap && car.pitRequest && car.soc < 0.35) car.pitSwap = true;
      if (rl.pushToPass && car.boostLeft > 0 && car.boostUntil <= this.tick && car.gapAhead > 0 && car.gapAhead < 1.0 && car.soc > 0.15) {
        car.boostLeft--;
        car.boostUntil = this.tick + 120;
      }
      if (rl.pushToPass && car.boostLeft > 0 && remaining <= 2 && car.boostUntil <= this.tick) {
        car.boostLeft--;
        car.boostUntil = this.tick + 120;
      }
      const behind = this.order[car.position] ?? null;
      if (rl.defenceTokens && car.defendLeft > 0 && car.defendUntil <= this.tick && behind && behind.status === "racing" && behind.gapAhead > 0 && behind.gapAhead < 0.7) {
        car.defendLeft--;
        car.defendUntil = this.tick + 150;
      }
      if (rl.openRadio && car.pitRequest && car.entry.human === false) this.emit("radio", car.id, undefined, `Radio intercept: ${car.entry.team.id.toUpperCase()} are calling ${car.entry.driver.code} in.`);
    }
    // energy + push
    let mode: EnergyMode = "balanced";
    if (car.soc < 0.18) mode = "harvest";
    else if (car.gapAhead > 0 && car.gapAhead < 1.1 && car.soc > 0.35) mode = "attack";
    else if (car.soc > 0.8) mode = "attack";
    car.mode = mode;
    car.push = car.tyre.wear > 0.75 ? 0 : remaining <= 2 ? 2 : 1;
  }

  // ------------------------------------------------------------------ order, gaps, finish

  private updateOrder() {
    const cls = (c: CarState) => (c.status === "dnf" ? 2 : c.status === "finished" ? 0 : 1);
    this.order = [...this.cars].sort((a, b) => {
      const ca = cls(a);
      const cb = cls(b);
      if (ca !== cb) return ca - cb;
      if (ca === 0) {
        if (a.lap !== b.lap) return b.lap - a.lap;
        return a.finishTick - b.finishTick;
      }
      if (ca === 2) {
        if (a.s !== b.s) return b.s - a.s;
        return b.retireTick - a.retireTick;
      }
      return b.s - a.s;
    });
    this.order.forEach((c, i) => (c.position = i + 1));
  }

  private updateGaps() {
    const lead = this.order[0];
    for (let i = 0; i < this.order.length; i++) {
      const c = this.order[i];
      const p = i > 0 ? this.order[i - 1] : null;
      c.gapAhead = p ? this.loopGap(c, p) : 0;
      c.gapLeader = i > 0 ? this.loopGap(c, lead) : 0;
    }
  }

  private loopGap(c: CarState, p: CarState): number {
    const k = Math.min(c.loopCount, p.loopCount);
    if (k < 1) return 0;
    const a = c.loops[k];
    const b = p.loops[k];
    if (a < 0 || b < 0) return 0;
    return Math.max(0, (a - b) * DT);
  }

  private checkFinished() {
    const active = this.cars.some((c) => c.status !== "dnf" && c.status !== "finished");
    if (!active || this.tick > this.maxTicks) {
      if (this.tick > this.maxTicks) {
        for (const c of this.cars) if (c.status !== "dnf" && c.status !== "finished") c.status = "finished";
      }
      this.phase = "finished";
    }
  }

  // ------------------------------------------------------------------ results

  /**
   * Final classification under the sporting regulations:
   * time penalties are added to the finishing time, a driver needs 90% of the winner's laps to be classified,
   * and a finisher who never used two different dry compounds is disqualified.
   */
  results(): ResultRow[] {
    this.updateOrder();
    const ruleOn = this.cfg.twoCompoundRule !== false;
    type Entry = { car: CarState; laps: number; finished: boolean; time: number; status: ResultStatus };
    const entries: Entry[] = this.cars.map((car) => {
      const finished = car.status === "finished";
      const time = finished ? (car.finishTick - LIGHTS_TICKS) * DT + car.penalty : Infinity;
      let status: ResultStatus = finished ? "FIN" : "DNF";
      if (finished && ruleOn && !this.ruleDone(car)) status = "DSQ";
      return { car, laps: car.lap, finished, time, status };
    });
    const winnerLaps = Math.max(0, ...entries.filter((x) => x.status !== "DSQ").map((x) => x.laps));
    const minLaps = Math.floor(winnerLaps * CLASSIFIED_SHARE);
    for (const x of entries) {
      if (x.status === "DNF" && x.laps < minLaps) x.status = "NC";
      if (x.status === "FIN" && x.laps < minLaps) x.status = "NC";
    }
    const rank = (x: Entry) => (x.status === "DSQ" ? 3 : x.status === "NC" ? 2 : 0);
    entries.sort((a, b) => {
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      if (a.laps !== b.laps) return b.laps - a.laps;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished) return a.time - b.time;
      return b.car.retireTick - a.car.retireTick;
    });
    const winner = entries[0];
    const table = this.cfg.pointsTable ?? POINTS;
    let ledBest = "";
    if (this.cfg.rules?.lapLed) {
      let most = 0;
      for (const [id, n] of this.ledLaps) if (n > most) { most = n; ledBest = id; }
    }
    return entries.map((x, i) => {
      const c = x.car;
      const classified = x.status === "FIN" || (x.status === "DNF" && x.laps >= minLaps);
      const pos = i + 1;
      return {
        position: pos,
        carId: c.id,
        laps: x.laps,
        totalTime: x.time,
        gap: x.finished && winner.finished ? x.time - winner.time : Infinity,
        bestLap: c.bestLap,
        stops: c.stops,
        dnf: x.status === "DNF" || x.status === "NC",
        dnfReason: c.dnfReason || (x.status === "NC" ? "Not classified" : ""),
        points: (classified && i < table.length && x.status !== "DSQ" ? table[i] : 0) + (x.status !== "DSQ" ? (this.stagePoints.get(c.id) ?? 0) : 0) + (classified && c.id === ledBest && pos <= 10 ? 1 : 0) + (this.cfg.rules?.fastestLapPoint && classified && c.id === this.bestLapCar && pos <= 10 ? 1 : 0),
        status: x.status,
        penalty: c.penalty,
        penaltyNotes: c.penaltyNotes,
        compoundsUsed: c.compoundsUsed,
        delta: classified ? c.startPosition - pos : 0,
      };
    });
  }

  /** Cheap deterministic fingerprint of the full race state. */
  hash(): string {
    let h = this.tick * 31;
    for (const c of this.cars) {
      h = (h * 33 + Math.round(c.s * 100)) % 1000003;
      h = (h * 33 + Math.round(c.v * 100)) % 1000003;
      h = (h * 33 + Math.round(c.tyre.wear * 10000)) % 1000003;
      h = (h * 33 + Math.round(c.soc * 10000)) % 1000003;
      h = (h * 33 + Math.round(c.penalty * 10)) % 1000003;
    }
    return `${this.tick}:${h}:${this.rng.state}`;
  }
}

export function fmtLap(t: number): string {
  if (!isFinite(t) || t <= 0) return "--:--.---";
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, "0")}`;
}

export function fmtGap(t: number): string {
  if (!isFinite(t)) return "--";
  return `+${t.toFixed(1)}`;
}
