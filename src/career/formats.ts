import { news, sendLetter } from "./cards";
import { rngFor, round2 } from "./util";
import { rulesOf } from "./eras";
import type { CareerState, Trait } from "./types";

/**
 * What the combination rulesets add beyond a flag: a real choice per ruleset.
 * Picks (six wheels, tyre wars, twin chassis, kit library, relay era) are a season long layout the team commits to, each with a
 * price in some other trait. Auctions (energy, freedom) are sealed bids: the top bidders win a lasting edge and pay their own bid.
 */
export interface FormatOption { id: string; name: string; blurb: string; fx: Partial<Record<Trait, number>> }
export interface FormatDef { moduleId: string; title: string; options: FormatOption[] }

export const FORMATS: FormatDef[] = [
  { moduleId: "sixWheels", title: "Wheel layout", options: [
    { id: "rear", name: "Rear pair", blurb: "Two extra driven wheels at the back: traction out of slow corners, more drag.", fx: { drive: 0.08, efficiency: -0.05 } },
    { id: "front", name: "Front pair", blurb: "Two extra wheels up front: bite on turn in, a tight package.", fx: { grip: 0.07, packaging: -0.05 } },
    { id: "even", name: "Even six", blurb: "Three pairs sharing the load: a calm platform, less peak output.", fx: { platform: 0.07, output: -0.04 } },
  ] },
  { moduleId: "tyreWars", title: "Tyre supplier", options: [
    { id: "grippy", name: "Supplier A", blurb: "Grippy, but slow to come in.", fx: { grip: 0.07, warmup: -0.04 } },
    { id: "durable", name: "Supplier B", blurb: "Comes in at once and lasts, with less peak grip.", fx: { warmup: 0.05, grip: -0.02, efficiency: 0.04 } },
  ] },
  { moduleId: "twinChassis", title: "The spare chassis", options: [
    { id: "sprint", name: "Sprinter spare", blurb: "A high load spare for twisty circuits.", fx: { downforce: 0.08, efficiency: -0.05 } },
    { id: "marathon", name: "Marathoner spare", blurb: "A low drag spare for fast circuits.", fx: { efficiency: 0.07, downforce: -0.04 } },
  ] },
  { moduleId: "kitLibrary", title: "Aero kit set", options: [
    { id: "lowdrag", name: "Low drag kits", blurb: "Four of the five kits cut drag.", fx: { efficiency: 0.07, downforce: -0.03 } },
    { id: "highload", name: "High load kits", blurb: "Four of the five kits add load.", fx: { downforce: 0.07, efficiency: -0.04 } },
    { id: "mixed", name: "Mixed set", blurb: "One of everything: steady everywhere.", fx: { platform: 0.04, drive: 0.02 } },
  ] },
  { moduleId: "relayEra", title: "The driver pairing", options: [
    { id: "matched", name: "Matched pair", blurb: "Two drivers who like the same car: one setup, fewer surprises.", fx: { platform: 0.04, drive: 0.03 } },
    { id: "opposite", name: "Opposite styles", blurb: "A smooth driver and an aggressive one: the car has to suit both.", fx: { packaging: 0.03, grip: 0.03, platform: -0.03 } },
  ] },
];

export interface AuctionDef { moduleId: string; title: string; slots: number; fx: Partial<Record<Trait, number>> }
export const AUCTIONS: AuctionDef[] = [
  { moduleId: "energyAuction", title: "Energy units", slots: 5, fx: { output: 0.08, capacity: 0.05 } },
  { moduleId: "freedomAuction", title: "Freedom zones", slots: 3, fx: { downforce: 0.06, grip: 0.05 } },
];

export interface Auction { year: number; closes: number; bids: Record<string, number>; winners: string[]; done: boolean }
export interface FormatState { auctions: Record<string, Auction> }
export const formatState = (s: CareerState): FormatState => (s.formats ??= { auctions: {} });

const OPT = new Map(FORMATS.flatMap((f) => f.options.map((o) => [`${f.moduleId}:${o.id}`, o] as const)));

/** The trait overlay of a team's picks and auction wins. */
export function formatTraits(t: { formats?: Record<string, string>; auctionWins?: string[] }): Partial<Record<Trait, number>> {
  const out: Partial<Record<Trait, number>> = {};
  const add = (fx: Partial<Record<Trait, number>>) => { for (const [k, v] of Object.entries(fx) as [Trait, number][]) out[k] = (out[k] ?? 0) + v; };
  for (const [m, o] of Object.entries(t.formats ?? {})) { const x = OPT.get(`${m}:${o}`); if (x) add(x.fx); }
  for (const m of t.auctionWins ?? []) { const a = AUCTIONS.find((x) => x.moduleId === m); if (a) add(a.fx); }
  return out;
}

const liveMods = (s: CareerState) => new Set((s.era.current?.modules ?? []).map((m) => m.id));

