/**
 * The tune writer. Every scene (menu, race, qualifying...) has a style profile, and this makes a new eight bar
 * tune in that style from a seed: a key and a mode, a chord loop with a turnaround, a bass pattern, a drum feel, a lead
 * sound and a melody built from a small motif that is answered, varied and resolved. The same seed always makes the
 * same tune (so it can be tested); the player draws a fresh seed each time, so the game never runs out.
 */
import type { BassStyle, ArpStyle, DrumStyle, TrackDef, TrackName, Timbre, ChordQuality } from "./music";

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const midiName = (m: number): string => NAMES[((m % 12) + 12) % 12]! + String(Math.floor(m / 12) - 1);

const MODES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};

/** Chord loops as scale degrees (0 = the key chord). */
const PROGS: Record<string, number[][]> = {
  minor: [[0, 5, 2, 6], [0, 3, 5, 4], [0, 6, 5, 6], [0, 2, 5, 6], [0, 3, 6, 4], [0, 5, 3, 4], [0, 0, 3, 4], [0, 4, 5, 3]],
  dorian: [[0, 3, 0, 3], [0, 6, 3, 0], [0, 3, 6, 3], [0, 1, 3, 0]],
  phrygian: [[0, 1, 0, 6], [0, 1, 2, 1], [0, 5, 1, 0]],
  major: [[0, 4, 5, 3], [0, 5, 3, 4], [0, 3, 4, 3], [0, 2, 5, 4], [1, 4, 0, 0], [0, 5, 1, 4], [0, 3, 0, 4]],
  mixolydian: [[0, 6, 3, 0], [0, 3, 6, 0], [0, 6, 0, 3]],
  lydian: [[0, 1, 0, 1], [0, 1, 4, 0], [0, 4, 1, 0]],
};

export interface Profile {
  bpm: [number, number];
  modes: string[];
  /** Keys as semitones above C. */
  keys: number[];
  drums: DrumStyle[];
  bass: BassStyle[];
  arp: ArpStyle[];
  timbre: Timbre[];
  /** 0..1 how busy the melody is. */
  energy: number;
  /** 0..1 */
  swing: [number, number];
  leadVol: number;
  drumVol: number;
  /** Minimum seconds before the scene moves on to another tune. */
  minSecs: number;
}

const ALL_KEYS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

