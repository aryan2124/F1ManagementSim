import { bestSet, cloneSets, findSet, freshCounts, makeSets, type TyreSet } from "./tyreSets";
import { CAR_LEN, DT, ersFactor, PIT_LIMIT, BOX_SPACING, speedFactor } from "./engine";
import { Rng } from "./rng";
import { accelAt, brakeAt, sampleTrack, type TrackModel } from "./track";
import type { CarStatus, Compound, EnergyMode, EntrySpec, PushLevel, SimEvent, SimEventKind, WeatherSpec } from "./types";
import { Weather, makeWeather, bestCompoundFor, targetWetness, wetBrakeFactor, wetSpeedFactor, wetWearFactor, type WeatherNow } from "./weather";

/**
 * Live Q1 / Q2 / Q3 qualifying.
 *
 * Rules implemented (2026 sporting regulations):
 *  - Q1 18 min (22 cars, slowest 6 are out), Q2 15 min (16 cars, slowest 6 are out), Q3 12 min (10 cars).
 *  - A lap counts only if it STARTED before the chequered flag. Cars still on an out lap when time runs out cannot start one.
 *  - Lap times can be deleted for exceeding track limits.
 *  - 107% rule: a driver slower than 107% of the fastest Q1 time may not race unless the stewards allow it.
 *  - Impeding another driver on a flying lap can cost a 3 place grid penalty.
 *  - Red flags suspend running after a crash. The clock keeps running.
 *  - Limited tyre sets, free choice of compound.
 *  - Pit exit is released one car at a time.
 */

export type QPhase = "garage" | "queue" | "out" | "push" | "in" | "entering" | "crashed";
export type QSegmentPhase = "ready" | "running" | "break" | "done";

export const SEGMENT_MINUTES: [number, number, number] = [18, 15, 12];
const OUT_PACE = 0.82;
const IN_PACE = 0.7;
const EXIT_GAP_TICKS = 55;
const SERVICE_TICKS = 110;
export const QUALI_SETS: Record<Compound, number> = { S: 4, M: 2, H: 1, I: 4, W: 2 };
const PIT_LAT = 24;
const GARAGE_LAT = 29;

export interface QualiConfig {
  seed: number;
  track: TrackModel;
  entries: EntrySpec[];
  /** Segment lengths in minutes. */
  minutes?: [number, number, number];
  /** Switch off crashes, deleted laps, mistakes (tests). */
  clean?: boolean;
  weather?: WeatherSpec;
  /** Career rule modules. */
  rules?: { aggregate?: boolean; singleShot?: boolean; tyreLock?: boolean; releaseOrder?: string[]; tyrePool?: boolean };
  /** The physical sets the human cars have for the weekend (keyed by car, or by team with the pool rule). Cars without one get the standard qualifying pool. */
  tyreSetList?: Record<string, TyreSet[]>;
}

export interface QualiCommand {
  type: "go" | "box" | "auto";
  carId: string;
  compound?: Compound;
  /** The exact set to fit (its compound is used). */
  setId?: string;
  /** Fit a fresh set (default) or stay on the used one. */
  fresh?: boolean;
  /** Flying laps in this run (1 or 2). */
  laps?: 1 | 2;
  auto?: boolean;
}

export interface QCar {
  id: string;
  entry: EntrySpec;
  phase: QPhase;
  /** View-compatible status. */
  status: CarStatus;
  s: number;
  v: number;
  lateral: number;
  compound: Compound;
  wear: number;
  fresh: boolean;
  sets: Record<Compound, number>;
  /** The physical sets this car can use, shared with its team mate under the pool rule. */
  setList: TyreSet[];
  /** The set on the car now. */
  setId?: string;
  fuel: number;
  soc: number;
  runsDone: number;
  flyingLeft: number;
  lineCount: number;
  lapStartTick: number;
  sectorStartTick: number;
  sectorIdx: number;
  sectors: { last: [number, number, number]; best: [number, number, number]; color: [number, number, number] };
  /** Best valid lap in each segment (Infinity if none). With aggregate qualifying this is the mean of the two best. */
  best: [number, number, number];
  /** Every valid lap this segment (aggregate qualifying). */
  valid: [number[], number[], number[]];
  /** The tyre used for the best lap of each segment. */
  bestComp: [Compound | null, Compound | null, Compound | null];
  lastLap: number;
  lastValid: boolean;
  lapValid: boolean;
  /** s (within the lap) at which this lap goes wrong, and how. */
  fault: { s: number; kind: "limits" | "mistake" | "crash"; turn: number } | null;
  lapNoise: number;
  secNoise: [number, number, number];
  mistakeUntil: number;
  trafficUntil: number;
  eliminatedIn: 0 | 1 | 2;
  crashedOut: boolean;
  /** Single shot: the segment in which this car took its one run. */
  shotUsed?: number;
  readyTick: number;
  boxOff: number;
  auto: boolean;
  plan: { first: number; margin: number; second: boolean };
  position: number;
  /** Planned run for human cars: what the player asked for. */
  pending: { compound: Compound; fresh: boolean; laps: 1 | 2 } | null;
  gridPenalty: number;
  impeded: string;
  /** Pairs already checked for impeding on the current lap. */
  impedeSeen: Set<string>;
  /** 107% rule outcome. */
  dnq: boolean;
  note: string;
  /** Best sector colour from the last lap, for the timing tower. */
  mode: EnergyMode;
  push: PushLevel;
}

