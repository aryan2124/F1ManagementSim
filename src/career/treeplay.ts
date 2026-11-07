import { Rng, hashSeed } from "../sim/rng";
import { traitWeight, trackNeed } from "./traits";
import { pushCard, recap, sendLetter } from "./cards";

import { requestFit, tickFits } from "./fitting";
import { install, lockOf, misfitOf, nodeOf, priceOf, slotsOf, startBuild, tickTree, treeOf, type CompId, type TreeNode, type TreeState } from "./ctree";
import { CARDS, assignCards, cardMods, promoteSpark, sparkWeekly } from "./leadcards";
import { rulesOf } from "./eras";
import { round2, clamp } from "./util";
import { trackRow } from "../game/trackdata";
import { loadCircuit } from "../game/circuits";
import { AREAS, TRAITS } from "./types";
import { activeDrivers, baseTeam } from "./car";
import type { Card, CareerState, DriverState, TeamState, Trait, Area } from "./types";

const FROM = "Drawing office";

/** Cards of the leads feed the tree each day: speed, cost, test length, gains and failure rate. */
export function refreshMods(s: CareerState, t: TeamState) {
  const tr = treeOf(s, t);
  const m = cardMods(s, t.id);
  const gain: Partial<Record<CompId, number>> = {};
  const roleComps: Record<string, CompId[]> = { power: ["pu"], aero: ["fw", "rw", "floor"], designer: ["susp", "cool"], td: ["fw", "rw", "floor", "pu", "cool", "susp"] };
  for (const st of Object.values(s.staff)) {
    if (st.teamId !== t.id || st.intern) continue;
    const c = CARDS.find((x) => x.id === st.card);
    if (!c?.fx.gain) continue;
    for (const k of roleComps[st.role] ?? []) gain[k] = round2((gain[k] ?? 1) * c.fx.gain);
  }
  tr.mods = { speed: m.speed, cost: m.cost, testDays: m.testDays, failure: m.failure, gain };
}

/** One working day of the player's factory: build, test, and tell the inbox. */
export function treeDaily(s: CareerState) {
  const t = s.teams[s.teamId];
  const tr = treeOf(s, t);
  if (tr.announced !== tr.era) {
    if (tr.announced !== undefined) newEraLetter(s);
    tr.announced = tr.era;
  }
  if (s.day % 7 === 0) refreshMods(s, t);
  const r = tickTree(s, t);
  tickFits(s, t);
  for (const id of r.built) {
    const nd = nodeOf(tr, id)!;
    recap(s, `Built: ${nd.name}.`);
    const dl = t.delegation.parts;
    if (dl !== "advise") {
      fitBoth(s, t, id);
      continue;
    }
    pushCard(s, "treePart", `Ready: ${nd.name}`, `Built for both cars. Where does it go?`, [
      { id: "both", label: "On both cars", detail: "Both cars get the gain, nothing to compare against", fx: { car: { v: 0.8, say: "full gain" }, mood: { v: 0, say: "" } } },
      { id: "A", label: "Car A only", detail: "Only that car gets the gain, and the other car is your control", fx: { car: { v: 0.4, say: "one car quicker, a clean comparison" } } },
      { id: "later", label: "Choose later", detail: "It waits in the parts menu" },
    ], { urgency: 1, deadline: s.day + 6, defaultOption: "later", data: { id: id } });
  }
  if (r.built.length) {
    // a hidden card shows itself the first time its holder's factory finishes a part
    const hidden = Object.values(s.staff).find((x) => x.teamId === t.id && !x.intern && x.card && !x.cardSeen && CARDS.find((c) => c.id === x.card)?.hidden);
    if (hidden) {
      hidden.cardSeen = true;
      const c = CARDS.find((x) => x.id === hidden.card)!;
      sendLetter(s, { from: hidden.name, role: "Factory floor", subject: `${c.name}: nobody knew`, body: `${c.text}\n${c.flavour}` });
    }
  }
  for (const id of r.tested) {
    const nd = nodeOf(tr, id)!;
    sendLetter(s, { from: FROM, role: "Simulator", subject: `Test result: ${nd.name}`, body: `The simulator run is in. The number on the part card is firm now.` });
  }
}

/** Fitting a new part to both cars is a real job: the mechanics take days and it costs money like any other change. */
function fitBoth(s: CareerState, t: TeamState, id: string) {
  for (const car of ["A", "B"] as const) {
    const r = requestFit(s, t, id, car, true);
    if (!r.ok) { recap(s, `${nodeOf(treeOf(s, t), id)?.name ?? "A part"} waits in the parts menu: ${r.message}`); break; }
  }
}

