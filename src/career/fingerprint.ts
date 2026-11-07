import { Rng, hashSeed } from "../sim/rng";
import { teamRanking } from "./car";
import { news } from "./cards";
import { baseTeam } from "./car";
import { forceStory } from "./stories";
import type { CareerState } from "./types";

/**
 * What makes one career different from another, without making any career better or worse.
 * Every career gets the same number of optional letters and the same three big story beats a season.
 * The fingerprint only decides WHO the owner is, WHO holds a grudge, and WHICH three stories those beats are.
 */
export type Temper = "patient" | "handson" | "penny" | "showman";
export type Grudge = "stole" | "snub" | "cheat" | "prize";
export interface Print {
  temper: Temper;
  rivals: { team: string; grudge: Grudge }[];
  arcs: string[];
}

export const TEMPERS: Temper[] = ["patient", "handson", "penny", "showman"];
export const TEMPER_LINE: Record<Temper, string> = {
  patient: "He is a patient man and plays the long game.",
  handson: "He likes to be in the garage and wants a say in everything.",
  penny: "He watches every dollar and reads every invoice.",
  showman: "He loves the cameras and wants the team in the headlines.",
};
const GRUDGE_LINE: Record<Grudge, (n: string) => string> = {
  stole: (n) => `${n} still say you took one of their people. Expect them to remember it.`,
  snub: (n) => `${n} have not forgotten how last year's talks ended.`,
  cheat: (n) => `${n} are telling anyone who listens that your car is not entirely clean.`,
  prize: (n) => `${n} want your place in the order and have said so in public.`,
};
/** Stories that can stand as a big beat on their own. */
export const ARC_POOL = ["tabloid", "legend", "napkin", "tourist", "kart", "hottub", "envelope", "trophy", "sinking", "viral"];
const MARKS = [0.2, 0.5, 0.8];

export function makePrint(s: CareerState): Print {
  const rng = new Rng(hashSeed(`print:${s.seed}:${s.teamId}`));
  const temper = TEMPERS[Math.floor(rng.next() * TEMPERS.length)];
  const near = teamRanking(s).filter((t) => t !== s.teamId);
  const i = near.indexOf(teamRanking(s).filter((t) => t !== s.teamId)[0]);
  const pool = near.slice(Math.max(0, i), 6);
  const a = pool.splice(Math.floor(rng.next() * pool.length), 1)[0];
  const b = pool.splice(Math.floor(rng.next() * pool.length), 1)[0] ?? near[near.length - 1];
  const grudges: Grudge[] = ["stole", "snub", "cheat", "prize"];
  const g1 = grudges.splice(Math.floor(rng.next() * grudges.length), 1)[0];
  const g2 = grudges[Math.floor(rng.next() * grudges.length)];
  const arcs = [...ARC_POOL];
  const picked: string[] = [];
  for (let k = 0; k < 3; k++) picked.push(arcs.splice(Math.floor(rng.next() * arcs.length), 1)[0]);
  return { temper, rivals: [{ team: a, grudge: g1 }, { team: b, grudge: g2 }], arcs: picked };
}

export function printOf(s: CareerState): Print {
  return (s.print ??= makePrint(s));
}

/** How much a temperament leans on an event. Normalised by the caller, so the total never changes. */
export function lean(s: CareerState, eventId: string): number {
  const t = printOf(s).temper;
  const table: Record<Temper, Record<string, number>> = {
    patient: { ownerVisit: 0.6, ownerStretch: 0.8, supplierDeal: 1.2 },
    handson: { ownerVisit: 1.6, ownerStretch: 1.5, techUnhappy: 1.3 },
    penny: { supplierDeal: 1.6, sponsorAsk: 1.4, factoryCrunch: 1.3 },
    showman: { pressTurns: 1.6, sponsorAsk: 1.5, legend: 1.3 },
  };
  return table[t][eventId] ?? 1;
}

/** Three beats a season for everybody: the fingerprint names them, the calendar spaces them. Rivals get a line too. */
export function beatsWeekly(s: CareerState) {
  if (s.weekend || !s.calendar.length) return;
  const p = printOf(s);
  const led = (s.story.beats ??= {});
  const e = (led[s.year] ??= { n: 0, grudge: 0 });
  const prog = s.round / s.calendar.length;
  if (e.n < 3 && prog >= MARKS[e.n]) {
    let id = p.arcs[e.n];
    if (!forceStory(s, id, true)) {
      const spare = ARC_POOL.find((x) => !p.arcs.includes(x) && forceStory(s, x, true));
      if (spare) id = spare;
    }
    e.n++;
  }
  if (e.grudge < 2 && prog >= (e.grudge === 0 ? 0.35 : 0.65)) {
    const r = p.rivals[e.grudge];
    news(s, GRUDGE_LINE[r.grudge](baseTeam(r.team).name), { importance: 2, tag: "rivalry" });
    e.grudge++;
  }
}
