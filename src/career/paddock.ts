import { Rng, hashSeed } from "../sim/rng";
import { rulesOf } from "./eras";
import { COMP, nodeOf, treeOf } from "./ctree";
import { baseTeam } from "./car";
import { news } from "./cards";
import { AREAS } from "./types";
import { round2 } from "./util";
import type { Area, CareerState, WeekendState } from "./types";

/** Transparent paddock: every third round each team must publish one design detail, and may copy what rivals disclosed. */
export const paddockLive = (s: CareerState) => !!rulesOf(s).openBooks;
export const isDisclosureRound = (round: number) => round % 3 === 2;

export const COPY_GAIN = 0.03;
export const DECOY_LOSS = 0.015;
export const RIVAL_GAIN = 0.03;
export const RIVAL_LOSS = 0.02;
export const FINE = 0.5;

/** The rivals' disclosures for a round. Some are honest. Which ones is the hidden part, and it is not shown. */
export function rivalDisclosures(s: CareerState, ws: WeekendState): NonNullable<WeekendState["paddock"]>["rivals"] {
  const rng = new Rng(hashSeed(`paddock:${s.seed}:${s.year}:${ws.round}`));
  const humans = s.humans ?? [];
  const pool = Object.keys(s.teams).sort().filter((id) => id !== s.teamId && !humans.includes(id));
  const picks: string[] = [];
  while (picks.length < Math.min(3, pool.length)) { const p = rng.pick(pool); if (!picks.includes(p)) picks.push(p); }
  return picks.map((team) => {
    const t = s.teams[team];
    const area = [...AREAS].sort((a, b) => t.car[b] - t.car[a])[0];
    return { team, area, claim: 0.04, honest: rng.chance(0.7) };
  });
}

export function openPaddock(s: CareerState, ws: WeekendState): void {
  if (!paddockLive(s) || !isDisclosureRound(ws.round)) return;
  ws.paddock = { rivals: rivalDisclosures(s, ws) };
  ws.ruleNotes.push("Rule: transparent paddock. This is a disclosure weekend: you must publish one part of your car, honestly or with a decoy, and you may copy what one rival published.");
}

/** What the player can publish: the parts fitted to a car. */
export function publishable(s: CareerState): { id: string; name: string; area: Area }[] {
  const tr = treeOf(s, s.teams[s.teamId]);
  return Object.values(tr.parts).filter((p) => p.onA || p.onB).map((p) => { const nd = nodeOf(tr, p.id)!; return { id: p.id, name: nd.name, area: COMP(nd.comp).area }; });
}

export function publish(s: CareerState, id: string | undefined, honest: boolean): string {
  const ws = s.weekend;
  if (!ws?.paddock) return "No disclosure is due this weekend.";
  if (ws.paddock.published) return "You have already published.";
  const list = publishable(s);
  const part = list.find((x) => x.id === id) ?? list[0];
  if (!part) return "You have no fitted parts to publish. Nothing to disclose this time.";
  ws.paddock.published = { id: part.id, name: part.name, area: part.area, honest };
  return honest ? `Published the ${part.name.toLowerCase()} truthfully.` : `Published a decoy for the ${part.name.toLowerCase()}. If a rival copies it, it will cost them. If the stewards notice, it will cost you.`;
}

export function copyRival(s: CareerState, team: string): string {
  const ws = s.weekend;
  const pd = ws?.paddock;
  if (!pd) return "No disclosure is due this weekend.";
  if (pd.copied) return "You have already copied one disclosure this weekend.";
  const r = pd.rivals.find((x) => x.team === team);
  if (!r) return "That team did not publish.";
  pd.copied = team;
  const t = s.teams[s.teamId];
  const d = r.honest ? COPY_GAIN : -DECOY_LOSS;
  t.car[r.area] = round2(t.car[r.area] + d);
  const name = baseTeam(team).name;
  return r.honest
    ? `You copied ${name}'s ${r.area} detail and it works: +${COPY_GAIN} in ${r.area}.`
    : `${name}'s ${r.area} detail was a decoy. Your copy made the car worse: -${DECOY_LOSS} in ${r.area}.`;
}

/** After the race: the disclosure lands. Publish honestly and a rival copies the gain; publish a decoy and a rival loses, unless the stewards notice. */
export function settlePaddock(s: CareerState, ws: WeekendState): void {
  const pd = ws.paddock;
  if (!pd || pd.settled) return;
  pd.settled = true;
  if (!pd.published) publish(s, undefined, true);
  const pub = pd.published;
  if (!pub) return;
  const rng = new Rng(hashSeed(`paddockend:${s.seed}:${s.year}:${ws.round}`));
  const humans = s.humans ?? [];
  const pool = Object.keys(s.teams).sort().filter((id) => id !== s.teamId && !humans.includes(id));
  if (!pool.length) return;
  const rival = rng.pick(pool);
  const rt = s.teams[rival];
  const name = baseTeam(rival).name;
  if (pub.honest) {
    rt.car[pub.area] = round2(rt.car[pub.area] + RIVAL_GAIN);
    news(s, `${name} copied our ${pub.name.toLowerCase()} from the published details. It worked for them.`, { importance: 1, cause: "Disclosure", tag: "rules" });
    return;
  }
  rt.car[pub.area] = round2(rt.car[pub.area] - RIVAL_LOSS);
  news(s, `${name} copied our published ${pub.name.toLowerCase()} and the car went backwards.`, { importance: 1, cause: "Disclosure", tag: "rules" });
  if (rng.chance(0.25)) {
    const t = s.teams[s.teamId];
    t.cash = round2(t.cash - FINE);
    t.ledger.other = round2(t.ledger.other + FINE);
    news(s, `The stewards found our published ${pub.name.toLowerCase()} misleading: fined $${FINE.toFixed(1)}m.`, { importance: 2, cause: "Disclosure", tag: "rules" });
  }
}