export function resolveTreeCard(s: CareerState, c: Card, option: string) {
  const t = s.teams[s.teamId];
  const id = String(c.data?.id ?? "");
  if (c.kind === "treePart") {
    if (option === "both") fitBoth(s, t, id);
    else if (option === "A") requestFit(s, t, id, "A", true);
    return;
  }
  if (c.kind === "treeFail") {
    const who = option === "B" ? "B" : "A";
    install(s, t, id, who, true); // the surviving copy was already on a car: handing it over is not a new fit
    const ds = activeDrivers(s, t.id);
    const other = s.drivers[ds[who === "A" ? 1 : 0] ?? ""] as DriverState | undefined;
    if (other) other.morale = clamp(other.morale - 0.06, 0, 1);
  }
}

/** After a race, a part can let go. Tested parts are safer, and so are well-understood branches. Only one is left, and a driver has to go without. */
export function treeFailures(s: CareerState) {
  const t = s.teams[s.teamId];
  const tr = treeOf(s, t);
  const rng = new Rng(hashSeed(`treefail:${s.seed}:${s.year}:${s.round}`));
  for (const p of Object.values(tr.parts)) {
    if (p.copies < 2 || !(p.onA || p.onB)) continue;
    const nd = nodeOf(tr, p.id)!;
    const chance = (0.012 * nd.tier * (p.tested ? 0.35 : 1)) * (tr.mods?.failure ?? 1);
    if (!rng.chance(chance)) continue;
    p.copies = 1;
    p.onA = false;
    p.onB = false;
    const ds = activeDrivers(s, t.id).map((d) => s.drivers[d]?.spec.name ?? d);
    pushCard(s, "treeFail", `${nd.name} cracked`, `Only one is left. Whoever does not get it runs the old part, and may not like it.`, [
      { id: "A", label: `${ds[0] ?? "Car A"} gets it`, detail: `${ds[1] ?? "The other driver"} is annoyed` },
      { id: "B", label: `${ds[1] ?? "Car B"} gets it`, detail: `${ds[0] ?? "The other driver"} is annoyed` },
    ], { urgency: 2, deadline: s.day + 5, defaultOption: "A", data: { id: p.id } });
    break;
  }
}

/** Weekly: no more idea piles for the player. Spark grows, the delegated head of R&D picks a part. */
export function treeWeekly(s: CareerState) {
  const t = s.teams[s.teamId];
  const tr = treeOf(s, t);
  sparkWeekly(s, t);
  const lvl = t.delegation.rnd;
  if ((lvl === "do" || lvl === "hands") && tr.builds.length < slotsOf(t)) {
    const flags = rulesOf(s);
    const open = tr.nodes.filter((n) => lockOf(s, t, n, flags).ok && priceOf(s, n).cost <= t.cash * 0.3);
    if (open.length) {
      // the head of R&D keeps to what the team already does: deepest branch first
      const best = [...open].sort((a, b) => b.tier - a.tier || a.cost - b.cost)[0];
      const r = startBuild(s, t, best.id, flags);
      if (r.ok && lvl === "do") recap(s, `Your head of R&D started ${best.name}.`);
    }
  }
}

/** Promotion hook for trainees (called from the hiring flow). */
export function onPromote(s: CareerState, stId: string): string | undefined {
  const st = s.staff[stId];
  if (!st) return undefined;
  const c = promoteSpark(s, st);
  return c ? `${st.name} brings a special card: ${c.name}. ${c.text}` : undefined;
}

// ---------------------------------------------------------------- practice

/** Measure the fitted tree parts during a practice run: expected against actual, per session. */
/** How much this circuit cares about a trait, 1 being an ordinary track (from the sourced track table). */
export function trackFactor(trait: Trait, circuitId: string): number {
  return traitWeight({} as Record<Trait, number>, trait, trackNeed(circuitId));
}

/** What one built part is really worth on this circuit's lap, seconds gained (positive is faster). */
export function partTrackGain(tr: TreeState, nd: TreeNode, circuitId: string): number {
  const m = nd.mult * (tr.mods?.gain[nd.comp] ?? 1);
  let v = 0;
  for (const k of TRAITS) v += (nd.fx[k] ?? 0) * m * trackFactor(k, circuitId);
  return round2(v);
}

/** What the staff expect the part to give on this circuit, before any running. */
export function partTrackExpect(nd: TreeNode, circuitId: string): number {
  let v = 0;
  for (const k of TRAITS) v += (nd.fx[k] ?? 0) * trackFactor(k, circuitId);
  return round2(v);
}

/** Which car a driver sits in: the first in the garage is A, the second is B. */
export function carOf(s: CareerState, teamId: string, driverId: string): "A" | "B" {
  return activeDrivers(s, teamId).indexOf(driverId) === 1 ? "B" : "A";
}

