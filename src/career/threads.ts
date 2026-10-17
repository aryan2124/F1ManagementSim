import { addFact } from "./facts";
import { pushCard, news, ticker, recap } from "./cards";
import { boardMove } from "./board";
import { driversOf } from "./finance";
import { DESIGN_KEYS, designOf } from "./design";
import { clamp, rngFor, round2 } from "./util";
import { injectIdea } from "./rnd";
import type { CardOption, CareerState, Staff } from "./types";

/**
 * The story engine. A thread is a storyline with a cast, a stage and stakes. It surfaces in news, the ticker and cards,
 * moves on from facts and from what its people want, and leaves a line in the chronicle when it ends. The director decides
 * how many threads run and how fast, by its personality. Only invented people (staff, trainees, sponsors) get personal drama;
 * real drivers get sporting threads only, and no invented quotes.
 */
export type ThreadKind = "rivalry" | "defector" | "prodigy" | "gamble" | "heritage" | "rookie";
export type Teller = "drama" | "steady" | "chaos";

export interface Thread {
  id: string;
  kind: ThreadKind;
  stage: number;
  cast: Record<string, string>;
  heat: number;
  born: number;
  next: number;
  data: Record<string, number | string>;
  done?: boolean;
  /** One line when it ended. */
  ending?: string;
}
export interface Chronicle {
  day: number;
  year: number;
  kind: ThreadKind;
  text: string;
}

export const TELLERS: Record<Teller, { label: string; blurb: string; cap: number; gap: number; chance: number }> = {
  drama: { label: "DRAMA", blurb: "Stories build and collide. Up to three at once.", cap: 3, gap: 7, chance: 0.6 },
  steady: { label: "STEADY", blurb: "One or two stories at a time with room to breathe.", cap: 2, gap: 12, chance: 0.4 },
  chaos: { label: "CHAOS", blurb: "Stories arrive when they like and pile up.", cap: 4, gap: 3, chance: 0.75 },
};

export const tellerOf = (s: CareerState): Teller => s.teller ?? "drama";
export const liveThreads = (s: CareerState): Thread[] => (s.threads ?? []).filter((t) => !t.done);

const KIND_GAP = 150;

const me = (s: CareerState) => s.teams[s.teamId];
const opt = (id: string, label: string, detail?: string, lines?: string[]): CardOption => ({ id, label, detail, lines });
const dn = (s: CareerState, id: string) => s.drivers[id]?.spec.name ?? id;

function stake(s: CareerState, v: { board?: number; cash?: number; fans?: number; mood?: number; heat?: number }) {
  const t = me(s);
  if (v.board) boardMove(s, t, v.board, "A story");
  if (v.cash) {
    t.cash = round2(t.cash + v.cash);
    if (v.cash < 0) t.ledger.costs += -v.cash;
  }
  if (v.fans) s.brand.fans = clamp(s.brand.fans + v.fans, 0, 100);
  if (v.mood) for (const d of driversOf(s, s.teamId)) d.morale = clamp(d.morale + v.mood, 0, 1);
  if (v.heat) s.press.heat = clamp(s.press.heat + v.heat, 0, 1);
}

function end(s: CareerState, th: Thread, text: string, weight: 1 | 2 | 3 = 2) {
  th.done = true;
  th.ending = text;
  (s.chronicle ??= []).push({ day: s.day, year: s.year, kind: th.kind, text });
  addFact(s, `thread:${th.kind}`, text, [...Object.values(th.cast), s.teamId], weight);
  news(s, text, { importance: 2, tag: "story" });
  recap(s, text);
}

function card(s: CareerState, th: Thread, title: string, body: string, options: CardOption[], days = 10) {
  pushCard(s, "event", title, body, options, { deadline: s.day + days, defaultOption: options[options.length - 1].id, urgency: 2, data: { ev: `thread:${th.id}`, tid: th.id, stage: th.stage } });
}

const roleName = (st: Staff) => ({ td: "technical director", designer: "chief designer", engineer: "race engineer", mechanic: "chief mechanic", aero: "head of aerodynamics", scout: "scout", coach: "coach" } as Record<string, string>)[st.role] ?? st.role;

