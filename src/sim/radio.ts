import type { RaceSim } from "./engine";
import { engineerCall, engineerName } from "../game/crew";
import { ENG, fill, REPLY, RIVAL, SAY, TALK, type Voice } from "../game/radiolines";
import { Rng, hashSeed } from "./rng";
import type { CarState, Compound, Psyche, RadioChannel, RadioTruth, SimEvent, TeamOrder } from "./types";
import { isWetCompound } from "./types";
import { bestCompoundFor, wetLoss } from "./weather";
import { sampleTrack } from "./track";
import { evidence, readUndercut, stopKind } from "./situation";
import { iqFacets, stintBias, type IQFacets } from "./iq";
import { NO_ORDERS, mergeOrders, type StandingOrders } from "./standing";

/**
 * Everything said on the radio.
 *
 *  - Rival teams talk on an open feed. Some of it is honest (a real pit call), some is true but vague
 *    (the tyres are going), some is a bluff (a fake pit call), and some is filler. The player is never told which.
 *  - The player's own drivers talk to the pit wall. They ask questions, report what they feel and complain.
 *    The player answers with a choice, and the driver's personality decides how it is received.
 *  - Team orders (hold, let by, push, save tyres) are also received through the driver's character.
 *
 * The radio uses its own random stream, so switching it on or off never changes how the race itself plays out.
 */

export type PromptKind = "cover" | "undercut" | "tyres" | "weather" | "letme" | "fav" | "safetycar" | "redflag" | "damage";

/** One call the pit wall made for the player, judged after the race. */
export interface CallRec {
  tick: number;
  lap: number;
  carId: string;
  kind: "standing" | "cover" | "undercut" | "tyres" | "pit";
  /** What was decided, in words. */
  text: string;
  rival?: string;
  verdict?: "good" | "bad" | "even";
  /** Seconds won or lost where the game can measure it. */
  secs?: number;
  note?: string;
}

export interface PromptOption {
  id: string;
  label: string;
  /** What this does, shown small. */
  note?: string;
}

export interface Prompt {
  id: number;
  carId: string;
  kind: PromptKind;
  tick: number;
  expires: number;
  text: string;
  options: PromptOption[];
  answered: string | null;
  /** The compound this prompt is about, where relevant. */
  compound?: Compound;
  /** The other car (a team-mate) where relevant. */
  other?: string;
  /** A follow-up shown inside the prompt, e.g. the driver's sector report after "what do you see". */
  note?: string;
  /** The facts behind the call (tyre ages, gap, what the stop is worth), shown as chips so the player can judge it. */
  evidence?: string[];
}

export interface Mood {
  /** 0..1 how happy the driver is. */
  morale: number;
  /** 0..1 belief in the pit wall. */
  trust: number;
  /** 0..1 feeling of being treated worse than the team-mate. */
  grievance: number;
  /** Strategy slights this race (being undercut by the team-mate, a costly stack), 0..1. */
  strat?: number;
}

export interface RadioEntry {
  tick: number;
  channel: RadioChannel;
  truth: RadioTruth;
  carId?: string;
  team?: string;
  text: string;
}

interface Active {
  kind: "hold" | "letby" | "push" | "save" | "free";
  other?: string;
  until: number;
  untilLap: number;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

const DEFAULT_PSY: Psyche = { voice: "analyst", ego: 0.5, obedience: 0.6, volatility: 0.5, patience: 0.5, humour: 0.5, selfBelief: 0.6, loyalty: 0.65, talkative: 0.55 };

export class RadioSystem {
  readonly rng: Rng;
  prompts: Prompt[] = [];
  readonly moods = new Map<string, Mood>();
  readonly log: RadioEntry[] = [];
  private nextId = 1;
  private active = new Map<string, Active>();
  private lastPrompt = new Map<string, number>();
  private lastAnyPrompt = 0;
  private lastSay = new Map<string, number>();
  private prevReq = new Map<string, Compound | null>();
  private lastRival = 0;
  private weatherWant = new Map<string, number>();
  private suppress = new Map<string, number>();
  private behindCount = new Map<string, number>();
  private refused = new Map<string, number>();
  private warnedRain = new Set<string>();
  private lastReportedLap = new Map<string, number>();
  private seenStops = 0;
  /** What was around each car when its stop was called, kept fresh until it pits. */
  private pre = new Map<string, { ahead?: string; aheadGap: number; behind?: string }>();
  private pending: { x: string; y: string; yStops: number; t: number; outAt?: number }[] = [];
  private stuck = new Map<string, { rival: string; n: number }>();
  private stackSaid = new Set<string>();
  private pressureN = new Map<string, number>();
  private lastTalk = new Map<string, number>();
  private covering = new Map<string, number>();
  /** How crowded each driver's radio has been: every call from the pit wall adds one, and it drains lap by lap. */
  private chatter = new Map<string, number>();
  private lastEng = new Map<string, number>();
  private pendingFatigue = new Set<string>();
  /** The player's standing orders per car (see sim/standing.ts), and the safety car each car last made a decision about. */
  readonly standing = new Map<string, StandingOrders>();
  private scHandled = new Map<string, number>();
  /** Every call the pit wall made for the player, for the report card after the race. */
  readonly calls: CallRec[] = [];
  /** Things that will be said later: a driver taking his time to answer, an engineer waiting for a straight. */
  private later: { at: number; born: number; car?: CarState; fn: () => void }[] = [];
  /** Radio moments worth repeating after the race (swearing, refusals, a driver telling the pit wall to stop), for the social feed. */
  readonly quotes: { carId: string; tag: "bleep" | "refused" | "fatigue" | "over"; text: string }[] = [];

  constructor(private sim: RaceSim) {
    this.rng = new Rng(sim.cfg.seed ^ 0x5ad10);
    for (const [id, o] of Object.entries(sim.cfg.standing ?? {})) this.standing.set(id, mergeOrders(NO_ORDERS, o));
    for (const c of sim.cars) {
      const p = this.psy(c);
      const given = sim.cfg.moods?.[c.id];
      if (given) { this.moods.set(c.id, { ...given }); continue; }
      this.moods.set(c.id, { morale: clamp(0.62 + (this.rng.next() - 0.5) * 0.1 + (p.voice === "sunny" ? 0.08 : 0), 0, 1), trust: clamp(0.5 + 0.25 * p.loyalty, 0, 1), grievance: 0 });
    }
  }

  psy(car: CarState): Psyche {
    return car.entry.driver.psyche ?? DEFAULT_PSY;
  }

  mood(carId: string): Mood {
    return this.moods.get(carId) as Mood;
  }

  /** Prompts that still need an answer. */
  open(): Prompt[] {
    return this.prompts.filter((p) => p.answered === null && p.expires > this.sim.tick);
  }

  // ------------------------------------------------------------------ output

  private push(channel: RadioChannel, carId: string | undefined, text: string, truth: RadioTruth = "honest", kind: "radio" | "prompt" = "radio") {
    const sim = this.sim;
    const car = carId ? sim.car(carId) : undefined;
    const ev: SimEvent = { tick: sim.tick, kind, carId, text, channel, truth, team: car?.entry.team.id };
    sim.pushEvent(ev);
    this.log.push({ tick: sim.tick, channel, truth, carId, team: car?.entry.team.id, text });
  }

  private pick(arr: string[]): string {
    return arr[Math.floor(this.rng.next() * arr.length) % arr.length];
  }

  private vars(car: CarState, extra: Record<string, string | number> = {}): Record<string, string | number> {
    const mate = this.sim.cars.find((c) => c.entry.team.id === car.entry.team.id && c.id !== car.id);
    const sec = Math.min(3, Math.max(1, car.sectorIdx + 1));
    return {
      eng: engineerCall(car.entry.driver.code),
      mate: mate ? mate.entry.driver.code : "my team-mate",
      turn: this.sim.cornerText(car).replace(" at Turn ", ""),
      sec,
      ...extra,
    };
  }

