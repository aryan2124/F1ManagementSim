import { Linked } from "./Profile";
import { CardView } from "./common";
import { MiniMeters, fxOf } from "./Tradeoff";
import { useState } from "react";
import { HUNT, huntCooldown, type HuntMode } from "../../career/mail";
import type { CareerState } from "../../career/types";
import { TalkPanel } from "./Talks";
import { fmtDay } from "../../career/util";
import type { Props } from "./common";
import type { Card } from "../../career/types";

export type Folder = "decisions" | "practice" | "track" | "other";
export const FOLDERS: { k: Folder; label: string }[] = [
  { k: "decisions", label: "DECISIONS" },
  { k: "practice", label: "PRACTICE" },
  { k: "track", label: "TRACK REPORTS" },
  { k: "other", label: "OTHER" },
];

/** A small table in a letter. Cells that read KEEP, BAD, WEAK or REMOVED are coloured. */
export function LetterTable({ table }: { table: { head: string[]; rows: string[][] } }) {
  return (
    <table className="ltable">
      <thead><tr>{table.head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
      <tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={c}>{c}</td>)}</tr>)}</tbody>
    </table>
  );
}

export interface InboxItem {
  folder: Folder;
  key: string;
  kind: "mail" | "talk" | "letter" | "decision";
  id: number;
  day: number;
  from: string;
  subject: string;
  unread: boolean;
  /** Something waits on the player (an offer to answer, terms to sign). */
  open: boolean;
}

/** A decision that needs the player: it lives in the inbox, never on the home screen. */
export const isDecision = (c: Card) => !c.notice && !c.mail;
const DECISION_FROM: Record<string, string> = { media: "Press office", treePart: "Drawing office", treeFail: "Garage", weekPlan: "Team principal's office", campaign: "Drawing office", sponsorOffer: "Commercial", sponsorReview: "Commercial", contractExpiring: "Contracts", contractOffer: "Contracts", staffExpiring: "Human resources", staffPoach: "Human resources", board: "The board", capWarning: "Finance", capBreach: "Finance", facility: "Facilities", era: "The FIA", firing: "The board" };

/** Everything in the inbox, newest first: offers and letters, and every conversation, read or unread. */
export function inboxItems(s: CareerState): InboxItem[] {
  const out: InboxItem[] = [];
  for (const c of s.cards) if (isDecision(c)) out.push({ folder: "decisions", key: `d${c.id}`, kind: "decision", id: c.id, day: c.created, from: DECISION_FROM[c.kind] ?? "The factory", subject: c.title, unread: true, open: true });
  for (const c of s.cards) if (c.kind === "mail") out.push({ folder: "other", key: `m${c.id}`, kind: "mail", id: c.id, day: c.created, from: c.mail?.from ?? "Mail", subject: c.title, unread: !c.read, open: c.options.length > 1 });
  for (const l of s.letters ?? []) out.push({ folder: l.folder ?? "other", key: `l${l.id}`, kind: "letter", id: l.id, day: l.day, from: l.from, subject: l.subject, unread: !l.read, open: false });
  for (const tk of s.talks) {
    const name = s.drivers[tk.targetId]?.spec.name ?? s.academy.prospects[tk.targetId]?.name ?? "Someone";
    const last = tk.lines[tk.lines.length - 1]?.day ?? tk.opened;
    const state = tk.status === "waiting" ? "waiting for a reply" : tk.status === "agreed" ? "terms agreed, sign or it lapses" : tk.status === "closed" ? "closed" : "your move";
    out.push({ folder: "other", key: `t${tk.id}`, kind: "talk", id: tk.id, day: last, from: name, subject: `${tk.kind === "junior" ? "Academy talks" : "Talks"}: ${state}`, unread: !!tk.unread, open: tk.status === "open" || tk.status === "agreed" });
  }
  return out.sort((a, b) => (a.kind === "decision" ? 0 : 1) - (b.kind === "decision" ? 0 : 1) || b.day - a.day);
}

export const unreadCount = (s: CareerState) => inboxItems(s).filter((x) => x.unread).length;

/** Letters from sponsors, scouts and young drivers, every conversation with a driver, and the way to go looking for sponsors yourself. */

