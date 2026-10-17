import { chaseOf } from "./records";
import { generateDriver, realPeople } from "../game/people";
import { Rng, hashSeed } from "../sim/rng";
import { carRating, teamRanking, staffOf } from "./car";
import { summerStart } from "./calendar";
import { CFG } from "./config";
import { driversOf } from "./finance";
import { clamp, fmtMoney, isHuman, nextId, rngFor, round2 } from "./util";
import type { CareerState, DriverState, JuniorState, Offer, Staff } from "./types";
import { makeStaff, SALARY_BASE } from "./world";
import { markGone } from "./academy";
import { rulesOf } from "./eras";
import { rumourBonus } from "./people";
import { news, ticker } from "./cards";

export const ageOf = (s: CareerState, d: DriverState) => s.year - (d.spec.born ?? s.year - 28);

/** What a driver would want to sign for, $m a year. */
export function askingSalary(s: CareerState, d: DriverState): number {
  const q = clamp((d.spec.pace - 0.984) / 0.016, 0, 1.05);
  let ask = 1.5 + 52 * Math.pow(q, 1.8);
  const age = ageOf(s, d);
  if (age < 26) ask += (d.potential - 0.8) * 12;
  if (age > 36) ask *= 0.85;
  // records, titles and the standing of the market multiply what he can ask
  const rec = d.rec;
  const legend = 1 + Math.min(0.4, (rec?.wdc?.length ?? d.titles ?? 0) * 0.07 + (rec?.p1 ?? d.wins) * 0.002);
  ask *= legend * (chaseOf(s, d).on ? 1.12 : 1);
  return round2(Math.max(0.5, ask));
}

export interface ScoreLine {
  label: string;
  /** 0..1 how well the offer does on this. */
  value: number;
  weight: number;
  note: string;
}
export interface OfferVerdict {
  verdict: "accept" | "counter" | "reject";
  score: number;
  lines: ScoreLine[];
  /** Salary that would clear the bar, if only money is missing. */
  counterSalary?: number;
}

/**
 * A driver weighs five things, like the plan says: money, role, a winning car, loyalty, length.
 * How much each matters depends on their character. The breakdown is shown to the player.
 */
/** What a driver counts as his pay: a clause deal pays less up front and a bonus he may or may not believe in. */
export function effectivePay(offer: Offer, d: DriverState): number {
  if (!offer.perf) return offer.salary;
  const belief = d.spec.psyche?.selfBelief ?? 0.5;
  return offer.salary * 0.8 + offer.salary * 0.4 * (0.25 + 0.75 * belief) * 0.9;
}
export const perfBonusOf = (offer: Offer) => round2(offer.salary * 0.4);

