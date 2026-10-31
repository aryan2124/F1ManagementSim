import { boardMove } from "./board";
import { teamLabel } from "./brand";
import { news, pushCard, recap, ticker } from "./cards";
import { factoryClosed } from "./calendar";
import { circuitMeta } from "../game/circuits";
import { rngFor, round2 } from "./util";
import { AREA_LABEL, type Area, type Campaign, type CardOption, type CareerState, type RivalCamp } from "./types";

/**
 * Development campaigns. Every few weeks the factory commits to one area, aimed at a named race. The weeks in between
 * have a progress track, a midway setback or breakthrough, and the result is judged on the weekend itself.
 */

export const CAMP_AREAS: Area[] = ["aero", "power", "chassis", "cooling", "tyres"];
export const AREA_PLAIN: Record<Area, string> = {
  aero: "an aero package",
  power: "a power unit upgrade",
  chassis: "a chassis update",
  cooling: "a cooling redesign",
  tyres: "a tyre management package",
};
const MAX_GAIN: Record<Area, number> = { aero: 0.2, power: 0.18, chassis: 0.16, cooling: 0.12, tyres: 0.12 };

export const APPROACH: Record<Campaign["approach"], { label: string; gain: string; cost: string; weekly: number; tunnel: number; rate: [number, number] }> = {
  steady: { label: "STEADY PROGRAMME", gain: "Reliable: 9 to 13 points of progress a week", cost: "$0.25m a week, 3 tunnel hours", weekly: 0.25, tunnel: 3, rate: [9, 13] },
  allin: { label: "ALL IN", gain: "Fast: 14 to 19 points a week", cost: "$0.6m a week, 8 tunnel hours, staff tired", weekly: 0.6, tunnel: 8, rate: [14, 19] },
  bold: { label: "BOLD CONCEPT", gain: "A big gain if it works (up to 1.8x)", cost: "$0.4m a week, and it can flop (as little as 0.6x)", weekly: 0.4, tunnel: 5, rate: [8, 20] },
};

const raceName = (i: number, s: CareerState) => {
  const r = s.calendar[i];
  return r ? `round ${r.round}, the ${circuitMeta(r.circuitId).gp}` : "the final race";
};

/** The first race at least three weeks away, and no more than five. */
export function targetIndex(s: CareerState): number | null {
  for (let i = s.round; i < s.calendar.length; i++) {
    const n = s.calendar[i].day - s.day;
    if (n >= 18 && n <= 38) return i;
    if (n > 38) return null;
  }
  return null;
}

const weeksTo = (s: CareerState, idx: number) => Math.max(0, Math.round((s.calendar[idx].day - s.day) / 7));

export function campaignOpen(s: CareerState): boolean {
  return s.cards.some((c) => c.kind === "campaign");
}

/** Weekly: offer a campaign if none runs, move the active one forward, judge it at its race. */
export function campaignWeekly(s: CareerState): void {
  if (factoryClosed(s.day, s.year) || s.weekend) return;
  const me = s.teams[s.teamId];
  const c = s.campaign;
  if (c) {
    if (s.round > c.target) { judge(s); return; }
    if (s.calendar[c.target].day - s.day <= 3) return;
    step(s, c);
    return;
  }
  for (const r of s.rivalCamps ?? []) if (s.round > r.target) rivalJudge(s, r);
  s.rivalCamps = (s.rivalCamps ?? []).filter((r) => s.round <= r.target);
  if (campaignOpen(s)) return;
  const idx = targetIndex(s);
  if (idx === null) return;
  const weak = Object.keys(me.car).sort((a, b) => me.car[a as Area] - me.car[b as Area]) as Area[];
  const rng = rngFor(s, "camp");
  const areas = [weak[0], ...CAMP_AREAS.filter((a) => a !== weak[0])].slice(0, 3);
  void rng;
  announceRivals(s, idx);
  const weeks = weeksTo(s, idx);
  const rivalNote = (a: Area) => {
    const r = (s.rivalCamps ?? []).filter((x) => x.area === a).map((x) => teamLabel(s, x.teamId));
    return r.length ? `${r.join(" and ")} are bringing one too.` : "Nobody else is on this.";
  };
  const options: CardOption[] = areas.map((a) => ({
    id: `area:${a}`,
    label: `BUILD ${AREA_PLAIN[a].toUpperCase()}`,
    lines: [`Your ${AREA_LABEL[a].toLowerCase()} is ${me.car[a] < 0 ? "behind" : "ahead"} the grid average.`, rivalNote(a), `Ready for ${raceName(idx, s)}, ${weeks} weeks away.`],
  }));
  options.push({ id: "skip", label: "NO CAMPAIGN THIS TIME", lines: ["Nothing spent. The car stays as it is while rivals bring parts.", "You will be offered another before the next race."], warn: "Rivals move on without you" });
  pushCard(s, "campaign", `NEW CAMPAIGN: AIM FOR ${raceName(idx, s).toUpperCase()}`, `The factory can commit to one big push before ${raceName(idx, s)}. Pick what to build.`, options, { urgency: 2, data: { step: "area", target: idx } });
}