  /** Driver speaks to the pit wall, in his own voice. */
  say(car: CarState, bank: Record<Voice, string[]>, extra: Record<string, string | number> = {}, truth: RadioTruth = "honest", channel: RadioChannel = "driver") {
    const voice = this.psy(car).voice;
    let text = fill(this.pick(bank[voice]), this.vars(car, extra));
    const tag = { v: "" as "" | "bleep" | "over" };
    if (car.entry.human) text = this.rough(car, text, tag);
    this.lastSay.set(car.id, this.sim.tick);
    const line = `${car.entry.driver.code}: ${text}`;
    const reply = bank === REPLY.accept ? 0 : bank === REPLY.grumble ? 1 : bank === REPLY.refuse ? 2 : -1;
    const speak = () => {
      this.push(channel, car.id, line, truth);
      if (tag.v) this.noteQuote(car.id, tag.v, line);
      if (reply === 2) this.noteQuote(car.id, "refused", line);
      if (bank === SAY.fatigue) this.noteQuote(car.id, "fatigue", line);
    };
    if (!car.entry.human || reply < 0) return speak();
    // a driver takes a moment to answer, longer when he is unhappy with what he was told: the silence is part of the reply
    const p = this.psy(car);
    const lag = Math.round(6 + (reply === 0 ? 8 : reply === 1 ? 20 + 25 * p.volatility : 35 + 55 * p.ego) + this.rng.next() * 10);
    if (lag >= 40) this.push(channel, car.id, `${car.entry.driver.code}: ...`, "honest");
    this.later.push({ at: this.sim.tick + lag, born: this.sim.tick, fn: speak });
  }

  /**
   * A driver under strain swears, and the broadcast bleeps it. A hot-headed one also talks over the engineer when a call has only just
   * ended. Text only: the marks are part of what the player reads.
   */
  private rough(car: CarState, text: string, tag: { v: "" | "bleep" | "over" }): string {
    const p = this.psy(car);
    const m = this.mood(car.id);
    const strain = (0.5 - m.morale) + m.grievance * 0.6 + (this.chatter.get(car.id) ?? 0) * 0.04;
    let out = text;
    if ((p.voice === "fire" || p.voice === "blunt") && strain > 0.12 && this.rng.chance(clamp(0.2 + strain * 0.8, 0, 0.8))) {
      const i = out.search(/[.!?,]/);
      tag.v = "bleep";
      out = this.rng.chance(0.5) ? `[BLEEP] ${out}` : i > 6 ? `${out.slice(0, i)}, [BLEEP]${out.slice(i)}` : `[BLEEP] ${out}`;
    }
    const since = this.sim.tick - (this.lastEng.get(car.id) ?? -9999);
    if (since < 35 && p.volatility > 0.55 && this.rng.chance(0.5)) {
      out = `(talking over the engineer) ${out}`;
      if (!tag.v) tag.v = "over";
    }
    return out;
  }

  private noteQuote(carId: string, tag: "bleep" | "refused" | "fatigue" | "over", text: string) {
    if (this.quotes.length < 8) this.quotes.push({ carId, tag, text });
  }

  private onStraight(car: CarState): boolean {
    return sampleTrack(this.sim.track, car.s).straight;
  }

  /** A soft call from the pit wall: the engineer waits for a straight, because nobody talks to a driver mid-corner. */
  private engWhenClear(car: CarState, templates: string[], extra: Record<string, string | number> = {}) {
    this.later.push({ at: this.sim.tick, born: this.sim.tick, car, fn: () => this.eng(car, templates, extra) });
  }

  /** Engineer speaks to the driver. */
  eng(car: CarState, templates: string[], extra: Record<string, string | number> = {}) {
    if (car.entry.human) {
      const n = (this.chatter.get(car.id) ?? 0) + 1;
      this.chatter.set(car.id, n);
      this.lastEng.set(car.id, this.sim.tick);
      if (n >= 5 && this.sim.tick - (this.lastSay.get(car.id + "f") ?? -9999) > 1500) {
        this.lastSay.set(car.id + "f", this.sim.tick);
        this.pendingFatigue.add(car.id);
      }
    }
    const name = engineerName(car.entry.driver.code).split(" ").slice(-1)[0];
    const text = fill(this.pick(templates), { call: car.entry.driver.name.split(" ")[0], ...this.vars(car, extra) });
    this.push("team", car.id, `${name} to ${car.entry.driver.code}: ${text}`);
  }

  // ------------------------------------------------------------------ hooks from the sim

  /** Every tick. Cheap checks, with the heavier ones every second. */
  tick() {
    const sim = this.sim;
    const t = sim.tick;
    for (const p of this.prompts) {
      if (p.answered === null && p.expires <= t) {
        p.answered = "none";
        const car = sim.car(p.carId);
        const m = this.mood(car.id);
        m.trust = clamp(m.trust - 0.02, 0, 1);
      }
    }
    for (let i = 0; i < this.later.length; ) {
      const q = this.later[i]!;
      const ready = t >= q.at && (!q.car || q.car.status === "dnf" || this.onStraight(q.car) || t - q.born > 900);
      if (ready) {
        this.later.splice(i, 1);
        q.fn();
      } else i++;
    }
    if (t % 10 !== 0 || sim.phase !== "racing") return;
    this.expireOrders();
    for (const car of sim.cars) {
      if (car.status === "dnf" || car.status === "finished") continue;
      const prev = this.prevReq.get(car.id) ?? null;
      if (car.pitRequest && car.pitRequest !== prev && !car.entry.human) this.rivalPitCall(car);
      this.prevReq.set(car.id, car.pitRequest);
      if (car.entry.human) {
        if (car.pitRequest) this.settleTyrePrompts(car);
        this.watchHuman(car);
      }
    }
    this.rivalChatter();
    this.runStanding();
    this.strategyTalk();
    for (const id of [...this.pendingFatigue]) {
      this.pendingFatigue.delete(id);
      const car = sim.car(id);
      if (car && car.status !== "dnf") {
        this.say(car, SAY.fatigue);
        const m = this.mood(id);
        m.morale = clamp(m.morale - 0.02, 0, 1);
      }
    }
  }

  /** A lap has been completed. */
  lap(car: CarState) {
    const m = this.mood(car.id);
    const p = this.psy(car);
    m.grievance = clamp(m.grievance - 0.004, 0, 1);
    if (car.entry.human) this.chatter.set(car.id, Math.max(0, (this.chatter.get(car.id) ?? 0) - 1));
    // positions gained or lost since the start sway the mood
    const d = car.startPosition - car.position;
    m.morale = clamp(m.morale + (d > 0 ? 0.004 : d < 0 ? -0.004 * (0.5 + p.volatility) : 0), 0, 1);
    const mate = this.mate(car);
    if (car.entry.human && mate && mate.status !== "dnf" && mate.position < car.position) m.grievance = clamp(m.grievance + 0.006 * p.ego, 0, 1);
    if (!car.entry.human) this.rivalLap(car);
  }