export function evaluateOffer(s: CareerState, teamId: string, driverId: string, offer: Offer, search = true): OfferVerdict {
  const d = s.drivers[driverId];
  const psy = d.spec.psyche;
  const ask = askingSalary(s, d);
  const rank = teamRanking(s).indexOf(teamId);
  const carScore = 1 - rank / 10;
  const ego = psy?.ego ?? 0.5;
  const patience = psy?.patience ?? 0.5;
  const loyalty = psy?.loyalty ?? 0.5;
  const sameTeam = d.teamId === teamId;
  const roleScore = offer.role === "number1" ? 1 : offer.role === "equal" ? (ego > 0.65 ? 0.45 : 0.75) : ego > 0.5 ? 0.1 : 0.35;
  const lenPref = ageOf(s, d) < 26 ? 3 : ageOf(s, d) > 34 ? 1 : 2;
  const lenScore = 1 - Math.abs(offer.years - lenPref) / 3;
  const lines: ScoreLine[] = [
    { label: "Money", value: clamp(effectivePay(offer, d) / ask / 1.2, 0, 1), weight: 0.4, note: `Offer ${fmtMoney(offer.salary)}${offer.perf ? " (80% base plus bonus)" : ""} against about ${fmtMoney(ask)} asked` },
    { label: "A winning car", value: carScore, weight: 0.25 + 0.2 * (1 - patience), note: `${s.teams[teamId] ? "Your car is ranked " + (rank + 1) + " of 11" : ""}` },
    { label: "Role", value: roleScore, weight: 0.1 + 0.2 * ego, note: offer.role === "number1" ? "Promised number one status" : offer.role === "equal" ? "Equal status with the team-mate" : "Second driver role" },
    { label: "Loyalty", value: sameTeam ? clamp(0.5 + d.tenure * 0.1, 0, 1) : 0.4, weight: 0.1 * (0.5 + loyalty), note: sameTeam ? `${d.tenure} seasons with the team` : "No history with you" },
    { label: "Length", value: lenScore, weight: 0.05, note: `${offer.years} year deal` },
  ];
  if (offer.option) lines.push({ label: "Team option", value: 0.25, weight: 0.07 + 0.08 * ego, note: "The team may keep him a year longer on the same pay. He cannot leave if they do." });
  if (offer.promise) {
    const want = offer.promise === "number1" || offer.promise === "title" ? 0.2 + 0.25 * ego : offer.promise === "noSwap" || offer.promise === "seat" ? 0.15 + 0.25 * (1 - patience) : 0.15 + 0.2 * loyalty;
    // a promise he has seen broken before is worth far less
    const burnt = (d.causes.promise ?? 0) > 0.2 || d.trust < 0.35;
    lines.push({ label: "Your promise", value: burnt ? 0.2 : 0.95, weight: want, note: burnt ? "He has heard promises from you before" : `You promise: ${offer.promise === "title" ? "a top three car" : offer.promise === "number1" ? "number one status" : offer.promise === "seat" ? "a safe seat" : offer.promise === "noSwap" ? "no swapping him out" : offer.promise === "academy" ? "a future with the academy" : "an upgrade"}` });
  }
  if (sameTeam && d.gStage >= 2) lines.push({ label: "Mood at the team", value: 1 - d.grievance, weight: 0.5 * d.grievance + 0.1, note: d.gStage >= 4 ? "He is angry about how things have gone" : "He has had complaints" });
  const total = lines.reduce((a, l) => a + l.weight, 0);
  let score = lines.reduce((a, l) => a + l.weight * l.value, 0) / total;
  if (sameTeam && (d.causes.noResign ?? 0) > 0) score = Math.min(score, 0.2);
  // money counts relative to the ask, so the bar is set so that paying the ask with a mid car and a fair role clears it
  const bar = 0.7;
  let verdict: OfferVerdict["verdict"] = score >= bar ? "accept" : score >= bar - 0.1 ? "counter" : "reject";
  const out: OfferVerdict = { verdict, score, lines };
  if (verdict === "counter" && !search) return out;
  if (verdict === "counter") {
    // find the smallest salary (5 percent steps over the offer) that clears the bar
    for (let k = 1; k <= 12; k++) {
      const sal = round2(offer.salary * (1 + 0.06 * k));
      const l2 = evaluateOffer(s, teamId, driverId, { ...offer, salary: sal }, false);
      if (l2.score >= bar) {
        out.counterSalary = sal;
        break;
      }
    }
    if (!out.counterSalary) verdict = "reject";
    out.verdict = verdict;
  }
  return out;
}

export function canApproach(s: CareerState, driverId: string): { ok: boolean; why?: string } {
  const d = s.drivers[driverId];
  if (!d || d.retired) return { ok: false, why: "Not available." };
  if (d.teamId === null) return { ok: true };
  if (d.teamId === s.teamId) return { ok: true };
  if (d.endYear > s.year) return { ok: false, why: `Under contract until ${d.endYear}.` };
  if (s.day < summerStart(s.year)) return { ok: false, why: "Teams may only talk to expiring drivers from the summer break." };
  return { ok: true };
}

/** Put a driver in a seat. A displaced driver goes to the market after a payout of half the remaining deal. */
export function signDriver(s: CareerState, teamId: string, driverId: string, offer: Offer, seatDriverId?: string): string[] {
  const notes: string[] = [];
  const d = s.drivers[driverId];
  const t = s.teams[teamId];
  if (seatDriverId && s.drivers[seatDriverId]) {
    const out = s.drivers[seatDriverId];
    const left = Math.max(0, out.endYear - s.year + (s.round >= s.calendar.length ? 0 : 1));
    const payout = round2(out.salary * left * 0.5);
    t.cash = round2(t.cash - payout);
    out.teamId = null;
    out.tenure = 0;
    s.freeDrivers.push(out.id);
    notes.push(`${out.spec.name} released. Payout ${fmtMoney(payout)}.`);
  }
  s.freeDrivers = s.freeDrivers.filter((x) => x !== driverId);
  if (d.teamId && d.teamId !== teamId) {
    // leaving another team: they lose a driver, they will refill at the next market
    notes.push(`${d.spec.name} leaves ${d.teamId.toUpperCase()}.`);
  }
  d.teamId = teamId;
  d.salary = offer.salary;
  d.endYear = s.year + offer.years - (s.round >= s.calendar.length ? 0 : 1);
  d.role = offer.role;
  applyClauses(d, offer);
  d.tenure = 0;
  d.spec = { ...d.spec, number: freeNumber(s, d.spec.number) };
  notes.push(`${d.spec.name} signed until ${d.endYear} for ${fmtMoney(offer.salary)} a year.`);
  return notes;
}

