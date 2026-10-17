import type { Rng } from "../sim/rng";
import { TEAMS } from "../game/data";
import { teamRanking } from "./car";
import { driversOf } from "./finance";
import { clamp, fmtDay, rngFor } from "./util";
import type { CareerState, DriverState } from "./types";

/**
 * The paddock on social media.
 *
 * Nothing here is a stored message. After a race the game builds FACTS (who won, who started where, who beat what was
 * expected of his car, who is on a streak, who beat his team-mate, who sat next to whom) and keeps STORYLINES alive
 * across weeks (a rivalry, a slump, a contract, the title fight). Posts are then composed from those facts and from the
 * storyline's history, in the voice of a fan, a rival fan, a journalist, a pundit, an insider, a meme account or the
 * team itself, with the numbers taken from what really happened. The same weekend never reads the same way twice,
 * because the wording depends on the surprise of the result, the streak behind it and who is talking.
 */

export type Persona = "fan" | "rival" | "press" | "pundit" | "insider" | "meme" | "team" | "driver";
export type ArcKind = "rivalry" | "hot" | "slump" | "teamwar" | "contract" | "title" | "rookie" | "farewell";

export interface Post {
  id: number;
  day: number;
  handle: string;
  who: string;
  persona: Persona;
  text: string;
  likes: number;
  shares: number;
  /** -1 harsh to +1 glowing, about the subject. */
  tone: number;
  arc?: string;
  /** The team and driver the post is about. */
  team?: string;
  driver?: string;
  /** True when it concerns the player's team. */
  mine?: boolean;
  replyTo?: number;
}

export interface Arc {
  key: string;
  kind: ArcKind;
  ids: string[];
  heat: number;
  since: number;
  last: number;
  /** Short facts that happened inside the story, newest last, which later posts can refer back to. */
  beats: string[];
}

export interface FormEntry {
  pos: number;
  grid: number;
  round: number;
  gp: string;
  expected: number;
}

export interface SocialState {
  posts: Post[];
  arcs: Record<string, Arc>;
  form: Record<string, FormEntry[]>;
  uid: number;
  /** The mood towards the player's team, -1 to 1, which feeds fans and driver morale a little. */
  mood: number;
}

export const ARC_LABEL: Record<ArcKind, string> = {
  rivalry: "Rivalry",
  hot: "On a roll",
  slump: "Slump",
  teamwar: "Team-mate war",
  contract: "Contract talk",
  title: "Title fight",
  rookie: "Rising star",
  farewell: "Farewell",
};

const MAX_POSTS = 220;

export function socialOf(s: CareerState): SocialState {
  return (s.social ??= { posts: [], arcs: {}, form: {}, uid: 1, mood: 0 });
}

const team = (id: string | null | undefined) => TEAMS.find((t) => t.id === id);
const tname = (id: string | null | undefined) => team(id)?.name ?? "the team";
const last = (d: DriverState) => d.spec.name.split(" ").slice(-1)[0] ?? d.spec.name;
const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
const pick = <T,>(rng: Rng, xs: T[]): T => xs[Math.floor(rng.next() * xs.length)]!;

// ---------------------------------------------------------------- the people who post

const OUTLETS = [
  { handle: "@PaddockWire", who: "Paddock Wire" },
  { handle: "@GridLines", who: "Grid Lines" },
  { handle: "@ParcFermeDaily", who: "Parc Ferme Daily" },
  { handle: "@SectorThree", who: "Sector Three" },
];
const PUNDITS = [
  { handle: "@MarcusHale", who: "Marcus Hale" },
  { handle: "@ElenaVoss", who: "Elena Voss" },
  { handle: "@GerdKilner", who: "Gerd Kilner" },
];
const MEMES = [
  { handle: "@lap_one_chaos", who: "lap one chaos" },
  { handle: "@boxthisyear", who: "box this year" },
  { handle: "@dirtyair_dave", who: "dirty air dave" },
];
const INSIDER = { handle: "@paddock_whisper", who: "paddock whisper" };
const FAN_BITS = ["apex", "box", "undercut", "lift", "sector", "kerb", "slipstream", "pole", "drs", "pit"];

