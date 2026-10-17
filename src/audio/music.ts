/**
 * BOX BOX sound engine: procedural, warm and modern. Electric piano, soft bass, pads and brushed drums with swing,
 * all synthesised in the browser and played through a gentle low-pass and a quiet echo so nothing is harsh.
 * (The pulse-wave chiptune this replaced is gone.)
 *
 * Each track is a tiny data description (chords per bar, melody tokens, bass
 * and arpeggio style, drum style). A lookahead scheduler turns it into
 * oscillator notes on the Web Audio clock:
 *
 *   a timer wakes every TICK_MS, and schedules every 16th note that falls in
 *   the next LOOKAHEAD seconds at exact audio-clock times. The timer may be
 *   late or jittery, the music is not, and loops are seamless because the
 *   step counter simply wraps while the time keeps accumulating.
 *
 * Switching tracks crossfades: the old player stops scheduling and fades out,
 * the new one fades in. CPU stays low: 3 to 5 short-lived voices per step and
 * one wake-up every 100 ms.
 */
import { audioCore, midiFreq, noise, noteMidi, tone } from "./sound";
import { generateTrack, PROFILES, trackTitle } from "./musicGen";

export type TrackName = "menu" | "factory" | "tense" | "race" | "raceHigh" | "raceSC" | "raceRain" | "quali" | "garage" | "podium" | "crisis" | "rules" | "newsroom" | "results";

export const TRACK_NAMES: readonly TrackName[] = ["menu", "factory", "tense", "race", "raceHigh", "raceSC", "raceRain", "quali", "garage", "podium", "crisis", "rules", "newsroom", "results"];

export type ChordQuality = "maj" | "min" | "dom7" | "sus";
interface Chord {
  root: string;
  q: ChordQuality;
}
export type BassStyle = "root8" | "offbeat" | "pulse16" | "octave" | "long" | "oompah" | "sync" | "walk" | "gallop" | "disco";
export type Timbre = "keys" | "pluck" | "bell" | "soft";
export type ArpStyle = "none" | "updown8" | "up8" | "up16" | "broken";
export type DrumStyle = "none" | "clock" | "soft" | "groove" | "drive" | "tense" | "rock" | "half" | "shuffle" | "funk" | "four" | "dnb";

export interface TrackDef {
  bpm: number;
  chords: Chord[];
  /** one entry per bar (wraps). Tokens: note name, "." rest, "-" hold. 4, 8 or 16 tokens per bar. */
  melody: string[];
  bass: BassStyle;
  arp: ArpStyle;
  drums: DrumStyle;
  /** pulse duty of the lead voice */
  duty: number;
  /** fraction of the note length the lead actually sounds */
  gate: number;
  leadVol: number;
  drumVol: number;
  /** 0 = straight, 1 = full triplet swing */
  swing?: number;
  /** The sound of the lead (default keys). */
  timbre?: Timbre;
}

const C = (root: string, q: ChordQuality = "maj"): Chord => ({ root, q });

const midiNameOf = (m: number): string => ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][((m % 12) + 12) % 12]! + String(Math.floor(m / 12) - 1);
/** The same tune moved up (a key change is how a track gets its lift), with a few settings changed. */
function shiftDef(d: TrackDef, semis: number, over: Partial<TrackDef>): TrackDef {
  const sh = (n: string) => {
    const m = noteMidi(n);
    return Number.isFinite(m) ? midiNameOf(m + semis) : n;
  };
  return {
    ...d,
    chords: d.chords.map((c) => ({ ...c, root: sh(c.root) })),
    melody: d.melody.map((bar) => bar.split(/\s+/).map((tk) => (tk === "." || tk === "-" ? tk : sh(tk))).join(" ")),
    ...over,
  };
}

