import { juniorToDriver } from "./contracts";
import { prospectToDriver, f1Eligible } from "./academy";
import { news, sendLetter } from "./cards";
import { rosterOf } from "./finance";
import { baseTeam } from "./car";
import { clamp, isHuman, rngFor } from "./util";
import type { CareerState, DriverState } from "./types";

/**
 * Health and the reserve bench. A race driver can be laid up by illness (rolled before a race weekend)
 * or by a heavy crash (rolled from the crash record after the race). Laid-up drivers drop out of
 * `driversOf` / `activeDrivers`, so the entry list, the standings and the money all read a normal
 * two-car team; a stand-in is signed for the gap and carries the team's colours and its points.
 *
 * Everyone is rolled the same way, human team or AI team, from the seed, so a replay is identical.
 */

export const isOut = (d: DriverState) => !!d.out && d.out.races > 0;

/** Chance a driver falls ill before a given race. Low, a little higher when he is unhappy. */
export const illnessChance = (d: DriverState) => clamp(0.006 + (0.55 - d.morale) * 0.012, 0.003, 0.016);

/** From the crash impact (0..1.2): the chance it hurts him badly enough to miss races. */
export const injuryChance = (impact: number) => clamp((impact - 0.7) * 2.5, 0, 1);

const raceMiss = (r: number, impact: number) => 1 + Math.floor(r * (1 + impact * 3));

function laidUp(s: CareerState, d: DriverState, cause: "illness" | "injury", races: number, from: number, label: string) {
  d.out = { cause, races, from, year: s.year, label };
  const t = d.teamId;
  const mine = t === s.teamId || (s.humans && t && isHuman(s, t));
  const plural = races === 1 ? "one race" : `${races} races`;
  news(s, `${d.spec.name} is out for ${plural}: ${label}.`, { importance: mine ? 3 : 2, cause: cause === "illness" ? "Illness" : "Injury", tag: "health" });
  if (mine) {
    sendLetter(s, {
      from: "Team doctor",
      role: "Medical",
      subject: `${d.spec.name}: ${label}`,
      body: `${d.spec.name} will miss ${plural}. ${cause === "illness" ? "He has been told to rest and is not fit to drive." : "The medical delegate has not cleared him to drive."} The team has to name a stand-in; see the bench.`,
    });
  }
}

/** The best cover for a team with a gap: its own reserve prospect, then the best free driver, then a pool junior. */
export function pickStandIn(s: CareerState, teamId: string, taken: Set<string>): DriverState | null {
  const human = isHuman(s, teamId);
  const reserve = Object.values(s.academy.prospects)
    .filter((p) => p.owner === teamId && p.status === "academy" && p.reserve && f1Eligible(s, p) && !taken.has(p.id))
    .sort((a, b) => b.confidence - a.confidence)[0];
  if (reserve) {
    const d = prospectToDriver(s, reserve);
    d.id = `sub-${reserve.id}-${s.year}`;
    d.spec = { ...d.spec, id: d.id };
    d.sub = { for: "", was: "prospect", cold: false, team: teamId };
    return d;
  }
  const free = s.freeDrivers.map((x) => s.drivers[x]).filter((d) => d && !d.retired && !d.out && !taken.has(d.id)).sort((a, b) => b.spec.pace - a.spec.pace)[0];
  if (free) {
    free.sub = { for: "", was: "free", cold: true, team: teamId };
    return free;
  }
  const j = [...s.pool].filter((x) => !x.owner || x.owner === teamId).sort((a, b) => b.pace - a.pace)[0];
  if (j) {
    const d = juniorToDriver(s, j);
    d.id = `sub-${j.id}-${s.year}`;
    d.spec = { ...d.spec, id: d.id };
    d.sub = { for: "", was: "pool", cold: !human, team: teamId };
    return d;
  }
  return null;
}

