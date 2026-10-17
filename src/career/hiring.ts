import { Rng, hashSeed } from "../sim/rng";
import { clamp, fmtMoney, isHuman, nextId, rngFor, round2 } from "./util";
import { multiply, whyText } from "./factors";
import { hireStaff, staffAsk } from "./contracts";
import { makeStaff } from "./world";
import { staffOf, teamStaff } from "./car";
import { news } from "./cards";
import { addFact } from "./facts";
import { philMatch } from "./capability";
import type { CareerState, Staff, StaffRole } from "./types";

/**
 * Hiring. Money is one part of an offer. The same pay lands differently at a team with a good name, a full wallet,
 * a calm garage and good tools, so every one of those systems now changes who will come to work for you.
 */
export interface OfferRead {
  chance: number;
  /** Plain-language reasons, best first. */
  why: string;
  ask: number;
}

export function readOffer(s: CareerState, teamId: string, st: Staff, salary: number, years: number): OfferRead {
  const ask = staffAsk(st);
  const pay = salary / Math.max(0.05, ask);
  const m = multiply(s, teamId, ["reputation", "funding", "cohesion", "tools", "form"]);
  const t = s.teams[teamId];
  const fit = st.phil ? philMatch(st.phil, t.concept) : 0.6;
  const loyalHold = st.teamId && st.teamId !== teamId ? 0.25 : 0;
  const lengthBonus = (years - 2) * 0.03;
  const chance = clamp(0.8 + (pay - 1) * 1.6 + (m.value - 1) * 1.4 + (fit - 0.6) * 0.3 + lengthBonus - loyalHold - (st.skill > 82 ? 0.08 : 0), 0.02, 0.98);
  return { chance: round2(chance), ask, why: whyText(m) };
}

export function offerStaff(s: CareerState, st: Staff, salary: number, years: number): { ok: boolean; message: string; notes?: string[] } {
  const r = readOffer(s, s.teamId, st, salary, years);
  const rng = rngFor(s, `offer:${st.id}:${Math.round(salary * 100)}`);
  if (!rng.chance(r.chance)) {
    const counter = round2(Math.max(salary * 1.08, r.ask * (1 + (1 - r.chance) * 0.4)));
    return { ok: false, message: `${st.name} turned it down (about ${Math.round(r.chance * 100)}% to accept). He would look again at around ${fmtMoney(counter)}. What weighs on him: ${r.why}` };
  }
  const notes = hireStaff(s, s.teamId, st.id, round2(salary), years);
  addFact(s, "hire", `${st.name} joined ${s.teamId.toUpperCase()}.`, [st.id, s.teamId], 1);
  return { ok: true, message: notes.join(" "), notes };
}

// ------------------------------------------------------------------------------ interns

export const INTERN_PAY = 0.09;
export const INTERN_ROLES: StaffRole[] = ["aero", "power", "data", "designer", "engineer", "strategy"];

/** Keep a handful of trainees on the market. */
export function refreshInternPool(s: CareerState) {
  const pool = (s.internPool ??= []).filter((id) => s.staff[id] && !s.staff[id].teamId);
  s.internPool = pool;
  const rng = new Rng(hashSeed(`interns:${s.seed}:${s.year}:${s.day}`));
  while (pool.length < 6) {
    const id = `in-${nextId(s)}`;
    const role = rng.pick(INTERN_ROLES);
    const base = makeStaff(rng, id, role, null, 30 + rng.range(0, 14), s.year);
    base.age = Math.round(rng.range(21, 27));
    base.salary = INTERN_PAY;
    base.intern = { potential: Math.round(clamp(52 + rng.gauss() * 14 + rng.range(0, 14), 40, 95)), since: s.year };
    base.known = 0.1;
    s.staff[id] = base;
    pool.push(id);
  }
}

export function signIntern(s: CareerState, id: string): { ok: boolean; message: string } {
  const st = s.staff[id];
  if (!st || !st.intern || st.teamId) return { ok: false, message: "Not available." };
  const mine = teamStaff(s, s.teamId).filter((x) => x.intern);
  const places = 1 + Math.floor(s.teams[s.teamId].facilities.factory / 2);
  if (mine.length >= places) return { ok: false, message: `You have room for ${places} trainees. A better factory makes room for more.` };
  const m = multiply(s, s.teamId, ["reputation", "tools"]);
  const rng = rngFor(s, `intern:${id}`);
  if (!rng.chance(clamp(0.6 + (m.value - 1) * 2, 0.15, 0.95))) return { ok: false, message: `${st.name} chose somewhere else. Reputation and tools decide where trainees go: ${whyText(m)}` };
  st.teamId = s.teamId;
  st.salary = INTERN_PAY;
  st.endYear = s.year + 1;
  st.tenure = 0;
  s.internPool = (s.internPool ?? []).filter((x) => x !== id);
  s.staff[id] = st;
  addFact(s, "intern", `${st.name} started as a trainee ${st.role} at ${s.teamId.toUpperCase()}.`, [st.id, s.teamId], 1);
  return { ok: true, message: `${st.name} joins as a trainee. ${fmtMoney(INTERN_PAY)} a year, and a sliver of your cap room.` };
}

/** Monthly: trainees learn faster with a good mentor, good tools and a calm team. */
export function internMonth(s: CareerState) {
  for (const st of Object.values(s.staff)) {
    if (!st.intern || !st.teamId) continue;
    const boss = staffOf(s, st.teamId, st.role === "engineer" ? "engineer" : st.role);
    const m = multiply(s, st.teamId, ["tools", "cohesion", "funding"]);
    const mentor = (boss?.skill ?? 55) / 100;
    const gap = Math.max(0, st.intern.potential - st.skill);
    st.skill = round2(st.skill + gap * 0.025 * (0.5 + mentor) * m.value);
    const t = s.teams[st.teamId];
    if (isHuman(s, st.teamId)) t.capSpent = round2(t.capSpent + INTERN_PAY / 12);
  }
}

/** Year end: a trainee either becomes a real hire at a proper salary or goes back to the market. */
export function internYearEnd(s: CareerState) {
  for (const st of Object.values(s.staff)) {
    if (!st.intern || !st.teamId) continue;
    st.age += 0;
    if (st.endYear > s.year) continue;
    if (isHuman(s, st.teamId)) {
      st.teamId = null;
      s.internPool = [...(s.internPool ?? []), st.id];
      news(s, `${st.name} finished his traineeship and moved on.`, { importance: 1, tag: "people" });
    }
  }
}

/** Offer a trainee a real job: the flag drops and he becomes a normal member of the department. */
export function promoteIntern(s: CareerState, id: string): { ok: boolean; message: string } {
  const st = s.staff[id];
  if (!st || !st.intern || st.teamId !== s.teamId) return { ok: false, message: "Not your trainee." };
  const boss = staffOf(s, s.teamId, st.role);
  if (boss && boss.skill >= st.skill) return { ok: false, message: `${boss.name} already holds that seat and is better. Promote him only to replace someone weaker, or keep him learning.` };
  const salary = round2(Math.max(staffAsk(st), 0.3));
  const notes = hireStaff(s, s.teamId, st.id, salary, 3);
  delete st.intern;
  addFact(s, "promotion", `${st.name} was promoted from trainee to ${st.role} at ${s.teamId.toUpperCase()}.`, [st.id, s.teamId], 2);
  return { ok: true, message: notes.join(" ") };
}