  /** The sim emitted an event. React if one of the player's cars is involved. */
  observe(e: SimEvent) {
    if (e.kind === "radio" || e.kind === "prompt") return;
    const sim = this.sim;
    const car = e.carId ? sim.car(e.carId) : undefined;
    const mine = car?.entry.human === true;
    if (mine && car) {
      switch (e.kind) {
        case "spin":
          if (e.text.includes("stalled")) break;
          this.say(car, SAY.spun);
          this.mood(car.id).morale = clamp(this.mood(car.id).morale - 0.04, 0, 1);
          break;
        case "lockup":
          this.say(car, SAY.lockup);
          break;
        case "damage":
          if (car.damage.puncture) this.say(car, SAY.puncture);
          else this.say(car, SAY.damage);
          this.promptDamage(car);
          break;
        case "wall":
        case "gravel":
          this.mood(car.id).morale = clamp(this.mood(car.id).morale - 0.06, 0, 1);
          break;
        default:
          break;
      }
    }
    if (e.kind === "sc_deployed" || e.kind === "vsc") {
      for (const c of sim.cars) if (c.entry.human && c.status === "racing") this.promptSafetyCar(c);
    }
    if (e.kind === "red_flag") {
      for (const c of sim.cars) if (c.entry.human && c.status !== "dnf") this.promptRed(c);
    }
    if (e.kind === "yellow" && sim.cars.some((c) => c.entry.human)) {
      // engineers tell the drivers about yellows (only the first sector change is announced)
    }
  }

  // ------------------------------------------------------------------ the player's drivers

  private mate(car: CarState): CarState | undefined {
    return this.sim.cars.find((c) => c.entry.team.id === car.entry.team.id && c.id !== car.id);
  }

  private canPrompt(car: CarState, gap = 600): boolean {
    const sim = this.sim;
    if (car.status === "dnf") return false;
    if (this.open().some((p) => p.carId === car.id)) return false;
    const last = this.lastPrompt.get(car.id) ?? -99999;
    if (sim.tick - last < gap) return false;
    // fewer, better prompts: one question to the team at a time, with room to breathe unless it is urgent (a short gap means urgent)
    if (gap >= 300 && sim.tick - this.lastAnyPrompt < 900 && this.lastAnyPrompt > 0) return false;
    return true;
  }

  private openPrompt(car: CarState, kind: PromptKind, text: string, options: PromptOption[], extra: Partial<Prompt> = {}, life = 450): Prompt {
    const sim = this.sim;
    const p: Prompt = { id: this.nextId++, carId: car.id, kind, tick: sim.tick, expires: sim.tick + life, text, options, answered: null, ...extra };
    this.prompts.push(p);
    this.lastPrompt.set(car.id, sim.tick);
    if (kind !== "damage" && kind !== "redflag" && kind !== "safetycar") this.lastAnyPrompt = sim.tick;
    this.push("driver", car.id, `${car.entry.driver.code}: ${text}`, "honest", "prompt");
    return p;
  }

  /** The player has already called the stop, so questions about tyres or the weather are moot. They close quietly with no trust penalty. */
  private settleTyrePrompts(car: CarState) {
    for (const p of this.prompts) {
      if (p.carId === car.id && p.answered === null && (p.kind === "tyres" || p.kind === "weather")) p.answered = "handled";
    }
    this.weatherWant.set(car.id, 0);
  }

  /** Looks at the situation of each of the player's cars and decides if the driver has something to say. */
  private watchHuman(car: CarState) {
    const sim = this.sim;
    if (car.status !== "racing" || car.incident || sim.inc.red.active) return;
    const p = this.psy(car);
    const m = this.mood(car.id);
    const remaining = sim.cfg.laps - car.lap;
    const talk = 0.4 + 0.6 * p.talkative;

    // ---- weather: what the driver feels under him
    if (sim.weather) {
      const w = car.wetD;
      const comp = car.tyre.compound;
      const best = bestCompoundFor(w, true);
      const lossNow = wetLoss(comp, w);
      const lossBest = wetLoss(best, w);
      const gain = lossNow - lossBest;
      const key = car.id;
      if (gain > 0.06 && best !== comp && !car.pitRequest) {
        this.weatherWant.set(key, (this.weatherWant.get(key) ?? 0) + 1);
      } else {
        this.weatherWant.set(key, 0);
      }
      if ((this.weatherWant.get(key) ?? 0) >= 15 && (this.suppress.get(car.id + "w") ?? 0) < sim.tick && this.canPrompt(car, 350)) {
        this.weatherWant.set(key, 0);
        this.promptWeather(car, best);
      }
    }

    // ---- tyres
    if ((this.perceivedWear(car) > 0.78 || car.tyre.wear > 0.97) && remaining > 3 && !car.pitRequest && (this.suppress.get(car.id + "t") ?? 0) < sim.tick && this.canPrompt(car, 900)) {
      if (this.rng.chance(talk)) this.promptTyres(car);
    }

    // ---- stuck behind the team-mate
    const mate = this.mate(car);
    if (mate && mate.entry.human && mate.status === "racing" && mate.position === car.position - 1 && car.gapAhead < 1.0 && car.gapAhead > 0) {
      const n = (this.behindCount.get(car.id) ?? 0) + 1;
      this.behindCount.set(car.id, n);
      const faster = car.lastLap > 0 && mate.lastLap > 0 && car.lastLap < mate.lastLap - 0.15;
      if (n > 300 && faster && this.canPrompt(car, 1200) && this.rng.chance(0.3 + 0.5 * p.ego)) {
        this.behindCount.set(car.id, 0);
        this.promptLetMe(car, mate);
      }
    } else this.behindCount.set(car.id, 0);

    // ---- grievance
    if (m.grievance > 0.55 && this.canPrompt(car, 1500) && this.rng.chance(0.2 + 0.4 * p.volatility)) this.promptFav(car);

    // ---- chatter, praise
    if (sim.tick - (this.lastSay.get(car.id) ?? 0) > 1500 && this.rng.chance(0.015 * talk)) {
      if (car.position <= 3 || car.position < car.startPosition) this.say(car, SAY.praise);
      else this.say(car, SAY.banter);
    }
    // ---- team radio: weather advisories from the pit wall
    this.engineerWeather(car);
  }

  private engineerWeather(car: CarState) {
    const sim = this.sim;
    if (!sim.weather) return;
    const radar = sim.strat.radar(car.entry.team.id);
    if (!radar) return;
    const key = car.entry.team.id + (sim.weather.t > 0 ? ":" + Math.floor(sim.weather.t / 240) : "");
    if (this.warnedRain.has(key)) return;
    if (sim.tick % 100 !== 0) return;
    if (!this.mate(car) || car.entry.driver.code > (this.mate(car) as CarState).entry.driver.code) return; // one call per team
    const eta = radar.eta(sim.weather.t);
    const mins = Math.round(eta.sec / 60);
    if (eta.kind === "arrives" && eta.sec < 900 && eta.confidence > 0.3) {
      this.warnedRain.add(key);
      this.engWhenClear(car, ENG.weatherNear, { n: Math.max(1, mins) });
    } else if (eta.kind === "clears" && eta.sec < 900 && eta.confidence > 0.3) {
      this.warnedRain.add(key);
      this.engWhenClear(car, ENG.weatherClears, { n: Math.max(1, mins) });
    }
  }


  // ------------------------------------------------------------------ strategy talk

  private carBy(id: string | undefined): CarState | undefined {
    return id ? this.sim.cars.find((c) => c.id === id) : undefined;
  }

  /** What this driver can read of a race. See sim/iq.ts. */
  iq(car: CarState): IQFacets {
    const f = iqFacets(car.entry.driver, this.sim.cfg.year ?? 2026);
    // a good race engineer lifts what a driver can read of the car; a poor one lets it slip (the player's own cars only)
    const eng = this.sim.cfg.engineerSkill;
    if (!car.entry.human || eng === undefined) return f;
    const lift = (eng - 0.5) * 0.24;
    const c = (v: number) => Math.min(1, Math.max(0, v + lift));
    return { ...f, reading: c(f.reading), strategy: c(f.strategy) };
  }

  /** How worn the driver thinks his tyres are. A sharp driver is close to the data, a raw one can be well out, and holds that view all stint. */
  perceivedWear(car: CarState): number {
    const err = stintBias(`${car.id}:${this.sim.cfg.seed}`, car.stops) * (1 - this.iq(car).reading) * 0.22;
    return Math.min(1.4, Math.max(0, car.tyre.wear + err));
  }

