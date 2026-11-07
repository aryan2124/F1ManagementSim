import { rulesOf } from "./eras";
import { nodeOf, treeOf } from "./ctree";
import { carLapGain } from "./treeplay";
import type { CareerState } from "./types";

/** Twin chassis: new parts cost this much more, because there are two chassis to build for. */
export const TWIN_COST = 1.3;
export const twinLive = (s: CareerState) => !!rulesOf(s).tunnelBank;

export interface TwinRow { car: "A" | "B"; parts: string[]; gain: number }

/** What each chassis would give at this circuit: its parts and the lap time they are worth (seconds, more is faster). */
export function twinRows(s: CareerState): TwinRow[] {
  const t = s.teams[s.teamId];
  const tr = treeOf(s, t);
  const ci = s.weekend?.circuitId ?? s.calendar[s.round]?.circuitId ?? "";
  return (["A", "B"] as const).map((car) => ({
    car,
    parts: Object.values(tr.parts).filter((p) => (car === "A" ? p.onA : p.onB)).map((p) => nodeOf(tr, p.id)?.name ?? p.id),
    gain: carLapGain(t, car, ci),
  }));
}

/** After practice the team picks the chassis both cars race on. It is the one change the parc ferme allows, and it is free. */
export function twinPick(s: CareerState, which: "A" | "B" | "keep"): string {
  const ws = s.weekend;
  if (!ws || !twinLive(s)) return "That rule is not in force.";
  if (ws.stage !== "sq" && ws.stage !== "quali") return "You pick after practice, before qualifying.";
  if (ws.twin) return "The chassis is already chosen for this weekend.";
  const tr = treeOf(s, s.teams[s.teamId]);
  if (which === "keep") {
    ws.twin = { pick: "keep" };
    return "Each car keeps its own chassis.";
  }
  for (const p of Object.values(tr.parts)) {
    const on = which === "A" ? p.onA : p.onB;
    const bad = which === "A" ? p.misfit?.A : p.misfit?.B;
    p.onA = on;
    p.onB = on;
    p.misfit = on && bad ? { A: true, B: true } : undefined;
  }
  ws.twin = { pick: which };
  return `Both cars race on chassis ${which}.`;
}
