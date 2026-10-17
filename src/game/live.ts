import { DT } from "../sim/engine";
import type { TrackModel } from "../sim/track";
import type { CarStatus, EntrySpec, RadioChannel, RadioTruth, SimEvent } from "../sim/types";
import type { Weather } from "../sim/weather";

/** The least a simulation must expose for the pixel view to draw it. */
export interface LiveCar {
  id: string;
  entry: EntrySpec;
  s: number;
  v: number;
  lateral: number;
  status: CarStatus;
  /** Race only: visual spin, removed from the track, damage and incident in progress. */
  spin?: number;
  removed?: boolean;
  damage?: { aero: number; floor: number; flat: number; puncture: boolean };
  incident?: unknown;
}

export interface LiveSim {
  track: TrackModel;
  cars: LiveCar[];
  order: LiveCar[];
  neutral: { active: boolean; kind?: string };
  sc?: { vis: boolean; s: number; lat: number };
  tick: number;
  car(id: string): LiveCar;
  /** The truth about the weather, when the session has any. */
  weather?: Weather | null;
  step(): void;
  drainEvents(): SimEvent[];
}

export type SpeedSetting = 0 | 1 | 2 | 4 | 8 | 16 | 32;
export const SPEEDS: SpeedSetting[] = [0, 1, 2, 4, 8, 16, 32];

export interface LogLine {
  id: number;
  tick: number;
  kind: SimEvent["kind"];
  text: string;
  carId?: string;
  human: boolean;
  channel?: RadioChannel;
  truth?: RadioTruth;
  team?: string;
  /** Prompt id when the line is a driver question awaiting an answer. */
  promptId?: number;
}

/** Real-time pacing, smooth interpolation, pause/speed and an event log, shared by races and qualifying. */
export abstract class LiveSession<S extends LiveSim> {
  abstract readonly sim: S;
  readonly humanIds: string[];
  speed: SpeedSetting = 4;
  /** True while the race director picks the camera. Choosing a car by hand switches it off. */
  directing = false;
  /** What the director is showing and why, for the caption on screen. */
  cameraNote = "";
  private follow: string;
  log: LogLine[] = [];
  alpha = 0;
  /** What the player's drivers last felt in each sector (a noisy read of the truth) and when. */
  reports: { w: [number, number, number]; at: [number, number, number] } = { w: [0, 0, 0], at: [-1, -1, -1] };
  private acc = 0;
  private nextLogId = 1;
  private prev = new Map<string, { s: number; lateral: number }>();
  private listeners = new Set<(e: SimEvent) => void>();

  protected constructor(humanIds: string[], followId: string) {
    this.humanIds = humanIds;
    this.follow = followId;
  }

  get followId(): string {
    return this.follow;
  }
  /** Picking a car by hand takes the camera back from the director. */
  set followId(id: string) {
    this.follow = id;
    this.directing = false;
  }
  /** The director's own cut: changes the camera without switching the director off. */
  cutTo(id: string) {
    this.follow = id;
  }

  /** True while simulated time should advance. */
  abstract get running(): boolean;
  /** Speed multiplier to apply right now. */
  protected effectiveSpeed(): number {
    return this.speed;
  }
  /** Whether a given event should appear in the radio feed. */
  protected loggable(_e: SimEvent, _human: boolean): boolean {
    return true;
  }

  onEvent(cb: (e: SimEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  protected snapshotPrev() {
    for (const c of this.sim.cars) this.prev.set(c.id, { s: c.s, lateral: c.lateral });
  }

  protected pushEvents() {
    for (const e of this.sim.drainEvents()) {
      const car = e.carId ? this.sim.car(e.carId) : undefined;
      const human = car ? car.entry.human : false;
      if (this.loggable(e, human)) {
        this.log.push({ id: this.nextLogId++, tick: e.tick, kind: e.kind, text: e.text, carId: e.carId, human, channel: e.channel, truth: e.truth, team: e.team });
        if (this.log.length > 300) this.log.shift();
      }
      for (const l of this.listeners) l(e);
    }
  }

  protected init() {
    this.snapshotPrev();
    this.pushEvents();
  }

  /** Advance by real seconds. Returns number of sim steps taken. */
  advance(realSeconds: number): number {
    if (!this.running || this.speed === 0) return 0;
    this.acc += Math.min(realSeconds, 0.25) * this.effectiveSpeed();
    let steps = 0;
    while (this.acc >= DT && steps < 160 && this.running) {
      this.snapshotPrev();
      this.sim.step();
      this.pushEvents();
      this.acc -= DT;
      steps++;
    }
    this.alpha = this.running ? Math.min(1, this.acc / DT) : 1;
    if (steps > 0) this.observe();
    return steps;
  }

  /** Drivers report the surface under them. Only the sector a player's car is in right now is learned. */
  protected observe() {
    const wx = this.sim.weather;
    if (!wx) return;
    const L = this.sim.track.length;
    for (const id of this.humanIds) {
      const c = this.sim.car(id);
      if (c.status === "dnf" || c.v < 5) continue;
      const lap = ((c.s % L) + L) % L;
      const k = Math.min(2, Math.floor(lap / (L / 3)));
      const skill = c.entry.driver.wet ?? 0.5;
      const noise = (Math.random() - 0.5) * 0.1 * (1.3 - skill);
      this.reports.w[k] = Math.max(0, Math.min(1, wx.wet[k] + noise));
      this.reports.at[k] = this.sim.tick;
    }
  }

  /** Smoothly interpolated distance + lateral offset for rendering. */
  interp(car: LiveCar): { s: number; lateral: number } {
    const p = this.prev.get(car.id);
    if (!p) return { s: car.s, lateral: car.lateral };
    // never interpolate across a teleport (a car returning to its garage resets its distance)
    if (Math.abs(car.s - p.s) > 60) return { s: car.s, lateral: car.lateral };
    const a = this.alpha;
    return { s: p.s + (car.s - p.s) * a, lateral: p.lateral + (car.lateral - p.lateral) * a };
  }
}
