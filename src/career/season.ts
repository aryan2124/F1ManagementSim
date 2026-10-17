import { internYearEnd } from "./hiring";
import { initRoles } from "./status";
import { settleTitles } from "./records";
import { boardMove } from "./board";
import { addArea, applyConcept, driftRegW } from "./traits";
import { newCarDoubt, shiftBelief } from "./know";
import { applyNextCar } from "./nextcar";
import { clauseBonuses } from "./silly";
import { baseTeam, carRating, standingsRank, teamRanking } from "./car";
import { buildCalendar } from "./calendar";
import { pushCard, news, ticker, recap } from "./cards";
import { ageWorld, ensureTwoDrivers, runMarket, signDriver, staffYearEnd } from "./contracts";
import { CFG } from "./config";
import { driversOf, newFinancialYear, yearEndBooks } from "./finance";
import { resetAllowance } from "./rnd";
import { clamp, fmtMoney, rngFor, round2 } from "./util";
import { AREAS, type CareerState } from "./types";
import { makeSponsor, ordinal } from "./world";
import { restoreIdentity } from "./brand";
import { launchEra } from "./eras";
import { academyYearEnd, newCohort } from "./academy";
import { hallYearEnd, ownerNewSeason, ownerYearEnd, updateRecords } from "./people";
import { eventsYearEnd } from "./events";

export function objectiveFor(rankIdx: number) {
  const target = Math.max(1, rankIdx + 1 - (rankIdx >= 4 ? 1 : 0) - (rankIdx >= 8 ? 1 : 0));
  const text = target === 1 ? "Win the constructors' title" : target <= 3 ? `Finish in the top ${target}` : `Finish ${ordinal(target)} or better`;
  return { id: "pos", text, kind: "position" as const, target };
}

/** The weakest car on the grid cannot sack its team principal. */
export function isWeakestTeam(s: CareerState, teamId: string): boolean {
  const r = teamRanking(s);
  return r[r.length - 1] === teamId;
}

/** How much of the gap to the average is closed this January: none inside the band, more the wider the field has spread. */
export function spreadOf(s: CareerState): number {
  const r = Object.keys(s.teams).map((id) => carRating(s, id));
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  return Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / r.length);
}
export function parityShare(s: CareerState): number {
  const sd = spreadOf(s);
  return clamp(sd > CFG.paritySpread ? 1 - CFG.paritySpread / sd : 0, CFG.parityFloor, CFG.parityMax);
}

export function playerRank(s: CareerState): number {
  return standingsRank(s).indexOf(s.teamId) + 1;
}

/** Takes over another team: sponsors move, the old team goes back to the AI. */
export function switchTeam(s: CareerState, newTeamId: string) {
  const old = s.teams[s.teamId];
  const rng = rngFor(s, "switch");
  old.sponsors = [];
  s.teamId = newTeamId;
  const t = s.teams[newTeamId];
  const taken = new Set<string>();
  t.sponsors = [0.5, 0.3, 0.2].map((p) => makeSponsor(rng, s.uid++, t.aiIncome * p, s.year, taken));
  t.board = 50;
  t.objectives = [objectiveFor(teamRanking(s).indexOf(newTeamId))];
  t.delegation = { rnd: "advise", setup: "advise", parts: "advise" };
  s.fired = false;
}