  /** A suggestion for an undercut: a sharp driver only brings real ones, a raw one sometimes brings one that is plausible but too small. */
  private undercutIdea(car: CarState, ahead: CarState): boolean {
    const rd = readUndercut(this.sim, car, ahead, this.sim.chooseCompoundDry(car), car.gapAhead);
    if (rd.real) return true;
    return rd.why === "small" && rd.value > rd.gap * 0.6 && this.rng.chance((1 - this.iq(car).strategy) * 0.5);
  }

  /** Set or change the standing orders for a car. */
  setStanding(carId: string, patch: Partial<StandingOrders>) {
    const car = this.sim.car(carId);
    if (!car?.entry.human) return;
    this.standing.set(carId, mergeOrders(this.standing.get(carId) ?? NO_ORDERS, patch));
  }

  /** Carry out the standing orders. Called every second. */
  private stanceDone = new Map<string, string>();
  /** Delegated calls are only as good as the strategist: weak staff box a little early or late, the same way all race. Orders you set yourself run exactly. */
  private slip(car: CarState, o: StandingOrders): number {
    const eng = this.sim.cfg.engineerSkill;
    if (!o.delegated || eng === undefined) return 0;
    const r = new Rng(hashSeed(`slip:${car.id}:${this.sim.cfg.seed}`));
    return (r.next() - 0.5) * 2 * (1 - eng) * 0.12;
  }
  private runStanding() {
    const sim = this.sim;
    for (const car of sim.cars) {
      const o = this.standing.get(car.id);
      if (o && car.entry.human && car.status === "racing" && this.stanceDone.get(car.id) !== o.stance) {
        this.stanceDone.set(car.id, o.stance);
        if (o.stance === "tyres") car.push = 0;
        else if (o.stance === "attack") car.push = 2;
        else if (sim.tick > 0 && car.push !== 1) car.push = 1;
      }
      if (!o || !car.entry.human || car.status !== "racing" || car.pitRequest || sim.inc.red.active) continue;
      const remaining = sim.cfg.laps - car.lap;
      if (remaining <= 2 || (sim.weather && car.wetD > 0.2)) continue;
      let why: string | null = null;
      let comp: Compound | null = null;
      if (o.stopLap && car.stops === 0 && car.lap + 1 >= o.stopLap) {
        why = `Plan: box around lap ${o.stopLap}`;
        comp = o.stopCompound;
      } else if (o.tyreLimit !== null && car.tyre.wear >= o.tyreLimit + this.slip(car, o)) {
        why = `Tyres are at ${Math.round(car.tyre.wear * 100)} percent, your limit`;
      } else if (o.scBox && sim.neutral.active && this.scHandled.get(car.id) !== sim.neutral.id) {
        this.scHandled.set(car.id, sim.neutral.id);
        if (car.tyre.wear >= o.scWear) why = `Safety car and tyres over ${Math.round(o.scWear * 100)} percent`;
      }
      if (!why) continue;
      car.pitRequest = comp ?? sim.chooseCompoundDry(car);
      this.settleTyrePrompts(car);
      this.eng(car, ENG.standing, { why, comp: compName(car.pitRequest) });
      this.calls.push({ tick: sim.tick, lap: car.lap + 1, carId: car.id, kind: "standing", text: why });
    }
  }

  /** The player called a stop. A sharp driver says so when the tyres are barely used. The call stands either way. */
  onPitCall(car: CarState) {
    const sim = this.sim;
    if (!car.entry.human || this.iq(car).strategy < 0.65) return;
    const p = this.psy(car);
    const remaining = sim.cfg.laps - car.lap;
    const wet = !!sim.weather && car.wetD > 0.2;
    const early = car.tyre.ageLaps < 6 && car.tyre.wear < 0.3 && remaining > 8 && !sim.neutral.active && !wet && !car.damage.puncture && car.damage.flat < 0.05;
    if (!early || (this.lastTalk.get(car.id + "o") ?? 0) > sim.tick) return;
    this.lastTalk.set(car.id + "o", sim.tick + 2400);
    if (this.rng.chance(0.4 + 0.5 * p.talkative)) this.say(car, TALK.pushEarly, { age: car.tyre.ageLaps, wear: Math.round(car.tyre.wear * 100) });
  }

  private hit(car: CarState, sev: number) {
    const p = this.psy(car);
    const m = this.mood(car.id);
    m.strat = clamp((m.strat ?? 0) + sev, 0, 1);
    m.grievance = clamp(m.grievance + sev * (0.5 + p.ego * 0.7), 0, 1);
    m.morale = clamp(m.morale - sev * 0.25 * (0.5 + p.volatility), 0, 1);
    m.trust = clamp(m.trust - sev * 0.2 * (1.1 - p.loyalty), 0, 1);
  }

