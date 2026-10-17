/**
 * The people on the pit wall.
 *
 * Race engineers and team principals are the real 2026 names, checked against Motor Sport Magazine's
 * and Formula1.com's 2026 line-up lists. They change during a season, so treat them as a snapshot
 * (Hamilton's engineer at Ferrari was listed as temporary).
 *
 * Chief strategists are NOT real: I could not verify who holds those jobs in 2026, so they are invented
 * names and flagged as such. How each wall behaves (see `BRAINS`) is the game's own caricature of public
 * reputation, not insider knowledge.
 */

/** Race engineer by driver code. */
export const ENGINEERS: Record<string, string> = {
  NOR: "Will Joseph",
  PIA: "Tom Stallard",
  RUS: "Marcus Dudley",
  ANT: "Peter Bonnington",
  VER: "Gianpiero Lambiase",
  HAD: "Richard Wood",
  LEC: "Bryan Bozzi",
  HAM: "Carlo Santi",
  ALB: "James Urwin",
  SAI: "Gaetan Jago",
  LAW: "Alexandre Iliopoulos",
  LIN: "Pierre Hamelin",
  ALO: "Andrew Vizard",
  STR: "Gary Gannon",
  BEA: "Ronan O'Hare",
  OCO: "Laura Muller",
  HUL: "Steven Petrik",
  BOR: "Jose Manuel Lopez",
  GAS: "Josh Peckett",
  COL: "Stuart Barlow",
  BOT: "John Howard",
  PER: "Carlo Pasetti",
};

/** What the radio calls the engineer ("GP", "Bono"). */
export const NICKNAMES: Record<string, string> = {
  ANT: "Bono",
  VER: "GP",
  LEC: "Bryan",
  HAM: "Carlo",
  NOR: "Will",
  PIA: "Tom",
  RUS: "Marcus",
};

export const PRINCIPALS: Record<string, string> = {
  mcl: "Andrea Stella",
  mer: "Toto Wolff",
  rbr: "Laurent Mekies",
  fer: "Fred Vasseur",
  wil: "James Vowles",
  rbs: "Alan Permane",
  ast: "Adrian Newey",
  hss: "Ayao Komatsu",
  aud: "Mattia Binotto",
  alp: "Steve Nielsen",
  cad: "Marcin Budkowski",
};

/** Invented. Not the real strategists. */
export const STRATEGISTS: Record<string, string> = {
  mcl: "Dana Whitcombe",
  mer: "Ian Rosworth",
  rbr: "Helena Brandt",
  fer: "Marco Tessarin",
  wil: "Priya Raman",
  rbs: "Tomas Valenti",
  ast: "Colin Ashdown",
  hss: "Jess Okafor",
  aud: "Lukas Hartmann",
  alp: "Camille Roche",
  cad: "Nate Calloway",
};

export function engineerName(code: string): string {
  return ENGINEERS[code] ?? "your engineer";
}

export function engineerCall(code: string): string {
  return NICKNAMES[code] ?? (ENGINEERS[code] ?? "mate").split(" ")[0];
}