/** The week after the last race: the champions, the books, ageing, the driver market and the board's verdict. */
export function endOfSeason(s: CareerState) {
  const notes: string[] = [];
  const ranks = standingsRank(s);
  s.prevOrder = ranks.slice();
  const topDriver = Object.entries(s.standings.drivers).filter(([id]) => !s.story.arcs[`out:${id}`]).sort((a, b) => b[1] - a[1])[0];
  const champ = s.drivers[topDriver?.[0]];
  settleTitles(s, champ?.id, ranks[0]);
  const playerPos = ranks.indexOf(s.teamId) + 1;
  notes.push(...yearEndBooks(s));
  s.history.push({
    year: s.year,
    champion: champ?.spec.name ?? "?",
    championTeam: champ?.teamId ?? "?",
    constructors: ranks[0],
    playerPos,
    playerPoints: s.standings.teams[s.teamId] ?? 0,
  });
  news(s, `${champ?.spec.name ?? "?"} is the ${s.year} champion. ${baseTeam(ranks[0]).name} win the constructors' title.`);
  ticker(s, `${champ?.spec.name ?? "?"} takes the ${s.year} drivers' title.`, 3);

  // deals signed for next season with other teams take effect
  const moves: string[] = [];
  for (const d of Object.values(s.drivers)) {
    if (!d.next || d.retired) continue;
    const from = d.teamId;
    if (d.next.replaces && s.drivers[d.next.replaces]?.teamId === d.next.teamId) {
      const out = s.drivers[d.next.replaces];
      out.teamId = null;
      out.tenure = 0;
      s.freeDrivers.push(out.id);
      moves.push(`${out.spec.name} leaves to make room.`);
    }
    d.teamId = d.next.teamId;
    d.salary = d.next.salary;
    d.endYear = d.next.endYear;
    d.role = d.next.role;
    d.tenure = 0;
    delete d.next;
    moves.push(`${d.spec.name} moves ${from ? from.toUpperCase() + " to " : "to "}${d.teamId?.toUpperCase()}.`);
  }
  notes.push(...moves);

  notes.push(...academyYearEnd(s));
  notes.push(...ageWorld(s));
  notes.push(...runMarket(s, false).slice(0, 12));
  initRoles(s, true, s.teamId); // new signings at the other teams get the role their record earns
  notes.push(...staffYearEnd(s));
  internYearEnd(s);
  hallYearEnd(s);
  updateRecords(s);
  notes.push(...yearEndPlayer(s, champ?.spec.name ?? "?", champ?.teamId ?? null, ranks, playerPos, notes.slice(0, 6)));
}

/** The parts of the season's end that belong to one person: the board's verdict, bonuses, the owner and the review card. */
export function yearEndPlayer(s: CareerState, champName: string, champTeam: string | null, ranks: string[], playerPos: number, worldNotes: string[]): string[] {
  const notes: string[] = [];
  // board verdict
  const me = s.teams[s.teamId];
  const obj = me.objectives[0];
  const met = !obj || playerPos <= obj.target;
  boardMove(s, me, met ? 10 : -4 * Math.min(4, playerPos - (obj?.target ?? playerPos)), met ? "Season objective met" : "Season objective missed");
  notes.push(met ? `You finished ${ordinal(playerPos)}: objective met. The board is pleased.` : `You finished ${ordinal(playerPos)}, short of the target (${obj.text}). The board is not pleased.`);

  notes.push(...clauseBonuses(s));
  notes.push(...ensureTwoDrivers(s));
  notes.push(...ownerYearEnd(s));
  notes.push(...eventsYearEnd(s));
  if (champTeam === s.teamId) s.legacy.push({ year: s.year, text: `${champName} won the drivers' title for your team.` });
  if (ranks[0] === s.teamId) s.legacy.push({ year: s.year, text: `You won the constructors' title.` });
  pushCard(s, "offseason", `${s.year} season review`, `${champName} won the drivers' title. You finished ${ordinal(playerPos)} in the constructors'.\n\n${[...worldNotes, ...notes].slice(0, 10).join("\n")}`, [{ id: "ok", label: "On to the winter" }], { urgency: 2, deadline: s.day + 5 });
  recap(s, `${s.year} season complete.`);
  return notes;
}

