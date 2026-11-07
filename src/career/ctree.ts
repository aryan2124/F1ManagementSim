import { Rng, hashSeed } from "../sim/rng";
import { clamp, round2 } from "./util";
import { TRAITS } from "./types";
import { rulesOf } from "./eras";
import type { Area, CareerState, TeamState, Trait } from "./types";

/**
 * The car as a skill tree. Six main components, each with three branches (design philosophies) of four tiers. A new tree
 * is cut for every regulation era. What you can build is limited by the factory (slots), money and days; how deep you
 * can go in a branch depends on how much of the factory's work went into it (depth against breadth); the gain you are
 * promised is a range that narrows with what the team knows about that philosophy and with testing.
 */

export type CompId = "fw" | "rw" | "floor" | "pu" | "cool" | "susp";
export interface CompDef { id: CompId; name: string; area: Area; blurb: string }
export const COMPS: CompDef[] = [
  { id: "fw", name: "Front wing", area: "aero", blurb: "First to meet the air." },
  { id: "rw", name: "Rear wing", area: "aero", blurb: "Downforce and drag in one." },
  { id: "floor", name: "Floor", area: "aero", blurb: "Where most of the grip lives." },
  { id: "pu", name: "Power unit", area: "power", blurb: "Output and delivery." },
  { id: "cool", name: "Cooling", area: "cooling", blurb: "Heat out, reliability in." },
  { id: "susp", name: "Suspension", area: "chassis", blurb: "Platform, grip and tyres." },
];
export const COMP = (id: CompId) => COMPS.find((c) => c.id === id) as CompDef;

interface BranchTpl { name: string; main: Trait; mainSign?: 1 | -1; side?: Trait; sideSign?: 1 | -1; tiers: [string, string, string, string]; blurb: string }
const TPL: Record<CompId, BranchTpl[]> = {
  fw: [
    { name: "High load", main: "downforce", side: "efficiency", sideSign: -1, tiers: ["Wider mainplane", "Multi-flap stack", "Cascade array", "Full-load flap set"], blurb: "Grip at the front, drag paid." },
    { name: "Low drag", main: "efficiency", side: "downforce", sideSign: -1, tiers: ["Slim endplates", "Flat flap set", "Shallow cascade", "Minimal-drag nose"], blurb: "Quick on the straights." },
    { name: "Outwash", main: "grip", side: "efficiency", sideSign: -1, tiers: ["Outwash fences", "Y250 vortex", "Wheel-wake seal", "Full outwash set"], blurb: "Steers the air round the tyres." },
  ],
  rw: [
    { name: "Big wing", main: "downforce", side: "efficiency", sideSign: -1, tiers: ["Deeper profile", "Dual-element top", "Tall endplates", "Max-load rear wing"], blurb: "Plants the rear." },
    { name: "Slippery", main: "efficiency", side: "downforce", sideSign: -1, tiers: ["Trimmed flap", "Spoon section", "Slot-gap delete", "Low-drag rear set"], blurb: "Straight-line speed." },
    { name: "Beam wing", main: "platform", side: "downforce", sideSign: 1, tiers: ["Beam wing", "Twin beam", "Tuned diffuser link", "Coupled wing system"], blurb: "Keeps the floor working." },
  ],
  floor: [
    { name: "Deep tunnels", main: "downforce", side: "platform", sideSign: -1, tiers: ["Venturi throats", "Sealed edge", "Deep tunnel set", "Ground-effect maximum"], blurb: "Big grip, fussy platform." },
    { name: "Edge vortex", main: "efficiency", side: "downforce", sideSign: 1, tiers: ["Edge wing", "Fence row", "Vortex trimmer", "Tuned edge system"], blurb: "Clean flow, little drag." },
    { name: "Stiff floor", main: "platform", side: "grip", sideSign: -1, tiers: ["Stiffer plank mount", "Rigid carbon floor", "Active-free heave control", "Locked-ride floor"], blurb: "Steady over bumps." },
  ],
  pu: [
    { name: "Peak power", main: "output", side: "capacity", sideSign: -1, tiers: ["Higher boost", "Lean combustion", "High-rev window", "Qualifying mode"], blurb: "More output, more heat." },
    { name: "Driveability", main: "drive", side: "output", sideSign: -1, tiers: ["Torque maps", "Smooth pick-up", "Energy blend", "Predictive deploy"], blurb: "Power you can use." },
    { name: "Smart deploy", main: "output", side: "drive", sideSign: 1, tiers: ["Lap-aware deploy", "Harvest tuning", "Battery rebalance", "Full-lap optimiser"], blurb: "Energy in the right places." },
  ],
  cool: [
    { name: "Open inlets", main: "capacity", side: "efficiency", sideSign: -1, tiers: ["Larger inlets", "Louvred panels", "Twin radiators", "Maximum cooling"], blurb: "Runs cool, costs air." },
    { name: "Tight wrap", main: "packaging", side: "capacity", sideSign: -1, tiers: ["Undercut sidepods", "Shrink-wrap bodywork", "Packed engine bay", "Extreme packaging"], blurb: "Clean air, hot engine." },
    { name: "Remote", main: "capacity", side: "packaging", sideSign: 1, tiers: ["Remote radiator", "Split loop", "Heat exchanger", "Distributed cooling"], blurb: "Heavier plumbing, both gains." },
  ],
  susp: [
    { name: "Stiff", main: "platform", side: "grip", sideSign: -1, tiers: ["Firm springs", "Heave dampers", "Anti-dive geometry", "Rigid platform set"], blurb: "Aero loves it, kerbs do not." },
    { name: "Compliant", main: "grip", side: "platform", sideSign: -1, tiers: ["Softer springs", "Mass dampers", "Roll compliance", "Mechanical grip set"], blurb: "Mechanical grip." },
    { name: "Tyre kind", main: "wear", side: "warmup", sideSign: -1, tiers: ["Camber trim", "Gentle geometry", "Tyre-load balancing", "Long-run setup"], blurb: "Kind to the rubber." },
  ],
};

