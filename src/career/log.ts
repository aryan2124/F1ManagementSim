import type { CareerState } from "./types";

/** The player's "where did it go" list: every spend of cap room, wind tunnel hours or cash, with its reason. */
export function logSpend(s: CareerState, text: string, v: { cap?: number; tunnel?: number; cash?: number } = {}) {
  s.spendLog.unshift({ day: s.day, text, cap: v.cap ?? 0, tunnel: v.tunnel ?? 0, cash: v.cash ?? 0 });
  if (s.spendLog.length > 80) s.spendLog.length = 80;
}
