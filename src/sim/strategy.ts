import type { RaceSim } from "./engine";
import { COMPOUNDS } from "./engine";
import { makeProfile, TeamRadar } from "./radar";
import type { CarState, Compound } from "./types";
import { isWetCompound } from "./types";
import { bestCompoundFor } from "./weather";

/**
 * The pit wall of every AI team.
 *
 * Each team has a character (how skilled, how bold, what it likes to do) and its own weather
 * radar. Every lap and every sector the wall looks at its cars and decides: stay out, pit on plan,
 * undercut the car ahead, cover the car behind, react to the weather, or gamble.
 *
 * The characters are caricatures of public reputation, written for the game. They are not
 * knowledge of how the real teams decide.
 */

export type Style = "methodical" | "aggressive" | "analytical" | "gambler" | "opportunist" | "conservative";

export interface Brain {
  teamId: string;
  style: Style;
  /** 0..1 how good the calls are. */
  skill: number;
  /** 0..1 appetite for a gamble. */
  boldness: number;
  /** 0..1 how readily they try the undercut. */
  undercut: number;
  /** 0..1 how readily they cover a rival's stop. */
  cover: number;
  /** -1 prefers fewer stops, +1 prefers more. */
  stopBias: number;
  /** One line shown in the briefing. */
  blurb: string;
}

export const BRAINS: Record<string, Brain> = {
  mcl: { teamId: "mcl", style: "methodical", skill: 0.9, boldness: 0.55, undercut: 0.6, cover: 0.8, stopBias: 0, blurb: "Calm, tidy and quick to cover a rival. Rarely beaten on process." },
  rbr: { teamId: "rbr", style: "aggressive", skill: 0.92, boldness: 0.78, undercut: 0.9, cover: 0.6, stopBias: 0.4, blurb: "Pounces on the undercut and makes early, bold weather calls." },
  mer: { teamId: "mer", style: "analytical", skill: 0.88, boldness: 0.4, undercut: 0.5, cover: 0.7, stopBias: -0.3, blurb: "Trusts the numbers. Happy to run long and let the tyres decide." },
  fer: { teamId: "fer", style: "gambler", skill: 0.72, boldness: 0.68, undercut: 0.6, cover: 0.45, stopBias: 0.2, blurb: "Quick and brave, but the calls are not always the ones you expect." },
  wil: { teamId: "wil", style: "opportunist", skill: 0.8, boldness: 0.62, undercut: 0.55, cover: 0.55, stopBias: 0, blurb: "Data driven and happy to gamble when the weather turns." },
  rbs: { teamId: "rbs", style: "opportunist", skill: 0.74, boldness: 0.62, undercut: 0.6, cover: 0.5, stopBias: 0.2, blurb: "Slick stops and quick reactions. Takes a chance when it is there." },
  ast: { teamId: "ast", style: "conservative", skill: 0.7, boldness: 0.45, undercut: 0.4, cover: 0.6, stopBias: -0.4, blurb: "Cautious. Long first stints and few surprises." },
  hss: { teamId: "hss", style: "gambler", skill: 0.7, boldness: 0.72, undercut: 0.45, cover: 0.4, stopBias: 0, blurb: "Off sequence calls and long gambles to find a way into the points." },
  alp: { teamId: "alp", style: "gambler", skill: 0.66, boldness: 0.7, undercut: 0.5, cover: 0.45, stopBias: 0.1, blurb: "Will throw the dice if the race is not going their way." },
  aud: { teamId: "aud", style: "conservative", skill: 0.6, boldness: 0.4, undercut: 0.4, cover: 0.5, stopBias: -0.2, blurb: "Learning the job. Safe calls and clean stops." },
  cad: { teamId: "cad", style: "conservative", skill: 0.55, boldness: 0.4, undercut: 0.35, cover: 0.45, stopBias: -0.2, blurb: "A new wall still finding its rhythm. Prefers the safe option." },
};

export const DEFAULT_BRAIN: Brain = { teamId: "?", style: "methodical", skill: 0.6, boldness: 0.5, undercut: 0.5, cover: 0.5, stopBias: 0, blurb: "" };

interface Memo {
  /** Consecutive weather checks that wanted a change. */
  wantCount: number;
  lastCallLap: number;
  /** Intended next stop lap, for radio hints. */
  nextStop: number;
  nextCompound: Compound | null;
  /** Why the car was last called in. */
  reason: string;
  /** Stops seen on the car behind, to detect a rival stop. */
  behindStops: number;
}

