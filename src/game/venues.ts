/**
 * What lives around each circuit.
 *
 * Honesty note: stand and landmark positions are approximations. Each anchor is a fraction of a lap
 * measured from the start/finish line and is snapped to the nearest real corner apex of the GPS
 * centreline. Stand names are generic. The optional OSM importer
 * (scripts/import-grandstands.mjs) can replace these anchors with surveyed positions.
 */

export type LandmarkKind = "ferris" | "yachts" | "tower" | "floodlights" | "bridge";

export interface StandSpec {
  /** Name board of the grandstand. */
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

/** Invented partner brands for the trackside boards. */
export interface Sponsor {
  text: string;
  bg: number;
  fg: number;
}
export const SPONSORS: Sponsor[] = [
  { text: "CHRONOS", bg: 0x006039, fg: 0xf3e3b0 },
  { text: "PETRAL", bg: 0x0a6fb7, fg: 0xffffff },
  { text: "NIMBUS", bg: 0x232f3e, fg: 0xff9900 },
  { text: "SWIFTPOST", bg: 0xffcc00, fg: 0xd40511 },
  { text: "SKYWAYS", bg: 0xd71921, fg: 0xffffff },
  { text: "HOPLEAF", bg: 0x0a7d2c, fg: 0xffffff },
  { text: "GRIPCO", bg: 0xffd100, fg: 0x111111 },
  { text: "LUMENA", bg: 0xe2231a, fg: 0xffffff },
  { text: "DUNEAIR", bg: 0x5c0632, fg: 0xffffff },
  { text: "MARISOL", bg: 0x0b2a5b, fg: 0xffffff },
  { text: "MAISON ORR", bg: 0x4a2f1a, fg: 0xd9b66a },
  { text: "CLOUDLEAF", bg: 0x00a1e0, fg: 0xffffff },
];

const IT = 0xd62828;
export const VENUES: Record<string, VenueSpec> = {
  silverstone: {
    fans: [0xff7a1a, 0xe63946, 0xffffff, 0x2ec4b6, 0xf9c74f, 0x4cc9f0],
    stands: [
      { name: "NORTH STAND", at: 0.04, size: 2 },
      { name: "WEST STAND", at: 0.22 },
      { name: "EAST STAND", at: 0.42, size: 3 },
      { name: "SOUTH STAND", at: 0.47 },
      { name: "HILL STAND", at: 0.66, size: 2 },
      { name: "PIT STAND", at: 0.86, size: 3 },
    ],
  },
  monza: {
    fans: [IT, IT, 0xffffff, 0xf9c74f, 0x2a9d8f],
    stands: [
      { name: "NORTH STAND", at: 0.1, size: 2 },
      { name: "WEST STAND", at: 0.22 },
      { name: "EAST STAND", at: 0.4 },
      { name: "SOUTH STAND", at: 0.68, size: 2 },
      { name: "HILL STAND", at: 0.82, size: 3 },
    ],
    landmarks: [{ kind: "floodlights", at: 0.5, side: "out", gap: 40 }],
  },
  spa: {
    fans: [0xf9c74f, 0xe63946, 0x111111, 0xff7a1a, 0xffffff],
    stands: [
      { name: "NORTH STAND", at: 0.02, size: 2 },
      { name: "WEST STAND", at: 0.09 },
      { name: "EAST STAND", at: 0.28, size: 2 },
      { name: "SOUTH STAND", at: 0.55 },
      { name: "HILL STAND", at: 0.88 },
    ],
  },
  monaco: {
    fans: [0xe63946, 0xffffff, 0xf9c74f, 0x4cc9f0],
    stands: [
      { name: "NORTH STAND", at: 0.03, size: 2 },
      { name: "WEST STAND", at: 0.2 },
      { name: "EAST STAND", at: 0.68 },
      { name: "SOUTH STAND", at: 0.93, size: 2 },
    ],
    landmarks: [{ kind: "yachts", at: 0.75, side: "out", gap: 26 }],
  },
  suzuka: {
    fans: [0xe63946, 0xffffff, 0xf9c74f, 0x4cc9f0, 0xff7a1a],
    stands: [
      { name: "NORTH STAND", at: 0.2 },
      { name: "WEST STAND", at: 0.7, size: 2 },
      { name: "EAST STAND", at: 0.84, size: 2 },
      { name: "SOUTH STAND", at: 0.93, size: 3 },
    ],
    landmarks: [{ kind: "ferris", at: 0.9, side: "in", gap: 60 }],
  },
  interlagos: {
    fans: [0x2a9d8f, 0xf9c74f, 0x1d4ed8, 0xffffff],
    stands: [
      { name: "NORTH STAND", at: 0.06, size: 3 },
      { name: "WEST STAND", at: 0.32 },
      { name: "EAST STAND", at: 0.58 },
      { name: "SOUTH STAND", at: 0.88, size: 2 },
    ],
  },
  "albert-park": {
    fans: [0x2ec4b6, 0xf9c74f, 0xe63946, 0xffffff],
    stands: [
      { name: "NORTH STAND", at: 0.04, size: 2 },
      { name: "WEST STAND", at: 0.5 },
      { name: "EAST STAND", at: 0.74 },
    ],
  },
  zandvoort: {
    fans: [0xff7a1a, 0xff7a1a, 0xff7a1a, 0xffffff, 0x1d4ed8],
    stands: [
      { name: "NORTH STAND", at: 0.04, size: 3 },
      { name: "WEST STAND", at: 0.09, size: 3 },
      { name: "EAST STAND", at: 0.96, size: 3 },
    ],
  },
  "red-bull-ring": {
    fans: [0xff7a1a, 0xe63946, 0xffffff, 0xf9c74f],
    stands: [{ name: "NORTH STAND", at: 0.08, size: 2 }, { name: "WEST STAND", at: 0.35 }, { name: "EAST STAND", at: 0.72, size: 2 }],
  },
  "marina-bay": {
    fans: [0xe63946, 0xffffff, 0x4cc9f0],
    stands: [{ name: "NORTH STAND", at: 0.04 }, { name: "WEST STAND", at: 0.7 }],
    landmarks: [{ kind: "ferris", at: 0.5, side: "in", gap: 80 }],
  },
};
