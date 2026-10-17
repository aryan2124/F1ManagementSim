import { Rng, hashSeed } from "../sim/rng";
import type { DriverSpec } from "../sim/types";
import { DRIVERS, TEAMS } from "./data";

/**
 * Every real person the game knows about, ladder by ladder, plus a generator that invents
 * drivers ONLY after the real names for a tier have run out.
 *
 * Source: 2026 entry lists (F2, F3, FRECA, GB3, F1 Academy, Italian F4, British F4) and the F1 reserve bench.
 * Ratings for juniors are the game's own estimates (deterministic per name), not official data.
 */

export type Tier = "F1" | "F2" | "F3" | "FRECA" | "GB3" | "F1A" | "F4" | "RES";

export const TIER_LABEL: Record<Tier, string> = {
  F1: "FORMULA 1",
  F2: "FORMULA 2",
  F3: "FORMULA 3",
  FRECA: "FORMULA REGIONAL EUROPE",
  GB3: "GB3",
  F1A: "F1 ACADEMY",
  F4: "FORMULA 4 (ITALIA / BRITISH)",
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

const F2: Series = {
  "Invicta Racing": [["Rafael Câmara", "BRA"], ["Joshua Dürksen", "PAR"]],
  Hitech: [["Ritomo Miyata", "JPN"], ["Colton Herta", "USA"]],
  "Campos Racing": [["Noel León", "MEX"], ["Nikola Tsolov", "BUL"]],
  "DAMS Lucas Oil": [["Dino Beganovic", "SWE"], ["Roman Bilinski", "POL"]],
  "MP Motorsport": [["Gabriele Minì", "ITA"], ["Oliver Goethe", "GER"]],
  "Prema Racing": [["Sebastián Montoya", "COL"], ["Mari Boya", "ESP"]],
  "Rodin Motorsport": [["Martinius Stenshorne", "NOR"], ["Alex Dunne", "IRL"]],
  "ART Grand Prix": [["Kush Maini", "IND"], ["Tasanapol Inthraphuvasak", "THA"]],
  "AIX Racing": [["Emerson Fittipaldi Jr.", "BRA"], ["Cian Shields", "GBR"]],
  "Van Amersfoort Racing": [["Nico Varrone", "ARG"], ["Rafael Villagómez", "MEX"]],
  Trident: [["Laurens van Hoepen", "NED"], ["John Bennett", "GBR"]],
};

const F3: Series = {
  "Campos Racing": [["Théophile Naël", "FRA"], ["Ugo Ugochukwu", "USA"], ["Patrick Heuzenroeder", "AUS"], ["Ernesto Rivera", "MEX"]],
  Trident: [["Noah Strømsted", "DEN"], ["Freddie Slater", "GBR"], ["Matteo De Palo", "ITA"]],
  "MP Motorsport": [["Mattia Colnaghi", "ARG"], ["Tuukka Taponen", "FIN"], ["Alessandro Giusti", "FRA"]],
  "ART Grand Prix": [["Taito Kato", "JPN"], ["Maciej Gładysz", "POL"], ["Kanato Le", "JPN"]],
  "Van Amersfoort Racing": [["Hiyu Yamakoshi", "JPN"], ["Enzo Deligny", "FRA"], ["Bruno del Pino", "ESP"]],
  "Rodin Motorsport": [["Pedro Clerot", "BRA"], ["Brando Badoer", "ITA"], ["Christian Ho", "SGP"], ["Niccolò Maccagnani", "ITA"]],
  "Prema Racing": [["Louis Sharp", "NZL"], ["Alex Powell", "USA"], ["James Wharton", "AUS"], ["José Garfias", "MEX"]],
  Hitech: [["Michael Shin", "KOR"], ["Fionn McLaughlin", "IRL"], ["Jin Nakamura", "JPN"]],
  "AIX Racing": [["Brad Benavides", "USA"], ["Ricardo Escotto", "MEX"], ["Salim Hanna", "COL"], ["Yevan David", "SRI"], ["Fernando Barrichello", "BRA"]],
  "DAMS Lucas Oil": [["Nicola Lacorte", "ITA"], ["Nandhavud Bhirombhakdi", "THA"], ["Gerrard Xie", "CHN"]],
};

const FRECA: Series = {
  "Rodin Motorsport": [["Alex Ninovic", "AUS"], ["Reza Seewooruthun", "GBR"], ["Gabriel Gomez", "BRA"]],
  "G4 Racing": [["Saqer Al-Maosherji", "KUW"], ["Rahim Alibhai", "USA"], ["Marcus Sæter", "NOR"]],
  RPM: [["Miguel Costa", "BRA"], ["Jan Przyrowski", "POL"], ["Giovanni Maschio", "ITA"], ["Lewis Wherrell", "GBR"]],
  "CL Motorsport": [["Enea Frey", "SUI"], ["Thomas Strauven", "BEL"], ["Noah Lisle", "AUS"], ["René Lammers", "NED"], ["Jules Roussel", "FRA"], ["Kyuho Lee", "KOR"], ["Ary Bansal", "IND"], ["Reno Francot", "NED"]],
  "Van Amersfoort Racing": [["Andrea Dupé", "FRA"], ["Francisco Macedo", "POR"], ["Oleksandr Bondarev", "UKR"], ["Dion Gowda", "IND"]],
  "R-ace GP": [["Yuki Sano", "JPN"], ["Rashid Al Dhaheri", "UAE"], ["Emanuele Olivieri", "ITA"]],
  "MP Motorsport": [["Alexander Abkhazava", "KAZ"], ["Zhenrui Chi", "CHN"], ["Sebastian Wheldon", "USA"]],
  "ART Grand Prix": [["Kabir Anurag", "SGP"], ["Matteo Giaccardi", "MON"], ["Alexandre Munoz", "FRA"]],
  Trident: [["Maximilian Popov", "GRN"], ["Andrija Kostić", "SRB"], ["Kai Daryanani", "IND"]],
  "Prema Racing": [["Kean Nakamura-Berta", "JPN"], ["Tomass Štolcermanis", "LAT"], ["Salim Hanna", "COL"]],
};

const GB3: Series = {
  "Rodin Motorsport": [["Maxim Rehm", "GER"], ["Martin Molnár", "HUN"], ["Abbi Pulling", "GBR"]],
  Hitech: [["Jin Nakamura", "JPN"], ["Jacob Micallef", "MLT"], ["Yuhao Fu", "CHN"], ["Deagen Fairclough", "GBR"]],
  "Xcel Motorsport": [["Lucas Fluxá", "ESP"], ["Rowan Campbell-Pilling", "GBR"], ["Ricardo Baptista", "BRA"]],
  Hillspeed: [["Dante Vinci", "AUS"], ["Peter Bouzinelos", "AUS"], ["Aurelia Nobels", "BRA"]],
  "Elite Motorsport": [["Kirill Kutskov", "KAZ"], ["Edu Robinson", "ESP"], ["Flynn Jackes", "PHI"], ["Kyuho Lee", "KOR"]],
  "VRD Racing": [["Nikita Bedrin", "ITA"], ["Patricio González", "MEX"], ["Rodrigo González", "MEX"]],
  "Fortec Motorsports": [["Alexandros Kattoulas", "JPN"], ["Jack Taylor", "AUS"]],
  "Arden Motorsport": [["Lewis Gilbert", "GBR"], ["Leon Wilson", "GBR"]],
  "Nitrous Competitions ADM": [["Jason Pribyl", "USA"]],
};

const F1A: Series = {
  "MP Motorsport": [["Nina Gademan", "NED"], ["Alba Hurup Larsen", "DEN"], ["Esmee Kosterman", "NED"]],
  "Campos Racing": [["Megan Bruce", "GBR"], ["Rafaela Ferreira", "BRA"], ["Alisha Palmowski", "GBR"]],
  "Rodin Motorsport": [["Emma Felbermayr", "AUT"], ["Ella Lloyd", "GBR"], ["Ella Stevens", "GBR"]],
  "Prema Racing": [["Mathilda Paatz", "GER"], ["Payton Westcott", "USA"], ["Natalia Granada", "ESP"]],
  "ART Grand Prix": [["Lisa Billard", "FRA"], ["Kaylee Countryman", "USA"], ["Jade Jacquet", "FRA"]],
  Hitech: [["Ava Dobson", "USA"], ["Rachel Robertson", "GBR"], ["Shi Wei", "CHN"], ["Autumn Fisher", "CAN"], ["Chiara Bättig", "SUI"], ["Zoe Florescu", "ROU"], ["Alexia Danielsson", "SWE"]],
};

const F4: Series = {
  "Prema Racing": [["Christian Costoya", "ESP"], ["Roman Kamyab", "GBR"], ["Alp Aksoy", "TUR"], ["Georgiy Zasov", "SUI"], ["Kingsley Zheng", "CHN"], ["Lyuboslav Ruykov", "BUL"], ["David Cosma Cristofor", "ROU"], ["Oleksandr Bondarev", "UKR"], ["Niccolò Maccagnani", "ITA"]],
  "Van Amersfoort Racing": [["Aleksander Ruta", "POL"], ["Pedro Lima", "BRA"], ["Thomas Bearman", "GBR"]],
  "PHM Racing": [["Oscar Repetto", "MON"], ["Iacopo Martinese", "ITA"], ["Roland Kuklane", "EST"], ["Alexander Chartier", "CAN"]],
  "US Racing": [["Luka Sammalisto", "FIN"], ["Noah Killion", "AUS"], ["Oleksandr Savinkov", "UKR"], ["Ludovico Busso", "ITA"], ["Arjen Kräling", "GER"]],
  "Alpha 54 Racing": [["Thiago Palotini", "ARG"], ["Federico Díaz", "ARG"], ["Ignacio Díaz", "ARG"], ["Joaquin Rubino", "ARG"], ["Bautista Acosta", "ARG"], ["Joaquin Pagola", "ARG"]],
  "Trident Motorsport": [["Bernardo Bernoldi", "BRA"], ["Florentin Hattemer", "SUI"], ["Augustus Toniolo", "BRA"], ["Dominik Šimek", "CZE"], ["Lucas Pasquinetti", "UAE"]],
  "Jenzer Motorsport": [["Teo Borenstein", "CZE"], ["Levi Arn", "SUI"], ["Elia Weiss", "GER"], ["Artem Severiukhin", "KGZ"], ["Nicolás Cortés", "MEX"], ["Bader Al Sulaiti", "QAT"]],
  "R-ace GP": [["Andy Consani", "FRA"], ["Jensen Burnett", "CAN"], ["James Anagnostiadis", "AUS"], ["Tamás Gender", "HUN"], ["Kenzo Craigie", "GBR"], ["Emily Cotty", "GBR"]],
  "Cram Motorsport": [["Simon Rechenmacher", "GER"], ["Andre Rodriguez", "USA"], ["Dean Pedersen", "USA"]],
  "Real Racing": [["Knud Nielsen", "DEN"]],
  "AKM Motorsport": [["Evan Michelini", "CRC"], ["Rocco Coronel", "NED"], ["George Proudford-Nalder", "AUS"], ["Vittorio Orsini", "ITA"], ["Fabricio Fogaça", "BRA"]],
  "Maffi Racing": [["Rosanne den Drijver", "NED"], ["David Walther", "DEN"], ["Andreas Lo Bue", "SUI"], ["Igor Polak", "POL"]],
  Others: [["Ginevra Panzeri", "ITA"], ["Benett Gáspár", "HUN"]],
  "JHR Developments": [["Timo Jüngling", "GBR"], ["Haarni Sadiq", "PAK"], ["Cameron Nelson", "GBR"]],
  "Hitech (British F4)": [["Adam Al Azhari", "UAE"], ["Scott Kin Lindblom", "SWE"], ["Theo Palmer", "UAE"]],
  "Argenti Motorsport": [["Leon Hedfors", "SWE"], ["Justin Di Lucia", "CAN"], ["Sun Anzhe", "CHN"], ["Ethan Jeff-Hall", "GBR"], ["Qarrar Firhand", "INA"], ["Vegard Klemetsen", "NOR"]],
  "Virtuosi Racing": [["Joseph Smith", "GBR"], ["Jarrett Clark", "GBR"], ["Fred Green", "GBR"]],
  "Fortec (British F4)": [["Kit Belofsky", "GBR"], ["Cash Felber", "USA"], ["Ethan Carney", "USA"], ["Roman Felber", "USA"]],
  "Chris Dittmann Racing": [["Henry Mercier", "USA"], ["Tommy Harfield", "GBR"], ["Piotr Orzechowski", "POL"], ["Daniella Sutton", "GBR"]],
  "Rodin (British F4)": [["Alfie Slater", "GBR"], ["Alex O'Grady", "IRL"], ["Ethan Lennon", "RSA"], ["Dries Van Langendonck", "BEL"]],
  "Xcel (British F4)": [["Cole Hewetson", "RSA"], ["Mate Kobakhidze", "GEO"], ["Jaber Al Sabah", "KUW"], ["Jackson Wolny", "USA"]],
};

/** Real drivers without a race seat in 2026: test and reserve drivers, and recent F1 drivers. */
const RES: Row[] = [
  ["Yuki Tsunoda", "JPN"],
  ["Zhou Guanyu", "CHN"],
  ["Kevin Magnussen", "DEN"],
  ["Antonio Giovinazzi", "ITA"],
  ["Frederik Vesti", "DEN"],
  ["Ryo Hirakawa", "JPN"],
  ["Jak Crawford", "USA"],
  ["Paul Aron", "EST"],
  ["Pato O'Ward", "MEX"],
  ["Mick Schumacher", "GER"],
  ["Nyck de Vries", "NED"],
  ["Logan Sargeant", "USA"],
  ["Stoffel Vandoorne", "BEL"],
  ["Théo Pourchaire", "FRA"],
  ["Felipe Drugovich", "BRA"],
  ["Callum Ilott", "GBR"],
  ["Robert Shwartzman", "ISR"],
  ["Juri Vips", "EST"],
];

const BORN: Record<string, number> = {
  "Yuki Tsunoda": 2000, "Zhou Guanyu": 1999, "Kevin Magnussen": 1992, "Antonio Giovinazzi": 1993, "Frederik Vesti": 2002, "Ryo Hirakawa": 1994,
  "Jak Crawford": 2005, "Paul Aron": 2004, "Pato O'Ward": 1999, "Mick Schumacher": 1999, "Nyck de Vries": 1995, "Logan Sargeant": 2000,
  "Stoffel Vandoorne": 1992, "Théo Pourchaire": 2003, "Felipe Drugovich": 2000, "Callum Ilott": 1998, "Robert Shwartzman": 1999, "Juri Vips": 2000,
};

/** Hand-picked ratings for well-known prospects (everyone else gets a tier-based, name-seeded estimate). */
const PROSPECTS: Record<string, { pace: number; potential: number }> = {
  "Rafael Câmara": { pace: 0.986, potential: 0.97 },
  "Nikola Tsolov": { pace: 0.986, potential: 0.97 },
  "Dino Beganovic": { pace: 0.985, potential: 0.93 },
  "Martinius Stenshorne": { pace: 0.983, potential: 0.92 },
  "Alex Dunne": { pace: 0.983, potential: 0.93 },
  "Kush Maini": { pace: 0.982, potential: 0.85 },
  "Oliver Goethe": { pace: 0.981, potential: 0.86 },
  "Gabriele Minì": { pace: 0.98, potential: 0.88 },
  "Sebastián Montoya": { pace: 0.98, potential: 0.88 },
  "Mari Boya": { pace: 0.98, potential: 0.88 },
  "Ritomo Miyata": { pace: 0.981, potential: 0.85 },
  "Colton Herta": { pace: 0.983, potential: 0.8 },
  "Freddie Slater": { pace: 0.975, potential: 0.92 },
  "Ugo Ugochukwu": { pace: 0.974, potential: 0.92 },
  "Théophile Naël": { pace: 0.974, potential: 0.9 },
  "Tuukka Taponen": { pace: 0.975, potential: 0.9 },
  "Noah Strømsted": { pace: 0.974, potential: 0.9 },
  "Mattia Colnaghi": { pace: 0.972, potential: 0.88 },
  "Maciej Gładysz": { pace: 0.972, potential: 0.88 },
  "Brando Badoer": { pace: 0.972, potential: 0.88 },
  "Yuki Tsunoda": { pace: 0.988, potential: 0.8 },
  "Pato O'Ward": { pace: 0.988, potential: 0.8 },
  "Paul Aron": { pace: 0.984, potential: 0.85 },
  "Jak Crawford": { pace: 0.983, potential: 0.87 },
  "Zhou Guanyu": { pace: 0.984, potential: 0.7 },
  "Kevin Magnussen": { pace: 0.986, potential: 0.6 },
  "Antonio Giovinazzi": { pace: 0.984, potential: 0.6 },
  "Mick Schumacher": { pace: 0.985, potential: 0.7 },
};

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
  for (const [name, nat] of RES) {
    if (names.has(name)) continue;
    names.add(name);
    const code = makeCode(name, codes);
    codes.add(code);
    byTier.RES.push({ id: `res-${slug(name)}`, name, code, nat, born: BORN[name], tier: "RES", ...rate(name, "RES"), fictional: false });
  }
  add("F2", F2);
  add("F3", F3);
  add("FRECA", FRECA);
  add("GB3", GB3);
  add("F1A", F1A);
  add("F4", F4);
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
