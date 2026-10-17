import { openConvo } from "./convo";
import { roleGap } from "./status";
import { boardMove } from "./board";
import type { Rng } from "../sim/rng";
import { baseTeam, standingsRank, staffOf, teamRanking } from "./car";
import { news, pushCard, recap, ticker } from "./cards";
import { askingSalary, staffAsk } from "./contracts";
import { driversOf } from "./finance";
import { recordQuote, riftAfterRace } from "./dressing";
import { clamp, fmtDay, fmtMoney, isHuman, rngFor, round2 } from "./util";
import { STAFF_LABEL, type CareerState, type DriverState, type OwnerState, type PromiseItem } from "./types";
import { multiply } from "./factors";
import { hireScore } from "./capability";

/**
 * The people layer: how drivers feel, what the player has promised, what the press asks, what the owner wants,
 * who is fighting whom, and what the history books say. Every number here is the game's own design.
 */

const OWNER_NAMES = ["Marcus Hale", "Idris Okafor", "Helena Voss", "Tomas Reiner", "Priya Nair", "Sofia Lindqvist", "Dmitri Kask", "Amelia Strand"];

export function makeOwner(_s: CareerState, rng: Rng): OwnerState {
  return { name: rng.pick(OWNER_NAMES), trust: 0.6, goal: { kind: "growth", text: "Finish a place higher than last year", done: null, arg: 6 } };
}

// ---------------------------------------------------------------- the grievance ladder

export const G_STAGE = ["Content", "A little quiet", "Muttering to the press", "Wants a meeting", "Making demands", "Wants out"];
const G_AT = [0, 0.14, 0.28, 0.42, 0.58, 0.76];
export const stageOfGrievance = (g: number) => {
  let st = 0;
  for (let i = 0; i < G_AT.length; i++) if (g >= G_AT[i]) st = i;
  return st;
};

export const CAUSE_LABEL: Record<string, string> = {
  car: "The car is slower than he thinks he deserves",
  teammate: "Losing to his team-mate",
  role: "His status in the team",
  pay: "He feels underpaid",
  results: "The team is behind its target",
  morale: "General low morale",
  contract: "His contract is running out",
  promise: "A promise that was not kept",
  rumour: "Reading about other teams wanting him",
  tenure: "Years with the team (loyalty)",
  success: "The team is ahead of its target",
  slight: "Things the team did that he took badly",
  strategy: "A strategy call that went against him",
  orders: "Being told to give up a position",
};

const egoOf = (d: DriverState) => (d.spec.psyche as { ego?: number } | undefined)?.ego ?? 0.5;
const loyaltyOf = (d: DriverState) => (d.spec.psyche as { loyalty?: number } | undefined)?.loyalty ?? 0.5;

function paceRank(s: CareerState, d: DriverState): number {
  const all = Object.values(s.drivers).filter((x) => x.teamId && !x.retired);
  return 1 + all.filter((x) => x.spec.pace > d.spec.pace).length;
}

/** Works out the causes of one driver's grievance this week, as signed contributions. */
export function grievanceCauses(s: CareerState, d: DriverState): Record<string, number> {
  const out: Record<string, number> = {};
  if (!d.teamId) return out;
  const order = s.round >= 3 ? standingsRank(s) : teamRanking(s);
  const tRank = order.indexOf(d.teamId) + 1;
  const dRank = paceRank(s, d);
  const amb = 0.55 + egoOf(d) * 0.6;
  out.car = round2(clamp((tRank * 2 - dRank) / 10, 0, 1) * 0.5 * amb);
  const mate = driversOf(s, d.teamId).find((x) => x.id !== d.id);
  if (mate) {
    const p1 = s.standings.drivers[d.id] ?? 0;
    const p2 = s.standings.drivers[mate.id] ?? 0;
    if (s.round >= 3 && p2 > p1 * 1.5 + 10) out.teammate = 0.16;
    // what he thinks he is worth next to his team-mate against the label he has been given
    const gap = roleGap(d, mate);
    out.role = gap > 0 ? 0.34 * gap * amb : d.role === "number1" ? -0.08 : 0;
    if (d.role === "number2" && d.spec.pace > mate.spec.pace) out.role = (out.role ?? 0) + 0.1 * amb;
  }
  // things the team did that he took badly, fading over about ten weeks
  const sl = (d.stat?.slights ?? []).reduce((a, x) => a + x.weight * clamp(1 - (s.day - x.day) / 70, 0, 1), 0);
  if (sl > 0.01) out.slight = round2(clamp(sl * 0.7, 0, 0.3));
  const ask = askingSalary(s, d);
  if (d.salary < ask * 0.85) out.pay = round2(clamp(((ask - d.salary) / ask) * 0.5, 0, 0.25));
  const target = s.teams[d.teamId].objectives[0]?.target ?? 6;
  const behind = tRank - target;
  if (behind >= 1 && s.round >= 3) out.results = round2(clamp(behind * 0.04, 0, 0.14));
  if (behind <= -1 && s.round >= 3) out.success = -0.1;
  out.morale = round2(clamp((0.6 - d.morale) * 0.4, -0.08, 0.2));
  if (d.endYear <= s.year && d.teamId === s.teamId) out.contract = 0.06;
  if (d.tenure >= 3 && loyaltyOf(d) > 0.55) out.tenure = -0.05;
  out.promise = round2((d.causes.promise ?? 0) * 0.975);
  out.rumour = round2((d.causes.rumour ?? 0) * 0.95);
  if ((d.causes.noResign ?? 0) > 0) out.noResign = 1;
  for (const k of Object.keys(out)) if (out[k] === 0) delete out[k];
  return out;
}

