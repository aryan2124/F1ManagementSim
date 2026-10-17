import { apply } from "./reducer";
import { advanceDay } from "./tick";
import type { CareerState } from "./types";
import { standingsRank } from "./car";

/** Play through cards using their default answers and skip every weekend (the team AI runs the player's cars). */
export function autoPlayDays(s: CareerState, days: number, opts: { weekends?: boolean } = {}): void {
  const end = s.day + days;
  let guard = 0;
  while (s.day < end && guard++ < 100000) {
    if (s.fired) {
      const c = s.cards.find((x) => x.kind === "firing");
      if (c) apply(s, { type: "card", id: c.id, option: c.defaultOption ?? c.options[0].id });
    }
    if (s.weekend && s.weekend.stage !== "done") {
      if (opts.weekends === false) break;
      apply(s, { type: "simWeekend" });
    }
    advanceDay(s);
  }
}

/** Play whole seasons. Returns a summary per season for the balance tests. */
export function autoPlaySeasons(s: CareerState, seasons: number) {
  const out: { year: number; champion: string; constructors: string; order: string[]; cash: Record<string, number> }[] = [];
  let last = s.history.length;
  let guard = 0;
  while (s.history.length < last + seasons && guard++ < 400000) {
    autoPlayDays(s, 1);
    if (s.history.length > last + out.length) {
      const h = s.history[s.history.length - 1];
      out.push({ year: h.year, champion: h.champion, constructors: h.constructors, order: standingsRank(s), cash: Object.fromEntries(Object.entries(s.teams).map(([k, t]) => [k, Math.round(t.cash)])) });
    }
  }
  return out;
}
