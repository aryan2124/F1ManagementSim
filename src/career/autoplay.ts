import { advanceDay, resolveCard } from "./tick";
import { simulateWeekend } from "./weekend";
import { agenda } from "./agenda";
import type { CareerState } from "./types";

/** A race weekend starts on the Friday, two days before the race. */
export const WEEKEND_LEAD = 2;

/** The day the clock should really stop on for a wish to reach `day`: you can't skip into the middle of a weekend, so you arrive at its start. */
export function weekendClamp(s: CareerState, day: number): number {
  for (const r of s.calendar) {
    if (s.day >= r.day - WEEKEND_LEAD && s.day <= r.day) continue; // already inside this weekend: the AI plays it
    if (day >= r.day - WEEKEND_LEAD && day <= r.day) return r.day - WEEKEND_LEAD;
  }
  return day;
}

const ARRIVE_BEFORE = new Set(["test", "launch", "season", "deadline", "promise", "reply", "era", "sponsor", "contract"]);

/**
 * Where a "skip to this day" lands. A weekend day lands on the Friday, before practice. A day with an event on it
 * lands the day before, so the event is still to come when the player arrives.
 */
export function skipTarget(s: CareerState, day: number): number {
  const w = weekendClamp(s, day);
  if (w !== day) return w;
  const has = agenda(s).some((x) => x.day === day && ARRIVE_BEFORE.has(x.kind));
  return has && day - 1 > s.day ? day - 1 : day;
}

/**
 * The team AI runs the player's side: every open card gets its default answer, weekends are simulated,
 * and the clock runs up to `target` (at most `max` days per call so the UI can show progress).
 * Stops early if the owner fires the player. Returns a status line.
 */
export function autoTo(s: CareerState, target: number, max = 30): { done: boolean; why: string } {
  s.recap = [];
  s.stopReason = "";
  target = weekendClamp(s, target);
  for (let i = 0; i < max; i++) {
    if (s.day >= target) return { done: true, why: "" };
    if (s.fired) {
      // the AI takes the job it would have chosen and carries on
      const f = s.cards.find((x) => x.kind === "firing");
      if (!f) return { done: true, why: "You were fired along the way. Choose where to go next." };
      resolveCard(s, f.id, f.defaultOption ?? f.options[0].id);
      if (s.fired) return { done: true, why: "You were fired along the way. Choose where to go next." };
    }
    for (const c of [...s.cards]) {
      if (c.options.length > 1 && (c.urgency >= 2 || (c.deadline !== undefined && c.deadline <= s.day + 1))) {
        resolveCard(s, c.id, c.defaultOption ?? c.options[0].id);
      }
    }
    // the AI also takes honest sponsor offers and ignores the rest of the mail
    for (const c of [...s.cards]) {
      if (c.mail && c.data?.m === "sponsor" && !c.data.shady && s.teams[s.teamId].sponsors.length < 6) resolveCard(s, c.id, "accept");
    }
    if (s.weekend && s.weekend.stage !== "done") simulateWeekend(s);
    advanceDay(s);
  }
  return { done: s.day >= target, why: "" };
}
