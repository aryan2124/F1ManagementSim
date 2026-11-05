import { round2 } from "./util";
import { loopholeTraits } from "./loopholes";
import type { Area, CareerState, TeamState, Trait } from "./types";
import { TRAITS } from "./types";

/**
 * Keystones: the few big qualitative choices that define a car (a deep sealed floor, a pull-rod front end, a big cooling
 * inlet). Each sits in one of a fixed number of slots, pushes a few traits up and a few down, and some pairs interact.
 * They are an overlay on the car's traits, so swapping one is clean: take it out and the car is as it was, minus the
 * tunnel hours it cost and a dent in what the team understands about the car.
 */
export interface Keystone {
  id: string;
  area: Area;
  name: string;
  blurb: string;
  /** Trait deltas while fitted (seconds a lap scale, like the car's own traits). */
  fx: Partial<Record<Trait, number>>;
}

export const KEYSTONES: Keystone[] = [
  { id: "deep-floor", area: "aero", name: "Deep sealed floor", blurb: "Most of the downforce lives under the car, but it needs a stiff platform to hold.", fx: { downforce: 0.16, platform: -0.07, efficiency: 0.02 } },
  { id: "high-rake", area: "aero", name: "Steep rake", blurb: "Nose down feeds the floor and costs drag.", fx: { downforce: 0.1, efficiency: -0.08, warmup: 0.04 } },
  { id: "low-drag-wing", area: "aero", name: "Low-drag wing set", blurb: "Quick on the straights, nervous in the slow stuff.", fx: { efficiency: 0.14, downforce: -0.09 } },
  { id: "wide-outwash", area: "aero", name: "Outwash front wing", blurb: "Cleans the air round the front wheels and helps the floor behind.", fx: { downforce: 0.07, grip: 0.04, efficiency: -0.03 } },
  { id: "stiff-platform", area: "chassis", name: "Stiff platform", blurb: "Keeps the floor still, at the cost of bump grip and tyre life.", fx: { platform: 0.14, grip: -0.07, wear: -0.04 } },
  { id: "long-wheelbase", area: "chassis", name: "Long wheelbase", blurb: "Calm and kind to tyres, slower to turn in.", fx: { platform: 0.07, wear: 0.07, drive: 0.03, grip: -0.05 } },
  { id: "pullrod-front", area: "chassis", name: "Pull-rod front end", blurb: "Lets the nose sit low and clean, but is awkward to set up.", fx: { downforce: 0.06, platform: 0.04, grip: -0.04 } },
  { id: "light-tub", area: "chassis", name: "Light carbon tub", blurb: "Weight down, nothing else gives.", fx: { drive: 0.07, packaging: 0.05, platform: -0.03 } },
  { id: "big-inlets", area: "cooling", name: "Large cooling inlets", blurb: "The engine runs cool and hard, the air pays for it.", fx: { capacity: 0.14, output: 0.06, efficiency: -0.07 } },
  { id: "tight-sidepods", area: "cooling", name: "Undercut sidepods", blurb: "Frees the air for the rear, if the engine can stay cool.", fx: { packaging: 0.14, efficiency: 0.04, capacity: -0.09 } },
  { id: "water-cooled-ers", area: "cooling", name: "Remote ERS cooling", blurb: "Deploy more for longer, with a heavier plumbing job.", fx: { output: 0.1, capacity: 0.05, packaging: -0.06 } },
  { id: "soft-compound-setup", area: "tyres", name: "Soft-compound setup", blurb: "Heats the tyre fast and gets the lap time, then eats it.", fx: { warmup: 0.12, grip: 0.06, wear: -0.1 } },
  { id: "tyre-saver", area: "tyres", name: "Gentle geometry", blurb: "Kind to the rubber on long runs, slow to switch on.", fx: { wear: 0.12, warmup: -0.08 } },
  { id: "high-power-mode", area: "power", name: "High-power mode", blurb: "More output, hotter and thirstier.", fx: { output: 0.14, capacity: -0.06, drive: -0.02 } },
  { id: "driveability-map", area: "power", name: "Driveability maps", blurb: "Smoother pick-up out of slow corners.", fx: { drive: 0.12, output: -0.04 } },
];

