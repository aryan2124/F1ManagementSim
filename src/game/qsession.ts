import { QualiSim, type QualiConfig } from "../sim/qualifying";
import { LiveSession } from "./live";

/** A qualifying session. Time only runs while a segment is under way. */
export class QualiSession extends LiveSession<QualiSim> {
  readonly sim: QualiSim;

  constructor(cfg: QualiConfig, humanIds: string[]) {
    super(humanIds, humanIds[0] ?? cfg.entries[0].id);
    this.sim = new QualiSim(cfg);
    this.init();
  }

  get running(): boolean {
    return this.sim.phase === "running";
  }

  startSegment() {
    this.sim.startSegment();
    this.pushEvents();
  }

  nextSegment() {
    this.sim.nextSegment();
    this.pushEvents();
  }

  /** Run the rest of qualifying at once. Used when all of the player's cars are out and they do not want to watch. */
  skipToEnd() {
    this.speed = 32;
    let guard = 0;
    while (this.sim.phase !== "done" && guard++ < 400000) {
      if (this.sim.phase === "ready") this.sim.startSegment();
      else if (this.sim.phase === "break") this.sim.nextSegment();
      this.snapshotPrev();
      this.sim.step();
    }
    this.pushEvents();
    this.alpha = 1;
  }

  /** The session sim's own events (flags, deleted laps) are all interesting. */
  advance(realSeconds: number): number {
    const n = super.advance(realSeconds);
    return n;
  }
}