/** The race theme: a driving, syncopated bass under a hook that comes back with the answer in the second half. */
const RACE: TrackDef = {
  bpm: 152,
  chords: [C("A1", "min"), C("F2"), C("C2"), C("G1"), C("A1", "min"), C("F2"), C("G1"), C("E2", "dom7"), C("D2", "min"), C("A#1"), C("F2"), C("C2"), C("D2", "min"), C("A#1"), C("E2", "dom7"), C("E2", "dom7")],
  melody: [
    "A5 A5 E6 . D6 . C6 A5",
    "F5 F5 C6 . B5 . A5 F5",
    "G5 G5 D6 . C6 . B5 G5",
    "G5 B5 D6 . G6 . F#6 D6",
    "A5 A5 E6 . D6 . C6 E6",
    "F6 . E6 . C6 . A5 .",
    "G5 . B5 . D6 . B5 G5",
    "E6 . G#5 . B5 . E6 .",
    "D6 D6 A5 . F5 . A5 D6",
    "A#5 A#5 F6 . D6 . A#5 F5",
    "A5 C6 F6 . E6 . C6 A5",
    "G5 C6 E6 . D6 . C6 G5",
    "D6 F6 A6 . G6 . F6 D6",
    "D6 F6 A#6 . A6 . F6 D6",
    "E6 . D6 . B5 . G#5 .",
    "B5 . G#5 . E5 . . .",
  ],
  bass: "sync",
  arp: "none",
  drums: "rock",
  duty: 0.25,
  gate: 0.8,
  leadVol: 0.095,
  drumVol: 0.95,
  swing: 0.12,
};