/** Invented, senior and valued: the people a rival would approach. */
function prizedStaff(s: CareerState): Staff | undefined {
  return Object.values(s.staff)
    .filter((x) => x.teamId === s.teamId && !x.intern && x.skill >= 68 && (x.role === "td" || x.role === "designer" || x.role === "engineer"))
    .sort((a, b) => b.skill - a.skill)[0];
}

/** A trainee on your team whose own part has landed in the last two months, if any. */
function landedRookie(s: CareerState): Staff | undefined {
  const log = me(s).dev?.log ?? [];
  const e = [...log].reverse().find((x) => x.kind === "landed" && x.staffId && s.day - x.day < 60 && s.staff[x.staffId]?.intern && s.staff[x.staffId].teamId === s.teamId);
  return e?.staffId ? s.staff[e.staffId] : undefined;
}

const TEMPLATES: Record<ThreadKind, { weight: (s: CareerState) => number; open: (s: CareerState) => Thread | null; step: (s: CareerState, th: Thread) => void; answer: (s: CareerState, th: Thread, option: string) => void }> = {
  rivalry: {
    weight: (s) => (s.round >= 3 ? 1.2 : 0),
    open: (s) => {
      const rows = Object.entries(s.standings.drivers).filter(([id]) => s.drivers[id] && !s.drivers[id].retired).sort((a, b) => b[1] - a[1]);
      if (rows.length < 2) return null;
      const [a, b] = rows;
      if (a[1] - b[1] > 18 || a[1] < 10) return null;
      return mk(s, "rivalry", { a: a[0], b: b[0] }, 0.6, 14, { gap0: a[1] - b[1] });
    },
    step: (s, th) => {
      const A = s.standings.drivers[th.cast.a] ?? 0, B = s.standings.drivers[th.cast.b] ?? 0;
      const gap = Math.abs(A - B);
      const lead = A >= B ? th.cast.a : th.cast.b;
      const mine = driversOf(s, s.teamId).some((d) => d.id === th.cast.a || d.id === th.cast.b);
      if (th.stage === 0) {
        news(s, `${dn(s, th.cast.a)} and ${dn(s, th.cast.b)} are ${gap} points apart and the paddock is watching the pair.`, { importance: 2, tag: "story" });
        th.stage = 1; th.next = s.day + 28; th.heat = 0.5;
      } else if (th.stage === 1) {
        if (gap > 40 || s.round >= s.calendar.length) return end(s, th, `${dn(s, lead)} pulled clear of ${dn(s, lead === th.cast.a ? th.cast.b : th.cast.a)} and the fight went quiet.`);
        ticker(s, `${dn(s, th.cast.a)} v ${dn(s, th.cast.b)}: ${gap} points between them.`, 2);
        th.stage = 2; th.next = s.day + 35; th.heat = 0.8;
        if (mine) card(s, th, "A title fight is forming", `${dn(s, th.cast.a)} and ${dn(s, th.cast.b)} are ${gap} points apart. One of them is yours. Do you commit the team to the fight?`, [opt("all", "All in", "Upgrades and strategy go his way", ["Heat rises, the other driver feels it."]), opt("fair", "Run it fair", "Both drivers get the same", ["Calmer, slower to pay off."]), opt("quiet", "Say nothing")]);
      } else {
        end(s, th, `The ${s.year} fight between ${dn(s, th.cast.a)} and ${dn(s, th.cast.b)} ended with ${dn(s, lead)} ahead by ${gap}.`, 3);
      }
    },
    answer: (s, th, o) => {
      if (o === "all") { stake(s, { mood: -0.03, heat: 0.15, fans: 1 }); th.heat = 1; }
      else if (o === "fair") { stake(s, { mood: 0.04, heat: -0.1 }); th.heat = 0.6; }
    },
  },
  defector: {
    weight: (s) => (prizedStaff(s) ? 1 : 0),
    open: (s) => {
      const st = prizedStaff(s);
      if (!st) return null;
      const rivals = Object.keys(s.teams).filter((x) => x !== s.teamId && !s.humans?.includes(x));
      const rng = rngFor(s, `defector:${s.day}`);
      const rival = rng.pick(rivals);
      return mk(s, "defector", { who: st.id, rival }, 0.7, 6, { pay0: st.salary });
    },
    step: (s, th) => {
      const st = s.staff[th.cast.who];
      if (!st || st.teamId !== s.teamId) return end(s, th, "The approach came to nothing: he is no longer with the team.", 1);
      if (th.stage === 0) {
        th.stage = 1; th.next = s.day + 40; th.heat = 0.7;
        card(s, th, `${st.name} has been approached`, `Your ${roleName(st)} ${st.name} has been seen with people from ${th.cast.rival.toUpperCase()}. Everything he knows about your car goes where he goes.`, [opt("raise", "Counter with a raise", "$1.5m a year more, three years", ["Costs real money."]), opt("promote", "Give him more say", "Mood up, no cost", ["He may still go."]), opt("let", "Let the market decide")]);
      } else {
        const stays = Number(th.data.stays ?? 0) === 1;
        if (stays) return end(s, th, `${st.name} stayed with the team.`, 2);
        const rival = s.teams[th.cast.rival];
        st.teamId = th.cast.rival;
        if (rival) for (const tr of Object.keys(rival.know ?? {})) { const k = (rival.know as any)[tr]; if (k) k.err = round2(Math.max(0.03, k.err * 0.97)); }
        stake(s, { board: -2, fans: -1 });
        end(s, th, `${st.name} left for ${th.cast.rival.toUpperCase()}. They will build with what he learned here.`, 3);
      }
    },
    answer: (s, th, o) => {
      const st = s.staff[th.cast.who];
      if (!st) return;
      const rng = rngFor(s, `defect:${th.id}`);
      if (o === "raise") { stake(s, { cash: -1.5 }); st.salary = round2(st.salary + 1.5); st.endYear = Math.max(st.endYear, s.year + 3); st.mood = clamp(st.mood + 0.15, 0, 1); th.data.stays = rng.chance(0.85) ? 1 : 0; }
      else if (o === "promote") { st.mood = clamp(st.mood + 0.1, 0, 1); th.data.stays = rng.chance(0.55) ? 1 : 0; }
      else th.data.stays = rng.chance(0.25) ? 1 : 0;
    },
  },
  prodigy: {
    weight: (s) => (Object.values(s.staff).some((x) => x.teamId === s.teamId && x.intern && (x.intern.potential ?? 0) >= 0.7) ? 1.2 : 0),
    open: (s) => {
      const st = Object.values(s.staff).filter((x) => x.teamId === s.teamId && x.intern).sort((a, b) => (b.intern?.potential ?? 0) - (a.intern?.potential ?? 0))[0];
      return st ? mk(s, "prodigy", { who: st.id }, 0.5, 7, {}) : null;
    },
    step: (s, th) => {
      const st = s.staff[th.cast.who];
      if (!st || st.teamId !== s.teamId) return end(s, th, "The trainee who caught the paddock's eye is gone.", 1);
      if (th.stage === 0) {
        th.stage = 1; th.next = s.day + 45; th.heat = 0.6;
        card(s, th, `${st.name} is turning heads`, `Your trainee ${st.name} is far ahead of the others. Two rival teams have asked about him.`, [opt("promote", "Promote him now", "Full contract, a place on the team", ["Costs a salary, keeps him."]), opt("bonus", "Retention bonus", "$0.6m, he stays a trainee", ["Buys a season."]), opt("hold", "Let him develop")]);
      } else {
        const kept = Number(th.data.kept ?? 0) === 1;
        if (kept) { st.skill = clamp(st.skill + 4, 0, 100); return end(s, th, `${st.name} grew into a real asset for the team.`, 2); }
        st.teamId = null;
        end(s, th, `${st.name} was lured away before the team could keep him.`, 2);
      }
    },
    answer: (s, th, o) => {
      const st = s.staff[th.cast.who];
      if (!st) return;
      const rng = rngFor(s, `prod:${th.id}`);
      if (o === "promote") { st.intern = undefined; st.salary = Math.max(st.salary, 0.6); st.endYear = s.year + 3; th.data.kept = 1; stake(s, { cash: -0.3 }); }
      else if (o === "bonus") { stake(s, { cash: -0.6 }); th.data.kept = rng.chance(0.8) ? 1 : 0; }
      else th.data.kept = rng.chance(0.4) ? 1 : 0;
    },
  },
  gamble: {
    weight: (s) => {
      const t = me(s);
      const cur = designOf(t);
      const far = t.designNext ? DESIGN_KEYS.reduce((a, k) => a + Math.abs(t.designNext![k] - cur[k]), 0) : 0;
      return far > 1.2 || (s.nextCar?.approach === "revolve" && (s.nextCar.share ?? 0) >= 0.5) ? 1.4 : 0;
    },
    open: (s) => mk(s, "gamble", { who: s.teamId }, 0.5, 14, { tests0: (me(s).notebook ?? []).length }),
    step: (s, th) => {
      if (th.stage === 0) {
        th.stage = 1; th.next = s.day + 60; th.heat = 0.7;
        news(s, "The press are asking whether the team's radical new direction is a masterstroke or a mistake.", { importance: 2, tag: "story" });
        card(s, th, "The concept is a gamble", "Your new direction is far from anything on the grid. The board wants to know you have a plan and the press smell a story.", [opt("explain", "Explain the plan to the board", "Board calmer, you commit to it", ["The press hear it too."]), opt("lab", "Say the lab will prove it", "Needs real tests in the lab", ["Credit if the notebook backs you up."]), opt("silent", "No comment")]);
      } else {
        const tests = (me(s).notebook ?? []).length - Number(th.data.tests0 ?? 0);
        const backed = tests >= 3 || th.data.plan === "explain";
        if (backed) { stake(s, { board: 3, fans: 2 }); return end(s, th, "The gamble held up: the team understood its own concept and the car came good.", 3); }
        stake(s, { board: -4, fans: -2, heat: 0.1 });
        end(s, th, "The gamble was never properly understood. The car stayed fussy and the board noticed.", 3);
      }
    },
    answer: (s, th, o) => {
      th.data.plan = o;
      if (o === "explain") stake(s, { board: 2 });
      if (o === "lab") th.data.tests0 = Math.min(Number(th.data.tests0 ?? 0), (me(s).notebook ?? []).length);
    },
  },
  heritage: {
    weight: (s) => (s.brand.by != null && me(s).sponsors.some((x) => x.id === s.brand.by) ? 1.1 : 0),
    open: (s) => mk(s, "heritage", { sponsor: String(s.brand.by) }, 0.6, 8, {}),
    step: (s, th) => {
      const sp = me(s).sponsors.find((x) => String(x.id) === th.cast.sponsor);
      if (!sp) return end(s, th, "The livery row faded when the deal ended.", 1);
      if (th.stage === 0) {
        th.stage = 1; th.next = s.day + 50; th.heat = 0.65;
        card(s, th, "Fans are campaigning against the livery", `${sp.name} put its colours on the car and a large part of the fan base hates it. They are organising a petition.`, [opt("hold", "Stand by the sponsor", "Sponsor pleased, fans angrier", ["Money talks."]), opt("meet", "Meet the fans halfway", "Cost: a restyled car", ["$0.4m, both sides calmer."]), opt("bend", "Restore the old look", "Fans delighted, sponsor furious", ["The deal may not survive."])]);
      } else {
        const choice = String(th.data.choice ?? "hold");
        end(s, th, choice === "bend" ? "The team went back to its heritage colours and the fans came home." : choice === "meet" ? "A compromise livery calmed the row." : "The team stood by its sponsor and lived with the noise.", 2);
      }
    },
    answer: (s, th, o) => {
      th.data.choice = o;
      const sp = me(s).sponsors.find((x) => String(x.id) === th.cast.sponsor);
      if (o === "hold") { stake(s, { fans: -3, cash: 0.3 }); if (sp) sp.mood = clamp((sp.mood ?? 0.5) + 0.1, 0, 1); }
      else if (o === "meet") stake(s, { cash: -0.4, fans: 1 });
      else { stake(s, { fans: 4 }); if (sp) sp.mood = clamp((sp.mood ?? 0.5) - 0.25, 0, 1); }
    },
  },
  rookie: {
    // opens only when a trainee's own part has really landed, from the development record
    weight: (s) => (landedRookie(s) ? 2 : 0),
    open: (s) => {
      const st = landedRookie(s);
      return st ? mk(s, "rookie", { who: st.id }, 0.55, 3, {}) : null;
    },
    step: (s, th) => {
      const st = s.staff[th.cast.who];
      if (!st || st.teamId !== s.teamId) return end(s, th, "The trainee whose first part worked is no longer with the team.", 1);
      if (th.stage === 0) {
        th.stage = 1; th.next = s.day + 42; th.heat = 0.65;
        const rival = Object.keys(s.teams).filter((id) => id !== s.teamId && !id.startsWith("x"))[0] ?? "a rival";
        th.cast.rival = rival;
        card(s, th, `${st.name} is the name in the paddock`, `A trainee's part works and everybody has noticed. ${rival.toUpperCase()} have asked about him. He has not said a word to you, which tells you he is listening.`, [opt("promote", "Offer him a real job", "A proper contract, a seat in the department", ["Costs a salary, keeps him."]), opt("credit", "Give him the credit in public", "Free, and he will remember it", ["Keeps him if he already feels backed."]), opt("quiet", "Keep it quiet", "He stays a trainee", ["Keeps him only if he is happy here."])]);
      } else if (th.stage === 1) {
        // how he was treated shapes the odds, never the answer: people are not formulas
        const rec = me(s).dev?.rec[st.id];
        const choice = String(th.data.choice ?? "quiet");
        const warm = clamp(st.mood, 0, 1) * 0.5 + Math.min(0.2, ((rec?.heard ?? 0) + (rec?.backed ?? 0)) * 0.05) - Math.min(0.2, (rec?.overruled ?? 0) * 0.05);
        const p = clamp((choice === "promote" ? 0.72 : choice === "credit" ? 0.42 : 0.18) + warm, 0.05, 0.95);
        const kept = rngFor(s, `rookie:${th.id}:stay`).chance(p);
        th.data.p = round2(p);
        if (kept) {
          th.stage = 2; th.next = s.day + 56; th.heat = 0.4;
          stake(s, { fans: 1 });
          st.mood = clamp(st.mood + 0.1, 0, 1);
          for (const o of Object.values(s.staff)) if (o.teamId === s.teamId && o.id !== st.id) o.mood = clamp(o.mood + 0.02, 0, 1);
          news(s, `${st.name} turned down the offers and stayed.`, { importance: 1, tag: "story" });
        } else {
          st.teamId = null;
          s.freeStaff.push(st.id);
          end(s, th, `${st.name} left for ${String(th.cast.rival).toUpperCase()}. A part that worked was not enough to keep him.`, 2);
        }
      } else {
        // a second act that depends on who he has become, and on a roll of the dice
        const rec = me(s).dev?.rec[st.id];
        const rng = rngFor(s, `rookie:${th.id}:act2`);
        const confident = (rec?.landed ?? 0) >= 1 && st.mood >= 0.5;
        if (confident && rng.chance(0.55)) {
          const best = (["aero", "chassis", "power", "cooling", "tyres"] as const).slice().sort((x, y) => (st.spec?.[y] ?? 0.5) - (st.spec?.[x] ?? 0.5))[0];
          const idea = injectIdea(s, s.teamId, best, "gamble", { note: `${st.name}'s second idea, bolder than the first.`, name: `${st.name.split(" ").slice(-1)[0]}'s big one` });
          idea.lead = st.id;
          idea.rookie = false;
          return end(s, th, `${st.name} came back with a bolder idea. The office is listening to him now.`, 2);
        }
        if (rng.chance(0.35)) { st.mood = clamp(st.mood - 0.12, 0, 1); return end(s, th, `${st.name} asked for a bigger role and did not get a clear answer. He is quieter now.`, 1); }
        end(s, th, `${st.name} settled in. He is one of the people the office relies on.`, 2);
      }
    },
    answer: (s, th, o) => {
      const st = s.staff[th.cast.who];
      th.data.choice = o;
      if (!st) return;
      if (o === "promote") { st.intern = undefined; st.salary = Math.max(st.salary, 0.6); st.endYear = Math.max(st.endYear, s.year + 3); st.mood = clamp(st.mood + 0.12, 0, 1); stake(s, { cash: -0.3 }); addFact(s, "promotion", `${st.name} was promoted from trainee after his part worked.`, [st.id, s.teamId], 2); }
      else if (o === "credit") { st.mood = clamp(st.mood + 0.1, 0, 1); st.known = clamp(st.known + 0.1, 0, 1); stake(s, { fans: 1 }); }
    },
  },
};