function fanHandle(rng: Rng, teamId: string | null | undefined, rival = false): { handle: string; who: string } {
  const t = team(teamId);
  const stem = (t?.short ?? "F1").toLowerCase();
  const h = `${pick(rng, FAN_BITS)}_${rival ? pick(rng, ["hater", "watch", "eyes"]) : "for"}_${stem}${rng.chance(0.5) ? Math.floor(rng.range(2, 99)) : ""}`;
  return { handle: "@" + h, who: h.replace(/_/g, " ") };
}

// ---------------------------------------------------------------- the facts of a race

interface Fact {
  d: DriverState;
  pos: number;
  grid: number;
  dnf: boolean;
  expected: number;
  /** How much better (+) or worse (-) than his car should manage. */
  surprise: number;
  streakGood: number;
  streakBad: number;
  sincePodium: number;
  pointsRow: number;
  mate?: DriverState;
  beatMate: boolean;
  firstWin: boolean;
  milestone?: string;
}

function formOf(soc: SocialState, id: string) {
  return (soc.form[id] ??= []);
}

function expectedPos(s: CareerState, rank: string[], d: DriverState): number {
  const tr = rank.indexOf(d.teamId ?? "");
  const mates = driversOf(s, d.teamId ?? "");
  const base = tr < 0 ? 11 : tr * 2 + 1 + (d.spec.pace >= (mates.find((m) => m.id !== d.id)?.spec.pace ?? 0) ? 0 : 1);
  return Math.max(1, base);
}

function buildFacts(s: CareerState, order: string[], grid: string[] | undefined, dnf: string[], gp: string, round: number): Fact[] {
  const soc = socialOf(s);
  const rank = teamRanking(s);
  const out: Fact[] = [];
  order.forEach((id, i) => {
    const d = s.drivers[id];
    if (!d || !d.teamId) return;
    const isDnf = dnf.includes(id);
    const pos = isDnf ? 99 : i + 1;
    const g = grid ? grid.indexOf(id) + 1 || 20 : i + 1;
    const exp = expectedPos(s, rank, d);
    const f = formOf(soc, id);
    f.push({ pos, grid: g, round, gp, expected: exp });
    if (f.length > 8) f.shift();
    let good = 0;
    for (let k = f.length - 1; k >= 0 && f[k]!.pos <= f[k]!.expected - 1 && f[k]!.pos < 99; k--) good++;
    let bad = 0;
    for (let k = f.length - 1; k >= 0 && (f[k]!.pos >= 99 || f[k]!.pos >= f[k]!.expected + 3); k--) bad++;
    let since = 0;
    for (let k = f.length - 1; k >= 0 && f[k]!.pos > 3; k--) since++;
    let row = 0;
    for (let k = f.length - 1; k >= 0 && f[k]!.pos <= 10; k--) row++;
    const mate = driversOf(s, d.teamId).find((x) => x.id !== id);
    const mateIdx = mate ? order.indexOf(mate.id) : -1;
    const beat = !isDnf && (mateIdx < 0 || dnf.includes(mate!.id) || i < mateIdx);
    const wins = d.wins;
    const mile = pos === 1 && [1, 5, 10, 20, 30, 50, 75, 100].includes(wins) ? (wins === 1 ? "first win" : `${ord(wins)} career win`) : undefined;
    out.push({ d, pos, grid: g, dnf: isDnf, expected: exp, surprise: isDnf ? -6 : exp - pos, streakGood: good, streakBad: bad, sincePodium: since, pointsRow: row, mate, beatMate: beat, firstWin: pos === 1 && wins === 1, milestone: mile });
  });
  return out;
}

// ---------------------------------------------------------------- storylines

function arc(soc: SocialState, key: string, kind: ArcKind, ids: string[], day: number): Arc {
  return (soc.arcs[key] ??= { key, kind, ids, heat: 0, since: day, last: day, beats: [] });
}
function bump(a: Arc, heat: number, day: number, beat?: string) {
  a.heat = clamp(a.heat + heat, 0, 1);
  a.last = day;
  if (beat && a.beats[a.beats.length - 1] !== beat) {
    a.beats.push(beat);
    if (a.beats.length > 8) a.beats.shift();
  }
}