function freeNumber(s: CareerState, want: number): number {
  const used = new Set(Object.values(s.drivers).filter((x) => x.teamId && !x.retired).map((x) => x.spec.number));
  let n = want;
  while (used.has(n) && n < 99) n++;
  return n;
}

export function extendDriver(s: CareerState, driverId: string, offer: Offer) {
  const d = s.drivers[driverId];
  d.salary = offer.salary;
  d.endYear = s.year + offer.years - (s.round >= s.calendar.length ? 0 : 1);
  d.role = offer.role;
  applyClauses(d, offer);
}

function applyClauses(d: DriverState, offer: Offer) {
  d.optionYear = offer.option ? d.endYear + 1 : undefined;
  d.perfBonus = offer.perf ? perfBonusOf(offer) : undefined;
  if (offer.perf) d.salary = round2(offer.salary * 0.8);
}

// ---------------------------------------------------------------- staff

export function staffAsk(st: Staff): number {
  const base = SALARY_BASE[st.role];
  return round2(base * (0.55 + (st.skill / 100) * 0.9));
}

export function hireStaff(s: CareerState, teamId: string, staffId: string, salary: number, years: number, forDriverId?: string): string[] {
  const st = s.staff[staffId];
  const notes: string[] = [];
  const current = Object.values(s.staff).find((x) => x.teamId === teamId && !x.intern && x.role === st.role && (st.role !== "engineer" || x.driverId === (forDriverId ?? st.driverId)));
  if (current) {
    current.teamId = null;
    current.tenure = 0;
    s.freeStaff.push(current.id);
    notes.push(`${current.name} leaves the team.`);
  }
  s.freeStaff = s.freeStaff.filter((x) => x !== staffId);
  st.teamId = teamId;
  st.salary = salary;
  st.endYear = s.year + years - 1;
  st.tenure = 0;
  st.known = Math.max(st.known, 0.2);
  if (st.role === "engineer") st.driverId = forDriverId ?? current?.driverId;
  notes.push(`${st.name} joins as ${st.role === "engineer" ? "race engineer" : st.role}.`);
  return notes;
}

// ---------------------------------------------------------------- year-end market and ageing

function ensureBorn(s: CareerState) {
  for (const d of Object.values(s.drivers)) if (d.spec.born === undefined) d.spec.born = s.year - 22 - (hashSeed(d.id) % 10);
}

function retireChance(d: DriverState, age: number): number {
  return age >= CFG.retireAge ? Math.min(0.9, (age - 40) * 0.2) : age >= 37 && d.spec.pace < 0.978 ? 0.45 : 0;
}

/**
 * Before the last race: the drivers who are about to retire have decided. Rolled here (not at the year end) so the news can
 * announce it, the pit wall can pay tribute and the drivers can do their donuts after the flag. Returns who is going.
 */
export function planRetirements(s: CareerState): DriverState[] {
  ensureBorn(s);
  const rng = rngFor(s, "retire");
  const out: DriverState[] = [];
  for (const d of Object.values(s.drivers)) {
    if (d.retired || !d.teamId || d.retireRolled === s.year) continue;
    d.retireRolled = s.year;
    const p = retireChance(d, ageOf(s, d));
    if (p > 0 && rng.chance(p)) {
      d.retiring = s.year;
      out.push(d);
      news(s, `${d.spec.name} has announced that this will be his last race.`, { importance: 3, cause: "A career ends", tag: "record" });
      ticker(s, `${d.spec.name} retires after this season.`, 2);
    }
  }
  return out;
}