export interface TreeNode {
  id: string;
  comp: CompId;
  branch: 0 | 1 | 2;
  tier: 1 | 2 | 3 | 4;
  name: string;
  /** What the staff say it should do, trait deltas (seconds-a-lap scale). */
  fx: Partial<Record<Trait, number>>;
  /** $m, days of work at full speed, minimum skill of the engineers. */
  cost: number;
  days: number;
  labour: number;
  /** The hidden multiplier on the staff's number. */
  mult: number;
}
export interface TreePart { id: string; day: number; copies: 1 | 2; onA: boolean; onB: boolean; tested: boolean; /** A rushed fit that went wrong on that car: the part works at 40 percent until it is fitted again. */ misfit?: { A?: boolean; B?: boolean }; /** Seconds a lap measured in practice, per session. */ seen?: number[] }
export interface TreeBuild { id: string; progress: number; days: number }
export interface TreeTest { id: string; left: number; /** A trial of a part that is not built yet: it narrows the estimate but does not measure it. */ pre?: boolean }
/** A change to a car waiting on the mechanics. */
export interface FitJob { id: string; car: "A" | "B"; on: boolean; left: number; rush: boolean }
export const MISFIT = 0.4;
export const misfitOf = (p: TreePart, car: "A" | "B") => (p.misfit?.[car] ? MISFIT : 1);
export interface TreeState {
  era: number;
  nodes: TreeNode[];
  parts: Record<string, TreePart>;
  builds: TreeBuild[];
  tests: TreeTest[];
  /** Parts previewed in the simulator before they were built. */
  sims?: string[];
  /** Fit changes in the garage, days left each. */
  fits?: FitJob[];
  /** Branch expertise carried over from the last era (key `${comp}:${branch}`). */
  carry: Record<string, number>;
  /** A part that failed and went to one driver; waiting on the player's choice. */
  failed?: string;
  /** The era whose arrival letter was sent. */
  announced?: number;
  /** Effects of the leads' special cards, refreshed daily (see leadcards.ts). */
  mods?: { speed: number; cost: number; testDays: number; failure: number; gain: Partial<Record<CompId, number>> };
}

export const TIER_FX = [0.03, 0.05, 0.075, 0.105];
export const TIER_COST = [1, 1.9, 3.2, 5.5];
export const TIER_DAYS = [9, 15, 24, 36];
export const TIER_LABOUR = [0, 0, 66, 74];
/** Share of the factory's finished work that must sit in a branch before tier 3 and tier 4 open. */
export const DEEP_SHARE = [0, 0, 0.3, 0.45];