  /** Undercuts, covers, stacks and pressure, said in the driver's own voice. Called every second. */
  private strategyTalk() {
    const sim = this.sim;
    const t = sim.tick;
    // remember what surrounded every car that has a stop called
    for (const car of sim.cars) {
      if (car.status !== "racing" || !car.pitRequest) continue;
      const a = sim.order[car.position - 2];
      const b = sim.order[car.position];
      this.pre.set(car.id, { ahead: a?.id, aheadGap: car.gapAhead, behind: b?.id });
    }
    // new stops
    while (this.seenStops < sim.stopLog.length) {
      const rec = sim.stopLog[this.seenStops++];
      const x = this.carBy(rec.carId);
      const snap = this.pre.get(rec.carId);
      this.pre.delete(rec.carId);
      if (!x || !snap?.ahead) continue;
      const y = this.carBy(snap.ahead);
      if (!y || y.status === "dnf" || y.stops >= x.stops || snap.aheadGap > 3.6 || Math.abs(y.lap - x.lap) > 1) continue;
      this.pending.push({ x: x.id, y: y.id, yStops: y.stops, t });
      // the car in front has not stopped, and a car behind it just did
      if (y.entry.human && y.status === "racing" && !y.pitRequest) {
        const kind = stopKind(rec);
        const rd = readUndercut(this.sim, x, y, rec.to, snap.aheadGap);
        if (kind !== "normal") {
          // a stop in the first laps, or with damage, is never an undercut. The engineer says so and nobody asks.
          this.eng(y, ENG.earlyStop, { rival: x.entry.driver.code, lap: rec.lap, why: kind === "damage" ? "damage or a puncture" : "a gamble for a safety car or clear air" });
        } else if (rd.real && this.standing.get(y.id)?.cover) {
          const pick = this.sim.chooseCompoundDry(y);
          y.pitRequest = pick;
          this.eng(y, ENG.standingCover, { rival: x.entry.driver.code, comp: compName(pick) });
          this.calls.push({ tick: t, lap: y.lap + 1, carId: y.id, kind: "cover", text: `Covered ${x.entry.driver.code} on a standing order`, rival: x.entry.driver.code });
        } else if (rd.real) {
          if (this.canPrompt(y, 300)) {
            const text = fill(this.pick(TALK.coverWarn[this.psy(y).voice]), this.vars(y, { rival: x.entry.driver.code }));
            this.openPrompt(y, "cover", text, [
              { id: "box", label: `Cover him (${compName(this.sim.chooseCompoundDry(y))})`, note: "Pit this lap" },
              { id: "stay", label: "Stay out", note: "Gamble on track position" },
            ], { compound: this.sim.chooseCompoundDry(y), other: x.id, evidence: evidence(rd) }, 300);
          }
        } else {
          this.eng(y, ENG.noThreat, { rival: x.entry.driver.code, gain: Math.max(0, rd.perLap).toFixed(1) });
        }
      }
    }
    // resolve undercuts once the car in front has stopped and rejoined
    this.pending = this.pending.filter((u) => {
      const x = this.carBy(u.x);
      const y = this.carBy(u.y);
      if (!x || !y || x.status === "dnf" || y.status === "dnf" || t - u.t > 7000) return false;
      if (y.stops <= u.yStops) return true;
      if (y.status !== "racing") return true;
      u.outAt ??= t;
      if (t - u.outAt < 120) return true;
      this.settleUndercut(x, y);
      this.judge(x, y);
      return false;
    });
    // stacked stops: the second car waits and says so
    for (const car of sim.cars) {
      if (!car.entry.human) continue;
      const key = car.id + ":" + car.stops;
      if (car.status === "pit_in" && (car.stackWait ?? 0) > 1.2 && !this.stackSaid.has(key)) {
        this.stackSaid.add(key);
        this.say(car, TALK.stackWait);
      }
    }
    for (const rec of sim.stackLog.slice(this.stackSeen)) {
      const car = this.carBy(rec.carId);
      if (!car?.entry.human) continue;
      if (rec.wait > 2.5) {
        this.say(car, TALK.stackAfter, { gap: rec.wait.toFixed(1) });
        this.hit(car, Math.min(0.28, 0.04 * rec.wait));
      }
    }
    this.stackSeen = sim.stackLog.length;
    // ideas from the cockpit: stuck behind a rival, or being hounded
    for (const car of sim.cars) {
      if (!car.entry.human || car.status !== "racing" || car.incident || sim.inc.red.active || sim.neutral.active) continue;
      const p = this.psy(car);
      const ahead = sim.order[car.position - 2];
      const behind = sim.order[car.position];
      // following
      if (ahead && !ahead.entry.human && ahead.status === "racing" && car.gapAhead > 0 && car.gapAhead < 1.6 && ahead.entry.team.id !== car.entry.team.id) {
        const s = this.stuck.get(car.id);
        const n = s && s.rival === ahead.id ? s.n + 1 : 1;
        this.stuck.set(car.id, { rival: ahead.id, n });
        const remaining = sim.cfg.laps - car.lap;
        if (n > 350 && car.tyre.wear > 0.3 && remaining > 8 && !car.pitRequest && (this.lastTalk.get(car.id + "u") ?? 0) < t && this.canPrompt(car, 1500) && this.rng.chance(0.25 + 0.4 * p.talkative) && ahead.stops <= car.stops && car.tyre.ageLaps >= 5 && this.undercutIdea(car, ahead)) {
          const rd = readUndercut(sim, car, ahead, sim.chooseCompoundDry(car), car.gapAhead);
          this.stuck.set(car.id, { rival: ahead.id, n: 0 });
          this.lastTalk.set(car.id + "u", t + 2500);
          const text = fill(this.pick(TALK.undercutIdea[p.voice]), this.vars(car, { rival: ahead.entry.driver.code }));
          this.openPrompt(car, "undercut", text, [
            { id: "box", label: `Go for the undercut (${compName(sim.chooseCompoundDry(car))})`, note: "Pit this lap" },
            { id: "stay", label: "Stay out, be patient", note: "Driver keeps following" },
          ], { compound: sim.chooseCompoundDry(car), other: ahead.id, evidence: evidence(rd) }, 450);
        }
      } else this.stuck.delete(car.id);
      // pressure from behind
      if (behind && !behind.entry.human && behind.status === "racing" && behind.gapAhead > 0 && behind.gapAhead < 0.9) {
        const n = (this.pressureN.get(car.id) ?? 0) + 1;
        this.pressureN.set(car.id, n);
        if (n > 300 && (this.lastTalk.get(car.id + "p") ?? 0) < t && this.rng.chance(0.2 + 0.5 * p.talkative)) {
          this.pressureN.set(car.id, 0);
          this.lastTalk.set(car.id + "p", t + 2400);
          this.say(car, TALK.pressure, { rival: behind.entry.driver.code, n: Math.max(2, Math.round(n / 60)) });
        }
      } else this.pressureN.set(car.id, 0);
    }
  }

  private stackSeen = 0;

  /** Decide whether the player's call on this pair of cars worked, once both have stopped and the order has settled. */
  private judge(x: CarState, y: CarState) {
    const xAhead = x.position < y.position;
    for (const [h, other] of [[x, y], [y, x]] as const) {
      if (!h.entry.human) continue;
      const c = [...this.calls].reverse().find((k) => k.carId === h.id && k.rival === other.entry.driver.code && !k.verdict);
      if (!c) continue;
      const ahead = h === x ? xAhead : !xAhead;
      const stayed = /Stayed out/.test(c.text);
      c.verdict = ahead ? "good" : "bad";
      c.note = ahead ? (stayed ? `Held ${other.entry.driver.code} off` : `Ended up ahead of ${other.entry.driver.code}`) : (stayed ? `Lost the place to ${other.entry.driver.code}` : `Still behind ${other.entry.driver.code}`);
    }
  }

  private settleUndercut(x: CarState, y: CarState) {
    const sim = this.sim;
    const won = x.position < y.position;
    if (!won) return;
    const same = x.entry.team.id === y.entry.team.id;
    const xr = { rival: y.entry.driver.code };
    if (same) {
      if (x.entry.human) this.say(x, TALK.teamWon, { mate: y.entry.driver.code });
      if (y.entry.human) {
        // the one who was ahead and stayed out pays; the bigger the ego and the clearer he led, the worse it is
        const py = this.psy(y);
        const lead = (this.covering.get(y.id) ?? -1) > 0 ? 1.2 : 1;
        this.say(y, TALK.teamLost, { mate: x.entry.driver.code });
        this.hit(y, Math.min(0.5, (0.16 + 0.22 * py.ego) * lead));
      }
      return;
    }
    if (x.entry.human) {
      this.say(x, TALK.undercutWon, xr);
      const m = this.mood(x.id);
      m.morale = clamp(m.morale + 0.03, 0, 1);
    }
    if (y.entry.human) {
      this.say(y, TALK.undercutLost, { rival: x.entry.driver.code });
      const stayed = (this.covering.get(y.id) ?? -1) > 0;
      this.hit(y, stayed ? 0.16 : 0.06);
    }
    void sim;
  }

  private promptTyres(car: CarState) {
    const choose = this.sim.chooseCompoundDry(car);
    const feel = this.perceivedWear(car);
    const wear = car.tyre.wear;
    const ev = [`Tyres: ${car.tyre.ageLaps} laps old`, `Our data: ${Math.round(wear * 100)}% worn`, feel > wear + 0.08 ? "Driver feels them worse than the data says" : feel < wear - 0.08 ? "Driver feels them better than the data says" : "Driver agrees with the data"];
    const text = fill(this.pick(SAY.tyresGone[this.psy(car).voice]), this.vars(car));
    this.openPrompt(car, "tyres", `${car.entry.driver.code}: ${text}`.replace(/^[A-Z]{3}: /, ""), [
      { id: "box", label: `Box now (${compName(choose)})`, note: "Pit this lap" },
      { id: "stay", label: "Stay out a few more laps", note: "Driver keeps pushing" },
      { id: "manage", label: "Manage them, I will tell you when", note: "Save tyres for 4 laps" },
    ], { compound: choose, evidence: ev });
  }

  private promptWeather(car: CarState, best: Compound) {
    const text = isWetCompound(best) && !isWetCompound(car.tyre.compound) ? this.pick(SAY.wetOnSlicks[this.psy(car).voice]) : this.pick(SAY.dryingOnWets[this.psy(car).voice]);
    this.openPrompt(
      car,
      "weather",
      fill(text, this.vars(car)),
      [
        { id: "box", label: `Box for ${compName(best)}`, note: "Pit this lap" },
        { id: "stay", label: "Stay out, hold on", note: "Driver stays on current tyres" },
        { id: "ask", label: "What do you see out there?", note: "He tells you sector by sector" },
      ],
      { compound: best },
    );
  }