const DIFF_SKILL = [-0.15, 0, 0.12];
const DIFF_NOISE = [1.6, 1, 0.45];
const DIFF_LATENCY = [2, 1, 0];

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export class Strategist {
  readonly brains = new Map<string, Brain>();
  readonly radars = new Map<string, TeamRadar>();
  private memo = new Map<string, Memo>();
  private lastNeutralId = -1;

  constructor(
    private sim: RaceSim,
    readonly difficulty: 0 | 1 | 2,
  ) {
    const teams = new Set(sim.cfg.entries.map((e) => e.team.id));
    for (const id of teams) {
      const b = BRAINS[id] ?? DEFAULT_BRAIN;
      const brain = { ...b, teamId: id, skill: clamp((sim.cfg.brainSkill?.[id] ?? b.skill) + DIFF_SKILL[difficulty], 0.2, 1) };
      this.brains.set(id, brain);
      if (sim.weather) this.radars.set(id, new TeamRadar(sim.weather, makeProfile(id, brain.skill, sim.cfg.seed)));
    }
  }

  brain(teamId: string): Brain {
    return this.brains.get(teamId) ?? DEFAULT_BRAIN;
  }

  radar(teamId: string): TeamRadar | null {
    return this.radars.get(teamId) ?? null;
  }

  private m(car: CarState): Memo {
    let x = this.memo.get(car.id);
    if (!x) {
      x = { wantCount: 0, lastCallLap: -9, nextStop: 0, nextCompound: null, reason: "", behindStops: 0 };
      this.memo.set(car.id, x);
    }
    return x;
  }

  /** Give every AI car a stop plan that suits its team's character. */
  init() {
    const sim = this.sim;
    const laps = sim.cfg.laps;
    const lifeM = sim.life.M;
    const lifeH = sim.life.H;
    for (const car of sim.cars) {
      if (car.entry.human) continue;
      const b = this.brain(car.entry.team.id);
      const per = Math.max(3, (lifeM + lifeH) / 2) * 0.92;
      let stops = Math.max(laps <= 12 ? 0 : 1, Math.ceil(laps / per) - 1);
      if (laps > 12) {
        if (sim.rng.chance(0.18 + 0.2 * Math.max(0, b.stopBias))) stops++;
        if (stops > 1 && sim.rng.chance(0.25 * Math.max(0, -b.stopBias))) stops--;
      }
      car.aiStops = clamp(stops, laps <= 12 ? 0 : 1, 3);
      // when to stop: aggressive walls go early, cautious ones late
      car.aiPlan = clamp(0.62 + (sim.rng.next() - 0.5) * 0.16 - 0.1 * (b.boldness - 0.5) - 0.05 * b.stopBias, 0.45, 0.85);
      const m = this.m(car);
      m.nextStop = Math.round(laps * (car.aiStops > 1 ? 0.33 : 0.5) * (1 + (car.aiPlan - 0.62)));
    }
  }

  /** Best guess of the next stop, for rival radio hints. */
  planned(car: CarState): { lap: number; compound: Compound | null; reason: string } {
    const m = this.m(car);
    return { lap: m.nextStop, compound: m.nextCompound, reason: m.reason };
  }

  /** The wall's belief about how wet the track is right now (0..1). */
  perceivedWet(car: CarState): number {
    const sim = this.sim;
    if (!sim.weather) return 0;
    const b = this.brain(car.entry.team.id);
    const sectorsAvg = (sim.weather.wet[0] + sim.weather.wet[1] + sim.weather.wet[2]) / 3;
    // the car reports the sector it is in more precisely than the others
    const own = car.wetD;
    const seen = 0.6 * own + 0.4 * sectorsAvg;
    const noise = (hashNoise(car.id, Math.floor(sim.tick / 150)) - 0.5) * 0.14 * (1.3 - b.skill) * DIFF_NOISE[this.difficulty];
    let w = seen + noise;
    // herd: what the cars ahead are doing is plain to see
    w += this.herd(car);
    return clamp(w, 0, 1);
  }

  private herd(car: CarState): number {
    const sim = this.sim;
    const i = car.position - 1;
    let wetAhead = 0;
    let slickAhead = 0;
    for (let k = Math.max(0, i - 5); k < i; k++) {
      const o = sim.order[k];
      if (o.status === "dnf") continue;
      if (isWetCompound(o.tyre.compound)) wetAhead++;
      else slickAhead++;
    }
    const slick = !isWetCompound(car.tyre.compound);
    if (slick && wetAhead >= 2) return 0.04 + 0.03 * wetAhead;
    if (!slick && slickAhead >= 3) return -0.05;
    return 0;
  }

  // ------------------------------------------------------------------ decisions

  /** Called at the end of each lap and the end of sector 2 for each AI car. */
  decide(car: CarState, sector = false) {
    const sim = this.sim;
    if (car.entry.human || car.status !== "racing" || car.incident) return;
    if (car.pitRequest) return;
    const remaining = sim.cfg.laps - car.lap;
    if (remaining <= 1 || sim.inc.red.active) return;
    const b = this.brain(car.entry.team.id);
    const m = this.m(car);
    this.pickUpDamage(car, m);
    if (car.pitRequest) return;
    if (sim.weather && this.weatherCall(car, b, m, sector)) return;
    if (!sector) this.raceCalls(car, b, m, remaining);
  }

  private pickUpDamage(car: CarState, m: Memo) {
    if (car.damage.puncture || car.damage.aero > 0.3 || car.damage.flat > 0.55) {
      car.pitRequest = this.next(car);
      m.reason = car.damage.puncture ? "puncture" : "damage";
      m.lastCallLap = car.lap;
    }
  }

  /** What compound would this wall fit right now? */
  next(car: CarState): Compound {
    const sim = this.sim;
    if (sim.weather && sim.wx) {
      const w = this.perceivedWet(car);
      const radar = this.radar(car.entry.team.id);
      let fcWet = w;
      if (radar) {
        const lead = sim.track.nominalLap * 1.5;
        const r = radar.rain(sim.weather.t, lead);
        fcWet = Math.max(w, 0.7 * w + 0.3 * (r > 0.12 ? Math.min(0.9, r * 1.3) : 0));
      }
      if (fcWet > 0.1) return bestCompoundFor(fcWet, false);
    }
    return sim.chooseCompoundDry(car);
  }

  private weatherCall(car: CarState, b: Brain, m: Memo, sector: boolean): boolean {
    const sim = this.sim;
    if (!sim.weather) return false;
    if (car.lap - m.lastCallLap < 3) return false;
    const now = sim.weather.t;
    const w = this.perceivedWet(car);
    const radar = this.radar(car.entry.team.id);
    const lapSec = sim.track.nominalLap;
    const comp = car.tyre.compound;
    const fc = radar ? radar.rain(now, lapSec * 1.3) : 0;
    const fcLong = radar ? radar.rain(now, lapSec * 5) : 0;
    let target: Compound | null = null;
    let reason = "";
    const bold = b.boldness;

    if (!isWetCompound(comp)) {
      const thresh = 0.12 - 0.04 * bold;
      if (w > thresh) {
        target = w > 0.6 ? "W" : "I";
        reason = "track is wet";
      } else if (fc > 0.28 && bold + b.skill * 0.3 > 0.75 && sim.rng.chance(0.25 * bold)) {
        // anticipate: rain is a lap away and this wall likes to gamble
        target = "I";
        reason = "rain is coming";
      }
    } else if (comp === "I") {
      if (w > 0.64 + (0.5 - bold) * 0.06) {
        target = "W";
        reason = "getting heavier";
      } else if (w < 0.12 && fc < 0.08 && fcLong < 0.1) {
        target = sim.chooseCompoundDry(car);
        reason = "track is drying";
      } else if (car.tyre.wear > 0.92) {
        target = "I";
        reason = "worn";
      }
    } else if (comp === "W") {
      if (w < 0.46 - (bold - 0.5) * 0.06 && fc < 0.4) {
        target = w < 0.12 && fcLong < 0.1 ? sim.chooseCompoundDry(car) : "I";
        reason = "easing off";
      }
    }
    if (!target || (target === comp && reason !== "worn")) {
      m.wantCount = 0;
      return false;
    }
    m.wantCount++;
    const need = 1 + DIFF_LATENCY[this.difficulty] - (b.skill > 0.85 ? 1 : 0) + (sector ? 0 : 0);
    if (m.wantCount < Math.max(1, need) && !(sector && w > 0.4 && !isWetCompound(comp))) return false;
    car.pitRequest = target;
    car.aiStops++;
    m.wantCount = 0;
    m.lastCallLap = car.lap;
    m.reason = reason;
    m.nextCompound = target;
    m.nextStop = car.lap + 1;
    return true;
  }

  private raceCalls(car: CarState, b: Brain, m: Memo, remaining: number) {
    const sim = this.sim;
    if (sim.neutral.active) return;
    if (car.tyre.wear < 0.28) return;
    const i = car.position - 1;
    const ahead = i > 0 ? sim.order[i - 1] : null;
    const behind = i < sim.order.length - 1 ? sim.order[i + 1] : null;
    const skill = b.skill;
    const stopsLeft = car.aiStops - car.stops;
    const canStop = stopsLeft > 0 && remaining > 4;

    // cover: a rival right behind has just come in
    if (behind && behind.status !== "dnf") {
      const bm = this.m(behind);
      const stopped = behind.stops > bm.behindStops;
      bm.behindStops = behind.stops;
      if (canStop && stopped && behind.gapAhead < 3.2 && car.tyre.wear > 0.33 && sim.rng.chance(b.cover * (0.5 + 0.5 * skill))) {
        car.pitRequest = this.next(car);
        m.reason = "cover";
        m.lastCallLap = car.lap;
        return;
      }
    }
    // undercut: sitting just behind a rival on older tyres
    if (canStop && ahead && ahead.status === "racing" && !ahead.pitRequest && car.gapAhead > 0 && car.gapAhead < 1.9) {
      const olderBy = ahead.tyre.ageLaps - car.tyre.ageLaps;
      const worth = car.tyre.wear > 0.34 + (1 - b.undercut) * 0.15 && olderBy >= -3;
      const free = this.cleanAirAfterStop(car);
      if (worth && free && sim.rng.chance(0.3 * b.undercut * (0.5 + 0.5 * skill))) {
        car.pitRequest = this.next(car);
        m.reason = "undercut";
        m.lastCallLap = car.lap;
        m.nextStop = car.lap + 1;
        return;
      }
    }
    // a gambler stays out when the tyres are still fine
    m.nextStop = Math.max(m.nextStop, car.lap + Math.max(1, Math.round((1 - car.tyre.wear) * sim.life[car.tyre.compound] * 0.6)));
  }

  /** Would a stop now drop the car into traffic? A rough check using gaps behind. */
  private cleanAirAfterStop(car: CarState): boolean {
    const sim = this.sim;
    const loss = this.pitLoss();
    // count cars within the loss window behind us
    let cars = 0;
    for (let k = car.position; k < sim.order.length && k < car.position + 6; k++) {
      const o = sim.order[k];
      if (o.status === "dnf") continue;
      if (o.gapLeader - car.gapLeader < loss) cars++;
    }
    return cars <= 3;
  }

  /** Time lost in the pits, in seconds. */
  pitLoss(): number {
    const T = this.sim.track;
    const lane = Math.max(150, T.length - T.pitOut + T.pitIn);
    return lane / 22 - lane / (T.length / T.nominalLap) + 2.6;
  }

  /** Safety car: free stop or stay out? */
  neutralCall(car: CarState): boolean {
    const sim = this.sim;
    const b = this.brain(car.entry.team.id);
    const key = sim.neutral.id;
    if (key !== this.lastNeutralId) this.lastNeutralId = key;
    const remaining = sim.cfg.laps - car.lap;
    if (remaining <= 3) return false;
    const ruleOpen = sim.cfg.twoCompoundRule !== false && !sim.ruleDone(car);
    const worth = car.tyre.wear > 0.28 || ruleOpen || (sim.weather && this.perceivedWet(car) > 0.1 && !isWetCompound(car.tyre.compound));
    if (!worth) return false;
    if (car.stops >= car.aiStops + 1) return false;
    let p = (ruleOpen ? 0.9 : 0.7) * (0.55 + 0.45 * b.skill);
    // the front runners hate to lose track position; gamblers like to stay out when it is not fully needed
    if (car.position <= 2) p *= 0.6;
    if (b.style === "gambler" && car.position > 3 && car.position < 11 && car.tyre.wear < 0.55) p *= 0.5;
    if (car.tyre.wear > 0.6) p = Math.max(p, 0.85);
    return sim.rng.chance(p);
  }
}

function hashNoise(id: string, n: number): number {
  let h = n | 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/** For the briefing. */
export function compoundName(c: Compound): string {
  return COMPOUNDS[c].name;
}
