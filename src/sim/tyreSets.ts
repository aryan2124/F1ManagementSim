import type { Compound } from "./types";

/**
 * One physical set of tyres. A weekend gives each driver a handful, and every set remembers how much of its life has been used,
 * in practice, in qualifying and in the race. A set that has never run is fresh (runs = 0).
 */
export interface TyreSet {
  id: string;
  compound: Compound;
  /** Fraction of its life used, 0 (new) upward. */
  wear: number;
  /** How many times it has been fitted. */
  runs: number;
  /** Where it has been used, in order (FP1, Q1, RACE...). */
  log: string[];
}

export type Alloc = { S: number; M: number; H: number };

/** Wet sets that come on top of the dry allocation. */
export const WET_ALLOC = { I: 3, W: 2 } as const;

export function makeSets(a: Alloc, wet: { I: number; W: number } = WET_ALLOC): TyreSet[] {
  const out: TyreSet[] = [];
  for (const c of ["S", "M", "H"] as const) for (let i = 1; i <= a[c]; i++) out.push({ id: `${c}${i}`, compound: c, wear: 0, runs: 0, log: [] });
  for (const c of ["I", "W"] as const) for (let i = 1; i <= wet[c]; i++) out.push({ id: `${c}${i}`, compound: c, wear: 0, runs: 0, log: [] });
  return out;
}

export const cloneSets = (l: TyreSet[]): TyreSet[] => l.map((x) => ({ ...x, log: [...x.log] }));

/** Counts of fresh sets by compound (the old inventory shape, still used by the pit wall header). */
export function freshCounts(l: TyreSet[]): Record<Compound, number> {
  const out: Record<Compound, number> = { S: 0, M: 0, H: 0, I: 0, W: 0 };
  for (const x of l) if (x.runs === 0) out[x.compound]++;
  return out;
}

/** The best set to hand out when the choice is left to the team: a fresh one, else the least worn used one. */
export function bestSet(l: TyreSet[], compound: Compound, skip?: string): TyreSet | undefined {
  const pool = l.filter((x) => x.compound === compound && x.id !== skip);
  const fresh = pool.find((x) => x.runs === 0);
  if (fresh) return fresh;
  return [...pool].sort((a, b) => a.wear - b.wear).find((x) => x.wear < 0.8);
}

export const findSet = (l: TyreSet[], id: string | undefined): TyreSet | undefined => (id ? l.find((x) => x.id === id) : undefined);

/** The label shown next to a set: NEW, or how worn it is. */
export const setLabel = (x: TyreSet): string => (x.runs === 0 ? "NEW" : `${Math.round(Math.min(1, x.wear) * 100)}% worn`);

/** A tyre pool for a session that was not given one (quick weekends and tests). */
export const defaultAlloc: Alloc = { S: 4, M: 5, H: 4 };

/** What the engineers would put on for a qualifying run: save a new soft in Q1 when a lightly used one will do, new softs for Q2 and Q3. */
export function adviseQuali(l: TyreSet[], segment: number, wet: boolean): TyreSet | undefined {
  const pick = (c: Compound) => {
    const ok = l.filter((x) => x.compound === c && !(x.runs > 0 && x.wear >= 0.8));
    const used = ok.filter((x) => x.runs > 0 && x.wear <= 0.45).sort((a, b) => a.wear - b.wear)[0];
    const fresh = ok.find((x) => x.runs === 0);
    return segment <= 1 ? used ?? fresh ?? ok[0] : fresh ?? used ?? ok[0];
  };
  return wet ? pick("I") ?? pick("W") : pick("S") ?? pick("M");
}

/** Advice for a pit stop: the tyre for the stint, from the laps left and what the car has been doing. */
export function advisePit(l: TyreSet[], lapsLeft: number, wearPerLap: number, wet: boolean, skip?: string): { set?: TyreSet; why: string } {
  if (wet) return { set: bestSet(l, "I", skip) ?? bestSet(l, "W", skip), why: "It is wet: the intermediate is the right tyre." };
  const need = lapsLeft * wearPerLap;
  const order: Compound[] = need < 0.55 ? ["S", "M", "H"] : need < 0.85 ? ["M", "H", "S"] : ["H", "M", "S"];
  for (const c of order) {
    const set = bestSet(l, c, skip);
    if (set) return { set, why: `${lapsLeft} laps to go: ${c === "S" ? "the soft is quickest and should last" : c === "M" ? "the medium should see it home" : "the hard is the safe choice for this stint"}.` };
  }
  return { why: "Nothing suitable is left in the garage." };
}