export function addCause(d: DriverState, key: string, v: number) {
  d.causes[key] = round2(clamp((d.causes[key] ?? 0) + v, 0, 0.6));
}

function topCause(d: DriverState): string {
  let best = "";
  let bv = 0.01;
  for (const [k, v] of Object.entries(d.causes)) {
    if (k === "noResign" || k === "success" || k === "tenure") continue;
    if (v > bv) {
      bv = v;
      best = k;
    }
  }
  return best;
}
export { topCause };

export function weeklyPeople(s: CareerState, only?: string) {
  for (const d of Object.values(s.drivers)) {
    if (!d.teamId || d.retired) continue;
    if (only ? d.teamId !== only : d.teamId !== s.teamId && isHuman(s, d.teamId)) continue;
    const c = grievanceCauses(s, d);
    d.causes = c;
    const sum = Object.entries(c).reduce((a, [k, v]) => (k === "noResign" ? a : a + v), 0);
    const target = clamp(sum, 0, 1);
    d.grievance = round2(d.grievance + (target - d.grievance) * 0.14);
    const now = stageOfGrievance(d.grievance);
    const mine = d.teamId === s.teamId;
    if (now > d.gStage) {
      d.gStage = now;
      raiseStage(s, d, now, mine);
    } else if (now < d.gStage - 0 && d.grievance < G_AT[d.gStage] - 0.04) {
      d.gStage = now;
    }
  }
}

function raiseStage(s: CareerState, d: DriverState, stage: number, mine: boolean) {
  const why = topCause(d);
  const reason = CAUSE_LABEL[why] ?? "several things";
  const team = baseTeam(d.teamId as string).name;
  if (stage === 2) {
    news(s, `${d.spec.name} hints he is not happy at ${team}.`, { importance: mine ? 3 : 2, cause: reason, tag: "people" });
    if (mine) ticker(s, `${d.spec.name} is muttering to the press.`, 2);
    return;
  }
  if (stage === 3) {
    if (!mine) {
      news(s, `${d.spec.name} asks ${team} for talks about his future.`, { importance: 2, cause: reason, tag: "people" });
      return;
    }
    const fix = fixFor(why);
    pushCard(
      s,
      "event",
      `${d.spec.name} wants a meeting`,
      `${d.spec.name} has asked to talk. The main thing on his mind: ${reason.toLowerCase()}. Left alone, this tends to get worse. How do you handle it?`,
      [
        { id: "fix", label: fix.label, detail: fix.detail },
        { id: "listen", label: "Hear him out", detail: "Eases it a little, promises nothing" },
        { id: "dismiss", label: "Tell him to focus on driving", detail: "Saves effort, but he will remember" },
      ],
      { urgency: 2, deadline: s.day + 10, defaultOption: "dismiss", data: { ev: "g3", driverId: d.id, cause: why } },
    );
    return;
  }
  if (stage === 4) {
    if (!mine) {
      news(s, `${d.spec.name} is making demands of ${team}.`, { importance: 2, cause: reason, tag: "people" });
      return;
    }
    const fix = fixFor(why);
    pushCard(
      s,
      "event",
      `${d.spec.name} is making demands`,
      `${d.spec.name} says he cannot go on like this: ${reason.toLowerCase()}. He wants a clear answer within two weeks.`,
      [
        { id: "fix", label: fix.label, detail: "A real change, he will accept it" },
        { id: "hold", label: "Hold firm", detail: "He stays for now and gets angrier" },
        { id: "release", label: "Let him go at the end of the year", detail: "He leaves when the season ends" },
      ],
      { urgency: 3, deadline: s.day + 14, defaultOption: "hold", data: { ev: "g4", driverId: d.id, cause: why } },
    );
    return;
  }
  if (stage >= 5) {
    d.causes.noResign = 1;
    if (!mine) {
      d.endYear = Math.min(d.endYear, s.year);
      news(s, `${d.spec.name} wants out of ${team} and will leave when the season ends.`, { importance: 3, cause: reason, tag: "people" });
      return;
    }
    pushCard(
      s,
      "event",
      `${d.spec.name} wants to leave`,
      `${d.spec.name} has told you he will not sign again and wants out. ${d.endYear > s.year ? `His contract runs to ${d.endYear}.` : "His contract ends this year."} You can let him go at the end of this season, or hold him to his deal and live with a driver who does not want to be here.`,
      [
        { id: "allow", label: "Let him go at the end of the year", detail: "A clean break, a seat to fill" },
        { id: "refuse", label: "Hold him to his contract", detail: "He stays, morale drops, he will not renew" },
      ],
      { urgency: 3, deadline: s.day + 14, defaultOption: "allow", data: { ev: "g5", driverId: d.id, cause: why } },
    );
  }
}

function fixFor(cause: string): { label: string; detail: string } {
  switch (cause) {
    case "car":
      return { label: "Promise a real upgrade soon", detail: "A big part must be fitted in the next 10 weeks" };
    case "teammate":
    case "role":
      return { label: "Make him number one", detail: "His team-mate may not like it" };
    case "pay":
      return { label: "Give him a raise", detail: "About 15 percent more a year" };
    case "promise":
      return { label: "Apologise and recommit", detail: "Costs nothing, helps a little" };
    case "contract":
      return { label: "Offer him a new deal", detail: "Open the People screen" };
    default:
      return { label: "Sit down with him properly", detail: "Costs a day, helps a little" };
  }
}