/** The lap time the parts fitted to one car are worth at this circuit, seconds. */
export function carLapGain(t: TeamState, car: "A" | "B", circuitId: string): number {
  const tr = t.tree;
  if (!tr) return 0;
  let v = 0;
  for (const p of Object.values(tr.parts)) {
    if (!(car === "A" ? p.onA : p.onB)) continue;
    const nd = nodeOf(tr, p.id);
    if (nd) v += partTrackGain(tr, nd, circuitId) * misfitOf(p, car);
  }
  return round2(v);
}

/**
 * One timed practice run. Each part on the driver's car is measured by that run's lap: its true worth at this
 * circuit read through the run's noise (a worn set, rain or a thin sim crew blur it). Each column is one session.
 */
export function recordTreeRun(s: CareerState, session: number, driverId: string, noise: number) {
  const ws = s.weekend;
  const t = s.teams[s.teamId];
  const tr = t.tree;
  if (!ws || !tr) return;
  const car = carOf(s, t.id, driverId);
  const tp = (ws.tp ??= { cols: [] });
  while (tp.cols.length <= session) tp.cols.push({});
  const col = tp.cols[session];
  const rng = new Rng(hashSeed(`tprun:${ws.seed}:${session}:${driverId}:${ws.runsLeft}`));
  for (const p of Object.values(tr.parts)) {
    if (!(car === "A" ? p.onA : p.onB)) continue;
    const nd = nodeOf(tr, p.id);
    if (!nd) continue;
    const exp = -partTrackExpect(nd, ws.circuitId);
    const truth = -partTrackGain(tr, nd, ws.circuitId) * misfitOf(p, car);
    const prev = col[p.id] ?? { exp, act: 0, n: 0 };
    const shot = truth + rng.gauss() * Math.max(0.01, noise * 0.5);
    const n = prev.n + 1;
    col[p.id] = { exp, act: round2((prev.act * prev.n + shot) / n), n };
  }
}

/** File the practice results in the Practice folder, with the date. */
export function filePractice(s: CareerState) {
  const ws = s.weekend;
  const t = s.teams[s.teamId];
  const tr = t.tree;
  if (!ws?.tp || !tr) return;
  const ids = [...new Set(ws.tp.cols.flatMap((c) => Object.keys(c)))];
  if (!ids.length) return;
  const race = s.calendar[ws.round];
  const circuit = race ? loadCircuit(race.circuitId).meta.short : "the track";
  const head = ["Part", ...ws.tp.cols.map((_, i) => `FP${i + 1} want/got`), "Verdict"];
  const f = (v: number) => (v === 0 ? "0.00" : `${v > 0 ? "+" : ""}${v.toFixed(2)}`);
  const rows = ids.map((id) => {
    const nd = nodeOf(tr, id)!;
    const cells = ws.tp!.cols.map((c) => (c[id] ? `${f(c[id].exp)} / ${f(c[id].act)}` : "-"));
    const last = [...ws.tp!.cols].reverse().find((c) => c[id])?.[id];
    const p = tr.parts[id];
    const on = p && (p.onA || p.onB);
    const verdict = !on ? "REMOVED" : !last ? "-" : last.act <= last.exp + 0.02 ? "KEEP" : last.act < 0 ? "WEAK" : "BAD";
    return [nd.name, ...cells, verdict];
  });
  sendLetter(s, { from: "Race engineers", role: "Practice report", subject: `Practice at ${circuit}`, body: "Lap time against the old part. Minus is faster. Want is the staff's guess, got is the stopwatch.", folder: "practice", table: { head, rows } });
}

// ---------------------------------------------------------------- track reports

const word = (v: number, lo: string, hi: string) => (v >= 4 ? hi : v <= 2 ? lo : "MID");

/** The track report table: every circuit on the calendar, what it asks of the car. A ~ marks an estimate. */
export function seasonTable(s: CareerState): { head: string[]; rows: string[][] } {
  const head = ["Rd", "Track", "Downforce", "Power", "Braking", "Cooling", "Passing", "Pit s"];
  const rows = s.calendar.map((r, i) => {
    const x = trackRow(r.circuitId);
    const mark = (k: keyof typeof x, v: string) => (x.src.includes(k as never) ? v : `${v}~`);
    return [String(i + 1), loadCircuit(r.circuitId).meta.short, mark("df", word(x.df, "LOW", "HIGH")), mark("pow", word(x.pow, "LOW", "HIGH")), mark("brk", word(x.brk, "LOW", "HIGH")), mark("cool", word(x.cool, "LOW", "HIGH")), mark("pass", word(x.pass, "HARD", "EASY")), `${x.pit.toFixed(1)}${x.src.includes("pit") ? "" : "~"}`];
  });
  return { head, rows };
}