/**
 * How big each lane is, tuned so that every lane is the best choice on a real share of the circuits: the lane that helps
 * both traits is smaller per tier, so a flat, average track does not always pick it. (See tests/fitting.test.ts.)
 */
export const MAG: Record<CompId, [number, number, number]> = {
  fw: [1, 0.3, 1.45], rw: [1, 0.8, 0.6], floor: [1, 0.45, 1.3], pu: [1, 0.7, 0.35], cool: [1, 0.75, 0.55], susp: [1, 1.15, 0.8],
};
const r3 = (x: number) => Math.round(x * 1000) / 1000;
export const nodeKey = (c: CompId, b: number, t: number) => `${c}${b}${t}`;

/** The tree for an era, cut from a seed so it is the same whenever it is read. */
export function makeTree(seed: number, era: number, carry: Record<string, number> = {}): TreeState {
  const rng = new Rng(hashSeed(`ctree:${seed}:${era}`));
  const eraScale = 0.9 + rng.next() * 0.25;
  const nodes: TreeNode[] = [];
  for (const c of COMPS) {
    TPL[c.id].forEach((b, bi) => {
      for (let t = 0; t < 4; t++) {
        const g = TIER_FX[t] * eraScale * MAG[c.id][bi];
        const fx: Partial<Record<Trait, number>> = { [b.main]: r3(g * (b.mainSign ?? 1)) };
        if (b.side) fx[b.side] = r3(g * (t === 3 && (b.sideSign ?? 1) < 0 ? 0.8 : 0.45) * (b.sideSign ?? 1));
        // the outer ring is a keystone: big gain, and it always costs something (a synergy branch pays in tyre life)
        if (t === 3 && (b.sideSign ?? 1) > 0 && b.main !== "wear") fx.wear = r3(-g * 0.4);
        nodes.push({
          id: nodeKey(c.id, bi, t + 1), comp: c.id, branch: bi as 0 | 1 | 2, tier: (t + 1) as 1 | 2 | 3 | 4, name: b.tiers[t], fx,
          cost: round2(TIER_COST[t] * (0.9 + rng.next() * 0.25)), days: Math.round(TIER_DAYS[t] * (0.9 + rng.next() * 0.25)), labour: TIER_LABOUR[t],
          mult: round2(clamp(1 + rng.gauss() * 0.28, 0.55, 1.4)),
        });
      }
    });
  }
  return { era, nodes, parts: {}, builds: [], tests: [], carry };
}

export const branchName = (c: CompId, b: number) => TPL[c][b].name;
export const branchBlurb = (c: CompId, b: number) => TPL[c][b].blurb;

export function eraKey(s: CareerState): number {
  return s.era.current?.startYear ?? 0;
}
/** How far through the regulation era we are, 0 to 1. */
export function eraProgress(s: CareerState): number {
  const e = s.era.current;
  if (!e) return 0;
  return clamp((s.year - e.startYear + 0.5) / Math.max(1, e.length), 0, 1);
}

/** The tree for this team, cut again when a new era begins (some expertise carries over). */
export function treeOf(s: CareerState, t: TeamState): TreeState {
  const key = eraKey(s);
  if (!t.tree) t.tree = makeTree(s.seed, key);
  else if (t.tree.era !== key) {
    const old = t.tree;
    const carry: Record<string, number> = {};
    for (const c of COMPS) for (let b = 0; b < 3; b++) {
      const e = expertise(old, c.id, b);
      if (e > 0) carry[`${c.id}:${b}`] = round2(e * 0.4);
    }
    t.tree = makeTree(s.seed, key, carry);
  }
  return t.tree;
}

export const nodeOf = (tr: TreeState, id: string) => tr.nodes.find((n) => n.id === id);
export const isBuilt = (tr: TreeState, id: string) => !!tr.parts[id];
export const isBuilding = (tr: TreeState, id: string) => tr.builds.some((b) => b.id === id);

