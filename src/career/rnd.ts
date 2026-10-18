import { ideaDrag } from "./nextcar";
import { setbackOf } from "./poach";
import { CFG } from "./config";
import { staffOf, standingsRank } from "./car";
import { factoryClosed, newYearDay, summerEnd } from "./calendar";
import { clamp, isHuman, nextId, rngFor, round2 } from "./util";
import { AREAS, type Area, type CareerState, type Idea, type Project, type Size, type Staff, type TeamState, type Trait } from "./types";
import { AREA_TRAITS, TRAIT_GAIN_K, addTrait, conceptFit } from "./traits";
import { leadFor, leadSkill } from "./capability";
import { designOf, designWorth, DESIGN_KEYS } from "./design";
import { TRAIT_AREA, TRAIT_NAME } from "./traits";
import { onBacked, onFit, onScrap, rookieCandidate } from "./dev";
import { believeFit, correct, facilityFor } from "./know";
import type { Rng } from "../sim/rng";
import { rulesOf } from "./eras";
import { news } from "./cards";
import { logSpend } from "./log";
import { activePlan, areaChance, pickKind, planOf } from "./rndplan";
import { briefActive as briefOf } from "./brief";
import { fmtMoney } from "./util";
import { factorsOf } from "./factors";

const NAMES: Record<Area, string[]> = {
  aero: ["Revised front wing endplates", "New beam wing", "Sidepod inlet reshape", "Rear wing profile", "Engine cover and shoulder", "Brake duct winglets"],
  chassis: ["Lighter monocoque panels", "Suspension geometry update", "Weight distribution rework", "Floor edge stiffness", "Cockpit and airbox package", "Rear corner kinematics"],
  power: ["Combustion tweak", "Energy recovery software", "Turbo response map", "Reliability fix: gearbox", "Battery cooling and output", "Fuel flow management"],
  cooling: ["Radiator inlet package", "Tighter rear bodywork", "Cooling louvre redesign", "Heat shield rework", "Exit duct reshape", "Intercooler layout"],
  tyres: ["Front tyre warm-up map", "Rear damper work", "Thermal management ducts", "Suspension compliance", "Tyre pressure targets", "Kerb handling update"],
};
const TUNNEL_AREAS: Area[] = ["aero", "chassis", "cooling"];
export const usesTunnel = (a: Area) => TUNNEL_AREAS.includes(a);

/** How well this team's staff can read their own ideas, 0..1. */
export function accuracy(s: CareerState, teamId: string, area: Area, trait?: Trait, lead?: Staff): number {
  const t = s.teams[teamId];
  const tr = trait ?? AREA_TRAITS[area][0];
  const des = staffOf(s, teamId, "designer");
  const td = staffOf(s, teamId, "td");
  const data = staffOf(s, teamId, "data");
  const ls = leadSkill(s, teamId, tr, lead);
  const skill = ls.skill * 0.7 + (td?.skill ?? 60) * 0.3;
  let acc = clamp((skill - 35) / 55, 0, 1) + 0.04 * (t.facilities[facilityFor(area)] - 3) + 0.1 * clamp(((data?.skill ?? 45) - 45) / 50, 0, 1);
  if (des?.traits.includes("data-driven") || td?.traits.includes("data-driven") || data?.traits.includes("data-driven")) acc += 0.08;
  // a team that knows its own car reads its ideas better
  acc *= factorsOf(s, teamId).knowledge.value;
  return clamp(acc, 0.05, 1);
}

/** Which trait the factory proposes work on: usually what it believes is weakest, sometimes a guess. */
function pickTrait(t: TeamState, area: Area, rng: Rng, acc: number): Trait {
  const [x, y] = AREA_TRAITS[area];
  if (rng.next() < 0.3 + 0.45 * acc) return t.know[x].est <= t.know[y].est ? x : y;
  return rng.chance(0.5) ? x : y;
}

function areaAverage(s: CareerState, area: Area): number {
  const ts = Object.values(s.teams);
  return ts.reduce((a, t) => a + t.car[area], 0) / ts.length;
}

