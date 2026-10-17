import { Rng, hashSeed } from "../sim/rng";
import { baseTeam, standingsRank } from "./car";
import { news, pushCard, recap } from "./cards";
import { driversOf } from "./finance";
import { askingSalary } from "./contracts";
import { CAUSE_LABEL, addCause, makePromise, stageOfGrievance } from "./people";
import { ensureStatus, expectedRole, onRoleChange, ROLE_WORD } from "./status";
import { clamp, fmtMoney, round2 } from "./util";
import type { CareerState, DriverRole, DriverState } from "./types";

/**
 * Real conversations.
 *
 * A driver does not reach out at random. Every request is built from what is actually bothering him (the causes the
 * game already tracks: his status next to his team-mate, the car, pay, a broken promise, a pit call that went against
 * him, a team order) and he says it in his own voice with the real numbers. You answer from options that fit the
 * subject. How he takes your answer depends on who he is: his ego, loyalty, patience and how much he trusts you.
 */

export interface ConvoReason {
  key: string;
  weight: number;
}
export interface ConvoLine {
  who: "him" | "you" | "note";
  text: string;
}
export interface ConvoOption {
  id: string;
  label: string;
  detail: string;
}
export interface Convo {
  id: number;
  driverId: string;
  day: number;
  reasons: ConvoReason[];
  lines: ConvoLine[];
  options: ConvoOption[];
  /** 1 his opening, 2 his follow-up. */
  round: 1 | 2;
  open: boolean;
  /** The player has opened it on screen. */
  seen?: boolean;
  /** How it ended, for the list. */
  outcome?: "settled" | "eased" | "worse" | "left";
}

