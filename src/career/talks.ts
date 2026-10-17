import { hashSeed, Rng } from "../sim/rng";
import { teamRanking } from "./car";
import { news, pushCard } from "./cards";
import { askingSalary, evaluateOffer } from "./contracts";
import { askRetainer } from "./academy";
import { addCause } from "./people";
import { driversOf } from "./finance";
import { clamp, fmtMoney, nextId, rngFor, round2 } from "./util";
import type { CareerState, DriverState, Manager, Offer, Talk, TalkLine } from "./types";

/**
 * Private talks. A deal is a conversation over days, not a button: you open talks, find out whether he would listen, learn what he cares about,
 * make offers, and wait for replies that come through his agent. Along the way the story can leak, and it hurts the driver who is under threat.
 * Agents speak for several clients and deal with every team: lowball one client and the agent remembers it for all of them.
 */

const MANAGER_POOL: [string, Manager["style"]][] = [
  ["Dario Venturi", "shark"],
  ["Helena Brandt", "loyal"],
  ["Marcus Oyelaran", "shark"],
  ["Sofie Lindqvist", "quiet"],
  ["Tomas Reyes", "loyal"],
  ["Anouk de Wit", "quiet"],
  ["Kenji Morita", "shark"],
  ["Ines Carvalho", "loyal"],
  ["Paddy Gallagher", "quiet"],
  ["Viktor Hale", "shark"],
];

export function makeManagers(): Record<string, Manager> {
  const out: Record<string, Manager> = {};
  MANAGER_POOL.forEach(([name, style], i) => {
    out[`mgr-${i}`] = { id: `mgr-${i}`, name, style, mood: {}, coolUntil: {} };
  });
  return out;
}

/** The agent of a driver or junior, if he has one (worked out from his id so it never changes). */
export function managerOf(s: CareerState, id: string): Manager | null {
  const h = hashSeed(`mgr:${id}`);
  if (h % 10 >= 8) return null;
  if (!s.managers) s.managers = makeManagers();
  return s.managers[`mgr-${(h >> 4) % MANAGER_POOL.length}`] ?? null;
}

export const managerMood = (m: Manager, teamId: string) => m.mood[teamId] ?? 0.6;
const bump = (m: Manager | null, teamId: string, v: number) => {
  if (!m) return;
  m.mood[teamId] = round2(clamp(managerMood(m, teamId) + v, 0, 1));
};

/** All the people this agent speaks for that are still in the game. */
export function clientsOf(s: CareerState, m: Manager): string[] {
  const out: string[] = [];
  for (const d of Object.values(s.drivers)) if (!d.retired && managerOf(s, d.id)?.id === m.id) out.push(d.id);
  for (const j of s.pool) if (managerOf(s, j.id)?.id === m.id) out.push(j.id);
  for (const p of Object.values(s.academy.prospects)) if (managerOf(s, p.id)?.id === m.id && !out.includes(p.id)) out.push(p.id);
  return out;
}

const line = (s: CareerState, who: TalkLine["who"], text: string): TalkLine => ({ who, text, day: s.day });

export const talkFor = (s: CareerState, id: number) => s.talks.find((t) => t.id === id);
export const activeTalk = (s: CareerState, targetId: string) => s.talks.find((t) => t.targetId === targetId && t.status !== "closed");

/** How willing he is to listen to you, 0..1. */
export function interestIn(s: CareerState, d: DriverState): number {
  const me = s.teamId;
  let v = 0.5;
  const ranks = teamRanking(s);
  const myRank = ranks.indexOf(me);
  if (d.teamId && d.teamId !== me) {
    const his = ranks.indexOf(d.teamId);
    v += d.grievance * 0.7 + (his - myRank) * 0.035;
    v -= (d.spec.psyche?.loyalty ?? 0.5) * 0.2 * Math.min(1, 0.4 + d.tenure * 0.15);
    if (d.salary < askingSalary(s, d) * 0.85) v += 0.12;
  } else if (d.teamId === me) {
    v += 0.1 - d.grievance * 0.5 + (d.trust - 0.5) * 0.3;
  } else v += 0.15 + (0.5 - myRank / 20);
  v += s.press.mood * 0.06;
  return clamp(v, 0, 1);
}

