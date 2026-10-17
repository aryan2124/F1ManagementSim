import { clamp, round2 } from "./util";
import type { CareerState, DriverRole, DriverState } from "./types";
import { addCause } from "./people";
import { news, ticker } from "./cards";
import { driversOf } from "./finance";

/**
 * A driver's standing inside a team.
 *
 * Every driver has a stature: what he has earned (titles, wins, years in the sport) mixed with how quick he is right
 * now. Next to his team-mate this tells us what he expects to be called: the clear number one, an equal, or happy to
 * be the number two. If the team calls him something less than that, he is unhappy, says so, and keeps a memory of the
 * slight. Calling a champion "number two" next to a young team-mate is how you lose a driver.
 */

export interface Slight {
  day: number;
  kind: string;
  text: string;
  weight: number;
}

export interface DriverStatus {
  /** 0..1, set when the career starts and moved a little by results. */
  stature: number;
  /** What he thinks he should be called next to his team-mate. */
  expects: DriverRole;
  /** Recent things the team did that bothered him, newest last. They fade. */
  slights: Slight[];
  /** The day of the last time he reached out, so he does not nag. */
  lastReach?: number;
}

const egoOf = (d: DriverState) => (d.spec.psyche as { ego?: number } | undefined)?.ego ?? 0.5;
const loyaltyOf = (d: DriverState) => (d.spec.psyche as { loyalty?: number } | undefined)?.loyalty ?? 0.5;

/** What he has earned. */
export function careerScore(d: DriverState): number {
  const r = d.rec;
  const titles = r?.wdc.length ?? d.titles;
  const wins = r?.p1 ?? d.wins;
  const pods = (r ? r.p1 + r.p2 + r.p3 : d.podiums) || 0;
  return clamp(titles * 0.28 + wins / 90 + pods / 420 + d.starts / 1900, 0, 1);
}

export function statureOf(d: DriverState): number {
  const pace = clamp((d.spec.pace - 0.98) / 0.02, 0, 1);
  return round2(clamp(careerScore(d) * 0.62 + pace * 0.38, 0, 1));
}

export function ensureStatus(d: DriverState): DriverStatus {
  if (!d.stat) d.stat = { stature: statureOf(d), expects: "equal", slights: [] };
  return d.stat;
}

/** What he expects to be, next to this team-mate. */
export function expectedRole(d: DriverState, mate: DriverState | undefined): DriverRole {
  if (!mate) return "equal";
  const gap = 0.6 * (careerScore(d) - careerScore(mate)) + 0.4 * (statureOf(d) - statureOf(mate));
  const ego = egoOf(d);
  const claim = 0.34 - (ego - 0.5) * 0.2; // an egotist wants the label for less
  const accept = -0.34 - (0.5 - ego) * 0.2 - 0.12; // and takes the junior seat only when the gap is plain
  if (gap >= claim) return "number1";
  if (gap <= accept) return "number2";
  return "equal";
}

const RANK: Record<DriverRole, number> = { number2: 0, equal: 1, number1: 2 };

/** How badly the label he was given misses what he expects, -1 (better than expected) to 1 (far below). */
export function roleGap(d: DriverState, mate: DriverState | undefined): number {
  const want = expectedRole(d, mate);
  const miss = RANK[want] - RANK[d.role];
  if (miss <= 0) return d.role === "number1" && want !== "number1" ? -0.2 : 0;
  return miss === 1 ? 0.55 : 1;
}

/** The first hour of a career: roles follow stature, so the champion is not an equal of a pay driver. */
export function initRoles(s: CareerState, onlyEqual = false, skipTeam?: string): string[] {
  const changed: string[] = [];
  const teams = new Set(Object.values(s.drivers).filter((d) => d.teamId && !d.retired).map((d) => d.teamId as string));
  for (const t of teams) {
    const [a, b] = driversOf(s, t);
    if (!a || !b || t === skipTeam) continue;
    if (onlyEqual && !(a.role === "equal" && b.role === "equal")) continue;
    const ra = expectedRole(a, b);
    const rb = expectedRole(b, a);
    a.role = ra === "number1" ? "number1" : "equal";
    b.role = rb === "number1" ? "number1" : "equal";
    if (a.role === "number1" && b.role === "equal") b.role = "number2";
    if (b.role === "number1" && a.role === "equal") a.role = "number2";
    ensureStatus(a).expects = ra;
    ensureStatus(b).expects = rb;
    const word = (r: DriverRole) => (r === "number1" ? "number one" : r === "number2" ? "number two" : "equal");
    const ar: DriverRole = a.role;
    const br: DriverRole = b.role;
    if (ar !== "equal" || br !== "equal") changed.push(`${t}:${a.spec.name} is ${word(ar)}, ${b.spec.name} is ${word(br)}`);
  }
  return changed;
}

/** The player changes who is number one. The driver who lost out reacts at once, and the winner may not be pleased either. */
export function onRoleChange(s: CareerState, d: DriverState, before: DriverRole, after: DriverRole): void {
  const st = ensureStatus(d);
  const mate = d.teamId ? driversOf(s, d.teamId).find((x) => x.id !== d.id) : undefined;
  st.expects = expectedRole(d, mate);
  if (before === after || d.teamId !== s.teamId) return;
  const drop = RANK[before] - RANK[after];
  const missNow = roleGap(d, mate);
  const amb = 0.5 + egoOf(d) * 0.8;
  if (drop > 0) {
    const w = clamp((0.14 * drop + missNow * 0.22) * amb, 0.05, 0.5);
    addCause(d, "role", w);
    d.grievance = round2(clamp(d.grievance + w, 0, 1));
    d.trust = clamp(d.trust - 0.05 * drop * amb, 0, 1);
    d.morale = clamp(d.morale - 0.06 * drop * amb, 0, 1);
    st.slights.push({ day: s.day, kind: "role", text: after === "number2" ? "made the number two driver" : "no longer the lead driver", weight: w });
    news(s, `${d.spec.name} is reported to be unhappy at being treated as ${after === "number2" ? "the second driver" : "an equal"} at ${d.teamId?.toUpperCase()}.`, { importance: 2, cause: "A change of status inside the team", tag: "people" });
    ticker(s, `${d.spec.name} is not happy about his new status.`, 2);
  } else if (drop < 0) {
    d.morale = clamp(d.morale + 0.04, 0, 1);
    d.grievance = round2(clamp(d.grievance - 0.06, 0, 1));
  }
  // and the team-mate watches the change
  if (mate) {
    const mst = ensureStatus(mate);
    mst.expects = expectedRole(mate, d);
  }
}

/** Slights fade after a couple of months. */
export function fadeSlights(s: CareerState): void {
  for (const d of Object.values(s.drivers)) {
    if (!d.stat) continue;
    d.stat.slights = d.stat.slights.filter((x) => s.day - x.day < 70);
    d.stat.stature = round2(d.stat.stature + (statureOf(d) - d.stat.stature) * 0.1);
  }
}

export const ROLE_WORD: Record<DriverRole, string> = { number1: "NUMBER ONE", equal: "EQUAL", number2: "NUMBER TWO" };

export { egoOf, loyaltyOf };