function announceRivals(s: CareerState, idx: number) {
  if ((s.rivalCamps ?? []).some((r) => r.target === idx)) return;
  const rng = rngFor(s, "rivalcamp");
  const ids = Object.keys(s.teams).filter((t) => t !== s.teamId && !(s.humans ?? []).includes(t));
  const picks: RivalCamp[] = [];
  for (let i = 0; i < 2 && ids.length; i++) {
    const t = ids.splice(Math.floor(rng.next() * ids.length), 1)[0];
    picks.push({ teamId: t, area: CAMP_AREAS[Math.floor(rng.next() * CAMP_AREAS.length)], target: idx, right: rng.chance(0.55) });
  }
  s.rivalCamps = [...(s.rivalCamps ?? []).filter((r) => r.target !== idx), ...picks];
  for (const r of picks) news(s, `${teamLabel(s, r.teamId)} are bringing ${AREA_PLAIN[r.area]} to ${raceName(idx, s)}.`, { importance: 2, tag: "rnd" });
}

export function rivalHint(r: RivalCamp): string {
  return r.right ? "The paddock thinks they have found something" : "The paddock thinks they are guessing";
}

function step(s: CareerState, c: Campaign) {
  const me = s.teams[s.teamId];
  const a = APPROACH[c.approach];
  const rng = rngFor(s, `campstep:${c.progress}`);
  let gain = a.rate[0] + (a.rate[1] - a.rate[0]) * rng.next();
  const hours = Math.min(a.tunnel, Math.max(0, me.tunnelLeft));
  if (hours < a.tunnel) gain *= 0.6 + 0.4 * (hours / a.tunnel);
  me.tunnelLeft -= hours;
  me.cash -= a.weekly;
  me.capSpent += a.weekly;
  c.progress = round2(c.progress + gain);
  c.hist.push(Math.round(gain));
  const left = Math.max(0, weeksTo(s, c.target));
  recap(s, `${AREA_LABEL[c.area]} campaign: +${Math.round(gain)} this week, now ${Math.round(c.progress)}%. ${left} week${left === 1 ? "" : "s"} to ${raceName(c.target, s)}.${hours < a.tunnel ? " The tunnel was short of hours, so it went slower." : ""}`);
  if (c.mile < 1 && c.progress >= 45 && !campaignOpen(s)) {
    c.mile = 1;
    const bad = rng.chance(0.5);
    if (bad) {
      pushCard(s, "campaign", `SETBACK: ${AREA_LABEL[c.area].toUpperCase()} CAMPAIGN`, `The tunnel numbers do not match the simulator. The package is not doing what the engineers promised.`, [
        { id: "fix", label: "FIX IT PROPERLY", lines: ["Costs $0.6m", "Progress is kept"] },
        { id: "rush", label: "PRESS ON AND HOPE", lines: ["Costs nothing", "Progress drops 12 points and the risk stays"], warn: "Might not recover" },
      ], { urgency: 2, deadline: s.day + 6, defaultOption: "rush", data: { step: "mid", bad: true } });
    } else {
      pushCard(s, "campaign", `BREAKTHROUGH: ${AREA_LABEL[c.area].toUpperCase()} CAMPAIGN`, `The engineers have found something in the data. The package is quicker than planned.`, [
        { id: "push", label: "CHASE IT HARD", lines: ["Costs 6 extra tunnel hours", "+12 points of progress"] },
        { id: "bank", label: "BANK IT AND MOVE ON", lines: ["Free", "+4 points of progress"] },
      ], { urgency: 2, deadline: s.day + 6, defaultOption: "bank", data: { step: "mid", bad: false } });
    }
  }
}

