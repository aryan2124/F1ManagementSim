/**
 * National anthems for the podium, played on the same synth as the rest of the game.
 *
 * Nothing here is written from memory. The melodies come from freely licensed scores (LilyPond scores on Wikipedia and
 * Wikisource, MIDI files on Wikimedia Commons) converted by the open anthem-scores dataset, vendored in data/anthems with
 * the source, author and licence of every file (see data/anthems/CREDITS.md). `node scripts/buildAnthems.mjs` regenerates
 * src/audio/anthemData.generated.ts from it. To add a nation, drop its JSON in data/anthems and add its codes in the script.
 *
 * Each record is the opening of the anthem, roughly 8 to 25 seconds: the melody, plus bass and inner voices where the score has them.
 * Nations without a record get a short triumphant fanfare in the same instruments, so the ceremony never goes quiet.
 */
import { audioCore, noteMidi, midiFreq, tone } from "./sound";
import { ANTHEM_RECORDS, type AnthemRecord } from "./anthemData.generated";

const MAJOR = [0, 2, 4, 5, 7, 9, 11];

/** Every nationality code the game might use (and the common alternatives), mapped to its anthem. */
const BY_CODE: Record<string, AnthemRecord> = {};
for (const rec of Object.values(ANTHEM_RECORDS)) for (const c of rec.codes) BY_CODE[c] = rec;

export const ANTHEM_CODES = Object.keys(BY_CODE);

export const hasAnthem = (nat: string | undefined) => !!nat && nat in BY_CODE;

/** The anthem of a nation as notes, or null. */
export function anthemTune(nat: string | undefined): (Tune & { rec: AnthemRecord }) | null {
  const rec = nat ? BY_CODE[nat] : undefined;
  if (!rec) return null;
  const notes = rec.mel.map(([at, midi, len]) => ({ at: at!, midi: midi!, len: len! }));
  return { notes, bpm: rec.bpm, beats: rec.len, secs: (rec.len * 60) / rec.bpm, rec };
}

export interface TuneNote {
  /** Start, in beats. */
  at: number;
  /** Length, in beats. */
  len: number;
  /** MIDI note number. */
  midi: number;
}

export interface Tune {
  notes: TuneNote[];
  bpm: number;
  beats: number;
  /** Whole tune length in seconds. */
  secs: number;
}

