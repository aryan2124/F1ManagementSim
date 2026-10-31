/**
 * The people on the pit wall.
 *
 * Race engineers, team principals and chief strategists are all invented. How each wall behaves
 * (see `BRAINS`) is the game's own design.
 */

/** Race engineer by driver code. All names are invented. */
export const ENGINEERS: Record<string, string> = {
  CAR: "Walter Joss",
  QUI: "Tobias Stannard",
  WEX: "Martin Dowling",
  BEL: "Peter Bonham",
  BRO: "Gianni Lambertini",
  FOU: "Richard Wolfe",
  COR: "Bruno Bazzi",
  HAR: "Carlo Santini",
  SOR: "Jamie Urquhart",
  ALA: "Gaston Jarry",
  RAT: "Alexis Ilario",
  WHI: "Pierre Hamlin",
  GAR: "Andrew Vickery",
  BRI: "Gareth Gannet",
  ASH: "Ronan O'Hara",
  VAL: "Lara Mueller",
  ALD: "Steffen Petric",
  TAV: "Jose Manuel Lorca",
  DEL: "Joss Pickett",
  PAL: "Stuart Barnes",
  LAH: "John Hewitt",
  CAD: "Carlo Pasquale",
};

/** What the radio calls the engineer. */
export const NICKNAMES: Record<string, string> = {
  BEL: "Bonny",
  BRO: "Lambo",
  COR: "Bruno",
  HAR: "Carlo",
  CAR: "Walt",
  QUI: "Toby",
  WEX: "Marty",
};

export const PRINCIPALS: Record<string, string> = {
  mcl: "Andrea Sorrentino",
  mer: "Tobias Wendell",
  rbr: "Laurent Mercier",
  fer: "Federico Vassallo",
  wil: "James Vaughan",
  rbs: "Alan Perrin",
  ast: "Adrian Neville",
  hss: "Akira Komori",
  aud: "Matteo Bianchi",
  alp: "Steven Nolan",
  cad: "Marek Budny",
};

/** Chief strategists. Invented. */
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
