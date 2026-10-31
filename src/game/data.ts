import type { DriverSpec, EntrySpec, TeamSpec } from "../sim/types";
import { psycheFor } from "./personalities";

/**
 * A fictional grid. Teams and drivers are invented; ratings are the game's own estimates of
 * current form: team numbers are multipliers where 1.0 is the best possible and ~0.96 is the back of the grid.
 */
export const TEAMS: TeamSpec[] = [
  { id: "mer", name: "Lagoon Dynamics", full: "Lagoon Dynamics Works Team", short: "LAGO", engine: "Meridian", country: "GBR", color: 0x27f4d2, accent: 0x1a1a1a, aero: 0.998, power: 1.0, reliability: 0.985, pitCrew: 0.85 },
  { id: "fer", name: "Cardinal Corse", full: "Scuderia Cardinal Corse", short: "CARD", engine: "Corvo", country: "ITA", color: 0xe8002d, accent: 0xfff200, aero: 0.995, power: 0.996, reliability: 0.975, pitCrew: 0.88 },
  { id: "mcl", name: "Amberline Racing", full: "Amberline Racing Team", short: "AMBR", engine: "Meridian", country: "GBR", color: 0xff8000, accent: 0x2f9bff, aero: 0.996, power: 0.994, reliability: 0.98, pitCrew: 0.96 },
  { id: "rbr", name: "Cobalt Rush Racing", full: "Cobalt Rush Racing", short: "COBA", engine: "Ardent", country: "AUT", color: 0x2745b8, accent: 0xe8002d, aero: 0.99, power: 0.988, reliability: 0.965, pitCrew: 0.92 },
  { id: "wil", name: "Cerulean Racing", full: "Cerulean Racing Team", short: "CERU", engine: "Meridian", country: "GBR", color: 0x37a1ff, accent: 0xffffff, aero: 0.983, power: 0.992, reliability: 0.975, pitCrew: 0.75 },
  { id: "alp", name: "Fuchsia Racing", full: "Fuchsia Racing Team", short: "FUCH", engine: "Meridian", country: "FRA", color: 0xff7bbd, accent: 0x0090ff, aero: 0.979, power: 0.992, reliability: 0.97, pitCrew: 0.7 },
  { id: "hss", name: "Gunmetal Motorsport", full: "Gunmetal Motorsport Team", short: "GUNM", engine: "Corvo", country: "USA", color: 0x9aa0ac, accent: 0xe8002d, aero: 0.978, power: 0.996, reliability: 0.97, pitCrew: 0.68 },
  { id: "rbs", name: "Frostline Racing", full: "Frostline Racing Team", short: "FROS", engine: "Ardent", country: "ITA", color: 0xe4e9ff, accent: 0x1d3bd6, aero: 0.977, power: 0.985, reliability: 0.96, pitCrew: 0.72 },
  { id: "aud", name: "Argent Motorsport", full: "Argent Motorsport Works", short: "ARGE", engine: "Nordhaus", country: "GER", color: 0xb9bfcb, accent: 0xff2e4d, aero: 0.972, power: 0.972, reliability: 0.955, pitCrew: 0.66 },
  { id: "ast", name: "Verdant Racing", full: "Verdant Racing Team", short: "VERD", engine: "Kaizen", country: "GBR", color: 0x229971, accent: 0xcedc00, aero: 0.974, power: 0.962, reliability: 0.94, pitCrew: 0.7 },
  { id: "cad", name: "Goldleaf Racing", full: "Goldleaf Racing Team", short: "GOLD", engine: "Corvo", country: "USA", color: 0xc9a227, accent: 0x5b5b6e, aero: 0.962, power: 0.99, reliability: 0.95, pitCrew: 0.6 },
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

/** Fictional drivers. Ids are stable (dr-<code>). */
export const DRIVERS: Record<string, DriverSpec[]> = {
  mer: [D("dr-wex", "WEX", "Harry Wexford", 63, "GBR", 1998, 0.996, 0.72, 0.6, 0.9), D("dr-bel", "BEL", "Matteo Bellandi", 12, "ITA", 2006, 0.993, 0.66, 0.65, 0.8)],
  fer: [D("dr-cor", "COR", "Rafael Corbier", 16, "MON", 1997, 0.998, 0.62, 0.75, 0.84), D("dr-har", "HAR", "Lionel Hargrave", 44, "GBR", 1985, 0.994, 0.84, 0.7, 0.88)],
  mcl: [D("dr-car", "CAR", "Toby Carrow", 1, "GBR", 1999, 0.998, 0.72, 0.6, 0.88), D("dr-qui", "QUI", "Jarrah Quinn", 81, "AUS", 2001, 0.997, 0.78, 0.6, 0.9)],
  rbr: [D("dr-bro", "BRO", "Daan Brouwer", 3, "NED", 1997, 1.0, 0.76, 0.85, 0.93), D("dr-fou", "FOU", "Basile Fournier", 6, "FRA", 2004, 0.99, 0.66, 0.7, 0.76)],
  wil: [D("dr-sor", "SOR", "Kanin Sorrat", 23, "THA", 1996, 0.991, 0.8, 0.6, 0.86), D("dr-ala", "ALA", "Diego Alarcón", 55, "ESP", 1994, 0.993, 0.8, 0.6, 0.88)],
  alp: [D("dr-del", "DEL", "Remy Delacour", 10, "FRA", 1996, 0.99, 0.72, 0.65, 0.85), D("dr-pal", "PAL", "Joaquín Palermo", 43, "ARG", 2003, 0.987, 0.65, 0.75, 0.75)],
  hss: [D("dr-val", "VAL", "Étienne Valmont", 31, "FRA", 1996, 0.988, 0.7, 0.7, 0.82), D("dr-ash", "ASH", "Freddie Ashdown", 87, "GBR", 2005, 0.99, 0.7, 0.75, 0.78)],
  rbs: [D("dr-rat", "RAT", "Callum Rata", 30, "NZL", 2002, 0.988, 0.66, 0.8, 0.74), D("dr-whi", "WHI", "Ned Whitlock", 41, "GBR", 2007, 0.987, 0.65, 0.7, 0.72)],
  aud: [D("dr-ald", "ALD", "Stefan Aldinger", 27, "GER", 1987, 0.989, 0.78, 0.6, 0.88), D("dr-tav", "TAV", "Davi Tavares", 5, "BRA", 2004, 0.988, 0.7, 0.6, 0.76)],
  ast: [D("dr-gar", "GAR", "Ignacio Garrido", 14, "ESP", 1981, 0.994, 0.86, 0.8, 0.9), D("dr-bri", "BRI", "Tyler Brisbois", 18, "CAN", 1998, 0.985, 0.6, 0.55, 0.72)],
  cad: [D("dr-cad", "CAD", "Emilio Cárdenas", 11, "MEX", 1990, 0.986, 0.86, 0.6, 0.76), D("dr-lah", "LAH", "Eero Lahtinen", 77, "FIN", 1989, 0.986, 0.76, 0.5, 0.85)],
};

for (const list of Object.values(DRIVERS)) {
  for (const d of list) {
    const x = psycheFor(d.code);
    d.psyche = x.psyche;
    d.wet = x.wet;
  }
}

export function buildEntries(humanTeamId: string, field?: string[]): EntrySpec[] {
  const entries: EntrySpec[] = [];
  for (const team of TEAMS) {
    for (const driver of DRIVERS[team.id]) {
      if (field && !field.includes(driver.id)) continue;
      entries.push({ id: driver.id, driver, team, human: team.id === humanTeamId });
    }
  }
  return entries;
}
