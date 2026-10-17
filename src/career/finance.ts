import { internMonth, refreshInternPool } from "./hiring";
import { boardMove } from "./board";
import { graduatePrestige } from "./academy";
import { brandAfterRace } from "./brand";
import { CFG } from "./config";
import { standingsRank, teamStaff } from "./car";
import { capRoom } from "./rnd";
import { clamp, round2, fmtMoney, isHuman } from "./util";
import type { Budgets, CareerState, Facilities, TeamState } from "./types";
import { emptyLedger } from "./world";
import { logSpend } from "./log";
import { multiply } from "./factors";

export const driversOf = (s: CareerState, teamId: string) => Object.values(s.drivers).filter((d) => d.teamId === teamId && !d.retired);

export function annualSalaries(s: CareerState, teamId: string): number {
  return round2(driversOf(s, teamId).reduce((a, d) => a + d.salary, 0) + teamStaff(s, teamId).reduce((a, x) => a + x.salary, 0));
}
export function facilityUpkeep(t: TeamState): number {
  const f = t.facilities;
  return round2((f.tunnel + f.sim + f.factory + f.academy) * 1.2);
}
export function sponsorIncome(t: TeamState, human: boolean): number {
  return human ? round2(t.sponsors.reduce((a, x) => a + x.retainer, 0)) : t.aiIncome;
}

/** Cash in and out on the first of each month: salaries, upkeep and overhead, and the sponsor retainers. */
export function monthlyBooks(s: CareerState) {
  refreshInternPool(s);
  internMonth(s);
  for (const t of Object.values(s.teams)) {
    const human = isHuman(s, t.id);
    const inc = (sponsorIncome(t, human) * (human ? multiply(s, t.id, ["reputation", "form", "story"]).value : 1)) / 12;
    const sal = annualSalaries(s, t.id) / 12;
    const fac = facilityUpkeep(t) / 12;
    const oth = t.overhead / 12;
    const interest = round2(((t.debt ?? 0) * CFG.debtRate) / 12);
    t.cash = round2(t.cash + inc - sal - fac - oth - interest);
    t.ledger.other += interest;
    t.ledger.costs += interest;
    t.ledger.sponsors += inc;
    t.ledger.income += inc;
    t.ledger.salaries += sal;
    t.ledger.facilities += fac;
    t.ledger.other += oth;
    t.ledger.costs += sal + fac + oth;
    const dr = driversOf(s, t.id).reduce((a, d) => a + d.salary, 0) / 12;
    t.ledger.drivers = round2(t.ledger.drivers + dr);
    t.ledger.staffPay = round2(t.ledger.staffPay + (sal - dr));
    if (human) logSpend(s, `Monthly books: sponsors +${fmtMoney(inc)}, drivers -${fmtMoney(dr)}, staff -${fmtMoney(sal - dr)}, upkeep -${fmtMoney(fac)}, running costs -${fmtMoney(oth)}`, { cash: round2(inc - sal - fac - oth) });
  }
}

/** The facility project is paid up front and finishes later. */
export function facilityCost(level: number) {
  return 10 + 6 * level;
}
export function startFacility(s: CareerState, teamId: string, which: keyof Omit<Facilities, "building">): { ok: boolean; why?: string } {
  const t = s.teams[teamId];
  if (t.facilities.building) return { ok: false, why: "Another facility project is running." };
  const lvl = t.facilities[which];
  if (lvl >= 5) return { ok: false, why: "Already at the top level." };
  const cost = facilityCost(lvl);
  if (t.cash < cost) return { ok: false, why: `Needs ${fmtMoney(cost)} cash.` };
  t.cash = round2(t.cash - cost);
  t.ledger.costs += cost;
  t.ledger.facilities += cost;
  if (teamId === s.teamId) logSpend(s, `Facility upgrade started: ${which} to level ${lvl + 1}`, { cash: -cost });
  t.facilities.building = { which, done: s.day + 90 };
  return { ok: true };
}
export function tickFacility(s: CareerState, teamId: string): string | null {
  const t = s.teams[teamId];
  const b = t.facilities.building;
  if (b && s.day >= b.done) {
    t.facilities[b.which] += 1;
    t.facilities.building = null;
    return b.which;
  }
  return null;
}

export interface TeamResult {
  positions: number[]; // finishing positions of the team's cars (classified)
  points: number;
}

/** Money after a Grand Prix: travel, the prize instalment, and the sponsors' race bonuses. */
export function raceMoney(s: CareerState, results: Record<string, TeamResult>, sprint: boolean) {
  const rank = standingsRank(s);
  rank.forEach((id, i) => {
    const t = s.teams[id];
    const pay = round2((CFG.prize[i] * CFG.racePayShare) / s.calendar.length);
    t.cash = round2(t.cash + pay - CFG.travelPerRace);
    s.prizePaid[id] = round2((s.prizePaid[id] ?? 0) + pay);
    t.ledger.prize += pay;
    t.ledger.income += pay;
    t.ledger.travel += CFG.travelPerRace;
    t.ledger.costs += CFG.travelPerRace;
  });
  raceBonuses(s, results, sprint);
}