function makeIdea(s: CareerState, t: TeamState, area: Area, rng: Rng, kind: NonNullable<Idea["kind"]> = "safe", want?: { trait?: Trait; lead?: Staff; size?: Size }): Idea {
  const trait = want?.trait ?? pickTrait(t, area, rng, accuracy(s, t.id, area));
  const lead = want?.lead ?? leadFor(s, t.id, trait);
  const wL = t.philosophy === "gamble" ? 0.28 : 0.15;
  const r = rng.next();
  const size: Size = want?.size ?? (r < wL ? "L" : r < wL + 0.4 ? "M" : "S");
  const sz = CFG.sizes[size];
  const ahead = t.car[area] - areaAverage(s, area);
  const dim = clamp(1 - 0.9 * ahead / 0.6, 0.35, 1.6);
  const td0 = staffOf(s, t.id, "td");
  const ls = leadSkill(s, t.id, trait, lead);
  const prod = clamp(1 + (((td0?.skill ?? 65) + ls.skill) / 2 - 70) * 0.012, 0.7, 1.35) * (0.92 + 0.16 * conceptFit(t.concept, trait));
  const rules = rulesOf(s);
  const mult = rules.areaMult?.[area] ?? 1;
  const plan = s.era.next ? s.era.plans[t.id] : undefined;
  const split = plan ? plan.split : 0;
  const fx = factorsOf(s, t.id);
  // gain = base x talent of the lead x tools x knowledge x cohesion of the office x funding
  const sysMul = fx.talent.value * fx.tools.value * fx.knowledge.value * fx.cohesion.value * (0.96 + 0.08 * fx.funding.value);
  const trueGain = round2((sz.lo + (sz.hi - sz.lo) * rng.next()) * dim * prod * mult * sysMul * (1 - 0.7 * split));
  const acc = accuracy(s, t.id, area, trait, lead);
  const des = staffOf(s, t.id, "designer");
  const innov = des?.traits.includes("innovator");
  const cautious = des?.traits.includes("cautious");
  const noise = rng.gauss() * (1 - acc) * 0.5 * (sz.lo + sz.hi) * 0.5;
  let mid = Math.max(0.005, trueGain + noise);
  let hw = (sz.lo + sz.hi) * 0.5 * (0.5 - 0.32 * acc);
  if (innov) {
    mid *= 1.15;
    hw *= 1.3;
  }
  if (cautious) {
    mid *= 0.88;
    hw *= 0.8;
  }
  let tg = trueGain;
  let note: string | undefined;
  let costMul = 1;
  let daysMul = 1;
  if (kind === "safe") {
    hw *= 0.7;
    tg = round2(trueGain * 0.9);
    mid = Math.max(0.005, tg + noise * 0.6);
  } else if (kind === "gamble") {
    const u = rng.next();
    tg = round2(u < 0.4 ? trueGain * 1.9 : u < 0.78 ? trueGain * 0.15 : -trueGain * 0.5);
    mid = Math.max(0.01, trueGain * 1.1 + noise);
    hw = mid * 1.0 + hw * 0.5;
    note = "A radical idea. The staff cannot say how it will go.";
  } else {
    tg = round2(trueGain * 0.25);
    mid = Math.max(0.005, tg + noise * 0.3);
    hw = hw * 0.4;
    costMul = 0.7;
    daysMul = 0.8;
    note = "Groundwork: the next part you fit in this area gains about 35 percent more.";
  }
  const names = NAMES[area];
  const factory = 1 - 0.06 * (t.facilities.factory - 3);
  return {
    id: nextId(s),
    area,
    size,
    name: names[Math.floor(rng.next() * names.length)],
    cost: round2(sz.cost * rng.range(0.9, 1.15) * costMul),
    days: Math.max(4, Math.round(sz.days * factory * rng.range(0.9, 1.15) * daysMul)),
    tunnelHours: usesTunnel(area) ? Math.round(sz.hours * rng.range(0.9, 1.1)) : 0,
    predLo: round2(kind === "gamble" ? mid - hw : Math.max(0.0, mid - hw)),
    predHi: round2(mid + hw),
    trueGain: tg,
    created: s.day,
    expires: s.day + CFG.ideaLife,
    kind,
    note,
    trait,
    lead: lead?.id,
  };
}