/** Pace drift by age, retirements, and a fresh batch of juniors. */
export function ageWorld(s: CareerState): string[] {
  ensureBorn(s);
  const notes: string[] = [];
  const rng = rngFor(s, "age");
  for (const d of Object.values(s.drivers)) {
    if (d.retired) continue;
    const age = ageOf(s, d);
    const potPace = 0.985 + d.potential * 0.016;
    if (age <= 24) d.spec.pace = clamp(d.spec.pace + Math.min(CFG.youngGrow, Math.max(0, (potPace - d.spec.pace) * 0.4)) + rng.gauss() * 0.0004, 0.93, 1.002);
    else if (age >= 32) d.spec.pace = clamp(d.spec.pace - CFG.oldDecline * (1 + (age - 32) * 0.12) + rng.gauss() * 0.0004, 0.93, 1.002);
    else d.spec.pace = clamp(d.spec.pace + rng.gauss() * 0.0004, 0.93, 1.002);
    if (age <= 28) d.spec.consistency = clamp(d.spec.consistency + 0.006, 0.4, 0.95);
    d.tenure += 1;
    const retireP = retireChance(d, age);
    // the decision was usually rolled before the last race (planRetirements), so the paddock could send him off
    const decided = d.retireRolled === s.year;
    if (decided ? d.retiring === s.year : retireP > 0 && rng.chance(retireP)) {
      d.retired = true;
      const wasTeam = d.teamId;
      d.teamId = null;
      s.freeDrivers = s.freeDrivers.filter((x) => x !== d.id);
      notes.push(`${d.spec.name} retires at ${age}.${wasTeam ? "" : ""}`);
    }
  }
  // junior pool: the academy engine manages it once it exists
  if (Object.keys(s.academy.prospects).length) return notes;
  const real = realPeople();
  const taken = new Set([...real.names, ...Object.values(s.drivers).map((d) => d.spec.name), ...s.pool.map((p) => p.name)]);
  const codes = new Set([...Object.values(s.drivers).map((d) => d.spec.code), ...s.pool.map((p) => p.code)]);
  const next: JuniorState[] = [];
  for (const p of s.pool) {
    const age = s.year - p.born;
    const potPace = 0.96 + p.potential * 0.04;
    p.pace = clamp(p.pace + (potPace - p.pace) * 0.28 + rng.gauss() * 0.0015, 0.93, 0.998);
    p.consistency = clamp(p.consistency + 0.01, 0.4, 0.93);
    if (age <= 24) next.push(p);
  }
  const g = new Rng(hashSeed(`pool:${s.seed}:${s.year}`));
  let k = 0;
  while (next.length < 46) {
    const gen = generateDriver(g, "F3", taken, codes, `jr-${s.year}-${k++}`);
    next.push({ id: gen.id, name: gen.name, code: gen.code, nat: gen.nat, born: s.year - Math.round(g.range(17, 19)), pace: gen.pace, potential: gen.potential, tyreMgmt: gen.tyreMgmt, aggression: gen.aggression, consistency: gen.consistency, fictional: true });
  }
  s.pool = next;
  return notes;
}

function candidateValue(s: CareerState, d: DriverState, ask: number, brain: number, ownTeam: boolean): number {
  const age = ageOf(s, d);
  let v = (d.spec.pace - 0.98) * 100 * 3;
  if (age < 25) v += (d.potential - 0.8) * 4;
  if (age > 35) v -= (age - 35) * 0.2;
  if (ownTeam) v += 0.5;
  v -= ask * 0.012 * (0.4 + brain);
  return v;
}

function juniorToDriver(s: CareerState, j: JuniorState): DriverState {
  const spec = { id: j.id, code: j.code, name: j.name, number: freeNumber(s, 40 + (hashSeed(j.id) % 50)), nat: j.nat, born: j.born, pace: j.pace, tyreMgmt: j.tyreMgmt, aggression: j.aggression, consistency: j.consistency, fictional: j.fictional };
  return { id: j.id, spec, teamId: null, salary: 1, endYear: s.year, role: "equal", potential: j.potential, tenure: 0, retired: false, morale: 0.7, trust: 0.7, wins: 0, podiums: 0, titles: 0, starts: 0, grievance: 0, gStage: 0, causes: {} };
}

/**
 * The end-of-season driver market. Teams in order of strength fill their open seats from expiring drivers, the free pool and the junior ladder.
 * Difficulty only changes how good the AI's choices are, never the cars.
 */