export function resolveGrievance(s: CareerState, c: { data?: Record<string, number | string | boolean> }, option: string) {
  const d = s.drivers[String(c.data?.driverId)];
  if (!d || d.teamId !== s.teamId) return;
  const ev = String(c.data?.ev);
  const cause = String(c.data?.cause ?? "");
  const st = s.story;
  const big = ev === "g4";
  if (ev === "g5") {
    if (option === "allow") {
      d.endYear = Math.min(d.endYear, s.year);
      d.grievance = round2(d.grievance - 0.1);
      recap(s, `${d.spec.name} will leave at the end of the year.`);
    } else {
      d.morale = clamp(d.morale - 0.2, 0, 1);
      st.tone = clamp(st.tone - 0.1, -1, 1);
      recap(s, `${d.spec.name} stays, unhappy.`);
    }
    return;
  }
  if (option === "fix") {
    const rel = big ? 0.2 : 0.12;
    const mate = driversOf(s, s.teamId).find((x) => x.id !== d.id);
    if (cause === "car") makePromise(s, d.id, "upgrade", "A big upgrade within 10 weeks", 70, s.round);
    else if (cause === "teammate" || cause === "role") {
      d.role = "number1";
      if (mate) {
        mate.role = "number2";
        addCause(mate, "role", 0.08);
        mate.morale = clamp(mate.morale - 0.06, 0, 1);
      }
    } else if (cause === "pay") {
      d.salary = round2(d.salary * 1.15);
      s.teams[s.teamId].ledger.drivers += 0;
    } else if (cause === "promise") d.causes.promise = round2((d.causes.promise ?? 0) * 0.4);
    d.grievance = round2(clamp(d.grievance - rel, 0, 1));
    d.morale = clamp(d.morale + 0.06, 0, 1);
    st.tone = clamp(st.tone + 0.03, -1, 1);
    recap(s, `You met ${d.spec.name}: ${cause === "pay" ? "he gets a raise" : cause === "car" ? "you promised an upgrade" : "it helped"}.`);
  } else if (option === "listen") {
    // a real conversation: he says what is on his mind and you answer him (see convo.ts)
    openConvo(s, d, cause ? [cause] : undefined);
    d.gStage = stageOfGrievance(d.grievance);
    return;
  } else if (option === "dismiss") {
    d.grievance = round2(clamp(d.grievance + 0.05, 0, 1));
    st.tone = clamp(st.tone - 0.08, -1, 1);
    d.trust = clamp(d.trust - 0.1, 0, 1);
  } else if (option === "hold") {
    d.grievance = round2(clamp(d.grievance + 0.04, 0, 1));
    d.trust = clamp(d.trust - 0.1, 0, 1);
    st.tone = clamp(st.tone - 0.05, -1, 1);
  } else if (option === "release") {
    d.endYear = Math.min(d.endYear, s.year);
    d.causes.noResign = 1;
    recap(s, `${d.spec.name} will leave at the end of the year.`);
  }
  d.gStage = stageOfGrievance(d.grievance);
}

// ---------------------------------------------------------------- promises

export const PROMISE_DAYS: Record<PromiseItem["kind"], number> = { upgrade: 70, seat: 330, number1: 200, title: 300, academy: 300, noSwap: 300 };
export const PROMISE_TEXT: Record<PromiseItem["kind"], string> = {
  upgrade: "A big upgrade within 10 weeks",
  seat: "His seat is safe for the whole deal",
  number1: "He stays the team's number one",
  title: "A top three finish in the constructors",
  academy: "The academy produces a driver for your team",
  noSwap: "You will not swap him for another driver",
};
/** How each promise is judged on its date, in plain words. */
export const PROMISE_JUDGE: Record<PromiseItem["kind"], string> = {
  upgrade: "Kept if a part that gained at least 0.05 s a lap has gone on the car by then.",
  seat: "Kept if he is still driving for you then.",
  number1: "Kept if he is still your number one then.",
  title: "Kept if your team is in the top three of the constructors' table then.",
  academy: "Kept if one more of your academy drivers has been raised to a race seat with you by then. He wants to see the academy pay off.",
  noSwap: "Kept if he is still in the team then and you have not replaced him.",
};
export const PROMISE_ASK: Record<PromiseItem["kind"], string> = {
  upgrade: "Wants the car to improve",
  seat: "Wants security",
  number1: "Wants to be the lead driver",
  title: "Wants a winning car",
  academy: "Cares about the team's future",
  noSwap: "Wants loyalty",
};

/** Player-made promise from the People screen. Eases the mood now, costs trust if it is broken. */
export function promiseTo(s: CareerState, driverId: string, kind: PromiseItem["kind"]): { ok: boolean; message: string } {
  const d = s.drivers[driverId];
  if (!d || d.teamId !== s.teamId) return { ok: false, message: "Not your driver." };
  if (s.promises.some((p) => p.driverId === driverId && p.kind === kind && p.kept === undefined)) return { ok: false, message: "You already promised him that." };
  if (s.promises.filter((p) => p.driverId === driverId && p.kept === undefined).length >= 2) return { ok: false, message: "He is already holding two promises from you." };
  if (kind === "number1" && d.role !== "number1") return { ok: false, message: "He is not your number one." };
  makePromise(s, driverId, kind, PROMISE_TEXT[kind], PROMISE_DAYS[kind], kind === "academy" ? (s.academy?.graduates.length ?? 0) : s.round);
  d.grievance = round2(clamp(d.grievance - 0.05, 0, 1));
  d.causes.promise = round2((d.causes.promise ?? 0) * 0.8);
  return { ok: true, message: `You promised ${d.spec.name}: ${PROMISE_TEXT[kind].toLowerCase()}. It will be judged on ${fmtDay(s.day + PROMISE_DAYS[kind])}. ${PROMISE_JUDGE[kind]}` };
}

