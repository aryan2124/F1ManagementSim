import { INSTRUMENTS, INST_ORDER, corrOf, type InstId } from "./lab";
import { TRAIT_NAME } from "./traits";
import { round2 } from "./util";
import { TRAITS, type CareerState, type Trait } from "./types";

/**
 * The case file: for every trait, what the team believes, how sure it is, which instruments have spoken and whether they
 * agree. A conflict between two instruments is the clue; the next step is to run the one the team trusts more, or check
 * on track. Everything here is read from the notebook and the team's own belief, never from the hidden truth.
 */
export interface CaseLine {
  trait: Trait;
  name: string;
  est: number;
  err: number;
  readings: { inst: InstId; value: number; day: number }[];
  /** The instruments disagree by more than their stated errors. */
  conflict: { a: InstId; b: InstId; gap: number } | null;
  status: "open" | "leaning" | "settled" | "conflict";
  next: string;
}

export function caseFile(s: CareerState, teamId: string): CaseLine[] {
  const t = s.teams[teamId];
  const book = (t.notebook ?? []).filter((e) => s.day - e.day < 180);
  return TRAITS.map((tr) => {
    const latest = new Map<InstId, { value: number; err: number; day: number }>();
    for (const e of book) {
      for (const r of e.readings) if (r.trait === tr && !latest.has(e.inst)) latest.set(e.inst, { value: r.value, err: r.err, day: e.day });
    }
    const readings = [...latest.entries()].map(([inst, r]) => ({ inst, value: r.value, day: r.day }));
    let conflict: CaseLine["conflict"] = null;
    const arr = [...latest.entries()];
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      const gap = Math.abs(arr[i][1].value - arr[j][1].value);
      if (gap > arr[i][1].err + arr[j][1].err && (!conflict || gap > conflict.gap)) conflict = { a: arr[i][0], b: arr[j][0], gap: round2(gap) };
    }
    const k = t.know[tr];
    const status: CaseLine["status"] = conflict ? "conflict" : k.err <= 0.06 ? "settled" : readings.length ? "leaning" : "open";
    let next = "";
    if (conflict) {
      const trusted = corrOf(t, conflict.a) >= corrOf(t, conflict.b) ? conflict.a : conflict.b;
      next = `${INSTRUMENTS[conflict.a].label} and ${INSTRUMENTS[conflict.b].label} disagree by ${conflict.gap.toFixed(2)}. You trust ${INSTRUMENTS[trusted].label} more; a run on track would settle it.`;
    } else if (status === "open") {
      const best = [...INST_ORDER].filter((i) => INSTRUMENTS[i].reads.includes(tr)).sort((x, y) => corrOf(t, y) - corrOf(t, x))[0];
      next = best ? `Nobody has measured this. ${INSTRUMENTS[best].label} reads it best.` : "No instrument reads this.";
    } else if (status === "leaning") next = "One more reading from a different instrument would firm this up.";
    else next = "Settled for now. Fitting a part on it will move the number.";
    return { trait: tr, name: TRAIT_NAME[tr], est: round2(k.est), err: round2(k.err), readings, conflict, status, next };
  });
}