function mk(s: CareerState, kind: ThreadKind, cast: Record<string, string>, heat: number, wait: number, data: Record<string, number | string>): Thread {
  return { id: `${kind}:${s.uid++}`, kind, stage: 0, cast, heat, born: s.day, next: s.day + wait, data };
}

/** Once a week: threads advance on their own clock, and the director may open a new one. */
export function threadsWeekly(s: CareerState) {
  if (s.weekend) return;
  const list = (s.threads ??= []);
  for (const th of list) if (!th.done && s.day >= th.next && !s.cards.some((c) => c.data?.tid === th.id)) TEMPLATES[th.kind].step(s, th);
  // heat feeds the press and fades
  const hot = Math.max(0, ...liveThreads(s).map((t) => t.heat));
  if (hot > s.press.heat) s.press.heat = round2(clamp(s.press.heat + (hot - s.press.heat) * 0.3, 0, 1));
  // old finished threads are forgotten, the chronicle stays
  if (list.length > 40) s.threads = list.filter((t) => !t.done || s.day - t.born < 400);
  const tell = TELLERS[tellerOf(s)];
  const live = liveThreads(s);
  if (live.length >= tell.cap) return;
  if (s.cards.filter((c) => !c.notice && c.kind === "event").length >= 3) return;
  const rng = rngFor(s, `director:${s.day}:${s.teamId}`);
  const last = Math.max(0, ...list.map((t) => t.born));
  if (s.day - last < tell.gap || !rng.chance(tell.chance)) return;
  const kinds = (Object.keys(TEMPLATES) as ThreadKind[]).filter((k) => !live.some((t) => t.kind === k) && s.day - Math.max(-9999, ...list.filter((t) => t.kind === k).map((t) => t.born)) >= KIND_GAP && TEMPLATES[k].weight(s) > 0);
  if (!kinds.length) return;
  const total = kinds.reduce((a, k) => a + TEMPLATES[k].weight(s), 0);
  let r = rng.next() * total;
  let pick = kinds[0];
  for (const k of kinds) { r -= TEMPLATES[k].weight(s); if (r <= 0) { pick = k; break; } }
  const th = TEMPLATES[pick].open(s);
  if (th) list.push(th);
}

/** A card the player answered. */
export function resolveThread(s: CareerState, ev: string, option: string, data: Record<string, number | string | boolean>): boolean {
  if (!ev.startsWith("thread:")) return false;
  const th = (s.threads ?? []).find((t) => t.id === String(data.tid ?? ev.slice(7)));
  if (!th || th.done) return true;
  TEMPLATES[th.kind].answer(s, th, option);
  th.heat = clamp(th.heat, 0, 1);
  recap(s, `${th.kind}: you chose ${option}.`);
  return true;
}

/** For tests and tools: open a given kind now. */
export function forceThread(s: CareerState, kind: ThreadKind): boolean {
  const th = TEMPLATES[kind].open(s);
  if (!th) return false;
  (s.threads ??= []).push(th);
  return true;
}
export function advanceThread(s: CareerState, th: Thread) {
  TEMPLATES[th.kind].step(s, th);
}
