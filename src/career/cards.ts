import { nextId } from "./util";
import { addFact } from "./facts";
import type { Card, CardKind, CardOption, CareerState } from "./types";

export function pushCard(
  s: CareerState,
  kind: CardKind,
  title: string,
  body: string,
  options: CardOption[],
  opts: { deadline?: number; defaultOption?: string; urgency?: 1 | 2 | 3; data?: Card["data"] } = {},
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
  };
  s.cards.push(card);
  return card;
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
export function sendLetter(s: CareerState, m: { from: string; role: string; subject: string; body: string; read?: boolean }) {
  const list = (s.letters ??= []);
  list.unshift({ id: nextId(s), day: s.day, from: m.from, role: m.role, subject: m.subject, body: m.body, read: m.read ?? false });
  if (list.length > 60) list.length = 60;
}