export interface QualiRow {
  position: number;
  carId: string;
  /** Best time of the segment the car got furthest in. */
  time: number;
  q1: number;
  q2: number;
  q3: number;
  /** Tyre of the fastest Q3 lap (or the last segment the car reached). */
  bestTyre?: Compound | null;
  /** Fresh sets used in this qualifying, by compound. */
  setsUsed?: Partial<Record<Compound, number>>;
  out: 0 | 1 | 2;
  gridPenalty: number;
  note: string;
  dnq: boolean;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const mod = (a: number, n: number) => ((a % n) + n) % n;

export class QualiSim {
  readonly cfg: QualiConfig;
  readonly track: TrackModel;
  readonly rng: Rng;
  readonly cars: QCar[] = [];
  order: QCar[] = [];
  tick = 0;
  /** 1, 2 or 3. */
  segment = 1;
  phase: QSegmentPhase = "ready";
  /** Seconds left in the segment. */
  clock = 0;
  chequered = false;
  red = { active: false, untilTick: 0 };
  /** Kept for compatibility with the race view. */
  neutral = { active: false };
  bestSector: [number, number, number] = [Infinity, Infinity, Infinity];
  rubber = 0;
  readonly keepers: [number, number, number];
  /** Segment-level results, in finishing order, filled when each segment ends. */
  segmentOrder: string[][] = [[], [], []];
  private events: SimEvent[] = [];
  private byId = new Map<string, QCar>();
  private lists: Record<string, TyreSet[]> = {};
  private exitReadyTick = 0;
  private segLength = 0;
  private fastest = Infinity;
  /** The truth about the weather, or null when switched off. */
  weather: Weather | null = null;
  wx: WeatherNow | null = null;

  constructor(cfg: QualiConfig) {
    this.cfg = cfg;
    if (cfg.weather && cfg.weather.mode !== "off") {
      this.weather = makeWeather(cfg.weather, 5400);
      for (let k = 0; k < 3; k++) this.weather.wet[k] = targetWetness(this.weather.rainSector(k, 0));
      this.wx = this.weather.now();
    }
    this.track = cfg.track;
    this.rng = new Rng(cfg.seed ^ 0x51ed270b);
    const n = cfg.entries.length;
    if (n > 10) {
      const out1 = Math.floor((n - 10) / 2);
      const out2 = n - 10 - out1;
      this.keepers = [n - out1, n - out1 - out2, 10];
    } else {
      // a small test field: a quarter drops in each of Q1 and Q2, but never below two cars
      const cut = Math.floor(n / 4);
      const k1 = Math.max(Math.min(2, n), n - cut);
      const k2 = Math.max(Math.min(2, n), k1 - cut);
      this.keepers = [k1, k2, k2];
    }
    const teamIds = [...new Set(cfg.entries.map((e) => e.team.id))];
    for (const e of cfg.entries) {
      const boxOff = teamIds.indexOf(e.team.id) * BOX_SPACING;
      const car: QCar = {
        id: e.id,
        entry: e,
        phase: "garage",
        status: "pit_stop",
        s: this.track.boxS + boxOff,
        v: 0,
        lateral: GARAGE_LAT * this.track.pitSide,
        compound: "S",
        wear: 0,
        fresh: true,
        sets: { ...QUALI_SETS },
        setList: [],
        fuel: 0.1,
        soc: 1,
        runsDone: 0,
        flyingLeft: 0,
        lineCount: 0,
        lapStartTick: -1,
        sectorStartTick: 0,
        sectorIdx: 0,
        sectors: { last: [0, 0, 0], best: [Infinity, Infinity, Infinity], color: [0, 0, 0] },
        best: [Infinity, Infinity, Infinity],
        valid: [[], [], []],
        bestComp: [null, null, null],
        lastLap: 0,
        lastValid: true,
        lapValid: true,
        fault: null,
        lapNoise: 0,
        secNoise: [0, 0, 0],
        mistakeUntil: 0,
        trafficUntil: 0,
        eliminatedIn: 0,
        crashedOut: false,
        readyTick: 0,
        boxOff,
        auto: !e.human,
        plan: { first: 0, margin: 30, second: true },
        position: 0,
        pending: null,
        gridPenalty: 0,
        impeded: "",
        impedeSeen: new Set(),
        dnq: false,
        note: "",
        mode: "attack",
        push: 2,
      };
      const key = cfg.rules?.tyrePool ? e.team.id : e.id;
      this.lists[key] ??= cfg.tyreSetList?.[key] ? cloneSets(cfg.tyreSetList[key]) : makeSets({ S: QUALI_SETS.S, M: QUALI_SETS.M, H: QUALI_SETS.H }, { I: QUALI_SETS.I, W: QUALI_SETS.W });
      car.setList = this.lists[key];
      car.sets = freshCounts(car.setList);
      this.cars.push(car);
      this.byId.set(e.id, car);
    }
    this.order = [...this.cars];
    this.clock = (cfg.minutes ?? SEGMENT_MINUTES)[0] * 60;
    this.segLength = this.clock;
    this.rank();
  }

  car(id: string): QCar {
    return this.byId.get(id) as QCar;
  }

  get time(): number {
    return this.tick * DT;
  }

  get minutes(): [number, number, number] {
    return this.cfg.minutes ?? SEGMENT_MINUTES;
  }

