import { Rng, hashSeed } from "../sim/rng";
import type { DriverSpec } from "../sim/types";
import { DRIVERS, TEAMS } from "./data";

/**
 * Every person the game knows about, ladder by ladder. All names are invented and generated
 * deterministically, so a world looks the same on every run.
 */

export type Tier = "F1" | "F2" | "F3" | "FRECA" | "GB3" | "F1A" | "F4" | "RES";

export const TIER_LABEL: Record<Tier, string> = {
  F1: "GRAND PRIX",
  F2: "SERIES 2",
  F3: "SERIES 3",
  FRECA: "CONTINENTAL SERIES",
  GB3: "ISLAND SERIES",
  F1A: "ACADEMY SERIES",
  F4: "SERIES 4",
  RES: "RESERVES + FREE AGENTS",
};

/** Seats each tier has to fill. When the real list is shorter than this, made-up names are used for the rest. */
export const TIER_SEATS: Record<Tier, number> = { F1: 22, F2: 22, F3: 30, FRECA: 30, GB3: 26, F1A: 18, F4: 60, RES: 12 };

/** Base level of a typical driver at each tier, on the same 0.9 to 1.0 pace scale the F1 sim uses. */
const TIER_PACE: Record<Tier, number> = { F1: 0.99, F2: 0.979, F3: 0.97, FRECA: 0.962, GB3: 0.955, F1A: 0.95, F4: 0.94, RES: 0.982 };

export interface Person {
  id: string;
  name: string;
  code: string;
  nat: string;
  born?: number;
  tier: Tier;
  team?: string;
  number?: number;
  pace: number;
  tyreMgmt: number;
  aggression: number;
  consistency: number;
  /** 0..1, how good they could become. */
  potential: number;
  fictional: boolean;
}

type Row = [name: string, nat: string];
type Series = Record<string, Row[]>;

/** Invented junior teams per ladder. Nothing here is a real team or a real person. */
const LADDER_TEAMS: Record<string, string[]> = {
  F2: ["Beacon Motorsport", "Harrier Racing", "Quill Sport", "Northgate GP", "Sable Racing", "Tidewater Motorsport", "Kestrel Racing", "Ironbridge Sport", "Lantern Racing", "Foxglove Motorsport", "Redwood GP"],
  F3: ["Beacon Motorsport", "Harrier Racing", "Quill Sport", "Northgate GP", "Sable Racing", "Tidewater Motorsport", "Kestrel Racing", "Ironbridge Sport", "Lantern Racing", "Foxglove Motorsport"],
  FRECA: ["Harbour Racing", "Pinecrest Motorsport", "Alder GP", "Coppice Racing", "Saltmarsh Sport", "Birchwood Motorsport", "Fernhill Racing", "Stonebridge GP", "Marlin Sport", "Heron Racing"],
  GB3: ["Hollow Oak Racing", "Dunmore Motorsport", "Tarn Sport", "Wrenfield Racing", "Cairn Motorsport", "Vale GP", "Linden Racing", "Moorgate Sport"],
  F1A: ["Spark Academy", "Ember Academy", "Aurora Academy", "Mistral Academy", "Zephyr Academy"],
  F4: ["Juniper Racing", "Teal Motorsport", "Wicker Sport", "Copperfield Racing", "Mallow Motorsport", "Gorse Racing", "Thistle Sport", "Oakhurst Racing", "Brindle Motorsport", "Quarry GP", "Fenwick Sport", "Lark Racing"],
};
const LADDER_PER_TEAM: Record<string, number> = { F2: 2, F3: 3, FRECA: 3, GB3: 3, F1A: 4, F4: 5 };

/** Build the invented ladders. Deterministic: same names every run. */
function buildSeries(): Record<string, Series> {
  const out: Record<string, Series> = {};
  const nats = Object.keys(FIRST);
  for (const key of Object.keys(LADDER_TEAMS)) {
    const rng = new Rng(hashSeed(`ladder:${key}`));
    const series: Series = {};
    for (const team of LADDER_TEAMS[key]) {
      const rows: Row[] = [];
      for (let k = 0; k < LADDER_PER_TEAM[key]; k++) {
        const nat = rng.pick(nats);
        rows.push([`${rng.pick(FIRST[nat])} ${rng.pick(LAST[nat])}`, nat]);
      }
      series[team] = rows;
    }
    out[key] = series;
  }
  return out;
}

/** Invented drivers without a race seat: test and reserve drivers. */
function buildReserves(): Row[] {
  const rng = new Rng(hashSeed("reserves"));
  const nats = Object.keys(FIRST);
  const rows: Row[] = [];
  for (let k = 0; k < 18; k++) {
    const nat = rng.pick(nats);
    rows.push([`${rng.pick(FIRST[nat])} ${rng.pick(LAST[nat])}`, nat]);
  }
  return rows;
}