export const interestWord = (v: number): Talk["interest"] => (v > 0.7 ? "keen" : v > 0.5 ? "open" : v > 0.32 ? "cool" : "cold");

export function openTalk(s: CareerState, kind: Talk["kind"], targetId: string): { ok: boolean; message: string; talk?: Talk } {
  const old = activeTalk(s, targetId);
  if (old) return { ok: true, message: "Talks are already open.", talk: old };
  const d = s.drivers[targetId];
  const j = kind === "junior" ? s.academy.prospects[targetId] : undefined;
  if (kind === "driver" && (!d || d.retired)) return { ok: false, message: "He is not available." };
  if (kind === "junior" && !j) return { ok: false, message: "He is not available." };
  const mgr = managerOf(s, targetId);
  if (mgr && (mgr.coolUntil[s.teamId] ?? 0) > s.day) return { ok: false, message: `${mgr.name} is not taking your calls until ${new Date((mgr.coolUntil[s.teamId] ?? 0) * 86400000).toUTCString().slice(5, 11)}. You pushed too hard.` };
  const own = kind === "driver" && d?.teamId === s.teamId;
  const t: Talk = {
    id: nextId(s),
    kind,
    targetId,
    topic: own ? "extend" : kind === "driver" && d?.teamId && d.teamId !== s.teamId ? "sound" : "sign",
    opened: s.day,
    status: "open",
    round: 0,
    lines: [],
    manager: mgr?.id,
  };
  const name = d?.spec.name ?? j?.name ?? "him";
  t.lines.push(line(s, "them", mgr ? `${mgr.name} for ${name}: "You have my attention. Where do you want to start?"` : `${name}: "I am listening."`));
  s.talks.push(t);
  return { ok: true, message: `You opened talks with ${name}.`, talk: t };
}

/** A tap-up: find out whether he would listen, before anything is on the table. It can leak. */
export function soundOut(s: CareerState, t: Talk): { ok: boolean; message: string } {
  if (t.status !== "open") return { ok: false, message: "Wait for the answer first." };
  if (t.kind !== "driver") return { ok: false, message: "Only drivers can be sounded out this way." };
  if (t.soundedOut) return { ok: false, message: "You have already sounded him out. His answer is in the conversation above and asking again will not change it." };
  t.soundedOut = true;
  const mgr = t.manager ? s.managers[t.manager] : null;
  t.status = "waiting";
  t.replyOn = s.day + (mgr ? 2 : 1);
  t.pending = undefined;
  t.lines.push(line(s, "you", "You sound him out quietly: would he listen if a team like yours called?"));
  const d = s.drivers[t.targetId];
  if (d.teamId && d.teamId !== s.teamId) {
    // this is a tap-up of a driver under contract: it can get out
    const r = rngFor(s, `tap:${t.id}:${t.round}`);
    if (r.chance(mgr?.style === "shark" ? 0.38 : 0.24)) {
      t.leaked = true;
      news(s, `Paddock whispers that ${s.teams[s.teamId]?.id.toUpperCase()} approached ${d.spec.name} while he is under contract. His team is not pleased.`, { importance: 2, cause: "A tap-up leaked", tag: "people" });
      s.press.mood = clamp(s.press.mood - 0.05, -1, 1);
      t.lines.push(line(s, "press", "The approach has leaked. The press is calling it a tap-up."));
    }
  }
  return { ok: true, message: "You put out a quiet feeler. The answer will take a day or two." };
}

export function askPriority(s: CareerState, t: Talk): { ok: boolean; message: string } {
  if (t.status !== "open") return { ok: false, message: "Wait for the answer first." };
  if (t.askedPriority) return { ok: false, message: "You have already asked what matters to him. The answer is in the conversation above." };
  t.askedPriority = true;
  const mgr = t.manager ? s.managers[t.manager] : null;
  t.status = "waiting";
  t.replyOn = s.day + (mgr ? 2 : 1);
  t.pending = undefined;
  t.lines.push(line(s, "you", "You ask what matters most to him in a deal."));
  return { ok: true, message: "Asked. He will answer in a day or two." };
}