function updateArcs(s: CareerState, facts: Fact[], order: string[], dnf: string[], gp: string) {
  const soc = socialOf(s);
  const day = s.day;
  // streaks
  for (const f of facts) {
    if (f.streakGood >= 3) bump(arc(soc, `hot:${f.d.id}`, "hot", [f.d.id], day), 0.25, day, `${f.streakGood} strong results in a row, the latest ${ord(f.pos)} at ${gp}`);
    if (f.streakBad >= 3) bump(arc(soc, `slump:${f.d.id}`, "slump", [f.d.id], day), 0.25, day, `${f.streakBad} poor weekends in a row, the latest ${f.dnf ? "a retirement" : ord(f.pos)} at ${gp}`);
    else if (f.pos <= f.expected - 3 && soc.arcs[`slump:${f.d.id}`]) soc.arcs[`slump:${f.d.id}`]!.heat *= 0.4;
    // a young driver who keeps beating the car
    const age = s.year - (f.d.spec.born ?? s.year - 28);
    if (age <= 22 && f.surprise >= 3 && !f.dnf) bump(arc(soc, `rookie:${f.d.id}`, "rookie", [f.d.id], day), 0.3, day, `${ord(f.pos)} at ${gp} from a car that should be ${ord(f.expected)}`);
    if (f.d.retiring === s.year) bump(arc(soc, `farewell:${f.d.id}`, "farewell", [f.d.id], day), 0.15, day);
  }
  // two drivers who keep finishing next to each other (not team-mates)
  const clean = order.filter((id) => !dnf.includes(id) && s.drivers[id]?.teamId).slice(0, 12);
  for (let i = 0; i + 1 < clean.length; i++) {
    const a = s.drivers[clean[i]!]!;
    const b = s.drivers[clean[i + 1]!]!;
    if (a.teamId === b.teamId) continue;
    const pa = s.standings.drivers[a.id] ?? 0;
    const pb = s.standings.drivers[b.id] ?? 0;
    if (Math.abs(pa - pb) > Math.max(25, 0.25 * Math.max(pa, pb))) continue;
    const key = `riv:${[a.id, b.id].sort().join(":")}`;
    const r = arc(soc, key, "rivalry", [a.id, b.id], day);
    bump(r, 0.2, day, `${last(a)} ahead of ${last(b)} at ${gp}, ${ord(i + 1)} and ${ord(i + 2)}`);
  }
  // my own team-mates
  const mine = driversOf(s, s.teamId);
  if (mine.length === 2 && s.rift.stage >= 1) {
    const r = arc(soc, `teamwar:${s.teamId}`, "teamwar", mine.map((d) => d.id), day);
    r.heat = clamp(Math.max(r.heat, 0.25 * s.rift.stage), 0, 1);
    r.last = day;
    const [x, y] = mine;
    const ia = order.indexOf(x!.id);
    const ib = order.indexOf(y!.id);
    if (ia >= 0 && ib >= 0 && !dnf.includes(x!.id) && !dnf.includes(y!.id)) {
      const w = ia < ib ? x! : y!;
      const l = w === x ? y! : x!;
      r.beats.push(`${last(w)} ahead of ${last(l)} at ${gp}`);
      if (r.beats.length > 8) r.beats.shift();
    }
  }
}

/** Heat fades every week, and some storylines start from the calendar rather than a race. */
export function socialWeekly(s: CareerState) {
  const soc = socialOf(s);
  const rng = rngFor(s, "social");
  for (const a of Object.values(soc.arcs)) {
    a.heat = clamp(a.heat * 0.86 - 0.01, 0, 1);
    if (a.heat <= 0.02 && s.day - a.last > 60) delete soc.arcs[a.key];
  }
  // contracts: who is out of contract and could be tempted
  const rank = teamRanking(s);
  for (const d of Object.values(s.drivers)) {
    if (d.retired || !d.teamId || d.next || d.endYear > s.year) continue;
    const key = `contract:${d.id}`;
    const a = arc(soc, key, "contract", [d.id], s.day);
    if (rng.chance(0.55)) {
      const tr = rank.indexOf(d.teamId);
      const dreamTeams = rank.filter((t, i) => i < tr && t !== d.teamId).slice(0, 3);
      const t2 = dreamTeams.length ? pick(rng, dreamTeams) : null;
      bump(a, 0.12, s.day, t2 ? `he is linked with ${tname(t2)}` : "no deal has been signed yet");
    }
  }
  // the title fight
  if (s.round >= Math.floor(s.calendar.length * 0.4)) {
    const ds = Object.entries(s.standings.drivers).sort((a, b) => b[1] - a[1]);
    if (ds.length >= 2) {
      const gap = ds[0]![1] - ds[1]![1];
      const left = s.calendar.length - s.round;
      if (left > 0 && gap <= left * 12) {
        const a = arc(soc, `title:${s.year}`, "title", [ds[0]![0], ds[1]![0]], s.day);
        a.ids = [ds[0]![0], ds[1]![0]];
        bump(a, 0.18, s.day);
      }
    }
  }
  composeWeekly(s, rng);
  trim(soc);
}

