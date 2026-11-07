import { Rng, hashSeed } from "../sim/rng";
import { COMP, nodeOf, misfitOf } from "./ctree";
import { partTrackExpect, partTrackGain } from "./treeplay";
import { news } from "./cards";
import { AREAS } from "./types";
import { baseTeam } from "./car";
import { round2 } from "./util";
import type { CareerState } from "./types";

const f = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}`;

export interface FitLine { id: string; name: string; ticks: string; want: number; got: number; quote: string }

/** The engineers' one line on a part, from how it did against the guess. Lap time gained, so more is better. */
export function quoteFor(want: number, got: number, misfit: boolean): string {
  if (misfit) return "It was fitted badly and works at a fraction. Take it off and fit it again.";
  const d = got - want;
  if (d >= 0.03) return "Better than we said. Our model sold it short.";
  if (d <= -0.06) return got <= 0 ? "It cost us time here. Not the part for this track." : "Worth less than we told you. We will not trust that number again.";
  return "About what we expected.";
}

/**
 * Every part on the player's cars, set against what the staff expected on this circuit. A tick is a practice
 * session in which the part gave what was promised, a cross a session where it did not.
 */
export function fitReport(s: CareerState): FitLine[] {
  const ws = s.weekend;
  const t = s.teams[s.teamId];
  const tr = t.tree;
  if (!ws || !tr) return [];
  const out: FitLine[] = [];
  for (const p of Object.values(tr.parts)) {
    if (!p.onA && !p.onB) continue;
    const nd = nodeOf(tr, p.id);
    if (!nd) continue;
    const want = round2(-partTrackExpect(nd, ws.circuitId));
    const bad = !!(p.onA && p.misfit?.A) || !!(p.onB && p.misfit?.B);
    const got = round2(-partTrackGain(tr, nd, ws.circuitId) * (bad ? misfitOf(p, p.onA ? "A" : "B") : 1));
    const cols = (ws.tp?.cols ?? []).filter((c) => c[p.id]);
    const ticks = cols.length ? cols.map((c) => (c[p.id].act <= c[p.id].exp + 0.02 ? "+" : "x")).join("") : "-";
    out.push({ id: p.id, name: nd.name, ticks, want, got, quote: quoteFor(-want, -got, bad) });
  }
  return out;
}

/** The debrief paragraph: one line per part with its tally, want against got, and what the engineers say. */
export function fitReportText(s: CareerState): string {
  const rows = fitReport(s);
  if (!rows.length) return "";
  return "Fit report (lap time; minus is faster):\n" + rows.map((r) => `${r.name} [${r.ticks}] want ${f(r.want)}, got ${f(r.got)}. ${r.quote}`).join("\n");
}

/**
 * A bad result still teaches: every part that was measured in practice counts as tested (so the team's
 * understanding of that branch grows), and a part that fell short leaves a note on what to do next time.
 */
export function failForward(s: CareerState): string[] {
  const ws = s.weekend;
  const tr = s.teams[s.teamId].tree;
  if (!ws?.tp || !tr) return [];
  const lines: string[] = [];
  for (const p of Object.values(tr.parts)) {
    const seen = ws.tp.cols.some((c) => c[p.id]);
    if (!seen) continue;
    const nd = nodeOf(tr, p.id);
    if (!nd) continue;
    if (!p.tested) {
      p.tested = true;
      const last = [...ws.tp.cols].reverse().find((c) => c[p.id])![p.id];
      lines.push(last.act > last.exp + 0.02
        ? `${nd.name} fell short, but the engineers now understand the ${COMP(nd.comp).name.toLowerCase()} work better for it.`
        : `${nd.name} is proven on the car. The ${COMP(nd.comp).name.toLowerCase()} branch is better understood.`);
    }
  }
  return lines;
}

/**
 * Rivals watch a winner. After a podium, one team may copy the area of the player's best fitted part: a news line
 * and a small real step (0.03) in that car area. Rare and small on purpose.
 */
export function rivalCopy(s: CareerState, finishedPos: number): string | undefined {
  if (finishedPos < 1 || finishedPos > 3) return undefined;
  const ws = s.weekend;
  const tr = s.teams[s.teamId].tree;
  if (!ws || !tr) return undefined;
  let best: { area: (typeof AREAS)[number]; name: string; g: number } | null = null;
  for (const p of Object.values(tr.parts)) {
    if (!p.onA && !p.onB) continue;
    const nd = nodeOf(tr, p.id);
    if (!nd) continue;
    const g = partTrackGain(tr, nd, ws.circuitId);
    if (g > 0 && (!best || g > best.g)) best = { area: COMP(nd.comp).area, name: nd.name, g };
  }
  if (!best) return undefined;
  const rng = new Rng(hashSeed(`copy:${s.seed}:${s.year}:${ws.round}`));
  if (rng.next() > 0.3) return undefined;
  const humans = s.humans ?? [];
  const pool = Object.keys(s.teams).filter((id) => id !== s.teamId && !humans.includes(id));
  if (!pool.length) return undefined;
  const prints = s.print?.rivals.map((r) => r.team) ?? [];
  const grudge = pool.filter((id) => prints.includes(id));
  const from = grudge.length && rng.next() < 0.6 ? grudge : pool;
  const pick = from[Math.floor(rng.next() * from.length) % from.length];
  const team = s.teams[pick];
  team.car[best.area] = round2(team.car[best.area] + 0.03);
  const line = `${baseTeam(pick).name} have been studying our ${best.name.toLowerCase()}. Expect a copy of it from them.`;
  news(s, line);
  return line;
}