  private promptLetMe(car: CarState, mate: CarState) {
    this.openPrompt(car, "letme", fill(this.pick(SAY.letMeBy[this.psy(car).voice]), this.vars(car, { gap: "0.3" })), [
      { id: "hold", label: "Hold position", note: `${mate.entry.driver.code} stays ahead` },
      { id: "swap", label: "Let him by", note: `${mate.entry.driver.code} yields` },
      { id: "free", label: "Free race, no contact", note: "Both may race" },
    ], { other: mate.id });
  }

  private promptFav(car: CarState) {
    this.openPrompt(car, "fav", fill(this.pick(SAY.favouritism[this.psy(car).voice]), this.vars(car)), [
      { id: "equal", label: "You are both treated equally", note: "Calm him down" },
      { id: "sorry", label: "You are right, we got it wrong", note: "Admit it, costs nothing but pride" },
      { id: "focus", label: "Drive the car, we decide strategy", note: "Firm, risks a reaction" },
    ]);
  }

  private promptSafetyCar(car: CarState) {
    if (!this.canPrompt(car, 100)) return;
    const choose = this.sim.chooseCompound(car);
    this.openPrompt(car, "safetycar", fill(this.pick(SAY.askSafetyCar[this.psy(car).voice]), this.vars(car)), [
      { id: "box", label: `Box for ${compName(choose)}`, note: "Cheap stop" },
      { id: "stay", label: "Stay out", note: "Keep track position" },
    ], { compound: choose }, 180);
  }

  private promptRed(car: CarState) {
    const text = fill(this.pick(SAY.askRedFlag[this.psy(car).voice]), this.vars(car));
    const opts: PromptOption[] = [
      { id: "I", label: "Intermediates" },
      { id: "W", label: "Full wets" },
      { id: "M", label: "Mediums (slicks)" },
      { id: "keep", label: "Keep current set" },
    ];
    this.lastPrompt.set(car.id, -99999);
    const open = this.open().filter((p) => p.carId === car.id);
    for (const p of open) p.answered = "none";
    this.openPrompt(car, "redflag", text, opts, {}, 6000);
  }

  private promptDamage(car: CarState) {
    if (!this.canPrompt(car, 150)) return;
    this.openPrompt(car, "damage", `${car.entry.driver.code}: ${car.damage.puncture ? "Puncture" : "Damage"} on the car. What do we do?`.replace(/^[A-Z]{3}: /, ""), [
      { id: "box", label: car.damage.puncture ? "Box now for tyres" : "Box for a new nose and tyres", note: "Pit this lap" },
      { id: "push", label: "Carry on", note: "Risk it" },
    ], { compound: this.sim.chooseCompound(car) }, 200);
  }

  // ------------------------------------------------------------------ answers

  /** The player answered a prompt. */
  reply(promptId: number, option: string) {
    const sim = this.sim;
    const pr = this.prompts.find((p) => p.id === promptId);
    if (!pr || pr.answered !== null || pr.expires <= sim.tick) return;
    const car = sim.car(pr.carId);
    const m = this.mood(car.id);
    const psy = this.psy(car);
    // "box:M" means box and fit this compound
    let chosen: Compound | null = null;
    if (option.startsWith("box:")) {
      chosen = option.slice(4) as Compound;
      option = "box";
    } else if (option.startsWith("boxset:")) {
      // "boxset:S3" means box and fit that exact set
      const set = sim.setListFor(car).find((x) => x.id === option.slice(7));
      if (set) {
        chosen = set.compound;
        car.pitSetId = set.id;
      }
      option = "box";
    }
    pr.answered = option;

    const respond = (want: number, strict = false): "accept" | "grumble" | "refuse" => {
      const tone = this.tone(car, want, strict);
      const bank = tone === "accept" ? REPLY.accept : tone === "grumble" ? REPLY.grumble : REPLY.refuse;
      this.say(car, bank);
      this.applyTone(car, tone, want);
      return tone;
    };

    switch (pr.kind) {
      case "cover": {
        const rc = pr.other ? sim.car(pr.other)?.entry.driver.code : undefined;
        this.calls.push({ tick: sim.tick, lap: car.lap + 1, carId: car.id, kind: "cover", text: option === "box" ? `Covered ${rc ?? "the rival"}` : `Stayed out against ${rc ?? "the rival"}`, rival: rc });
        if (option === "box") {
          car.pitRequest = chosen ?? sim.chooseCompoundDry(car);
          this.eng(car, ENG.pit, { comp: compName(car.pitRequest) });
          respond(0.7);
        } else {
          this.eng(car, ENG.stayOut);
          this.suppress.set(car.id + "t", sim.tick + 900);
          // staying out is a gamble the driver will remember if it fails
          this.covering.set(car.id, sim.tick);
          respond(-0.35 - 0.3 * psy.ego, false);
        }
        break;
      }
      case "undercut": {
        const rc = pr.other ? sim.car(pr.other)?.entry.driver.code : undefined;
        this.calls.push({ tick: sim.tick, lap: car.lap + 1, carId: car.id, kind: "undercut", text: option === "box" ? `Went for the undercut on ${rc ?? "the rival"}` : `Stayed out behind ${rc ?? "the rival"}`, rival: rc });
        if (option === "box") {
          car.pitRequest = chosen ?? sim.chooseCompoundDry(car);
          this.eng(car, ENG.pit, { comp: compName(car.pitRequest) });
          respond(0.85);
        } else {
          this.eng(car, ENG.stayOut);
          this.lastTalk.set(car.id + "u", sim.tick + 3000);
          respond(-0.3 - 0.4 * psy.ego, false);
        }
        break;
      }
      case "tyres": {
        this.calls.push({ tick: sim.tick, lap: car.lap + 1, carId: car.id, kind: "tyres", text: option === "box" ? `Boxed when the driver called the tyres gone (data: ${Math.round(car.tyre.wear * 100)}% worn)` : option === "stay" ? `Kept him out at ${Math.round(car.tyre.wear * 100)}% worn` : "Told him to manage the tyres" });
        if (option === "box") {
          car.pitRequest = chosen ?? pr.compound ?? sim.chooseCompoundDry(car);
          this.eng(car, ENG.pit, { comp: compName(car.pitRequest) });
          respond(0.7);
        } else if (option === "stay") {
          this.suppress.set(car.id + "t", sim.tick + 1500);
          this.eng(car, ENG.stayOut);
          respond(-0.5 - (car.tyre.wear - 0.78));
        } else {
          car.push = 0;
          this.active.set(car.id, { kind: "save", until: sim.tick + 1, untilLap: car.lap + 4 });
          this.suppress.set(car.id + "t", sim.tick + 1800);
          this.eng(car, ENG.saveTyres);
          respond(0);
        }
        break;
      }
      case "weather": {
        const best = chosen ?? pr.compound ?? "I";
        if (option === "box") {
          car.pitRequest = best;
          this.eng(car, ENG.pit, { comp: compName(best) });
          respond(0.8);
        } else if (option === "stay") {
          this.eng(car, ENG.stayOut);
          this.suppress.set(car.id + "w", sim.tick + 1200);
          // a driver only overrules the pit wall when the car is genuinely unsafe on this tyre
          const danger = sim.weather ? wetLoss(car.tyre.compound, car.wetD) : 0;
          let tone = respond(-0.7 * (0.5 + psy.selfBelief * 0.5), danger > 0.3);
          if (tone === "refuse" && danger <= 0.3) tone = "grumble";
          if (tone === "refuse") {
            this.refused.set(car.id, sim.tick);
            car.pitRequest = best;
            this.say(car, SAY.banter, {}, "honest");
            this.push("driver", car.id, `${car.entry.driver.code}: I am boxing, {eng}. I am sorry, it is not safe.`.replace("{eng}", engineerCall(car.entry.driver.code)));
          }
        } else {
          // ask: the driver reports sector by sector. Honest, with a bit of driver error.
          const w = sim.weather ? sim.weather.wet : [0, 0, 0];
          const word = (v: number) => (v < 0.08 ? "dry" : v < 0.25 ? "damp" : v < 0.5 ? "wet" : v < 0.8 ? "properly wet" : "standing water");
          const j = () => (this.rng.next() - 0.5) * 0.12 * (1.2 - (car.entry.driver.wet ?? 0.5));
          const line = `Sector 1 is ${word(w[0] + j())}, sector 2 is ${word(w[1] + j())}, sector 3 is ${word(w[2] + j())}.`;
          this.push("driver", car.id, `${car.entry.driver.code}: ${line}`);
          pr.note = `${car.entry.driver.code}: ${line}`;
          pr.answered = null; // the question is still open
          pr.expires = Math.max(pr.expires, sim.tick + 300);
        }
        break;
      }
      case "letme": {
        const mate = pr.other ? sim.car(pr.other) : undefined;
        if (!mate) break;
        if (option === "hold") {
          this.applyOrder(car, "hold", mate);
        } else if (option === "swap") {
          this.applyOrder(mate, "letby", car);
        } else {
          this.applyOrder(car, "free", mate);
        }
        break;
      }
      case "fav": {
        const ego = psy.ego;
        if (option === "equal") {
          const believe = m.trust * 0.7 + (1 - ego) * 0.3 > this.rng.next();
          m.grievance = clamp(m.grievance - (believe ? 0.3 : 0.08), 0, 1);
          this.say(car, believe ? REPLY.accept : REPLY.grumble);
        } else if (option === "sorry") {
          m.grievance = clamp(m.grievance - 0.4, 0, 1);
          m.trust = clamp(m.trust + 0.04, 0, 1);
          this.say(car, REPLY.accept);
        } else {
          const ok = psy.obedience * 0.6 + (1 - psy.volatility) * 0.4 > this.rng.next();
          m.grievance = clamp(m.grievance + (ok ? -0.05 : 0.15), 0, 1);
          m.morale = clamp(m.morale - (ok ? 0.01 : 0.06), 0, 1);
          this.say(car, ok ? REPLY.grumble : REPLY.refuse);
        }
        break;
      }
      case "safetycar": {
        if (option === "box") {
          car.pitRequest = chosen ?? pr.compound ?? sim.chooseCompound(car);
          this.eng(car, ENG.pit, { comp: compName(car.pitRequest) });
          respond(0.5);
        } else {
          this.eng(car, ENG.stayOut);
          respond(0);
        }
        break;
      }
      case "redflag": {
        if (option === "keep") car.pitRequest = car.tyre.compound;
        else car.pitRequest = option as Compound;
        this.eng(car, ENG.pit, { comp: compName(car.pitRequest as Compound) });
        this.say(car, REPLY.accept);
        break;
      }
      case "damage": {
        if (option === "box") {
          car.pitRequest = chosen ?? pr.compound ?? sim.chooseCompound(car);
          this.eng(car, ENG.pit, { comp: compName(car.pitRequest) });
          respond(0.6);
        } else respond(-0.3);
        break;
      }
    }
  }