export function Inbox({ s, d, go }: Props & { go?: (t: import("./common").Tab) => void }) {
  const items = inboxItems(s);
  const cool = huntCooldown(s);
  const [sel, setSel] = useState<string | null>(null);
  const [folder, setFolder] = useState<Folder>("decisions");
  const shown = items.filter((x) => x.folder === folder);
  const cur = items.find((x) => x.key === sel && x.folder === folder) ?? shown.find((x) => x.kind === "decision") ?? null;
  const pick = (x: InboxItem) => {
    setSel(x.key);
    if (x.unread && x.kind !== "talk" && x.kind !== "decision") d({ type: "markRead", what: x.kind === "mail" ? "card" : "letter", id: x.id });
  };
  const dec = cur?.kind === "decision" ? s.cards.find((k) => k.id === cur.id) : undefined;
  const c = cur?.kind === "mail" ? s.cards.find((k) => k.id === cur.id) : undefined;
  const letter = cur?.kind === "letter" ? (s.letters ?? []).find((k) => k.id === cur.id) : undefined;
  return (
    <div className="c-cols">
      <section className="panel c-inbox">
        <h3>INBOX ({items.filter((x) => x.unread).length} UNREAD OF {items.length})</h3>
        <div className="fold" role="tablist" aria-label="Inbox folders">
          {FOLDERS.map((f) => {
            const n = items.filter((x) => x.folder === f.k && x.unread).length;
            return <button key={f.k} role="tab" aria-selected={folder === f.k} className={folder === f.k ? "on" : ""} onClick={() => { setFolder(f.k); setSel(null); }}>{f.label}{n ? ` (${n})` : ""}</button>;
          })}
        </div>
        <p className="small" data-testid="away-line">
          <label><input type="checkbox" checked={!!s.away} onChange={(e) => d({ type: "setAway", away: e.target.checked })} /> I am away: letters wait for me, standing orders still apply.</label>
          {Object.keys(s.standing ?? {}).length > 0 && <span className="dim"> Standing orders: {Object.entries(s.standing ?? {}).map(([k, v]) => `${k} → ${v}`).join(", ")}. <button className="linkish" onClick={() => Object.keys(s.standing ?? {}).forEach((k) => d({ type: "standingOrder", kind: k, option: null }))}>cancel all</button></span>}
        </p>
        <p className="small press-style" data-testid="press-style">
          Press line when nobody asks you to choose:{" "}
          {(["open", "guarded", "quiet"] as const).map((k) => (
            <button key={k} className={`tiny ${(s.press.style ?? "guarded") === k ? "on" : ""}`} aria-pressed={(s.press.style ?? "guarded") === k} onClick={() => d({ type: "pressStyle", style: k })}>{k.toUpperCase()}</button>
          ))}
        </p>
        {shown.length === 0 && <p className="dim">{folder === "practice" ? "Practice reports land here after each weekend's practice." : folder === "track" ? "The track report arrives at the start of the season, with updates when something changes." : folder === "decisions" ? "Nothing waits on you." : "Nothing here."}</p>}
        {items.length === 0 && folder === "other" && <p className="dim">Nothing yet. Sponsors write when the team is doing well, scouts write after a race weekend, and young drivers write whenever they feel brave. Every conversation with a driver is kept here too.</p>}
        <ul className="c-mails">
          {shown.map((x) => (
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
        {dec && dec.kind === "ideaBatch" && (
          <div className="c-card mail" data-testid="idea-letter">
            <h4>{dec.title}</h4>
            <p>{dec.body}</p>
            <div className="ct-slots">
              <button className="btn primary" onClick={() => { try { sessionStorage.setItem("bb.sub.car", "tree"); } catch { /* ignore */ } go?.("car"); }}>OPEN THE CAR TREE</button>
              <button className="btn" onClick={() => d({ type: "card", id: dec.id, option: "none" })}>SHELVE THEM ALL</button>
            </div>
          </div>
        )}
        {dec && dec.kind !== "ideaBatch" && <CardView c={dec} d={d} />}
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
                  <MiniMeters fx={fxOf(o)} />
                  {o.detail && <span className="dim">{o.detail}</span>}
                  {o.lines && !fxOf(o) && <ul>{o.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
                  {o.warn && <em className="warn">{o.warn}</em>}
                </button>
              ))}
              {!c.mandatory && c.options.length > 1 && (
                <details className="small" data-testid="standing-order">
                  <summary>Always answer this kind of letter the same way</summary>
                  {c.options.map((o) => <button key={o.id} className="linkish" onClick={() => d({ type: "standingOrder", kind: c.kind, option: o.id })}>always: {o.label}</button>)}
                </details>
              )}
            </div>
            {c.mandatory && <p className="small"><b>This one waits for you.</b> Nothing answers it for you, however long it takes.</p>}
            {!c.mandatory && c.lapse && <p className="dim small">Lapses {c.lapse.on === "race" ? "when the next race weekend begins" : "when the season turns"} if you do not answer.</p>}
            {!c.mandatory && !c.lapse && c.deadline !== undefined && <p className="dim small">Lapses on {fmtDay(c.deadline)} if you do not answer.</p>}
          </div>
        )}
        {letter && (
          <div className="c-card mail">
            <p className="dim small">From <b>{letter.from}</b> ({letter.role}) | {fmtDay(letter.day)}</p>
            <h4>{letter.subject}</h4>
            {letter.body.split("\n").map((l, i) => (l ? <p key={i}>{l}</p> : <br key={i} />))}
            {letter.table && <LetterTable table={letter.table} />}
          </div>
        )}
        {cur && !c && !letter && !dec && cur.kind !== "talk" && <p className="dim">That one has been dealt with.</p>}
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