const TRACKS: Record<TrackName, TrackDef> = {
  menu: {
    bpm: 108,
    chords: [C("A2", "min"), C("F2"), C("C3"), C("G2"), C("A2", "min"), C("F2"), C("G2"), C("E2")],
    melody: [
      "E5 . A5 . C6 . B5 A5",
      "A5 . C6 . F5 . A5 .",
      "G5 . E5 . G5 . C6 .",
      "B5 . D6 . B5 . G5 .",
      "E5 . A5 . C6 . E6 .",
      "D6 . C6 . A5 . F5 .",
      "D5 . G5 . B5 . D6 .",
      "E5 G#5 B5 . E6 . B5 .",
    ],
    bass: "root8",
    arp: "updown8",
    drums: "soft",
    duty: 0.25,
    gate: 0.9,
    leadVol: 0.1,
    drumVol: 0.8,
    swing: 0.55,
  },
  factory: {
    bpm: 96,
    chords: [C("D2", "min"), C("A#1"), C("F2"), C("C2"), C("D2", "min"), C("A#1"), C("C2"), C("A1", "min")],
    melody: [
      "A4 . . . D5 . F5 .",
      "D5 . . . F5 . A#5 .",
      "A4 . C5 . F5 . . .",
      "G4 . C5 . E5 . . .",
      "A4 . D5 . F5 . A5 .",
      "A#5 . A5 . F5 . D5 .",
      "E5 . G5 . C6 . G5 .",
      "A5 . E5 . C5 . . .",
    ],
    bass: "offbeat",
    arp: "up8",
    drums: "groove",
    duty: 0.125,
    gate: 0.8,
    leadVol: 0.08,
    drumVol: 0.6,
    swing: 0.6,
  },
  tense: {
    bpm: 132,
    chords: [C("E2", "min"), C("E2", "min"), C("C2"), C("B1", "dom7"), C("E2", "min"), C("E2", "min"), C("A1", "min"), C("B1", "dom7")],
    melody: [
      "B5 - - -",
      "B5 - C6 B5",
      "G5 - - -",
      "F#5 . A5 .",
      "B5 - - -",
      "E6 - D#6 -",
      "C6 - - A5",
      "D#6 - - -",
    ],
    bass: "pulse16",
    arp: "none",
    drums: "tense",
    duty: 0.5,
    gate: 0.95,
    leadVol: 0.085,
    drumVol: 0.8,
    swing: 0.0,
  },
  race: RACE,
  raceHigh: shiftDef(RACE, 2, { bpm: 164, arp: "up8", drums: "drive", leadVol: 0.1, drumVol: 1.1 }),
  raceSC: {
    bpm: 78,
    chords: [C("E2", "min"), C("C2"), C("A1", "min"), C("B1", "dom7"), C("E2", "min"), C("C2"), C("B1", "dom7"), C("B1", "dom7")],
    melody: ["B5 . . . G5 . . .", "G5 . . . E5 . . .", "A5 . . . C6 . . .", "B5 . . . D#6 . . .", "B5 . . . G5 . E5 .", "G5 . . . E5 . C5 .", "D#6 . . . B5 . . .", "B5 - - - - - - -"],
    bass: "long",
    arp: "none",
    drums: "half",
    duty: 0.5,
    gate: 1,
    leadVol: 0.08,
    drumVol: 0.6,
    swing: 0,
  },
  raceRain: {
    bpm: 104,
    chords: [C("D2", "min"), C("A#1"), C("F2"), C("C2"), C("D2", "min"), C("A#1"), C("A1", "dom7"), C("A1", "dom7")],
    melody: ["A5 . D6 . F6 . E6 D6", "D6 . F6 . A#5 . . .", "C6 . F6 . A6 . G6 F6", "E6 . G6 . C6 . . .", "D6 . F6 . A6 . G6 F6", "D6 . F6 . A#6 . A6 F6", "E6 . A5 . C#6 . E6 .", "A5 - - - - - - -"],
    bass: "root8",
    arp: "updown8",
    drums: "soft",
    duty: 0.5,
    gate: 0.95,
    leadVol: 0.07,
    drumVol: 0.6,
    swing: 0.4,
  },
  quali: {
    bpm: 132,
    chords: [C("E2", "min"), C("G2"), C("D2"), C("A1"), C("E2", "min"), C("C2"), C("D2"), C("B1", "dom7")],
    melody: [
      "E6 . E6 . B5 . D6 E6",
      "D6 . D6 . B5 . G5 B5",
      "A5 . F#6 . E6 . D6 .",
      "C#6 . E6 . A5 . C#6 .",
      "E6 . E6 . G6 . F#6 E6",
      "E6 . G6 . C6 . E6 .",
      "F#6 . A6 . F#6 . D6 .",
      "D#6 . F#6 . B5 . . .",
    ],
    bass: "sync",
    arp: "up8",
    drums: "rock",
    duty: 0.25,
    gate: 0.8,
    leadVol: 0.085,
    drumVol: 0.9,
    swing: 0.1,
  },
  garage: {
    bpm: 98,
    chords: [C("F2"), C("D2", "min"), C("A#1"), C("C2"), C("F2"), C("A1", "min"), C("A#1"), C("C2")],
    melody: ["A5 . C6 . F6 . E6 C6", "A5 . D6 . F6 . E6 D6", "D6 . F6 . A#5 . . .", "C6 . E6 . G6 . . .", "A5 . C6 . F6 . A6 G6", "E6 . C6 . A5 . C6 .", "D6 . F6 . D6 . A#5 .", "C6 . G5 . E5 . . ."],
    bass: "offbeat",
    arp: "up8",
    drums: "groove",
    duty: 0.25,
    gate: 0.85,
    leadVol: 0.08,
    drumVol: 0.6,
    swing: 0.5,
  },
  podium: {
    bpm: 104,
    chords: [C("G2"), C("D3"), C("E2", "min"), C("C3"), C("G2"), C("D3"), C("C3"), C("D3")],
    melody: ["G5 . B5 . D6 . G6 .", "F#6 . A6 . D6 . . .", "E6 . G6 . B5 . E6 .", "E6 . D6 . C6 . G5 .", "G5 . B5 . D6 . G6 B6", "A6 . F#6 . D6 . A5 .", "G6 . E6 . C6 . E6 .", "D6 - - - - - - -"],
    bass: "oompah",
    arp: "up8",
    drums: "groove",
    duty: 0.25,
    gate: 0.9,
    leadVol: 0.1,
    drumVol: 0.7,
    swing: 0.3,
  },
  crisis: {
    bpm: 88,
    chords: [C("C2", "min"), C("G#1"), C("D#2"), C("A#1"), C("C2", "min"), C("G#1"), C("G1", "dom7"), C("G1", "dom7")],
    melody: ["G5 . . . D#6 . . .", "G#5 . . . C6 . . .", "A#5 . . . D6 . . .", "A#5 . . . F5 . . .", "G5 . C6 . D#6 . D6 .", "C6 . G#5 . F5 . . .", "B5 . . . D6 . F6 .", "D#6 - - - - - - -"],
    bass: "long",
    arp: "none",
    drums: "half",
    duty: 0.5,
    gate: 1,
    leadVol: 0.075,
    drumVol: 0.6,
    swing: 0,
  },
  rules: {
    bpm: 84,
    chords: [C("C3"), C("G2"), C("A2", "min"), C("E2", "min"), C("F2"), C("C3"), C("F2"), C("G2")],
    melody: [
      "E5 G5 C6 G5",
      "D5 G5 B5 G5",
      "C6 A5 E5 A5",
      "B5 G5 E5 G5",
      "A5 C6 F5 A5",
      "G5 E5 C5 E5",
      "A5 F5 C6 A5",
      "D6 B5 G5 -",
    ],
    bass: "long",
    arp: "none",
    drums: "clock",
    duty: 0.5,
    gate: 0.8,
    leadVol: 0.07,
    drumVol: 0.7,
    swing: 0.5,
  },
  newsroom: {
    bpm: 128,
    chords: [C("C3"), C("F2"), C("G2"), C("C3")],
    melody: [
      "C6 E6 G6 E6 C6 E6 G6 .",
      "A5 C6 F6 C6 A5 C6 F6 .",
      "B5 D6 G6 D6 B5 D6 G6 .",
      "C6 . G5 . E6 C6 G5 .",
    ],
    bass: "oompah",
    arp: "none",
    drums: "groove",
    duty: 0.25,
    gate: 0.5,
    leadVol: 0.1,
    drumVol: 0.8,
    swing: 0.6,
  },
  results: {
    bpm: 100,
    chords: [C("G2"), C("E2", "min"), C("C3"), C("D3"), C("G2"), C("E2", "min"), C("A2", "min"), C("D3")],
    melody: [
      "D5 . G5 . B5 . D6 .",
      "E5 . G5 . B5 . G5 .",
      "E5 . G5 . C6 . G5 .",
      "F#5 . A5 . D6 . A5 .",
      "G5 . B5 . D6 . G6 .",
      "G5 . B5 . E6 . D6 .",
      "C6 . A5 . E5 . A5 .",
      "F#5 A5 D6 . C6 . A5 .",
    ],
    bass: "root8",
    arp: "up8",
    drums: "soft",
    duty: 0.25,
    gate: 0.9,
    leadVol: 0.09,
    drumVol: 0.7,
    swing: 0.55,
  },
};