/** Put terms on the table. The answer comes after a delay, and the agent may shop them around first. */
export function submitOffer(s: CareerState, t: Talk, offer: Offer, replaces: string | null | undefined): { ok: boolean; message: string } {
  if (t.status !== "open" && t.status !== "agreed") return { ok: false, message: t.status === "waiting" ? "Wait for the answer first." : "Talks are over." };
  if (t.topic === "sound") return { ok: false, message: "He is under contract elsewhere. You can only sound him out until his deal runs down." };
  t.replaces = replaces;
  t.pending = offer;
  t.status = "waiting";
  t.agreed = undefined;
  const mgr = t.manager ? s.managers[t.manager] : null;
  t.replyOn = s.day + (mgr ? 2 + (mgr.style === "shark" ? 1 : 0) : 1) + (rngFor(s, `reply:${t.id}:${t.round}`).chance(0.4) ? 1 : 0);
  t.lines.push(line(s, "you", `You offer ${fmtMoney(offer.salary)} a year for ${offer.years} year${offer.years > 1 ? "s" : ""}, ${offer.role === "number1" ? "as number one" : offer.role === "equal" ? "on equal terms" : "as number two"}${offer.promise ? `, with a promise` : ""}${offer.option ? ", with a team option" : ""}${offer.perf ? ", with a performance bonus" : ""}.`));
  return { ok: true, message: "Offer made. He and his people will think about it." };
}

/** Put academy terms on the table for a prospect. The answer comes through his camp after a delay. */
export function submitJuniorOffer(s: CareerState, t: Talk, terms: { years: number; retainer: number; buyout: number; firstRefusal: boolean }): { ok: boolean; message: string } {
  if (t.status !== "open" && t.status !== "agreed") return { ok: false, message: t.status === "waiting" ? "Wait for the answer first." : "Talks are over." };
  t.junior = terms;
  t.agreed = undefined;
  t.status = "waiting";
  t.pending = undefined;
  const mgr = t.manager ? s.managers[t.manager] : null;
  t.replyOn = s.day + (mgr ? 2 : 1) + (rngFor(s, `reply:${t.id}:${t.round}`).chance(0.4) ? 1 : 0);
  t.lines.push(line(s, "you", `You offer an academy deal: ${fmtMoney(terms.retainer)} a year for ${terms.years} year${terms.years > 1 ? "s" : ""}, buyout ${fmtMoney(terms.buyout, 0)}${terms.firstRefusal ? ", first refusal on his F1 contract" : ""}.`));
  return { ok: true, message: "Offer made. His camp will think about it." };
}

const WHY: Record<string, string[]> = {
  Money: ["The money is not there yet.", "He thinks he is worth more than that."],
  "A winning car": ["He is not convinced the car will win anything.", "He wants to see where the car is going before he commits."],
  Role: ["He wants a clearer role.", "The status on offer does not suit him."],
  Loyalty: ["There is no history between you and him yet."],
  Length: ["The length of the deal is not what he wants."],
  "Team option": ["He does not like the option year: it lets you keep him but not him leave."],
  "Your promise": ["He has heard promises from you before and is not counting on this one."],
  "Mood at the team": ["He is angry about how things have gone, and money will not fix that alone."],
};
const PRIORITY_LINE: Record<string, string> = {
  Money: "Money. Pay him what he thinks he is worth and the rest gets easier.",
  "A winning car": "The car. He wants to win and will go where the fastest car is.",
  Role: "Status. He wants to know where he stands against his team-mate.",
  Loyalty: "Respect and loyalty. He wants to know you will stand by him.",
  Length: "Security. He wants a deal of the right length.",
  "Mood at the team": "How he is treated. He wants things put right before he talks about money.",
};

function replyReason(label: string, rng: Rng): string {
  const w = WHY[label] ?? ["It is not quite right yet."];
  return rng.pick(w);
}

