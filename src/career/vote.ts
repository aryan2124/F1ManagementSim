import { news, ticker } from "./cards";
import { MODULE_BY_ID } from "./modules";
import { teamRanking, baseTeam } from "./car";
import { clamp, isHuman, rngFor, round2 } from "./util";
import { planOf, type Ballot, type EraDef } from "./eras";
import type { CareerState } from "./types";
import { multiply } from "./factors";

/** Votes needed to pass a module in full. */
export const VOTE_NEEDED = 7;
const MAKERS = new Set(["mer", "fer", "rbr", "aud", "ast"]);

/** How much a team wants a module, -1 to 1. Fixed by the team's character and position; persuasion shifts it. */
export function lean(s: CareerState, teamId: string, moduleId: string): number {
  const t = s.teams[teamId];
  const def = MODULE_BY_ID[moduleId];
  if (!t || !def) return 0;
  let v = 0;
  const novelty = def.kind === "setting" ? 1 : def.kind === "control" ? -1 : 0;
  v += novelty * (t.philosophy === "gamble" ? 0.35 : t.philosophy === "early" ? 0.15 : t.philosophy === "late" ? -0.2 : -0.02);
  const order = teamRanking(s);
  const rank = order.indexOf(teamId) / Math.max(1, order.length - 1); // 0 leader, 1 back
  if (def.category === "Financial") v += (rank - 0.5) * 0.9;
  if (def.category === "Scoring" || def.category === "Race format") v += (rank - 0.5) * 0.45;
  if (def.category === "Power") v += MAKERS.has(teamId) ? -0.3 : 0.15;
  const rng = rngFor(s, `lean:${teamId}:${moduleId}:${s.era.next?.number ?? 0}`);
  v += (rng.next() - 0.5) * 0.55;
  v += s.era.shifts?.[moduleId]?.[teamId] ?? 0;
  return round2(clamp(v, -1, 1));
}

export type Stance = "for" | "against" | "undecided";

/** What the paddock says each team will do. Close calls are sometimes misreported. */
export function sounding(s: CareerState, teamId: string, moduleId: string): Stance {
  const v = lean(s, teamId, moduleId);
  const rng = rngFor(s, `sound:${teamId}:${moduleId}:${s.day >> 5}`);
  let seen = v;
  if (Math.abs(v) < 0.3 && rng.chance(0.2)) seen = -v;
  return seen > 0.12 ? "for" : seen < -0.12 ? "against" : "undecided";
}

export function castVote(s: CareerState, moduleId: string, vote: 1 | -1 | 0): string | null {
  const era = s.era.next;
  if (!era || era.stage !== 2) return "Votes are only taken while the draft rules are out.";
  const p = planOf(s, s.teamId);
  p.votes = p.votes ?? {};
  const owed = (p.pledges ?? []).find((x) => x.theirs === moduleId);
  if (owed && vote !== 1) return `You promised to back this module in a trade with ${baseTeam(owed.team).name}.`;
  p.votes[moduleId] = vote;
  return null;
}

export function persuade(s: CareerState, moduleId: string, teamId: string, dir: 1 | -1): { ok: boolean; message: string } {
  const era = s.era.next;
  if (!era || era.stage !== 2) return { ok: false, message: "Lobbying is only open while the draft rules are out." };
  if (teamId === s.teamId) return { ok: false, message: "That is you." };
  if (isHuman(s, teamId)) return { ok: false, message: "That team is run by another manager. Talk to them yourself." };
  if (s.era.influence < 1) return { ok: false, message: "No influence left to spend." };
  s.era.tried = s.era.tried ?? [];
  const key = `${moduleId}:${teamId}`;
  if (s.era.tried.includes(key)) return { ok: false, message: "You already tried that team on this module." };
  s.era.tried.push(key);
  s.era.influence -= 1;
  const l = lean(s, teamId, moduleId);
  const p = clamp((0.8 - Math.abs(l) * 0.8 + (Math.sign(l) === -dir ? 0 : 0.1)) * multiply(s, s.teamId, ["reputation", "story"]).value, 0.12, 0.85);
  const ok = rngFor(s, `pers:${key}:${s.day}`).chance(p);
  s.era.shifts = s.era.shifts ?? {};
  const sh = (s.era.shifts[moduleId] = s.era.shifts[moduleId] ?? {});
  sh[teamId] = round2((sh[teamId] ?? 0) + (ok ? dir * 0.55 : -dir * 0.08));
  const name = baseTeam(teamId).name;
  return { ok: true, message: ok ? `${name} listened and moved your way on ${MODULE_BY_ID[moduleId]?.name ?? moduleId}.` : `${name} would not move on ${MODULE_BY_ID[moduleId]?.name ?? moduleId}.` };
}