/** The player designs a part: they choose the trait, the size of the effort and who leads it. The factory costs and times it as for any idea. */
export function designPart(s: CareerState, teamId: string, area: Area, trait: Trait, kind: NonNullable<Idea["kind"]>, leadId?: string, size?: Size): { ok: boolean; why?: string; idea?: Idea } {
  const t = s.teams[teamId];
  if (!AREA_TRAITS[area].includes(trait)) return { ok: false, why: "That trait is not in that area." };
  if ((rulesOf(s).freezeAreas ?? []).includes(area)) return { ok: false, why: "That area is frozen under the current rules." };
  const mine = t.ideas.filter((i) => i.area === area).length;
  if (mine >= CFG.maxIdeasPerArea + 2) return { ok: false, why: "There are already enough proposals on the table in that area." };
  const lead = leadId ? s.staff[leadId] : undefined;
  if (leadId && (!lead || lead.teamId !== teamId)) return { ok: false, why: "That person does not work for you." };
  const idea = makeIdea(s, t, area, rngFor(s, `design:${teamId}:${s.day}:${s.uid++}`), kind, { trait, lead, size });
  idea.name = `${idea.name} (${trait})`;
  t.ideas.push(idea);
  return { ok: true, idea };
}

/**
 * The design office's answer to a brief: three different ways of attacking the same problem.
 * A quick fix is cheap and fast and small. A proper job is the solid middle. A rethink is bigger and slower, its gain is a real gamble,
 * and it costs something on the partner trait that the staff can state exactly.
 */
export function proposeApproaches(s: CareerState, teamId: string, trait: Trait): Idea[] {
  const t = s.teams[teamId];
  const area = TRAIT_AREA[trait];
  const rng = rngFor(s, `approach:${teamId}:${s.day}:${trait}`);
  const lead = leadFor(s, teamId, trait);
  const out: Idea[] = [];
  const quick = makeIdea(s, t, area, rng, "safe", { trait, lead, size: "S" });
  quick.approach = "quick";
  quick.name = `Quick fix: ${quick.name.toLowerCase()}`;
  quick.cost = round2(quick.cost * 0.55);
  quick.days = Math.max(4, Math.round(quick.days * 0.5));
  quick.tunnelHours = Math.round(quick.tunnelHours * 0.4);
  quick.note = "Cheap and fast, and it does not tie up the wind tunnel for long. The gain is small.";
  out.push(quick);
  const proper = makeIdea(s, t, area, rng, "safe", { trait, lead, size: "M" });
  proper.approach = "proper";
  proper.name = `Proper job: ${proper.name.toLowerCase()}`;
  proper.note = "The solid middle: a real gain at a normal price and a normal time.";
  out.push(proper);
  const re = makeIdea(s, t, area, rng, "gamble", { trait, lead, size: "L" });
  re.approach = "rethink";
  re.name = `Rethink: ${re.name.toLowerCase()}`;
  re.days = Math.round(re.days * 1.25);
  re.cost = round2(re.cost * 1.2);
  const [x, y] = AREA_TRAITS[area];
  const partner: Trait = trait === x ? y : x;
  const mid = (re.predLo + re.predHi) / 2;
  re.side = { trait: partner, amount: round2(Math.max(0.01, 0.3 * mid)) };
  re.note = `A new concept for ${TRAIT_NAME[trait].toLowerCase()}. It could be big, do nothing, or go backwards, and it costs ${TRAIT_NAME[partner].toLowerCase()} for certain.`;
  out.push(re);
  for (const i of out) { t.ideas.push(i); }
  return out;
}

/** Puts a hand-made idea on the table (from an event). `gainMul` scales its real gain. */
export function injectIdea(s: CareerState, teamId: string, area: Area, kind: NonNullable<Idea["kind"]>, opts: { gainMul?: number; costMul?: number; daysMul?: number; note?: string; name?: string } = {}): Idea {
  const t = s.teams[teamId];
  const idea = makeIdea(s, t, area, rngFor(s, `inj:${s.day}:${area}:${kind}`), kind);
  const g = opts.gainMul ?? 1;
  idea.trueGain = round2(idea.trueGain * g);
  idea.predLo = round2(idea.predLo * g);
  idea.predHi = round2(idea.predHi * g);
  if (opts.costMul) idea.cost = round2(idea.cost * opts.costMul);
  if (opts.daysMul) idea.days = Math.max(3, Math.round(idea.days * opts.daysMul));
  if (opts.note) idea.note = opts.note;
  if (opts.name) idea.name = opts.name;
  idea.expires = s.day + 42;
  t.ideas.push(idea);
  return idea;
}