/** The sponsors' race bonuses, fan mood and merchandise for the team of the person whose turn it is. */
export function raceBonuses(s: CareerState, results: Record<string, TeamResult>, sprint: boolean) {
  const t = s.teams[s.teamId];
  const r = results[s.teamId];
  if (!r) return;
  for (const sp of t.sponsors) {
    let met = false;
    if (sp.objKind === "bothPoints") met = r.positions.length >= 2 && r.positions.every((p) => p <= 10);
    if (sp.objKind === "podiums") met = r.positions.some((p) => p <= 3);
    if (sp.objKind === "top5") met = r.positions.some((p) => p <= 5);
    if (met) {
      t.cash = round2(t.cash + sp.bonusPerRace);
      t.ledger.sponsors += sp.bonusPerRace;
      t.ledger.income += sp.bonusPerRace;
      sp.mood = clamp(sp.mood + 0.03, 0, 1);
    } else {
      sp.mood = clamp(sp.mood - 0.012, 0, 1);
    }
  }
  brandAfterRace(s, r.positions);
  graduatePrestige(s, r.points);
  void sprint;
}

/** The remaining 20 percent of the prize money, the cap check, fines and the board's season verdict. Returns notes for the player's news. */
export function yearEndBooks(s: CareerState): string[] {
  const notes: string[] = [];
  const rank = standingsRank(s);
  rank.forEach((id, i) => {
    const t = s.teams[id];
    const owed = round2(CFG.prize[i] - (s.prizePaid[id] ?? 0));
    t.cash = round2(t.cash + owed);
    t.ledger.prize += owed;
    t.ledger.income += owed;
    const used = t.capSpent;
    const room = t.capLimit - CFG.capBaseProgramme;
    t.breached = used > room + 0.01;
    if (t.breached) {
      const over = used - room;
      const fine = round2(CFG.capBreachFineBase + over);
      t.cash = round2(t.cash - fine);
      t.ledger.costs += fine;
      t.fineOwed = fine;
      boardMove(s, t, -10, "Cost cap breach");
      if (id === s.teamId) notes.push(`Cost cap breach of ${fmtMoney(over)}: fine ${fmtMoney(fine)}, cap cut next year, board and sponsors unhappy.`);
    }
  });
  return notes;
}

/** New financial year: counters reset, cap cut after a breach, AI teams never go bust (an investor steps in). */
export function newFinancialYear(s: CareerState) {
  for (const t of Object.values(s.teams)) {
    const cut = t.breached ? Math.min(10, (t.capSpent - (t.capLimit - CFG.capBaseProgramme)) * CFG.capBreachCapCut) : 0;
    t.capLimit = CFG.cap - cut;
    t.capSpent = 0;
    t.breached = false;
    t.fineOwed = 0;
    t.ledger = emptyLedger();
    if (!isHuman(s, t.id) && t.cash < 10) {
      t.cash = round2(t.cash + 45);
    }
  }
  s.prizePaid = {};
}

export function forecast(s: CareerState, teamId: string): { endCash: number; capAtEnd: number } {
  const t = s.teams[teamId];
  const left = Math.max(0, s.calendar.length - s.round);
  const human = teamId === s.teamId;
  const rank = standingsRank(s).indexOf(teamId);
  const remainingPrize = CFG.prize[rank] * (1 - (s.prizePaid[teamId] ?? 0) / CFG.prize[rank]);
  const yearFrac = clamp(left / s.calendar.length, 0, 1);
  const net = ((sponsorIncome(t, human) - annualSalaries(s, teamId) - facilityUpkeep(t) - t.overhead) * yearFrac) + remainingPrize - CFG.travelPerRace * left;
  return { endCash: round2(t.cash + net), capAtEnd: capRoom(t) };
}

/**
 * The owner's pool: the cash you can reasonably spend this year. Expected income (sponsors and prize money at your current rank)
 * minus the costs you cannot choose (running costs and travel), plus a slice of your cash reserve you are willing to burn.
 * The four cash ceilings (drivers, staff, facilities, academy) are slices of this one pool, so raising one means lowering another.
 * The R&D ceiling is cap room, not cash, and is limited by the cost cap instead.
 */