export function runMarket(s: CareerState, includePlayer = false): string[] {
  const notes: string[] = [];
  const order = teamRanking(s);
  const rng = rngFor(s, "market");
  // everyone whose deal has run out (and was not re-signed) goes into the pool
  const open: Record<string, number> = {};
  for (const id of order) {
    const mine = driversOf(s, id);
    const expiring = mine.filter((d) => d.endYear <= s.year);
    const isPlayer = isHuman(s, id) && !includePlayer;
    for (const d of expiring) {
      if (isPlayer) {
        // the player's unresolved deals lapse
        d.teamId = null;
        d.tenure = 0;
        s.freeDrivers.push(d.id);
        notes.push(`${d.spec.name}'s deal ran out and he left your team.`);
        continue;
      }
      // AI teams try to keep a driver who is worth it
      const ask = askingSalary(s, d);
      const keep = candidateValue(s, d, ask, s.teams[id].skillBrain, true) > 0.9 - 0.3 * s.teams[id].skillBrain + rng.gauss() * 0.3;
      if (d.optionYear && d.optionYear > d.endYear && (keep || rng.chance(0.5))) {
        d.endYear = d.optionYear;
        d.optionYear = undefined;
      } else if (keep) {
        const years = rng.pick([1, 2, 2, 3]);
        d.salary = round2(ask * rng.range(0.92, 1.08));
        d.endYear = s.year + years;
      } else {
        d.teamId = null;
        d.tenure = 0;
        s.freeDrivers.push(d.id);
        notes.push(`${d.spec.name} leaves ${id.toUpperCase()} as a free agent.`);
      }
    }
  }
  for (const id of order) {
    if (isHuman(s, id)) continue;
    const t = s.teams[id];
    let need = 2 - driversOf(s, id).length;
    let guard = 0;
    const declined = new Set<string>();
    while (need > 0 && guard++ < 10) {
      const cands = s.freeDrivers.map((x) => s.drivers[x]).filter((d) => !d.retired && !declined.has(d.id));
      let best: DriverState | null = null;
      let bestV = -Infinity;
      for (const d of cands) {
        const v = candidateValue(s, d, askingSalary(s, d), t.skillBrain, false) + rumourBonus(s, d.id, id) + rng.gauss() * (1 - t.skillBrain) * 0.6;
        if (v > bestV) {
          bestV = v;
          best = d;
        }
      }
      // also look at the junior ladder
      let bestJ: JuniorState | null = null;
      let bestJV = -Infinity;
      for (const j of s.pool) {
        const age = s.year - j.born;
        if (age < 18 || j.pace < 0.975) continue;
        if (j.owner && j.owner !== id) continue;
        const ds = juniorToDriver(s, j);
        const v = candidateValue(s, ds, 2, t.skillBrain, false) + (j.owner === id ? 0.8 : 0) + rumourBonus(s, j.id, id) + rng.gauss() * (1 - t.skillBrain) * 0.6;
        if (v > bestJV) {
          bestJV = v;
          bestJ = j;
        }
      }
      let pick: DriverState | null = best;
      if (bestJ && (!best || bestJV > bestV + 0.3)) {
        pick = juniorToDriver(s, bestJ);
        s.drivers[pick.id] = pick;
        markGone(s, pick.id);
        s.pool = s.pool.filter((p) => p.id !== bestJ!.id);
      }
      if (!pick) break;
      const ask = askingSalary(s, pick);
      let paid = round2(ask * rng.range(0.9, 1.05));
      // the driver weighs the offer like he would for the player: a bad car or a low offer can be turned down
      if (guard < 9 && s.freeDrivers.includes(pick.id)) {
        const ev = evaluateOffer(s, id, pick.id, { salary: paid, years: 2, role: "equal" });
        if (ev.verdict === "reject" || (ev.verdict === "counter" && (!ev.counterSalary || ev.counterSalary > ask * 1.35))) {
          declined.add(pick.id);
          if (rng.chance(0.3) && t.skillBrain > 0.5) notes.push(`${pick.spec.name} turns down ${t.id.toUpperCase()}.`);
          continue;
        }
        if (ev.verdict === "counter" && ev.counterSalary) paid = ev.counterSalary;
      }
      pick.teamId = id;
      pick.salary = paid;
      const tc = rulesOf(s).talentCap;
      if (tc) pick.salary = Math.min(pick.salary, round2(tc * 0.55));
      pick.endYear = s.year + rng.pick([1, 2, 2, 3]);
      pick.tenure = 0;
      pick.spec = { ...pick.spec, number: freeNumber(s, pick.spec.number) };
      s.freeDrivers = s.freeDrivers.filter((x) => x !== pick!.id);
      notes.push(`${pick.spec.name} signs for ${t.id.toUpperCase()}.`);
      need -= 1;
    }
    void open;
  }
  return notes;
}