/** Each week the factory proposes new ideas, a few per area at most. */
export function generateIdeas(s: CareerState, teamId: string): Idea[] {
  const t = s.teams[teamId];
  t.ideas = t.ideas.filter((i) => i.expires >= s.day);
  const rng = rngFor(s, `ideas:${teamId}`);
  const td = staffOf(s, teamId, "td");
  const bonus = clamp(((td?.skill ?? 60) - 55) / 100 - setbackOf(s, teamId), -0.4, 0.3);
  const fresh: Idea[] = [];
  const frozen = rulesOf(s).freezeAreas ?? [];
  const plan = teamId === s.teamId ? activePlan(s, t) : { ...planOf(t), focus: "balanced" as const, stance: t.philosophy === "gamble" ? ("bold" as const) : ("balanced" as const) };
  const slow = (t.dev?.slowUntil ?? 0) > s.day;
  if (isHuman(s, teamId) && !slow) {
    const rk = rookieCandidate(s, teamId);
    if (rk && !frozen.includes(rk.area)) {
      const idea = makeIdea(s, t, rk.area, rng, "gamble", { lead: rk.st });
      idea.rookie = true;
      idea.note = `A trainee's own idea: ${rk.st.name}.`;
      idea.name = `${rk.st.name.split(" ").slice(-1)[0]}'s ${idea.name}`;
      t.ideas.push(idea);
      fresh.push(idea);
    }
  }
  const brief = isHuman(s, teamId) ? briefOf(s, teamId) : undefined;
  if (brief && !slow && !frozen.includes(brief.area)) {
    // a week after the brief the office comes back with its answers; once the table is cleared they return with a follow-up round every ten days
    const due = brief.lastGen === undefined ? s.day - brief.day >= 7 : s.day - brief.lastGen >= 10 && !t.ideas.some((i) => i.approach);
    if (due) {
      brief.made = true;
      brief.lastGen = s.day;
      for (const i of proposeApproaches(s, teamId, brief.trait)) fresh.push(i);
    }
    // outside the brief only the odd stray idea turns up, and it says so
    if (rng.next() < 0.1) {
      const area = AREAS.filter((a) => a !== brief.area && !frozen.includes(a))[Math.floor(rng.next() * (AREAS.length - 1))];
      if (area && t.ideas.filter((i) => i.area === area).length < CFG.maxIdeasPerArea) {
        const idea = makeIdea(s, t, area, rng, pickKind(plan, rng.next()));
        idea.offBrief = true;
        idea.name = `Off-brief: ${idea.name.toLowerCase()}`;
        t.ideas.push(idea);
        fresh.push(idea);
      }
    }
    return fresh;
  }
  for (const area of AREAS) {
    if (frozen.includes(area)) continue;
    if (slow && isHuman(s, teamId) && rng.next() < 0.6) continue;
    const have = t.ideas.filter((i) => i.area === area).length;
    if (have >= CFG.maxIdeasPerArea) continue;
    if (rng.next() < areaChance(plan, area, (0.45 + bonus) * ideaDrag(s, teamId))) {
      const idea = makeIdea(s, t, area, rng, pickKind(plan, rng.next()));
      t.ideas.push(idea);
      fresh.push(idea);
    }
  }
  return fresh;
}

export const maxConcurrent = (t: TeamState) => 3 + (t.facilities.factory >= 4 ? 1 : 0) + (t.facilities.factory >= 5 ? 1 : 0);
export const capRoom = (t: TeamState) => round2(t.capLimit - CFG.capBaseProgramme - t.capSpent);

