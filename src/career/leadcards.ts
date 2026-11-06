import { Rng, hashSeed } from "../sim/rng";
import { clamp, round2 } from "./util";
import type { CareerState, Staff, StaffRole, TeamState } from "./types";

/**
 * Special cards that only some lead engineers carry. Each belongs to a kind of expertise (a role), has a visible effect that is
 * a little absurd, and some are hidden: nobody knows they exist until the person is on your team and the card fires once.
 * A trainee has a hidden spark that grows while they work in their area; when they are promoted to a lead, a high spark earns a card.
 */
export interface LeadCard {
  id: string;
  name: string;
  role: StaffRole;
  /** Shown on the card. */
  text: string;
  /** What the sim and the pit show when it fires. */
  flavour: string;
  hidden: boolean;
  fx: { speed?: number; cost?: number; testDays?: number; gain?: number; pit?: number; failure?: number };
}
export const LEAD_ROLES: StaffRole[] = ["td", "designer", "aero", "power"];
export const CARDS: LeadCard[] = [
  { id: "wind-whisperer", name: "Wind Whisperer", role: "aero", text: "Tests finish in two days, not four.", flavour: "The tunnel hums a little tune whenever he walks in.", hidden: false, fx: { testDays: 2 } },
  { id: "night-shift", name: "Night Shift", role: "designer", text: "The factory builds a quarter faster.", flavour: "The lights in the drawing office never go off.", hidden: false, fx: { speed: 1.25 } },
  { id: "penny-pincher", name: "Penny Pincher", role: "td", text: "Every part costs 15 percent less.", flavour: "Reuses the packing crates. Keeps the receipts in a shoebox.", hidden: false, fx: { cost: 0.85 } },
  { id: "heat-magnet", name: "Heat Magnet", role: "power", text: "Power unit parts give 10 percent more.", flavour: "The dyno room is a sauna and nobody argues.", hidden: false, fx: { gain: 1.1 } },
  { id: "lucky-goldfish", name: "Lucky Goldfish", role: "aero", text: "Parts rarely come in below the staff's guess.", flavour: "A goldfish called Downforce lives on the desk. Nobody dares move it.", hidden: true, fx: { gain: 1.08 } },
  { id: "pit-whisperer", name: "Wheel Gun Whisperer", role: "td", text: "Pit stops are a hair quicker.", flavour: "Talks to the wheel guns in a low voice before every stop.", hidden: true, fx: { pit: 0.015 } },
  { id: "skeptic", name: "The Sceptic", role: "designer", text: "Parts fail half as often.", flavour: "Re-checks every bolt, twice, out loud.", hidden: true, fx: { failure: 0.5 } },
  { id: "kettle", name: "Kettle Theory", role: "power", text: "Builds go 15 percent faster.", flavour: "Every great idea arrives with a cup of tea.", hidden: true, fx: { speed: 1.15 } },
];
export const cardById = (id?: string) => CARDS.find((c) => c.id === id);

/** Give the leads of every team a card by expertise. Run once a season. About half of the strong leads carry one. */
export function assignCards(s: CareerState): void {
  for (const st of Object.values(s.staff)) {
    if (!st.teamId || st.intern || !LEAD_ROLES.includes(st.role) || st.card !== undefined || st.skill < 70) continue;
    const rng = new Rng(hashSeed(`lead:${s.seed}:${st.id}`));
    if (rng.next() > 0.55) continue;
    const pool = CARDS.filter((c) => c.role === st.role);
    if (pool.length) st.card = pool[Math.floor(rng.next() * pool.length)].id;
  }
}

/** The active modifiers from a team's leads (hidden ones count too: the effect is real even before it is revealed). */
export function cardMods(s: CareerState, teamId: string): { speed: number; cost: number; testDays: number; gain: number; pit: number; failure: number; names: string[] } {
  const out = { speed: 1, cost: 1, testDays: 4, gain: 1, pit: 0, failure: 1, names: [] as string[] };
  for (const st of Object.values(s.staff)) {
    if (st.teamId !== teamId || st.intern) continue;
    const c = cardById(st.card);
    if (!c) continue;
    out.speed *= c.fx.speed ?? 1;
    out.cost *= c.fx.cost ?? 1;
    out.gain *= c.fx.gain ?? 1;
    out.failure *= c.fx.failure ?? 1;
    out.pit += c.fx.pit ?? 0;
    if (c.fx.testDays !== undefined) out.testDays = Math.min(out.testDays, c.fx.testDays);
    out.names.push(c.name);
  }
  return out;
}

/** A card is shown to the player once it is not hidden, or after it has fired once. */
export function visibleCard(st: Staff): LeadCard | undefined {
  const c = cardById(st.card);
  if (!c) return undefined;
  return !c.hidden || st.cardSeen ? c : undefined;
}

/** Weekly: trainees on the player's team grow a spark while the factory builds in their area. */
export function sparkWeekly(s: CareerState, t: TeamState): void {
  const busy = (t.tree?.builds.length ?? 0) > 0 ? 1 : 0.4;
  for (const st of Object.values(s.staff)) {
    if (st.teamId !== t.id || !st.intern) continue;
    const lead = Object.values(s.staff).find((x) => x.teamId === t.id && !x.intern && x.role === st.role && x.card);
    const base = (st.intern.potential - 40) / 55;
    st.spark = round2(clamp((st.spark ?? 0.1 * base) + 0.012 * base * busy * (lead ? 1.5 : 1), 0, 1));
  }
}
/** When a trainee is promoted, a high spark becomes a card. */
export function promoteSpark(s: CareerState, st: Staff): LeadCard | undefined {
  if ((st.spark ?? 0) < 0.55 || st.card || !LEAD_ROLES.includes(st.role)) return undefined;
  const pool = CARDS.filter((c) => c.role === st.role);
  if (!pool.length) return undefined;
  const c = pool[Math.floor(new Rng(hashSeed(`spark:${s.seed}:${st.id}`)).next() * pool.length)];
  st.card = c.id;
  st.cardSeen = true;
  return c;
}
export const isPromising = (st: Staff) => !!st.intern && (st.spark ?? 0) >= 0.4 && !st.card;
