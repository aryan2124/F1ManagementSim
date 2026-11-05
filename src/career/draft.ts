import { news, pushCard, sendLetter } from "./cards";
import { askingSalary, candidateValue, juniorToDriver, signDriver } from "./contracts";
import { driversOf } from "./finance";
import { markGone } from "./academy";
import { rulesOf } from "./eras";
import { isHuman, rngFor, round2 } from "./util";
import type { CareerState, DriverState } from "./types";

/**
 * The draft ruleset: drivers belong to the league. When deals run out nobody keeps their driver by default; the expiring
 * drivers go into a pool with the free agents and the academy graduates, and the teams pick in reverse order of the
 * constructors' standings, round after round, until every team has two. Picks sign for one season at a rookie scale (65 percent
 * of the asking price). Each team may use one franchise tag a year to keep an expiring driver out of the pool for $2m.
 */
export const TAG_COST = 2;
export const SCALE = 0.65;
export const DRAFT_DAYS = 12;
/** Days between the draft opening and the first pick, when teams can trade places. */
export const TRADE_DAYS = 4;
/** Price of one place in the order, $m. */
export const PLACE_PRICE = 0.8;
/** A team that loses a good driver to the pool is paid this share of his asking price by the team that picks him. */
export const COMP_SHARE = 0.25;

export interface DraftPick { round: number; teamId: string; driverId: string; name: string }
export interface DraftState {
  year: number;
  /** Teams in pick order, worst first. */
  order: string[];
  round: number;
  /** The team on the clock, when it is a person who has to choose. */
  clock?: string;
  deadline: number;
  done: boolean;
  picks: DraftPick[];
  /** Franchise tags for the coming draft, team to driver. */
  tags: Record<string, string>;
  /** The team each pooled driver left, for compensation. */
  from: Record<string, string>;
  /** The first pick waits until this day while teams trade places. */
  tradeUntil: number;
  /** Teams that have traded places this draft (one trade each). */
  traded: string[];
}

export const draftOn = (s: CareerState) => !!rulesOf(s).draft;
/** True while the draft still has a seat to fill for this team (waiting to trade, on the clock, or waiting its turn). */
export const draftOpenFor = (s: CareerState, teamId: string) => !!s.draft && !s.draft.done && driversOf(s, teamId).length < 2;

/** Everyone who can be picked now: free agents and academy graduates old enough to race. */
export function draftPool(s: CareerState, forTeam?: string): string[] {
  const free = s.freeDrivers.map((id) => s.drivers[id]).filter((d) => d && !d.retired).map((d) => d.id);
  const juniors = s.pool.filter((j) => s.year - j.born >= 18 && j.pace >= 0.975 && (!j.owner || !forTeam || j.owner === forTeam)).map((j) => j.id);
  return [...free, ...juniors].sort((a, b) => paceOf(s, b) - paceOf(s, a) || a.localeCompare(b));
}
function paceOf(s: CareerState, id: string): number {
  return s.drivers[id]?.spec.pace ?? s.pool.find((j) => j.id === id)?.pace ?? 0;
}
function asDriver(s: CareerState, id: string): DriverState | undefined {
  if (s.drivers[id]) return s.drivers[id];
  const j = s.pool.find((x) => x.id === id);
  return j ? juniorToDriver(s, j) : undefined;
}

export function tagDriver(s: CareerState, teamId: string, driverId: string | null): { ok: boolean; message: string } {
  if (!draftOn(s)) return { ok: false, message: "There is no draft this year." };
  const t = s.teams[teamId];
  const d = driverId ? s.drivers[driverId] : undefined;
  s.draftTags ??= {};
  if (!driverId) { delete s.draftTags[teamId]; return { ok: true, message: "Franchise tag withdrawn." }; }
  if (!t || !d || d.teamId !== teamId) return { ok: false, message: "He does not drive for you." };
  if (d.endYear > s.year) return { ok: false, message: "His deal does not run out this year." };
  if (t.cash < TAG_COST) return { ok: false, message: `The tag costs $${TAG_COST}m.` };
  s.draftTags[teamId] = driverId;
  return { ok: true, message: `${d.spec.name} will be tagged and kept out of the draft. It costs $${TAG_COST}m when the season closes.` };
}