/** The track report at the start of the season, filed in the Track reports folder. */
export function sendSeasonReport(s: CareerState) {
  sendLetter(s, { from: "Race engineers", role: "Track report", subject: `${s.year} track report`, body: "Plan the order of your upgrades from this. A ~ means an estimate, not a measured figure. We will write again when something changes.", folder: "track", table: seasonTable(s) });
}

const AREA_WORD: Record<string, string> = { aero: "aero", chassis: "chassis and braking", power: "power", cooling: "cooling", tyres: "tyre handling" };
/** The track column each car area pays at, so a rival's step can be set against the next circuit. */
function areaPays(area: string, circuitId: string): boolean {
  const x = trackRow(circuitId);
  return area === "aero" ? x.df >= 4 : area === "power" ? x.pow >= 4 : area === "cooling" ? x.cool >= 4 : area === "chassis" ? x.brk >= 4 : loadCircuit(circuitId).meta.tyreSeverity >= 1.4;
}

/**
 * Lines about rivals whose cars have moved since the last update. The engineers only see it from the outside, so
 * the size is a rough guess (the real step is blurred), and a rival's name appears only when the step is real.
 */
export function rivalMoves(s: CareerState, circuitId: string): string[] {
  const snap = (s.rivalSnap ??= {});
  const prev = { ...snap };
  const lines: { gain: number; text: string }[] = [];
  for (const [id, t] of Object.entries(s.teams)) {
    const now: Record<string, number> = {};
    for (const a of AREAS) now[a] = t.car[a];
    snap[id] = now;
    if (id === s.teamId || (s.humans ?? []).includes(id) || !prev[id]) continue;
    let best: Area | null = null;
    let gain = 0;
    for (const a of AREAS) {
      const g = now[a] - (prev[id][a] ?? now[a]);
      if (g > gain) { gain = g; best = a; }
    }
    if (!best || gain < 0.1) continue;
    const rng = new Rng(hashSeed(`rival:${s.seed}:${s.year}:${s.round}:${id}`));
    const seen = round2(gain * (0.7 + rng.next() * 0.6));
    const pays = areaPays(best, circuitId);
    lines.push({ gain, text: `${baseTeam(id).name} have brought an upgrade to their ${AREA_WORD[best]}: our guess is ${seen.toFixed(2)} s a lap, from the outside.${pays ? " It pays at this track." : ""}` });
  }
  return lines.sort((a, b) => b.gain - a.gain).slice(0, 2).map((l) => l.text);
}

/** Between races: a forecast or heat change on the next circuit, or a rival's big step. Only when something has actually moved. */
export function trackUpdates(s: CareerState, rainOf: (circuitId: string) => number) {
  const race = s.calendar[s.round];
  if (!race || race.day - s.day !== 9) return;
  const key = `${s.year}:${s.round}`;
  const sent = ((s as unknown as { trackSent?: string[] }).trackSent ??= []);
  if (sent.includes(key)) return;
  sent.push(key);
  const m = loadCircuit(race.circuitId).meta;
  const x = trackRow(race.circuitId);
  const rain = rainOf(race.circuitId);
  const hint = x.df >= 4 ? "Downforce parts pay here." : x.pow >= 4 ? "Power and low-drag parts pay here." : x.cool >= 4 ? "Cooling parts pay here." : "A balanced weekend; nothing stands out.";
  const moves = rivalMoves(s, race.circuitId);
  const body0 = rain >= 0.35 ? `Forecast change: ${Math.round(rain * 100)} percent chance of rain at ${m.short}. Wet running favours platform and mechanical grip over peak downforce. ${hint}` : `${m.short} is nine days away. ${hint}`;
  const body = moves.length ? `${body0}\n${moves.join("\n")}` : body0;
  sendLetter(s, { from: "Race engineers", role: "Track update", subject: `Update: ${m.short}${rain >= 0.35 ? " (rain risk up)" : ""}${moves.length ? " (a rival has moved)" : ""}`, body, folder: "track" });
}

export function newEraLetter(s: CareerState) {
  const t = s.teams[s.teamId];
  const tr = treeOf(s, t);
  sendLetter(s, { from: FROM, role: "Drawing office", subject: `New rules, new tree (${tr.era})`, body: "The old parts do nothing under the new regulations. A fresh tree is cut for every component. Some of what the team learned carries across." });
}

export function onNewSeason(s: CareerState) {
  assignCards(s);
  sendSeasonReport(s);
}
export type { TreeNode };
