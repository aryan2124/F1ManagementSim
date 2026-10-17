import { staffAsk, hireStaff } from "./contracts";
import { news, pushCard, recap } from "./cards";
import { clamp, fmtMoney, isHuman, rngFor, round2 } from "./util";
import { staffOf, teamRanking } from "./car";
import { summerStart } from "./calendar";
import { multiply } from "./factors";
import type { CareerState, Staff } from "./types";

/**
 * Staff poaching in both directions.
 *  - You can approach anyone under contract elsewhere. The rival may counter, and a "loyal" person nearly always stays.
 *  - Rivals approach your people: unhappy ones, the best ones, and the ones a top team wants.
 *  - A team that loses its technical director or designer is slower to find ideas for a while.
 */

export const SETBACK_DAYS = 120;

/** Set on a team that has just lost a key person. Read by generateIdeas. */
export function setbackOf(s: CareerState, teamId: string): number {
  const t = s.teams[teamId] as unknown as { setback?: { until: number; amount: number } };
  return t.setback && t.setback.until >= s.day ? t.setback.amount : 0;
}

function hurt(s: CareerState, teamId: string, st: Staff) {
  const t = s.teams[teamId] as unknown as { setback?: { until: number; amount: number } };
  const weight = st.role === "td" ? 0.18 : st.role === "designer" ? 0.12 : st.role === "strategy" ? 0.08 : 0.04;
  const now = setbackOf(s, teamId);
  t.setback = { until: s.day + SETBACK_DAYS, amount: Math.min(0.3, now + weight) };
}

/** Moves a person to another team and fills the seat they leave: the displaced incumbent becomes a free agent. */
function move(s: CareerState, toTeam: string, st: Staff, salary: number, years: number): string[] {
  const from = st.teamId;
  const notes = hireStaff(s, toTeam, st.id, round2(salary), years, st.driverId);
  if (from) hurt(s, from, st);
  return notes;
}

/** Player approach. The rival always gets a chance to counter. */
export function poachStaff(s: CareerState, staffId: string, offerSalary: number): { ok: boolean; message: string } {
  const st = s.staff[staffId];
  const rival = st?.teamId;
  if (!st || !rival || rival === s.teamId) return { ok: false, message: "Not at another team." };
  if (st.endYear > s.year && s.day < summerStart(s.year)) return { ok: false, message: "Under contract. Rival staff can be approached from the summer break." };
  const ask = staffAsk(st);
  const floor = Math.max(ask, st.salary) * 1.1;
  if (offerSalary < floor) return { ok: false, message: `He would not move for less than about ${fmtMoney(floor)}.` };
  const rng = rngFor(s, `poachOut:${staffId}:${s.day}`);
  const loyal = st.traits.includes("loyal");
  const rivalWins = teamRanking(s).indexOf(rival) < teamRanking(s).indexOf(s.teamId);
  // the better your offer over his pay, the likelier he goes; loyal people and winning teams hold on to staff
  const over = offerSalary / Math.max(0.1, st.salary);
  const p = clamp(0.35 + (over - 1.1) * 0.9 + (1 - st.mood) * 0.35 - (loyal ? 0.45 : 0) - (rivalWins ? 0.12 : 0), 0.03, 0.95) * multiply(s, s.teamId, ["reputation", "funding", "cohesion"]).value;
  if (!rng.chance(p)) {
    if (rng.chance(0.6)) {
      s.staff[staffId].salary = round2(st.salary * 1.15);
      s.staff[staffId].mood = clamp(st.mood + 0.1, 0, 1);
      news(s, `${rival.toUpperCase()} counter-offered and kept ${st.name}.`, { importance: 1, tag: "people" });
      return { ok: false, message: `${rival.toUpperCase()} matched you with a raise and ${st.name} stayed. Staff there now think of you as a poacher.` };
    }
    return { ok: false, message: `${st.name} turned you down.` };
  }
  const had = staffOf(s, s.teamId, st.role, st.driverId);
  const notes = move(s, s.teamId, st, offerSalary, 2);
  news(s, `${st.name} leaves ${rival.toUpperCase()} to join you.`, { importance: 2, tag: "people" });
  news(s, `${rival.toUpperCase()} lose ${st.name}. Their technical side will be slower for a while.`, { importance: 1, tag: "people" });
  void had;
  return { ok: true, message: notes.join(" ") + ` ${rival.toUpperCase()} are weakened for about four months.` };
}