export const PROFILES: Record<TrackName, Profile> = {
  menu: { bpm: [92, 118], modes: ["major", "minor", "dorian", "lydian", "mixolydian"], keys: ALL_KEYS, drums: ["soft", "clock", "half", "shuffle", "groove"], bass: ["root8", "long", "walk", "offbeat"], arp: ["updown8", "up8", "none", "broken"], timbre: ["keys", "bell", "pluck", "soft"], energy: 0.45, swing: [0.2, 0.6], leadVol: 0.1, drumVol: 0.8, minSecs: 100 },
  factory: { bpm: [84, 110], modes: ["minor", "dorian", "major", "mixolydian"], keys: ALL_KEYS, drums: ["groove", "soft", "funk", "shuffle", "half"], bass: ["offbeat", "root8", "walk", "disco"], arp: ["up8", "broken", "none", "updown8"], timbre: ["keys", "pluck", "soft", "bell"], energy: 0.4, swing: [0.3, 0.65], leadVol: 0.085, drumVol: 0.65, minSecs: 110 },
  tense: { bpm: [118, 142], modes: ["minor", "phrygian"], keys: [2, 4, 5, 7, 9, 11], drums: ["tense", "half", "dnb"], bass: ["pulse16", "long", "gallop"], arp: ["none", "up16", "broken"], timbre: ["soft", "keys", "pluck"], energy: 0.3, swing: [0, 0.1], leadVol: 0.085, drumVol: 0.8, minSecs: 90 },
  race: { bpm: [138, 166], modes: ["minor", "minor", "dorian", "phrygian", "mixolydian"], keys: [0, 2, 3, 4, 5, 7, 9, 10], drums: ["rock", "drive", "four", "dnb", "funk"], bass: ["sync", "pulse16", "octave", "gallop", "disco"], arp: ["none", "up16", "up8", "broken"], timbre: ["keys", "pluck", "bell"], energy: 0.7, swing: [0, 0.2], leadVol: 0.095, drumVol: 1, minSecs: 120 },
  raceHigh: { bpm: [160, 182], modes: ["minor", "phrygian", "dorian"], keys: [2, 4, 5, 7, 9, 11], drums: ["drive", "dnb", "four", "rock"], bass: ["pulse16", "gallop", "sync", "octave"], arp: ["up16", "up8", "broken"], timbre: ["keys", "pluck"], energy: 0.85, swing: [0, 0.1], leadVol: 0.1, drumVol: 1.1, minSecs: 110 },
  raceSC: { bpm: [78, 100], modes: ["minor", "phrygian", "dorian"], keys: [0, 2, 4, 5, 7, 9], drums: ["half", "clock", "none"], bass: ["long", "root8"], arp: ["updown8", "none"], timbre: ["soft", "bell", "keys"], energy: 0.2, swing: [0, 0.2], leadVol: 0.085, drumVol: 0.7, minSecs: 90 },
  raceRain: { bpm: [74, 98], modes: ["minor", "dorian", "lydian"], keys: ALL_KEYS, drums: ["soft", "clock", "half"], bass: ["long", "root8", "walk"], arp: ["updown8", "broken", "up8"], timbre: ["bell", "soft", "keys"], energy: 0.3, swing: [0.1, 0.4], leadVol: 0.09, drumVol: 0.6, minSecs: 100 },
  quali: { bpm: [124, 150], modes: ["minor", "dorian", "mixolydian"], keys: [0, 2, 3, 5, 7, 9, 10], drums: ["drive", "funk", "four", "rock"], bass: ["sync", "octave", "disco", "pulse16"], arp: ["up16", "up8", "none"], timbre: ["keys", "pluck", "bell"], energy: 0.65, swing: [0, 0.3], leadVol: 0.095, drumVol: 0.95, minSecs: 100 },
  garage: { bpm: [98, 122], modes: ["minor", "dorian", "mixolydian", "major"], keys: ALL_KEYS, drums: ["groove", "funk", "shuffle", "half"], bass: ["offbeat", "walk", "sync", "disco"], arp: ["up8", "broken", "none"], timbre: ["keys", "pluck", "soft"], energy: 0.5, swing: [0.25, 0.6], leadVol: 0.09, drumVol: 0.75, minSecs: 100 },
  podium: { bpm: [110, 132], modes: ["major", "lydian", "mixolydian"], keys: [0, 2, 4, 5, 7, 9], drums: ["drive", "groove", "four"], bass: ["octave", "oompah", "offbeat"], arp: ["up8", "up16"], timbre: ["bell", "keys", "pluck"], energy: 0.65, swing: [0, 0.3], leadVol: 0.1, drumVol: 0.9, minSecs: 80 },
  crisis: { bpm: [100, 128], modes: ["phrygian", "minor"], keys: [0, 1, 2, 4, 6, 9, 11], drums: ["tense", "half", "dnb"], bass: ["pulse16", "gallop", "long"], arp: ["none", "up16", "broken"], timbre: ["soft", "keys"], energy: 0.35, swing: [0, 0.1], leadVol: 0.085, drumVol: 0.8, minSecs: 90 },
  rules: { bpm: [88, 110], modes: ["dorian", "mixolydian", "major", "lydian"], keys: ALL_KEYS, drums: ["clock", "soft", "shuffle", "half"], bass: ["root8", "walk", "long"], arp: ["broken", "up8", "updown8"], timbre: ["bell", "pluck", "keys", "soft"], energy: 0.35, swing: [0.1, 0.5], leadVol: 0.085, drumVol: 0.6, minSecs: 100 },
  newsroom: { bpm: [106, 130], modes: ["minor", "dorian", "mixolydian"], keys: ALL_KEYS, drums: ["funk", "groove", "four", "shuffle"], bass: ["disco", "offbeat", "sync", "walk"], arp: ["up8", "broken", "none"], timbre: ["pluck", "keys", "bell"], energy: 0.55, swing: [0.1, 0.5], leadVol: 0.09, drumVol: 0.8, minSecs: 100 },
  results: { bpm: [94, 116], modes: ["major", "minor", "dorian", "lydian"], keys: ALL_KEYS, drums: ["soft", "clock", "half", "shuffle"], bass: ["root8", "long", "walk"], arp: ["updown8", "up8", "broken"], timbre: ["keys", "bell", "soft"], energy: 0.4, swing: [0.2, 0.55], leadVol: 0.09, drumVol: 0.7, minSecs: 100 },
};