/** January: new calendar, budgets, allowances, and a new car whose true pace nobody knows yet. */
export function newSeason(s: CareerState) {
  s.year += 1;
  s.calendar = buildCalendar(s.year);
  s.round = 0;
  s.standings = { drivers: Object.fromEntries(Object.keys(s.standings.drivers).map((k) => [k, 0])), teams: Object.fromEntries(Object.keys(s.teams).map((k) => [k, 0])), races: [] };
  for (const d of Object.values(s.drivers)) if (!(d.id in s.standings.drivers)) s.standings.drivers[d.id] = 0;
  s.summerDone = false;
  newFinancialYear(s);
  const rng = rngFor(s, "launch");
  // each team's new car: a random swing in each area first, wider when the grid has bunched up so a tight field gets shaken
  const swingMul = clamp(CFG.spreadFloor / Math.max(0.01, spreadOf(s)), 1, 2.4);
  for (const a of AREAS) for (const t of Object.values(s.teams)) addArea(t, a, round2(rng.gauss() * CFG.launchSwing * swingMul * (a === "power" ? 0.7 : 1)));
  // managed parity: the grid is pulled together only as far as its spread is wider than the band the rulemakers want
  const k = parityShare(s);
  for (const a of AREAS) {
    const ts = Object.values(s.teams);
    const mean = ts.reduce((x, t) => x + t.car[a], 0) / ts.length;
    for (const t of ts) {
      const before = t.car[a];
      const bb = t.believed[a];
      addArea(t, a, round2(mean + (before - mean) * (1 - k)) - before);
      // the player's belief follows the compression but knows nothing of the swing
      shiftBelief(t, a, round2(mean + (bb - mean) * (1 - k)) - bb);
    }
  }
  // the clock is relative, so a decade of progress must not run the whole grid into the stops: each January the rulemakers reset the baseline, and everyone's figures (and beliefs) fall by the same amount
  for (const a of AREAS) {
    const ts = Object.values(s.teams);
    const mean = ts.reduce((x, t) => x + t.car[a], 0) / ts.length;
    const drop = round2(CFG.baselineReset * (mean - CFG.baselineAt));
    if (Math.abs(drop) < 0.01) continue;
    for (const t of ts) {
      addArea(t, a, -drop);
      shiftBelief(t, a, -drop);
    }
  }
  news(s, "The rulemakers reset the baseline for the new season: every team's figures start nearer zero. The gaps between teams are unchanged.", { importance: 1, tag: "rules" });
  // the new car is built to its team's concept
  for (const t of Object.values(s.teams)) applyConcept(t, rngFor(s, `concept:${t.id}:${s.year}`));
  for (const t of Object.values(s.teams)) newCarDoubt(t);
  driftRegW(s, 0.25, "year");
  launchEra(s);
  newCohort(s);
  const ranking = teamRanking(s);
  for (const t of Object.values(s.teams)) {
    t.projects = t.projects.filter((p) => p.status === "building" || p.status === "ready").map((p) => (p.status === "ready" ? p : p));
    t.ideas = [];
    t.board = clamp(t.board, 0, 100);
    t.objectives = [objectiveFor(ranking.indexOf(t.id))];
    t.sponsors = t.sponsors.filter((x) => x.endYear >= s.year);
  }
  resetAllowance(s, "year");
  newSeasonPlayer(s);
  void signDriver;
  void carRating;
  void driversOf;
}

/** The start of a season for one person: owner goals, sponsors, a clean story and the board's brief. */
export function newSeasonPlayer(s: CareerState) {
  applyNextCar(s);
  const rng = rngFor(s, `newseason:${s.teamId}`);
  for (const k of Object.keys(s.story.arcs)) if (k.startsWith("out:")) delete s.story.arcs[k];
  const me0 = s.teams[s.teamId];
  if (s.brand.by != null && !me0.sponsors.some((x) => x.id === s.brand.by && x.endYear >= s.year)) restoreIdentity(s);
  me0.sponsors = me0.sponsors.filter((x) => x.endYear >= s.year);
  s.story.arcs.lostRun = 0;
  ownerNewSeason(s);
  const me = s.teams[s.teamId];
  if (me.sponsors.length < 2) {
    const taken = new Set(me.sponsors.map((x) => x.name));
    while (me.sponsors.length < 3) me.sponsors.push(makeSponsor(rng, s.uid++, me.aiIncome * 0.34, s.year, taken));
  }
  const obj = me.objectives[0];
  pushCard(s, "board", `${s.year}: new season`, `The owner's objective: ${obj.text}. His second goal: ${s.owner.goal.text}. Budget cap is ${fmtMoney(me.capLimit, 0)}${me.capLimit < CFG.cap ? " (cut after last year's breach)" : ""}. Wind tunnel allowance reset: ${me.tunnelTotal} hours.`, [{ id: "ok", label: "Understood" }], { urgency: 2, deadline: s.day + 6 });
}