/* ------------------------------------------------------------------ */
/* Compilation: track description -> events per 16th step              */
/* ------------------------------------------------------------------ */

type EvKind = "lead" | "bass" | "arp" | "kick" | "snare" | "hat" | "pad";
interface Ev {
  kind: EvKind;
  midi: number;
  /** length in steps */
  len: number;
  /** velocity multiplier */
  v: number;
}
export interface Compiled {
  steps: Ev[][];
  stepDur: number;
}

const INTERVALS: Record<ChordQuality, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dom7: [0, 4, 7, 10],
  sus: [0, 5, 7],
};

const DRUM_PATTERNS: Record<DrumStyle, { k: string; s: string; h: string }> = {
  none: { k: "................", s: "................", h: "................" },
  clock: { k: "................", s: "................", h: "x...x...x...x..." },
  soft: { k: "x.......x.......", s: "................", h: "..x...x...x...x." },
  groove: { k: "x.....x...x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.xx" },
  drive: { k: "x...x...x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
  tense: { k: "x...x...x...x...", s: "................", h: "xxxxxxxxxxxxxxxx" },
  rock: { k: "x..x..x...x.x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
  half: { k: "x.......x.......", s: "........x.......", h: "x...x...x...x..." },
  shuffle: { k: "x.....x.x.......", s: "....x.......x...", h: "x.xx.xx.xx.xx.x." },
  funk: { k: "x..x..x...x..x..", s: "....x..x....x...", h: "xxxxxxxxxxxxxxxx" },
  four: { k: "x...x...x...x...", s: "....x.......x...", h: "..x...x...x...x." },
  dnb: { k: "x.........x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." },
};

function bassNotes(style: BassStyle, root: number): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  switch (style) {
    case "root8":
      for (let s = 0; s < 16; s += 2) out.push([s, root, 2]);
      break;
    case "offbeat":
      out.push([0, root, 3], [6, root, 2], [8, root, 3], [11, root + 7, 2], [14, root + 12, 2]);
      break;
    case "pulse16":
      for (let s = 0; s < 16; s++) out.push([s, root, 1]);
      break;
    case "octave":
      for (let s = 0; s < 16; s += 2) out.push([s, s % 4 === 0 ? root : root + 12, 2]);
      break;
    case "long":
      out.push([0, root, 8], [8, root + 7, 8]);
      break;
    case "sync":
      out.push([0, root, 2], [3, root, 2], [6, root + 12, 1], [8, root, 2], [11, root, 2], [14, root + 7, 2]);
      break;
    case "oompah":
      out.push([0, root, 3], [4, root + 7, 3], [8, root, 3], [12, root + 7, 3]);
      break;
    case "walk":
      out.push([0, root, 3], [4, root + 7, 2], [6, root + 5, 2], [8, root + 7, 3], [12, root + 12, 2], [14, root + 10, 2]);
      break;
    case "gallop":
      for (let q = 0; q < 4; q++) out.push([q * 4, root, 1], [q * 4 + 1, root, 1], [q * 4 + 2, q === 3 ? root + 7 : root, 2]);
      break;
    case "disco":
      for (let q = 0; q < 8; q++) out.push([q * 2, q % 2 === 0 ? root : root + 12, 1]);
      break;
  }
  return out;
}

function arpNotes(style: ArpStyle, base: number, ivs: number[]): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  if (style === "none") return out;
  const tones = ivs.map((i) => base + i);
  tones.push(base + 12);
  const n = tones.length;
  if (style === "broken") {
    // a skipping pattern: 0 2 1 3 | 2 0 3 1
    const seq = [0, 2, 1, 3, 2, 0, 3, 1];
    for (let i = 0; i < 8; i++) out.push([i * 2 + (i % 4 === 3 ? 0 : 0), tones[seq[i]! % n]!, 1]);
    return out;
  }
  if (style === "up16") {
    for (let s = 0; s < 16; s++) out.push([s, tones[s % n]!, 1]);
  } else if (style === "up8") {
    for (let i = 0; i < 8; i++) out.push([i * 2, tones[i % n]!, 1]);
  } else {
    // up then down: 0 1 2 3 2 1 0 1 ...
    const cyc: number[] = [];
    for (let i = 0; i < n; i++) cyc.push(i);
    for (let i = n - 2; i > 0; i--) cyc.push(i);
    for (let i = 0; i < 8; i++) out.push([i * 2, tones[cyc[i % cyc.length]!]!, 1]);
  }
  return out;
}