export function startProject(s: CareerState, teamId: string, ideaId: number): { ok: boolean; why?: string } {
  const t = s.teams[teamId];
  const idea = t.ideas.find((i) => i.id === ideaId);
  if (!idea) return { ok: false, why: "That idea is gone." };
  if (t.projects.filter((p) => p.status === "building").length >= maxConcurrent(t)) return { ok: false, why: "The factory is at its limit of running projects." };
  t.ideas = t.ideas.filter((i) => i.id !== ideaId);
  const plan = planOf(t);
  let cost = idea.cost;
  let cheap = false;
  if (s.day <= plan.cheapUntil) { cost = round2(cost * 0.85); cheap = true; }
  if (plan.focus === "bank") { cost = round2(cost * 0.9); plan.focus = "balanced"; }
  idea.cost = cost;
  t.capSpent = round2(t.capSpent + idea.cost);
  t.ledger.costs += 0;
  const p: Project = {
    id: idea.id,
    area: idea.area,
    size: idea.size,
    name: idea.name,
    cost: idea.cost,
    days: idea.days,
    tunnelHours: idea.tunnelHours,
    predLo: idea.predLo,
    predHi: idea.predHi,
    trueGain: idea.trueGain,
    start: s.day,
    progress: 0,
    status: "building",
    hold: false,
    kind: idea.kind,
    cheap,
    trait: idea.trait,
    lead: idea.lead,
    approach: idea.approach,
    side: idea.side,
  };
  if (idea.rookie) p.rookie = true;
  t.projects.push(p);
  onBacked(s, teamId, p);
  if (teamId === s.teamId) {
    t.ledger.rnd = round2(t.ledger.rnd + idea.cost);
    logSpend(s, `Started "${idea.name}" (${idea.area}): ${idea.days} days${idea.tunnelHours ? `, up to ${idea.tunnelHours} tunnel hours` : ""}`, { cap: -idea.cost });
  }
  return { ok: true };
}

export function scrapProject(s: CareerState, teamId: string, id: number) {
  const t = s.teams[teamId];
  const p = t.projects.find((x) => x.id === id);
  if (!p || p.status === "fitted" || p.status === "scrapped") return;
  // half the cap room comes back if it is scrapped before it is half done
  let back = 0;
  if (p.status === "building" && p.progress < p.days * 0.5) {
    back = round2(p.cost * 0.5);
    t.capSpent = round2(t.capSpent - back);
  }
  p.status = "scrapped";
  onScrap(s, teamId, p);
  if (teamId === s.teamId) logSpend(s, `Scrapped "${p.name}"${back ? `: ${fmtMoney(back)} of cap room came back` : ": nothing came back"}`, { cap: back });
}

/** One day of work. Returns the projects that finished today. */
export function tickRnd(s: CareerState, teamId: string): Project[] {
  const t = s.teams[teamId];
  const done: Project[] = [];
  if (factoryClosed(s.day, s.year)) return done;
  const fxs = factorsOf(s, teamId);
  const speed = (1 + 0.06 * (t.facilities.factory - 3)) * fxs.tools.value * fxs.talent.value * fxs.cohesion.value;
  for (const p of t.projects) {
    if (p.status !== "building") continue;
    const need = p.tunnelHours > 0 ? p.tunnelHours / p.days : 0;
    if (need > t.tunnelLeft) continue; // stalled until the allowance resets
    t.tunnelLeft = Math.max(0, t.tunnelLeft - need);
    p.tunnelUsed = round2((p.tunnelUsed ?? 0) + need);
    p.progress += speed;
    if (p.progress >= p.days) {
      p.status = "ready";
      done.push(p);
    }
  }
  return done;
}

/** Sliding aerodynamic testing allowance: the better a team ranks the fewer hours it gets. Resets in January and after the summer break. */
export function resetAllowance(s: CareerState, when: "year" | "summer" = "summer") {
  // January uses last season's final order; the mid-season reset uses the table as it stands now
  const rank = when === "year" && s.prevOrder?.length === Object.keys(s.teams).length ? s.prevOrder : standingsRank(s);
  const n = rank.length;
  rank.forEach((id, i) => {
    const t = s.teams[id];
    const factor = 0.7 + (0.45 * i) / Math.max(1, n - 1);
    const lvl = 1 + 0.05 * (t.facilities.tunnel - 3);
    const carry = rulesOf(s).tunnelBank ? Math.round(t.tunnelLeft * 0.5) : 0;
    t.tunnelTotal = Math.max(100, Math.round(CFG.tunnelBaseHours * factor * lvl * (0.95 + 0.1 * factorsOf(s, id).funding.value)) + carry - (t.tunnelDebt ?? 0));
    t.tunnelDebt = 0;
    t.tunnelLeft = t.tunnelTotal;
    // CFD runs follow the same sliding scale and are cheaper to run than the tunnel
    t.cfdTotal = Math.round(t.tunnelTotal * 0.8 * (1 + 0.04 * (t.facilities.sim - 3)));
    t.cfdLeft = t.cfdTotal;
    if (id === s.teamId) logSpend(s, `Wind tunnel allowance reset to ${t.tunnelTotal} hours${carry ? ` (includes ${carry} carried over)` : ""}`, { tunnel: t.tunnelTotal });
  });
}