/** Everything that happens as days pass: replies arrive, agreed terms lapse, silence is noticed, stories leak. */
export function tickTalks(s: CareerState): void {
  for (const t of s.talks) {
    if (t.status === "closed") continue;
    const d = s.drivers[t.targetId];
    const j = s.academy.prospects[t.targetId];
    if (t.kind === "driver" && (!d || d.retired)) {
      t.status = "closed";
      continue;
    }
    const mgr = t.manager ? s.managers[t.manager] : null;
    if (t.status === "waiting" && t.replyOn !== undefined && s.day >= t.replyOn) respond(s, t, d, mgr);
    else if (t.status === "agreed" && t.agreedUntil !== undefined && s.day > t.agreedUntil) {
      t.status = "open";
      t.agreed = undefined;
      t.round += 1;
      t.unread = true;
      t.lines.push(line(s, "them", "He took the silence badly. The offer is off the table. If you still want him, start again."));
      bump(mgr, s.teamId, -0.08);
    } else if (t.status === "open" && s.day - Math.max(t.opened, t.lines[t.lines.length - 1]?.day ?? 0) > 75) {
      t.status = "closed";
      t.unread = true;
      t.lines.push(line(s, "them", "Nothing has been said for weeks. He assumes you are not interested."));
      continue;
    }
    // a story about a replacement leaks out
    if (!t.leaked && t.kind === "driver" && t.topic === "sign" && (t.status as Talk["status"]) !== "closed" && (t.status === "waiting" || t.status === "agreed" || t.round > 0)) {
      const p = (mgr ? 0.035 : 0.018) + t.round * 0.008 + (t.status === "agreed" ? 0.02 : 0);
      if (rngFor(s, `leak:${t.id}`).chance(p)) leak(s, t, d ?? undefined);
    }
    void j;
  }
  if (s.talks.length > 60) s.talks = s.talks.filter((t) => t.status !== "closed" || s.day - (t.lines[t.lines.length - 1]?.day ?? 0) < 120);
}

/** The press gets wind of it. The driver who might be replaced is the one who suffers: the number two, or both if they are equal. */
function leak(s: CareerState, t: Talk, target?: DriverState) {
  const mine = driversOf(s, s.teamId);
  if (mine.length === 0) return;
  let victims: DriverState[];
  if (t.replaces) victims = mine.filter((x) => x.id === t.replaces);
  else {
    const n2 = mine.filter((x) => x.role === "number2");
    const n1 = mine.filter((x) => x.role === "number1");
    victims = n2.length && n1.length ? n2 : mine;
  }
  if (!victims.length) victims = mine;
  t.leaked = true;
  const who = target?.spec.name ?? s.academy.prospects[t.targetId]?.name ?? "a driver";
  const names = victims.map((v) => v.spec.name).join(" and ");
  for (const v of victims) {
    v.grievance = round2(clamp(v.grievance + 0.12, 0, 1));
    v.trust = clamp(v.trust - 0.05, 0, 1);
    v.morale = clamp(v.morale - 0.06, 0, 1);
    addCause(v, "leak", 0.22);
  }
  s.press.mood = clamp(s.press.mood - 0.04, -1, 1);
  news(s, `${who} is said to be in talks with your team. ${names} ${victims.length > 1 ? "are" : "is"} reported to be unhappy about the story.`, { importance: 2, cause: "Talks leaked", tag: "people" });
  t.lines.push(line(s, "press", `The story is out: "${who} in talks to join". ${names} ${victims.length > 1 ? "have" : "has"} read it too.`));
  pushCard(s, "info", "Your talks have leaked", `The press has the story that you are speaking with ${who}. ${names} ${victims.length > 1 ? "read it in the paper and are" : "read it in the paper and is"} not happy. Meeting ${victims.length > 1 ? "them" : "him"} soon will help.`, [{ id: "ok", label: "OK" }], { urgency: 2, deadline: s.day + 8 });
}

