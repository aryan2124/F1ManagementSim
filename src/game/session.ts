import { RaceSim } from "../sim/engine";
import type { RaceConfig, SimEvent } from "../sim/types";
import { LiveSession } from "./live";

export type { LogLine, SpeedSetting } from "./live";

/** A race: waits on the grid until the player starts the lights, which always play at real time. */
export class RaceSession extends LiveSession<RaceSim> {
  readonly sim: RaceSim;
  /** The race waits on the grid until the player starts the lights. */
  started = false;
  /** Cars that do donuts after the flag (the champion, drivers who are retiring). Set by the screen when the race ends. */
  donutIds: string[] = [];
  /** When the donuts began (ms, 0 = not yet), how long they last, and whether the screen has already decided who does them. */
  celebrateFrom = 0;
  celebrateMs = 0;
  celebrateDecided = false;
  /** True while the donuts are on. */
  get celebrating(): boolean {
    return this.celebrateFrom > 0 && performance.now() - this.celebrateFrom < this.celebrateMs;
  }

  constructor(cfg: RaceConfig, humanIds: string[]) {
    super(humanIds, humanIds[0] ?? cfg.entries[0].id);
    this.sim = new RaceSim(cfg);
    this.init();
  }

  get running(): boolean {
    return this.started && !this.finished;
  }

  protected effectiveSpeed(): number {
    // the start-light sequence always plays at real time so it feels like a start
    return this.sim.phase === "grid" ? 1 : this.speed;
  }

  protected loggable(e: SimEvent, human: boolean): boolean {
    return e.kind !== "lap" || human;
  }

  start() {
    this.started = true;
  }

  /** Run the rest of the race at once. Used when all of the player's cars are out and they do not want to watch. */
  skipToEnd() {
    this.speed = 32;
    this.started = true;
    let guard = 0;
    while (this.sim.phase !== "finished" && guard++ < 400000) {
      this.snapshotPrev();
      this.sim.step();
    }
    this.pushEvents();
    this.alpha = 1;
  }

  /** Run the clock on through a red flag until the cars are lining up on the grid again. Not available online (the server owns the clock). */
  skipRedFlag() {
    if (!this.sim.inc.red.active) return;
    let guard = 0;
    while (this.sim.inc.red.active && this.sim.phase !== "finished" && guard++ < 60000) {
      this.snapshotPrev();
      this.sim.step();
    }
    this.pushEvents();
    this.alpha = 1;
  }

  /** Can the player jump over the red flag right now? */
  get canSkipRed(): boolean {
    return this.sim.inc.red.active && this.sim.phase !== "finished";
  }

  get finished(): boolean {
    return this.sim.phase === "finished";
  }
}