/** Fit every finished part that is not held back. Returns what was fitted. */
export function fitParts(s: CareerState, teamId: string): Project[] {
  const t = s.teams[teamId];
  const out: Project[] = [];
  const quota = rulesOf(s).upgradeQuota;
  let used = t.projects.filter((p) => p.status === "fitted" && p.fittedYear === s.year).length;
  for (const p of t.projects) {
    if (p.status !== "ready" || p.hold) continue;
    if (quota !== undefined && used >= quota) continue;
    used++;
    p.fittedYear = s.year;
    const cp = rulesOf(s).customerParts;
    if (cp) {
      t.cash = round2(t.cash + p.cost * cp);
      if (teamId === s.teamId) logSpend(s, `Sold the design of "${p.name}" to customer teams`, { cash: round2(p.cost * cp) });
    }
    const plan = planOf(t);
    if (p.kind === "enabler") {
      plan.synergy[p.area] = Math.min(0.7, (plan.synergy[p.area] ?? 0) + 0.35);
    } else if ((plan.synergy[p.area] ?? 0) > 0 && p.trueGain > 0) {
      p.trueGain = round2(p.trueGain * (1 + (plan.synergy[p.area] ?? 0)));
      plan.synergy[p.area] = 0;
      if (teamId === s.teamId) news(s, `The groundwork paid off: "${p.name}" gets a boost.`, { importance: 1, tag: "people" });
    }
    if (p.cheap && rngFor(s, `cheap:${p.id}`).chance(0.3)) {
      p.trueGain = round2(p.trueGain * 0.6);
      if (teamId === s.teamId) news(s, `"${p.name}" underdelivered: the cheaper supplier cut corners.`, { importance: 1, tag: "people" });
    }
    if (p.unbriefed && p.trueGain > 0) {
      p.trueGain = round2(p.trueGain * CFG.unbriefedFactor);
      if (teamId === s.teamId) news(s, `"${p.name}" was built to a general spec because nobody briefed the team, and gives up a little.`, { importance: 1, tag: "people" });
    }
    p.status = "fitted";
    onFit(s, teamId, p);
    p.fittedRound = s.round + 1;
    const mid = (p.predLo + p.predHi) / 2;
    p.delivered = p.trueGain;
    const tr = p.trait ?? AREA_TRAITS[p.area][0];
    addTrait(t, tr, round2(p.trueGain * TRAIT_GAIN_K));
    if (p.side) {
      // the price of a rethink is paid in full, and the team knows it
      addTrait(t, p.side.trait, -round2(p.side.amount * TRAIT_GAIN_K));
      if (teamId === s.teamId) news(s, `"${p.name}" cost ${TRAIT_NAME[p.side.trait].toLowerCase()}, as the staff said it would.`, { importance: 1, tag: "people" });
    }
    believeFit(t, tr, mid, p.size === "L" ? 2 : p.size === "M" ? 1 : 0);
    out.push(p);
  }
  return out;
}

/** Truth found at the track: the player's belief about their car is corrected. */
export function revealPart(s: CareerState, teamId: string, p: Project) {
  const t = s.teams[teamId];
  const tr = p.trait ?? AREA_TRAITS[p.area][0];
  correct(t, tr, 0.9);
}

// ---------------------------------------------------------------- the other ten teams

/** How much of the year's research budget a team should have spent by now. */
function spendCurve(t: TeamState, frac: number): number {
  switch (t.philosophy) {
    case "early":
      return 1 - Math.pow(1 - frac, 2);
    case "late":
      return Math.pow(frac, 2);
    default:
      return frac;
  }
}

