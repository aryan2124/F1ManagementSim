import { Rng, hashSeed } from "../sim/rng";
import type { CareerState } from "./types";

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const round2 = (v: number) => Math.round(v * 100) / 100;

/** True for the player team and, in a multiplayer league, every other human-run team. AI logic skips these. */
export const isHuman = (s: CareerState, id: string | null | undefined): boolean => !!id && (id === s.teamId || !!s.humans?.includes(id));

/** A fresh rng for a named purpose today. Pure: the same state and key always give the same stream. */
export function rngFor(s: CareerState, key: string): Rng {
  return new Rng(hashSeed(`${s.seed}:${s.day}:${s.uid}:${key}`));
}

/** The next id number, counted inside the state so saves stay deterministic. */
export function nextId(s: CareerState): number {
  s.uid += 1;
  return s.uid;
}

// ---------------------------------------------------------------- dates (epoch days, UTC)

export const MS_DAY = 86400000;
export const epochDay = (y: number, m: number, d: number) => Math.round(Date.UTC(y, m - 1, d) / MS_DAY);
export function ymd(day: number): { y: number; m: number; d: number; wd: number } {
  const dt = new Date(day * MS_DAY);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), wd: dt.getUTCDay() };
}
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MONTH_NAMES = MON;
export function fmtDay(day: number, withWeekday = false): string {
  const { m, d, wd, y } = ymd(day);
  return `${withWeekday ? WD[wd] + " " : ""}${d} ${MON[m - 1]}${withWeekday ? "" : " " + y}`;
}
export function monthIndex(label: string): number {
  return MON.findIndex((m) => label.includes(m)) + 1;
}

export function fmtMoney(v: number, digits = 1): string {
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toFixed(digits)}m`;
}

/** A car gain in seconds a lap (positive is faster) shown the way a lap time reads: minus is faster, plus is slower. */
export function lapDelta(gain: number): string {
  const d = -Math.round(gain * 100) / 100;
  return `${d > 0 ? "+" : d < 0 ? "-" : ""}${Math.abs(d).toFixed(2)}`;
}
/** A range of gains shown as lap time change, for example "-0.07 to -0.03 s" for a part that makes the car faster. */
export function fmtRange(lo: number, hi: number): string {
  return `${lapDelta(hi)} to ${lapDelta(lo)} s`;
}
