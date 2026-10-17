import { ensureCrew, crewEffect } from "./pitcrew";
import { wearFor } from "./powertrain";
import { Rng, hashSeed } from "../sim/rng";
import { riftTrackEffect } from "./dressing";
import { TEAMS } from "../game/data";
import type { EntrySpec, TeamSpec } from "../sim/types";
import { CFG } from "./config";
import { clamp } from "./util";
import type { CareerState, Staff } from "./types";
import { rulesOf } from "./eras";
import { factorsOf } from "./factors";
import { identityOf } from "./identity";
import { launchOf } from "./attributes";
import { effCar } from "./traits";
import { attributesOf } from "./attributes";
import { designOf } from "./design";
import { climateFor } from "../game/climate";

export const baseTeam = (id: string) => TEAMS.find((t) => t.id === id) as TeamSpec;

export function staffOf(s: CareerState, teamId: string, role: Staff["role"], driverId?: string): Staff | undefined {
  for (const st of Object.values(s.staff)) if (st.teamId === teamId && !st.intern && st.role === role && (driverId === undefined || st.driverId === driverId)) return st;
  return undefined;
}

export function teamStaff(s: CareerState, teamId: string): Staff[] {
  return Object.values(s.staff).filter((x) => x.teamId === teamId);
}

/** The simulator's view of a team, built from its career state: the five area ratings plus staff and facilities. */
export function carSpec(s: CareerState, teamId: string, circuitId?: string): TeamSpec {
  const base = baseTeam(teamId);
  const t = s.teams[teamId];
  // the clock sees each area through the rulebook and (at a track) through that track
  const c = effCar(s, t, circuitId);
  const powerInit = (base.power - 0.98) / CFG.specPerSecPower;
  const mech = staffOf(s, teamId, "mechanic");
  const squad = ensureCrew(s, teamId, base.pitCrew);
  const fx = crewEffect(squad);
  // the line-up sets the rating; the mechanic chief and the factory still help a little
  const crew = clamp((fx.speed + ((mech?.skill ?? 70) - 72) / 100 * 0.12 + (t.facilities.factory - 3) * 0.01) * (teamId === s.teamId || s.humans?.includes(teamId) ? factorsOf(s, teamId).cohesion.value * factorsOf(s, teamId).talent.value : 1), 0.4, 1);
  const idn = identityOf(s, teamId);
  return {
    ...base,
    name: idn.name,
    color: idn.color,
    aero: clamp(0.98 + CFG.specPerSecAero * (0.55 * c.aero + 0.45 * c.chassis), 0.93, 1.012),
    power: clamp(0.98 + CFG.specPerSecPower * c.power, 0.93, 1.012),
    reliability: clamp(base.reliability + 0.012 * c.cooling + 0.004 * (c.power - powerInit), 0.9, 0.995),
    pitCrew: crew,
    pitFumble: clamp(fx.fumble - ((mech?.skill ?? 70) - 72) / 100 * 0.02, 0.008, 0.14),
  };
}

/** How well the car's shape suits the man in it, 0..1: a stiff, raked, aggressive car wants an aggressive driver. */
export function styleFit(s: CareerState, driverId: string, teamId: string): number {
  const dr = s.drivers[driverId];
  const t = s.teams[teamId];
  if (!dr || !t) return 0.5;
  const dsg = designOf(t);
  const carStyle = (dsg.stiffness + dsg.rake + (1 - dsg.wheelbase)) / 3;
  const drv = (attributesOf(dr).aggression - 1) / 19;
  return clamp(1 - Math.abs(carStyle - drv) * 1.4, 0, 1);
}

/** Heat and distance wear a driver down: a long hot race punishes the unfit. Returns the consistency lost. */
export function fatigueOf(s: CareerState, driverId: string, circuitId?: string): number {
  const dr = s.drivers[driverId];
  if (!dr || !circuitId) return 0;
  const air = climateFor(circuitId).air;
  const heat = clamp(((air[0] + air[1]) / 2 - 18) / 16, 0, 1.2);
  const len = s.raceLength === "full" ? 1 : s.raceLength === "half" ? 0.55 : 0.3;
  const a = attributesOf(dr);
  const fit = ((a.composure + a.determination) / 2 - 1) / 19;
  const physio = Object.values(s.staff).some((x) => x.teamId === dr.teamId && x.role === "coach") ? 0.85 : 1;
  return 0.035 * heat * len * (1.25 - fit) * physio;
}

/** A driver as the simulator sees them: base ratings plus age drift is already in the spec, tyre feel gets the team's tyre work. */
export function driverSpecFor(s: CareerState, driverId: string, teamId: string, confidence = 0.5, circuitId?: string) {
  const d = s.drivers[driverId].spec;
  const t = s.teams[teamId];
  const fit = styleFit(s, driverId, teamId);
  const form = factorsOf(s, teamId).form.value;
  return {
    ...d,
    // a driver who is at home in the car is a touch quicker (the setup work is what makes him so); a car built for another style is a handicap, and a team in form lifts everyone
    pace: clamp(d.pace + 0.0012 * (confidence - 0.6) + 0.0012 * (fit - 0.5) + 0.0006 * (form - 1), 0.9, 1.004),
    tyreMgmt: clamp(d.tyreMgmt + CFG.tyreMgmtPerSec * effCar(s, t, circuitId).tyres + 0.05 * (fit - 0.5), 0.3, 0.97),
    fuelSave: (attributesOf(s.drivers[driverId]).fuel - 1) / 19,
    consistency: clamp(d.consistency + (confidence - 0.5) * 0.06, 0.4, 0.97),
  };
}

