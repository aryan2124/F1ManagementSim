import { clamp, round2 } from "./util";
import { news, sendLetter } from "./cards";
import { logLedger } from "./ledger";
import { rngFor } from "./util";
import { rulesOf } from "./eras";
import type { CareerState, Trait } from "./types";

/**
 * Loopholes. Every rule written down has a gap in its wording. A team can work a gap for a gain on the car, but each team
 * that does raises the rule's heat. At half heat the Commission drops a hint in a consultation letter; at full heat it
 * patches the gap with an amendment and fines the teams that were working it. AI teams work gaps too.
 */
export interface Loophole {
  id: string;
  /** The module whose wording has the gap. */
  mod: string;
  name: string;
  text: string;
  fx: Partial<Record<Trait, number>>;
}

export const LOOPHOLES: Loophole[] = [
  { id: "consultancy", mod: "auditor", name: "Book R&D as consultancy", text: "The auditor reads the invoice, not the work.", fx: { downforce: 0.05, output: 0.04 } },
  { id: "sixWheels-gap", mod: "sixWheels", name: "Counts sets, not tyres", text: "The allocation counts sets, so extra wheels are free.", fx: {wear: 0.08, platform: 0.04} },
  { id: "computerCars-gap", mod: "computerCars", name: "Clever logic on other sensors", text: "A driver aid is defined by its sensors, so logic on other sensors may pass.", fx: {drive: 0.07, platform: 0.04} },
  { id: "fuelIsMoney-gap", mod: "fuelIsMoney", name: "Qualifying fuel is not counted", text: "The budget is counted at the pumps, so qualifying fuel is free.", fx: {packaging: 0.05, efficiency: 0.04} },
  { id: "grenadeEra-gap", mod: "grenadeEra", name: "Engines counted by serial number", text: "The pool counts engines, not components.", fx: {output: 0.09, capacity: -0.03} },
  { id: "freedomAuction-gap", mod: "freedomAuction", name: "Subcontracting a zone is not mentioned", text: "Nothing says a zone cannot be subcontracted.", fx: {packaging: 0.05, drive: 0.04} },
  { id: "rainOnDemand-gap", mod: "rainOnDemand", name: "Lottery set by each venue", text: "The lottery and the notice time are set per venue.", fx: {grip: 0.06, warmup: 0.04} },
  { id: "theDraft-gap", mod: "theDraft", name: "Rookie defined by age", text: "A rookie contract is defined by age, not experience.", fx: {drive: 0.05} },
  { id: "energyAuction-gap", mod: "energyAuction", name: "Unspent energy carries over", text: "Unspent energy carries to the next race.", fx: {output: 0.07, capacity: 0.03} },
  { id: "twinChassis-gap", mod: "twinChassis", name: "The spare is just a spare", text: "The second chassis is defined as a spare, so how different it may be is unclear.", fx: {platform: 0.06, grip: 0.03} },
  { id: "kitLibrary-gap", mod: "kitLibrary", name: "A kit may be modified as a repair", text: "A kit may be modified between races as a repair.", fx: {downforce: 0.07, efficiency: 0.03} },
  { id: "transparentPaddock-gap", mod: "transparentPaddock", name: "What counts as a dial", text: "A design dial is defined at the race weekend.", fx: {downforce: 0.04, platform: 0.04} },
  { id: "relayEra-gap", mod: "relayEra", name: "The swap clock starts at the stop", text: "The swap clock starts when the car stops, not when the driver is ready.", fx: {drive: 0.06, packaging: 0.03} },
  { id: "tyreWars-gap", mod: "tyreWars", name: "Testing limited unless labelled supplier development", text: "Tyre testing is limited unless labelled supplier development.", fx: {wear: 0.06, warmup: 0.05} },
  { id: "wingsBanned-gap", mod: "wingsBanned", name: "A wing is defined by an angle", text: "A wing is defined by the angle of an element above the floor.", fx: {platform: 0.07, downforce: 0.04} },
];

export const loopholeOf = (id: string) => LOOPHOLES.find((l) => l.id === id);

export interface LoopState {
  heat: Record<string, number>;
  patched: string[];
  hinted: string[];
}

export function loopState(s: CareerState): LoopState {
  return (s.loops ??= { heat: {}, patched: [], hinted: [] });
}

/** Loopholes whose rule is live this season and not yet patched. */
export function liveLoopholes(s: CareerState): Loophole[] {
  const mods = new Set((s.era.current?.modules ?? []).map((m) => m.id));
  const st = loopState(s);
  return LOOPHOLES.filter((l) => mods.has(l.mod) && !st.patched.includes(l.id));
}