/** Parse one bar of melody tokens into [stepInBar, midi, lenSteps] entries. */
export function parseMelodyBar(bar: string): Array<[number, number, number]> {
  const toks = bar.trim().split(/\s+/);
  const n = toks.length;
  if (n === 0 || 16 % n !== 0) return [];
  const stride = 16 / n;
  const out: Array<[number, number, number]> = [];
  toks.forEach((tk, i) => {
    if (tk === ".") return;
    if (tk === "-") {
      const last = out[out.length - 1];
      if (last) last[2] += stride;
      return;
    }
    const m = noteMidi(tk);
    if (Number.isFinite(m)) out.push([i * stride, m, stride]);
  });
  return out;
}

const compiledCache = new Map<TrackName, Compiled>();

function compile(name: TrackName): Compiled {
  const hit = compiledCache.get(name);
  if (hit) return hit;
  const out = compileDef(TRACKS[name]);
  compiledCache.set(name, out);
  return out;
}

export function compileDef(def: TrackDef): Compiled {
  const bars = def.chords.length;
  const steps: Ev[][] = Array.from({ length: bars * 16 }, () => []);
  const push = (step: number, e: Ev) => {
    const slot = steps[step];
    if (slot) slot.push(e);
  };
  const drums = DRUM_PATTERNS[def.drums];
  for (let b = 0; b < bars; b++) {
    const chord = def.chords[b]!;
    const root = noteMidi(chord.root);
    const ivs = INTERVALS[chord.q];
    for (const [s, m, len] of bassNotes(def.bass, root)) push(b * 16 + s, { kind: "bass", midi: m, len, v: s % 4 === 0 ? 1 : 0.8 });
    for (const [s, m, len] of arpNotes(def.arp, root + 24, ivs)) push(b * 16 + s, { kind: "arp", midi: m, len, v: 1 });
    for (const iv of ivs) push(b * 16, { kind: "pad", midi: root + 12 + iv, len: 16, v: 1 });
    const melodyBar = def.melody[b % def.melody.length] ?? "";
    for (const [s, m, len] of parseMelodyBar(melodyBar)) push(b * 16 + s, { kind: "lead", midi: m, len, v: 1 });
    for (let s = 0; s < 16; s++) {
      if (drums.k[s] === "x") push(b * 16 + s, { kind: "kick", midi: 0, len: 1, v: 1 });
      if (drums.s[s] === "x") push(b * 16 + s, { kind: "snare", midi: 0, len: 1, v: 1 });
      if (drums.h[s] === "x") push(b * 16 + s, { kind: "hat", midi: 0, len: 1, v: s % 4 === 0 ? 1 : 0.6 });
    }
  }
  return { steps, stepDur: 60 / def.bpm / 4 };
}

/* ------------------------------------------------------------------ */
/* Voices                                                              */
/* ------------------------------------------------------------------ */