/** Finished work in a branch, plus what carried over from the last era. */
export function expertise(tr: TreeState, comp: CompId, branch: number): number {
  let n = tr.carry[`${comp}:${branch}`] ?? 0;
  for (const p of Object.values(tr.parts)) {
    const nd = nodeOf(tr, p.id);
    if (nd && nd.comp === comp && nd.branch === branch) n += 1 + (p.tested ? 0.4 : 0);
  }
  return round2(n);
}
export function totalWork(tr: TreeState): number {
  let n = 0;
  for (const p of Object.values(tr.parts)) n += 1 + (p.tested ? 0.4 : 0);
  n += 0.5 * tr.builds.length;
  return n;
}
/** Share of all the factory's work that sits in this branch (what decides how deep it can go). */
export function branchShare(tr: TreeState, comp: CompId, branch: number): number {
  const tot = totalWork(tr);
  if (tot <= 0) return 1;
  let mine = 0;
  for (const p of Object.values(tr.parts)) {
    const nd = nodeOf(tr, p.id);
    if (nd && nd.comp === comp && nd.branch === branch) mine += 1 + (p.tested ? 0.4 : 0);
  }
  for (const b of tr.builds) { const nd = nodeOf(tr, b.id); if (nd && nd.comp === comp && nd.branch === branch) mine += 0.5; }
  return mine / tot;
}
/** How well the team understands a branch's philosophy, 0 to 1. Narrows the range on what a part will do. */
export function know(tr: TreeState, comp: CompId, branch: number): number {
  return clamp(0.2 + 0.17 * expertise(tr, comp, branch), 0, 0.95);
}

export interface Lock { ok: boolean; why?: string; state: "built" | "building" | "available" | "locked" | "deep" | "labour" | "capped" | "frozen" }

export function skillOfFactory(s: CareerState, teamId: string): number {
  const roles = ["td", "designer", "aero", "power"];
  const xs = Object.values(s.staff).filter((x) => x.teamId === teamId && !x.intern && roles.includes(x.role)).map((x) => x.skill);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 66;
}
/** Parts that can be under construction at once. */
export function slotsOf(t: TeamState): number {
  return clamp(Math.floor(t.facilities.factory * 0.7) + 1, 1, 4);
}
/** Days of work done per working day: better people build faster. */
export function buildSpeed(s: CareerState, teamId: string): number {
  return clamp((skillOfFactory(s, teamId) / 70) * (s.teams[teamId]?.tree?.mods?.speed ?? 1), 0.6, 1.9);
}
export function frozen(s: CareerState, comp: CompId, flags: { freezeAreas?: Area[] }): boolean {
  void s;
  return (flags.freezeAreas ?? []).includes(COMP(comp).area);
}

/** The cost and time of a node now: the last stretch of an era is dearer, and tier four is dearest. */
export function priceOf(s: CareerState, nd: TreeNode): { cost: number; days: number } {
  const late = nd.tier === 4 ? 1 + 0.6 * eraProgress(s) : 1 + 0.25 * eraProgress(s);
  return { cost: round2(nd.cost * late * (s.teams[s.teamId]?.tree?.mods?.cost ?? 1)), days: Math.round(nd.days * late) };
}

export function lockOf(s: CareerState, t: TeamState, nd: TreeNode, flags: { freezeAreas?: Area[] } = {}): Lock {
  const tr = treeOf(s, t);
  if (isBuilt(tr, nd.id)) return { ok: false, state: "built" };
  if (isBuilding(tr, nd.id)) return { ok: false, state: "building" };
  if (frozen(s, nd.comp, flags)) return { ok: false, state: "frozen", why: "The rules freeze work in this area." };
  if (nd.tier > 1 && !isBuilt(tr, nodeKey(nd.comp, nd.branch, nd.tier - 1))) return { ok: false, state: "locked", why: "Build the part before it first." };
  const need = DEEP_SHARE[nd.tier - 1];
  if (need > 0) {
    const after = branchShare(tr, nd.comp, nd.branch);
    if (after < need) return { ok: false, state: "deep", why: `Needs ${Math.round(need * 100)}% of the factory's work in this branch (now ${Math.round(after * 100)}%). Go deeper in fewer places.` };
  }
  if (nd.tier === 4) {
    const done = Object.keys(tr.parts).filter((id) => { const n = nodeOf(tr, id); return n && n.comp === nd.comp && n.tier === 4; }).length;
    if (done >= 1) return { ok: false, state: "capped", why: "One finished branch per component. The others stay unfinished." };
    if (eraProgress(s) < 0.25) return { ok: false, state: "locked", why: "The deepest parts only become possible later in the era." };
  }
  const quota = rulesOf(s).upgradeQuota;
  if (quota !== undefined) {
    const yearStart = Date.UTC(s.year, 0, 1) / 86400000;
    const used = Object.values(tr.parts).filter((p) => p.day >= yearStart).length + tr.builds.length;
    if (used >= quota) return { ok: false, state: "capped", why: `The rules allow ${quota} new parts a season. All ${quota} are built or in the factory.` };
  }
  if (nd.labour > 0 && skillOfFactory(s, t.id) < nd.labour) return { ok: false, state: "labour", why: `Needs engineers of skill ${nd.labour}. Yours average ${Math.round(skillOfFactory(s, t.id))}.` };
  return { ok: true, state: "available" };
}