/** Pairs that work together (or against each other) when both are fitted. */
export const PAIRS: { a: string; b: string; fx: Partial<Record<Trait, number>>; text: string }[] = [
  { a: "deep-floor", b: "stiff-platform", fx: { downforce: 0.08, platform: 0.08 }, text: "A deep floor on a stiff platform stays sealed, and the extra downforce is real." },
  { a: "deep-floor", b: "long-wheelbase", fx: { platform: -0.06 }, text: "A deep floor and a long wheelbase make the car slow to react, and it bounces." },
  { a: "high-rake", b: "pullrod-front", fx: { downforce: 0.07 }, text: "The pull-rod nose lets the rake work harder." },
  { a: "low-drag-wing", b: "tight-sidepods", fx: { efficiency: 0.07 }, text: "Low drag all round: the straights are the car's strength." },
  { a: "tight-sidepods", b: "big-inlets", fx: { capacity: -0.06, packaging: -0.06 }, text: "Tight sidepods and big inlets fight for the same space." },
  { a: "soft-compound-setup", b: "tyre-saver", fx: { warmup: -0.06, wear: -0.06 }, text: "Opposite ideas about the tyre: neither does its job." },
  { a: "high-power-mode", b: "water-cooled-ers", fx: { output: 0.07 }, text: "The cooling is there to run the engine hard." },
];

export const SLOTS = 3;
/** Tunnel hours a swap costs, and the share of what the team knows about the car that is lost. */
export const SWAP_HOURS = 60;
export const SWAP_FORGET = 1.2;

export const keystoneOf = (id: string) => KEYSTONES.find((k) => k.id === id);

export function fitted(t: TeamState): Keystone[] {
  return (t.keystones ?? []).map(keystoneOf).filter((k): k is Keystone => !!k);
}

/** Total trait overlay from the fitted keystones and any pairs among them. */
export function keystoneTraits(t: TeamState, override?: string[]): Record<Trait, number> {
  const ids = override ?? t.keystones ?? [];
  const out = {} as Record<Trait, number>;
  for (const tr of TRAITS) out[tr] = 0;
  for (const id of ids) {
    const k = keystoneOf(id);
    if (k) for (const tr of TRAITS) out[tr] += k.fx[tr] ?? 0;
  }
  for (const p of PAIRS) {
    if (ids.includes(p.a) && ids.includes(p.b)) for (const tr of TRAITS) out[tr] += p.fx[tr] ?? 0;
  }
  const lh = loopholeTraits(t);
  for (const tr of TRAITS) out[tr] = round2(out[tr] + (lh[tr] ?? 0));
  return out;
}

export function activePairs(ids: string[]) {
  return PAIRS.filter((p) => ids.includes(p.a) && ids.includes(p.b));
}

export function swapCost(t: TeamState): { hours: number; ok: boolean; why?: string } {
  const hours = SWAP_HOURS;
  if (t.tunnelLeft < hours) return { hours, ok: false, why: `A swap needs ${hours} tunnel hours and only ${Math.round(t.tunnelLeft)} are left.` };
  return { hours, ok: true };
}

/** Put a keystone in a slot (or empty it with null). Returns a message. */
export function setKeystone(s: CareerState, teamId: string, slot: number, id: string | null): { ok: boolean; message: string } {
  const t = s.teams[teamId];
  if (!t) return { ok: false, message: "No such team." };
  if (slot < 0 || slot >= SLOTS) return { ok: false, message: "No such slot." };
  const cur = (t.keystones ??= []);
  const was = cur[slot] ?? null;
  if (was === id) return { ok: true, message: "Already fitted." };
  if (id && !keystoneOf(id)) return { ok: false, message: "Unknown keystone." };
  if (id && cur.some((x, i) => x === id && i !== slot)) return { ok: false, message: "That keystone is already on the car." };
  const first = !was && cur.filter(Boolean).length === 0 && !t.keystonesSet;
  if (!first) {
    const c = swapCost(t);
    if (!c.ok) return { ok: false, message: c.why ?? "Not enough tunnel time." };
    t.tunnelLeft = Math.max(0, t.tunnelLeft - c.hours);
    for (const tr of TRAITS) {
      const k = t.know[tr];
      if (k) k.err = round2(k.err * SWAP_FORGET);
    }
  }
  cur[slot] = id as string;
  if (!id) cur.splice(slot, 1);
  t.keystonesSet = true;
  const k = id ? keystoneOf(id) : null;
  return { ok: true, message: k ? `${k.name} is on the car.` : "The slot is empty." };
}