/** A soft electric piano: a sine carrier with a decaying FM "tine" and a quiet second partial. */
function keys(c: AudioContext, dest: AudioNode, t: number, dur: number, midi: number, vol: number): void {
  try {
    const f = midiFreq(midi);
    const carrier = c.createOscillator();
    const mod = c.createOscillator();
    const modGain = c.createGain();
    const amp = c.createGain();
    carrier.type = "sine";
    mod.type = "sine";
    carrier.frequency.value = f;
    mod.frequency.value = f * 2.0;
    const tail = Math.max(0.25, dur * 1.5);
    modGain.gain.setValueAtTime(f * 1.4, t);
    modGain.gain.exponentialRampToValueAtTime(f * 0.08, t + Math.min(0.5, tail));
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(vol, t + 0.01);
    amp.gain.exponentialRampToValueAtTime(vol * 0.35, t + 0.18);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + tail);
    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(amp);
    amp.connect(dest);
    carrier.start(t);
    mod.start(t);
    carrier.stop(t + tail + 0.05);
    mod.stop(t + tail + 0.05);
    carrier.onended = () => {
      try {
        carrier.disconnect();
        mod.disconnect();
        modGain.disconnect();
        amp.disconnect();
      } catch {
        /* ignore */
      }
    };
  } catch {
    /* ignore */
  }
}

/** A vibraphone-like pluck for the arpeggio. */
function pluck(c: AudioContext, dest: AudioNode, t: number, dur: number, midi: number, vol: number): void {
  const f = midiFreq(midi);
  tone(c, dest, { t, dur: Math.max(0.12, dur * 1.6), freq: f, wave: "sine", vol, attack: 0.006, release: Math.max(0.1, dur * 1.4) });
  tone(c, dest, { t, dur: 0.12, freq: f * 3.99, wave: "sine", vol: vol * 0.18, attack: 0.003, release: 0.1 });
}

/** A round, low bass: a sine with a little triangle for definition. */
function softBass(c: AudioContext, dest: AudioNode, t: number, dur: number, midi: number, vol: number): void {
  const f = midiFreq(midi);
  tone(c, dest, { t, dur, freq: f, wave: "sine", vol, attack: 0.012, release: Math.min(0.12, dur * 0.6) });
  tone(c, dest, { t, dur: Math.min(dur, 0.22), freq: f * 2, wave: "triangle", vol: vol * 0.22, attack: 0.012, release: 0.15 });
}

/** One note of a chord pad: slow in, slow out, two slightly detuned voices. */
function padNote(c: AudioContext, dest: AudioNode, t: number, dur: number, midi: number, vol: number): void {
  const f = midiFreq(midi);
  tone(c, dest, { t, dur, freq: f * 0.9965, wave: "triangle", vol, attack: 0.35, release: Math.min(0.9, dur * 0.5) });
  tone(c, dest, { t, dur, freq: f * 1.0035, wave: "sine", vol: vol * 0.8, attack: 0.35, release: Math.min(0.9, dur * 0.5) });
}

function playEv(c: AudioContext, dest: AudioNode, def: TrackDef, e: Ev, t: number, stepDur: number): void {
  const len = e.len * stepDur;
  const dv = def.drumVol * e.v;
  switch (e.kind) {
    case "lead": {
      const d = Math.max(0.1, len * def.gate);
      const vol = def.leadVol * 2.2 * e.v;
      if (def.timbre === "pluck") pluck(c, dest, t, d, e.midi - 12, vol * 0.9);
      else if (def.timbre === "bell") {
        const f = midiFreq(e.midi);
        tone(c, dest, { t, dur: Math.max(0.5, d * 1.6), freq: f, wave: "sine", vol: vol * 0.45, attack: 0.004, release: 0.45 });
        tone(c, dest, { t, dur: 0.35, freq: f * 3.99, wave: "sine", vol: vol * 0.12, attack: 0.002, release: 0.3 });
      } else if (def.timbre === "soft") {
        const f = midiFreq(e.midi - 12);
        tone(c, dest, { t, dur: d + 0.15, freq: f, wave: "triangle", vol: vol * 0.55, attack: 0.05, release: 0.2 });
        tone(c, dest, { t, dur: d + 0.15, freq: f * 2.003, wave: "sine", vol: vol * 0.2, attack: 0.08, release: 0.2 });
      } else keys(c, dest, t, d, e.midi - 12, vol);
      break;
    }
    case "bass":
      softBass(c, dest, t, Math.max(0.1, len * 0.95), e.midi, 0.2 * e.v);
      break;
    case "arp":
      pluck(c, dest, t, len, e.midi - 12, 0.05 * e.v);
      break;
    case "pad":
      padNote(c, dest, t, len, e.midi, 0.028);
      break;
    case "kick":
      tone(c, dest, { t, dur: 0.16, freq: 120, freqEnd: 48, wave: "sine", vol: 0.2 * dv, attack: 0.004, release: 0.13 });
      break;
    case "snare":
      // a brush: soft band-passed noise, no bite
      noise(c, dest, { t, dur: 0.16, vol: 0.06 * dv, type: "bandpass", f0: 2400, q: 0.6, attack: 0.012 });
      tone(c, dest, { t, dur: 0.08, freq: 180, freqEnd: 130, wave: "sine", vol: 0.05 * dv, release: 0.06 });
      break;
    case "hat":
      noise(c, dest, { t, dur: 0.05, vol: 0.02 * dv, type: "bandpass", f0: 4600, q: 1.1, attack: 0.006 });
      break;
  }
}

