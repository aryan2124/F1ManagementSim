import { pushCard, news, ticker } from "./cards";
import { rulesOf } from "./eras";
import type { CareerState, DriverState, SessionKind } from "./types";

/**
 * Careers and trophies.
 *
 * Every driver has a record (wins, second and third places, poles, fastest laps, sprint wins, titles and starts). The
 * 22 real drivers start with their real totals up to the end of the 2025 season and the career adds to them from
 * the first race. Every constructor has a cabinet of constructors' titles. Everything that happens is also written
 * to a log of achievements, and a title that can no longer be caught is awarded the moment it is clinched.
 */

export interface DriverRecord {
  p1: number;
  p2: number;
  p3: number;
  poles: number;
  fl: number;
  sprintWins: number;
  sprintPodiums: number;
  /** Years of drivers' championships. */
  wdc: number[];
  /** The year and place of the first of each thing, in this career only. */
  firsts: { win?: string; pole?: string; podium?: string };
  dnfs: number;
}

export interface Achievement {
  id: number;
  year: number;
  round: number;
  /** win, pole, sprint, fastest, milestone, wdc, wcc, record, podium, double. */
  kind: string;
  driverId?: string;
  teamId?: string;
  text: string;
  /** 1 small, 2 notable, 3 big. */
  tier: 1 | 2 | 3;
}

export interface Ceremony {
  kind: "wdc" | "wcc";
  /** Driver id or team id. */
  id: string;
  year: number;
  round: number;
  /** True when the player's own team or driver is the champion. */
  mine: boolean;
}

export const emptyRecord = (): DriverRecord => ({ p1: 0, p2: 0, p3: 0, poles: 0, fl: 0, sprintWins: 0, sprintPodiums: 0, wdc: [], firsts: {}, dnfs: 0 });

/**
 * Real totals at the end of the 2025 season, taken from the public Ergast-style results data (Jolpica) and checked against
 * the known anchors (Hamilton 105 wins, Alonso 32 wins and 22 poles, Norris' 2025 title). Starts and second/third
 * place counts can be out by one or two where the data and the official count differ.
 * Order: wins, seconds, thirds, poles, fastest laps, sprint wins, starts, drivers' titles (years).
 */
type Real = [number, number, number, number, number, number, number, number[]];
export const REAL: Record<string, Real> = {
  "dr-har": [105, 57, 40, 104, 68, 1, 380, [2008, 2014, 2015, 2017, 2018, 2019, 2020]],
  "dr-bro": [71, 37, 19, 47, 37, 14, 233, [2021, 2022, 2023, 2024]],
  "dr-gar": [32, 40, 34, 22, 25, 0, 426, [2005, 2006]],
  "dr-car": [11, 21, 12, 16, 18, 3, 150, [2025]],
  "dr-qui": [9, 10, 7, 6, 9, 3, 70, []],
  "dr-wex": [5, 5, 14, 8, 11, 1, 150, []],
  "dr-cor": [8, 17, 25, 27, 12, 0, 171, []],
  "dr-bel": [0, 0, 1, 0, 3, 0, 23, []],
  "dr-fou": [0, 0, 1, 0, 0, 0, 24, []],
  "dr-bri": [0, 0, 3, 1, 0, 0, 185, []],
  "dr-del": [1, 1, 3, 0, 0, 0, 177, []],
  "dr-pal": [0, 0, 0, 0, 0, 0, 21, []],
  "dr-sor": [0, 0, 2, 0, 1, 0, 123, []],
  "dr-ala": [4, 7, 18, 6, 4, 0, 230, []],
  "dr-val": [1, 2, 1, 0, 1, 0, 178, []],
  "dr-ash": [0, 0, 0, 0, 0, 0, 27, []],
  "dr-rat": [0, 0, 0, 0, 0, 0, 40, []],
  "dr-whi": [0, 0, 0, 0, 0, 0, 0, []],
  "dr-ald": [0, 0, 1, 1, 2, 0, 252, []],
  "dr-tav": [0, 0, 0, 0, 0, 0, 24, []],
  "dr-cad": [6, 17, 16, 3, 12, 1, 283, []],
  "dr-lah": [10, 29, 28, 20, 19, 2, 245, []],
};

