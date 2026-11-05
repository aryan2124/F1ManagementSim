import { news, sendLetter } from "./cards";
import { logLedger } from "./ledger";
import { liveLoopholes, loopState } from "./loopholes";
import { KEYSTONES } from "./keystones";
import { rngFor, round2 } from "./util";
import type { CareerState } from "./types";

/**
 * Amendments beyond the Commission's own patches: any team can table one, the teams vote, and a simple majority passes it.
 * Two kinds: close a gap in the wording early, or ban a keystone from the grid. Teams vote their own interest: a team working
 * the gap, or fitted with the keystone, votes no. The vote closes at the next monthly round.
 */
export type AmendKind = "patch-gap" | "ban-keystone";
export interface Proposal { id: string; kind: AmendKind; target: string; by: string; day: number; votes: Record<string, boolean> }
export interface AmendState { open?: Proposal; banned: string[]; history: { day: number; text: string; passed: boolean }[] }

export const FILING_FEE = 0.2;
export const amendState = (s: CareerState): AmendState => (s.amend ??= { banned: [], history: [] });

import { LOOPHOLES } from "./loopholes";
const label = (p: { kind: AmendKind; target: string }) =>
  p.kind === "patch-gap" ? `close the gap "${LOOPHOLES.find((l) => l.id === p.target)?.name.toLowerCase() ?? p.target}"` : `ban the "${KEYSTONES.find((k) => k.id === p.target)?.name ?? p.target}" keystone`;

export function proposeAmendment(s: CareerState, by: string, kind: AmendKind, target: string): { ok: boolean; message: string } {
  const st = amendState(s);
  const t = s.teams[by];
  if (!t) return { ok: false, message: "No such team." };
  if (st.open) return { ok: false, message: "An amendment is already on the table. Wait for the vote." };
  if (t.cash < FILING_FEE) return { ok: false, message: `Filing costs $${FILING_FEE.toFixed(2)}m.` };
  if (kind === "patch-gap") {
    const l = liveLoopholes(s).find((x) => x.id === target);
    if (!l) return { ok: false, message: "That gap is not open." };
  } else {
    if (!KEYSTONES.some((k) => k.id === target)) return { ok: false, message: "Unknown keystone." };
    if (st.banned.includes(target)) return { ok: false, message: "Already banned." };
  }
  t.cash = round2(t.cash - FILING_FEE);
  t.ledger.costs += FILING_FEE;
  t.ledger.other += FILING_FEE;
  st.open = { id: `am-${s.day}`, kind, target, by, day: s.day, votes: { [by]: true } };
  news(s, `${by.toUpperCase()} tables an amendment to ${label(st.open)}. The teams vote at the next round.`, { importance: 2, cause: "Amendment", tag: "rules" });
  return { ok: true, message: `Tabled. The vote closes at the next monthly round. Filing cost $${FILING_FEE.toFixed(2)}m.` };
}

export function voteAmendment(s: CareerState, teamId: string, yes: boolean): { ok: boolean; message: string } {
  const p = amendState(s).open;
  if (!p) return { ok: false, message: "Nothing is on the table." };
  p.votes[teamId] = yes;
  return { ok: true, message: yes ? "Voted for." : "Voted against." };
}

/** What a computer team would do: its own interest first, then a lean from a seeded roll. */
function aiVote(s: CareerState, p: Proposal, id: string): boolean {
  const t = s.teams[id];
  const r = rngFor(s, `amend:${p.id}:${id}`).next();
  if (p.kind === "patch-gap") return (t.loops ?? []).includes(p.target) ? false : r < 0.7;
  return (t.keystones ?? []).includes(p.target) ? false : r < 0.62;
}

export function amendmentsMonthly(s: CareerState): void {
  const st = amendState(s);
  const p = st.open;
  if (!p) return;
  const ids = Object.keys(s.teams).sort();
  let yes = 0;
  for (const id of ids) {
    const human = id === s.teamId || s.humans?.includes(id);
    const v = p.votes[id] ?? (human ? p.by === id : aiVote(s, p, id));
    if (v) yes++;
  }
  const passed = yes * 2 > ids.length;
  const text = `${label(p)} (${yes} of ${ids.length} for)`;
  st.history.push({ day: s.day, text, passed });
  st.open = undefined;
  news(s, passed ? `Amendment passed: ${text}.` : `Amendment defeated: ${text}.`, { importance: 2, cause: "Amendment", tag: "rules" });
  if (!passed) return;
  if (p.kind === "ban-keystone") {
    st.banned.push(p.target);
    for (const id of ids) {
      const t = s.teams[id];
      if ((t.keystones ?? []).includes(p.target)) {
        t.keystones = (t.keystones ?? []).filter((x) => x !== p.target);
        if (id === s.teamId) {
          logLedger(s, { kind: "money", text: "Keystone banned", cost: 0, because: `the vote banned it` });
          sendLetter(s, { from: "The Commission", role: "Stewards", subject: "Keystone banned", body: `The teams voted to ban a keystone you were running. It comes off the car now and the slot is free; fitting another costs tunnel time as usual.` });
        }
      }
    }
  } else {
    const ls = loopState(s);
    if (!ls.patched.includes(p.target)) ls.patched.push(p.target);
    for (const id of ids) {
      const t = s.teams[id];
      if ((t.loops ?? []).includes(p.target)) {
        t.loops = (t.loops ?? []).filter((x) => x !== p.target);
        t.cash = round2(t.cash - 0.6);
        t.ledger.costs += 0.6;
        t.ledger.other += 0.6;
      }
    }
  }
}