export function makePromise(s: CareerState, driverId: string, kind: PromiseItem["kind"], text: string, days: number, arg?: number) {
  const id = s.uid++;
  s.promises.push({ id, driverId, kind, text, made: s.day, due: s.day + days, arg });
}

export function settlePromises(s: CareerState) {
  const me = s.teams[s.teamId];
  for (const p of s.promises) {
    if (p.kept !== undefined || s.day < p.due) continue;
    const d = s.drivers[p.driverId];
    if (!d) {
      p.kept = false;
      continue;
    }
    let kept = true;
    if (p.kind === "upgrade") {
      kept = me.projects.some((x) => x.status === "fitted" && (x.fittedRound ?? 0) > (p.arg ?? 0) && (x.delivered ?? 0) >= 0.05);
    } else if (p.kind === "number1") kept = d.role === "number1" && d.teamId === s.teamId;
    else if (p.kind === "seat" || p.kind === "noSwap") kept = d.teamId === s.teamId && d.endYear >= s.year;
    else if (p.kind === "academy") kept = (s.academy?.graduates.length ?? 0) > (p.arg ?? 0);
    else if (p.kind === "title") kept = teamRanking(s).indexOf(s.teamId) < 3;
    p.kept = kept;
    if (kept) {
      d.trust = clamp(d.trust + 0.1, 0, 1);
      d.grievance = round2(clamp(d.grievance - 0.06, 0, 1));
      s.story.tone = clamp(s.story.tone + 0.04, -1, 1);
      recap(s, `Promise kept to ${d.spec.name}: ${p.text.toLowerCase()}.`);
    } else {
      addCause(d, "promise", 0.3);
      d.trust = clamp(d.trust - 0.2, 0, 1);
      s.story.tone = clamp(s.story.tone - 0.1, -1, 1);
      news(s, `${d.spec.name} says the team did not keep its word: "${p.text}".`, { importance: 2, cause: "A broken promise", tag: "people" });
      pushCard(s, "promise", `A promise was missed`, `You told ${d.spec.name}: "${p.text}". It did not happen. He noticed, and his trust in you has dropped.`, [{ id: "ok", label: "Understood" }], { urgency: 2, deadline: s.day + 8 });
    }
  }
  if (s.promises.length > 40) s.promises = s.promises.filter((p) => p.kept === undefined || s.day - p.due < 365);
}

// ---------------------------------------------------------------- media

interface Q {
  id: string;
  weight: (s: CareerState) => number;
  text: (s: CareerState) => string;
  opts: { id: string; label: string; detail: string; eff: (s: CareerState) => void }[];
}

const mood = (s: CareerState, f: number) => {
  for (const d of driversOf(s, s.teamId)) d.morale = clamp(d.morale + f, 0, 1);
};
/** What a press answer does is its base size times how far the paddock trusts the team and how hot the story is. */
const pressMul = (s: CareerState) => {
  const f = multiply(s, s.teamId, ["reputation", "story"]).value;
  const avgTrust = driversOf(s, s.teamId).reduce((a, d) => a + d.trust, 0) / Math.max(1, driversOf(s, s.teamId).length);
  return clamp(f * (0.8 + 0.4 * avgTrust), 0.6, 1.6);
};
const tone = (s: CareerState, v: number) => (s.story.tone = clamp(s.story.tone + v * pressMul(s), -1, 1));
const unhappy = (s: CareerState) => driversOf(s, s.teamId).filter((d) => d.gStage >= 2).sort((a, b) => b.grievance - a.grievance)[0];
const board = (s: CareerState, v: number) => {
  const t = s.teams[s.teamId];
  boardMove(s, t, v * pressMul(s), "The owner");
};
const sponsors = (s: CareerState, v: number) => {
  for (const sp of s.teams[s.teamId].sponsors) sp.mood = clamp(sp.mood + v, 0, 1);
};