  // ------------------------------------------------------------------ team orders

  /** How the driver takes an instruction. */
  private tone(car: CarState, want: number, strict = false): "accept" | "grumble" | "refuse" {
    const p = this.psy(car);
    const m = this.mood(car.id);
    const disagree = Math.max(0, -want);
    const stubborn = p.selfBelief * 0.5 + p.ego * 0.3 + p.volatility * 0.2;
    const crowd = Math.max(0, (this.chatter.get(car.id) ?? 0) - 3) * 0.04;
    const compliance = p.obedience * 0.55 + m.trust * 0.3 + (1 - stubborn) * 0.15 - disagree * 0.5 * (0.4 + stubborn) + (m.morale - 0.5) * 0.1 + (this.iq(car).composure - 0.5) * 0.15 - crowd;
    const r = this.rng.next();
    if (r < compliance) return disagree > 0.35 ? "grumble" : "accept";
    return strict ? "refuse" : "grumble";
  }

  private applyTone(car: CarState, tone: "accept" | "grumble" | "refuse", want: number) {
    const m = this.mood(car.id);
    const p = this.psy(car);
    if (tone === "accept") {
      m.morale = clamp(m.morale + 0.01, 0, 1);
      m.trust = clamp(m.trust + 0.015, 0, 1);
    } else if (tone === "grumble") {
      m.morale = clamp(m.morale - 0.03 * (0.5 + p.volatility), 0, 1);
      m.trust = clamp(m.trust - 0.01, 0, 1);
    } else {
      m.trust = clamp(m.trust - 0.08, 0, 1);
      m.morale = clamp(m.morale - 0.05, 0, 1);
    }
    void want;
  }

  /** A team order from the UI. */
  order(carId: string, order: TeamOrder) {
    const sim = this.sim;
    const car = sim.car(carId);
    if (!car || !car.entry.human || car.status === "dnf") return;
    const mate = this.mate(car);
    switch (order) {
      case "hold":
        if (mate) this.applyOrder(car, "hold", mate);
        break;
      case "letby":
        if (mate) this.applyOrder(car, "letby", mate);
        break;
      case "free":
        if (mate) this.applyOrder(car, "free", mate);
        break;
      case "pushnow":
        car.push = 2;
        this.active.set(car.id, { kind: "push", until: 0, untilLap: car.lap + 4 });
        this.eng(car, ENG.pushNow);
        {
          // a driver judges a push call by the situation: worn tyres argue against it, but a car right behind another one,
          // or with the race nearly over, has every reason to go for it
          const lapsLeft = sim.cfg.laps - car.lap;
          const closing = car.position > 1 && car.gapAhead > 0 && car.gapAhead < 2.0;
          const lateRace = lapsLeft <= Math.max(3, Math.ceil(car.tyre.wear > 0.6 ? 4 : 0) + 1);
          let want = car.tyre.wear > 0.6 ? -0.3 : 0.4;
          if (closing) want += 0.35;
          if (lateRace) want += 0.35;
          want = Math.min(0.8, want);
          const tone = this.tone(car, want);
          this.say(car, tone === "accept" ? REPLY.accept : REPLY.grumble);
          this.applyTone(car, tone, want);
        }
        break;
      case "savetyres":
        car.push = 0;
        this.active.set(car.id, { kind: "save", until: 0, untilLap: car.lap + 4 });
        this.eng(car, ENG.saveTyres);
        {
          const want = this.psy(car).ego > 0.7 ? -0.3 : 0.1;
          const tone = this.tone(car, want);
          this.say(car, tone === "accept" ? REPLY.accept : REPLY.grumble);
          this.applyTone(car, tone, want);
        }
        break;
      case "stayout":
        if (car.pitRequest) {
          car.pitRequest = null;
          this.eng(car, ENG.stayOut);
          this.suppress.set(car.id + "t", sim.tick + 1200);
          const tone = this.tone(car, car.tyre.wear > 0.8 ? -0.5 : 0);
          this.say(car, tone === "accept" ? REPLY.accept : REPLY.grumble);
          this.applyTone(car, tone, 0);
        }
        break;
    }
  }