export function loopholeTraits(t: { loops?: string[] }): Partial<Record<Trait, number>> {
  const out: Partial<Record<Trait, number>> = {};
  for (const id of t.loops ?? []) {
    const l = loopholeOf(id);
    if (l) for (const [k, v] of Object.entries(l.fx) as [Trait, number][]) out[k] = (out[k] ?? 0) + v;
  }
  return out;
}

export function setExploit(s: CareerState, teamId: string, id: string, on: boolean): { ok: boolean; message: string } {
  const t = s.teams[teamId];
  const l = liveLoopholes(s).find((x) => x.id === id);
  if (!t || !l) return { ok: false, message: "That gap is not open." };
  const cur = new Set(t.loops ?? []);
  if (on) cur.add(id); else cur.delete(id);
  t.loops = [...cur].sort();
  return { ok: true, message: on ? `You are working the gap: ${l.name}. The Commission may notice.` : `You stopped working the gap: ${l.name}.` };
}

/** Monthly cost audit: spend on R&D above the cap is fined, once a quarter at most per team. */
export function auditMonthly(s: CareerState): void {
  const cap = rulesOf(s).auditor;
  if (!cap) return;
  for (const id of Object.keys(s.teams).sort()) {
    const t = s.teams[id];
    if (t.ledger.rnd <= cap) continue;
    if (t.auditDay !== undefined && s.day - t.auditDay < 84) continue;
    t.auditDay = s.day;
    const over = round2(t.ledger.rnd - cap);
    const fine = round2(Math.min(2, 0.3 + 0.25 * over));
    t.cash = round2(t.cash - fine);
    t.ledger.costs += fine;
    t.ledger.other += fine;
    news(s, `${id.toUpperCase()} fined $${fine.toFixed(2)}m by the cost auditor.`, { importance: 2, cause: "Audit", tag: "rules" });
    if (id === s.teamId) {
      logLedger(s, { kind: "money", text: "Cost auditor fine", cost: fine, because: `R&D spend $${over.toFixed(1)}m over the cap` });
      sendLetter(s, { from: "Cost auditor", role: "Audit", subject: `Fine: $${fine.toFixed(2)}m`, body: `Your R&D spend this year is $${over.toFixed(1)}m over the cap of $${cap}m. The cap was not published; this is how it is found out.` });
    }
  }
}

/** Monthly: AI teams pick gaps, heat moves, hints go out, patches land. */
export function loopholesMonthly(s: CareerState): void {
  const st = loopState(s);
  const live = liveLoopholes(s);
  for (const l of live) {
    for (const id of Object.keys(s.teams).sort()) {
      if (id === s.teamId || s.humans?.includes(id)) continue;
      const t = s.teams[id];
      const r = rngFor(s, `loop:${s.day}:${id}:${l.id}`);
      const bold = clamp(0.5 + 0.5 * t.concept.innov + 0.2 * t.concept.risk, 0.05, 1);
      const has = (t.loops ?? []).includes(l.id);
      if (!has && r.next() < 0.08 * bold) t.loops = [...(t.loops ?? []), l.id].sort();
    }
    const workers = Object.values(s.teams).filter((t) => (t.loops ?? []).includes(l.id));
    st.heat[l.id] = round2(clamp((st.heat[l.id] ?? 0) * 0.97 + 0.09 * workers.length, 0, 1.5));
    if (st.heat[l.id] >= 0.5 && !st.hinted.includes(l.id)) {
      st.hinted.push(l.id);
      sendLetter(s, { from: "The Commission", role: "Consultation", subject: `Wording under review: ${l.name.toLowerCase()}`, body: `We have been told the rule on ${l.mod.replace(/([A-Z])/g, " $1").toLowerCase()} may be read in a way nobody intended: ${l.text} Teams that rely on that reading should expect it to be closed.` });
    }
    if (st.heat[l.id] >= 1) {
      st.patched.push(l.id);
      news(s, `Amendment: the Commission closes a gap in the rules (${l.name.toLowerCase()}).`, { importance: 2, cause: "Amendment", tag: "rules" });
      for (const t of workers) {
        t.loops = (t.loops ?? []).filter((x) => x !== l.id);
        t.cash = round2(t.cash - 0.6);
        t.ledger.costs += 0.6;
        t.ledger.other += 0.6;
        if (t.id === s.teamId) {
          logLedger(s, { kind: "money", text: `Fine: ${l.name}`, cost: 0.6, because: "the gap was patched" });
          sendLetter(s, { from: "The Commission", role: "Stewards", subject: `Amendment: ${l.name}`, body: `The gap is closed. Teams that worked it are fined $0.60m, and the gain is gone.` });
        }
      }
    }
  }
}