/* ------------------------------------------------------------------ */
/* Player and scheduler                                                */
/* ------------------------------------------------------------------ */

const TICK_MS = 100;
const LOOKAHEAD = 0.6;
const FADE = 0.9;
const FIRST_FADE = 0.25;

interface Player {
  /** The scene this plays for. */
  track: TrackName;
  title: string;
  seed: number;
  startedAt: number;
  minSecs: number;
  loops: number;
  rotating: boolean;
  rotated?: boolean;
  def: TrackDef;
  comp: Compiled;
  gain: GainNode;
  /** where the voices plug in: a low-pass and a quiet echo sit between this and the fade gain */
  in: AudioNode;
  ctx: AudioContext;
  step: number;
  next: number;
  timer: ReturnType<typeof setTimeout> | null;
  dead: boolean;
}

let wanted: TrackName | null = null;
let current: Player | null = null;

function stopScheduling(p: Player): void {
  p.dead = true;
  if (p.timer !== null) {
    clearTimeout(p.timer);
    p.timer = null;
  }
}

function killNow(p: Player): void {
  stopScheduling(p);
  try {
    p.in.disconnect();
    p.gain.disconnect();
  } catch {
    /* ignore */
  }
}

function fadeOutAndKill(p: Player, fade: number): void {
  stopScheduling(p);
  try {
    p.gain.gain.cancelScheduledValues(p.ctx.currentTime);
    p.gain.gain.setTargetAtTime(0, p.ctx.currentTime, fade / 4);
  } catch {
    /* ignore */
  }
  setTimeout(() => killNow(p), Math.ceil(fade * 1500) + 100);
}

function tick(p: Player): void {
  p.timer = null;
  if (p.dead) return;
  try {
    const c = p.ctx;
    const horizon = c.currentTime + LOOKAHEAD;
    if (p.next < c.currentTime) p.next = c.currentTime + 0.05; // underrun: resync
    let guard = 0;
    while (p.next < horizon && guard++ < 64) {
      const evs = p.comp.steps[p.step];
      if (evs) {
        const sw = p.def.swing ?? 0;
        const m = p.step % 4;
        const late = (m === 2 ? 0.667 : m === 1 || m === 3 ? 0.2 : 0) * sw * p.comp.stepDur;
        for (const e of evs) {
          const wobble = e.kind === "pad" || e.kind === "kick" ? 0 : (Math.random() - 0.5) * 0.012;
          playEv(c, p.in, p.def, { ...e, v: e.v * (0.92 + Math.random() * 0.16) }, p.next + late + wobble, p.comp.stepDur);
        }
      }
      p.next += p.comp.stepDur;
      p.step = (p.step + 1) % p.comp.steps.length;
      if (p.step === 0) {
        p.loops++;
        if (c.currentTime - p.startedAt >= p.minSecs) p.rotating = true;
      }
    }
    // after a few minutes of the same tune, move on to the next one in the scene
    if (p.rotating && !p.dead && !p.rotated) {
      p.rotated = true;
      setTimeout(() => {
        if (current === p && !p.dead && wanted === p.track) start(p.track);
      }, 0);
    }
  } catch {
    /* keep going; a failed tick must not stop the music */
  }
  if (!p.dead) p.timer = setTimeout(() => tick(p), TICK_MS);
}

