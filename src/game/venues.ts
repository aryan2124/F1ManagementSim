/**
 * What lives around each circuit.
 *
 * Honesty note: stand and landmark positions are approximations. Each anchor is a fraction of a lap
 * measured from the start/finish line and is snapped to the nearest real corner apex of the GPS
 * centreline. Names are real grandstand or corner names where I am confident of them. Anywhere the
 * game has no verified name, the stand is drawn without a name board. The optional OSM importer
 * (scripts/import-grandstands.mjs) can replace these anchors with surveyed positions.
 */

export type LandmarkKind = "ferris" | "yachts" | "tower" | "floodlights" | "bridge";

export interface StandSpec {
  /** Real name of the grandstand or the corner it overlooks. */
  name: string;
  /** Fraction of a lap from the start/finish line (approximate). */
  at: number;
  /** Seats scale 1..3. */
  size?: 1 | 2 | 3;
}
export interface LandmarkSpec {
  kind: LandmarkKind;
  at: number;
  /** Which side of the road, relative to the corner: out or in. */
  side?: "out" | "in";
  /** Metres beyond the road edge. */
  gap?: number;
  label?: string;
}
export interface VenueSpec {
  stands?: StandSpec[];
  landmarks?: LandmarkSpec[];
  /** Fan colours: team or national colours that dominate the crowd. */
  fans?: number[];
}

export const MIXED_FANS = [0xe63946, 0xf9c74f, 0x4cc9f0, 0xf4e9d0, 0x57cc99, 0xff7a1a];

/** Global F1 partners (a 2026 snapshot, verify before relying on it). Colours are the usual brand colours. */
export interface Sponsor {
  text: string;
  bg: number;
  fg: number;
}
export const SPONSORS: Sponsor[] = [
  { text: "ROLEX", bg: 0x006039, fg: 0xf3e3b0 },
  { text: "ARAMCO", bg: 0x0a6fb7, fg: 0xffffff },
  { text: "AWS", bg: 0x232f3e, fg: 0xff9900 },
  { text: "DHL", bg: 0xffcc00, fg: 0xd40511 },
  { text: "EMIRATES", bg: 0xd71921, fg: 0xffffff },
  { text: "HEINEKEN", bg: 0x0a7d2c, fg: 0xffffff },
  { text: "PIRELLI", bg: 0xffd100, fg: 0x111111 },
  { text: "LENOVO", bg: 0xe2231a, fg: 0xffffff },
  { text: "QATAR AIRWAYS", bg: 0x5c0632, fg: 0xffffff },
  { text: "MSC", bg: 0x0b2a5b, fg: 0xffffff },
  { text: "LOUIS VUITTON", bg: 0x4a2f1a, fg: 0xd9b66a },
  { text: "SALESFORCE", bg: 0x00a1e0, fg: 0xffffff },
];

const IT = 0xd62828;
export const VENUES: Record<string, VenueSpec> = {
  silverstone: {
    fans: [0xff7a1a, 0xe63946, 0xffffff, 0x2ec4b6, 0xf9c74f, 0x4cc9f0],
    stands: [
      { name: "ABBEY", at: 0.04, size: 2 },
      { name: "BROOKLANDS", at: 0.22 },
      { name: "COPSE", at: 0.42, size: 3 },
      { name: "MAGGOTTS", at: 0.47 },
      { name: "STOWE", at: 0.66, size: 2 },
      { name: "CLUB", at: 0.86, size: 3 },
    ],
  },
  monza: {
    fans: [IT, IT, 0xffffff, 0xf9c74f, 0x2a9d8f],
    stands: [
      { name: "VARIANTE DEL RETTIFILO", at: 0.1, size: 2 },
      { name: "CURVA GRANDE", at: 0.22 },
      { name: "LESMO", at: 0.4 },
      { name: "ASCARI", at: 0.68, size: 2 },
      { name: "PARABOLICA", at: 0.82, size: 3 },
    ],
    landmarks: [{ kind: "floodlights", at: 0.5, side: "out", gap: 40 }],
  },
  spa: {
    fans: [0xf9c74f, 0xe63946, 0x111111, 0xff7a1a, 0xffffff],
    stands: [
      { name: "LA SOURCE", at: 0.02, size: 2 },
      { name: "EAU ROUGE", at: 0.09 },
      { name: "LES COMBES", at: 0.28, size: 2 },
      { name: "POUHON", at: 0.55 },
      { name: "BLANCHIMONT", at: 0.88 },
    ],
  },
  monaco: {
    fans: [0xe63946, 0xffffff, 0xf9c74f, 0x4cc9f0],
    stands: [
      { name: "SAINTE DEVOTE", at: 0.03, size: 2 },
      { name: "CASINO SQUARE", at: 0.2 },
      { name: "TABAC", at: 0.68 },
      { name: "RASCASSE", at: 0.93, size: 2 },
    ],
    landmarks: [{ kind: "yachts", at: 0.75, side: "out", gap: 26, label: "PORT HERCULE" }],
  },
  suzuka: {
    fans: [0xe63946, 0xffffff, 0xf9c74f, 0x4cc9f0, 0xff7a1a],
    stands: [
      { name: "DUNLOP CORNER", at: 0.2 },
      { name: "SPOON", at: 0.7, size: 2 },
      { name: "130R", at: 0.84, size: 2 },
      { name: "CASIO TRIANGLE", at: 0.93, size: 3 },
    ],
    landmarks: [{ kind: "ferris", at: 0.9, side: "in", gap: 60, label: "SUZUKA" }],
  },
  interlagos: {
    fans: [0x2a9d8f, 0xf9c74f, 0x1d4ed8, 0xffffff],
    stands: [
      { name: "SENNA S", at: 0.06, size: 3 },
      { name: "LAGO", at: 0.32 },
      { name: "MERGULHO", at: 0.58 },
      { name: "JUNCAO", at: 0.88, size: 2 },
    ],
  },
  "albert-park": {
    fans: [0x2ec4b6, 0xf9c74f, 0xe63946, 0xffffff],
    stands: [
      { name: "TURN 1", at: 0.04, size: 2 },
      { name: "LAKESIDE", at: 0.5 },
      { name: "TURN 9", at: 0.74 },
    ],
  },
  zandvoort: {
    fans: [0xff7a1a, 0xff7a1a, 0xff7a1a, 0xffffff, 0x1d4ed8],
    stands: [
      { name: "TARZANBOCHT", at: 0.04, size: 3 },
      { name: "HUGENHOLTZ BOCHT", at: 0.09, size: 3 },
      { name: "ARIE LUYENDYK BOCHT", at: 0.96, size: 3 },
    ],
  },
  "red-bull-ring": {
    fans: [0xff7a1a, 0xe63946, 0xffffff, 0xf9c74f],
    stands: [{ name: "TURN 1", at: 0.08, size: 2 }, { name: "REMUS", at: 0.35 }, { name: "RINDT", at: 0.72, size: 2 }],
  },
  "marina-bay": {
    fans: [0xe63946, 0xffffff, 0x4cc9f0],
    stands: [{ name: "TURN 1", at: 0.04 }, { name: "ANDERSON BRIDGE", at: 0.7 }],
    landmarks: [{ kind: "ferris", at: 0.5, side: "in", gap: 80, label: "SINGAPORE" }],
  },
};