/** The player must always have two drivers. If they ran short, sign the best affordable free agent. */
export function ensureTwoDrivers(s: CareerState): string[] {
  const notes: string[] = [];
  let guard = 0;
  while (driversOf(s, s.teamId).length < 2 && guard++ < 3) {
    const cands = s.freeDrivers.map((x) => s.drivers[x]).filter((d) => !d.retired).sort((a, b) => b.spec.pace - a.spec.pace);
    const pick = cands[0] ?? (s.pool.length ? (() => {
      const j = [...s.pool].filter((x) => !x.owner || x.owner === s.teamId).sort((a, b) => b.pace - a.pace)[0];
      const d = juniorToDriver(s, j);
      s.drivers[d.id] = d;
      s.pool = s.pool.filter((p) => p.id !== j.id);
      return d;
    })() : undefined);
    if (!pick) break;
    const ask = askingSalary(s, pick);
    notes.push(...signDriver(s, s.teamId, pick.id, { salary: ask, years: 1, role: "equal" }));
  }
  return notes;
}

// ---------------------------------------------------------------- staff year-end

export function staffYearEnd(s: CareerState): string[] {
  const notes: string[] = [];
  const rng = rngFor(s, "staff");
  for (const st of Object.values(s.staff)) {
    if (!st.teamId || st.intern) continue;
    st.age += 1;
    st.tenure += 1;
    if (st.endYear > s.year) continue;
    if (isHuman(s, st.teamId)) {
      // a person's staff on an expiring deal leave unless re-signed (cards handle it earlier)
      st.teamId = null;
      st.tenure = 0;
      s.freeStaff.push(st.id);
      notes.push(`${st.name} (${st.role}) left when the deal expired.`);
      continue;
    }
    if (rng.chance(0.85)) {
      st.endYear = s.year + rng.pick([1, 2, 3]);
      st.salary = staffAsk(st);
    } else {
      st.teamId = null;
      st.tenure = 0;
      s.freeStaff.push(st.id);
    }
  }
  // refill any empty AI role from the free pool or by hiring a fresh person
  const roles: [Staff["role"], boolean][] = [["td", false], ["designer", false], ["aero", false], ["power", false], ["data", false], ["strategy", false], ["mechanic", false], ["engineer", true]];
  for (const teamId of Object.keys(s.teams)) {
    for (const [role, perDriver] of roles) {
      const drivers = perDriver ? driversOf(s, teamId).map((d) => d.id) : [undefined];
      for (const did of drivers) {
        const exists = Object.values(s.staff).some((x) => x.teamId === teamId && x.role === role && (!perDriver || x.driverId === did));
        if (exists) continue;
        if (isHuman(s, teamId)) continue; // a person fills their own gaps
        const pool = s.freeStaff.map((x) => s.staff[x]).filter((x) => x.role === role).sort((a, b) => b.skill - a.skill);
        if (pool.length) {
          const pick = pool[0];
          s.freeStaff = s.freeStaff.filter((x) => x !== pick.id);
          pick.teamId = teamId;
          pick.driverId = perDriver ? did : undefined;
          pick.endYear = s.year + rng.pick([1, 2, 3]);
          pick.salary = staffAsk(pick);
        } else {
          const id = `st-${nextId(s)}`;
          const fresh = makeStaff(rng, id, role, teamId, 55 + rng.gauss() * 6, s.year, did);
          s.staff[id] = fresh;
        }
      }
    }
  }
  // free staff pool stays full
  while (s.freeStaff.length < 12) {
    const id = `st-${nextId(s)}`;
    const roleList: Staff["role"][] = ["td", "designer", "aero", "power", "data", "strategy", "mechanic", "engineer"];
    s.staff[id] = makeStaff(rng, id, rng.pick(roleList), null, rng.range(45, 80), s.year);
    s.freeStaff.push(id);
  }
  return notes;
}

export { carRating, staffOf };