const QUESTIONS: Q[] = [
  {
    id: "mood",
    weight: () => 1,
    text: () => `A reporter asks how the mood is inside the team this week.`,
    opts: [
      { id: "up", label: "\"Everyone is buzzing\"", detail: "Drivers feel good, but only if it is true", eff: (s) => mood(s, 0.02) },
      { id: "honest", label: "\"We have work to do\"", detail: "Honest, owner notes it", eff: (s) => { tone(s, 0.05); board(s, 0.3); } },
      { id: "deflect", label: "\"No comment\"", detail: "Nothing changes", eff: () => undefined },
    ],
  },
  {
    id: "behind",
    weight: (s) => (s.round >= 3 && teamRanking(s).indexOf(s.teamId) + 1 > (s.teams[s.teamId].objectives[0]?.target ?? 6) ? 3 : 0),
    text: (s) => `You are behind the owner's target of "${s.teams[s.teamId].objectives[0]?.text ?? "the target"}". A journalist asks if you are getting the results the owner expects.`,
    opts: [
      { id: "back", label: "\"We back the plan\"", detail: "Owner trust up a little, press unconvinced", eff: (s) => { s.owner.trust = clamp(s.owner.trust + 0.03, 0, 1); board(s, 0.5); } },
      { id: "own", label: "\"We got it wrong\"", detail: "Staff respect it, the board winces", eff: (s) => { board(s, -1); for (const st of Object.values(s.staff)) if (st.teamId === s.teamId) st.mood = clamp(st.mood + 0.03, 0, 1); tone(s, 0.05); } },
      { id: "no", label: "\"No comment\"", detail: "Nothing changes", eff: () => undefined },
    ],
  },
  {
    id: "unhappy",
    weight: (s) => (unhappy(s) ? 4 : 0),
    text: (s) => `The press asks whether ${unhappy(s)?.spec.name ?? "your driver"} is unhappy at the team.`,
    opts: [
      { id: "support", label: "\"He has our full support\"", detail: "Eases him a little", eff: (s) => { const d = unhappy(s); if (d) { d.grievance = round2(clamp(d.grievance - 0.04, 0, 1)); d.trust = clamp(d.trust + 0.04, 0, 1); } } },
      { id: "listen", label: "\"We are listening to him\"", detail: "Honest, small relief", eff: (s) => { const d = unhappy(s); if (d) d.grievance = round2(clamp(d.grievance - 0.02, 0, 1)); tone(s, 0.04); } },
      { id: "focus", label: "\"He should focus on driving\"", detail: "He will not like it", eff: (s) => { const d = unhappy(s); if (d) { d.grievance = round2(clamp(d.grievance + 0.05, 0, 1)); d.trust = clamp(d.trust - 0.06, 0, 1); } tone(s, -0.06); } },
    ],
  },
  {
    id: "numberOne",
    weight: (s) => {
      const ds = driversOf(s, s.teamId);
      if (ds.length < 2 || s.round < 4) return 0;
      const a = s.standings.drivers[ds[0].id] ?? 0;
      const b = s.standings.drivers[ds[1].id] ?? 0;
      return Math.abs(a - b) < Math.max(8, 0.15 * Math.max(a, b)) && a + b > 20 ? 2.5 : 0;
    },
    text: () => `Your two drivers are level on points. Who is the team leader?`,
    opts: [
      { id: "equal", label: "\"They are equals\"", detail: "Both calm, no clarity", eff: (s) => mood(s, 0.01) },
      { id: "leader", label: "\"We back whoever scores\"", detail: "The leader is pleased, the other is not", eff: (s) => { const ds = driversOf(s, s.teamId).sort((a, b) => (s.standings.drivers[b.id] ?? 0) - (s.standings.drivers[a.id] ?? 0)); if (ds[0]) ds[0].grievance = round2(clamp(ds[0].grievance - 0.03, 0, 1)); if (ds[1]) ds[1].grievance = round2(clamp(ds[1].grievance + 0.03, 0, 1)); } },
      { id: "track", label: "\"They will decide it on track\"", detail: "Both fired up, risk of a clash", eff: (s) => { mood(s, 0.02); s.story.arcs.clash = (s.story.arcs.clash ?? 0) + 1; } },
    ],
  },
  {
    id: "rookie",
    weight: (s) => ((s.teams[s.teamId].dev?.log ?? []).some((e) => e.kind === "landed" && s.day - e.day < 21 && e.staffId && s.staff[e.staffId]?.intern) ? 4 : 0),
    text: (s) => {
      const e = [...(s.teams[s.teamId].dev?.log ?? [])].reverse().find((x) => x.kind === "landed" && x.staffId && s.staff[x.staffId]?.intern);
      return `${e?.staffId ? s.staff[e.staffId].name : "A trainee"} is a trainee, and the part he designed works. A reporter asks if you are hiding the next big talent.`;
    },
    opts: [
      { id: "credit", label: "\"Give him the credit\"", detail: "He is thrilled, rivals notice his name", eff: (s) => { const e = [...(s.teams[s.teamId].dev?.log ?? [])].reverse().find((x) => x.kind === "landed" && x.staffId && s.staff[x.staffId]?.intern); const st = e?.staffId ? s.staff[e.staffId] : undefined; if (st) { st.mood = clamp(st.mood + 0.1, 0, 1); st.known = clamp(st.known + 0.15, 0, 1); } tone(s, 0.06); } },
      { id: "team", label: "\"It was the whole team\"", detail: "Safe, and the room likes it a little", eff: (s) => { for (const x of Object.values(s.staff)) if (x.teamId === s.teamId) x.mood = clamp(x.mood + 0.02, 0, 1); } },
      { id: "no", label: "\"No comment\"", detail: "Nothing changes", eff: () => undefined },
    ],
  },
  {
    id: "upgrade",
    weight: (s) => {
      const f = s.teams[s.teamId].projects.filter((p) => p.status === "fitted" && p.fittedRound === s.round && (p.delivered ?? 0) < (p.predLo + p.predHi) / 2 - 0.02);
      return f.length ? 3.5 : 0;
    },
    text: () => `The last upgrade did not deliver what the factory promised. A reporter wants to know why.`,
    opts: [
      { id: "factory", label: "\"The factory fell short\"", detail: "Deflects blame, designers resent it", eff: (s) => { const d = staffOf(s, s.teamId, "designer"); if (d) d.mood = clamp(d.mood - 0.08, 0, 1); const last = [...(s.teams[s.teamId].dev?.log ?? [])].reverse().find((e) => e.kind === "missed" && e.staffId); const au = last?.staffId ? s.staff[last.staffId] : undefined; if (au && au.id !== d?.id) au.mood = clamp(au.mood - 0.08, 0, 1); tone(s, -0.05); } },
      { id: "own", label: "\"We read the data wrong\"", detail: "Staff respect it", eff: (s) => { const d = staffOf(s, s.teamId, "designer"); if (d) d.mood = clamp(d.mood + 0.04, 0, 1); tone(s, 0.05); } },
      { id: "time", label: "\"It needs time\"", detail: "Nothing changes", eff: () => undefined },
    ],
  },
  {
    id: "rival",
    weight: (s) => (s.rivalries.some((r) => r.heat > 0.5) ? 2.5 : 0),
    text: (s) => {
      const r = s.rivalries.sort((a, b) => b.heat - a.heat)[0];
      return `${s.drivers[r.a]?.spec.name ?? "A driver"} and ${s.drivers[r.b]?.spec.name ?? "another"} keep clashing on track. Are you at war with that team?`;
    },
    opts: [
      { id: "cool", label: "\"Hard but fair racing\"", detail: "Cools the rivalry", eff: (s) => { const r = s.rivalries.sort((a, b) => b.heat - a.heat)[0]; if (r) r.heat = round2(r.heat * 0.7); } },
      { id: "fuel", label: "\"They know what they did\"", detail: "Heats it up, sponsors like the drama", eff: (s) => { const r = s.rivalries.sort((a, b) => b.heat - a.heat)[0]; if (r) r.heat = round2(Math.min(1.5, r.heat + 0.2)); sponsors(s, 0.02); tone(s, -0.05); } },
      { id: "no", label: "\"No comment\"", detail: "Nothing changes", eff: () => undefined },
    ],
  },
  {
    id: "academy",
    weight: (s) => (Object.values(s.academy.prospects).some((p) => p.owner === s.teamId && p.status === "academy" && p.confidence > 0.6) ? 1.5 : 0),
    text: (s) => {
      const p = Object.values(s.academy.prospects).find((x) => x.owner === s.teamId && x.status === "academy");
      return `A reporter asks when your academy driver ${p?.name ?? "prospect"} will be in a race seat.`;
    },
    opts: [
      { id: "hype", label: "\"Soon. He is special\"", detail: "Confidence up, pressure up", eff: (s) => { const p = Object.values(s.academy.prospects).find((x) => x.owner === s.teamId && x.status === "academy"); if (p) { p.confidence = clamp(p.confidence + 0.04, 0, 1); p.fatigue = clamp(p.fatigue + 0.03, 0, 1); } } },
      { id: "patient", label: "\"When he is ready\"", detail: "Steady, no change", eff: () => undefined },
      { id: "no", label: "\"No comment\"", detail: "Nothing changes", eff: () => undefined },
    ],
  },
  {
    id: "era",
    weight: (s) => (s.era.next && s.era.next.stage >= 1 && s.era.mode === "natural" ? 2 : 0),
    text: () => `Reporters ask what you think of the new regulations being prepared.`,
    opts: [
      { id: "praise", label: "\"A step in the right direction\"", detail: "The rulemakers listen more to you", eff: (s) => { s.era.influence = Math.min(8, s.era.influence + 1); } },
      { id: "criticise", label: "\"Several parts worry us\"", detail: "Press like it, rulemakers less so", eff: (s) => { s.era.influence = Math.max(0, s.era.influence - 1); sponsors(s, 0.01); } },
      { id: "no", label: "\"Too early to say\"", detail: "Nothing changes", eff: () => undefined },
    ],
  },
  {
    id: "money",
    weight: (s) => (s.teams[s.teamId].cash < 25 ? 3 : 0),
    text: () => `The press has heard the team is short of money. Is that true?`,
    opts: [
      { id: "deny", label: "\"We are fine\"", detail: "Sponsors calm, if it holds", eff: (s) => sponsors(s, 0.01) },
      { id: "honest", label: "\"We are watching every dollar\"", detail: "Owner approves", eff: (s) => { s.owner.trust = clamp(s.owner.trust + 0.03, 0, 1); } },
      { id: "no", label: "\"No comment\"", detail: "Sponsors uneasy", eff: (s) => sponsors(s, -0.02) },
    ],
  },
];

