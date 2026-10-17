import type { DriverSpec, EntrySpec, TeamSpec } from "../sim/types";
import { psycheFor } from "./personalities";

/**
 * The real 2026 Formula 1 grid (season-start line-ups). Ratings are the game's own estimates of
 * current form: team numbers are multipliers where 1.0 is the best possible and ~0.96 is the back of the grid.
 */
export const TEAMS: TeamSpec[] = [
  { id: "mer", name: "Mercedes", full: "Mercedes-AMG Petronas F1 Team", short: "MERC", engine: "Mercedes", country: "GBR", color: 0x27f4d2, accent: 0x1a1a1a, aero: 0.998, power: 1.0, reliability: 0.985, pitCrew: 0.85 },
  { id: "fer", name: "Ferrari", full: "Scuderia Ferrari HP", short: "FERR", engine: "Ferrari", country: "ITA", color: 0xe8002d, accent: 0xfff200, aero: 0.995, power: 0.996, reliability: 0.975, pitCrew: 0.88 },
  { id: "mcl", name: "McLaren", full: "McLaren Mastercard F1 Team", short: "MCLA", engine: "Mercedes", country: "GBR", color: 0xff8000, accent: 0x2f9bff, aero: 0.996, power: 0.994, reliability: 0.98, pitCrew: 0.96 },
  { id: "rbr", name: "Red Bull Racing", full: "Oracle Red Bull Racing", short: "REDB", engine: "Red Bull Ford", country: "AUT", color: 0x2745b8, accent: 0xe8002d, aero: 0.99, power: 0.988, reliability: 0.965, pitCrew: 0.92 },
  { id: "wil", name: "Williams", full: "Atlassian Williams F1 Team", short: "WILL", engine: "Mercedes", country: "GBR", color: 0x37a1ff, accent: 0xffffff, aero: 0.983, power: 0.992, reliability: 0.975, pitCrew: 0.75 },
  { id: "alp", name: "Alpine", full: "BWT Alpine F1 Team", short: "ALPI", engine: "Mercedes", country: "FRA", color: 0xff7bbd, accent: 0x0090ff, aero: 0.979, power: 0.992, reliability: 0.97, pitCrew: 0.7 },
  { id: "hss", name: "Haas", full: "TGR Haas F1 Team", short: "HAAS", engine: "Ferrari", country: "USA", color: 0x9aa0ac, accent: 0xe8002d, aero: 0.978, power: 0.996, reliability: 0.97, pitCrew: 0.68 },
  { id: "rbs", name: "Racing Bulls", full: "Visa Cash App Racing Bulls F1 Team", short: "RBUL", engine: "Red Bull Ford", country: "ITA", color: 0xe4e9ff, accent: 0x1d3bd6, aero: 0.977, power: 0.985, reliability: 0.96, pitCrew: 0.72 },
  { id: "aud", name: "Audi", full: "Audi Revolut F1 Team", short: "AUDI", engine: "Audi", country: "GER", color: 0xb9bfcb, accent: 0xff2e4d, aero: 0.972, power: 0.972, reliability: 0.955, pitCrew: 0.66 },
  { id: "ast", name: "Aston Martin", full: "Aston Martin Aramco F1 Team", short: "ASTN", engine: "Honda", country: "GBR", color: 0x229971, accent: 0xcedc00, aero: 0.974, power: 0.962, reliability: 0.94, pitCrew: 0.7 },
  { id: "cad", name: "Cadillac", full: "Cadillac Formula 1 Team", short: "CADI", engine: "Ferrari", country: "USA", color: 0x5b5b6e, accent: 0xc9a227, aero: 0.962, power: 0.99, reliability: 0.95, pitCrew: 0.6 },
];

const D = (
  id: string,
  code: string,
  name: string,
  number: number,
  nat: string,
  born: number,
  pace: number,
  tyreMgmt: number,
  aggression: number,
  consistency: number,
): DriverSpec => ({ id, code, name, number, nat, born, pace, tyreMgmt, aggression, consistency });