/** Make sure every team that has lost a driver to illness or injury has a stand-in. Safe to call repeatedly. */
export function coverGaps(s: CareerState): void {
  for (const teamId of Object.keys(s.teams)) {
    const roster = rosterOf(s, teamId);
    const gone = roster.filter((d) => isOut(d));
    for (const hurt of gone) {
      if (roster.some((d) => d.sub?.for === hurt.id)) continue;
      const taken = new Set(roster.map((d) => d.id));
      const sub = pickStandIn(s, teamId, taken);
      if (!sub) continue;
      sub.sub = { ...(sub.sub as NonNullable<DriverState["sub"]>), for: hurt.id };
      sub.teamId = teamId;
      sub.salary = 0.2;
      sub.endYear = s.year;
      sub.retired = false;
      if (sub.sub.was === "free") s.freeDrivers = s.freeDrivers.filter((x) => x !== sub.id);
      if (sub.sub.was === "pool") {
        s.pool = s.pool.filter((p) => !sub.id.startsWith(`sub-${p.id}-`));
      }
      s.drivers[sub.id] = sub;
      roster.push(sub);
      const mine = teamId === s.teamId || (s.humans && isHuman(s, teamId));
      news(s, `${sub.spec.name} steps in for ${hurt.spec.name} at ${baseTeam(teamId).name}.`, { importance: mine ? 3 : 2, cause: "Stand-in", tag: "health" });
      if (mine) {
        sendLetter(s, {
          from: "Team principal's office",
          role: "Bench",
          subject: `${sub.spec.name} covers for ${hurt.spec.name}`,
          body: `${sub.spec.name} drives while ${hurt.spec.name} is out.${sub.sub.cold ? " Nobody kept him ready, so expect a rusty first weekend." : " He has been in the simulator all year and knows the car."}`,
        });
      }
    }
  }
}

/** Before a weekend: roll illness for everyone still fit, then cover any gap. */
export function rollHealth(s: CareerState, round: number): void {
  const ids = Object.values(s.drivers).filter((d) => d.teamId && !d.retired && !d.sub && !isOut(d)).map((d) => d.id).sort();
  for (const id of ids) {
    const d = s.drivers[id];
    const r = rngFor(s, `ill:${round}:${id}`);
    if (r.next() < illnessChance(d)) laidUp(s, d, "illness", r.next() < 0.8 ? 1 : 2, round, r.next() < 0.5 ? "a stomach bug" : "a fever");
  }
  coverGaps(s);
}

/** After a race: heavy crashes may hurt, then one more race is ticked off for everyone who was out for this one. */
export function healthAfterRace(s: CareerState, round: number, hurt: Record<string, number> = {}): void {
  for (const d of Object.values(s.drivers)) {
    if (!d.out || d.out.races <= 0 || d.out.from > round) continue;
    d.out.races -= 1;
    if (d.out.races <= 0) {
      const mine = d.teamId === s.teamId || (s.humans && d.teamId && isHuman(s, d.teamId));
      news(s, `${d.spec.name} is cleared to drive again.`, { importance: mine ? 3 : 1, cause: "Recovery", tag: "health" });
      if (mine) sendLetter(s, { from: "Team doctor", role: "Medical", subject: `${d.spec.name} is fit`, body: `${d.spec.name} has passed the medical and is back in the car.` });
    }
  }
  endStints(s);
  for (const id of Object.keys(hurt).sort()) {
    const d = s.drivers[id];
    if (!d || !d.teamId || d.sub || isOut(d)) continue;
    const r = rngFor(s, `hurt:${round}:${id}`);
    if (r.next() < injuryChance(hurt[id])) laidUp(s, d, "injury", raceMiss(r.next(), hurt[id]), round + 1, hurt[id] > 1 ? "a heavy crash, concussion and a fractured wrist" : "bruised ribs from the impact");
  }
  coverGaps(s);
}

/** A stand-in goes home once the driver he covered is fit again. Points he scored stay on the board. */
export function endStints(s: CareerState): void {
  for (const d of Object.values(s.drivers)) {
    if (!d.sub || !d.teamId) continue;
    const covered = s.drivers[d.sub.for];
    if (covered && isOut(covered)) continue;
    const was = d.sub.was;
    delete d.sub;
    d.teamId = null;
    d.salary = 0;
    if (was === "free") s.freeDrivers.push(d.id);
    else d.retired = true; // a one-off: kept in the record books, not on the market
  }
}

/** Season end: everyone heals, every stand-in goes home. */
export function healYearEnd(s: CareerState): void {
  for (const d of Object.values(s.drivers)) {
    if (d.out) {
      d.out.races = 0;
      delete d.out;
    }
  }
  endStints(s);
}
