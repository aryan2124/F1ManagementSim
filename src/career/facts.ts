import type { CareerState } from "./types";

/**
 * The fact ledger: one line for everything that happened and mattered. Stories, voices, the chronicle and the
 * "why" breakdowns all read from it, so a thing that happened once can be remembered by many systems.
 */
export interface Fact {
  day: number;
  year: number;
  kind: string;
  /** Teams, drivers or staff involved (ids). */
  who: string[];
  text: string;
  /** 1 small, 2 notable, 3 defining. */
  weight: 1 | 2 | 3;
}

const CAP = 600;

export function addFact(s: CareerState, kind: string, text: string, who: string[] = [], weight: 1 | 2 | 3 = 2) {
  const list = (s.facts ??= []);
  list.push({ day: s.day, year: s.year, kind, who, text, weight });
  if (list.length > CAP) {
    // forget the small ones first, keep defining moments
    const i = list.findIndex((f) => f.weight === 1);
    list.splice(i >= 0 ? i : 0, 1);
  }
}

export function factsAbout(s: CareerState, id: string, since = -1e9): Fact[] {
  return (s.facts ?? []).filter((f) => f.day >= since && f.who.includes(id));
}

export function recentFacts(s: CareerState, kind: string, days = 90): Fact[] {
  return (s.facts ?? []).filter((f) => f.kind === kind && f.day >= s.day - days);
}