// ---------------------------------------------------------------- writing

interface Ctx {
  s: CareerState;
  rng: Rng;
  a: DriverState;
  f?: Fact;
  b?: DriverState;
  gp: string;
  arc?: Arc;
}

function add(s: CareerState, p: Omit<Post, "id" | "day" | "likes" | "shares"> & { reach: number }, rng: Rng): Post {
  const soc = socialOf(s);
  const base = p.reach * (0.6 + rng.next() * 0.9) * (1 + Math.abs(p.tone) * 0.6);
  const post: Post = {
    id: soc.uid++,
    day: s.day,
    handle: p.handle,
    who: p.who,
    persona: p.persona,
    text: p.text,
    likes: Math.round(base),
    shares: Math.round(base * (0.08 + rng.next() * 0.16)),
    tone: p.tone,
    arc: p.arc,
    team: p.team,
    driver: p.driver,
    mine: p.mine,
    replyTo: p.replyTo,
  };
  soc.posts.unshift(post);
  return post;
}

function trim(soc: SocialState) {
  if (soc.posts.length > MAX_POSTS) soc.posts.length = MAX_POSTS;
}

/** The sentence that remembers: a callback to what has already happened in this driver's story. */
function memory(c: Ctx): string {
  const { f, a } = c;
  if (!f) return "";
  const bits: string[] = [];
  if (f.streakGood >= 3) bits.push(`That is ${f.streakGood} strong weekends in a row for ${last(a)}.`);
  if (f.streakBad >= 3) bits.push(`${f.streakBad} weekends now where ${last(a)} has come away with nothing to show.`);
  if (f.pos <= 3 && f.sincePodium === 0) {
    const fm = formOf(socialOf(c.s), a.id);
    const prev = [...fm].reverse().slice(1).findIndex((x) => x.pos <= 3);
    if (prev >= 3) bits.push(`His first podium in ${prev + 1} races.`);
  }
  if (f.pointsRow >= 4 && f.pos <= 10) bits.push(`Points again: ${f.pointsRow} finishes in the top ten on the spin.`);
  const arcSlump = socialOf(c.s).arcs[`slump:${a.id}`];
  if (f.pos <= f.expected - 2 && arcSlump && arcSlump.heat > 0.3) bits.push(`Quiet the doubters. Tough few weeks and he answers on track.`);
  return bits.length ? pick(c.rng, bits) : "";
}

function surpriseWord(f: Fact): "shock" | "good" | "par" | "bad" | "awful" {
  if (f.surprise >= 5) return "shock";
  if (f.surprise >= 2) return "good";
  if (f.surprise <= -5 || f.dnf) return "awful";
  if (f.surprise <= -2) return "bad";
  return "par";
}

