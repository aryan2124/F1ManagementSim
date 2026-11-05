import type { CareerState } from "./types";

/**
 * The verdict ledger: every decision that cost something or changed the team, with its price and the reason, in the order
 * it happened. The Money page reads it, and hindsight lines are added when the result of a decision is known.
 */
export interface LedgerEntry {
  day: number;
  year: number;
  kind: "part" | "driver" | "health" | "crash" | "money" | "call";
  text: string;
  /** Cost in $m (negative for money that came in). */
  cost?: number;
  /** Who or what was responsible, in plain words. */
  because?: string;
  /** Added later, once the result is known. */
  hindsight?: string;
  ref?: string;
}

export function logLedger(s: CareerState, e: Omit<LedgerEntry, "day" | "year">): LedgerEntry {
  const list = (s.verdicts ??= []);
  const entry: LedgerEntry = { day: s.day, year: s.year, ...e };
  list.unshift(entry);
  if (list.length > 300) list.length = 300;
  return entry;
}

/** Attach the outcome to an earlier entry by its reference. */
export function addHindsight(s: CareerState, ref: string, line: string) {
  const hit = (s.verdicts ?? []).find((x) => x.ref === ref && !x.hindsight);
  if (hit) hit.hindsight = line;
}