export function parseTune(src: string): Tune | null {
  const [head, body] = src.split("|");
  if (!head || !body) return null;
  const [tonic, bpmS] = head.trim().split(/\s+/);
  if (!tonic || !bpmS) return null;
  const bpm = Number(bpmS);
  const base = noteMidi(tonic);
  if (!(bpm > 0) || !Number.isFinite(base)) return null;
  const notes: TuneNote[] = [];
  let at = 0;
  for (const tok of body.trim().split(/\s+/)) {
    const m = /^([,]*)([#b]?)([0-7])('*)\/([0-9.]+)$/.exec(tok);
    if (!m) return null;
    const len = Number(m[5]);
    const deg = Number(m[3]);
    if (deg > 0) {
      const bend = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
      const midi = base + MAJOR[deg - 1]! + bend - 12 * m[1]!.length + 12 * m[4]!.length;
      notes.push({ at, len, midi });
    }
    at += len;
  }
  return { notes, bpm, beats: at, secs: (at * 60) / bpm };
}

/** The fanfare for a nation without a tune: a rising brass-like call and a held chord. */
const FANFARE = "C4 96 4 | 1/.5 1/.5 1/1 ,5/1 1/1 3/1 5/1.5 3/.5 5/1 1'/3";

export interface AnthemHandle {
  /** Length in seconds. */
  secs: number;
  stop: () => void;
}

const NONE: AnthemHandle = { secs: 0, stop: () => {} };

/** Play the anthem for a nationality code. Returns how long it runs and a stop function. Never throws. */
export function playAnthem(nat: string | undefined): AnthemHandle {
  try {
    const real = anthemTune(nat);
    const tune: Tune | null = real ?? parseTune(FANFARE);
    if (!tune) return NONE;
    if (audioCore.getSettings().muted) return { secs: tune.secs, stop: () => {} };
    const c = audioCore.ensure();
    const dest = audioCore.musicInput();
    if (!c || !dest) return { secs: tune.secs, stop: () => {} };
    const bus = c.createGain();
    bus.gain.value = 0.9;
    bus.connect(dest);
    const t0 = c.currentTime + 0.12;
    const spb = 60 / tune.bpm;
    for (const n of tune.notes) {
      const t = t0 + n.at * spb;
      const dur = Math.max(0.12, n.len * spb * 0.94);
      const f = midiFreq(n.midi);
      // lead: a warm brass-ish pair, with a little vibrato on the long notes
      tone(c, bus, { t, dur, freq: f, wave: "triangle", vol: 0.16, attack: 0.03, release: Math.min(0.2, dur * 0.4), vibrato: dur > 0.6 ? { rate: 5, depth: f * 0.004 } : undefined });
      tone(c, bus, { t, dur, freq: f / 2, wave: "sine", vol: 0.08, attack: 0.04 });
      // a soft fifth under the long notes fills the sound out (only when the score gives no harmony of its own)
      if (!real && n.len >= 1.5) tone(c, bus, { t, dur, freq: f * 0.75, wave: "sine", vol: 0.05, attack: 0.06 });
    }
    if (real) {
      const rec = real.rec;
      // the score's own bass line and inner voices where it has them
      for (const [at, midi, len] of rec.bass) {
        tone(c, bus, { t: t0 + at! * spb, dur: Math.max(0.15, len! * spb * 0.95), freq: midiFreq(midi!), wave: "sine", vol: 0.11, attack: 0.04 });
      }
      for (const ch of rec.inner as [number, number[], number][]) {
        for (const m of ch[1]) tone(c, bus, { t: t0 + ch[0] * spb, dur: Math.max(0.15, ch[2] * spb * 0.95), freq: midiFreq(m), wave: "sine", vol: 0.05, attack: 0.06 });
      }
      // no bass in the score: the tonic under every bar
      if (!rec.bass.length) {
        const root = 36 + rec.tonic;
        for (let b = 0; b * rec.bar < rec.len; b++) tone(c, bus, { t: t0 + b * rec.bar * spb, dur: rec.bar * spb * 0.9, freq: midiFreq(root), wave: "sine", vol: 0.1, attack: 0.05 });
      }
    } else {
      const base = midiFreq(noteMidi(FANFARE.split(/\s+/)[0]!)) / 2;
      for (let b = 0; b * 4 < tune.beats; b++) tone(c, bus, { t: t0 + b * 4 * spb, dur: 4 * spb * 0.9, freq: base, wave: "sine", vol: 0.1, attack: 0.05 });
    }
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      try {
        bus.gain.cancelScheduledValues(c.currentTime);
        bus.gain.setTargetAtTime(0, c.currentTime, 0.08);
        window.setTimeout(() => {
          try {
            bus.disconnect();
          } catch {
            /* ignore */
          }
        }, 600);
      } catch {
        /* ignore */
      }
    };
    return { secs: tune.secs + 0.5, stop };
  } catch {
    return NONE;
  }
}

/** How long the anthem (or the fanfare) for a nation runs, in seconds, without playing it. */
export function anthemLength(nat: string | undefined): number {
  const t = anthemTune(nat) ?? parseTune(FANFARE);
  return t ? t.secs + 0.5 : 0;
}

export const NATION_NAME: Record<string, string> = {
  GBR: "Great Britain", ENG: "England", SCO: "Scotland", WAL: "Wales", FRA: "France", ITA: "Italy", GER: "Germany", DEU: "Germany", ESP: "Spain", NED: "the Netherlands", NLD: "the Netherlands",
  MON: "Monaco", MEX: "Mexico", FIN: "Finland", ARG: "Argentina", BRA: "Brazil", THA: "Thailand", CAN: "Canada", NZL: "New Zealand", AUS: "Australia", USA: "the United States",
  JPN: "Japan", CHN: "China", DEN: "Denmark", DNK: "Denmark", SUI: "Switzerland", CHE: "Switzerland", AUT: "Austria", BEL: "Belgium", POL: "Poland", SWE: "Sweden", IND: "India",
  INA: "Indonesia", IDN: "Indonesia", RUS: "Russia", CZE: "Czechia", HUN: "Hungary", CRO: "Croatia", HRV: "Croatia", GRE: "Greece", GRC: "Greece", ISR: "Israel", PAK: "Pakistan",
  UKR: "Ukraine", SVK: "Slovakia", ALB: "Albania", SMR: "San Marino", AND: "Andorra", VAT: "the Vatican", IMN: "the Isle of Man", RSA: "South Africa", ZAF: "South Africa",
  COL: "Colombia", NOR: "Norway", IRL: "Ireland", KOR: "South Korea", UAE: "the United Arab Emirates", POR: "Portugal", CHI: "Chile", MAS: "Malaysia", SGP: "Singapore",
};
