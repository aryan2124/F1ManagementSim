import { sendLetter } from "./cards";
import type { CareerState, DriverWear, GridDrop, PartKind, WeekendState } from "./types";
import { clamp } from "./util";

/** Units a driver may use in a season before the grid penalty starts, and the penalty for each unit beyond that. */
export const ALLOWANCE: Record<PartKind, number> = { pu: 4, gb: 5 };
export const DROP: Record<PartKind, number> = { pu: 10, gb: 5 };
/** Extra places for swapping a unit after parc ferme, which the rules forbid. */
export const PARC_BREACH = 5;
export const PART_NAME: Record<PartKind, string> = { pu: "power unit", gb: "gearbox" };

export function wearOf(s: CareerState, id: string): DriverWear {
  s.wear ??= {};
  let w = s.wear[id];
  if (!w || w.year !== s.year) {
    // a new season starts a new allowance, and the car begins on fresh units
    w = { year: s.year, pu: { n: 1, life: 1 }, gb: { n: 1, life: 1 } };
    s.wear[id] = w;
  }
  return w;
}

/** The numbers the race sim needs for a driver's car. */
export function wearFor(s: CareerState, id: string): { pu: number; gb: number } {
  const w = wearOf(s, id);
  return { pu: w.pu.life, gb: w.gb.life };
}

/** The places a swap would cost right now, with the reasons. */
export function swapCost(s: CareerState, id: string, part: PartKind, inParc: boolean): { places: number; reasons: string[] } {
  const w = wearOf(s, id);
  const reasons: string[] = [];
  let places = 0;
  if (w[part].n + 1 > ALLOWANCE[part]) {
    places += DROP[part];
    reasons.push(`unit ${w[part].n + 1} of an allowance of ${ALLOWANCE[part]}: ${DROP[part]} places`);
  }
  if (inParc) {
    places += PARC_BREACH;
    reasons.push(`parc ferme breach: ${PARC_BREACH} places`);
  }
  return { places, reasons };
}

function addDrop(map: Record<string, GridDrop[]>, id: string, d: GridDrop) {
  (map[id] ??= []).push(d);
}

export function totalDrop(list: GridDrop[] | undefined): number {
  return (list ?? []).reduce((a, x) => a + x.places, 0);
}

/**
 * Fit a new unit. Before the weekend's race the penalty lands on this weekend's grid, after it on the next one.
 * Returns the places lost.
 */
export function fitNew(s: CareerState, id: string, part: PartKind, opts: { forNextRace?: boolean } = {}): number {
  const ws = s.weekend;
  const live = !!ws && ws.stage !== "done" && !opts.forNextRace;
  const inParc = live && !!ws!.parc;
  const { places, reasons } = swapCost(s, id, part, inParc);
  const w = wearOf(s, id);
  w[part].n += 1;
  w[part].life = 1;
  if (ws?.dead?.[id]) {
    ws.dead[id] = ws.dead[id].filter((x) => x !== part);
    if (!ws.dead[id].length) delete ws.dead[id];
  }
  if (places > 0) {
    const why = `new ${PART_NAME[part]} (${reasons.join(", ")})`;
    if (live) addDrop((ws!.drops ??= {}), id, { places, why });
    else addDrop((s.gridDrops ??= {}), id, { places, why });
  }
  return places;
}

/** A unit has blown. It is dead until it is replaced. */
export function markDead(s: CareerState, id: string, part: PartKind) {
  wearOf(s, id)[part].life = 0;
  const ws = s.weekend;
  if (ws && ws.stage !== "done") {
    const list = ((ws.dead ??= {})[id] ??= []);
    if (!list.includes(part)) list.push(part);
  }
}

export function deadOf(ws: WeekendState | null, id: string): PartKind[] {
  return ws?.dead?.[id] ?? [];
}

/** The team fits whatever is dead. Used when the weekend is simulated for the player or the clock runs. */
export function fitAllDead(s: CareerState) {
  const ws = s.weekend;
  if (!ws?.dead) return;
  for (const id of Object.keys(ws.dead)) for (const part of [...ws.dead[id]]) fitNew(s, id, part);
}

/** Start of a weekend: carried penalties arrive, and the odd rival changes an engine. */
export function openWeekendPenalties(s: CareerState, ws: WeekendState, rng: { next(): number; pick<T>(a: readonly T[]): T }) {
  ws.drops = {};
  if (s.gridDrops) {
    for (const [id, list] of Object.entries(s.gridDrops)) if (list.length) ws.drops[id] = [...list];
    s.gridDrops = {};
  }
  // the AI cars: now and then a rival takes a new power unit beyond the allowance
  if (rng.next() < 0.22) {
    const rivals = Object.values(s.drivers).filter((d) => d.teamId && d.teamId !== s.teamId);
    if (rivals.length) {
      const d = rng.pick(rivals);
      addDrop(ws.drops, d.id, { places: DROP.pu, why: "new power unit" });
    }
  }
}

/** How a race weekend wears the units. A blown one is dead already. */
export function wearAfterRace(s: CareerState, ids: string[], kind: "race" | "sprint") {
  const f = kind === "race" ? 1 : 0.35;
  for (const id of ids) {
    const w = wearOf(s, id);
    const h = ((id.length * 7 + s.round * 13 + s.year) % 10) / 100; // a little variety between cars
    w.pu.life = clamp(w.pu.life - f * (0.15 + h * 0.5), 0, 1);
    w.gb.life = clamp(w.gb.life - f * (0.11 + h * 0.4), 0, 1);
  }
}

/** A short line per driver for the screens. */
export function wearLine(s: CareerState, id: string): string {
  const w = wearOf(s, id);
  return `PU ${w.pu.n}/${ALLOWANCE.pu} ${Math.round(w.pu.life * 100)}% | gearbox ${w.gb.n}/${ALLOWANCE.gb} ${Math.round(w.gb.life * 100)}%`;
}

/** After a race: any unit that died is replaced at the factory, and the penalty waits for the next race. Worn out ones are replaced when the engineers say so. */
export function afterRaceService(s: CareerState, ids: string[]) {
  for (const id of ids) {
    const name = s.drivers[id]?.spec.name ?? id;
    for (const part of ["pu", "gb"] as const) {
      const w = wearOf(s, id);
      if (w[part].life <= 0.001) {
        const places = fitNew(s, id, part, { forNextRace: true });
        sendLetter(s, { from: "Chief mechanic", role: "Garage", subject: `${name}: new ${PART_NAME[part]}`, body: `The ${PART_NAME[part]} on ${name}'s car is dead. A fresh one is fitted for the next race.${places ? ` That is unit ${wearOf(s, id)[part].n}, so he takes a ${places} place grid penalty at the next race.` : " It is within the season allowance, so there is no penalty."}` });
      }
    }
  }
}