function respond(s: CareerState, t: Talk, d: DriverState | undefined, mgr: Manager | null) {
  const rng = rngFor(s, `resp:${t.id}:${t.round}`);
  const name = d?.spec.name ?? s.academy.prospects[t.targetId]?.name ?? "He";
  const speaker = mgr ? mgr.name : name;
  const say = (text: string) => t.lines.push(line(s, "them", `${speaker}: "${text}"`));
  t.round += 1;
  t.status = "open";
  t.replyOn = undefined;
  t.unread = true;
  if (t.kind === "junior") {
    const p = s.academy.prospects[t.targetId];
    if (!p) {
      t.status = "closed";
      return;
    }
    if (!t.junior) {
      t.priority = p.attrs.ambition > 0.65 ? "A quick route to F1" : p.attrs.loyalty > 0.6 ? "Being looked after" : "Money for the family";
      say(`His camp cares most about: ${t.priority.toLowerCase()}.`);
      return;
    }
    const terms = t.junior;
    t.junior = undefined;
    const ask = askRetainer(s, p);
    let score = terms.retainer / ask;
    score -= terms.buyout > 6 ? 0.12 : terms.buyout > 3 ? 0.04 : 0;
    score -= terms.firstRefusal ? 0.05 : 0;
    score += (terms.years <= 2 ? 0.03 : -0.03);
    if (mgr) score -= (0.55 - managerMood(mgr, s.teamId)) * 0.2;
    // other teams are also circling a good prospect
    const rival = 0.85 + (p.attrs.pace - 0.5) * 0.4 + (mgr?.style === "shark" ? 0.1 : 0) + rng.gauss() * 0.06;
    if (score >= 1.0 && (!mgr || rival <= score + 0.12)) {
      t.status = "agreed";
      t.agreed = undefined;
      t.junior = terms;
      t.agreedUntil = s.day + 6;
      say("We can agree on that. Sign within six days or he looks elsewhere.");
      bump(mgr, s.teamId, 0.05);
    } else if (score >= 0.85) {
      t.junior = { ...terms, retainer: round2(Math.max(terms.retainer * 1.1, ask)) };
      say(`${mgr && rival > score ? "Another team has offered more, so " : ""}Closer to ${fmtMoney(t.junior.retainer)} a year and I think we have something.`);
      bump(mgr, s.teamId, -0.02);
    } else {
      say("That is not close to what he is worth.");
      bump(mgr, s.teamId, -0.1);
      if (mgr && managerMood(mgr, s.teamId) < 0.25) {
        mgr.coolUntil[s.teamId] = s.day + 21;
        t.status = "closed";
        t.lines.push(line(s, "them", `${mgr.name} ends the call and will not speak to you for three weeks.`));
      }
    }
    if (t.round >= 6 && (t.status as Talk["status"]) === "open") t.status = "closed";
    return;
  }
  if (!t.pending && t.topic === "sound" && d) {
    // the answer to being sounded out
    const v = interestIn(s, d);
    t.interest = interestWord(v);
    say(t.interest === "keen" ? "He would very much like to hear from you. Make it a serious offer when you are allowed to." : t.interest === "open" ? "He is willing to listen. He is not looking, but you would get a hearing." : t.interest === "cool" ? "He is settled and not easy to move, but he would not hang up." : "He is not interested, and I would not push it.");
    return;
  }
  if (!t.pending && d) {
    // the answer to what matters most
    const base: Offer = { salary: askingSalary(s, d), years: 2, role: "equal" };
    const v = evaluateOffer(s, s.teamId, d.id, base, false);
    const worst = [...v.lines].sort((a, b) => b.weight * (1 - b.value) - a.weight * (1 - a.value))[0];
    t.priority = worst?.label;
    say(PRIORITY_LINE[worst?.label ?? "Money"] ?? "Make him an offer and see.");
    return;
  }
  if (!t.pending || !d) return;
  const offer = t.pending;
  t.pending = undefined;
  const v = evaluateOffer(s, s.teamId, d.id, offer);
  let score = v.score;
  // an agent shops the offer around: if another team is better, he says so
  let shopped = false;
  if (mgr) {
    const q = clamp((d.spec.pace - 0.984) / 0.016, 0, 1);
    const rival = 0.5 + q * 0.22 + rng.gauss() * 0.08 + (mgr.style === "shark" ? 0.05 : 0);
    const mood = managerMood(mgr, s.teamId);
    score -= (0.55 - mood) * 0.14;
    if (rival > score + 0.02 && score >= 0.55) {
      shopped = true;
      score = Math.min(score, 0.69);
    }
  }
  const worst = [...v.lines].sort((a, b) => b.weight * (1 - b.value) - a.weight * (1 - a.value))[0];
  if (score >= 0.7) {
    t.status = "agreed";
    t.agreed = offer;
    t.agreedUntil = s.day + 6;
    say(`We have a deal in principle on those terms. Sign within six days or it is off.`);
    bump(mgr, s.teamId, 0.06);
  } else if (score >= 0.6) {
    const bump8 = Math.max(offer.salary * 1.08, v.counterSalary ?? 0);
    t.counter = { ...offer, salary: round2(bump8) };
    say(`${shopped ? "I have another team interested, so " : ""}${replyReason(worst?.label ?? "Money", rng)} Closer to ${fmtMoney(t.counter.salary)} a year and we can talk.`);
    bump(mgr, s.teamId, -0.02);
  } else {
    say(`${replyReason(worst?.label ?? "Money", rng)} That is not close.`);
    bump(mgr, s.teamId, -0.12);
    if (mgr && managerMood(mgr, s.teamId) < 0.25) {
      mgr.coolUntil[s.teamId] = s.day + 21;
      t.status = "closed";
      t.lines.push(line(s, "them", `${mgr.name} ends the call. You have lowballed one too many of his clients, and he will not speak to you for three weeks.`));
      for (const id of clientsOf(s, mgr)) {
        const other = s.talks.find((x) => x.targetId === id && x.status !== "closed" && x.id !== t.id);
        if (other) {
          other.status = "closed";
          other.lines.push(line(s, "them", `${mgr.name} has pulled his clients out of talks with you.`));
        }
      }
    }
  }
  if (t.round >= 6 && t.status === "open") {
    t.status = "closed";
    t.lines.push(line(s, "them", "He has had enough of going back and forth and walks away."));
    bump(mgr, s.teamId, -0.08);
  }
}

