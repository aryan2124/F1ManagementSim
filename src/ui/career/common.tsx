import { useState, type ReactNode } from "react";
import type { Action, Card, CareerState, DriverState, Staff } from "../../career/types";
import type { Result } from "../../career/reducer";
import { TEAMS } from "../../game/data";
import { fmtDay } from "../../career/util";

export type Dispatch = (a: Action) => Result;
export type Tab = "today" | "inbox" | "calendar" | "car" | "people" | "academy" | "money" | "rules" | "world";
export interface Props {
  s: CareerState;
  d: Dispatch;
}

export const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
export const teamOf = (id: string | null | undefined) => TEAMS.find((t) => t.id === id);
export const driverName = (s: CareerState, id: string) => s.drivers[id]?.spec.name ?? id;

/** A small explanation that opens on hover, click/tap or keyboard focus. Escape closes it. */
export function Tip({ text, children }: { text: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const show = open || pinned;
  return (
    <span
      className={`tip ${show ? "open" : ""}`}
      tabIndex={0}
      role="button"
      aria-label={text}
      aria-expanded={show}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => { setOpen(false); setPinned(false); }}
      onClick={(e) => { e.stopPropagation(); setPinned((p) => !p); }}
      onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); setPinned(false); } if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPinned((p) => !p); } }}
    >
      {children ?? "?"}
      {show && <span className="tip-pop" role="tooltip">{text}</span>}
    </span>
  );
}

/** A driver's pace in words, judged against the whole grid by rank so the words spread out. */
export function paceWord(s: CareerState, d: DriverState): string {
  const all = Object.values(s.drivers).filter((x) => x.teamId && !x.retired);
  const rank = 1 + all.filter((x) => x.spec.pace > d.spec.pace).length;
  const n = Math.max(all.length, 1);
  const pct = rank / n;
  return rank <= 3 ? "Elite" : pct <= 0.3 ? "Front runner" : pct <= 0.55 ? "Midfield" : pct <= 0.8 ? "Back of the grid" : "Developing";
}
export function paceRank(s: CareerState, d: DriverState): number {
  const all = Object.values(s.drivers).filter((x) => x.teamId && !x.retired);
  return 1 + all.filter((x) => x.spec.pace > d.spec.pace).length;
}

/** Skill shown as words judged against other people in the same role, and a range that narrows as the player learns the person. */
export function staffWords(s: CareerState, st: Staff): string {
  const peers = Object.values(s.staff).filter((x) => x.role === st.role && x.teamId);
  const rank = 1 + peers.filter((x) => x.skill > st.skill).length;
  const pct = rank / Math.max(peers.length, 1);
  const word = pct <= 0.1 ? "Elite" : pct <= 0.3 ? "Strong" : pct <= 0.6 ? "Solid" : pct <= 0.85 ? "Average" : "Weak";
  const half = Math.round((1 - st.known) * 14);
  const lo = Math.max(0, Math.round(st.skill) - half);
  const hi = Math.min(99, Math.round(st.skill) + half);
  return half <= 1 ? `${word} (${Math.round(st.skill)})` : `${word} (${lo} to ${hi})`;
}

export function Bar({ v, max = 1, color }: { v: number; max?: number; color?: string }) {
  const w = Math.max(0, Math.min(100, (v / max) * 100));
  return (
    <div className="bar">
      <i style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

/** One decision or notice card. Options show plain-words facts and warnings, and notices are dismissed with an X. */
export function CardView({ c, d, compact }: { c: Card; d: Dispatch; compact?: boolean }) {
  const def = c.options.find((o) => o.id === c.defaultOption)?.label;
  if (c.notice) {
    return (
      <div className="c-notice">
        <div>
          <b>{c.title}</b>
          {!compact && <p>{c.body}</p>}
        </div>
        <button className="tiny" title="Dismiss" onClick={() => d({ type: "dismiss", id: c.id })}>
          X
        </button>
      </div>
    );
  }
  const rich = c.options.some((o) => o.lines && o.lines.length);
  return (
    <div className={`c-card u${c.urgency}`}>
      <h4>{c.title}</h4>
      {c.body.split("\n").map((l, i) => (l ? <p key={i}>{l}</p> : <br key={i} />))}
      {c.deadline !== undefined && (
        <p className="dim small">
          Decide by {fmtDay(c.deadline)}. If you do nothing: <b>{def ?? "the default"}</b>.
        </p>
      )}
      <div className={rich ? "c-opts rich" : "c-opts"}>
        {c.options.map((o) => (
          <button key={o.id} className={`c-opt ${o.id === c.defaultOption ? "def" : ""}`} onClick={() => d({ type: "card", id: c.id, option: o.id })}>
            <b>{o.label}</b>
            {o.detail && <span className="dim">{o.detail}</span>}
            {o.lines && (
              <ul>
                {o.lines.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            )}
            {o.warn && <em className="warn">{o.warn}</em>}
          </button>
        ))}
      </div>
    </div>
  );
}
