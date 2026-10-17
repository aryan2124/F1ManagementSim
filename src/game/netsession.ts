import type { LockstepSim, StampedCommand } from "../shared/careerNet";
import { QualiSession } from "./qsession";
import { RaceSession } from "./session";
import type { QualiConfig } from "../sim/qualifying";
import type { Command, RaceConfig } from "../sim/types";
import { extrasFromRows } from "../career/weekend";

/** What a networked session needs from the room connection. */
export interface NetLink {
  cmd(c: unknown): boolean;
  speed(n: number): boolean;
  run(sim: LockstepSim, maxSteps?: number): number;
  finish(results: unknown): boolean;
}

/** Ticks the race waits on the grid so everyone can choose a starting tyre (60 s at speed 1). */
export const GRID_HOLD = 600;
const BREAK_TICKS = 200;

/**
 * The race in an online league. Every browser runs the same sim; the server orders the commands and
 * paces the clock. Pit calls and the rest go through the server instead of straight into the sim.
 */
export class NetRaceSession extends RaceSession {
  /** Ticks spent waiting on the grid before the sim itself starts (tyre choice). */
  held = 0;
  readonly hold: number;
  private sentSpeed = 1;
  private lastStepAt = 0;
  private reported = false;
  private readonly link: NetLink;
  private readonly applyLocal: (cmd: Command) => void;
  private readonly ls: LockstepSim;

  constructor(cfg: RaceConfig, humanIds: string[], link: NetLink, private readonly resultIds: string[] = humanIds, hold = GRID_HOLD) {
    super(cfg, humanIds);
    this.link = link;
    this.hold = hold;
    this.started = true;
    this.speed = 1;
    const sim = this.sim;
    const orig = sim.command.bind(sim) as (c: Command) => void;
    this.applyLocal = orig;
    (sim as { command: (c: Command) => void }).command = (c: Command) => {
      link.cmd(c);
    };
    this.ls = {
      tick: () => (this.held < this.hold ? this.held : this.hold + sim.tick),
      step: () => {
        if (this.held < this.hold) {
          this.held++;
          return;
        }
        this.snapshotPrev();
        sim.step();
        this.pushEvents();
      },
      apply: (c: StampedCommand) => this.applyLocal(c.cmd as Command),
      hash: () => `${this.held}:${sim.hash()}`,
    };
  }

  skipRedFlag() {
    // online the server owns the clock: use the 32x speed instead
  }

  get canSkipRed(): boolean {
    return false;
  }

  /** Seconds of grid time left before the lights sequence begins. */
  get holdLeft(): number {
    return Math.max(0, (this.hold - this.held) / 10);
  }

  advance(_realSeconds: number): number {
    if (this.finished) {
      this.report();
      this.alpha = 1;
      return 0;
    }
    const want = Math.max(0, Math.min(32, this.speed));
    if (want !== this.sentSpeed) {
      this.sentSpeed = want;
      this.link.speed(want);
    }
    const n = this.link.run(this.ls, 200);
    if (n > 0) {
      this.lastStepAt = performance.now();
      this.observe();
    }
    this.alpha = Math.min(1, ((performance.now() - this.lastStepAt) / 1000) * 10 * Math.max(1, want));
    return n;
  }

  private report() {
    if (this.reported) return;
    this.reported = true;
    const rows = this.sim.results();
    const points: Record<string, number> = {};
    for (const r of rows) points[r.carId] = r.points;
    const moods: Record<string, { morale: number; trust: number; grievance: number; strat?: number }> = {};
    for (const id of this.resultIds) {
      const m = this.sim.radio?.moods.get(id);
      if (m) moods[id] = { morale: m.morale, trust: m.trust, grievance: m.grievance, strat: m.strat };
    }
    this.link.finish({ order: rows.map((r) => r.carId), points, dnf: rows.filter((r) => r.dnf).map((r) => r.carId), moods });
  }
}

/** Qualifying in an online league. The segments start and roll on by themselves so the clocks stay in step. */
export class NetQualiSession extends QualiSession {
  private sentSpeed = 1;
  private lastStepAt = 0;
  private breakAt = -1;
  private reported = false;
  private readonly link: NetLink;
  private readonly applyLocal: (cmd: never) => void;
  private readonly ls: LockstepSim;
  readonly net = true;

  constructor(cfg: QualiConfig, humanIds: string[], link: NetLink, private readonly resultIds: string[] = humanIds) {
    super(cfg, humanIds);
    this.link = link;
    this.speed = 1;
    const sim = this.sim;
    this.applyLocal = sim.command.bind(sim) as (cmd: never) => void;
    (sim as { command: (c: unknown) => void }).command = (c: unknown) => {
      link.cmd(c);
    };
    this.ls = {
      tick: () => (sim.phase === "done" ? Number.MAX_SAFE_INTEGER : sim.tick),
      step: () => {
        if (sim.phase === "ready") sim.startSegment();
        else if (sim.phase === "break") {
          if (this.breakAt < 0) this.breakAt = sim.tick;
          if (sim.tick - this.breakAt >= BREAK_TICKS) {
            this.breakAt = -1;
            sim.nextSegment();
          }
        }
        this.snapshotPrev();
        sim.step();
        this.pushEvents();
      },
      apply: (c: StampedCommand) => this.applyLocal(c.cmd as never),
      hash: () => sim.hash(),
    };
  }

  startSegment() {
    /* the league starts every segment together */
  }
  nextSegment() {
    /* and moves on together */
  }

  advance(_realSeconds: number): number {
    if (this.sim.phase === "done") {
      this.report();
      this.alpha = 1;
      return 0;
    }
    const want = Math.max(0, Math.min(32, this.speed));
    if (want !== this.sentSpeed) {
      this.sentSpeed = want;
      this.link.speed(want);
    }
    const n = this.link.run(this.ls, 200);
    if (n > 0) {
      this.lastStepAt = performance.now();
      this.observe();
    }
    this.alpha = Math.min(1, ((performance.now() - this.lastStepAt) / 1000) * 10 * Math.max(1, want));
    return n;
  }

  private report() {
    if (this.reported) return;
    this.reported = true;
    const rows = this.sim.results();
    const ex = extrasFromRows(rows, this.resultIds);
    this.link.finish({ order: rows.map((r) => r.carId), locks: ex.locks, used: ex.used });
  }
}
