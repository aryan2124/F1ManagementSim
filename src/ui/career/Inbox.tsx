import { Linked } from "./Profile";
import { useState } from "react";
import { HUNT, huntCooldown, type HuntMode } from "../../career/mail";
import type { CareerState } from "../../career/types";
import { TalkPanel } from "./Talks";
import { fmtDay } from "../../career/util";
import type { Props } from "./common";

export interface InboxItem {
  key: string;
  kind: "mail" | "talk" | "letter";
  id: number;
  day: number;
  from: string;
  subject: string;
  unread: boolean;
  /** Something waits on the player (an offer to answer, terms to sign). */
  open: boolean;
}

/** Everything in the inbox, newest first: offers and letters, and every conversation, read or unread. */
export function inboxItems(s: CareerState): InboxItem[] {
  const out: InboxItem[] = [];
  for (const c of s.cards) if (c.kind === "mail") out.push({ key: `m${c.id}`, kind: "mail", id: c.id, day: c.created, from: c.mail?.from ?? "Mail", subject: c.title, unread: !c.read, open: c.options.length > 1 });
  for (const l of s.letters ?? []) out.push({ key: `l${l.id}`, kind: "letter", id: l.id, day: l.day, from: l.from, subject: l.subject, unread: !l.read, open: false });
  for (const tk of s.talks) {
    const name = s.drivers[tk.targetId]?.spec.name ?? s.academy.prospects[tk.targetId]?.name ?? "Someone";
    const last = tk.lines[tk.lines.length - 1]?.day ?? tk.opened;
    const state = tk.status === "waiting" ? "waiting for a reply" : tk.status === "agreed" ? "terms agreed, sign or it lapses" : tk.status === "closed" ? "closed" : "your move";
    out.push({ key: `t${tk.id}`, kind: "talk", id: tk.id, day: last, from: name, subject: `${tk.kind === "junior" ? "Academy talks" : "Talks"}: ${state}`, unread: !!tk.unread, open: tk.status === "open" || tk.status === "agreed" });
  }
  return out.sort((a, b) => b.day - a.day);
}

export const unreadCount = (s: CareerState) => inboxItems(s).filter((x) => x.unread).length;

/** Letters from sponsors, scouts and young drivers, every conversation with a driver, and the way to go looking for sponsors yourself. */
export function Inbox({ s, d }: Props) {
  const items = inboxItems(s);
  const cool = huntCooldown(s);
  const [sel, setSel] = useState<string | null>(null);
  const cur = items.find((x) => x.key === sel) ?? null;
  const pick = (x: InboxItem) => {
    setSel(x.key);
    if (x.unread && x.kind !== "talk") d({ type: "markRead", what: x.kind === "mail" ? "card" : "letter", id: x.id });
  };
  const c = cur?.kind === "mail" ? s.cards.find((k) => k.id === cur.id) : undefined;
  const letter = cur?.kind === "letter" ? (s.letters ?? []).find((k) => k.id === cur.id) : undefined;
  return (
    <div className="c-cols">
      <section className="panel c-inbox">
        <h3>INBOX ({items.filter((x) => x.unread).length} UNREAD OF {items.length})</h3>
        {items.length === 0 && <p className="dim">Nothing yet. Sponsors write when the team is doing well, scouts write after a race weekend, and young drivers write whenever they feel brave. Every conversation with a driver is kept here too.</p>}
        <ul className="c-mails">
          {items.map((x) => (
            <li key={x.key} className={`${x.unread ? "unread" : "read"} ${x.key === sel ? "on" : ""}`}>
              <button onClick={() => pick(x)}>
                <i className="dot" aria-label={x.unread ? "unread" : "read"} />
                <span className="who">{x.from}</span>
                <span className="subj">{x.subject}</span>
                <em className="when">{fmtDay(x.day)}</em>
                {x.open && <b className="tag">ANSWER</b>}
              </button>
            </li>
          ))}
        </ul>
        {cur?.kind === "talk" && <TalkPanel s={s} d={d} id={cur.id} onClose={() => setSel(null)} />}
        {c && (
          <div className="c-card mail">
            <p className="dim small">From <b>{c.mail?.from}</b> ({c.mail?.role}) | {fmtDay(c.created)}</p>
            <h4>{c.title}</h4>
            {c.body.split("\n").map((l, i) => (l ? <p key={i}><Linked s={s} text={l} /></p> : <br key={i} />))}
            <div className="c-opts">
              {c.options.map((o) => (
                <button key={o.id + o.label} className="c-opt" onClick={() => d({ type: "card", id: c.id, option: o.id })}>
                  <b>{o.label}</b>
                  {o.detail && <span className="dim">{o.detail}</span>}
                  {o.lines && <ul>{o.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
                  {o.warn && <em className="warn">{o.warn}</em>}
                </button>
              ))}
            </div>
            {c.deadline !== undefined && <p className="dim small">Lapses on {fmtDay(c.deadline)} if you do not answer.</p>}
          </div>
        )}
        {letter && (
          <div className="c-card mail">
            <p className="dim small">From <b>{letter.from}</b> ({letter.role}) | {fmtDay(letter.day)}</p>
            <h4>{letter.subject}</h4>
            {letter.body.split("\n").map((l, i) => (l ? <p key={i}>{l}</p> : <br key={i} />))}
          </div>
        )}
        {cur && !c && !letter && cur.kind !== "talk" && <p className="dim">That one has been dealt with.</p>}
      </section>
      <section className="panel">
        <h3>GO LOOKING FOR SPONSORS</h3>
        <p className="dim small">Do not wait for the phone. Send people out, and the replies land in this inbox in a few days. A strong team gets good offers. A weak one gets few, and some of the people who write in should not be trusted.</p>
        {(
          <div className="c-opts">
            {(Object.keys(HUNT) as HuntMode[]).map((m) => (
              <button key={m} className="c-opt" disabled={cool > 0} onClick={() => d({ type: "huntSponsors", mode: m })}>
                <b>{HUNT[m].label}</b>
                <span className="dim">{HUNT[m].text}</span>
              </button>
            ))}
          </div>
        )}
        {cool > 0 && <p className="small">Someone is already out there. You can send people again in {cool} days.</p>}
        <h4>YOUR SPONSORS</h4>
        {s.teams[s.teamId].sponsors.map((sp) => (
          <p key={sp.id} className="small"><b>{sp.name}</b>: {sp.retainer.toFixed(1)}m a year until {sp.endYear}. Mood {Math.round(sp.mood * 100)}%.</p>
        ))}
      </section>
    </div>
  );
}
