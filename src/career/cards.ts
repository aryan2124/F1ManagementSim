import { nextId } from "./util";
import { addFact } from "./facts";
import type { Card, CardKind, CardOption, CareerState } from "./types";

/** Decision kinds from the old research flow and the weekly plan. The tree replaced them, so they are never put in front of the player. */
export const DEAD_KINDS: ReadonlySet<CardKind> = new Set<CardKind>(["weekPlan", "campaign", "ideaBatch", "partReveal", "projectReady", "rndDirection", "devCrisis", "devEvent", "testDay", "nextCar", "staffNotice", "weekendPrep"]);

export function pushCard(
  s: CareerState,
  kind: CardKind,
  title: string,
  body: string,
  options: CardOption[],
  opts: { deadline?: number; defaultOption?: string; urgency?: 1 | 2 | 3; data?: Card["data"]; mandatory?: boolean; free?: boolean; lapse?: "race" | "year" } = {},
): Card {
  const card: Card = {
    id: nextId(s),
    kind,
    title,
    body,
    options,
    created: s.day,
    deadline: opts.deadline,
    defaultOption: opts.defaultOption ?? options[0]?.id,
    urgency: opts.urgency ?? 2,
    data: opts.data,
    notice: options.length <= 1,
    mandatory: opts.mandatory ?? (kind === "firing" ? true : undefined),
    lapse: opts.lapse ? { on: opts.lapse, round: s.round, year: s.year } : undefined,
  };
  if (!DEAD_KINDS.has(kind) && (opts.mandatory || opts.free || withinBudget(s, kind, options.length, opts.urgency ?? 2))) s.cards.push(card);
  return card;
}

/**
 * One fixed budget of optional choices for every career: a few events and a few offers a season, spaced apart.
 * Urgent letters, contracts, the board and the tree never count against it.
 */
const BUDGET: Partial<Record<CardKind, { n: number; gap: number }>> = { event: { n: 4, gap: 28 }, mail: { n: 3, gap: 24 }, media: { n: 3, gap: 36 } };
function withinBudget(s: CareerState, kind: CardKind, options: number, urgency: number): boolean {
  const b = BUDGET[kind];
  if (!b || options < 2 || urgency >= 3) return true;
  const led = (s.cardBudget ??= {});
  const e = (led[kind] ??= { year: s.year, n: 0, day: -999 });
  if (e.year !== s.year) { e.year = s.year; e.n = 0; }
  if (e.n >= b.n || s.day - e.day < b.gap) return false;
  e.n += 1;
  e.day = s.day;
  return true;
}

/** In a league, lines about "you" or your own factory go to your private feed, the rest to everyone. */
const PRIVATE = /\b(you|your|you're|you've)\b|^(Project finished|Facility upgrade finished|Concept Lab|Fitted:|\d+ new part)/i;

export function ticker(s: CareerState, text: string, importance: 1 | 2 | 3 = 1) {
  if (s.humans && PRIVATE.test(text)) {
    (s.privTicker ??= []).unshift({ day: s.day, text, importance });
    if (s.privTicker.length > 30) s.privTicker.length = 30;
    return;
  }
  s.ticker.unshift({ day: s.day, text, importance });
  if (s.ticker.length > 40) s.ticker.length = 40;
}

export function news(s: CareerState, text: string, opts: { importance?: 1 | 2 | 3; cause?: string; tag?: string } = {}) {
  if ((opts.importance ?? 2) >= 2) addFact(s, opts.tag ?? "news", text, [], (opts.importance ?? 2) >= 3 ? 3 : 2);
  if (s.humans && PRIVATE.test(text)) {
    (s.privNews ??= []).unshift({ day: s.day, text, importance: opts.importance ?? 2, cause: opts.cause, tag: opts.tag });
    if (s.privNews.length > 80) s.privNews.length = 80;
    return;
  }
  s.news.unshift({ day: s.day, text, importance: opts.importance ?? 2, cause: opts.cause, tag: opts.tag });
  if (s.news.length > 160) s.news.length = 160;
}

export function recap(s: CareerState, text: string) {
  if (s.recap.length < 12) s.recap.push(text);
}

export const OK: CardOption[] = [{ id: "ok", label: "OK" }];

/** A letter for the Inbox tab. It never stops the clock, and if it is not answered it simply lapses. */
export function sendMail(
  s: CareerState,
  m: { from: string; role: string; subject: string; body: string; options: CardOption[]; days?: number; def?: string; data?: Card["data"] },
): Card {
  const c = pushCard(s, "mail", m.subject, m.body, m.options, { urgency: 1, deadline: s.day + (m.days ?? 25), defaultOption: m.def ?? m.options[m.options.length - 1].id, data: m.data });
  c.mail = { from: m.from, role: m.role };
  c.notice = false;
  return c;
}

/** A message from a person that needs no answer. It sits in the inbox, read or unread. */
export function sendLetter(s: CareerState, m: { from: string; role: string; subject: string; body: string; read?: boolean; folder?: "practice" | "track"; table?: { head: string[]; rows: string[][] } }) {
  const list = (s.letters ??= []);
  list.unshift({ id: nextId(s), day: s.day, from: m.from, role: m.role, subject: m.subject, body: m.body, read: m.read ?? false, ...(m.folder ? { folder: m.folder } : {}), ...(m.table ? { table: m.table } : {}) });
  if (list.length > 120) list.length = 120;
}
