import type { Compound } from "./types";

/**
 * Standing orders: the plan the player sets before the race (and can change during it). The pit wall carries them out
 * on its own, so the race is the plan meeting reality and the player is only asked about what the plan did not cover.
 */
export interface StandingOrders {
  /** Safety car or virtual safety car: box if the tyres are at least `scWear` worn. */
  scBox: boolean;
  scWear: number;
  /** Box when the tyres reach this wear (0..1). Null: no limit, the driver tells you. */
  tyreLimit: number | null;
  /** Cover a rival's real undercut threat without asking. */
  cover: boolean;
  /** Plan: box on this lap, if the first stop has not happened yet. Null: no planned lap. */
  stopLap: number | null;
  /** The compound for the planned stop. Null: the pit wall picks. */
  stopCompound: Compound | null;
  /** Hand the small calls to the strategist: these standing orders run without questions. */
  delegated: boolean;
}

export const NO_ORDERS: StandingOrders = { scBox: false, scWear: 0.3, tyreLimit: null, cover: false, stopLap: null, stopCompound: null, delegated: false };

/** What delegating to the strategist means: sensible orders for the whole race. */
export const DELEGATED: StandingOrders = { scBox: true, scWear: 0.3, tyreLimit: 0.82, cover: true, stopLap: null, stopCompound: null, delegated: true };

export function mergeOrders(base: StandingOrders, patch: Partial<StandingOrders>): StandingOrders {
  const out = { ...base, ...patch };
  out.scWear = Math.min(0.95, Math.max(0, out.scWear));
  if (out.tyreLimit !== null) out.tyreLimit = Math.min(1.2, Math.max(0.3, out.tyreLimit));
  if (out.stopLap !== null) out.stopLap = Math.max(1, Math.round(out.stopLap));
  return out;
}

/** The orders in words, for the radio and the report card. */
export function describeOrders(o: StandingOrders): string[] {
  const out: string[] = [];
  if (o.stopLap) out.push(`Box around lap ${o.stopLap}${o.stopCompound ? ` for ${o.stopCompound === "S" ? "Softs" : o.stopCompound === "M" ? "Mediums" : "Hards"}` : ""}`);
  if (o.tyreLimit !== null) out.push(`Box at ${Math.round(o.tyreLimit * 100)}% tyre wear`);
  if (o.scBox) out.push(`Safety car: box if tyres are over ${Math.round(o.scWear * 100)}% worn`);
  if (o.cover) out.push("Cover a real undercut threat");
  return out;
}