/** Called at the end of the season in place of the ordinary market. */
export function startDraft(s: CareerState): string[] {
  const notes: string[] = [];
  const rng = rngFor(s, "draft");
  const tags = { ...(s.draftTags ?? {}) };
  s.draftTags = {};
  // computer teams tag their best expiring driver when he is worth it
  for (const id of Object.keys(s.teams).sort()) {
    if (isHuman(s, id) || tags[id]) continue;
    const exp = driversOf(s, id).filter((d) => d.endYear <= s.year).sort((a, b) => b.spec.pace - a.spec.pace)[0];
    if (exp && candidateValue(s, exp, askingSalary(s, exp), s.teams[id].skillBrain, true) > 0.9 - 0.3 * s.teams[id].skillBrain + rng.gauss() * 0.3) tags[id] = exp.id;
  }
  const from: Record<string, string> = {};
  for (const id of Object.keys(s.teams).sort()) {
    const t = s.teams[id];
    for (const d of driversOf(s, id).filter((x) => x.endYear <= s.year)) {
      if (tags[id] === d.id && t.cash >= TAG_COST) {
        t.cash = round2(t.cash - TAG_COST);
        t.ledger.costs += TAG_COST;
        t.ledger.other += TAG_COST;
        d.endYear = s.year + 1;
        notes.push(`${id.toUpperCase()} tag ${d.spec.name}: he stays for one more year.`);
        continue;
      }
      d.teamId = null;
      d.tenure = 0;
      s.freeDrivers.push(d.id);
      from[d.id] = id;
      notes.push(`${d.spec.name} goes into the draft pool.`);
    }
  }
  const order = (s.prevOrder ?? Object.keys(s.teams)).slice().reverse();
  const humanShort = Object.keys(s.teams).some((id) => isHuman(s, id) && driversOf(s, id).length < 2);
  s.draft = { year: s.year, order, round: 1, deadline: s.day + DRAFT_DAYS, done: false, picks: [], tags, from, tradeUntil: humanShort ? s.day + TRADE_DAYS : 0, traded: [] };
  notes.push(humanShort ? `The draft is open. Teams can trade places for ${TRADE_DAYS} days, then the worst team picks first.` : "The draft is open: the worst team picks first.");
  if (!humanShort) notes.push(...advanceDraft(s));
  return notes;
}

function aiPick(s: CareerState, teamId: string): string | undefined {
  const t = s.teams[teamId];
  const rng = rngFor(s, `draftpick:${teamId}:${s.draft?.picks.length ?? 0}`);
  let best: string | undefined;
  let bestV = -Infinity;
  for (const id of draftPool(s, teamId)) {
    const d = asDriver(s, id);
    if (!d) continue;
    const v = candidateValue(s, d, askingSalary(s, d) * SCALE, t.skillBrain, false) + rng.gauss() * (1 - t.skillBrain) * 0.6;
    if (v > bestV) { bestV = v; best = id; }
  }
  return best;
}

function makePick(s: CareerState, teamId: string, id: string): string[] {
  const dr = s.draft!;
  const d = asDriver(s, id);
  if (!d) return [];
  if (!s.drivers[id]) {
    s.drivers[id] = d;
    markGone(s, id);
    s.pool = s.pool.filter((p) => p.id !== id);
    s.freeDrivers.push(id);
  }
  const pay = Math.min(round2(askingSalary(s, d) * SCALE), rulesOf(s).talentCap ? round2(rulesOf(s).talentCap! * 0.5) : 99);
  const notes = signDriver(s, teamId, id, { salary: pay, years: 1, role: "equal" });
  // the team he came from is paid for a good driver lost to the pool
  const was = dr.from[id];
  if (was && was !== teamId && s.teams[was] && d.spec.pace >= 0.99) {
    const comp = round2(askingSalary(s, d) * COMP_SHARE);
    const payer = s.teams[teamId], payee = s.teams[was];
    const paid = Math.min(comp, Math.max(0, payer.cash));
    payer.cash = round2(payer.cash - paid);
    payer.ledger.costs += paid;
    payer.ledger.other += paid;
    payee.cash = round2(payee.cash + paid);
    notes.push(`${teamId.toUpperCase()} pay ${was.toUpperCase()} $${paid.toFixed(2)}m for ${d.spec.name}.`);
    if (was === s.teamId || teamId === s.teamId) sendLetter(s, { from: "The Commission", role: "Draft", subject: "Draft compensation", body: `${teamId.toUpperCase()} picked ${d.spec.name}, who came from ${was.toUpperCase()}. Compensation of $${paid.toFixed(2)}m was paid.` });
  }
  dr.picks.push({ round: dr.round, teamId, driverId: id, name: d.spec.name });
  news(s, `Draft: ${teamId.toUpperCase()} pick ${d.spec.name} (round ${dr.round}).`, { importance: 1, cause: "Draft", tag: "rules" });
  return notes;
}

