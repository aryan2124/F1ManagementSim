import { pushCard, recap } from "./cards";
import { campaignLine } from "./campaign";
import { factoryClosed } from "./calendar";
import { circuitMeta } from "../game/circuits";
import type { CardOption, CareerState } from "./types";

const clamp = (n: number) => Math.max(0, Math.min(1, n));

export function weekPlanOpen(s: CareerState): boolean {
  return s.cards.some((c) => c.kind === "weekPlan");
}

/** Every week the manager must choose where the effort goes. There is no free option: each one gives something and takes something. */
export function weekPlanCard(s: CareerState): void {
  if (factoryClosed(s.day, s.year) || s.weekend || weekPlanOpen(s)) return;
  if (s.history.some((h) => h.year === s.year)) return;
  const next = s.calendar[s.round];
  if (!next) return;
  const me = s.teams[s.teamId];
  const camp = campaignLine(s);
  const options: CardOption[] = [
    { id: "car", label: "THE CAR", lines: [camp ? "+5 points on the campaign and 6 tunnel hours" : "+6 wind tunnel hours", "Cost: both drivers feel ignored (morale -1%)"] },
    { id: "drivers", label: "THE DRIVERS", lines: ["Morale +3%, a little more trust", "Cost: $0.2m, and no tunnel boost"] },
    { id: "money", label: "THE MONEY", lines: ["+$0.5m from cost savings", "Cost: fans drift away (-0.2)"] },
    { id: "academy", label: "THE ACADEMY", lines: ["Prospects gain confidence and rest", "Cost: $0.15m in coaching"] },
  ];
  if (camp) options.splice(1, 0, { id: "push", label: "PUSH THE CAMPAIGN", lines: ["+7 points on the campaign this week", "Cost: $0.35m overtime, drivers see less of the engineers (morale -1%)"] });
  const gp = circuitMeta(next.circuitId).gp;
  const n = Math.max(0, next.day - s.day);
  const race = s.lastRace?.length ? `LAST RACE: ${s.lastRace.join(" | ")}\n` : "";
  s.lastRace = undefined;
  const last = race + (s.lastWeek?.length ? `LAST WEEK: ${s.lastWeek.join(" ")}\n` : "");
  const body = `${last}Next up: ${gp}, in ${n} day${n === 1 ? "" : "s"}.${camp ? ` ${camp.text}, at ${camp.pct}%.` : ""} Cash ${me.cash.toFixed(1)}m. Where does this week's effort go?`;
  pushCard(s, "weekPlan", "THIS WEEK: WHERE DOES THE EFFORT GO?", body, options, { urgency: 2, data: { step: "week" } });
}

export function resolveWeekPlan(s: CareerState, option: string): void {
  const me = s.teams[s.teamId];
  const mine = Object.values(s.drivers).filter((d) => d.teamId === s.teamId && !d.retired);
  const out: string[] = [];
  const bump = (n: number) => { for (const d of mine) d.morale = clamp(d.morale + n); };
  const c = s.campaign;
  switch (option) {
    case "car":
      me.tunnelLeft += 6;
      bump(-0.01);
      if (c) c.progress += 5;
      out.push(c ? "Everyone on the car: +5 on the campaign, 6 tunnel hours." : "Everyone on the car: 6 tunnel hours.");
      break;
    case "push":
      if (c) c.progress += 7;
      me.cash -= 0.35;
      bump(-0.01);
      out.push("Overtime on the campaign: +7 points, $0.35m spent.");
      break;
    case "drivers":
      bump(0.03);
      for (const d of mine) d.trust = clamp(d.trust + 0.01);
      me.cash -= 0.2;
      out.push(`Time with the drivers: morale up 3%, $0.2m spent.`);
      break;
    case "money":
      me.cash += 0.5;
      s.brand.fans = Math.max(0, s.brand.fans - 0.2);
      out.push("Cost review: $0.5m saved, fans a touch cooler.");
      break;
    case "academy": {
      const kids = Object.values(s.academy.prospects).filter((p) => p.owner === s.teamId && p.status === "academy");
      for (const p of kids) { p.confidence = clamp(p.confidence + 0.03); p.fatigue = clamp(p.fatigue - 0.04); }
      me.cash -= 0.15;
      out.push(`Academy week: ${kids.length} prospect${kids.length === 1 ? "" : "s"} coached, $0.15m spent.`);
      break;
    }
  }
  s.focus = { kind: (["car", "drivers", "money", "academy"].includes(option) ? option : "car") as NonNullable<CareerState["focus"]>["kind"], since: s.day };
  s.lastWeek = out;
  for (const o of out) recap(s, o);
}