export function trade(s: CareerState, teamId: string, myModule: string, theirModule: string): { ok: boolean; message: string } {
  const era = s.era.next;
  if (!era || era.stage !== 2) return { ok: false, message: "Trades are only possible while the draft rules are out." };
  if (isHuman(s, teamId)) return { ok: false, message: "That team is run by another manager. Talk to them yourself." };
  const p = planOf(s, s.teamId);
  p.pledges = p.pledges ?? [];
  p.votes = p.votes ?? {};
  if (p.pledges.some((x) => x.team === teamId)) return { ok: false, message: "You already have a deal with that team." };
  if (p.pledges.some((x) => x.theirs === theirModule)) return { ok: false, message: "You already promised to back that module." };
  if (lean(s, teamId, myModule) < -0.7) return { ok: false, message: `${baseTeam(teamId).name} will not back that for any price.` };
  if (lean(s, teamId, theirModule) < 0.1) return { ok: false, message: `${baseTeam(teamId).name} do not really want that module.` };
  p.pledges.push({ team: teamId, mine: myModule, theirs: theirModule });
  p.votes[theirModule] = 1;
  s.era.shifts = s.era.shifts ?? {};
  const sh = (s.era.shifts[myModule] = s.era.shifts[myModule] ?? {});
  sh[teamId] = 1.5; // a promise is binding
  return { ok: true, message: `Deal: ${baseTeam(teamId).name} back ${MODULE_BY_ID[myModule]?.name}, you back ${MODULE_BY_ID[theirModule]?.name}.` };
}

/** The Commission vote at the end of the draft stage. Each team votes once. */
export function holdVote(s: CareerState, era: EraDef) {
  const ballot: Record<string, Ballot> = {};
  const teams = Object.keys(s.teams);
  const mine = planOf(s, s.teamId);
  for (const m of era.modules) {
    const b: Ballot = { yes: [], no: [], abstain: [], needed: VOTE_NEEDED, passed: false };
    const rng = rngFor(s, `ballot:${m.id}:${era.number}`);
    for (const id of teams) {
      if (isHuman(s, id)) {
        const v = planOf(s, id).votes?.[m.id] ?? 0;
        (v === 1 ? b.yes : v === -1 ? b.no : b.abstain).push(id);
        continue;
      }
      const l = lean(s, id, m.id);
      if (Math.abs(l) < 0.04) (rng.chance(0.5) ? b.yes : b.abstain).push(id);
      else (l > 0 ? b.yes : b.no).push(id);
    }
    b.passed = b.yes.length >= VOTE_NEEDED;
    const def = MODULE_BY_ID[m.id];
    if (b.passed) m.intensity = round2(clamp(m.intensity + 0.04 * (b.yes.length - VOTE_NEEDED), 0.1, 1));
    else m.intensity = 0.1;
    m.lobby = b.yes.length - b.no.length;
    ballot[m.id] = b;
    const youVoted = mine.votes?.[m.id] ?? 0;
    news(s, `VOTE: ${def?.name ?? m.id} ${b.passed ? "passes" : "fails"} ${b.yes.length} to ${b.no.length}${b.abstain.length ? ` with ${b.abstain.length} abstaining` : ""}.${b.passed ? "" : " Only a token version goes ahead."}`, { importance: m.role === "headline" ? 3 : 2, cause: youVoted === 0 ? "You did not vote" : youVoted === 1 ? "You voted for it" : "You voted against it", tag: "rule" });
  }
  s.era.ballot = ballot;
  const failed = era.modules.filter((m) => !ballot[m.id].passed).length;
  ticker(s, `The Commission has voted: ${era.modules.length - failed} of ${era.modules.length} modules pass in full.`, 3);
}
