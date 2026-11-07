import { Rng, hashSeed } from "../sim/rng";
import { buildSpeed, install, lockOf, misfitOf, nodeOf, treeOf, type FitJob, type TreeNode } from "./ctree";
import { partTrackExpect } from "./treeplay";
import { logSpend } from "./log";
import { news } from "./cards";
import { round2 } from "./util";
import type { CareerState, TeamState } from "./types";

/**
 * Changing the car is never free. In the factory a change costs days and money. In a practice session it costs
 * session minutes and money. A RUSH pays more to be quick and has a much higher chance of a bad fit.
 */
export const FIT_RISK = 0.03;
export const RUSH_RISK = 0.22;
export const RUSH_PRICE = 2.5;

export interface Quote { money: number; days: number; minutes: number; risk: number }

export function fitQuote(s: CareerState, t: TeamState, nd: TreeNode, on: boolean, rush: boolean): Quote {
  const speed = Math.max(0.5, buildSpeed(s, t.id));
  const money = round2(0.08 * nd.tier * (on ? 1 : 0.5) * (rush ? RUSH_PRICE : 1));
  const days = rush ? 1 : Math.max(1, Math.ceil((on ? 1 + Math.ceil(nd.tier / 2) : 1) / speed));
  const base = on ? 6 + 3 * nd.tier : 4;
  return { money, days, minutes: rush ? Math.ceil(base * 0.6) : base, risk: rush ? RUSH_RISK : FIT_RISK };
}

const inPractice = (s: CareerState) => !!s.weekend && s.weekend.stage === "practice";

function roll(s: CareerState, id: string, car: "A" | "B", risk: number): boolean {
  return new Rng(hashSeed(`fit:${s.seed}:${s.day}:${id}:${car}:${s.uid}`)).chance(risk);
}

function finish(s: CareerState, t: TeamState, id: string, car: "A" | "B", on: boolean, rush: boolean): { ok: boolean; message: string; bad: boolean } {
  const r = install(s, t, id, car, on);
  if (!r.ok) return { ...r, bad: false };
  const p = treeOf(s, t).parts[id];
  const nd = nodeOf(treeOf(s, t), id);
  let bad = false;
  if (p) {
    if (on && roll(s, id, car, rush ? RUSH_RISK : FIT_RISK)) {
      p.misfit = { ...(p.misfit ?? {}), [car]: true };
      bad = true;
      news(s, `${nd?.name ?? "A part"} was ${rush ? "rushed onto" : "fitted to"} car ${car} and does not sit right. It will give far less than it should until it is fitted again.`, { importance: 2, tag: "fit" });
    } else if (p.misfit?.[car]) p.misfit = { ...p.misfit, [car]: false };
  }
  return { ok: true, message: r.message, bad };
}

/** Ask for a change. In a practice session it happens now and eats minutes, otherwise the mechanics take days. */
export function requestFit(s: CareerState, t: TeamState, id: string, car: "A" | "B", on: boolean, rush = false): { ok: boolean; message: string } {
  const tr = treeOf(s, t);
  const nd = nodeOf(tr, id);
  const p = tr.parts[id];
  if (!nd || !p) return { ok: false, message: "Not built." };
  if (s.weekend && s.weekend.stage !== "practice" && s.weekend.stage !== "done") return { ok: false, message: "Parc ferme: the cars are locked until after the race." };
  if ((car === "A" ? p.onA : p.onB) === on && !(on && p.misfit?.[car])) return { ok: true, message: on ? `Already on car ${car}.` : `Already off car ${car}.` };
  const q = fitQuote(s, t, nd, on, rush);
  if (t.cash < q.money) return { ok: false, message: "Not enough cash." };
  const now = inPractice(s);
  if (now) {
    const r = finish(s, t, id, car, on, rush);
    if (!r.ok) return r;
    t.cash = round2(t.cash - q.money);
    t.ledger.rnd = round2(t.ledger.rnd + q.money);
    s.weekend!.fitMin = (s.weekend!.fitMin ?? 0) + q.minutes;
    logSpend(s, `${on ? "Fitted" : "Removed"} ${nd.name} (car ${car})${rush ? ", rushed" : ""}`, { cash: -q.money });
    return { ok: true, message: `${r.message} ${q.minutes} minutes of the session and ${q.money.toFixed(2)}m.${r.bad ? " It does not sit right." : ""}` };
  }
  // in the factory: the job waits for the mechanics
  if (!lockOf(s, t, nd).ok && !p) return { ok: false, message: "Locked." };
  const jobs = (tr.fits ??= []);
  const idx = jobs.findIndex((j) => j.id === id && j.car === car);
  if (idx >= 0) jobs.splice(idx, 1);
  jobs.push({ id, car, on, left: q.days, rush });
  t.cash = round2(t.cash - q.money);
  t.ledger.rnd = round2(t.ledger.rnd + q.money);
  logSpend(s, `${on ? "Fit" : "Remove"} ${nd.name} (car ${car})${rush ? ", rushed" : ""}`, { cash: -q.money });
  return { ok: true, message: `${nd.name} ${on ? "goes onto" : "comes off"} car ${car} in ${q.days} day${q.days > 1 ? "s" : ""} for ${q.money.toFixed(2)}m.${rush ? " Rushed: a real chance it does not sit right." : ""}` };
}