type Voice = "blunt" | "fire" | "sunny" | "analyst" | "elder" | "anxious";
const voiceOf = (d: DriverState): Voice => (d.spec.psyche as { voice?: Voice } | undefined)?.voice ?? "blunt";
const psy = (d: DriverState, k: string, def = 0.5): number => (d.spec.psyche as Record<string, number> | undefined)?.[k] ?? def;
const lc = (x: string) => (/^I( |')/.test(x) ? x : x.charAt(0).toLowerCase() + x.slice(1));
const last = (n: string) => n.split(" ").slice(-1)[0] ?? n;

interface Ctx {
  d: DriverState;
  mate?: DriverState;
  rank: number;
  s: CareerState;
}

function ctxOf(s: CareerState, d: DriverState): Ctx {
  const mate = d.teamId ? driversOf(s, d.teamId).find((x) => x.id !== d.id) : undefined;
  return { d, mate, s, rank: standingsRank(s).indexOf(d.teamId ?? "") + 1 };
}

const m = (n: number) => `$${n.toFixed(n < 10 ? 1 : 0)}m`;

/** The fact-filled core of what he wants to say about one cause. */
function core(key: string, c: Ctx): string {
  const { d, mate, s } = c;
  const mn = mate ? last(mate.spec.name) : "my team-mate";
  switch (key) {
    case "role": {
      const dw = d.rec?.p1 ?? d.wins;
      const mw = mate?.rec?.p1 ?? mate?.wins ?? 0;
      const dt = d.rec?.wdc.length ?? d.titles;
      const mt = mate?.rec?.wdc.length ?? mate?.titles ?? 0;
      if (d.role === "number2") return `I have been made the second driver. ${mn} has ${mw} win${mw === 1 ? "" : "s"} and ${mt} title${mt === 1 ? "" : "s"}. I have ${dw} win${dw === 1 ? "" : "s"} and ${dt} title${dt === 1 ? "" : "s"}. I do not accept that I am the junior one here`;
      if (expectedRole(d, mate) === "number1") return `On paper ${mn} and I are equals. I have ${dw} win${dw === 1 ? "" : "s"} and ${dt} title${dt === 1 ? "" : "s"} to his ${mw} and ${mt}. I expect to be the team's lead driver`;
      return `I do not think I am being treated as ${ROLE_WORD[expectedRole(d, mate)].toLowerCase()} should be treated`;
    }
    case "teammate": {
      const a = s.standings.drivers[d.id] ?? 0;
      const b = mate ? s.standings.drivers[mate.id] ?? 0 : 0;
      return `${mn} is ${Math.max(0, b - a)} points ahead of me, and that gets put down to me when the car is the same`;
    }
    case "car":
      return `We are ${c.rank}${c.rank === 1 ? "st" : c.rank === 2 ? "nd" : c.rank === 3 ? "rd" : "th"} in the constructors' table. I did not come here to finish there`;
    case "pay": {
      const ask = askingSalary(s, d);
      return `I am paid ${m(d.salary)} and the market says I am worth about ${m(ask)}${mate && mate.salary > d.salary ? `, and ${mn} earns ${m(mate.salary)}` : ""}`;
    }
    case "results":
      return `The team is behind where it said it would be this year, and the results are the reason`;
    case "morale":
      return `It has been a hard stretch and nobody has really sat down with me about it`;
    case "contract":
      return `My contract ${d.endYear <= s.year ? "ends this year" : `runs to ${d.endYear}`}, and I want to know what the plan is for me`;
    case "promise": {
      const p = s.promises.filter((x) => x.driverId === d.id && x.kept === false).slice(-1)[0] ?? s.promises.filter((x) => x.driverId === d.id && x.kept === undefined).slice(-1)[0];
      return p ? `You promised me this: ${p.text.toLowerCase()}. I am still waiting for it` : `A promise was made to me and it has not been honoured`;
    }
    case "rumour":
      return `I read that other teams want me. I would be lying if I said it did not make me think about what is best for me`;
    case "slight": {
      const sl = d.stat?.slights.slice(-1)[0];
      return sl ? `You ${sl.kind === "role" ? "changed my status" : "did something"} (${sl.text}) and I have not forgotten it` : `Some of what the team has done recently did not sit well with me`;
    }
    case "strategy":
      return `That strategy call in the last race went against me. I want to understand why my team-mate was treated better than I was`;
    case "orders":
      return `I gave up a position when the team told me to. I expect that to be remembered`;
    default:
      return `Something is not right, and I would rather say it to you than to the press`;
  }
}

/** Dress the same fact in how this driver actually speaks. */
function voiceLine(v: Voice, text: string, first: boolean): string {
  const t = text.charAt(0).toUpperCase() + text.slice(1);
  switch (v) {
    case "blunt":
      return first ? `Straight up. ${t}.` : `${t}. That is how I see it.`;
    case "fire":
      return first ? `I am not going to stay quiet about this. ${t}!` : `And ${lc(text)}. I mean it!`;
    case "sunny":
      return first ? `Hey. I love it here, honestly, but I have to be real with you. ${t}.` : `Also, ${lc(text)}. No hard feelings, I just want it said.`;
    case "analyst":
      return first ? `Let me lay it out properly. ${t}. The numbers say the same.` : `Second point: ${lc(text)}.`;
    case "elder":
      return first ? `I have been in this paddock a long time and I know how these things go. ${t}.` : `And one more thing. ${t}.`;
    case "anxious":
      return first ? `Sorry, I do not want to cause trouble, and I hope this is okay to say. ${t}...` : `And... ${lc(text)}. Sorry.`;
  }
}

// --------------------------------------------------------------------------- what you can say

type Kind = "concede" | "explain" | "push" | "promise";
interface Opt {
  id: string;
  label: string;
  detail: string;
  kind: Kind;
  /** What it really does, beyond the mood. Returns a note for the log. */
  apply?: (s: CareerState, d: DriverState, mate: DriverState | undefined) => string | void;
  /** How much it can lower the grievance when he accepts it. */
  eases: number;
}

const OPTS: Record<string, Opt[]> = {
  role: [
    {
      id: "grant",
      label: "Give him the status he is asking for",
      detail: "He becomes the number one. His team-mate may not like it.",
      kind: "concede",
      eases: 0.4,
      apply: (s, d, mate) => {
        const want = expectedRole(d, mate);
        const to: DriverRole = want === "number2" ? "equal" : want;
        const before = d.role;
        d.role = to;
        onRoleChange(s, d, before, to);
        if (mate && to === "number1" && mate.role !== "number2") {
          const mb = mate.role;
          mate.role = "number2";
          onRoleChange(s, mate, mb, "number2");
        }
        return `${d.spec.name} is now ${ROLE_WORD[to].toLowerCase()}.`;
      },
    },
    {
      id: "equal",
      label: "Tell him both drivers are treated the same",
      detail: "Fair, but only works if he trusts you. If he is called number two, he moves up to equal.",
      kind: "explain",
      eases: 0.22,
      apply: (s, d) => {
        if (d.role === "number2") {
          d.role = "equal";
          onRoleChange(s, d, "number2", "equal");
          return `${d.spec.name} is now treated as an equal.`;
        }
      },
    },
    { id: "earn", label: "Tell him to earn it on track", detail: "A proud driver will not like it. A loyal one may respect it.", kind: "push", eases: 0.2 },
    {
      id: "review",
      label: "Promise to look at his status again in a month",
      detail: "Makes a promise you will be judged on.",
      kind: "promise",
      eases: 0.2,
      apply: (s, d) => {
        makePromise(s, d.id, "number1", "A fresh look at his status within a month", 30, s.round);
      },
    },
  ],
  teammate: [
    { id: "data", label: "Show him the data and where the time is", detail: "Honest and specific. He will respect it if he is not too proud.", kind: "explain", eases: 0.2 },
    { id: "back", label: "Tell him you will back him over the next races", detail: "He feels heard. His team-mate may notice.", kind: "concede", eases: 0.3 },
    { id: "own", label: "Tell him to worry about his own driving", detail: "Cold. Works only on the patient or the loyal.", kind: "push", eases: 0.15 },
  ],
  car: [
    {
      id: "upgrade",
      label: "Promise a real upgrade within ten weeks",
      detail: "A big part must go on the car by then.",
      kind: "promise",
      eases: 0.28,
      apply: (s, d) => {
        makePromise(s, d.id, "upgrade", "A big upgrade within 10 weeks", 70, s.round);
      },
    },
    { id: "honest", label: "Be honest: the car is what it is, the factory is on it", detail: "Respected by analytical and patient drivers.", kind: "explain", eases: 0.18 },
    { id: "race", label: "Tell him results will fix it, so he should drive", detail: "Rarely lands well with someone who feels held back.", kind: "push", eases: 0.1 },
  ],
  pay: [
    {
      id: "raise",
      label: "Give him a raise of about ten percent",
      detail: "Costs real money every year.",
      kind: "concede",
      eases: 0.38,
      apply: (_s, d) => {
        d.salary = round2(d.salary * 1.1);
        return `${d.spec.name} now earns ${fmtMoney(d.salary)} a year.`;
      },
    },
    { id: "review", label: "Agree to revisit it at the end of the year", detail: "Costs nothing today.", kind: "promise", eases: 0.18 },
    { id: "refuse", label: "Politely refuse", detail: "Saves money, costs goodwill.", kind: "push", eases: 0.1 },
  ],
  promise: [
    { id: "sorry", label: "Own it: you promised and you will make it right", detail: "Costs nothing if you mean it.", kind: "concede", eases: 0.3 },
    { id: "why", label: "Explain what changed", detail: "Fair if he is patient.", kind: "explain", eases: 0.18 },
  ],
  strategy: [
    { id: "own", label: "Own the call: it was yours and it was wrong for him", detail: "He values a manager who admits it.", kind: "concede", eases: 0.34 },
    { id: "logic", label: "Walk him through why you made the call", detail: "The analytical ones listen.", kind: "explain", eases: 0.22 },
    { id: "team", label: "Remind him the team result comes first", detail: "Lands on loyal drivers, enrages proud ones.", kind: "push", eases: 0.14 },
  ],
  orders: [
    { id: "thanks", label: "Thank him and promise to even it up", detail: "He gives the favour a price.", kind: "promise", eases: 0.3 },
    { id: "explain", label: "Explain why the team needed it", detail: "Respected by team players.", kind: "explain", eases: 0.2 },
  ],
  contract: [
    { id: "talks", label: "Tell him you want to talk about a new deal soon", detail: "Open the People screen to start the talks.", kind: "concede", eases: 0.25 },
    { id: "wait", label: "Ask him to wait until the season is further on", detail: "Costs patience.", kind: "explain", eases: 0.12 },
  ],
  rumour: [
    { id: "stay", label: "Tell him you want him here and mean it", detail: "Works on drivers who trust you.", kind: "explain", eases: 0.25 },
    { id: "free", label: "Tell him he is free to go at the end of the year", detail: "A gamble. Proud drivers may take it.", kind: "push", eases: 0.05 },
  ],
  generic: [
    { id: "listen", label: "Listen and take it on board", detail: "It helps a little.", kind: "explain", eases: 0.16 },
    { id: "reassure", label: "Reassure him you are behind him", detail: "Warm and cheap.", kind: "concede", eases: 0.22 },
    { id: "focus", label: "Tell him to focus on driving", detail: "Short and cold.", kind: "push", eases: 0.05 },
  ],
};

function optsFor(key: string): Opt[] {
  return OPTS[key] ?? OPTS[["morale", "results", "slight", "tenure"].includes(key) ? "generic" : "generic"];
}

/** How he takes it: 2 accepts it, 1 is not convinced, 0 is angered. Fixed by who he is, with a little chance. */
function reaction(s: CareerState, d: DriverState, opt: Opt, round: number): 0 | 1 | 2 {
  const rng = new Rng(hashSeed(`convo:${s.seed}:${d.id}:${s.day}:${opt.id}:${round}`));
  const ego = psy(d, "ego");
  const loy = psy(d, "loyalty");
  const pat = psy(d, "patience");
  const vol = psy(d, "volatility");
  const obey = psy(d, "obedience");
  let score: number;
  switch (opt.kind) {
    case "concede":
      score = 0.85;
      break;
    case "promise":
      score = 0.45 + d.trust * 0.5 + loy * 0.15 - (d.causes.promise ?? 0) * 0.8;
      break;
    case "explain":
      score = 0.2 + d.trust * 0.45 + pat * 0.3 + obey * 0.15 + (voiceOf(d) === "analyst" ? 0.12 : 0);
      break;
    default:
      score = 0.55 + loy * 0.25 + obey * 0.25 - ego * 0.55 - vol * 0.25 - Math.max(0, d.grievance - 0.3) * 0.5;
  }
  score += (rng.next() - 0.5) * 0.18;
  return score >= 0.62 ? 2 : score >= 0.38 ? 1 : 0;
}

const REPLY: Record<Voice, Record<0 | 1 | 2, string[]>> = {
  blunt: {
    2: ["Fine. That is what I wanted to hear.", "Good. Do it and we are done."],
    1: ["I hear you. I am not sure it changes anything.", "Words. Let us see what happens."],
    0: ["That is not good enough, and you know it.", "Then we have a problem."],
  },
  fire: {
    2: ["Right. Okay. That is what I needed. Thank you.", "Good. Because I was about to blow."],
    1: ["I am not convinced. I am watching what you do next.", "Maybe. Do not let me down again."],
    0: ["Unbelievable. You are not listening to me at all!", "I came here to talk and you just dismissed me."],
  },
  sunny: {
    2: ["Thank you, honestly. That means a lot. Let us go win something.", "Great, that is all I wanted. Cheers."],
    1: ["Okay... I hope you mean it. I will keep smiling for now.", "Fair enough. I will wait and see."],
    0: ["Wow. That is... disappointing. I thought you were different.", "I really did not expect that from you."],
  },
  analyst: {
    2: ["That is a reasonable answer. I accept it.", "Good. That resolves the point."],
    1: ["It is partly convincing. I will check it against what actually happens.", "I need to see it in the results."],
    0: ["That does not address the argument at all.", "That answer does not hold up. I disagree."],
  },
  elder: {
    2: ["That is all a man in my position asks. Respect.", "Good. Then we understand each other."],
    1: ["I have heard promises before. I will judge by the next few races.", "We will see. I have time, but not unlimited."],
    0: ["I expected better, after all these years.", "I have seen managers like that. It never ends well."],
  },
  anxious: {
    2: ["Oh, thank you. I feel much better. Really.", "Okay. Okay, good. Thank you for listening."],
    1: ["I... suppose so. I just hope it works out.", "Okay. I will try to believe it."],
    0: ["I... that is not what I hoped for. Now I am worried.", "I will try, but I do not feel any better."],
  },
};

const pick = (rng: Rng, a: string[]) => a[Math.floor(rng.next() * a.length)] ?? a[0];

// --------------------------------------------------------------------------- opening and answering

/** Starts a conversation because of what is bothering him. Returns its id, or null if he has nothing real to say. */
export function openConvo(s: CareerState, d: DriverState, forced?: string[]): number | null {
  if (!s.convos) s.convos = [];
  if (s.convos.some((c) => c.open && c.driverId === d.id)) return s.convos.find((c) => c.open && c.driverId === d.id)?.id ?? null;
  const reasons: ConvoReason[] = Object.entries(d.causes)
    .filter(([k, v]) => v > 0.03 && !["noResign", "success", "tenure"].includes(k))
    .map(([key, weight]) => ({ key, weight }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);
  for (const f of forced ?? []) if (!reasons.some((r) => r.key === f)) reasons.unshift({ key: f, weight: 0.1 });
  if (!reasons.length) reasons.push({ key: "generic", weight: 0.05 });
  const c = ctxOf(s, d);
  const v = voiceOf(d);
  const lines: ConvoLine[] = [];
  reasons.slice(0, 3).forEach((r, i) => lines.push({ who: "him", text: voiceLine(v, core(r.key, c), i === 0) }));
  const top = reasons[0].key;
  const opts = optsFor(top);
  const convo: Convo = { id: s.uid++, driverId: d.id, day: s.day, reasons, lines, options: opts.map((o) => ({ id: o.id, label: o.label, detail: o.detail })), round: 1, open: true };
  s.convos.push(convo);
  if (s.convos.length > 40) s.convos.splice(0, s.convos.length - 40);
  ensureStatus(d).lastReach = s.day;
  return convo.id;
}

/** You answer him. */
export function convoSay(s: CareerState, id: number, optionId: string): string | null {
  const cv = (s.convos ?? []).find((x) => x.id === id);
  if (!cv || !cv.open) return "That conversation is over.";
  const d = s.drivers[cv.driverId];
  if (!d) return "He is gone.";
  const top = cv.reasons[0]?.key ?? "generic";
  const opt = optsFor(top).find((o) => o.id === optionId);
  const second = optionId === "give" || optionId === "hold";
  const rng = new Rng(hashSeed(`reply:${s.seed}:${d.id}:${s.day}:${optionId}:${cv.round}`));
  const mate = d.teamId ? driversOf(s, d.teamId).find((x) => x.id !== d.id) : undefined;
  const v = voiceOf(d);

  if (second) {
    if (optionId === "give") {
      const o = optsFor(top)[0];
      cv.lines.push({ who: "you", text: `You give in: ${o.label.toLowerCase()}.` });
      const note = o.apply?.(s, d, mate);
      if (note) cv.lines.push({ who: "note", text: String(note) });
      d.grievance = round2(clamp(d.grievance - o.eases * 0.6, 0, 1));
      d.trust = clamp(d.trust + 0.03, 0, 1);
      cv.lines.push({ who: "him", text: pick(rng, REPLY[v][2]) });
      return finish(s, cv, d, "settled");
    }
    d.grievance = round2(clamp(d.grievance + 0.05, 0, 1));
    d.trust = clamp(d.trust - 0.06, 0, 1);
    cv.lines.push({ who: "you", text: "You hold your position." });
    cv.lines.push({ who: "him", text: pick(rng, REPLY[v][0]) });
    return finish(s, cv, d, "worse");
  }
  if (!opt) return "He did not follow that.";
  cv.lines.push({ who: "you", text: opt.label });
  const r = reaction(s, d, opt, cv.round);
  const note = r >= 1 ? opt.apply?.(s, d, mate) : undefined;
  if (note) cv.lines.push({ who: "note", text: String(note) });
  const ease = r === 2 ? opt.eases : r === 1 ? opt.eases * 0.4 : -0.08;
  d.grievance = round2(clamp(d.grievance - ease, 0, 1));
  d.trust = clamp(d.trust + (r === 2 ? 0.05 : r === 1 ? 0.0 : -0.08), 0, 1);
  d.morale = clamp(d.morale + (r === 2 ? 0.04 : r === 0 ? -0.04 : 0), 0, 1);
  if (top in d.causes && r === 2 && ["promise", "role", "pay", "teammate", "strategy", "orders", "slight"].includes(top)) d.causes[top] = round2((d.causes[top] ?? 0) * 0.45);
  if (top === "slight" || top === "strategy" || top === "orders") (d.stat?.slights ?? []).length && (d.stat!.slights = d.stat!.slights.slice(0, -1));
  cv.lines.push({ who: "him", text: pick(rng, REPLY[v][r]) });
  // if he is still unhappy and not the type to let it go, he pushes once more
  const volatile = psy(d, "volatility") + psy(d, "ego") > 0.95 || d.grievance > 0.4;
  if (cv.round === 1 && r < 2 && volatile && optionId !== "grant") {
    cv.round = 2;
    cv.lines.push({ who: "him", text: v === "fire" ? "No. I want it settled today. What are you going to do about it?" : v === "anxious" ? "I... I really need an answer. What are you going to do?" : "Look, I need more than that. What are you actually prepared to do?" });
    cv.options = [
      { id: "give", label: `Give him what he asked for (${optsFor(top)[0].label.toLowerCase()})`, detail: "Settles it. It costs you." },
      { id: "hold", label: "Hold your position", detail: "He will take it badly." },
    ];
    return null;
  }
  return finish(s, cv, d, r === 2 ? "settled" : r === 1 ? "eased" : "worse");
}

function finish(s: CareerState, cv: Convo, d: DriverState, outcome: NonNullable<Convo["outcome"]>): null {
  cv.open = false;
  cv.options = [];
  cv.outcome = outcome;
  d.gStage = stageOfGrievance(d.grievance);
  recap(s, `You spoke to ${d.spec.name}: ${outcome === "settled" ? "it is settled" : outcome === "eased" ? "it eased a little" : "it did not go well"}.`);
  if (outcome === "worse" && d.grievance > 0.6) news(s, `${d.spec.name} left a meeting with the team principal unhappy, according to people in the paddock.`, { importance: 2, cause: "A conversation that went badly", tag: "people" });
  return null;
}

export function convoClose(s: CareerState, id: number): void {
  const cv = (s.convos ?? []).find((x) => x.id === id);
  if (!cv) return;
  if (cv.open) {
    // walking away from a conversation he started counts for something
    const d = s.drivers[cv.driverId];
    if (d && !cv.seen) d.trust = clamp(d.trust - 0.02, 0, 1);
    cv.open = false;
    cv.outcome = cv.outcome ?? "left";
  }
  cv.seen = true;
}

// --------------------------------------------------------------------------- when he reaches out

/**
 * Checked each week for your drivers. He asks for a word when something specific has built up: a status slight, a
 * strategy call or team order that went against him, a promise running late, or a contract running out while he is
 * doing well. He does not nag: one request every four weeks.
 */
export function weeklyReach(s: CareerState): void {
  for (const d of driversOf(s, s.teamId)) {
    const st = ensureStatus(d);
    if (st.lastReach !== undefined && s.day - st.lastReach < 28) continue;
    if ((s.convos ?? []).some((c) => c.open && c.driverId === d.id)) continue;
    if (s.cards.some((c) => c.data?.driverId === d.id && String(c.data?.ev ?? "").startsWith("g"))) continue;
    const ego = psy(d, "ego");
    const talk = psy(d, "talkative");
    let key: string | null = null;
    const cs = d.causes;
    if ((cs.strategy ?? 0) > 0.08) key = "strategy";
    else if ((cs.orders ?? 0) > 0.08) key = "orders";
    else if ((cs.slight ?? 0) > 0.1 && ego + talk > 0.9) key = "slight";
    else if ((cs.role ?? 0) > 0.12 && d.grievance > 0.18) key = "role";
    else if ((cs.promise ?? 0) > 0.1) key = "promise";
    else if (d.endYear <= s.year && d.morale > 0.55 && s.round >= 6 && !d.next) key = "contract";
    else if (d.grievance > 0.2 && talk > 0.55) key = (Object.entries(cs).filter(([k]) => !["noResign", "success", "tenure"].includes(k)).sort((a, b) => b[1] - a[1])[0]?.[0]) ?? null;
    if (!key) continue;
    st.lastReach = s.day;
    const c = ctxOf(s, d);
    const teaser = key === "contract" ? "wants to talk about his future" : `wants a word about ${(CAUSE_LABEL[key] ?? "something on his mind").toLowerCase()}`;
    pushCard(
      s,
      "event",
      `${d.spec.name} ${teaser}`,
      `${d.spec.name} has asked for a few minutes. ${voiceLine(voiceOf(d), core(key, c), true)}\n\nHe will tell you the rest if you sit down with him.`,
      [
        { id: "meet", label: "Sit down with him", detail: "A real conversation. You answer him." },
        { id: "later", label: "Ask him to wait a week", detail: "He will ask again, and remember." },
      ],
      { urgency: 2, deadline: s.day + 9, defaultOption: "later", data: { ev: "reach", driverId: d.id, cause: key } },
    );
  }
}

/** The card answers for a request to talk. */
export function resolveReach(s: CareerState, c: { data?: Record<string, number | string | boolean> }, option: string): void {
  const d = s.drivers[String(c.data?.driverId)];
  if (!d || d.teamId !== s.teamId) return;
  const key = String(c.data?.cause ?? "generic");
  if (option === "meet") {
    openConvo(s, d, [key]);
    return;
  }
  // putting it off is allowed once; it shows
  addCause(d, "slight", 0.05);
  d.trust = clamp(d.trust - 0.02, 0, 1);
  if (d.stat) d.stat.lastReach = s.day - 21;
}

export const teamName = (id: string | null) => (id ? baseTeam(id).name : "");
