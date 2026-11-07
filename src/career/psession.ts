import { QualiSession } from "../game/qsession";
import { practiceEntries, planPractice, practiceRun, finishPracticeSession } from "./weekend";
import { requestFit, suggestedFit } from "./fitting";
import { carOf } from "./treeplay";
import type { CareerState, Programme } from "./types";

/**
 * A practice session on the qualifying sim. One clock (about an hour), the cars go out when the player says so, and
 * each completed run feeds the engineers: the setup picture, tyre and race knowledge, and the stopwatch reading of
 * every part on that car. Changing the car in the garage costs session minutes (the car is held in the garage).
 */
export class PracticeController {
  readonly session: QualiSession;
  readonly humanIds: string[];
  readonly gp: string;
  readonly index: number;
  programme: Record<string, Programme> = {};
  /** What the engineers said after each finished run, newest first. */
  log: string[] = [];
  private seen = new Map<string, number>();
  private done = false;

  constructor(readonly s: CareerState) {
    const plan = planPractice(s);
    this.humanIds = plan.humanIds;
    this.gp = plan.gp;
    this.index = plan.session;
    this.session = new QualiSession(plan.cfg, plan.humanIds);
    this.session.speed = 8;
    for (const id of this.humanIds) {
      this.programme[id] = "setup";
      this.seen.set(id, 0);
    }
  }

  get sim() {
    return this.session.sim;
  }

  start() {
    if (this.sim.phase === "ready") this.session.startSegment();
  }

  /** The session is over when the chequered flag has fallen and the cars are in. */
  get over(): boolean {
    return this.sim.phase === "break" || this.sim.phase === "done";
  }

  /** Call every so often: turns finished runs into learning. Returns the new lines. */
  poll(): string[] {
    const out: string[] = [];
    const ws = this.s.weekend;
    if (!ws || ws.stage !== "practice") return out;
    for (const id of this.humanIds) {
      const car = this.sim.car(id);
      const n = this.seen.get(id) ?? 0;
      if (car.runsDone <= n) continue;
      this.seen.set(id, car.runsDone);
      const lines = practiceRun(this.s, this.programme[id] ?? "setup", ws.setup, id, { live: true, fresh: car.fresh, worn: car.wear });
      out.push(...lines);
    }
    if (out.length) this.log.unshift(...out);
    this.log = this.log.slice(0, 24);
    return out;
  }

  /** Put the current state of the parts on the cars into the sim, as if the mechanics had just finished. */
  refresh() {
    const fresh = practiceEntries(this.s);
    for (const e of fresh) {
      if (!e.human) continue;
      const car = this.sim.car(e.id);
      car.entry = { ...car.entry, team: e.team };
    }
  }

  /** Change a part on a car in the garage. The car must be in the garage, and it stays there for the minutes the job takes. */
  fit(id: string, car: "A" | "B", on: boolean, rush = false): { ok: boolean; message: string } {
    const t = this.s.teams[this.s.teamId];
    const driverId = this.humanIds.find((h) => carOf(this.s, t.id, h) === car);
    const q = driverId ? this.sim.car(driverId) : null;
    if (q && q.phase !== "garage") return { ok: false, message: `Car ${car} is out on the track. Bring it in first.` };
    const before = this.s.weekend?.fitMin ?? 0;
    const r = requestFit(this.s, t, id, car, on, rush);
    if (!r.ok) return r;
    const minutes = (this.s.weekend?.fitMin ?? 0) - before;
    this.refresh();
    if (q && minutes > 0) q.readyTick = Math.max(q.readyTick, this.sim.tick + Math.round((minutes * 60) / 0.1));
    return r;
  }

  /** Move the setup sliders mid-session: both cars must be in the garage and stay there for a few minutes. */
  static SETUP_MIN = 3;
  changeSetup(setup: Record<string, number>): { ok: boolean; message: string } {
    const ws = this.s.weekend;
    if (!ws || ws.stage !== "practice") return { ok: false, message: "No session." };
    const cars = this.humanIds.map((h) => this.sim.car(h));
    if (cars.some((c) => c.phase !== "garage")) return { ok: false, message: "Both cars must be in the garage to change the setup." };
    ws.setup = { ...setup };
    ws.fitMin = (ws.fitMin ?? 0) + PracticeController.SETUP_MIN;
    for (const c of cars) c.readyTick = Math.max(c.readyTick, this.sim.tick + Math.round((PracticeController.SETUP_MIN * 60) / 0.1));
    return { ok: true, message: `Setup saved. ${PracticeController.SETUP_MIN} minutes of the session.` };
  }

  /** The staff's best set for this track on every car that is in the garage, change by change. */
  suggested(rush = false): { n: number; message: string } {
    const ws = this.s.weekend;
    const t = this.s.teams[this.s.teamId];
    if (!ws) return { n: 0, message: "No session." };
    let n = 0;
    let last = "";
    for (const h of this.humanIds) {
      const car = carOf(this.s, t.id, h);
      for (const c of suggestedFit(this.s, t, car, ws.circuitId)) {
        const r = this.fit(c.id, car, c.on, rush);
        if (r.ok) n++; else { last = r.message; break; }
      }
    }
    return { n, message: n ? `${n} change${n > 1 ? "s" : ""} made.` : last || "Both cars already match the staff's best set." };
  }

  /** Close the session: any last run counts, the sets go back, the next session comes up. */
  finish() {
    if (this.done) return;
    this.done = true;
    this.poll();
    finishPracticeSession(this.s, this.sim.finalSets());
  }
}