/** One post about one driver's weekend, in one voice. Returns text and tone. */
function raceLine(c: Ctx, persona: Persona): { text: string; tone: number } | null {
  const { f, a, rng, gp } = c;
  if (!f) return null;
  const sw = surpriseWord(f);
  const T = tname(a.teamId);
  const L = last(a);
  const climb = f.grid - f.pos;
  const from = f.dnf ? "" : climb >= 4 ? `from ${ord(f.grid)} on the grid` : climb <= -4 ? `after starting ${ord(f.grid)}` : "";
  const mem = memory(c);
  const result = f.dnf ? "retired" : `finished ${ord(f.pos)}`;
  const win = f.pos === 1;
  const pod = f.pos <= 3;
  switch (persona) {
    case "fan": {
      if (win) return { tone: 1, text: pick(rng, [`${L.toUpperCase()} WINS THE ${gp.toUpperCase()}${from ? " " + from.toUpperCase() : ""}. I am shaking. ${mem}`, `Won it. ${T} won it. ${f.milestone ? `${f.milestone[0]!.toUpperCase()}${f.milestone.slice(1)}. ` : ""}Do not talk to me for an hour.`]).trim() };
      if (sw === "shock") return { tone: 0.9, text: `${L} ${result} ${from}. That car has no business being there. ${mem}`.replace(/\s+/g, " ").trim() };
      if (pod) return { tone: 0.8, text: `Podium for ${L}. ${from ? `Only ${from}. ` : ""}${mem}`.replace(/\s+/g, " ").trim() };
      if (sw === "awful") return { tone: -0.7, text: f.dnf ? pick(rng, [`${L} out at the ${gp}. Of course. ${f.streakBad >= 2 ? "Every single week." : "Just when it was going well."}`, `Retirement for ${L}. I cannot watch ${T} some days.`]) : `${L} ${result} when the car should give ${ord(f.expected)}. Somebody explain that to me. ${mem}`.trim() };
      if (sw === "bad") return { tone: -0.4, text: `${ord(f.pos)} for ${L}. Not what we hoped for, a couple of places down on where the car should be. ${mem}`.trim() };
      return { tone: 0.1, text: `${L} ${result}. Solid enough, ${T} take the points. ${mem}`.trim() };
    }
    case "rival": {
      if (sw === "awful" || sw === "bad") return { tone: -0.8, text: pick(rng, [`${L} ${f.dnf ? "retires" : `P${f.pos}`}${f.streakBad >= 2 ? " again" : ""}. ${T} people can say what they want, the pace was never there.`, `Funny how quiet the ${T} fans are today.${f.streakBad >= 2 ? ` ${f.streakBad} bad weekends in a row, by the way.` : ""}`]) };
      if (win) return { tone: -0.3, text: `Fine. ${L} won. Enjoy it, it will not happen at the next one.` };
      return null;
    }
    case "press": {
      if (win) return { tone: 0.7, text: `${L} wins the ${gp}${from ? ", " + from : ""}${f.milestone ? `, his ${f.milestone}` : ""}. ${mem}`.trim() };
      if (sw === "shock") return { tone: 0.6, text: `${T} stun the field: ${L} ${result} ${from}, ${f.expected - f.pos} places better than the car has any right to.` };
      if (f.dnf) return { tone: -0.4, text: `Retirement for ${L} at the ${gp}. Questions for ${T} about reliability.` };
      if (sw === "awful" || sw === "bad") return { tone: -0.5, text: `${L} only ${ord(f.pos)} at the ${gp}. Is the problem the car or the driver? ${mem}`.trim() };
      return null;
    }
    case "pundit": {
      if (sw === "shock" || (win && sw !== "par")) return { tone: 0.6, text: `The numbers say ${L} should have been ${ord(f.expected)} today. ${f.dnf ? "" : `He was ${ord(f.pos)}.`} That is ${f.surprise} places of driver, not car.` };
      if (f.streakBad >= 3) return { tone: -0.6, text: `Three poor weekends is a pattern, not bad luck. ${L} needs to reset, and ${T} need to find what is wrong underneath.` };
      if (f.beatMate && f.mate && f.pos <= 8) return { tone: 0.2, text: `${L} had the edge over ${last(f.mate)} again today, in the same car. That gap is worth watching.` };
      return null;
    }
    case "meme": {
      if (f.dnf) return { tone: -0.5, text: pick(rng, [`${L}: i was just standing there, ${T}: it was a feature`, `${T} garage when ${L} slows on lap ${Math.floor(rng.range(8, 40))}: [thousand yard stare]`]) };
      if (sw === "shock") return { tone: 0.7, text: `${L} in a ${T} on ${ord(f.pos)}, the grid behind him: did I do that?` };
      if (f.streakBad >= 2) return { tone: -0.5, text: `${L}'s points total after ${gp}: please hold, our servers are busy` };
      return null;
    }
    default:
      return null;
  }
}

