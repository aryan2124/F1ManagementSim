import { boardMove } from "./board";
import { askingSalary, evaluateOffer } from "./contracts";
import { news, pushCard, recap } from "./cards";
import { driversOf } from "./finance";
import { teamRanking, baseTeam } from "./car";
import { clamp, fmtMoney, rngFor, round2 } from "./util";
import { summerStart } from "./calendar";
import type { CareerState } from "./types";

/**
 * The silly season, the parts that happen before December:
 *  - a mid-season board review that can squeeze or back you
 *  - summer deals: AI teams sign drivers from expiring contracts after evaluating them like the player would
 *  - the holiday: drivers and academy juniors recover
 *  - clauses: a team option and a performance bonus on driver deals
 */

export function midSeasonReview(s: CareerState) {
  const me = s.teams[s.teamId];
  const key = `mid:${s.year}`;
  if (s.story.arcs[key]) return;
  if (s.round < Math.floor(s.calendar.length / 2)) return;
  s.story.arcs[key] = 1;
  const target = me.objectives[0]?.target ?? 6;
  const pos = teamRanking(s).indexOf(s.teamId) + 1;
  const diff = pos - target;
  if (diff <= 0) {
    boardMove(s, me, 3, "Press and fans");
    news(s, `The board are pleased at the halfway point: you are ${pos}th against a target of ${target}.`, { importance: 1, tag: "people" });
    recap(s, "Mid-season board review: ahead of target. Board +3.");
    return;
  }
  const bad = diff >= 3;
  pushCard(s, "owner", "Mid-season board review", `Half the races are done. You are ${pos}th in the constructors' and the target was ${target}th. ${bad ? "The board are openly worried." : "The board want to hear a plan."}`, [
    { id: "promise", label: "Promise a recovery", detail: "Board +3 now. If you miss the target at year end it costs -8", lines: ["Risky, but it buys time."] },
    { id: "plan", label: "Present the upgrade plan", detail: "Board +1. Factory ideas for 3 weeks come cheaper", lines: ["Needs the R&D to deliver."] },
    { id: "blame", label: "Blame bad luck", detail: bad ? "Board -5 and a tighter budget" : "Board -2", lines: ["They have seen the data."] },
  ], { urgency: 2, deadline: s.day + 10, defaultOption: "blame", data: { mid: 1, bad: bad ? 1 : 0 } });
}

export function resolveMid(s: CareerState, option: string, d: Record<string, unknown>) {
  const me = s.teams[s.teamId];
  if (option === "promise") {
    boardMove(s, me, 3, "Press and fans");
    s.story.arcs.ownerPromise = 1;
    recap(s, "You promised the board a recovery.");
  } else if (option === "plan") {
    boardMove(s, me, 1, "Press and fans");
    const plan = (me as unknown as { plan?: { cheapUntil?: number } }).plan;
    if (plan) plan.cheapUntil = s.day + 21;
    recap(s, "You presented an upgrade plan to the board.");
  } else {
    boardMove(s, me, -(d.bad ? 5 : 2), "A public mishap");
    recap(s, `The board did not buy the excuse. Board -${d.bad ? 5 : 2}.`);
  }
}

/** One pass at the start of the summer break. */
export function summerDeals(s: CareerState) {
  const rng = rngFor(s, "summerdeals");
  const rank = teamRanking(s);
  // holiday: everyone gets a rest
  for (const dr of Object.values(s.drivers)) if (!dr.retired && dr.teamId) dr.morale = clamp(dr.morale + 0.05, 0, 1);
  for (const p of Object.values(s.academy.prospects)) p.fatigue = clamp(p.fatigue - 0.2, 0, 1);
  // deals between AI teams
  let signed = 0;
  for (const id of rank) {
    if (id === s.teamId || signed >= 3) continue;
    const seat = driversOf(s, id).filter((d) => d.endYear <= s.year && !d.next).sort((a, b) => a.spec.pace - b.spec.pace)[0];
    if (!seat) continue;
    const brain = s.teams[id].skillBrain;
    if (!rng.chance(0.25 + 0.25 * brain)) continue;
    const pool = Object.values(s.drivers).filter((d) => !d.retired && d.teamId && d.teamId !== id && d.teamId !== s.teamId && d.endYear <= s.year && !d.next && d.spec.pace > seat.spec.pace + 0.002);
    const target = pool.sort((a, b) => b.spec.pace - a.spec.pace)[0];
    if (!target) continue;
    const offer = { salary: round2(askingSalary(s, target) * 1.05), years: 2, role: "equal" as const };
    const ev = evaluateOffer(s, id, target.id, offer);
    if (ev.verdict === "reject") continue;
    if (ev.verdict === "counter" && ev.counterSalary) offer.salary = ev.counterSalary;
    target.next = { teamId: id, salary: offer.salary, endYear: s.year + offer.years, role: offer.role, replaces: seat.id };
    signed += 1;
    s.rumours.push({ day: s.day, text: `${target.spec.name} has agreed to join ${baseTeam(id).name} next season.` } as never);
    news(s, `${target.spec.name} will leave ${baseTeam(target.teamId!).name} for ${baseTeam(id).name} next year.`, { importance: 2, cause: "A summer deal", tag: "people" });
  }
}

/** Performance bonus paid at the year end to a driver on a clause deal. */
export function clauseBonuses(s: CareerState): string[] {
  const notes: string[] = [];
  const me = s.teams[s.teamId];
  const order = Object.entries(s.standings.drivers).sort((a, b) => b[1] - a[1]).map(([id]) => id);
  for (const dr of driversOf(s, s.teamId)) {
    if (!dr.perfBonus) continue;
    const pos = order.indexOf(dr.id) + 1;
    if (pos > 0 && pos <= 5) {
      me.cash = round2(me.cash - dr.perfBonus);
      me.ledger.costs += dr.perfBonus;
      notes.push(`${dr.spec.name} finished ${pos}th in the championship: performance bonus ${fmtMoney(dr.perfBonus)}.`);
    } else notes.push(`${dr.spec.name} missed his performance target. No bonus paid.`);
  }
  return notes;
}

export const summerDay = (s: CareerState) => summerStart(s.year);