export function closeTalk(s: CareerState, t: Talk, why = "You end the talks."): void {
  t.status = "closed";
  t.lines.push(line(s, "you", why));
}

// ------------------------------------------------------------ private conversations

export const DRIVER_TOPICS = [
  { id: "feel", label: "HOW DO YOU FEEL?", hint: "Ask how he really feels about the team." },
  { id: "future", label: "YOUR FUTURE", hint: "Ask where he sees himself next year." },
  { id: "teammate", label: "YOUR TEAM-MATE", hint: "Ask how it is with the other car." },
] as const;
export const JUNIOR_TOPICS = [
  { id: "ambition", label: "AMBITION", hint: "Ask how far he wants to go and how fast." },
  { id: "series", label: "THE SERIES", hint: "Ask how the championship is going for him." },
  { id: "manager", label: "THE FAMILY", hint: "Ask who is advising him, and what they want." },
] as const;
export const MANAGER_TOPICS = [
  { id: "clients", label: "WHO IS ON THE BOOKS", hint: "Ask who he speaks for." },
  { id: "calls", label: "WHO IS CALLING", hint: "Ask which teams are asking about his clients." },
  { id: "relationship", label: "CLEAR THE AIR", hint: "Smooth things over after a hard negotiation." },
] as const;

const meetKey = (kind: string, id: string, topic: string) => `talk:${kind}:${id}:${topic}`;

