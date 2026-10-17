import { CALENDAR_2026 } from "../game/circuits";
import { CFG } from "./config";
import { epochDay, monthIndex } from "./util";
import type { CareerState } from "./types";

/** The race calendar for a year: same circuits and dates every season (design simplification), as epoch days. */
export function buildCalendar(year: number): CareerState["calendar"] {
  return CALENDAR_2026.map((c, i) => {
    const m = monthIndex(c.date ?? "");
    const d = parseInt(c.date ?? "1", 10);
    return { round: i + 1, circuitId: c.id, day: epochDay(year, m, d), sprint: !!c.sprint };
  });
}

export const summerStart = (year: number) => epochDay(year, CFG.summerShutdown.month, CFG.summerShutdown.day);
export const summerEnd = (year: number) => summerStart(year) + CFG.summerShutdown.days - 1;
export const winterStart = (year: number) => epochDay(year, CFG.winterShutdown.month, CFG.winterShutdown.day);
export const winterEnd = (year: number) => winterStart(year) + CFG.winterShutdown.days - 1;

export function inSummerBreak(day: number, year: number): boolean {
  return day >= summerStart(year) && day <= summerEnd(year);
}
/** The Christmas closure crosses the new year, so check both years. */
export function inWinterBreak(day: number, year: number): boolean {
  return (day >= winterStart(year) && day <= winterEnd(year)) || (day >= winterStart(year - 1) && day <= winterEnd(year - 1));
}
/** No design or building work may happen in either closure. */
export const factoryClosed = (day: number, year: number) => inSummerBreak(day, year) || inWinterBreak(day, year);

export const newYearDay = (year: number) => epochDay(year, 1, 1);
export const launchDay = (year: number) => epochDay(year, CFG.launchDay.month, CFG.launchDay.day);
export const testDay = (year: number) => epochDay(year, CFG.testDay.month, CFG.testDay.day);

/** The race weekend a day belongs to (Thursday travel to Sunday), if any. */
export function weekendOf(s: Pick<CareerState, "calendar">, day: number): { idx: number; offset: number } | null {
  for (let i = 0; i < s.calendar.length; i++) {
    const off = day - s.calendar[i].day; // negative before the race
    if (off >= -3 && off <= 0) return { idx: i, offset: off };
  }
  return null;
}

export function nextRace(s: Pick<CareerState, "calendar" | "round">) {
  return s.calendar[s.round] ?? null;
}

export function daysTo(day: number, target: number) {
  return target - day;
}