/** Real drivers. Ids are stable (f1-<code>). */
export const DRIVERS: Record<string, DriverSpec[]> = {
  mer: [D("f1-rus", "RUS", "George Russell", 63, "GBR", 1998, 0.996, 0.72, 0.6, 0.9), D("f1-ant", "ANT", "Kimi Antonelli", 12, "ITA", 2006, 0.993, 0.66, 0.65, 0.8)],
  fer: [D("f1-lec", "LEC", "Charles Leclerc", 16, "MON", 1997, 0.998, 0.62, 0.75, 0.84), D("f1-ham", "HAM", "Lewis Hamilton", 44, "GBR", 1985, 0.994, 0.84, 0.7, 0.88)],
  mcl: [D("f1-nor", "NOR", "Lando Norris", 1, "GBR", 1999, 0.998, 0.72, 0.6, 0.88), D("f1-pia", "PIA", "Oscar Piastri", 81, "AUS", 2001, 0.997, 0.78, 0.6, 0.9)],
  rbr: [D("f1-ver", "VER", "Max Verstappen", 3, "NED", 1997, 1.0, 0.76, 0.85, 0.93), D("f1-had", "HAD", "Isack Hadjar", 6, "FRA", 2004, 0.99, 0.66, 0.7, 0.76)],
  wil: [D("f1-alb", "ALB", "Alexander Albon", 23, "THA", 1996, 0.991, 0.8, 0.6, 0.86), D("f1-sai", "SAI", "Carlos Sainz", 55, "ESP", 1994, 0.993, 0.8, 0.6, 0.88)],
  alp: [D("f1-gas", "GAS", "Pierre Gasly", 10, "FRA", 1996, 0.99, 0.72, 0.65, 0.85), D("f1-col", "COL", "Franco Colapinto", 43, "ARG", 2003, 0.987, 0.65, 0.75, 0.75)],
  hss: [D("f1-oco", "OCO", "Esteban Ocon", 31, "FRA", 1996, 0.988, 0.7, 0.7, 0.82), D("f1-bea", "BEA", "Oliver Bearman", 87, "GBR", 2005, 0.99, 0.7, 0.75, 0.78)],
  rbs: [D("f1-law", "LAW", "Liam Lawson", 30, "NZL", 2002, 0.988, 0.66, 0.8, 0.74), D("f1-lin", "LIN", "Arvid Lindblad", 41, "GBR", 2007, 0.987, 0.65, 0.7, 0.72)],
  aud: [D("f1-hul", "HUL", "Nico Hülkenberg", 27, "GER", 1987, 0.989, 0.78, 0.6, 0.88), D("f1-bor", "BOR", "Gabriel Bortoleto", 5, "BRA", 2004, 0.988, 0.7, 0.6, 0.76)],
  ast: [D("f1-alo", "ALO", "Fernando Alonso", 14, "ESP", 1981, 0.994, 0.86, 0.8, 0.9), D("f1-str", "STR", "Lance Stroll", 18, "CAN", 1998, 0.985, 0.6, 0.55, 0.72)],
  cad: [D("f1-per", "PER", "Sergio Pérez", 11, "MEX", 1990, 0.986, 0.86, 0.6, 0.76), D("f1-bot", "BOT", "Valtteri Bottas", 77, "FIN", 1989, 0.986, 0.76, 0.5, 0.85)],
};

for (const list of Object.values(DRIVERS)) {
  for (const d of list) {
    const x = psycheFor(d.code);
    d.psyche = x.psyche;
    d.wet = x.wet;
  }
}

export function buildEntries(humanTeamId: string): EntrySpec[] {
  const entries: EntrySpec[] = [];
  for (const team of TEAMS) {
    for (const driver of DRIVERS[team.id]) {
      entries.push({ id: driver.id, driver, team, human: team.id === humanTeamId });
    }
  }
  return entries;
}