/** Constructors' championships won, by year, up to the end of 2025. */
export const REAL_WCC: Record<string, number[]> = {
  fer: [1961, 1964, 1975, 1976, 1977, 1979, 1982, 1983, 1999, 2000, 2001, 2002, 2003, 2004, 2007, 2008],
  mcl: [1974, 1984, 1985, 1988, 1989, 1990, 1991, 1998, 2024, 2025],
  wil: [1980, 1981, 1986, 1987, 1992, 1993, 1994, 1996, 1997],
  mer: [2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021],
  rbr: [2010, 2011, 2012, 2013, 2022, 2023],
  alp: [2005, 2006],
};

/** Gives every driver and team their starting record. Safe to run on an old career. */
export function initRecords(s: CareerState): void {
  s.achievements = s.achievements ?? [];
  s.ceremonies = s.ceremonies ?? [];
  s.clinched = s.clinched ?? {};
  for (const d of Object.values(s.drivers)) {
    if (d.rec) continue;
    const r = emptyRecord();
    const real = REAL[d.id];
    if (real) {
      r.p1 = real[0];
      r.p2 = real[1];
      r.p3 = real[2];
      r.poles = real[3];
      r.fl = real[4];
      r.sprintWins = real[5];
      r.wdc = [...real[7]];
      d.starts = Math.max(d.starts, real[6]);
    } else {
      // someone made up by the game: whatever the older counters hold
      r.p1 = d.wins;
      r.p2 = Math.max(0, Math.round((d.podiums - d.wins) * 0.5));
      r.p3 = Math.max(0, d.podiums - d.wins - r.p2);
      r.wdc = Array.from({ length: d.titles }, (_, i) => s.year - d.titles + i);
    }
    d.rec = r;
    sync(d);
  }
  for (const [id, t] of Object.entries(s.teams)) {
    if (!t.wcc) t.wcc = [...(REAL_WCC[id] ?? [])];
  }
}

/** Keeps the older counters in step with the detailed record. */
function sync(d: DriverState) {
  const r = d.rec;
  if (!r) return;
  d.wins = r.p1;
  d.podiums = r.p1 + r.p2 + r.p3;
  d.titles = r.wdc.length;
}

function achieve(s: CareerState, a: Omit<Achievement, "id" | "year" | "round">, round: number) {
  s.achievements = s.achievements ?? [];
  s.achievements.push({ id: s.uid++, year: s.year, round, ...a });
  if (s.achievements.length > 600) s.achievements.splice(0, s.achievements.length - 600);
}

const MILESTONES = [1, 5, 10, 25, 50, 75, 100];
const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

function mark(s: CareerState, d: DriverState, count: number, noun: string, round: number, teamId: string | null) {
  if (!MILESTONES.includes(count)) return;
  const mine = d.teamId === s.teamId;
  if (count === 1 && noun === "win" && d.rec) d.rec.firsts.win = `${s.year} round ${round}`;
  const text = count === 1 ? `${d.spec.name} takes his first ${noun}.` : `${d.spec.name} reaches ${count} career ${noun}s.`;
  achieve(s, { kind: "milestone", driverId: d.id, teamId: teamId ?? undefined, text, tier: count >= 25 || mine ? 3 : 2 }, round);
  if (count >= 5 || count === 1) news(s, text, { importance: mine || count >= 25 ? 3 : 2, cause: "A career milestone", tag: "record" });
}

/** A qualifying session: the car on pole. */
export function logQuali(s: CareerState, kind: SessionKind, grid: string[], round: number) {
  if (kind !== "quali" || !grid.length) return;
  const d = s.drivers[grid[0]];
  if (!d?.rec) return;
  d.rec.poles += 1;
  if (d.rec.poles === 1 && !d.rec.firsts.pole) d.rec.firsts.pole = `${s.year} round ${round}`;
  achieve(s, { kind: "pole", driverId: d.id, teamId: d.teamId ?? undefined, text: `${d.spec.name} takes pole position.`, tier: d.teamId === s.teamId ? 2 : 1 }, round);
  mark(s, d, d.rec.poles, "pole", round, d.teamId);
}