const RHYTHMS_CALM = ["x . . . x . . .", "x . x . . . x .", "x . . x . . x .", "x . x . x . . .", "x . . . x . x ."];
const RHYTHMS_MID = ["x . x . x . x .", "x . . x . x . .", "x x . x . x . .", "x . x x . x . x", "x . x . . x x .", "x . . x x . x ."];
const RHYTHMS_BUSY = ["x x . x x . x .", "x . x x . x x .", "x x x . x . x x", "x . x x x . x .", "x x . x . x x ."];

const qualityAt = (scale: number[], deg: number): ChordQuality => {
  const root = scale[deg % 7]!;
  const third = (scale[(deg + 2) % 7]! - root + 12) % 12;
  return third === 3 ? "min" : "maj";
};

export function generateTrack(scene: TrackName, seed: number): TrackDef {
  const P = PROFILES[scene];
  const r = mulberry(seed ^ 0x9e3779b9);
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(r() * a.length) % a.length]!;
  const mode = pick(P.modes);
  const scale = MODES[mode]!;
  const key = pick(P.keys);
  const bpm = Math.round(P.bpm[0] + r() * (P.bpm[1] - P.bpm[0]));
  const prog = pick(PROGS[mode] ?? PROGS.minor!);
  const minorish = mode === "minor" || mode === "phrygian" || mode === "dorian";

  // eight bars: the loop twice, the second time with a turnaround on the last chord
  const degs = [...prog, ...prog];
  const chordDeg = degs.map((d) => d % 7);
  const chords = chordDeg.map((d, i) => {
    let q = qualityAt(scale, d);
    if (i === 7 || (i === 3 && r() < 0.35)) if (d === 4 || minorish) q = "dom7";
    if (i === 7) return { deg: 4, q: "dom7" as ChordQuality };
    return { deg: d, q };
  });
  const chordDefs = chords.map((c) => {
    let m = 36 + key + scale[c.deg]!;
    while (m > 47) m -= 12;
    while (m < 33) m += 12;
    return { root: midiName(m), q: c.q };
  });

  // melody on scale degrees; absolute scale index: 0 is the key note at midi 72
  const base = 72 + key - (key > 6 ? 12 : 0);
  const noteOf = (idx: number): number => {
    const oct = Math.floor(idx / 7);
    return base + oct * 12 + scale[((idx % 7) + 7) % 7]!;
  };
  const chordTones = (deg: number): number[] => [deg, deg + 2, deg + 4];
  const lo = -3;
  const hi = 9;
  const rhythms = P.energy < 0.35 ? RHYTHMS_CALM : P.energy < 0.6 ? [...RHYTHMS_CALM, ...RHYTHMS_MID] : P.energy < 0.78 ? RHYTHMS_MID : [...RHYTHMS_MID, ...RHYTHMS_BUSY];
  const rhythmA = pick(rhythms).split(" ");
  const rhythmB = pick(rhythms).split(" ");
  const nearestTone = (deg: number, around: number): number => {
    let best = around;
    let bd = 99;
    for (const t of chordTones(deg)) for (const o of [-7, 0, 7]) {
      const c = t + o;
      if (c < lo || c > hi) continue;
      const d = Math.abs(c - around);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  };
  const makeBar = (deg: number, rhythm: string[], from: number, resolve: boolean): { tokens: string[]; last: number } => {
    let cur = nearestTone(deg, from);
    const tokens: string[] = [];
    let last = cur;
    rhythm.forEach((x, i) => {
      if (x !== "x") { tokens.push(i === 0 || !tokens.length ? "." : tokens[tokens.length - 1] === "." ? "." : "-"); return; }
      if (i === 0) cur = nearestTone(deg, cur);
      else {
        const roll = r();
        if (i === 4 || roll < 0.25) cur = nearestTone(deg, cur + (r() < 0.5 ? -1 : 1));
        else cur = Math.max(lo, Math.min(hi, cur + (roll < 0.62 ? 1 : roll < 0.92 ? -1 : r() < 0.5 ? 3 : -3) * (r() < 0.2 ? 2 : 1)));
      }
      tokens.push(midiName(noteOf(cur)));
      last = cur;
    });
    if (resolve) {
      // end the phrase on a chord tone of the chord, and breathe
      const idx = tokens.map((t, i) => [t, i] as const).filter(([t]) => t !== "." && t !== "-").map(([, i]) => i);
      const li = idx[idx.length - 1];
      if (li !== undefined) { last = nearestTone(deg, last); tokens[li] = midiName(noteOf(last)); }
    }
    return { tokens, last };
  };
  const bars: string[] = [];
  let cursor = 2;
  const phraseA: { tokens: string[]; last: number }[] = [];
  for (let b = 0; b < 8; b++) {
    const deg = chordDeg[b]!;
    let bar: { tokens: string[]; last: number };
    if (b === 0 || b === 1) {
      bar = makeBar(deg, rhythmA, cursor, b === 1);
      phraseA.push(bar);
    } else if (b === 2 || b === 3) {
      // the answer: the opening phrase again, a step away
      const src = phraseA[b - 2]!;
      const shift = b === 2 ? 1 : 0;
      const tokens = src.tokens.map((t) => {
        if (t === "." || t === "-") return t;
        return t;
      });
      void shift;
      bar = makeBar(deg, rhythmA, src.last + (b === 2 ? 1 : -1), b === 3);
      if (r() < 0.4) bar = { tokens, last: src.last };
    } else if (b === 4 || b === 5) {
      bar = makeBar(deg, rhythmB, cursor + 1, b === 5);
    } else if (b === 6) {
      bar = makeBar(deg, rhythmA, cursor, false);
    } else {
      bar = makeBar(deg, rhythmB, cursor - 1, true);
      // the last bar has air in it so the loop turns around cleanly
      for (let i = 6; i < bar.tokens.length; i++) bar.tokens[i] = ".";
    }
    cursor = Math.max(lo, Math.min(hi, bar.last));
    bars.push(bar.tokens.join(" "));
  }

  return {
    bpm,
    chords: chordDefs,
    melody: bars,
    bass: pick(P.bass),
    arp: pick(P.arp),
    drums: pick(P.drums),
    duty: 0.25,
    gate: 0.7 + r() * 0.25,
    leadVol: P.leadVol,
    drumVol: P.drumVol,
    swing: P.swing[0] + r() * (P.swing[1] - P.swing[0]),
    timbre: pick(P.timbre),
  };
}

const ADJ = ["Amber", "Quiet", "Late", "Silver", "Slipstream", "Midnight", "Neon", "Paddock", "Apex", "Warm", "Open", "Sunday", "Gravel", "Chicane", "Cold", "Golden", "Rolling", "Last", "Pit Lane", "Dusk"];
const NOUN = ["Lap", "Run", "Line", "Garage", "Grid", "Radio", "Circuit", "Straight", "Hairpin", "Tyres", "Light", "Engine", "Morning", "Harbour", "Flag", "Corner", "Kerb", "Wall", "Window", "Rain"];
/** A name for a tune, from its seed. */
export function trackTitle(seed: number): string {
  const r = mulberry(seed ^ 0x51ed270b);
  return `${ADJ[Math.floor(r() * ADJ.length)]} ${NOUN[Math.floor(r() * NOUN.length)]}`;
}