/** Race-week Thursday: the press conference. When nothing is going on, there is none. */
export function pressConference(s: CareerState) {
  const st = s.story;
  if (s.cards.some((c) => c.kind === "media")) return;
  if (!s.history.every((h) => h.year !== s.year)) return;
  if (s.round === 0 && s.day < (s.calendar[0]?.day ?? 0) - 4) return;
  const rng = rngFor(s, `media:${s.day}`);
  const pool = QUESTIONS.map((q) => ({ q, w: q.weight(s) + (q.id === "mood" ? s.press.heat * 2 : 0) })).filter((x) => x.w > 0);
  const real = pool.filter((x) => x.q.id !== "mood");
  if (!real.length && !rng.chance(0.3 + s.press.heat)) {
    news(s, "No press conference this week: nothing worth asking about.", { importance: 1, tag: "people" });
    return;
  }
  const total = pool.reduce((a, x) => a + x.w, 0);
  let r = rng.next() * total;
  let pick = pool[0].q;
  for (const x of pool) {
    r -= x.w;
    if (r <= 0) {
      pick = x.q;
      break;
    }
  }
  st.mediaDay = s.day;
  st.mediaCount += 1;
  pushCard(s, "media", "Thursday press conference", pick.text(s), pick.opts.map((o) => ({ id: o.id, label: o.label, detail: o.detail })), { urgency: 1, deadline: s.day + 2, defaultOption: pick.opts[pick.opts.length - 1].id, data: { q: pick.id } });
}

export function resolveMedia(s: CareerState, qid: string, option: string) {
  const q = QUESTIONS.find((x) => x.id === qid);
  const o = q?.opts.find((x) => x.id === option);
  if (o) o.eff(s);
  recordQuote(s, qid, option);
}

// ---------------------------------------------------------------- owner and board