/** A finished race or sprint: the podium, the fastest lap and the milestones. */
export function logRaceResult(s: CareerState, kind: "race" | "sprint", order: string[], dnf: string[], fastest: string | undefined, round: number) {
  const classified = order.filter((id) => !dnf.includes(id));
  classified.slice(0, 3).forEach((id, i) => {
    const d = s.drivers[id];
    if (!d?.rec) return;
    if (kind === "sprint") {
      if (i === 0) {
        d.rec.sprintWins += 1;
        achieve(s, { kind: "sprint", driverId: id, teamId: d.teamId ?? undefined, text: `${d.spec.name} wins the sprint.`, tier: d.teamId === s.teamId ? 2 : 1 }, round);
      }
      d.rec.sprintPodiums += 1;
      return;
    }
    if (i === 0) d.rec.p1 += 1;
    else if (i === 1) d.rec.p2 += 1;
    else d.rec.p3 += 1;
    if (!d.rec.firsts.podium) d.rec.firsts.podium = `${s.year} round ${round}`;
    if (i === 0) {
      achieve(s, { kind: "win", driverId: id, teamId: d.teamId ?? undefined, text: `${d.spec.name} wins the ${s.calendar[round - 1] ? s.calendar[round - 1].circuitId.replace(/-/g, " ") : "race"} Grand Prix.`, tier: d.teamId === s.teamId ? 3 : 2 }, round);
      mark(s, d, d.rec.p1, "win", round, d.teamId);
    }
    sync(d);
  });
  if (kind === "race") {
    for (const id of dnf) {
      const d = s.drivers[id];
      if (d?.rec) d.rec.dnfs += 1;
    }
    if (fastest && s.drivers[fastest]?.rec) {
      const d = s.drivers[fastest];
      (d.rec as DriverRecord).fl += 1;
      achieve(s, { kind: "fastest", driverId: fastest, teamId: d.teamId ?? undefined, text: `${d.spec.name} sets the fastest lap.`, tier: 1 }, round);
    }
    // a team's one-two
    const a = s.drivers[classified[0]];
    const b = s.drivers[classified[1]];
    if (a?.teamId && a.teamId === b?.teamId) {
      achieve(s, { kind: "double", teamId: a.teamId, driverId: a.id, text: `${a.teamId.toUpperCase()} take a one-two: ${a.spec.name} and ${b.spec.name}.`, tier: a.teamId === s.teamId ? 3 : 2 }, round);
    }
  }
}

/** The most a driver can still score, and the most a team can still score, from the races that are left. */
export function remainingPoints(s: CareerState): { driver: number; team: number } {
  const done = s.round + 1; // called after the race has been counted
  const left = s.calendar.slice(done);
  const sprints = left.filter((r) => r.sprint).length;
  const best = !!rulesOf(s).bestCarOnly;
  return { driver: left.length * 25 + sprints * 8, team: best ? left.length * 25 + sprints * 8 : left.length * 43 + sprints * 15 };
}

/** After a race: has anyone got a title that can no longer be taken away? Awards it now and queues the ceremony. */
export function checkClinch(s: CareerState, roundNo: number) {
  if (rulesOf(s).playoffCut) return;
  const c = (s.clinched ??= {});
  if (c.year !== s.year) {
    s.clinched = { year: s.year };
  }
  const cl = s.clinched as { year?: number; wdc?: string; wcc?: string };
  const rem = remainingPoints(s);
  const ds = Object.entries(s.standings.drivers).filter(([id]) => !s.story.arcs[`out:${id}`]).sort((a, b) => b[1] - a[1]);
  if (!cl.wdc && ds.length >= 2 && ds[0][1] - ds[1][1] > rem.driver) {
    const d = s.drivers[ds[0][0]];
    if (d) awardWdc(s, d, roundNo);
  }
  const ts = Object.entries(s.standings.teams).sort((a, b) => b[1] - a[1]);
  if (!cl.wcc && ts.length >= 2 && ts[0][1] - ts[1][1] > rem.team) awardWcc(s, ts[0][0], roundNo);
}

