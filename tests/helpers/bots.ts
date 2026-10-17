import { apply } from "../../src/career/reducer";
import { autoPlayDays } from "../../src/career/headless";
import { believedAreaGain, pipeline } from "../../src/career/guide";
import { capRoom, maxConcurrent } from "../../src/career/rnd";
import { committedTunnel } from "../../src/career/ideas";
import { TRAIT_AREA } from "../../src/career/traits";
import { TRAITS } from "../../src/career/types";
import { staffReadout } from "../../src/career/capability";
import { CFG } from "../../src/career/config";
import { epochDay } from "../../src/career/util";
import { standingsRank } from "../../src/career/car";
import type { CareerState, Trait } from "../../src/career/types";

/** A player who reads the numbers: studies the loosest trait, commissions work on the weakest side, builds what looks best per dollar on the belief. */
export function smartWeek(s: CareerState) {
  const me = s.teams[s.teamId];
  if (me.delegation.rnd !== "advise") apply(s, { type: "delegate", area: "rnd", level: "advise" });
  // match the concept to the people once
  if (me.conceptDay === undefined) {
    const crew = Object.values(s.staff).filter((x) => x.teamId === s.teamId && (x.role === "aero" || x.role === "power" || x.role === "designer" || x.role === "td"));
    const avg = { df: 0, risk: 0, innov: 0 };
    for (const x of crew) {
      const r = staffReadout(s, x);
      avg.df += r.phil.df / crew.length;
      avg.risk += r.phil.risk / crew.length;
      avg.innov += r.phil.innov / crew.length;
    }
    apply(s, { type: "setConcept", phil: avg });
  }
  const free = () => me.tunnelLeft - committedTunnel(s, s.teamId);
  if (free() > 0.35 * me.tunnelTotal) {
    const loosest = [...TRAITS].sort((a, b) => me.know[b].err - me.know[a].err)[0];
    if (me.know[loosest].err > 0.14) apply(s, { type: "study", trait: loosest, readings: 2 });
  }
  if (free() > 0.2 * me.tunnelTotal) {
    // learn what the rulebook rewards before spending the budget: a few traits a week
    for (let k = 0; k < 2; k++) {
      const unknown = [...TRAITS].sort((a, b) => me.regKnow[b].err - me.regKnow[a].err)[0];
      if (me.regKnow[unknown].err > 0.2) apply(s, { type: "studyRegs", trait: unknown, readings: 1 });
    }
  }
  const pipe = pipeline(s, s.teamId);
  const est = (tr: Trait) => me.know[tr].est + pipe[tr];
  const budget = me.capLimit - CFG.capBaseProgramme;
  const prog = Math.min(1, Math.max(0, (s.day - epochDay(s.year, 1, 1)) / 300));
  const pace = me.capSpent < budget * (0.55 + 0.6 * prog);
  if (me.ideas.length < 4 && pace) {
    // commission work where raising a trait is worth most: low on the clock already, and heavy in the rulebook as far as the team can tell
    let best: Trait | null = null;
    let top = -Infinity;
    for (const tr of TRAITS) {
      const v = me.regKnow[tr].est * (0.3 - est(tr));
      if (v > top) {
        top = v;
        best = tr;
      }
    }
    if (best) apply(s, { type: "designPart", area: TRAIT_AREA[best], trait: best, kind: "safe", size: "L" });
  }
  let n = 0;
  while (n++ < 3 && me.projects.filter((p) => p.status === "building").length < maxConcurrent(me) && me.ideas.length) {
    const val = (i: (typeof me.ideas)[number]) => believedAreaGain(s, s.teamId, i.trait as Trait, (i.predLo + i.predHi) / 2) / Math.pow(i.cost, 0.7);
    const ranked = [...me.ideas].filter((i) => i.trait).sort((a, b) => val(b) - val(a));
    const pick = ranked.find((i) => i.predLo >= 0 && capRoom(me) > i.cost + 2 && me.tunnelLeft - committedTunnel(s, s.teamId) >= i.tunnelHours && believedAreaGain(s, s.teamId, i.trait as Trait, (i.predLo + i.predHi) / 2) > 0.01);
    if (!pick) break;
    if (!apply(s, { type: "startProject", ideaId: pick.id }).ok) break;
  }
}

/** Someone who lets the head of R&D run everything. */
export function handsOff(s: CareerState) {
  const me = s.teams[s.teamId];
  for (const k of ["rnd", "setup", "parts"] as const) if (me.delegation[k] !== "hands") apply(s, { type: "delegate", area: k, level: "hands" });
}

/** Someone who never touches the R&D screens: ideas expire, no parts are built. */
export function idle() {}

export type Policy = (s: CareerState) => void;

/** Play whole seasons week by week under a policy. Returns the constructors' position at each year end. */
export function playWith(s: CareerState, policy: Policy, seasons: number): number[] {
  const out: number[] = [];
  let hist = s.history.length;
  let guard = 0;
  while (out.length < seasons && guard++ < 2000) {
    policy(s);
    const before = s.history.length;
    const ranksBefore = standingsRank(s);
    autoPlayDays(s, 7);
    if (s.history.length > before) {
      void ranksBefore;
      const h = s.history[s.history.length - 1];
      out.push(h.playerPos ?? 0);
      hist = s.history.length;
    }
  }
  void hist;
  return out;
}