/** Runs the picks until a person has to choose, or every seat is filled. */
export function advanceDraft(s: CareerState): string[] {
  const dr = s.draft;
  const notes: string[] = [];
  if (!dr || dr.done) return notes;
  if (s.day < dr.tradeUntil) return notes;
  let guard = 0;
  while (guard++ < 400) {
    const needing = dr.order.filter((id) => driversOf(s, id).length < 2);
    if (!needing.length || !draftPool(s).length) { finish(s); return notes; }
    // within a round each short team picks once, in order
    const taken = new Set(dr.picks.filter((p) => p.round === dr.round).map((p) => p.teamId));
    const next = dr.order.find((id) => driversOf(s, id).length < 2 && !taken.has(id));
    if (!next) { dr.round++; continue; }
    if (isHuman(s, next)) {
      if (dr.clock !== next) {
        dr.clock = next;
        dr.deadline = s.day + DRAFT_DAYS;
        if (next === s.teamId) {
          pushCard(s, "offseason", "You are on the clock", `The draft has come round to you. Pick a driver in Rules before day ${dr.deadline}, or your pit wall takes the best one left. ${notes.slice(0, 3).join(" ")}`, [{ id: "ok", label: "To the board" }], { urgency: 3, deadline: dr.deadline });
        }
      }
      return notes;
    }
    const pick = aiPick(s, next);
    if (!pick) { dr.picks.push({ round: dr.round, teamId: next, driverId: "", name: "" }); continue; }
    notes.push(...makePick(s, next, pick));
  }
  finish(s);
  return notes;
}

function finish(s: CareerState) {
  const dr = s.draft!;
  dr.done = true;
  dr.clock = undefined;
  const mine = dr.picks.filter((p) => p.teamId === s.teamId && p.driverId);
  if (mine.length) sendLetter(s, { from: "The Commission", role: "Draft", subject: "The draft is closed", body: `You picked ${mine.map((p) => p.name).join(" and ")}. Pick order was worst team first.` });
}

/** A person's pick. */
export function draftPick(s: CareerState, teamId: string, driverId: string): { ok: boolean; message: string } {
  const dr = s.draft;
  if (!dr || dr.done || dr.clock !== teamId) return { ok: false, message: "You are not on the clock." };
  if (!draftPool(s, teamId).includes(driverId)) return { ok: false, message: "He is not in the pool." };
  const notes = makePick(s, teamId, driverId);
  dr.clock = undefined;
  notes.push(...advanceDraft(s));
  return { ok: true, message: notes[0] ?? "Picked." };
}

/** What it costs to move from one place in the order to another. */
export function tradePrice(s: CareerState, a: string, b: string): number {
  const o = s.draft?.order ?? [];
  return round2(Math.abs(o.indexOf(a) - o.indexOf(b)) * PLACE_PRICE);
}

/** Swap places in the draft order with another team that is also short of drivers. The team moving up pays; the team moving down is paid. */
export function tradePlaces(s: CareerState, teamId: string, withId: string): { ok: boolean; message: string } {
  const dr = s.draft;
  if (!dr || dr.done) return { ok: false, message: "There is no draft open." };
  if (dr.picks.length) return { ok: false, message: "The picks have started; trading places is closed." };
  if (teamId === withId || !s.teams[teamId] || !s.teams[withId]) return { ok: false, message: "No such team." };
  if (dr.traded.includes(teamId) || dr.traded.includes(withId)) return { ok: false, message: "Each team may trade places once." };
  if (driversOf(s, teamId).length >= 2 || driversOf(s, withId).length >= 2) return { ok: false, message: "A team with two drivers has no pick to trade." };
  const o = dr.order;
  const i = o.indexOf(teamId), j = o.indexOf(withId);
  const price = tradePrice(s, teamId, withId);
  const payer = j < i ? teamId : withId;
  // `payer` is the one moving to the earlier place
  const buyer = s.teams[payer], seller = s.teams[payer === teamId ? withId : teamId];
  if (buyer.cash < price) return { ok: false, message: `Moving up costs $${price.toFixed(2)}m and ${payer.toUpperCase()} cannot pay.` };
  if (!isHuman(s, withId)) {
    const r = rngFor(s, `trade:${teamId}:${withId}:${s.day}`).next();
    if (r > 0.55 + 0.4 * s.teams[withId].skillBrain) return { ok: false, message: `${withId.toUpperCase()} turn the offer down.` };
  }
  buyer.cash = round2(buyer.cash - price);
  buyer.ledger.costs += price;
  buyer.ledger.other += price;
  seller.cash = round2(seller.cash + price);
  [o[i], o[j]] = [o[j], o[i]];
  dr.traded.push(teamId, withId);
  news(s, `Draft: ${payer.toUpperCase()} move up to trade places with ${(payer === teamId ? withId : teamId).toUpperCase()} for $${price.toFixed(2)}m.`, { importance: 1, cause: "Draft", tag: "rules" });
  return { ok: true, message: `Places swapped. ${payer === teamId ? "You paid" : "You were paid"} $${price.toFixed(2)}m.` };
}

/** Daily: a person who runs out the clock has the best available driver picked for them. */
export function draftDaily(s: CareerState): void {
  const dr = s.draft;
  if (!dr || dr.done) return;
  if (!dr.clock && dr.tradeUntil && s.day >= dr.tradeUntil && !dr.picks.length) advanceDraft(s);
  if (dr.clock && (s.day >= dr.deadline || s.year > dr.year)) {
    const who = dr.clock;
    const pick = aiPick(s, who);
    dr.clock = undefined;
    if (pick) makePick(s, who, pick);
    advanceDraft(s);
  }
}