export function awardWdc(s: CareerState, d: DriverState, round: number) {
  const cl = (s.clinched ??= {}) as { year?: number; wdc?: string; wcc?: string };
  cl.year = s.year;
  cl.wdc = d.id;
  if (!d.rec) initRecords(s);
  const rec = d.rec as DriverRecord;
  if (!rec.wdc.includes(s.year)) rec.wdc.push(s.year);
  sync(d);
  const mine = d.teamId === s.teamId;
  const n = rec.wdc.length;
  const text = `${d.spec.name} is the ${s.year} World Champion${n > 1 ? `, title number ${n}` : ""}.`;
  achieve(s, { kind: "wdc", driverId: d.id, teamId: d.teamId ?? undefined, text, tier: 3 }, round);
  news(s, text, { importance: 3, cause: "The title is won", tag: "record" });
  ticker(s, text, 3);
  (s.ceremonies ??= []).push({ kind: "wdc", id: d.id, year: s.year, round, mine });
  if (mine) s.legacy.push({ year: s.year, text: `${d.spec.name} won the drivers' title for your team.` });
}

export function awardWcc(s: CareerState, teamId: string, round: number) {
  const cl = (s.clinched ??= {}) as { year?: number; wdc?: string; wcc?: string };
  cl.year = s.year;
  cl.wcc = teamId;
  const t = s.teams[teamId];
  if (!t) return;
  t.wcc = t.wcc ?? [...(REAL_WCC[teamId] ?? [])];
  if (!t.wcc.includes(s.year)) t.wcc.push(s.year);
  const mine = teamId === s.teamId;
  const name = teamId.toUpperCase();
  const text = `${name} win the ${s.year} constructors' championship (title number ${t.wcc.length}).`;
  achieve(s, { kind: "wcc", teamId, text, tier: 3 }, round);
  news(s, text, { importance: 3, cause: "The constructors' title is won", tag: "record" });
  ticker(s, text, 3);
  (s.ceremonies ??= []).push({ kind: "wcc", id: teamId, year: s.year, round, mine });
  if (mine) {
    s.legacy.push({ year: s.year, text: `You won the constructors' title.` });
    pushCard(s, "event", `Constructors' champions`, `Your team has clinched the ${s.year} constructors' championship with races to spare. Everyone at the factory knows what that means.`, [{ id: "ok", label: "Celebrate" }], { urgency: 2, deadline: s.day + 10 });
  }
}

/** At the end of a season: anything not already clinched is awarded to whoever finished on top. */
export function settleTitles(s: CareerState, champId: string | undefined, champTeam: string | undefined) {
  const cl = (s.clinched ??= {}) as { year?: number; wdc?: string; wcc?: string };
  if (cl.year !== s.year) s.clinched = { year: s.year };
  const c = s.clinched as { year?: number; wdc?: string; wcc?: string };
  if (!c.wdc && champId && s.drivers[champId]) awardWdc(s, s.drivers[champId], s.round);
  if (!c.wcc && champTeam) awardWcc(s, champTeam, s.round);
}

/** The achievements to show, newest first, optionally for one driver or team. */
export function achievementsFor(s: CareerState, f: { driverId?: string; teamId?: string; minTier?: number } = {}): Achievement[] {
  return (s.achievements ?? [])
    .filter((a) => (!f.driverId || a.driverId === f.driverId) && (!f.teamId || a.teamId === f.teamId) && a.tier >= (f.minTier ?? 1))
    .slice()
    .reverse();
}

export { ord };

/** The record a driver could take: titles (the real record is seven) or wins within reach of the best on the grid's history. */
export function chaseOf(s: CareerState, d: DriverState): { on: boolean; what: string } {
  const titles = d.rec?.wdc?.length ?? d.titles ?? 0;
  if (titles >= 6) return { on: true, what: titles >= 7 ? "the record eighth title" : "a record seventh title" };
  const best = Math.max(0, ...Object.values(s.drivers).map((x) => x.rec?.p1 ?? x.wins));
  const mine = d.rec?.p1 ?? d.wins;
  if (best >= 30 && mine >= best * 0.85 && mine < best) return { on: true, what: "the all-time win record" };
  return { on: false, what: "" };
}