export function liveFormats(s: CareerState): FormatDef[] { const l = liveMods(s); return FORMATS.filter((f) => l.has(f.moduleId)); }
export function liveAuctions(s: CareerState): AuctionDef[] { const l = liveMods(s); return AUCTIONS.filter((f) => l.has(f.moduleId)); }

export function pickFormat(s: CareerState, teamId: string, moduleId: string, optionId: string): { ok: boolean; message: string } {
  const t = s.teams[teamId];
  if (!t || !liveFormats(s).some((f) => f.moduleId === moduleId)) return { ok: false, message: "That rule is not in force." };
  if (!OPT.has(`${moduleId}:${optionId}`)) return { ok: false, message: "Unknown option." };
  const f = (t.formats ??= {});
  if (f[moduleId] && f[moduleId] !== optionId) return { ok: false, message: "The layout is fixed for the season." };
  f[moduleId] = optionId;
  return { ok: true, message: `${OPT.get(`${moduleId}:${optionId}`)!.name} chosen for the season.` };
}

export function placeBid(s: CareerState, teamId: string, moduleId: string, amount: number): { ok: boolean; message: string } {
  const t = s.teams[teamId];
  const a = formatState(s).auctions[moduleId];
  if (!t || !a || a.done) return { ok: false, message: "No auction is open." };
  const bid = round2(Math.max(0, amount));
  if (bid > t.cash) return { ok: false, message: "You cannot bid more than you have." };
  a.bids[teamId] = bid;
  return { ok: true, message: bid ? `Sealed bid of $${bid.toFixed(2)}m placed. Nobody sees it until the close.` : "Bid withdrawn." };
}

/** Monthly: picks lapse with the rule, auctions open each year, close after a month, and the winners are named. */
export function formatsMonthly(s: CareerState): void {
  const st = formatState(s);
  const live = liveMods(s);
  const ids = Object.keys(s.teams).sort();
  for (const id of ids) {
    const t = s.teams[id];
    for (const m of Object.keys(t.formats ?? {})) if (!live.has(m)) delete t.formats![m];
    t.auctionWins = (t.auctionWins ?? []).filter((m) => live.has(m) && st.auctions[m]?.year === s.year);
    // computer teams choose a layout at the start of the rule
    for (const f of liveFormats(s)) {
      if (id === s.teamId || s.humans?.includes(id) || (t.formats ?? {})[f.moduleId]) continue;
      const r = rngFor(s, `fmt:${f.moduleId}:${id}`);
      (t.formats ??= {})[f.moduleId] = f.options[Math.floor(r.next() * f.options.length)].id;
    }
  }
  for (const a of liveAuctions(s)) {
    let au = st.auctions[a.moduleId];
    if (!au || au.year !== s.year) {
      au = st.auctions[a.moduleId] = { year: s.year, closes: s.day + 30, bids: {}, winners: [], done: false };
      for (const id of ids) {
        if (id === s.teamId || s.humans?.includes(id)) continue;
        const r = rngFor(s, `bid:${a.moduleId}:${s.year}:${id}`);
        au.bids[id] = round2(Math.min(s.teams[id].cash * 0.3, 0.2 + r.next() * 1.0));
      }
      if (rulesOf(s)) sendLetter(s, { from: "The Commission", role: "Auction", subject: `Sealed bids open: ${a.title.toLowerCase()}`, body: `The top ${a.slots} bids win ${a.title.toLowerCase()} for the season and pay what they bid. Place yours in Rules. Bids close at the next round.` });
      continue;
    }
    if (!au.done && s.day >= au.closes) {
      au.done = true;
      const ranked = Object.entries(au.bids).filter(([id, b]) => b > 0 && s.teams[id]).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).slice(0, a.slots);
      au.winners = ranked.map(([id]) => id);
      for (const [id, b] of ranked) {
        const t = s.teams[id];
        t.cash = round2(t.cash - b);
        t.ledger.costs += b;
        t.ledger.other += b;
        t.auctionWins = [...(t.auctionWins ?? []), a.moduleId];
      }
      news(s, `${a.title} auction closed: ${au.winners.map((x) => x.toUpperCase()).join(", ") || "no bids"} won.`, { importance: 2, cause: "Auction", tag: "rules" });
      const mine = ranked.find(([id]) => id === s.teamId);
      sendLetter(s, { from: "The Commission", role: "Auction", subject: `${a.title}: ${mine ? "won" : "not won"}`, body: mine ? `Your bid of $${mine[1].toFixed(2)}m was among the top ${a.slots}. It is paid and the edge is on the car for the season.` : `Your bid was not among the top ${a.slots}. The winning bids ran from $${(ranked.at(-1)?.[1] ?? 0).toFixed(2)}m to $${(ranked[0]?.[1] ?? 0).toFixed(2)}m. Nothing is charged.` });
    }
  }
}