function replyTo(s: CareerState, parent: Post, c: Ctx, rng: Rng) {
  const f = c.f;
  if (!f) return;
  const neg = parent.tone < -0.2;
  const T = tname(c.a.teamId);
  if (parent.persona === "fan" && neg && rng.chance(0.55)) {
    const r = fanHandle(rng, pickOtherTeam(s, rng, c.a.teamId), true);
    add(s, { ...r, persona: "rival", text: pick(rng, [`Not even surprised. ${f.streakBad >= 2 ? "It is a trend." : "Next."}`, `${T}, everyone.`, `${last(c.a)} will bounce back, said every fan at every low point.`]), tone: -0.6, replyTo: parent.id, team: c.a.teamId ?? undefined, driver: c.a.id, mine: c.a.teamId === s.teamId, reach: 14 }, rng);
  } else if (parent.persona === "press" && rng.chance(0.4)) {
    const r = fanHandle(rng, c.a.teamId);
    add(s, { ...r, persona: "fan", text: neg ? `Easy to write that after the fact. Let the team work.` : `Remember this when you write them off next month.`, tone: neg ? -0.2 : 0.4, replyTo: parent.id, team: c.a.teamId ?? undefined, driver: c.a.id, mine: c.a.teamId === s.teamId, reach: 10 }, rng);
  } else if (parent.persona === "fan" && !neg && rng.chance(0.4)) {
    const m = pick(rng, MEMES);
    add(s, { ...m, persona: "meme", text: pick(rng, ["this is the content i signed up for", "the replies are going to be insane tonight", `${last(c.a)} fans in shambles (positive)`]), tone: 0.5, replyTo: parent.id, team: c.a.teamId ?? undefined, driver: c.a.id, mine: c.a.teamId === s.teamId, reach: 12 }, rng);
  }
}

const pickOtherTeam = (s: CareerState, rng: Rng, not: string | null | undefined) => pick(rng, Object.keys(s.teams).filter((t) => t !== not));

/** After a race: facts in, posts out, storylines updated and the mood of the fans moved. */
export interface RadioQuote {
  carId: string;
  tag: "bleep" | "refused" | "fatigue" | "over";
  text: string;
}

/** A radio moment that leaves the garage: the clip, as fans and the press would repeat it. Never invented, only what was actually said. */
function radioClips(s: CareerState, rng: Rng, quotes: RadioQuote[], gp: string) {
  const seen = new Set<string>();
  let n = 0;
  for (const q of quotes) {
    const d = s.drivers[q.carId];
    if (!d || seen.has(q.carId + q.tag) || n >= 2) continue;
    seen.add(q.carId + q.tag);
    const said = q.text.replace(/^[A-Z]{2,4}: /, "").replace(/\(talking over the engineer\) /, "");
    const quote = `"${said}"`;
    const nm = d.spec.name.split(" ").slice(-1)[0];
    const lines: Record<RadioQuote["tag"], { text: string; tone: number }[]> = {
      bleep: [
        { text: `The radio from ${nm} at the ${gp}, bleeped and all: ${quote}`, tone: -0.2 },
        { text: `Not sure that one makes it to the highlights. ${nm} on the radio: ${quote}`, tone: -0.1 },
      ],
      refused: [
        { text: `${nm} was not having it from the pit wall: ${quote}`, tone: -0.3 },
        { text: `Team radio from the ${gp}. ${nm} was asked to do something and said: ${quote}`, tone: -0.25 },
      ],
      fatigue: [
        { text: `${nm} had heard enough from the pit wall: ${quote}`, tone: -0.15 },
        { text: `Too many messages? ${nm} on the radio: ${quote}`, tone: -0.1 },
      ],
      over: [
        { text: `${nm} spoke over his engineer in the ${gp}: ${quote}`, tone: -0.1 },
        { text: `Tense on the ${d.teamId === s.teamId ? "pit wall" : "radio"}. ${nm} cut across the call: ${quote}`, tone: -0.1 },
      ],
    };
    const pickLine = lines[q.tag]![Math.floor(rng.next() * 2) % 2]!;
    const who = pick(rng, [...OUTLETS, ...MEMES]);
    add(s, { ...who, persona: "meme", text: pickLine.text, tone: pickLine.tone, team: d.teamId ?? undefined, driver: d.id, mine: d.teamId === s.teamId, reach: 110 }, rng);
    n++;
  }
}

