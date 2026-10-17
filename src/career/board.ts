import { clamp } from "./util";
import type { CareerState, TeamState } from "./types";
import { multiply } from "./factors";

/** Every move of the board's confidence is written down with its cause, so the Money screen can say what is driving it. */
export function boardMove(s: CareerState, t: TeamState, delta: number, why: string) {
  const before = t.board;
  // good news counts for more when money and standing are healthy, bad news hurts more when they are not
  const m = multiply(s, t.id, ["funding", "reputation"]).value;
  const scaled = delta > 0 ? delta * m : delta / m;
  t.board = clamp(before + scaled, 0, 100);
  const got = t.board - before;
  if (Math.abs(got) < 0.05 || t.id !== s.teamId) return;
  const log = (s.boardLog ??= []);
  const last = log[0];
  if (last && last.why === why && s.day - last.day < 14) {
    last.delta = Math.round((last.delta + got) * 10) / 10;
    last.day = s.day;
  } else log.unshift({ day: s.day, delta: Math.round(got * 10) / 10, why });
  if (log.length > 40) log.length = 40;
}

/** The three things the board weighs, read off the books and the table. Each is -1..1. */
export function boardParts(s: CareerState): { results: number; money: number; trust: number } {
  const t = s.teams[s.teamId];
  const obj = t.objectives[0];
  const rank = Object.keys(s.teams).sort((a, b) => (s.standings.teams[b] ?? 0) - (s.standings.teams[a] ?? 0)).indexOf(s.teamId) + 1;
  const results = obj && s.round >= 2 ? clamp((obj.target - rank) / 3, -1, 1) : 0;
  const money = clamp(t.cash / 60 - (t.debt ?? 0) / 40 - (t.breached ? 0.6 : 0), -1, 1);
  return { results, money, trust: clamp((s.owner.trust - 0.5) * 2, -1, 1) };
}