export function resolveCampaign(s: CareerState, card: { data?: Record<string, number | string | boolean> }, option: string): void {
  const me = s.teams[s.teamId];
  const d = card.data ?? {};
  if (d.step === "area") {
    if (option === "skip") { recap(s, "No campaign this time."); return; }
    const area = option.slice(5) as Area;
    pushCard(s, "campaign", `HOW HARD TO PUSH THE ${AREA_LABEL[area].toUpperCase()} WORK?`, `Choose how the factory approaches it. Each way costs something different.`,
      (Object.keys(APPROACH) as Campaign["approach"][]).map((k) => ({ id: `go:${area}:${k}`, label: APPROACH[k].label, lines: [APPROACH[k].gain, APPROACH[k].cost] })),
      { urgency: 2, data: { step: "approach", target: Number(d.target) } });
    return;
  }
  if (d.step === "approach") {
    const [, area, approach] = option.split(":");
    s.campaign = { area: area as Area, approach: approach as Campaign["approach"], target: Number(d.target), start: s.day, progress: 0, mile: 0, hist: [] };
    recap(s, `Campaign started: ${AREA_PLAIN[area as Area]} for ${raceName(Number(d.target), s)}.`);
    return;
  }
  const c = s.campaign;
  if (!c) return;
  if (option === "fix") { me.cash -= 0.6; me.capSpent += 0.6; recap(s, "The setback was fixed properly. Progress kept."); }
  else if (option === "rush") { c.progress = Math.max(0, c.progress - 12); recap(s, "You pressed on. Progress dropped 12 points."); }
  else if (option === "push") { me.tunnelLeft = Math.max(0, me.tunnelLeft - 6); c.progress += 12; recap(s, "You chased the breakthrough: +12 points."); }
  else if (option === "bank") { c.progress += 4; recap(s, "You banked the breakthrough: +4 points."); }
}

function judge(s: CareerState) {
  const c = s.campaign;
  if (!c) return;
  const me = s.teams[s.teamId];
  const rng = rngFor(s, "campjudge");
  const mul = c.approach === "bold" ? 0.6 + 1.2 * rng.next() : c.approach === "allin" ? 0.9 + 0.25 * rng.next() : 0.85 + 0.25 * rng.next();
  const gain = round2(MAX_GAIN[c.area] * Math.min(1.2, c.progress / 100) * mul);
  me.car[c.area] += gain;
  const verdict = gain >= MAX_GAIN[c.area] * 0.9 ? "a hit" : gain >= MAX_GAIN[c.area] * 0.5 ? "a decent step" : "a disappointment";
  boardMove(s, me, verdict === "a hit" ? 2 : verdict === "a disappointment" ? -2 : 0.5, `The ${AREA_LABEL[c.area].toLowerCase()} campaign was ${verdict}`);
  const text = `${AREA_PLAIN[c.area]} arrived at ${raceName(c.target, s)}: ${verdict}. It is worth about ${gain.toFixed(2)} s a lap. You will see what it does on the track.`;
  pushCard(s, "campaign", `CAMPAIGN JUDGED: ${verdict.toUpperCase()}`, `${text} The factory finished at ${Math.round(c.progress)}% of the plan.`, [{ id: "ok", label: "OK" }], { urgency: 2, data: { step: "done" } });
  ticker(s, text, 3);
  for (const r of (s.rivalCamps ?? []).filter((x) => x.target === c.target)) rivalJudge(s, r);
  s.rivalCamps = (s.rivalCamps ?? []).filter((x) => x.target !== c.target);
  s.campaign = undefined;
}

function rivalJudge(s: CareerState, r: RivalCamp) {
  const t = s.teams[r.teamId];
  if (!t) return;
  const gain = round2(MAX_GAIN[r.area] * (r.right ? 0.9 : 0.25));
  t.car[r.area] += gain;
  news(s, `${teamLabel(s, r.teamId)}'s ${AREA_PLAIN[r.area].replace(/^an? /, "")} ${r.right ? "works: they have found real time" : "does not do much"}.`, { importance: 2, tag: "rnd" });
}

export function campaignLine(s: CareerState): { text: string; pct: number; mile: string } | null {
  const c = s.campaign;
  if (!c) return null;
  const left = Math.max(0, weeksTo(s, c.target));
  return { text: `${AREA_LABEL[c.area]} campaign for ${raceName(c.target, s)}: ${left} week${left === 1 ? "" : "s"} to go`, pct: Math.min(100, Math.round(c.progress)), mile: c.mile < 1 ? "Midway check at about 45%" : "Midway check done" };
}