export function socialAfterRace(s: CareerState, order: string[], grid: string[] | undefined, dnf: string[], gp: string, round: number, radio?: RadioQuote[]) {
  const soc = socialOf(s);
  const rng = rngFor(s, `social-race-${round}`);
  const facts = buildFacts(s, order, grid, dnf, gp, round);
  updateArcs(s, facts, order, dnf, gp);
  if (radio?.length) radioClips(s, rng, radio, gp);
  // who is worth talking about: the winner, the big surprises, the heavy falls, and always the player's drivers
  const mineIds = driversOf(s, s.teamId).map((d) => d.id);
  const interesting = facts.filter((f) => f.pos === 1 || Math.abs(f.surprise) >= 4 || f.dnf && (f.expected <= 8) || f.milestone || mineIds.includes(f.d.id)).slice(0, 7);
  let moodSum = 0;
  let moodN = 0;
  for (const f of interesting) {
    const c: Ctx = { s, rng, a: f.d, f, gp };
    const mine = f.d.teamId === s.teamId;
    const personas: Persona[] = ["fan", "press", "pundit", "meme", "rival"];
    let made = 0;
    for (const p of personas) {
      if (made >= (mine ? 4 : 3)) break;
      const line = raceLine(c, p);
      if (!line) continue;
      const who = p === "fan" ? fanHandle(rng, f.d.teamId) : p === "rival" ? fanHandle(rng, pickOtherTeam(s, rng, f.d.teamId), true) : p === "press" ? pick(rng, OUTLETS) : p === "pundit" ? pick(rng, PUNDITS) : pick(rng, MEMES);
      const post = add(s, { ...who, persona: p, text: line.text, tone: line.tone, team: f.d.teamId ?? undefined, driver: f.d.id, mine, reach: p === "press" ? 160 : p === "pundit" ? 90 : p === "meme" ? 120 : 18 }, rng);
      replyTo(s, post, c, rng);
      made++;
      if (mine) {
        moodSum += line.tone * (p === "fan" ? 0.5 : 1);
        moodN++;
      }
    }
    // the team and the driver themselves, after the big ones
    if (mine && (f.pos <= 3 || f.dnf)) {
      const t = team(f.d.teamId);
      add(s, { handle: `@${t?.short ?? "TEAM"}`, who: tname(f.d.teamId), persona: "team", text: f.pos === 1 ? `P1. ${f.d.spec.name} wins the ${gp}. Thank you to everyone at the factory.` : f.pos <= 3 ? `P${f.pos} for ${last(f.d)} at the ${gp}. Podium. Back to work on the next one.` : `${last(f.d)} is out of the ${gp}. We will find out why and come back stronger.`, tone: f.pos <= 3 ? 0.8 : -0.1, team: f.d.teamId ?? undefined, driver: f.d.id, mine: true, reach: 220 }, rng);
    }
  }
  // the biggest live storyline gets a line from an insider
  const hot = Object.values(soc.arcs).sort((a, b) => b.heat - a.heat)[0];
  if (hot && hot.heat > 0.45 && hot.last === s.day) composeArc(s, hot, rng, gp);
  if (moodN) {
    const m = clamp(moodSum / moodN, -1, 1);
    soc.mood = clamp(soc.mood * 0.6 + m * 0.4, -1, 1);
    s.brand.fans = clamp(s.brand.fans + m * 0.9, 0, 100);
    for (const d of driversOf(s, s.teamId)) {
      const own = facts.find((x) => x.d.id === d.id);
      if (own && own.surprise <= -4) d.morale = clamp(d.morale - 0.012 * (1 - ((d.spec.psyche as { resilience?: number } | undefined)?.resilience ?? 0.5) * 0.6), 0, 1);
    }
  }
  trim(soc);
}