/** Rank 1..n of every team by the lap-time worth of its whole car (higher is better). */
export function carRating(s: CareerState, teamId: string): number {
  const spec = carSpec(s, teamId);
  return (spec.aero - 0.98) / CFG.specPerSecAero * 0.55 + (spec.power - 0.98) / CFG.specPerSecPower * 0.45;
}

export function teamRanking(s: CareerState): string[] {
  return Object.keys(s.teams).sort((a, b) => carRating(s, b) - carRating(s, a));
}

/** What the pre-season test shows: the true order blurred by fuel loads and hidden runs. Same blur all week, a new one each year. */
export function noisyRanking(s: CareerState, key = "test", sigma = 0.3): string[] {
  const rng = new Rng(hashSeed(`noisy:${s.seed}:${s.year}:${key}`));
  const noise: Record<string, number> = {};
  for (const id of Object.keys(s.teams).sort()) noise[id] = rng.gauss() * sigma;
  return Object.keys(s.teams).sort((a, b) => carRating(s, b) + noise[b] - (carRating(s, a) + noise[a]));
}

/** Constructors' standing from points (ties broken by car rating), 1 is the leader. */
export function standingsRank(s: CareerState): string[] {
  return Object.keys(s.teams).sort((a, b) => s.standings.teams[b] - s.standings.teams[a] || carRating(s, b) - carRating(s, a));
}

export function activeDrivers(s: CareerState, teamId: string): string[] {
  return Object.values(s.drivers)
    .filter((d) => d.teamId === teamId && !d.retired)
    .map((d) => d.id);
}

/** Build the 22 sim entries for a weekend. */
export function entriesFor(s: CareerState, confidence: Record<string, number> = {}, setupEffect?: Record<string, { aero: number; power: number; tyre: number; consistency: number }>, circuitId?: string): EntrySpec[] {
  const out: EntrySpec[] = [];
  const rules = rulesOf(s);
  const order = standingsRank(s);
  const dw = rules.driverWeight ?? 1;
  for (const teamId of Object.keys(s.teams)) {
    const team = carSpec(s, teamId, circuitId);
    if (rules.ballast) {
      // the leaders carry weight: seconds per lap, largest for the top of the table
      const r = order.indexOf(teamId);
      const sec = rules.ballast * Math.max(0, 1 - r / Math.max(1, order.length - 1));
      team.aero = clamp(team.aero - sec * CFG.specPerSecAero * 0.5, 0.93, 1.012);
      team.power = clamp(team.power - sec * CFG.specPerSecPower * 0.5, 0.93, 1.012);
    }
    const fx = setupEffect?.[teamId];
    if (fx) {
      team.aero = clamp(team.aero + fx.aero, 0.93, 1.012);
      team.power = clamp(team.power + fx.power, 0.93, 1.012);
    }
    for (const id of activeDrivers(s, teamId)) {
      const driver = driverSpecFor(s, id, teamId, confidence[id] ?? 0.6, circuitId);
      driver.consistency = clamp(driver.consistency - fatigueOf(s, id, circuitId), 0.3, 0.97);
      if (dw !== 1) driver.pace = clamp(0.985 + (driver.pace - 0.985) * dw, 0.93, 1.002);
      if (fx) {
        driver.tyreMgmt = clamp(driver.tyreMgmt + fx.tyre, 0.3, 0.97);
        driver.consistency = clamp(driver.consistency + fx.consistency, 0.4, 0.97);
      }
      const dr = s.drivers[id];
      if (dr) {
        driver.launch = launchOf(dr);
        // how he feels shows on track: a driver muttering to the press is not fully focused, and a happy one is
        if (dr.gStage >= 2) driver.consistency = clamp(driver.consistency - 0.015 * (dr.gStage - 1), 0.3, 0.97);
        if (dr.gStage >= 4) driver.pace = clamp(driver.pace - 0.0015 * (dr.gStage - 3), 0.93, 1.002);
        if (dr.morale < 0.35) driver.consistency = clamp(driver.consistency - 0.03, 0.3, 0.97);
        if (dr.morale > 0.8) driver.consistency = clamp(driver.consistency + 0.01, 0.3, 0.97);
        if (teamId === s.teamId) {
          const rf = riftTrackEffect(s);
          driver.consistency = clamp(driver.consistency - rf.consistency, 0.3, 0.97);
          driver.pace = clamp(driver.pace - rf.pace, 0.93, 1.002);
        }
      }
      out.push({ id, driver, team, human: teamId === s.teamId, ...(teamId === s.teamId ? { wear: wearFor(s, id) } : {}) });
    }
  }
  return out;
}