/** What a part does for the lap, in seconds gained (positive is faster; the screens show it as a minus lap time). */
export function lapOf(nd: TreeNode, fx: Partial<Record<Trait, number>> = nd.fx): number {
  let v = 0;
  for (const tr of TRAITS) v += fx[tr] ?? 0;
  // trait gain of 0.1 is about 0.1 s a lap on the clock's scale
  return round2(v);
}
export function rangeOf(s: CareerState, t: TeamState, nd: TreeNode): { lo: number; hi: number; mid: number; tested: boolean } {
  const tr = treeOf(s, t);
  const part = tr.parts[nd.id];
  const k = know(tr, nd.comp, nd.branch);
  const mid = lapOf(nd);
  if (part?.tested) {
    const truth = lapOf(nd, scaled(nd, nd.mult));
    return { lo: round2(truth - 0.004), hi: round2(truth + 0.004), mid: truth, tested: true };
  }
  if (tr.sims?.includes(nd.id)) {
    // a preview on the rig: centred nearer the truth with a tighter band, but not a measurement
    const truth = lapOf(nd, scaled(nd, nd.mult));
    const c = round2(mid + (truth - mid) * 0.75);
    const w = Math.abs(mid) * 0.12 + 0.004;
    return { lo: round2(c - w), hi: round2(c + w), mid: c, tested: false };
  }
  const half = Math.abs(mid) * 0.5 * (1 - k) + 0.004;
  return { lo: round2(mid - half), hi: round2(mid + half), mid, tested: false };
}
function scaled(nd: TreeNode, m: number): Partial<Record<Trait, number>> {
  const out: Partial<Record<Trait, number>> = {};
  for (const tr of TRAITS) if (nd.fx[tr] !== undefined) out[tr] = round2((nd.fx[tr] as number) * m);
  return out;
}

/** What fitted parts do to the car, as trait deltas. Half a part on one car is half the effect on the team's number. */
export function treeTraits(t: TeamState, car?: "A" | "B"): Partial<Record<Trait, number>> {
  const out: Partial<Record<Trait, number>> = {};
  const tr = t.tree;
  if (!tr) return out;
  for (const p of Object.values(tr.parts)) {
    const nd = nodeOf(tr, p.id);
    if (!nd) continue;
    // for one car: the full gain if the part is on that car; with no car named, the team average of the two
    const on = car ? ((car === "A" ? p.onA : p.onB) ? misfitOf(p, car) : 0) : (p.onA ? 0.5 * misfitOf(p, "A") : 0) + (p.onB ? 0.5 * misfitOf(p, "B") : 0);
    if (on <= 0) continue;
    const f = scaled(nd, nd.mult * (tr.mods?.gain[nd.comp] ?? 1));
    for (const k of TRAITS) if (f[k] !== undefined) out[k] = round2((out[k] ?? 0) + (f[k] as number) * on);
  }
  return out;
}

// ---------------------------------------------------------------- actions

export function startBuild(s: CareerState, t: TeamState, id: string, flags: { freezeAreas?: Area[] } = {}): { ok: boolean; message: string } {
  const tr = treeOf(s, t);
  const nd = nodeOf(tr, id);
  if (!nd) return { ok: false, message: "No such part." };
  const lk = lockOf(s, t, nd, flags);
  if (!lk.ok) return { ok: false, message: lk.why ?? "Not available." };
  if (tr.builds.length >= slotsOf(t)) return { ok: false, message: `The factory is full: ${slotsOf(t)} parts at a time.` };
  const pr = priceOf(s, nd);
  if (t.cash < pr.cost) return { ok: false, message: "Not enough cash." };
  t.cash = round2(t.cash - pr.cost);
  t.capSpent = round2(t.capSpent + pr.cost);
  t.ledger.rnd = round2(t.ledger.rnd + pr.cost);
  tr.builds.push({ id, progress: 0, days: pr.days });
  return { ok: true, message: `${nd.name} is in the factory: ${pr.days} days, ${pr.cost.toFixed(1)}m for both cars.` };
}

