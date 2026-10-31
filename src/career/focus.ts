import type { CareerState } from "./types";
import { recap } from "./cards";

export type FocusKind = "car" | "drivers" | "money" | "academy";

/** What the weekly focus gives and what it costs. Shown on the Today cards so the choice has stakes. */
export const FOCUS: Record<FocusKind, { label: string; gain: string; cost: string }> = {
  car: { label: "THE CAR", gain: "+6 wind tunnel hours a week", cost: "drivers feel ignored (morale -1%)" },
  drivers: { label: "THE DRIVERS", gain: "morale +3% a week, a little more trust", cost: "no tunnel boost, and a $0.2m a week outlay" },
  money: { label: "THE MONEY", gain: "+$0.5m a week from cost savings", cost: "fans drift away (-0.2 a week)" },
  academy: { label: "THE ACADEMY", gain: "prospects gain confidence and rest", cost: "$0.15m a week in coaching" },
};

export function setFocus(s: CareerState, kind: FocusKind): string {
  s.focus = { kind, since: s.day };
  return `This week: ${FOCUS[kind].label}.`;
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Called once a week while the factory is working. */
export function focusWeekly(s: CareerState): void {
  const f = s.focus;
  if (!f) return;
  const me = s.teams[s.teamId];
  const mine = Object.values(s.drivers).filter((d) => d.teamId === s.teamId && !d.retired);
  switch (f.kind) {
    case "car":
      me.tunnelLeft += 6;
      for (const d of mine) d.morale = clamp(d.morale - 0.01);
      recap(s, "Focus on the car: 6 extra tunnel hours this week.");
      break;
    case "drivers":
      for (const d of mine) { d.morale = clamp(d.morale + 0.03); d.trust = clamp(d.trust + 0.01); }
      me.cash -= 0.2;
      recap(s, "Time with the drivers: morale up.");
      break;
    case "money":
      me.cash += 0.5;
      s.brand.fans = Math.max(0, s.brand.fans - 0.2);
      recap(s, "Cost review: $0.5m saved.");
      break;
    case "academy": {
      const kids = Object.values(s.academy.prospects).filter((p) => p.owner === s.teamId && p.status === "academy");
      for (const p of kids) { p.confidence = clamp(p.confidence + 0.03); p.fatigue = clamp(p.fatigue - 0.04); }
      me.cash -= 0.15;
      recap(s, `Academy week: ${kids.length} prospect${kids.length === 1 ? "" : "s"} coached.`);
      break;
    }
  }
}