export function ownerNewSeason(s: CareerState) {
  const me = s.teams[s.teamId];
  const o = s.owner;
  const lastPos = s.history.length ? s.history[s.history.length - 1].playerPos : 6;
  const youngAcademy = Object.values(s.academy.prospects).some((p) => p.owner === s.teamId && p.status === "academy" && s.year - p.born >= 17);
  const rng = rngFor(s, "owner");
  let kind: OwnerState["goal"]["kind"] = "growth";
  if (youngAcademy && rng.chance(0.5)) kind = "young";
  else if (me.cash < 40 && rng.chance(0.6)) kind = "budget";
  else if (me.facilities.tunnel >= 4 && rng.chance(0.4)) kind = "reliability";
  if (kind === "growth") o.goal = { kind, text: `Finish higher than ${lastPos}${lastPos === 1 ? " (defend the title)" : ""}`, done: null, arg: lastPos };
  if (kind === "young") o.goal = { kind, text: "Have a driver under 24 score points", done: null };
  if (kind === "budget") o.goal = { kind, text: "End the year with more cash than you start with", done: null, arg: me.cash };
  if (kind === "reliability") o.goal = { kind, text: "Fit at least 5 parts that really deliver", done: null };
}

export function ownerYearEnd(s: CareerState): string[] {
  const o = s.owner;
  const me = s.teams[s.teamId];
  const notes: string[] = [];
  const pos = s.history[s.history.length - 1]?.playerPos ?? 6;
  let done = false;
  if (o.goal.kind === "growth") done = pos < (o.goal.arg ?? 6) || pos === 1;
  if (o.goal.kind === "young") done = driversOf(s, s.teamId).some((d) => s.year - (d.spec.born ?? 0) < 24 && (s.standings.drivers[d.id] ?? 0) > 0);
  if (o.goal.kind === "budget") done = me.cash > (o.goal.arg ?? 0);
  if (o.goal.kind === "reliability") done = me.projects.filter((p) => p.fittedYear === s.year && (p.delivered ?? 0) > 0.02).length >= 5;
  o.goal.done = done;
  o.trust = clamp(o.trust + (done ? 0.1 : -0.1), 0, 1);
  boardMove(s, me, done ? 3 : -2, done ? "The owner's second goal met" : "The owner's second goal missed");
  notes.push(`${o.name}'s second goal ("${o.goal.text}"): ${done ? "met" : "missed"}.`);
  return notes;
}

// ---------------------------------------------------------------- rivalries, records, history

export function afterRace(s: CareerState, order: string[], dnf: string[], skipWorld = false) {
  riftAfterRace(s, order, dnf);
  if (skipWorld) return;
  // adjacent finishers near the front heat up
  const top = order.filter((id) => !dnf.includes(id)).slice(0, 8);
  const bump = (a: string, b: string, v: number) => {
    const [x, y] = a < b ? [a, b] : [b, a];
    let r = s.rivalries.find((q) => q.a === x && q.b === y);
    if (!r) {
      r = { a: x, b: y, heat: 0, lines: [] };
      s.rivalries.push(r);
    }
    const before = r.heat;
    r.heat = round2(Math.min(1.5, r.heat + v));
    if (before < 0.6 && r.heat >= 0.6) {
      const da = s.drivers[x];
      const db = s.drivers[y];
      news(s, `${da?.spec.name} and ${db?.spec.name} are now a proper rivalry.`, { importance: 2, cause: "They keep finishing next to each other and trading places", tag: "rivalry" });
    }
  };
  for (let i = 0; i < top.length - 1; i++) {
    const a = s.drivers[top[i]];
    const b = s.drivers[top[i + 1]];
    if (!a || !b || a.teamId === b.teamId) continue;
    bump(top[i], top[i + 1], 0.06 + (i < 3 ? 0.04 : 0));
  }
  for (const r of s.rivalries) r.heat = round2(r.heat * 0.97);
  s.rivalries = s.rivalries.filter((r) => r.heat > 0.05).sort((a, b) => b.heat - a.heat).slice(0, 12);
  updateRecords(s);
}

function setRecord(s: CareerState, key: string, label: string, holder: DriverState, value: number, lowerBetter = false, min = 0) {
  const cur = s.records[key];
  const better = !cur || (lowerBetter ? value < cur.value : value > cur.value);
  if (!better) return;
  if (!lowerBetter && value < min) return;
  if (cur && cur.holder !== holder.spec.name) {
    news(s, `${holder.spec.name} sets a new record: ${label} (${value}), beating ${cur.holder} (${cur.value}).`, { importance: 3, cause: "A record falls", tag: "record" });
    if (holder.teamId === s.teamId) s.legacy.push({ year: s.year, text: `${holder.spec.name} set the record for ${label.toLowerCase()} (${value}).` });
  }
  s.records[key] = { key, label, holder: holder.spec.name, value, year: s.year };
}

export function updateRecords(s: CareerState) {
  for (const d of Object.values(s.drivers)) {
    if (!d.starts) continue;
    setRecord(s, "careerWins", "Most career wins", d, d.wins, false, 3);
    setRecord(s, "careerPodiums", "Most career podiums", d, d.podiums, false, 6);
    setRecord(s, "careerTitles", "Most titles", d, d.titles, false, 1);
    const sw = s.standings.races.filter((r) => r.winner === d.spec.name).length;
    setRecord(s, "seasonWins", "Most wins in a season", d, sw, false, 3);
  }
  const last = s.standings.races[s.standings.races.length - 1];
  if (last) {
    const w = Object.values(s.drivers).find((d) => d.spec.name === last.winner);
    if (w && w.spec.born) setRecord(s, "youngestWinner", "Youngest winner (age)", w, s.year - w.spec.born, true);
  }
}