function composeArc(s: CareerState, a: Arc, rng: Rng, gp: string) {
  const ds = a.ids.map((id) => s.drivers[id]).filter(Boolean) as DriverState[];
  if (!ds.length) return;
  const d0 = ds[0]!;
  const d1 = ds[1];
  const mine = ds.some((d) => d.teamId === s.teamId);
  const recent = a.beats.slice(-2).join("; ");
  const ins = INSIDER;
  const push = (who: { handle: string; who: string }, persona: Persona, text: string, tone: number, reach: number) =>
    add(s, { ...who, persona, text, tone, arc: a.key, team: d0.teamId ?? undefined, driver: d0.id, mine, reach }, rng);
  switch (a.kind) {
    case "rivalry":
      if (d1) {
        push(pick(rng, OUTLETS), "press", `${last(d0)} against ${last(d1)} is turning into the fight of the season. ${recent}.`, 0.3, 150);
        push(pick(rng, MEMES), "meme", `${last(d0)} and ${last(d1)} have now been next to each other ${a.beats.length} times. Get a room.`, 0.2, 100);
      }
      break;
    case "teamwar":
      if (d1) {
        push(pick(rng, OUTLETS), "press", s.rift.stage >= 3 ? `Open war at ${tname(d0.teamId)}: ${last(d0)} and ${last(d1)} are barely speaking. Something has to give.` : `Tension building inside ${tname(d0.teamId)} between ${last(d0)} and ${last(d1)}. ${recent}.`, -0.5, 170);
        push(ins, "insider", `Hearing the mood inside ${tname(d0.teamId)} is worse than it looks. The team principal has a decision to make.`, -0.6, 90);
      }
      break;
    case "slump":
      push(pick(rng, PUNDITS), "pundit", `${last(d0)} has had ${a.beats.length > 1 ? "a rough run" : "a bad weekend"}: ${recent}. Confidence is everything in this sport.`, -0.5, 90);
      break;
    case "hot":
      push(pick(rng, OUTLETS), "press", `${last(d0)} is the form driver in the paddock right now: ${recent}.`, 0.6, 140);
      break;
    case "rookie":
      push(pick(rng, PUNDITS), "pundit", `Keep an eye on ${last(d0)}. ${recent}. Teams with a seat to fill will have noticed.`, 0.6, 90);
      break;
    case "farewell":
      push(pick(rng, OUTLETS), "press", `${d0.spec.name} will hang up his helmet at the end of the season. ${gp} was another reminder of what the grid will miss.`, 0.4, 150);
      break;
    case "title":
      if (d1) push(pick(rng, OUTLETS), "press", `${last(d0)} leads ${last(d1)} by ${Math.abs((s.standings.drivers[d0.id] ?? 0) - (s.standings.drivers[d1.id] ?? 0))} points with ${s.calendar.length - s.round} races to go. The title is not settled.`, 0.2, 200);
      break;
    case "contract":
      push(ins, "insider", `${d0.spec.name}'s contract runs out at the end of the year and ${a.beats[a.beats.length - 1] ?? "talks have not started"}. Do not expect an announcement soon.`, 0, 80);
      break;
  }
}

function composeWeekly(s: CareerState, rng: Rng) {
  const soc = socialOf(s);
  const hot = Object.values(soc.arcs).filter((a) => a.heat > 0.3 && s.day - a.last < 20 && !soc.posts.some((p) => p.arc === a.key && s.day - p.day < 9));
  if (!hot.length) return;
  const a = hot.sort((x, y) => y.heat - x.heat)[0]!;
  composeArc(s, a, rng, "the last race");
  trim(soc);
}

// ---------------------------------------------------------------- reading it

export function postsAbout(s: CareerState, filter: "all" | "mine" | "storyline" | string): Post[] {
  const soc = socialOf(s);
  if (filter === "mine") return soc.posts.filter((p) => p.mine);
  if (filter === "storyline") return soc.posts.filter((p) => p.arc);
  if (filter !== "all") return soc.posts.filter((p) => p.arc === filter);
  return soc.posts;
}

export function liveArcs(s: CareerState): Arc[] {
  return Object.values(socialOf(s).arcs).filter((a) => a.heat > 0.08).sort((x, y) => y.heat - x.heat).slice(0, 8);
}

export function arcTitle(s: CareerState, a: Arc): string {
  const n = (i: number) => s.drivers[a.ids[i] ?? ""]?.spec.name ?? "?";
  switch (a.kind) {
    case "rivalry": case "teamwar": return `${n(0)} vs ${n(1)}`;
    case "title": return `${n(0)} vs ${n(1)} for the title`;
    default: return n(0);
  }
}

export const postAge = (s: CareerState, p: Post) => (s.day - p.day <= 0 ? "today" : s.day - p.day === 1 ? "yesterday" : fmtDay(p.day));

/** A post from the player's own team account (the player answering the storm). */
export function teamPost(s: CareerState, text: string, tone: number, driverId?: string) {
  const rng = rngFor(s, `teampost:${text.length}`);
  const t = team(s.teamId);
  add(s, { handle: `@${t?.short ?? "TEAM"}`, who: tname(s.teamId), persona: "team", text, tone, team: s.teamId, driver: driverId, mine: true, reach: 240 }, rng);
}

/** The loudest storyline about the player's team right now, if it is loud enough to need an answer. */
export function stormAbout(s: CareerState): Arc | undefined {
  const mine = new Set(driversOf(s, s.teamId).map((d) => d.id));
  return Object.values(socialOf(s).arcs)
    .filter((a) => (a.kind === "slump" || a.kind === "teamwar" || a.kind === "contract") && a.heat >= 0.5 && a.ids.some((id) => mine.has(id)))
    .sort((a, b) => b.heat - a.heat)[0];
}