/** One day of the mechanics' work. */
export function tickFits(s: CareerState, t: TeamState): string[] {
  const tr = t.tree;
  const done: string[] = [];
  if (!tr?.fits?.length) return done;
  const keep: FitJob[] = [];
  for (const j of tr.fits) {
    j.left -= 1;
    if (j.left > 0) { keep.push(j); continue; }
    finish(s, t, j.id, j.car, j.on, j.rush);
    done.push(j.id);
  }
  tr.fits = keep;
  return done;
}

// ---------------------------------------------------------------- the fit number and the suggested fit

/** The slots of one car: one part per component and tier. Returns each slot's parts, built ones only. */
function slotsOfCar(s: CareerState, t: TeamState): Map<string, TreeNode[]> {
  const tr = treeOf(s, t);
  const m = new Map<string, TreeNode[]>();
  for (const p of Object.values(tr.parts)) {
    const nd = nodeOf(tr, p.id);
    if (!nd) continue;
    const k = `${nd.comp}${nd.tier}`;
    m.set(k, [...(m.get(k) ?? []), nd]);
  }
  return m;
}

/** What the staff think a part is worth at a track, seconds a lap (positive is faster). */
export const wanted = (nd: TreeNode, circuitId: string) => partTrackExpect(nd, circuitId);

/** The best set the built parts allow for a circuit, by the staff's own numbers: one per slot, none if nothing helps. */
export function bestSet(s: CareerState, t: TeamState, circuitId: string): string[] {
  const out: string[] = [];
  for (const nds of slotsOfCar(s, t).values()) {
    const best = [...nds].sort((a, b) => wanted(b, circuitId) - wanted(a, circuitId))[0];
    if (best && wanted(best, circuitId) > 0) out.push(best.id);
  }
  return out;
}

/** How well a car is set up for a circuit, 0 to 100: its fitted parts against the best set the built parts allow. */
export function fitNumber(s: CareerState, t: TeamState, car: "A" | "B", circuitId: string): { pct: number; have: number; best: number } {
  const tr = treeOf(s, t);
  const best = bestSet(s, t, circuitId).reduce((a, id) => a + wanted(nodeOf(tr, id)!, circuitId), 0);
  let have = 0;
  for (const p of Object.values(tr.parts)) {
    if (!(car === "A" ? p.onA : p.onB)) continue;
    const nd = nodeOf(tr, p.id);
    if (nd) have += wanted(nd, circuitId) * misfitOf(p, car);
  }
  const pct = best <= 0.001 ? 100 : Math.max(0, Math.min(100, Math.round((have / best) * 100)));
  return { pct, have: round2(have), best: round2(best) };
}

/** The changes that turn a car into the best set for a circuit (what the staff would fit). */
export function suggestedFit(s: CareerState, t: TeamState, car: "A" | "B", circuitId: string): { id: string; on: boolean }[] {
  const tr = treeOf(s, t);
  const want = new Set(bestSet(s, t, circuitId));
  const out: { id: string; on: boolean }[] = [];
  for (const p of Object.values(tr.parts)) {
    const has = car === "A" ? p.onA : p.onB;
    if (has && !want.has(p.id)) out.push({ id: p.id, on: false });
    else if (!has && want.has(p.id)) out.push({ id: p.id, on: true });
  }
  // removals first so a swap in the same slot is clean
  return out.sort((a, b) => Number(a.on) - Number(b.on));
}

/** Put the suggested fit in hand for both cars. Returns how many changes were ordered and what they cost. */
export function applySuggested(s: CareerState, t: TeamState, circuitId: string, rush = false): { n: number; money: number; message: string } {
  const tr = treeOf(s, t);
  let n = 0, money = 0;
  let last = "";
  for (const car of ["A", "B"] as const) {
    for (const c of suggestedFit(s, t, car, circuitId)) {
      const nd = nodeOf(tr, c.id)!;
      const q = fitQuote(s, t, nd, c.on, rush);
      const r = requestFit(s, t, c.id, car, c.on, rush);
      if (r.ok) { n++; money += q.money; } else last = r.message;
    }
  }
  return { n, money: round2(money), message: n ? `${n} change${n > 1 ? "s" : ""} ordered for ${round2(money).toFixed(2)}m.` : last || "Both cars already match the staff's best set." };
}