/** Rivals and the player's own people: weekly chance that a rival goes after someone on your team. */
export function poachWeekly(s: CareerState) {
  const rng = rngFor(s, "poachIn");
  // rivals refill empty chairs
  for (const id of Object.keys(s.teams)) {
    if (isHuman(s, id)) continue;
    for (const role of ["td", "designer", "aero", "power", "data"] as const) {
      if (staffOf(s, id, role)) continue;
      if (!rng.chance(0.2)) continue;
      const free = s.freeStaff.map((x) => s.staff[x]).filter((x) => x && x.role === role).sort((a, b) => b.skill - a.skill)[0];
      if (free) hireStaff(s, id, free.id, staffAsk(free), 2);
    }
  }
  // approach on your people
  const pending = s.cards.some((c) => c.kind === "staffPoach");
  if (pending) return;
  const mine = Object.values(s.staff).filter((x) => x.teamId === s.teamId && x.endYear > s.year);
  for (const st of mine) {
    const key = st.role === "td" || st.role === "designer" || st.role === "strategy" || st.role === "aero" || st.role === "power" || st.role === "data";
    const wanted = st.skill >= 72;
    const base = (key ? 0.012 : 0.004) * (wanted ? 2 : 1) + (st.mood < 0.5 ? 0.02 : 0);
    const loyal = st.traits.includes("loyal") ? 0.25 : 1;
    if (!rng.chance(base * loyal)) continue;
    const ranked = teamRanking(s);
    const aiOnly = ranked.filter((x) => !isHuman(s, x));
    const suitors = aiOnly.filter((x) => ranked.indexOf(x) < ranked.indexOf(s.teamId));
    const pool = suitors.length ? suitors : aiOnly;
    const rival = pool.length ? pool[Math.floor(rng.next() * pool.length) % pool.length] : "";
    if (!rival) continue;
    const bid = round2(st.salary * 1.3);
    pushCard(s, "staffPoach", `${st.name} has an offer`, `${rival.toUpperCase()} have approached ${st.name} (${st.role}) with about ${fmtMoney(bid)} a year. ${st.mood < 0.5 ? "He is not happy here." : "He is settled but tempted."} You can match, counter a little lower and risk it, or let him go.`, [
      { id: "match", label: "Match the offer", detail: `${fmtMoney(bid)} a year, certain` },
      { id: "counter", label: "Counter lower", detail: `${fmtMoney(st.salary * 1.15)}, might not be enough` },
      { id: "let", label: "Let them go" },
    ], { urgency: 2, deadline: s.day + 21, defaultOption: "let", data: { staffId: st.id, rival, bid } });
    return;
  }
}

/** Resolves the staffPoach card. */
export function resolveStaffPoach(s: CareerState, option: string, d: Record<string, unknown>) {
  const st = s.staff[String(d.staffId)];
  if (!st || st.teamId !== s.teamId) return;
  const rival = String(d.rival ?? "");
  const bid = Number(d.bid ?? st.salary * 1.3);
  if (option === "match") {
    st.salary = round2(bid);
    st.endYear = Math.max(st.endYear, s.year + 2);
    st.mood = clamp(st.mood + 0.1, 0, 1);
    recap(s, `${st.name} stays after matching ${rival.toUpperCase()}.`);
    return;
  }
  if (option === "counter") {
    const rng = rngFor(s, `counter:${st.id}`);
    const stays = rng.chance(clamp(0.35 + st.mood * 0.4 + (st.traits.includes("loyal") ? 0.3 : 0), 0.1, 0.9));
    if (stays) {
      st.salary = round2(st.salary * 1.15);
      st.endYear = Math.max(st.endYear, s.year + 2);
      recap(s, `${st.name} accepted your counter and stays.`);
      return;
    }
    recap(s, `${st.name} turned your counter down.`);
  }
  if (rival && s.teams[rival]) {
    const notes = move(s, rival, st, bid, 2);
    news(s, `${st.name} joins ${rival.toUpperCase()} from your team.`, { importance: 2, tag: "people" });
    recap(s, `${st.name} left for ${rival.toUpperCase()}. ${notes[0] ?? ""}`);
  } else st.teamId = null;
}