export function budgetPool(s: CareerState): { pool: number; income: number; fixed: number; draw: number } {
  const t = s.teams[s.teamId];
  const rank = Math.max(0, standingsRank(s).indexOf(s.teamId));
  const income = sponsorIncome(t, true) * multiply(s, s.teamId, ["reputation", "form"]).value + CFG.prize[rank];
  const fixed = t.overhead + CFG.travelPerRace * s.calendar.length;
  const draw = clamp(t.cash * 0.2, 0, 40);
  return { pool: Math.round(income - fixed + draw), income: round2(income), fixed: round2(fixed), draw: round2(draw) };
}
export const CASH_LINES = ["drivers", "staff", "facilities", "academy"] as const;
export const allocated = (s: CareerState) => CASH_LINES.reduce((a, k) => a + s.budgets[k], 0);
/** The most a ceiling can be raised to right now. */
export function budgetMax(s: CareerState, key: keyof Budgets): number {
  if (key === "rnd") return Math.max(0, Math.floor(s.teams[s.teamId].capLimit - CFG.capBaseProgramme));
  return s.budgets[key] + Math.max(0, budgetPool(s).pool - allocated(s));
}
/** The least a ceiling can be set to: pay that is already contracted cannot be budgeted away. */
export function budgetMin(s: CareerState, key: keyof Budgets): number {
  if (key === "drivers" || key === "staff") return Math.ceil(committedBudget(s, key) - (key === "staff" ? teamStaffAcademy(s) : 0));
  if (key === "facilities") return Math.ceil(facilityUpkeep(s.teams[s.teamId]));
  return 0;
}

/** Starting ceilings: what the team spends now plus a little room, trimmed to fit the owner's pool. Set by the player afterwards. */
export function defaultBudgets(s: CareerState): Budgets {
  const me = s.teamId;
  const drivers = driversOf(s, me).reduce((a, d) => a + d.salary, 0);
  const staff = teamStaff(s, me).reduce((a, x) => a + x.salary, 0);
  const upkeep = Math.ceil(facilityUpkeep(s.teams[me]));
  const b: Budgets = { drivers: Math.ceil(drivers * 1.12), staff: Math.ceil(staff * 1.2), rnd: 60, facilities: upkeep + 6, academy: 6 };
  const { pool } = budgetPool(s);
  let over = b.drivers + b.staff + b.facilities + b.academy - pool;
  for (const [k, floor] of [["academy", 2], ["facilities", upkeep], ["staff", Math.ceil(staff)]] as const) {
    if (over <= 0) break;
    const cut = Math.min(over, b[k] - floor);
    b[k] -= Math.max(0, cut);
    over -= Math.max(0, cut);
  }
  return b;
}

/** The board can squeeze the budgets when trust is low. 1 is untouched. */
export function budgetScale(s: CareerState): number {
  const b = s.teams[s.teamId].board;
  return b >= 40 ? 1 : clamp(0.75 + (b / 40) * 0.25, 0.75, 1);
}

/** The yearly cost already committed in a budget area. */
export function committedBudget(s: CareerState, key: keyof Budgets): number {
  const me = s.teamId;
  if (key === "drivers") return driversOf(s, me).reduce((a, d) => a + d.salary, 0);
  if (key === "staff") return teamStaff(s, me).reduce((a, x) => a + x.salary, 0);
  if (key === "academy") return Object.values(s.academy.prospects).filter((p) => p.owner === me && p.status === "academy").reduce((a, p) => a + (p.deal?.retainer ?? 0) + 0.7, 0) + teamStaffAcademy(s);
  return 0;
}
const teamStaffAcademy = (s: CareerState) => teamStaff(s, s.teamId).filter((x) => x.role === "scout" || x.role === "coach").reduce((a, x) => a + x.salary, 0);

/** Null if the extra cost fits inside the player's ceiling, otherwise a sentence saying how far over it goes. */
export function budgetBlock(s: CareerState, key: keyof Budgets, extra: number): string | null {
  const t = s.teams[s.teamId];
  const ceiling = Math.round(s.budgets[key] * budgetScale(s));
  const now = key === "staff" ? committedBudget(s, "staff") - teamStaffAcademy(s) : key === "rnd" ? t.ledger.rnd : key === "facilities" ? t.ledger.facilities : committedBudget(s, key);
  if (extra <= 0.0001) return null;
  const { pool } = budgetPool(s);
  if (key !== "rnd" && allocated(s) > pool + 0.5) return `Your budgets add up to ${fmtMoney(allocated(s), 0)}, more than the ${fmtMoney(pool, 0)} the owner will fund. Lower a ceiling in the Money screen first.`;
  if (now + extra <= ceiling + 0.0001) return null;
  const name = key === "drivers" ? "driver" : key === "rnd" ? "R&D" : key;
  return `That would take your ${name} spending to ${fmtMoney(now + extra)}, over your ceiling of ${fmtMoney(ceiling, 0)}. Raise it in the Money screen if you mean to.`;
}