const BORN: Record<string, number> = {};
const PROSPECTS: Record<string, { pace: number; potential: number }> = {};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Three-letter timing code from a surname, unique within `used`. */
function makeCode(name: string, used: Set<string>): string {
  const surname = name.split(" ").slice(-1)[0].normalize("NFD").replace(/[^A-Za-z]/g, "").toUpperCase().padEnd(3, "X");
  const first = name.split(" ")[0].normalize("NFD").replace(/[^A-Za-z]/g, "").toUpperCase();
  const options = [surname.slice(0, 3), surname[0] + surname[1] + (surname[3] ?? "X"), first[0] + surname.slice(0, 2), surname.slice(0, 2) + first[0]];
  for (const o of options) if (!used.has(o)) return o;
  // every near miss is taken: walk the whole three-letter space (surname start first), then give up gracefully
  const A = (n: number) => String.fromCharCode(65 + (n % 26));
  for (let k = 0; k < 26 * 26; k++) {
    const c = surname[0] + A(Math.floor(k / 26)) + A(k);
    if (!used.has(c)) return c;
  }
  for (let k = 0; k < 26 * 26 * 26; k++) {
    const c = A(Math.floor(k / 676)) + A(Math.floor(k / 26)) + A(k);
    if (!used.has(c)) return c;
  }
  return surname.slice(0, 3);
}