/** A private conversation outside a negotiation. It tells you something true and nudges the relationship. */
export function privateTalk(s: CareerState, kind: "driver" | "junior" | "manager", targetId: string, topic: string): { ok: boolean; message: string } {
  const key = meetKey(kind, targetId, topic);
  if (s.day - (s.story.last[key] ?? -99) < 10) return { ok: false, message: "You covered that recently. Give it ten days." };
  s.story.last[key] = s.day;
  const rng = rngFor(s, `pt:${kind}:${targetId}:${topic}`);
  if (kind === "driver") {
    const d = s.drivers[targetId];
    if (!d || d.teamId !== s.teamId) return { ok: false, message: "Not your driver." };
    // an honest answer needs trust; a driver who does not trust you gives you the polite version
    const honest = d.trust >= 0.4 || rng.chance(0.4);
    if (topic === "feel") {
      d.trust = clamp(d.trust + 0.02, 0, 1);
      d.grievance = round2(clamp(d.grievance - 0.03, 0, 1));
      const top = Object.entries(d.causes).filter(([k, v]) => k !== "noResign" && v > 0.03).sort((a, b) => b[1] - a[1])[0];
      return { ok: true, message: honest ? (top ? `${d.spec.name}: "Straight answer: it is ${(CAUSE_PLAIN[top[0]] ?? top[0]).toLowerCase()}. Otherwise I am fine."` : `${d.spec.name}: "Honestly, nothing is bothering me."`) : `${d.spec.name}: "All good, boss." He does not quite meet your eye.` };
    }
    if (topic === "future") {
      d.trust = clamp(d.trust + 0.015, 0, 1);
      const open = d.endYear <= s.year + 1;
      const w = interestIn(s, { ...d, teamId: null } as DriverState);
      return { ok: true, message: honest ? `${d.spec.name}: "${open ? "My deal is up soon, and I will listen to what is on offer, from you first." : "I am here until " + d.endYear + "."} ${w > 0.65 ? "If the car does not improve I will start to look around." : "I am happy where I am."}"` : `${d.spec.name}: "I am focused on the next race."` };
    }
    const mate = driversOf(s, s.teamId).find((x) => x.id !== d.id);
    if (!mate) return { ok: true, message: `${d.spec.name}: "No team-mate yet."` };
    d.trust = clamp(d.trust + 0.01, 0, 1);
    return { ok: true, message: honest ? `${d.spec.name}: "${s.rift.stage >= 2 ? "It is tense, I will not lie. We are fighting for the same thing." : s.rift.stage === 1 ? "A bit of needle, nothing serious." : "Fine. We get on."}"` : `${d.spec.name}: "No problems with ${mate.spec.name}."` };
  }
  if (kind === "junior") {
    const p = s.academy.prospects[targetId];
    if (!p) return { ok: false, message: "He is not on your books." };
    const mgr = managerOf(s, targetId);
    if (topic === "ambition") {
      p.confidence = clamp(p.confidence + 0.02, 0, 1);
      return { ok: true, message: `${p.name}: "${p.attrs.ambition > 0.65 ? "I want a seat as soon as possible." : "I want to learn and get better first."} ${mgr ? "My manager thinks I should move faster." : ""}"` };
    }
    if (topic === "series") return { ok: true, message: `${p.name}: "${p.confidence > 0.6 ? "It is going well. I feel in the car." : "It is tough this year. I need results."}"` };
    return { ok: true, message: mgr ? `${p.name}: "${mgr.name} advises me. ${mgr.style === "shark" ? "He talks to every team and wants the best offer." : mgr.style === "loyal" ? "He wants me somewhere I am looked after." : "He lets me decide."}"` : `${p.name}: "My family decide with me. No agent."}` };
  }
  const m = s.managers[targetId];
  if (!m) return { ok: false, message: "He is not available." };
  if (topic === "clients") {
    const ids = clientsOf(s, m).map((id) => s.drivers[id]?.spec.name ?? s.academy.prospects[id]?.name ?? id).slice(0, 6);
    return { ok: true, message: `${m.name} speaks for ${ids.length} people you know about, including ${ids.slice(0, 4).join(", ") || "nobody you know"}. He likes to be kept in the picture.` };
  }
  if (topic === "calls") {
    const tm = Object.values(s.teams).filter((t) => t.id !== s.teamId);
    const callers = [rng.pick(tm), rng.pick(tm)].filter((x, i, a) => a.indexOf(x) === i).map((x) => x.id.toUpperCase());
    return { ok: true, message: `${m.name}: "${callers.join(" and ")} have both asked about my clients this month. I will take the best deal for each of them."` };
  }
  bump(m, s.teamId, 0.12);
  m.coolUntil[s.teamId] = Math.min(m.coolUntil[s.teamId] ?? 0, s.day);
  return { ok: true, message: `${m.name} takes the call. "Fair enough. We will see." He is warmer towards you.` };
}

const CAUSE_PLAIN: Record<string, string> = {
  pace: "the car is not quick enough",
  upgrade: "a shortage of upgrades",
  leak: "reading about talks with other drivers in the paper",
  promise: "a promise that was not kept",
  noResign: "he does not want to stay",
  teammate: "his team-mate",
  role: "his status in the team",
  money: "his pay",
};
