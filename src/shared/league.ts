/**
 * Click-to-advance league logic. Pure functions, shared by the Durable Object (server) and the tests.
 *
 * Rules:
 *  - The calendar only moves when every non-away manager has clicked READY. There are no timers.
 *  - The host (first manager to join) can mark a silent manager as "away" so they never block the league.
 *    An away manager's team is run by the AI assistant and they can come back at any time.
 */
export interface Member {
  name: string;
  ready: boolean;
  away: boolean;
}

export interface LeagueState {
  id: string;
  /** Calendar day. Day 1 is the first day of the season. */
  day: number;
  hostId: string | null;
  members: Record<string, Member>;
  log: string[];
}

/** What clients see: server adds who is currently connected. */
export interface LeagueView extends Omit<LeagueState, "members"> {
  members: Record<string, Member & { online: boolean }>;
}

export type ClientMsg =
  | { t: "join"; id: string; name: string }
  | { t: "ready"; ready: boolean }
  | { t: "away"; target: string; away: boolean };

export type ServerMsg = { t: "state"; state: LeagueView; you: string | null };

export function newLeague(id: string): LeagueState {
  return { id, day: 1, hostId: null, members: {}, log: ["League created. Day 1."] };
}

function pushLog(state: LeagueState, line: string): LeagueState {
  return { ...state, log: [...state.log, line].slice(-30) };
}

/** Advance the day if everyone who counts is ready. */
export function tryAdvance(state: LeagueState): LeagueState {
  const active = Object.values(state.members).filter((m) => !m.away);
  if (active.length === 0 || !active.every((m) => m.ready)) return state;
  const members: Record<string, Member> = {};
  for (const [id, m] of Object.entries(state.members)) members[id] = { ...m, ready: false };
  return pushLog({ ...state, day: state.day + 1, members }, `Everyone clicked continue. Day ${state.day + 1} begins.`);
}

export function applyMessage(state: LeagueState, memberId: string, msg: ClientMsg): LeagueState {
  switch (msg.t) {
    case "join": {
      const name = msg.name.trim().slice(0, 18) || "Manager";
      const existing = state.members[msg.id];
      const members = { ...state.members, [msg.id]: { name, ready: existing?.ready ?? false, away: existing?.away ?? false } };
      let next: LeagueState = { ...state, members, hostId: state.hostId ?? msg.id };
      if (!existing) next = pushLog(next, `${name} joined the league.`);
      return next;
    }
    case "ready": {
      const me = state.members[memberId];
      if (!me) return state;
      const members = { ...state.members, [memberId]: { ...me, ready: msg.ready, away: false } };
      return tryAdvance({ ...state, members });
    }
    case "away": {
      const target = state.members[msg.target];
      if (!target) return state;
      // you can mark yourself away/back, or the host can do it for anyone
      if (memberId !== msg.target && memberId !== state.hostId) return state;
      const members = { ...state.members, [msg.target]: { ...target, away: msg.away, ready: false } };
      const next = pushLog({ ...state, members }, msg.away ? `${target.name} is away (AI assistant in charge).` : `${target.name} is back.`);
      return tryAdvance(next);
    }
  }
}