function slug(name: string): string {
  return name.normalize("NFD").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

function rate(name: string, tier: Tier): Pick<Person, "pace" | "tyreMgmt" | "aggression" | "consistency" | "potential"> {
  const r = new Rng(hashSeed(name));
  const known = PROSPECTS[name];
  const pace = known ? known.pace : clamp(TIER_PACE[tier] + r.gauss() * 0.004, 0.93, 0.99);
  return {
    pace,
    tyreMgmt: clamp(0.62 + r.gauss() * 0.12, 0.35, 0.95),
    aggression: clamp(0.58 + r.gauss() * 0.15, 0.2, 0.95),
    consistency: clamp(0.72 + r.gauss() * 0.08 - (tier === "F4" ? 0.05 : 0), 0.5, 0.92),
    potential: known ? known.potential : clamp(0.72 + r.gauss() * 0.1, 0.5, 0.92),
  };
}

let CACHE: { byTier: Record<Tier, Person[]>; names: Set<string>; codes: Set<string> } | null = null;

/** All real people the game ships with, grouped by their highest-level 2026 seat. */
export function realPeople(): { byTier: Record<Tier, Person[]>; names: Set<string> } {
  if (CACHE) return CACHE;
  const byTier: Record<Tier, Person[]> = { F1: [], F2: [], F3: [], FRECA: [], GB3: [], F1A: [], F4: [], RES: [] };
  const names = new Set<string>();
  const codes = new Set<string>();

  // F1: the actual grid, with the game's hand-tuned ratings
  for (const team of TEAMS) {
    for (const d of DRIVERS[team.id]) {
      names.add(d.name);
      codes.add(d.code);
      byTier.F1.push({
        id: d.id, name: d.name, code: d.code, nat: d.nat ?? "", born: d.born, tier: "F1", team: team.name, number: d.number,
        pace: d.pace, tyreMgmt: d.tyreMgmt, aggression: d.aggression, consistency: d.consistency, potential: 0.9, fictional: false,
      });
    }
  }
  const add = (tier: Tier, series: Series) => {
    for (const [team, rows] of Object.entries(series)) {
      for (const [name, nat] of rows) {
        if (names.has(name)) continue; // already placed in a higher tier
        names.add(name);
        const code = makeCode(name, codes);
        codes.add(code);
        byTier[tier].push({ id: `${tier.toLowerCase()}-${slug(name)}`, name, code, nat, tier, team, ...rate(name, tier), fictional: false });
      }
    }
  };
  // reserves first (they are the highest-level people outside the 22 seats)
  for (const [name, nat] of buildReserves()) {
    if (names.has(name)) continue;
    names.add(name);
    const code = makeCode(name, codes);
    codes.add(code);
    byTier.RES.push({ id: `res-${slug(name)}`, name, code, nat, born: BORN[name], tier: "RES", ...rate(name, "RES"), fictional: false });
  }
  const ladders = buildSeries();
  add("F2", ladders.F2);
  add("F3", ladders.F3);
  add("FRECA", ladders.FRECA);
  add("GB3", ladders.GB3);
  add("F1A", ladders.F1A);
  add("F4", ladders.F4);
  CACHE = { byTier, names, codes };
  return CACHE;
}

// ---------------------------------------------------------------- made-up names (last resort)

const FIRST: Record<string, string[]> = {
  GBR: ["Oliver", "Harry", "Jack", "Noah", "Charlie", "Freddie", "Archie", "Leo", "Theo", "Arthur", "Ruby", "Ellie"],
  ITA: ["Luca", "Matteo", "Marco", "Davide", "Lorenzo", "Alessio", "Federico", "Giulia", "Chiara"],
  ESP: ["Pablo", "Hugo", "Mateo", "Álvaro", "Diego", "Sergio", "Lucía", "Carla"],
  FRA: ["Hugo", "Lucas", "Louis", "Nathan", "Enzo", "Théo", "Camille", "Léa"],
  GER: ["Jonas", "Leon", "Finn", "Paul", "Niklas", "Lukas", "Mia", "Lena"],
  NED: ["Daan", "Sem", "Bram", "Thijs", "Jesse", "Lars", "Eva", "Noor"],
  BRA: ["Gabriel", "Rafael", "Thiago", "Caio", "Enzo", "Pedro", "Larissa"],
  JPN: ["Haruto", "Ren", "Sota", "Kaito", "Riku", "Yuma", "Hana", "Mio"],
  IND: ["Arjun", "Aarav", "Vihaan", "Krish", "Rohan", "Anaya", "Diya"],
  AUS: ["Jack", "Lachlan", "Ryan", "Mitchell", "Zac", "Chloe", "Grace"],
  USA: ["Mason", "Ethan", "Logan", "Tyler", "Dylan", "Ava", "Emma"],
  MEX: ["Santiago", "Emiliano", "Diego", "Mateo", "Valentina", "Camila"],
  FIN: ["Eetu", "Aleksi", "Elias", "Veeti", "Aino"],
  SWE: ["Lukas", "Oscar", "Elias", "Axel", "Freja"],
  POL: ["Jakub", "Filip", "Szymon", "Kacper", "Zuzanna"],
};
const LAST: Record<string, string[]> = {
  GBR: ["Whitlock", "Harrow", "Pemberton", "Ashcroft", "Fenwick", "Calloway", "Thorne", "Marlow", "Lockwood", "Bramley"],
  ITA: ["Ferraro", "Colombo", "Bellini", "Moretti", "Gallo", "Rinaldi", "Marchetti", "Caruso", "Lombardi"],
  ESP: ["Navarro", "Cabrera", "Ibáñez", "Montero", "Rivas", "Soler", "Velasco", "Quintana"],
  FRA: ["Marchand", "Delacroix", "Fontaine", "Girard", "Lefèvre", "Rousseau", "Baptiste", "Vasseur"],
  GER: ["Hartmann", "Brandt", "Vogel", "Kessler", "Lindner", "Albrecht", "Winkler", "Sauer"],
  NED: ["de Wit", "van Dijk", "Bakker", "Visser", "Smit", "Mulder", "Kuipers", "de Graaf"],
  BRA: ["Carvalho", "Moreira", "Andrade", "Teixeira", "Barbosa", "Lacerda", "Nogueira"],
  JPN: ["Takeda", "Fujimoto", "Okabe", "Hayashi", "Mori", "Sakai", "Ishikawa", "Kuroda"],
  IND: ["Mehra", "Kapoor", "Rao", "Nair", "Bhatt", "Desai", "Iyer", "Malhotra"],
  AUS: ["Hendry", "Calder", "Brennan", "Keane", "Mackay", "Tolland", "Rooney"],
  USA: ["Callahan", "Brooks", "Whitfield", "Maddox", "Kessler", "Holloway", "Prescott"],
  MEX: ["Salazar", "Beltrán", "Ochoa", "Villarreal", "Zepeda", "Lozano"],
  FIN: ["Lehtinen", "Korhonen", "Virtanen", "Salmi", "Heikkilä"],
  SWE: ["Lindqvist", "Ekström", "Bergman", "Holmberg", "Sjöberg"],
  POL: ["Nowicki", "Wójcik", "Kamiński", "Zielinski", "Lewandowicz"],
};

/** Invent a driver. Only called when the real names for a tier have run out. */
export function generateDriver(rng: Rng, tier: Tier, taken: Set<string>, usedCodes: Set<string>, id: string): Person {
  const nats = Object.keys(FIRST);
  for (let attempt = 0; attempt < 200; attempt++) {
    const nat = rng.pick(nats);
    const name = `${rng.pick(FIRST[nat])} ${rng.pick(LAST[nat])}`;
    if (taken.has(name)) continue;
    taken.add(name);
    const code = makeCode(name, usedCodes);
    usedCodes.add(code);
    const rt = rate(name, tier);
    return { id, name, code, nat, tier, ...rt, fictional: true };
  }
  throw new Error("name pool exhausted");
}

/**
 * Fill a tier: real people first, in the order they appear in the 2026 entry list, and made-up drivers only
 * for the seats the real list cannot cover.
 */
export function fillTier(tier: Tier, seats: number, seed = 1): Person[] {
  const real = realPeople();
  const out = real.byTier[tier].slice(0, seats);
  if (out.length >= seats) return out;
  const rng = new Rng(hashSeed(`${tier}:${seed}`));
  const taken = new Set(real.names);
  const codes = new Set(real.byTier.F1.map((p) => p.code));
  for (const t of Object.values(real.byTier)) for (const p of t) codes.add(p.code);
  for (const p of out) taken.add(p.name);
  let k = 0;
  while (out.length < seats) out.push(generateDriver(rng, tier, taken, codes, `gen-${tier.toLowerCase()}-${seed}-${k++}`));
  return out;
}

export function toDriverSpec(p: Person, number: number): DriverSpec {
  return {
    id: p.id, code: p.code, name: p.name, number, nat: p.nat, born: p.born, fictional: p.fictional,
    pace: p.pace, tyreMgmt: p.tyreMgmt, aggression: p.aggression, consistency: p.consistency,
  };
}
