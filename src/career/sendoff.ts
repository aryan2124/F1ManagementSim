import type { CareerState } from "./types";

/**
 * Who does donuts after the flag on the last race of the season: the driver who will be world champion once this
 * race's points are in, and anyone who has announced his retirement. Car ids are driver ids in the career game.
 */
export function donutDrivers(s: CareerState, points: Record<string, number>, ran: string[]): string[] {
  const out: string[] = [];
  if (s.round !== s.calendar.length - 1) return out;
  const totals: Record<string, number> = { ...s.standings.drivers };
  for (const [id, p] of Object.entries(points)) totals[id] = (totals[id] ?? 0) + p;
  const champ = Object.entries(totals).filter(([id]) => ran.includes(id) && s.drivers[id]).sort((a, b) => b[1] - a[1])[0];
  if (champ) out.push(champ[0]);
  for (const id of ran) if (s.drivers[id]?.retiring === s.year && !out.includes(id)) out.push(id);
  return out.slice(0, 3);
}