  /** Apply a hold / let-by / free instruction to `car`, with respect to `mate`. */
  private applyOrder(car: CarState, kind: "hold" | "letby" | "free", mate: CarState) {
    const sim = this.sim;
    const m = this.mood(car.id);
    const p = this.psy(car);
    // how much this driver wants it
    const behind = car.position > mate.position;
    let want = 0;
    if (kind === "letby") want = -0.4 - 0.6 * p.ego * (1 - p.loyalty * 0.5);
    else if (kind === "hold") want = behind ? -0.3 - 0.5 * p.ego : 0.5;
    else want = 0.6;
    const tone = this.tone(car, want, true);
    const bank = tone === "accept" ? REPLY.accept : tone === "grumble" ? REPLY.grumble : REPLY.refuse;
    this.eng(car, kind === "letby" ? ENG.letby : kind === "hold" ? ENG.hold : ENG.free);
    this.say(car, bank);
    this.applyTone(car, tone, want);
    if (tone === "refuse") {
      this.refused.set(car.id, sim.tick);
      return;
    }
    if (kind === "letby") {
      m.grievance = clamp(m.grievance + 0.22 * p.ego + 0.08, 0, 1);
      this.active.set(car.id, { kind: "letby", other: mate.id, until: sim.tick + 900, untilLap: car.lap + 4 });
    } else if (kind === "hold") {
      if (behind) m.grievance = clamp(m.grievance + 0.14 * p.ego, 0, 1);
      this.active.set(car.id, { kind: "hold", other: mate.id, until: sim.tick + 1800, untilLap: car.lap + 8 });
      // the car in front is told to keep going; it needs no order
    } else {
      this.active.delete(car.id);
      this.active.delete(mate.id);
    }
  }

  private expireOrders() {
    const sim = this.sim;
    for (const [id, a] of [...this.active]) {
      const car = sim.car(id);
      if (!car || car.status === "dnf") {
        this.active.delete(id);
        continue;
      }
      if ((a.kind === "push" || a.kind === "save") && car.lap >= a.untilLap) {
        if (car.push === (a.kind === "push" ? 2 : 0)) car.push = 1;
        this.active.delete(id);
      } else if ((a.kind === "hold" || a.kind === "letby") && sim.tick >= a.until) this.active.delete(id);
    }
  }

  // ------------------------------------------------------------------ engine queries

  /** The attacker has been told not to pass this car. */
  blocksOvertake(attacker: CarState, target: CarState): boolean {
    const a = this.active.get(attacker.id);
    if (a && a.kind === "hold" && a.other === target.id) return true;
    return false;
  }

  /** A bonus to the overtake score when the car ahead has been told to let the attacker through. */
  letByBonus(attacker: CarState, target: CarState): number {
    const a = this.active.get(target.id);
    if (a && a.kind === "letby" && a.other === attacker.id) return 8;
    return 0;
  }

  /** Is this car under orders to give way? Then it eases off when the team-mate is close. */
  yielding(car: CarState, behind: CarState | null): boolean {
    const a = this.active.get(car.id);
    return !!(a && a.kind === "letby" && behind && a.other === behind.id);
  }

  /** The player asked for a decoy call. */
  decoy(carId: string) {
    const sim = this.sim;
    const car = sim.car(carId);
    if (!car || !car.entry.human) return;
    this.push("team", car.id, `${engineerName(car.entry.driver.code).split(" ").slice(-1)[0]} to ${car.entry.driver.code}: ${fill(this.pick(ENG.pit), { call: car.entry.driver.name.split(" ")[0], comp: compName("S") })}`, "bluff");
    // rivals right behind may be fooled
    const i = car.position - 1;
    for (let k = i + 1; k < Math.min(sim.order.length, i + 4); k++) {
      const o = sim.order[k];
      if (o.entry.human || o.status !== "racing" || o.pitRequest) continue;
      const b = sim.strat.brain(o.entry.team.id);
      const p = b.cover * (1.05 - b.skill) * 0.9;
      if (o.gapAhead < 4 && o.tyre.wear > 0.3 && this.rng.chance(p) && o.stops <= o.aiStops) {
        o.pitRequest = sim.chooseCompound(o);
        sim.pushEvent({ tick: sim.tick, kind: "radio", channel: "rival", truth: "honest", carId: o.id, team: o.entry.team.id, text: `${o.entry.driver.code}: ${fill(this.pick(RIVAL.pitCall[this.psy(o).voice]), this.vars(o))} (covering ${car.entry.driver.code})` });
      }
    }
  }

  // ------------------------------------------------------------------ rivals

  private canRival(): boolean {
    return this.sim.tick - this.lastRival > 55;
  }

  private rivalPitCall(car: CarState) {
    if (!this.canRival() && this.rng.chance(0.7)) return;
    const comp = car.pitRequest as Compound;
    const voice = this.psy(car).voice;
    let text = fill(this.pick(RIVAL.pitCall[voice]), this.vars(car));
    if (this.rng.chance(0.4)) text += ` ${cap(compName(comp))} tyres.`;
    this.lastRival = this.sim.tick;
    this.push("rival", car.id, `${car.entry.driver.code}: ${text}`, "honest");
  }

  private rivalLap(car: CarState) {
    const sim = this.sim;
    if (car.status !== "racing" || sim.neutral.active) return;
    const p = this.psy(car);
    const b = sim.strat.brain(car.entry.team.id);
    const human = sim.cars.filter((c) => c.entry.human && c.status !== "dnf");
    const near = human.some((h) => Math.abs(h.gapLeader - car.gapLeader) < 12 && Math.abs(h.position - car.position) <= 4);
    if (!this.canRival()) return;
    const talk = 0.3 + 0.7 * p.talkative;

    // bluff: a fake pit call, aimed at the player's neighbours
    if (near && !car.pitRequest && car.tyre.wear > 0.3 && b.boldness >= 0.6 && this.rng.chance((0.09 + 0.16 * (b.boldness - 0.5)) * (b.style === "gambler" ? 1.6 : 1))) {
      this.lastRival = sim.tick;
      this.push("rival", car.id, `${car.entry.driver.code}: ${fill(this.pick(RIVAL.bluffCall[p.voice]), this.vars(car))}`, "bluff");
      return;
    }
    // bluff: complaining about tyres that are fine
    if (near && car.tyre.wear < 0.35 && car.tyre.ageLaps > 3 && b.boldness >= 0.55 && this.rng.chance(0.03 * talk)) {
      this.lastRival = sim.tick;
      this.push("rival", car.id, `${car.entry.driver.code}: ${fill(this.pick(RIVAL.hintTyres[p.voice]), this.vars(car, { n: 3 }))}`, "bluff");
      return;
    }
    // honest hint: the tyres really are going
    if (car.tyre.wear > 0.68 && this.rng.chance(0.25 * talk)) {
      this.lastRival = sim.tick;
      const left = Math.max(1, Math.round((1 - car.tyre.wear) * sim.life[car.tyre.compound] * 0.8));
      this.push("rival", car.id, `${car.entry.driver.code}: ${fill(this.pick(RIVAL.hintTyres[p.voice]), this.vars(car, { n: left }))}`, "hint");
      return;
    }
    // rain: the driver reports what he feels
    if (sim.weather && sim.wx) {
      const key = car.id;
      const here = car.wetD;
      const last = this.lastReportedLap.get(key) ?? -9;
      if (here > 0.06 && !isWetCompound(car.tyre.compound) && car.lap - last > 4 && this.rng.chance(0.5 * talk)) {
        this.lastReportedLap.set(key, car.lap);
        this.lastRival = sim.tick;
        this.push("rival", car.id, `${car.entry.driver.code}: ${fill(this.pick(RIVAL.hintRain[p.voice]), this.vars(car))}`, "hint");
        return;
      }
    }
    // filler
    if (this.rng.chance(0.035 * talk)) {
      this.lastRival = sim.tick;
      const bank = this.rng.chance(0.5) ? RIVAL.noiseGap : RIVAL.noiseChat;
      this.push("rival", car.id, `${car.entry.driver.code}: ${fill(this.pick(bank[p.voice]), this.vars(car))}`, "noise");
    }
  }

  private rivalChatter() {
    // reserved for future ambient lines
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function compName(c: Compound): string {
  return { S: "soft", M: "medium", H: "hard", I: "intermediate", W: "full wet" }[c];
}