  /** Cars still taking part in the current segment. */
  get active(): QCar[] {
    return this.cars.filter((c) => c.eliminatedIn === 0 || c.eliminatedIn >= this.segment);
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  private emit(kind: SimEventKind, carId: string | undefined, text: string) {
    this.events.push({ tick: this.tick, kind, carId, text });
  }

  // ------------------------------------------------------------------ session control

  startSegment() {
    if (this.phase !== "ready") return;
    this.phase = "running";
    this.chequered = false;
    this.red.active = false;
    this.fastest = Infinity;
    this.bestSector = [Infinity, Infinity, Infinity];
    this.segLength = this.minutes[this.segment - 1] * 60;
    this.clock = this.segLength;
    this.exitReadyTick = this.tick + 30;
    const urgency = this.segment === 3 ? 1 : this.segment === 2 ? 0.8 : 0.6;
    for (const c of this.cars) {
      c.runsDone = 0;
      c.valid[this.segment - 1] = [];
      c.pending = c.auto ? null : c.pending;
      c.crashedOut = false;
      c.sectors = { last: [0, 0, 0], best: [Infinity, Infinity, Infinity], color: [0, 0, 0] };
      if (c.phase === "crashed") this.parkInGarage(c);
      const top = this.cfg.entries.findIndex((e) => e.id === c.id) / this.cfg.entries.length; // 0 = front of the entry list
      c.plan = {
        first: this.rng.range(8, 70) * urgency * (this.segment === 1 ? 1 + 0.4 * (1 - top) : 1),
        margin: this.rng.range(8, 55),
        second: this.segment === 3 || this.rng.chance(0.7),
      };
      c.readyTick = this.tick + 20;
      const ro = this.cfg.rules?.releaseOrder;
      if (this.cfg.rules?.singleShot && ro) {
        // one at a time, in reverse points order, so track evolution decides who benefits
        const idx = ro.indexOf(c.id);
        c.plan.first = Math.max(0, idx) * (this.segLength / (ro.length + 3)) * 0.9;
        c.plan.second = false;
      }
    }
    this.emit("q_start", undefined, `Q${this.segment} is under way. ${this.minutes[this.segment - 1]} minutes on the clock.`);
  }

  /** Move from the break to the next segment. */
  nextSegment() {
    if (this.phase !== "break") return;
    for (const c of this.cars) if (c.phase !== "garage") this.parkInGarage(c);
    this.segment++;
    this.phase = "ready";
    this.clock = this.minutes[this.segment - 1] * 60;
  }

  command(cmd: QualiCommand) {
    const car = this.byId.get(cmd.carId);
    if (!car || car.eliminatedIn !== 0 && car.eliminatedIn < this.segment) return;
    if (cmd.type === "auto") {
      car.auto = cmd.auto ?? !car.auto;
      return;
    }
    if (cmd.type === "go") {
      if (car.phase !== "garage" || this.phase !== "running" || this.chequered || this.red.active) return;
      if (this.tick < car.readyTick) return;
      const asked = findSet(car.setList, cmd.setId);
      const compound = asked?.compound ?? cmd.compound ?? "S";
      const fresh = asked ? asked.runs === 0 : (cmd.fresh ?? true);
      if (!asked && fresh && car.sets[compound] <= 0) return;
      this.release(car, compound, fresh, cmd.laps ?? 1, asked?.id);
    } else if (cmd.type === "box") {
      if (car.phase === "push" && car.flyingLeft > 0) {
        car.flyingLeft = 0;
        car.lapValid = false;
        car.fault = null;
        car.phase = "in";
        this.emit("q_lap", car.id, `${car.entry.driver.code}: Abort, abort. Coming in.`);
      } else if (car.phase === "out") {
        car.flyingLeft = 0;
      }
    }
  }

  /** Write the wear on the car back onto the set that is on it. */
  private stow(car: QCar) {
    const set = findSet(car.setList, car.setId);
    if (set) set.wear = Math.max(set.wear, car.wear);
  }

  /** Fit a set. A named set is used as it is; otherwise a new set, or the one already on the car. */
  private fit(car: QCar, set: TyreSet) {
    this.stow(car);
    car.setId = set.id;
    car.wear = set.runs === 0 ? 0.01 : set.wear;
    set.runs++;
    const label = `Q${this.segment}`;
    if (set.log[set.log.length - 1] !== label) set.log.push(label);
    for (const c of this.cars) if (c.setList === car.setList) c.sets = freshCounts(c.setList);
  }

  /** What each human car's sets look like now. Call when qualifying is over. */
  finalSets(): Record<string, TyreSet[]> {
    for (const c of this.cars) this.stow(c);
    return Object.fromEntries(Object.entries(this.lists).map(([k, l]) => [k, cloneSets(l)]));
  }

  private release(car: QCar, compound: Compound, fresh: boolean, laps: 1 | 2, setId?: string) {
    const qr = this.cfg.rules;
    if (qr?.aggregate) laps = 2;
    if (qr?.singleShot) {
      if (car.runsDone >= 1 || car.shotUsed === this.segment) {
        if (car.entry.human) this.emit("q_lap", car.id, `${car.entry.driver.code}: One shot only. That was your run for this session.`);
        return;
      }
      laps = 1;
      car.shotUsed = this.segment;
    }
    const named = findSet(car.setList, setId);
    if (named) {
      if (named.id !== car.setId) this.fit(car, named);
    } else if (fresh) {
      const f = car.setList.find((x) => x.compound === compound && x.runs === 0);
      if (!f) return;
      this.fit(car, f);
    } else if (car.compound !== compound || !car.setId) {
      // switching compound (or nothing on the car yet) always means a fresh set
      const f = car.setList.find((x) => x.compound === compound && x.runs === 0) ?? bestSet(car.setList, compound);
      if (!f) return;
      this.fit(car, f);
    }
    car.compound = compound;
    car.fresh = fresh;
    car.flyingLeft = laps;
    car.lineCount = 0;
    car.phase = "queue";
    car.soc = 1;
    car.pending = null;
    car.status = "pit_out";
  }

  // ------------------------------------------------------------------ stepping

  step() {
    this.tick++;
    if (this.weather) {
      this.weather.step(DT);
      if (this.tick % 10 === 0) {
        this.wx = this.weather.now();
        for (const _ of this.weather.drainFlashes()) this.emit("lightning", undefined, "Lightning over the circuit.");
      }
    }
    if (this.phase === "running") {
      this.clock = Math.max(0, this.clock - DT);
      if (this.clock <= 0 && !this.chequered) {
        this.chequered = true;
        this.emit("q_chequered", undefined, `CHEQUERED FLAG. Q${this.segment} is over for anyone not already on a lap.`);
      }
      if (this.red.active && this.tick >= this.red.untilTick) this.resumeFromRed();
      if (this.tick % 10 === 0) for (const c of this.cars) this.think(c);
    }
    for (const c of this.cars) this.stepCar(c);
    this.rank();
    if (this.phase === "running" && this.chequered) this.checkSegmentEnd();
  }

  /** Cheap deterministic fingerprint, used to spot a desync between browsers in an online league. */
  hash(): string {
    let h = this.tick * 31 + this.segment;
    for (const c of this.cars) {
      h = (h * 33 + Math.round(c.s * 100)) % 1000003;
      h = (h * 33 + Math.round(c.v * 100)) % 1000003;
      h = (h * 33 + (isFinite(c.best[0]) ? Math.round(c.best[0] * 1000) : 7)) % 1000003;
      h = (h * 33 + c.runsDone) % 1000003;
    }
    return `${this.tick}:${this.phase}:${h}:${this.rng.state}`;
  }

  run(ticks: number) {
    for (let i = 0; i < ticks; i++) this.step();
  }

  private resumeFromRed() {
    this.red.active = false;
    this.exitReadyTick = this.tick + 30;
    this.emit("q_green", undefined, "Track clear. The session is RESUMED.");
    for (const c of this.cars) if (c.phase === "crashed") this.parkInGarage(c);
  }

  private parkInGarage(c: QCar) {
    c.phase = "garage";
    c.status = "pit_stop";
    c.s = this.track.boxS + c.boxOff;
    c.v = 0;
    c.lateral = GARAGE_LAT * this.track.pitSide;
    c.readyTick = this.tick + SERVICE_TICKS * 2;
    c.flyingLeft = 0;
  }

  private checkSegmentEnd() {
    if (this.red.active) {
      if (this.clock <= 0) {
        // not enough time left to restart
        this.red.active = false;
        for (const c of this.cars) if (c.phase === "crashed") this.parkInGarage(c);
      } else return;
    }
    // the segment only closes once every car is off the track: in laps and pit entries count as still running
    if (this.cars.some((c) => c.phase === "push" || c.phase === "queue" || c.phase === "out" || c.phase === "in" || c.phase === "entering")) return;
    this.finishSegment();
  }

  private finishSegment() {
    const seg = this.segment;
    this.rank();
    const inSegment = this.active;
    const sorted = [...inSegment].sort((a, b) => this.cmp(a, b, seg - 1));
    this.segmentOrder[seg - 1] = sorted.map((c) => c.id);
    if (seg === 1) {
      // 107% rule: measured against the fastest Q1 time
      const best = Math.min(...inSegment.map((c) => c.best[0]));
      for (const c of inSegment) {
        if (isFinite(c.best[0]) && c.best[0] > best * 1.07) {
          c.dnq = true;
          c.note = "107% rule";
          this.emit("q_eliminated", c.id, `${c.entry.driver.code} is outside the 107% limit and may not start unless the stewards allow it.`);
        }
      }
    }
    if (seg < 3) {
      const keep = this.keepers[seg - 1];
      const out = sorted.slice(keep);
      for (const c of out) c.eliminatedIn = seg as 1 | 2;
      this.emit(
        "q_eliminated",
        undefined,
        `Q${seg} over. Knocked out: ${out.map((c) => c.entry.driver.code).join(", ")}.`,
      );
      this.phase = "break";
    } else {
      this.phase = "done";
      this.emit("q_end", undefined, `Qualifying is over. ${this.entryName(sorted[0])} takes pole position with ${fmt(sorted[0].best[2])}.`);
    }
  }

  private entryName(c: QCar | undefined) {
    return c ? c.entry.driver.name : "";
  }

  private cmp(a: QCar, b: QCar, q: number): number {
    const ta = a.best[q];
    const tb = b.best[q];
    if (ta !== tb) return ta - tb;
    return a.entry.driver.number - b.entry.driver.number;
  }

  /** Live order for the current segment: those with times first. */
  private rank() {
    const q = this.segment - 1;
    const pool = this.cars;
    this.order = [...pool].sort((a, b) => {
      const ea = a.eliminatedIn !== 0 && a.eliminatedIn < this.segment ? 1 : 0;
      const eb = b.eliminatedIn !== 0 && b.eliminatedIn < this.segment ? 1 : 0;
      if (ea !== eb) return ea - eb;
      if (ea === 1) {
        // knocked out earlier: keep them ordered by the segment they left in
        if (a.eliminatedIn !== b.eliminatedIn) return (b.eliminatedIn as number) - (a.eliminatedIn as number);
        return this.cmp(a, b, (a.eliminatedIn as number) - 1);
      }
      return this.cmp(a, b, q);
    });
    this.order.forEach((c, i) => (c.position = i + 1));
  }

  /** Time needed from leaving the garage to crossing the line to start a flying lap, in seconds. */
  runTimeToLine(): number {
    const T = this.track;
    const avg = T.length / T.nominalLap;
    return (T.pitOut - T.boxS) / (PIT_LIMIT * 0.9) + (T.length - T.pitOut) / (avg * OUT_PACE) + 6;
  }

  // ------------------------------------------------------------------ AI

  private think(car: QCar) {
    if (car.eliminatedIn !== 0 && car.eliminatedIn < this.segment) return;
    if (!car.auto) return;
    if (car.phase !== "garage" || this.tick < car.readyTick) return;
    if (this.red.active || this.chequered) return;
    const q = this.segment - 1;
    const elapsed = this.segLength - this.clock;
    const need = this.runTimeToLine();
    const keepers = this.keepers[q] ?? 99;
    const rank = this.rankIn(car, q);
    let go = false;
    if (car.runsDone === 0) {
      go = elapsed >= car.plan.first;
      // a car with plenty of speed in hand waits for a clear track in Q1
    } else if (car.runsDone < 3) {
      const inDanger = !isFinite(car.best[q]) || (this.segment < 3 && rank > keepers - 2);
      const wants = this.segment === 3 ? car.plan.second || inDanger : inDanger || (car.plan.second && this.segment === 2 && rank > 5);
      if (wants) {
        const early = inDanger && this.clock > need + 330 && this.segment < 3; // time for a calm second attempt
        go = early || this.clock <= need + car.plan.margin + 12;
      }
    }
    if (!go) return;
    if (this.clock < need - 8) return; // too late to start a lap
    // choose tyres: soft in the dry, otherwise whatever this team's weather picture says is quickest
    const pick = this.aiCompound(car);
    const fresh = car.sets[pick] > 0;
    this.release(car, pick, fresh, 1);
  }

  /** The pit wall's read on whether wets are wanted (used for advice only). */
  wetNow(): boolean {
    return !!this.wx && this.wx.wetMean > 0.25;
  }

  /** Each team judges the wetness a little differently, so the field does not all switch at once. */
  private aiCompound(car: QCar): Compound {
    if (this.weather && this.wx) {
      const h = (car.entry.team.id.charCodeAt(0) * 7 + car.entry.team.id.length * 13) % 17;
      const bias = (h / 16 - 0.5) * 0.14;
      const trend = this.wx.rain > this.wx.wetMean ? 0.06 : -0.03;
      const seen = Math.max(0, this.wx.wetMean + bias + trend);
      const want = bestCompoundFor(seen, true);
      const dry: Compound[] = car.sets.S > 0 ? ["S"] : car.sets.M > 0 ? ["M"] : ["H"];
      const choices: Compound[] = want === "M" ? dry : [want, want === "I" ? "W" : "I"];
      for (const c of choices) if (car.sets[c] > 0 || car.compound === c) return c;
      return dry[0];
    }
    return car.sets.S > 0 ? "S" : car.sets.M > 0 ? "M" : "H";
  }

  private rankIn(car: QCar, q: number): number {
    const t = car.best[q];
    if (!isFinite(t)) return 99;
    let r = 1;
    for (const o of this.cars) if (o !== car && o.best[q] < t && (o.eliminatedIn === 0 || o.eliminatedIn >= this.segment)) r++;
    return r;
  }

  // ------------------------------------------------------------------ car physics

  private stepCar(car: QCar) {
    const T = this.track;
    const L = T.length;
    if (car.phase === "garage") {
      car.v = 0;
      car.status = "pit_stop";
      car.lateral += clamp(GARAGE_LAT * T.pitSide - car.lateral, -3 * DT, 3 * DT);
      return;
    }
    if (car.phase === "crashed") {
      car.v = Math.max(0, car.v - 22 * DT);
      car.s += car.v * DT;
      car.status = "dnf";
      car.lateral += clamp(13 - car.lateral, -6 * DT, 6 * DT);
      return;
    }

    const lapPos = mod(car.s, L);
    const tr = sampleTrack(T, car.s);
    const curvAbs = Math.abs(tr.curv);
    let target: number;
    let latTarget = 0;
    let brakeScale = 1;

    if (car.phase === "queue") {
      // pit lane: drive to the exit, wait for the light
      car.status = "pit_out";
      const stopS = T.pitOut - 3;
      const dist = stopS - car.s;
      // follow the car ahead in the lane
      let cap = PIT_LIMIT;
      for (const o of this.cars) {
        if (o === car || o.phase !== "queue") continue;
        const gap = o.s - car.s - CAR_LEN;
        if (gap > 0 && gap < 40) cap = Math.min(cap, o.v + (gap - 3) * 0.6);
      }
      const light = this.tick >= this.exitReadyTick && !this.red.active && !this.chequered;
      const vStop = Math.sqrt(2 * 6 * Math.max(0, dist));
      target = Math.min(cap, light ? PIT_LIMIT : vStop);
      if (dist <= 0.5 && light) {
        // released onto the track
        car.phase = "out";
        this.exitReadyTick = this.tick + EXIT_GAP_TICKS;
        car.status = "racing";
        car.lineCount = 0;
        car.mode = "harvest";
        car.push = 0;
      }
      latTarget = PIT_LAT * T.pitSide;
    } else if (car.phase === "entering") {
      car.status = "pit_in";
      const boxS = T.boxS + car.boxOff;
      const k = Math.floor((car.s - boxS) / L) + 1;
      const boxAbs = k * L + boxS;
      const dist = boxAbs - car.s;
      let cap: number;
      if (lapPos < L / 2) cap = PIT_LIMIT;
      else {
        const dLim = L - 110 - lapPos;
        cap = Math.sqrt(PIT_LIMIT * PIT_LIMIT + 2 * 40 * Math.max(0, dLim));
      }
      const vBox = Math.sqrt(2 * 7 * Math.max(0, dist));
      cap = Math.min(cap, Math.max(1.2, vBox));
      target = cap;
      latTarget = PIT_LAT * T.pitSide;
      if ((dist < 1.5 && car.v < 3) || dist < -0.5) {
        // arrived at the box
        car.runsDone++;
        car.wear += 0.02;
        this.parkInGarage(car);
        car.lateral = PIT_LAT * T.pitSide;
        return;
      }
    } else {
      // on the track: out, push, in
      car.status = "racing";
      const straight = tr.straight;
      if (this.red.active && car.phase !== "in") {
        // red flag: abandon the lap and head for the pits
        if (car.phase === "push") {
          car.lapValid = false;
          car.fault = null;
        }
        car.phase = "in";
        car.flyingLeft = 0;
      }
      let phaseF = 1;
      if (car.phase === "out") phaseF = OUT_PACE;
      else if (car.phase === "in") phaseF = IN_PACE;
      const pushL: PushLevel = car.phase === "push" ? 2 : 0;
      let dirty = 1;
      let tow = 1;
      if (car.phase === "push") {
        // nearest car ahead
        let best: QCar | null = null;
        let bestD = 60;
        for (const o of this.cars) {
          if (o === car || (o.phase !== "push" && o.phase !== "out" && o.phase !== "in")) continue;
          const d = mod(o.s - car.s, L);
          if (d > 1 && d < bestD) {
            bestD = d;
            best = o;
          }
        }
        if (best) {
          if (best.phase === "push") {
            if (straight) tow = 1 + 0.012 * (1 - bestD / 60);
            else dirty = 1 - 0.012 * (1 - bestD / 60);
          } else if (bestD < 40 && curvAbs > 0.003) {
            // caught a slower car in a corner: lift
            if (this.tick > car.trafficUntil) {
              car.trafficUntil = this.tick + 12;
              this.maybeImpede(car, best);
            }
          }
        }
      }
      let f = speedFactor(car.entry, { compound: car.compound, wear: car.wear }, car.fuel, pushL, curvAbs, dirty);
      let ers = 1;
      if (car.phase === "push") {
        ers = ersFactor("attack", car.soc, straight);
        const secIdx = Math.min(2, Math.floor(lapPos / (L / 3)));
        f *= (1 + this.rubber) * (1 + car.lapNoise) * (1 + car.secNoise[secIdx]) * tow;
        if (this.tick < car.mistakeUntil) f *= 0.93;
        if (this.tick < car.trafficUntil) f *= 0.9;
        // faults happen at a specific point on the lap
        const fault = car.fault;
        if (fault && car.lapStartTick >= 0) {
          const progress = lapPos;
          if (progress >= fault.s && progress < fault.s + 40) {
            car.fault = null;
            this.triggerFault(car, fault);
          }
        }
      }
      const wetNow = this.weather ? this.weather.wet[Math.min(2, Math.floor(lapPos / (L / 3)))] : 0;
      if (this.weather) {
        f *= wetSpeedFactor(car.compound, wetNow, car.entry.driver.wet ?? 0.5, Math.min(1, curvAbs / 0.006));
        brakeScale = wetBrakeFactor(car.compound, wetNow);
      }
      target = tr.speed * f * ers * phaseF;
      // cars on out and in laps keep out of the way of anyone on a flying lap
      latTarget = car.phase === "push" ? 0 : 5;
      if (this.red.active) target = Math.min(target, 40);
      // energy
      if (straight) car.soc -= (car.phase === "push" ? 0.0165 : car.phase === "out" ? -0.004 : -0.002) * DT;
      if (target < car.v - 1.2) car.soc += 0.009 * DT;
      car.soc = clamp(car.soc, 0, 1);
      // tyre wear
      const wf = this.weather ? wetWearFactor(car.compound, wetNow) : 1;
      if (car.phase === "push") car.wear += (0.14 / T.nominalLap) * DT * (0.6 + 0.8 * Math.min(1, curvAbs / 0.006)) * wf;
      else car.wear += (0.012 / T.nominalLap) * DT * wf;

      // line crossing and pit entry logic
      const crossed = Math.floor(car.s / L);
      if (crossed > car.lineCount) this.crossLine(car, crossed);
      if (car.phase === "in" && lapPos >= L - T.pitIn && lapPos <= L - 125) {
        car.phase = "entering";
      }
      if (car.phase === "out" && car.flyingLeft === 0 && lapPos >= L - T.pitIn && lapPos <= L - 125 && car.s > T.pitOut + 100) {
        // plan cancelled on the out lap: come straight back in
        car.phase = "entering";
      }
      // sectors
      if (car.phase === "push") {
        const sIdx = Math.floor(lapPos / (L / 3));
        if (car.lapStartTick >= 0 && sIdx === car.sectorIdx + 1) this.completeSector(car, car.sectorIdx);
      }
    }

    // integrate
    const acc = accelAt(car.v);
    const dv = clamp(target - car.v, -brakeAt(car.v) * brakeScale * DT, acc * DT);
    car.v = Math.max(0, car.v + dv);
    car.s += car.v * DT;
    car.lateral += clamp(latTarget - car.lateral, -9 * DT, 9 * DT);
  }

  private crossLine(car: QCar, crossed: number) {
    car.lineCount = crossed;
    const L = this.track.length;
    const crossTick = this.tick - (car.s - crossed * L) / Math.max(car.v * DT, 0.001);
    if (car.phase === "out") {
      // start of a flying lap, if the flag has not fallen
      if (car.flyingLeft > 0 && !this.chequered && !this.red.active && this.phase === "running") this.startPushLap(car, crossTick);
      else {
        car.phase = "in";
        car.flyingLeft = 0;
        if (this.chequered) this.emit("q_lap", car.id, `${car.entry.driver.code} is too late to start a lap. Coming in.`);
      }
    } else if (car.phase === "push") {
      this.completePushLap(car, crossTick);
    }
  }

  private startPushLap(car: QCar, crossTick: number) {
    const T = this.track;
    car.phase = "push";
    car.mode = "attack";
    car.push = 2;
    car.lapStartTick = crossTick;
    car.sectorStartTick = crossTick;
    car.sectorIdx = 0;
    car.lapValid = true;
    car.fault = null;
    car.impedeSeen.clear();
    const d = car.entry.driver;
    car.lapNoise = this.rng.gauss() * (0.001 + 0.0016 * (1 - d.consistency));
    car.secNoise = [this.rng.gauss() * 0.0007, this.rng.gauss() * 0.0007, this.rng.gauss() * 0.0007];
    // a good out lap matters: cold or overworked tyres cost time
    if (car.fresh && car.wear < 0.03) car.lapNoise -= 0.0004;
    if (!this.cfg.clean) {
      const risk = T.def.risk ?? 1;
      const push = 1;
      const pCrash = (0.0006 + 0.005 * (1 - d.consistency)) * risk * push;
      const pLimits = 0.012 + 0.07 * (1 - d.consistency) * (0.6 + d.aggression);
      const pMistake = 0.03 + 0.12 * (1 - d.consistency);
      const r = this.rng.next();
      const corners = T.corners;
      const pick = () => (corners.length ? corners[Math.floor(this.rng.next() * corners.length) % corners.length] : { s: T.length * 0.5, n: 1 });
      if (r < pCrash) {
        const c = pick();
        car.fault = { s: c.s - 20, kind: "crash", turn: c.n };
      } else if (r < pCrash + pLimits) {
        const c = pick();
        car.fault = { s: c.s - 10, kind: "limits", turn: c.n };
      } else if (r < pCrash + pLimits + pMistake) {
        const c = pick();
        car.fault = { s: c.s - 30, kind: "mistake", turn: c.n };
      }
    }
    car.fault = car.fault && car.fault.s < 0 ? { ...car.fault, s: 5 } : car.fault;
  }

  private triggerFault(car: QCar, f: NonNullable<QCar["fault"]>) {
    const code = car.entry.driver.code;
    if (f.kind === "mistake") {
      car.mistakeUntil = this.tick + 16;
      this.emit("q_mistake", car.id, `${code}: Locked up into Turn ${f.turn}. That cost me time.`);
    } else if (f.kind === "limits") {
      car.lapValid = false;
      this.emit("q_deleted", car.id, `TRACK LIMITS: ${code} runs wide at Turn ${f.turn}. Lap time will be deleted.`);
    } else {
      // crash: red flag
      car.phase = "crashed";
      car.status = "dnf";
      car.lapValid = false;
      car.crashedOut = true;
      car.flyingLeft = 0;
      this.emit("q_red", car.id, `${code} crashes at Turn ${f.turn}! RED FLAG. The session is suspended.`);
      if (!this.red.active) {
        this.red.active = true;
        this.red.untilTick = this.tick + Math.round((180 + this.rng.range(0, 240)) / DT);
      }
    }
  }

  private maybeImpede(fast: QCar, slow: QCar) {
    if (this.cfg.clean) return;
    // the slower driver is obliged to let the flying car through
    const key = `${fast.id}>${slow.id}`;
    if (fast.impedeSeen.has(key)) return;
    fast.impedeSeen.add(key);
    const p = 0.01 + 0.04 * (1 - slow.entry.driver.consistency);
    if (!this.rng.chance(p)) return;
    fast.trafficUntil = this.tick + 20;
    this.emit("q_impede", slow.id, `Under investigation: ${slow.entry.driver.code} impeding ${fast.entry.driver.code} at Turn ${this.nearestTurn(slow)}.`);
    if (this.rng.chance(0.3)) {
      slow.gridPenalty += 3;
      slow.note = "Impeding: -3 places";
      this.emit("q_impede", slow.id, `PENALTY ${slow.entry.driver.code}: 3 place grid penalty for impeding ${fast.entry.driver.code}.`);
    } else {
      this.emit("q_impede", slow.id, `Stewards: ${slow.entry.driver.code} receives a reprimand for impeding.`);
    }
  }

  private nearestTurn(car: QCar): number {
    const cs = this.track.corners;
    if (!cs.length) return 1;
    const pos = mod(car.s, this.track.length);
    let best = cs[0];
    for (const c of cs) if (Math.abs(c.s - pos) < Math.abs(best.s - pos)) best = c;
    return best.n;
  }

  private completeSector(car: QCar, idx: number) {
    const t = (this.tick - car.sectorStartTick) * DT;
    car.sectors.last[idx] = t;
    let col = 1;
    if (car.lapValid) {
      if (t < this.bestSector[idx]) {
        this.bestSector[idx] = t;
        col = 3;
      } else if (t < car.sectors.best[idx]) col = 2;
      if (t < car.sectors.best[idx]) car.sectors.best[idx] = t;
    } else col = 0;
    car.sectors.color[idx] = col;
    car.sectorStartTick = this.tick;
    car.sectorIdx = idx + 1;
  }

  private completePushLap(car: QCar, crossTick: number) {
    const lapTime = (crossTick - car.lapStartTick) * DT;
    // sector 3
    const t3 = (crossTick - car.sectorStartTick) * DT;
    car.sectors.last[2] = t3;
    let col = 1;
    if (car.lapValid) {
      if (t3 < this.bestSector[2]) {
        this.bestSector[2] = t3;
        col = 3;
      } else if (t3 < car.sectors.best[2]) col = 2;
      if (t3 < car.sectors.best[2]) car.sectors.best[2] = t3;
    } else col = 0;
    car.sectors.color[2] = col;
    car.sectorIdx = 0;
    car.sectorStartTick = crossTick;
    car.lapStartTick = crossTick;
    car.lastLap = lapTime;
    car.lastValid = car.lapValid;
    car.flyingLeft--;
    this.rubber = Math.min(0.005, this.rubber + 0.00004);
    const q = this.segment - 1;
    const code = car.entry.driver.code;
    if (car.lapValid) {
      let improved = lapTime < car.best[q];
      if (this.cfg.rules?.aggregate) {
        const v = car.valid[q];
        v.push(lapTime);
        v.sort((a, b) => a - b);
        const agg = v.length >= 2 ? (v[0] + v[1]) / 2 : v[0] * 1.015; // a missing second lap is costly
        improved = agg < car.best[q];
        if (improved) { car.best[q] = agg; car.bestComp[q] = car.compound; }
      } else if (improved) {
        car.best[q] = lapTime;
        car.bestComp[q] = car.compound;
      }
      this.rank();
      const pos = this.rankIn(car, q);
      if (lapTime < this.fastest) {
        this.fastest = lapTime;
        this.emit("q_purple", car.id, `${code} goes P${pos} with ${fmt(lapTime)}${pos === 1 ? ", provisional pole" : ""}.`);
      } else this.emit("q_lap", car.id, `${code} ${fmt(lapTime)} for P${pos}${improved ? "" : " (not an improvement)"}.`);
    } else {
      this.emit("q_deleted", car.id, `${code}: lap time ${fmt(lapTime)} DELETED.`);
    }
    // another flying lap, or back to the garage
    if (car.flyingLeft > 0 && !this.chequered && !this.red.active) {
      car.lapValid = true;
      car.fault = null;
      car.lapNoise = this.rng.gauss() * (0.001 + 0.0016 * (1 - car.entry.driver.consistency));
      car.secNoise = [this.rng.gauss() * 0.0007, this.rng.gauss() * 0.0007, this.rng.gauss() * 0.0007];
    } else {
      car.phase = "in";
      car.flyingLeft = 0;
    }
  }

  // ------------------------------------------------------------------ results

  /** Provisional or final grid. Cars without a time are placed behind those with one. */
  results(): QualiRow[] {
    const all = this.cars;
    const rowFor = (c: QCar): QualiRow => ({
      position: 0,
      carId: c.id,
      time: Infinity,
      q1: c.best[0],
      q2: c.best[1],
      q3: c.best[2],
      out: c.eliminatedIn === 0 ? (this.phase === "done" ? 0 : 0) : c.eliminatedIn,
      gridPenalty: c.gridPenalty,
      note: c.note,
      dnq: c.dnq,
    });
    const rows = all.map(rowFor);
    const byId = new Map(rows.map((r) => [r.carId, r]));
    const seg = (c: QCar) => (c.eliminatedIn === 0 ? (this.phase === "done" || this.segment === 3 ? 2 : this.segment - 1) : c.eliminatedIn - 1);
    // grid rank: further segment first, then time in that segment
    const sorted = [...all].sort((a, b) => {
      const sa = seg(a);
      const sb = seg(b);
      if (a.dnq !== b.dnq) return a.dnq ? 1 : -1;
      if (sa !== sb) return sb - sa;
      const ta = a.best[sa];
      const tb = b.best[sb];
      if (ta !== tb) return ta - tb;
      return a.entry.driver.number - b.entry.driver.number;
    });
    // apply grid penalties (move back that many places), keeping everything else in order
    const grid = [...sorted];
    for (const c of sorted) {
      if (c.gridPenalty <= 0) continue;
      const i = grid.indexOf(c);
      grid.splice(i, 1);
      grid.splice(Math.min(grid.length, i + c.gridPenalty), 0, c);
    }
    grid.forEach((c, i) => {
      const r = byId.get(c.id) as QualiRow;
      r.position = i + 1;
      r.time = c.best[seg(c)];
      r.bestTyre = c.bestComp[seg(c)];
      const usedOf = (k: Compound) => c.setList.filter((x) => x.compound === k && x.runs > 0).length;
      r.setsUsed = { S: usedOf("S"), M: usedOf("M"), H: usedOf("H") };
    });
    return grid.map((c) => byId.get(c.id) as QualiRow);
  }
}

function fmt(t: number): string {
  if (!isFinite(t)) return "--:--.---";
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, "0")}`;
}

/** Fast, non-interactive qualifying: runs all three segments with the AI in charge. Used for tests and quick weekends. */
export function runQualifying(cfg: QualiConfig): { rows: QualiRow[]; sim: QualiSim } {
  const sim = new QualiSim(cfg);
  // a skipped session hands every car, including the player's, to the team's own run plan
  for (const c of sim.cars) c.auto = true;
  for (let q = 0; q < 3; q++) {
    sim.startSegment();
    let guard = 0;
    while (sim.phase === "running" && guard++ < 200000) sim.step();
    if (sim.phase === "break") sim.nextSegment();
  }
  return { rows: sim.results(), sim };
}