function canRun(): boolean {
  if (audioCore.getSettings().muted) return false;
  return !!(audioCore.ensure() && audioCore.musicInput());
}

/** How many tunes this scene has played: the first is the hand-written one, then written-on-the-spot ones with the odd old favourite. */
const played = new Map<TrackName, number>();
let lastSeed = 0;

function chooseTune(track: TrackName): { def: TrackDef; comp: Compiled; title: string; seed: number } {
  const n = played.get(track) ?? 0;
  played.set(track, n + 1);
  if (n === 0 || (n % 5 === 0 && !forceNew)) return { def: TRACKS[track], comp: compile(track), title: "Theme", seed: 0 };
  let seed = Math.floor(Math.random() * 2147483647);
  if (seed === lastSeed) seed++;
  lastSeed = seed;
  const def = generateTrack(track, seed);
  return { def, comp: compileDef(def), title: trackTitle(seed), seed };
}
let forceNew = false;

function start(track: TrackName): void {
  try {
    const c = audioCore.context();
    const input = audioCore.musicInput();
    if (!c || !input) return;
    const fade = current ? FADE : FIRST_FADE;
    if (current) fadeOutAndKill(current, FADE);
    const gain = c.createGain();
    gain.gain.value = 0;
    gain.connect(input);
    gain.gain.setTargetAtTime(1, c.currentTime, fade / 4);
    // warmth: roll the top off, and add a soft filtered echo
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 4800;
    lp.Q.value = 0.5;
    lp.connect(gain);
    const delay = c.createDelay(1.5);
    const tune = chooseTune(track);
    delay.delayTime.value = (60 / tune.def.bpm) * 0.75;
    const fb = c.createGain();
    fb.gain.value = 0.34;
    const dlp = c.createBiquadFilter();
    dlp.type = "lowpass";
    dlp.frequency.value = 1900;
    const wet = c.createGain();
    wet.gain.value = 0.22;
    lp.connect(delay);
    delay.connect(dlp);
    dlp.connect(fb);
    fb.connect(delay);
    dlp.connect(wet);
    wet.connect(gain);
    const p: Player = {
      track,
      title: tune.title,
      seed: tune.seed,
      startedAt: c.currentTime,
      minSecs: PROFILES[track].minSecs,
      loops: 0,
      rotating: false,
      def: tune.def,
      comp: tune.comp,
      gain,
      in: lp,
      ctx: c,
      step: 0,
      next: c.currentTime + 0.06,
      timer: null,
      dead: false,
    };
    current = p;
    tick(p);
  } catch {
    /* ignore */
  }
}

/** bring the running player in line with `wanted`, mute state and context state */
function reconcile(): void {
  try {
    if (wanted && canRun()) {
      if (!current || current.dead || current.track !== wanted) start(wanted);
    } else if (current && !current.dead && wanted) {
      // muted: stop the scheduler and silence at once, resume on unmute
      killNow(current);
      current = null;
    }
  } catch {
    /* ignore */
  }
}

audioCore.subscribe(reconcile);
audioCore.onReady(reconcile);

export const music = {
  /** Start (or crossfade to) a track. Remembers it and starts once audio is allowed. */
  play(track: TrackName): void {
    try {
      if (!TRACKS[track]) return;
      wanted = track;
      reconcile();
    } catch {
      /* never throws */
    }
  },
  /** Fade out and stop. */
  stop(): void {
    try {
      wanted = null;
      if (current && !current.dead) fadeOutAndKill(current, 0.5);
      current = null;
    } catch {
      /* ignore */
    }
  },
  /** Move on to another tune in the same scene now. */
  skip(): void {
    try {
      if (!wanted || !current || current.dead) return;
      forceNew = true;
      start(wanted);
      forceNew = false;
    } catch {
      forceNew = false;
    }
  },
  /** The name of the tune that is playing, if any. */
  title(): string | null {
    return current && !current.dead ? current.title : null;
  },
  /** The track that should be playing (may be waiting for the first user gesture). */
  current(): TrackName | null {
    return wanted;
  },
  /** True while a scheduler is actually running. */
  isPlaying(): boolean {
    return !!current && !current.dead;
  },
  /** Music volume, 0..1 (persisted, shared with the sound settings). */
  setVolume(v: number): void {
    audioCore.setMusicVolume(v);
  },
  getVolume(): number {
    return audioCore.getSettings().musicVolume;
  },
  tracks: TRACK_NAMES,
};