export function hallYearEnd(s: CareerState) {
  for (const d of Object.values(s.drivers)) {
    if (!d.retired || s.hall.some((h) => h.name === d.spec.name)) continue;
    if (d.titles > 0 || d.wins >= 5) {
      s.hall.push({ year: s.year, name: d.spec.name, text: `${d.titles ? d.titles + " title" + (d.titles > 1 ? "s" : "") + ", " : ""}${d.wins} win${d.wins === 1 ? "" : "s"}, ${d.podiums} podium${d.podiums === 1 ? "" : "s"}` });
      news(s, `${d.spec.name} retires: ${d.titles ? d.titles + " title" + (d.titles > 1 ? "s" : "") + " and " : ""}${d.wins} wins. Added to the hall of fame.`, { importance: 2, cause: "Retirement", tag: "record" });
    }
  }
}

export function legacyScore(s: CareerState): { score: number; parts: { label: string; v: number }[] } {
  const titlesC = s.history.filter((h) => h.constructors === s.teamId).length;
  const titlesD = s.history.filter((h) => h.championTeam === s.teamId).length;
  const parts = [
    { label: "Constructors' titles", v: titlesC * 12 },
    { label: "Drivers' titles in your cars", v: titlesD * 10 },
    { label: "Seasons in the top three", v: s.history.filter((h) => h.playerPos <= 3).length * 2 },
    { label: "Academy graduates in race seats", v: s.academy.graduates.length * 3 },
    { label: "Records held by your drivers", v: Object.values(s.records).filter((r) => Object.values(s.drivers).some((d) => d.spec.name === r.holder && d.teamId === s.teamId)).length * 2 },
    { label: "Eras survived", v: s.era.past.length * 2 },
  ];
  return { score: parts.reduce((a, p) => a + p.v, 0), parts };
}

// ---------------------------------------------------------------- driver market rumours

export function rumourBonus(s: CareerState, driverId: string, teamId: string): number {
  for (const r of s.rumours) if (r.real && r.driverId === driverId && r.teamId === teamId && s.day - r.day < 330) return 1.4;
  return 0;
}

const SOURCES = ["a Spanish daily", "paddock whispers", "a team insider", "an Italian paper", "a former engineer", "the German press"];

export function driverRumours(s: CareerState, publish = true) {
  const rng = rngFor(s, `rum:${s.day}`);
  if (!rng.chance(0.35)) return;
  const cands = Object.values(s.drivers).filter((d) => d.teamId && !d.retired && d.endYear <= s.year + 1 && d.spec.pace > 0.975 && !d.next);
  if (!cands.length) return;
  const d = rng.pick(cands);
  const order = teamRanking(s);
  const teams = order.filter((id) => id !== d.teamId).filter((id) => {
    const worst = driversOf(s, id).sort((a, b) => a.spec.pace - b.spec.pace)[0];
    return worst && worst.spec.pace < d.spec.pace - 0.002;
  });
  if (!teams.length) return;
  const target = teams[Math.min(teams.length - 1, Math.floor(Math.pow(rng.next(), 1.6) * teams.length))];
  if (s.rumours.some((r) => r.driverId === d.id && r.teamId === target && s.day - r.day < 90)) return;
  const real = rng.chance(0.55 + 0.25 * (s.teams[target].skillBrain));
  const source = rng.pick(SOURCES);
  const text = `${d.spec.name} is linked with ${baseTeam(target).name} (${source}).`;
  s.rumours.unshift({ day: s.day, text, driverId: d.id, teamId: target, real, source });
  if (s.rumours.length > 24) s.rumours.length = 24;
  if (publish) news(s, text, { importance: d.teamId === s.teamId ? 3 : 1, cause: "Paddock rumour: it may be wrong", tag: "rumour" });
  if (d.teamId === s.teamId) addCause(d, "rumour", 0.04);
}

// ---------------------------------------------------------------- AI teams make real decisions

export function aiMonthly(s: CareerState) {
  const rng = rngFor(s, `aim:${s.day}`);
  const order = standingsRank(s);
  for (const id of Object.keys(s.teams)) {
    if (isHuman(s, id)) continue;
    const t = s.teams[id];
    const rank = order.indexOf(id);
    // a worried team with a good strategist moves its spending earlier
    if (s.round >= 4 && rank >= 7 && t.skillBrain >= 0.6 && t.philosophy === "late" && rng.chance(0.3)) {
      t.philosophy = "balanced";
      news(s, `${baseTeam(id).name} bring their upgrade programme forward.`, { importance: 1, cause: "They are behind and cannot wait", tag: "ai" });
    }
    // staff upgrades from the free market
    if (rng.chance(0.12 + 0.2 * t.skillBrain) && t.cash > 40) {
      for (const role of ["td", "designer", "aero", "power", "data", "strategy"] as const) {
        const cur = staffOf(s, id, role);
        const best = s.freeStaff.map((x) => s.staff[x]).filter((x) => x.role === role).sort((a, b) => hireScore(s, id, b) - hireScore(s, id, a))[0];
        if (cur && best && hireScore(s, id, best) > hireScore(s, id, cur) + 8) {
          cur.teamId = null;
          cur.tenure = 0;
          s.freeStaff.push(cur.id);
          s.freeStaff = s.freeStaff.filter((x) => x !== best.id);
          best.teamId = id;
          best.endYear = s.year + 2;
          best.salary = staffAsk(best);
          if (rank <= 4) news(s, `${baseTeam(id).name} hire ${best.name} as ${role === "td" ? "technical director" : role === "designer" ? "chief designer" : role === "strategy" ? "head of strategy" : STAFF_LABEL[role].toLowerCase()}.`, { importance: 2, cause: `They wanted a stronger ${role}`, tag: "ai" });
          break;
        }
      }
    }
  }
}

export { fmtMoney };