/** The AI's weekly research decision. Better brains pick better ideas and plan their spend, weaker ones are noisy. Never touches car pace directly. */
export function aiResearch(s: CareerState, teamId: string) {
  const t = s.teams[teamId];
  const rng = rngFor(s, `ai:${teamId}`);
  generateIdeas(s, teamId);
  const discretionary = CFG.cap - CFG.capBaseProgramme;
  const yearStart = Date.UTC(s.year, 0, 1) / 86400000;
  const frac = clamp((s.day - yearStart) / 330, 0, 1);
  const want = spendCurve(t, frac) * discretionary;
  let guard = 0;
  while (t.capSpent < want - 1 && t.projects.filter((p) => p.status === "building").length < maxConcurrent(t) && t.ideas.length && guard++ < 4) {
    if (capRoom(t) < 2) break;
    const sk = t.skillBrain;
    let best: Idea | null = null;
    let bestScore = -Infinity;
    for (const i of t.ideas) {
      const mid = (i.predLo + i.predHi) / 2;
      const noisy = mid + rng.gauss() * (1 - sk) * 0.06;
      let score = noisy / i.cost + (t.philosophy === "gamble" && i.size === "L" ? 0.01 : 0);
      if (capRoom(t) < i.cost) score -= 10; // a good strategist stays inside the cap, a poor one sometimes does not
      if (sk < 0.5 && rng.chance(0.25)) score += 5;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (!best) break;
    if (capRoom(t) < best.cost && sk >= 0.5) break;
    startProject(s, teamId, best.id);
  }
}

/** The next day the tunnel allowance refills: after the summer break, or in January. */
export function nextAllowanceReset(s: CareerState): number {
  const sum = summerEnd(s.year) + 1;
  return s.day < sum ? sum : newYearDay(s.year + 1);
}


/**
 * Your own lab work, sent to the drawing office. The biggest honest gain in the readings becomes a proposal led by
 * whoever fits the trait best. The staff's range is what the instrument said (its error is the width); the hidden
 * gain is what the shape is really worth. The part only captures a share of the shape's change.
 */
export function labToIdea(s: CareerState, teamId: string, entryId: number): { ok: boolean; why?: string; idea?: Idea } {
  const t = s.teams[teamId];
  const e = (t.notebook ?? []).find((x) => x.id === entryId);
  if (!e) return { ok: false, why: "That test is not in the notebook." };
  if (e.sent) return { ok: false, why: "That shape is already with the drawing office." };
  const cur = designOf(t);
  const same = DESIGN_KEYS.every((k) => Math.abs(e.model[k] - cur[k]) < 0.005);
  if (same) return { ok: false, why: "That is the car as it is. Change a dial first." };
  const best = [...e.readings].sort((a, b) => b.value - a.value)[0];
  if (!best || best.value < 0.02) return { ok: false, why: "The readings do not show a gain worth a part." };
  const tr = best.trait;
  const area = TRAIT_AREA[tr];
  if ((rulesOf(s).freezeAreas ?? []).includes(area)) return { ok: false, why: "That area is frozen under the current rules." };
  const lead = leadFor(s, teamId, tr);
  const idea = makeIdea(s, t, area, rngFor(s, `labidea:${teamId}:${entryId}`), "gamble", { trait: tr, lead, size: "M" });
  const share = 0.5;
  const worthNew = designWorth(e.model, s.regW)[tr];
  const worthCur = designWorth(cur, s.regW)[tr];
  idea.trueGain = round2(Math.max(-0.1, (worthNew - worthCur) * share));
  const mid = round2(clamp(best.value * share, 0.02, 0.3));
  idea.predLo = round2(Math.max(0, mid - best.err));
  idea.predHi = round2(mid + best.err);
  idea.lab = true;
  idea.name = `Lab shape: ${TRAIT_NAME[tr].toLowerCase()}`;
  idea.note = "Born from your own lab run. The lab's range is only as good as your trust in the instrument.";
  idea.expires = s.day + 42;
  t.ideas.push(idea);
  e.sent = true;
  const plan = planOf(t);
  plan.offered = (plan.offered ?? []).filter((i) => i !== idea.id);
  return { ok: true, idea };
}