export function scrapBuild(t: TeamState, id: string) {
  if (t.tree) t.tree.builds = t.tree.builds.filter((b) => b.id !== id);
}

export function startTest(s: CareerState, t: TeamState, id: string): { ok: boolean; message: string } {
  const tr = treeOf(s, t);
  const part = tr.parts[id];
  const nd = nodeOf(tr, id);
  if (!nd) return { ok: false, message: "No such part." };
  if (part?.tested) return { ok: false, message: "Already tested." };
  if (!part && tr.sims?.includes(id)) return { ok: false, message: "Already previewed. Build it to measure it properly." };
  if (!part && tr.builds.some((b) => b.id === id)) return { ok: false, message: "It is being built. Test it when it arrives." };
  if (tr.tests.some((x) => x.id === id)) return { ok: false, message: "Already in the simulator." };
  if (!part) {
    const lk = lockOf(s, t, nd, {});
    if (lk.state === "locked" || lk.state === "deep") return { ok: false, message: lk.why ?? "Not available yet." };
  }
  const cost = part ? 0.4 : 0.25;
  if (t.cash < cost) return { ok: false, message: "Not enough cash." };
  t.cash = round2(t.cash - cost);
  t.ledger.rnd = round2(t.ledger.rnd + cost);
  tr.tests.push({ id, left: tr.mods?.testDays ?? 4, pre: !part });
  return { ok: true, message: part ? "In the simulator for four days. The result is firmer the better the team knows this philosophy." : "A model of it is on the rig for four days. You get a tighter estimate before you spend on the real part." };
}

export function install(s: CareerState, t: TeamState, id: string, car: "A" | "B", on: boolean): { ok: boolean; message: string } {
  const tr = treeOf(s, t);
  const p = tr.parts[id];
  if (!p) return { ok: false, message: "Not built." };
  if (s.weekend && s.weekend.stage !== "practice" && s.weekend.stage !== "done") return { ok: false, message: "Parc ferme: the cars are locked until after the race." };
  const nd = nodeOf(tr, id);
  if (on && nd) {
    // one part per slot of the car: a rival branch of the same tier replaces it
    for (const q of Object.values(tr.parts)) {
      const m = nodeOf(tr, q.id);
      if (m && q.id !== id && m.comp === nd.comp && m.tier === nd.tier && (car === "A" ? q.onA : q.onB)) { if (car === "A") q.onA = false; else q.onB = false; }
    }
    const used = (p.onA ? 1 : 0) + (p.onB ? 1 : 0) - (car === "A" ? (p.onA ? 1 : 0) : (p.onB ? 1 : 0));
    if (used + 1 > p.copies) return { ok: false, message: "Only one of this part is left." };
  }
  if (car === "A") p.onA = on; else p.onB = on;
  return { ok: true, message: on ? `Fitted to car ${car}.` : `Taken off car ${car}.` };
}

/** One working day in the factory. Returns the ids that finished building and testing. */
export function tickTree(s: CareerState, t: TeamState): { built: string[]; tested: string[] } {
  const out = { built: [] as string[], tested: [] as string[] };
  const tr = t.tree;
  if (!tr) return out;
  const speed = buildSpeed(s, t.id);
  for (const b of tr.builds) b.progress += speed;
  const done = tr.builds.filter((b) => b.progress >= b.days);
  tr.builds = tr.builds.filter((b) => b.progress < b.days);
  for (const b of done) {
    tr.parts[b.id] = { id: b.id, day: s.day, copies: 2, onA: false, onB: false, tested: false };
    out.built.push(b.id);
  }
  for (const x of tr.tests) x.left -= 1;
  const finished = tr.tests.filter((x) => x.left <= 0);
  tr.tests = tr.tests.filter((x) => x.left > 0);
  for (const x of finished) {
    const p = tr.parts[x.id];
    if (p) { p.tested = true; out.tested.push(x.id); }
    else if (x.pre) { tr.sims = [...(tr.sims ?? []), x.id]; out.tested.push(x.id); }
  }
  return out;
}
