/**
 * BOX BOX retro sound engine: sound effects.
 *
 * Everything is synthesized with the Web Audio API (pulse/triangle/saw
 * oscillators, filtered noise, simple envelopes). There are no audio files.
 *
 * Design rules:
 *  - The AudioContext is created lazily, only after a user gesture.
 *  - Every public function is safe to call anywhere (tests, SSR, no
 *    AudioContext, muted, storage blocked) and never throws.
 *  - Settings persist in localStorage (guarded) and are shared with music.ts.
 *
 * Graph:  sfx voices -> sfxBus -> master -> compressor -> destination
 *         music voices -> musicDuck -> musicBus -> master
 */

export type SfxName =
  | "click"
  | "hover"
  | "confirm"
  | "cancel"
  | "error"
  | "notice"
  | "urgent"
  | "coin"
  | "spend"
  | "day"
  | "raceDay"
  | "lightsOut"
  | "pit"
  | "overtake"
  | "safetyCar"
  | "crash"
  | "fastestLap"
  | "purple"
  | "flag"
  | "win"
  | "title"
  | "reveal"
  | "vote"
  | "press"
  | "signed"
  | "fired"
  | "upgrade"
  | "tick"
  | "thunk"
  | "swish"
  | "pop"
  | "deny"
  | "climb"
  | "stamp"
  | "paper"
  | "shutter";

export const SFX_NAMES: readonly SfxName[] = [
  "click",
  "hover",
  "confirm",
  "cancel",
  "error",
  "notice",
  "urgent",
  "coin",
  "spend",
  "day",
  "raceDay",
  "lightsOut",
  "pit",
  "overtake",
  "safetyCar",
  "crash",
  "fastestLap",
  "purple",
  "flag",
  "win",
  "title",
  "reveal",
  "vote",
  "press",
  "signed",
  "fired",
  "upgrade",
  "tick",
  "thunk",
  "swish",
  "pop",
  "deny",
  "climb",
  "stamp",
  "paper",
  "shutter",
];

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export interface SoundSettings {
  muted: boolean;
  /** 0..1 */
  sfxVolume: number;
  /** 0..1 */
  musicVolume: number;
}

const STORAGE_KEY = "boxbox.sound.v1";
const DEFAULTS: SoundSettings = { muted: false, sfxVolume: 0.8, musicVolume: 0.65 };

function clamp01(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

function loadSettings(): SoundSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const j = JSON.parse(raw) as Partial<SoundSettings> | null;
    if (!j || typeof j !== "object") return { ...DEFAULTS };
    return {
      muted: j.muted === true,
      sfxVolume: clamp01(j.sfxVolume, DEFAULTS.sfxVolume),
      musicVolume: clamp01(j.musicVolume, DEFAULTS.musicVolume),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(s: SoundSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage blocked or full: settings simply do not persist */
  }
}

let settings: SoundSettings = loadSettings();
const settingListeners = new Set<() => void>();

function patchSettings(p: Partial<SoundSettings>): void {
  const next: SoundSettings = { ...settings, ...p };
  if (
    next.muted === settings.muted &&
    next.sfxVolume === settings.sfxVolume &&
    next.musicVolume === settings.musicVolume
  ) {
    return;
  }
  settings = next;
  saveSettings(settings);
  applyGains();
  for (const l of [...settingListeners]) {
    try {
      l();
    } catch {
      /* a bad listener must not break audio */
    }
  }
}

/* ------------------------------------------------------------------ */
/* Context and bus graph                                               */
/* ------------------------------------------------------------------ */

interface Graph {
  master: GainNode;
  sfxBus: GainNode;
  musicDuck: GainNode;
  musicBus: GainNode;
}

let ctx: AudioContext | null = null;
let graph: Graph | null = null;
let unlocked = false;
const readyListeners = new Set<() => void>();

function getCtor(): (new () => AudioContext) | null {
  try {
    const g = globalThis as unknown as {
      AudioContext?: new () => AudioContext;
      webkitAudioContext?: new () => AudioContext;
    };
    return g.AudioContext ?? g.webkitAudioContext ?? null;
  } catch {
    return null;
  }
}

/** squared curve feels more natural than linear for volume sliders */
const curve = (v: number) => v * v;
/** Bus levels. The game was too quiet: these are tuned against a measured race (about -26 dBFS RMS at the default sliders). */
const SFX_GAIN = 1.7;
const MUSIC_GAIN = 0.8;

function applyGains(): void {
  if (!ctx || !graph) return;
  try {
    const now = ctx.currentTime;
    graph.master.gain.setTargetAtTime(settings.muted ? 0 : 1, now, 0.015);
    graph.sfxBus.gain.setTargetAtTime(curve(settings.sfxVolume) * SFX_GAIN, now, 0.015);
    graph.musicBus.gain.setTargetAtTime(curve(settings.musicVolume) * MUSIC_GAIN, now, 0.05);
  } catch {
    /* ignore */
  }
}

function ensureCtx(): AudioContext | null {
  if (ctx) return ctx;
  if (!unlocked) return null;
  const Ctor = getCtor();
  if (!Ctor) return null;
  try {
    const c = new Ctor();
    const master = c.createGain();
    const comp = c.createDynamicsCompressor();
    const sfxBus = c.createGain();
    const musicBus = c.createGain();
    const musicDuck = c.createGain();
    master.gain.value = settings.muted ? 0 : 1;
    sfxBus.gain.value = curve(settings.sfxVolume) * SFX_GAIN;
    musicBus.gain.value = curve(settings.musicVolume) * MUSIC_GAIN;
    musicDuck.gain.value = 1;
    // nothing above 7 kHz: that is where the "ring" that hurt came from
    const sfxLP = c.createBiquadFilter();
    sfxLP.type = "lowpass";
    sfxLP.frequency.value = 7000;
    sfxLP.Q.value = 0.5;
    sfxBus.connect(sfxLP);
    sfxLP.connect(master);
    comp.threshold.value = -10;
    comp.knee.value = 14;
    comp.ratio.value = 4;
    comp.attack.value = 0.008;
    comp.release.value = 0.25;
    musicDuck.connect(musicBus);
    musicBus.connect(master);
    master.connect(comp);
    comp.connect(c.destination);
    ctx = c;
    graph = { master, sfxBus, musicDuck, musicBus };
    for (const l of [...readyListeners]) {
      try {
        l();
      } catch {
        /* ignore */
      }
    }
  } catch {
    ctx = null;
    graph = null;
  }
  return ctx;
}

function unlock(): void {
  unlocked = true;
  try {
    const c = ensureCtx();
    if (c && c.state !== "running") {
      const p = c.resume();
      if (p && typeof p.catch === "function") p.catch(() => undefined);
    }
  } catch {
    /* ignore */
  }
}

let gestureInstalled = false;
function installGestureUnlock(): void {
  if (gestureInstalled) return;
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
  gestureInstalled = true;
  const events = ["pointerdown", "keydown", "touchstart"] as const;
  const handler = () => {
    unlock();
    if (!getCtor() || (ctx && ctx.state === "running")) {
      for (const e of events) window.removeEventListener(e, handler, true);
    }
  };
  for (const e of events) window.addEventListener(e, handler, { capture: true, passive: true });
}
installGestureUnlock();

/* ------------------------------------------------------------------ */
/* Synth primitives (shared with music.ts)                             */
/* ------------------------------------------------------------------ */

const NOTE_SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C4" -> 60, "F#3" -> 54, "Bb2" -> 46. Returns NaN when unparseable. */
export function noteMidi(name: string): number {
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(name.trim());
  if (!m) return NaN;
  const base = NOTE_SEMI[m[1]!.toUpperCase()]!;
  const acc = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  return (Number(m[3]) + 1) * 12 + base + acc;
}

export function midiFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function noteFreq(name: string): number {
  return midiFreq(noteMidi(name));
}

const pulseCache = new WeakMap<AudioContext, Map<number, PeriodicWave>>();

/** band limited pulse wave with the given duty cycle (0.125, 0.25, 0.5 ...) */
function pulseWave(c: AudioContext, duty: number): PeriodicWave {
  let m = pulseCache.get(c);
  if (!m) {
    m = new Map();
    pulseCache.set(c, m);
  }
  const key = Math.round(duty * 1000);
  let w = m.get(key);
  if (!w) {
    const N = 32;
    const real = new Float32Array(N);
    const imag = new Float32Array(N);
    for (let n = 1; n < N; n++) real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
    w = c.createPeriodicWave(real, imag);
    m.set(key, w);
  }
  return w;
}

const noiseCache = new WeakMap<AudioContext, AudioBuffer>();

export function noiseBuffer(c: AudioContext): AudioBuffer {
  let b = noiseCache.get(c);
  if (!b) {
    const len = Math.max(1, Math.floor(c.sampleRate ? c.sampleRate : 22050));
    b = c.createBuffer(1, len, c.sampleRate || 22050);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(c, b);
  }
  return b;
}

export interface ToneOpts {
  /** start time on the audio clock */
  t: number;
  dur: number;
  freq: number;
  /** exponential glide target reached at the end of the note */
  freqEnd?: number;
  /** oscillator type, or a pulse duty cycle number such as 0.25 */
  wave?: OscillatorType | number;
  vol?: number;
  /** seconds, default 0.004 */
  attack?: number;
  /** seconds of linear fade at the end, default 40% of dur */
  release?: number;
  vibrato?: { rate: number; depth: number };
}

/** Only the car reveal keeps the old chip sound; everything else is drawn with softer waves. */
let retro = false;

export function tone(c: AudioContext, dest: AudioNode, o: ToneOpts): void {
  try {
    if (!(o.freq > 0) || !(o.dur > 0)) return;
    const hard = typeof o.wave === "number" || o.wave === "square" || o.wave === "sawtooth" || o.wave === undefined;
    const soften = !retro && hard;
    const vol = (o.vol ?? 0.15) * (soften ? 0.85 : 1);
    const attack = Math.min(o.attack ?? (retro ? 0.004 : 0.008), o.dur * 0.5);
    const release = Math.min(o.release ?? o.dur * 0.4, Math.max(0.001, o.dur - attack));
    const osc = c.createOscillator();
    const g = c.createGain();
    const w = soften ? "triangle" : (o.wave ?? "square");
    if (typeof w === "number") osc.setPeriodicWave(pulseWave(c, w));
    else osc.type = w;
    // high notes are folded down an octave: pitches above about 1.2 kHz are what made the old effects ring
    const fold = (f: number) => {
      if (retro) return f;
      while (f > 1250) f /= 2;
      return f;
    };
    const f0 = fold(o.freq);
    const k = f0 / o.freq;
    osc.frequency.setValueAtTime(f0, o.t);
    if (o.freqEnd && o.freqEnd > 0) osc.frequency.exponentialRampToValueAtTime(o.freqEnd * k, o.t + o.dur);
    g.gain.setValueAtTime(0.0001, o.t);
    g.gain.linearRampToValueAtTime(vol, o.t + attack);
    g.gain.setValueAtTime(vol, o.t + o.dur - release);
    g.gain.linearRampToValueAtTime(0.0001, o.t + o.dur);
    osc.connect(g);
    g.connect(dest);
    let lfo: OscillatorNode | null = null;
    let lfoGain: GainNode | null = null;
    if (o.vibrato) {
      lfo = c.createOscillator();
      lfoGain = c.createGain();
      lfo.frequency.value = o.vibrato.rate;
      lfoGain.gain.value = o.vibrato.depth;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start(o.t);
      lfo.stop(o.t + o.dur + 0.03);
    }
    osc.start(o.t);
    osc.stop(o.t + o.dur + 0.03);
    osc.onended = () => {
      try {
        osc.disconnect();
        g.disconnect();
        lfo?.disconnect();
        lfoGain?.disconnect();
      } catch {
        /* ignore */
      }
    };
  } catch {
    /* never throw from audio */
  }
}

export interface NoiseOpts {
  t: number;
  dur: number;
  vol?: number;
  type?: BiquadFilterType;
  f0?: number;
  /** filter frequency at the end of the burst */
  f1?: number;
  q?: number;
  attack?: number;
}

export function noise(c: AudioContext, dest: AudioNode, o: NoiseOpts): void {
  try {
    if (!(o.dur > 0)) return;
    let vol = o.vol ?? 0.1;
    const attack = Math.min(o.attack ?? 0.002, o.dur * 0.8);
    const bright = !retro && (o.type ?? "highpass") === "highpass" && (o.f0 ?? 4000) > 2200;
    if (bright) vol *= 0.7;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = o.type ?? "highpass";
    f.frequency.setValueAtTime(bright ? 2200 : (o.f0 ?? 4000), o.t);
    if (o.f1 && o.f1 > 0) f.frequency.exponentialRampToValueAtTime(o.f1, o.t + o.dur);
    f.Q.value = o.q ?? 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, o.t);
    g.gain.linearRampToValueAtTime(vol, o.t + attack);
    g.gain.linearRampToValueAtTime(0.0001, o.t + o.dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(o.t, Math.random() * 0.5);
    src.stop(o.t + o.dur + 0.03);
    src.onended = () => {
      try {
        src.disconnect();
        f.disconnect();
        g.disconnect();
      } catch {
        /* ignore */
      }
    };
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* Sound effect definitions                                            */
/* ------------------------------------------------------------------ */

interface SfxDef {
  run: (c: AudioContext, t: number, o: AudioNode) => void;
  /** seconds to duck the music for (big jingles) */
  duck?: number;
  /** minimum milliseconds between two plays of this sound */
  gap?: number;
}

/** play a list of [note, offset, dur] triples */
function seq(
  c: AudioContext,
  o: AudioNode,
  t: number,
  notes: ReadonlyArray<readonly [string, number, number]>,
  wave: OscillatorType | number,
  vol: number,
  extra?: Partial<ToneOpts>,
): void {
  for (const [n, off, dur] of notes) {
    tone(c, o, { t: t + off, dur, freq: noteFreq(n), wave, vol, ...extra });
  }
}

const knock = (c: AudioContext, o: AudioNode, t: number) => {
  tone(c, o, { t, dur: 0.1, freq: 190, freqEnd: 70, wave: "sine", vol: 0.32, release: 0.09 });
  noise(c, o, { t, dur: 0.025, vol: 0.14, type: "bandpass", f0: 1400, q: 2 });
};

const kick = (c: AudioContext, o: AudioNode, t: number, vol = 0.25) =>
  tone(c, o, { t, dur: 0.14, freq: 150, freqEnd: 42, wave: "sine", vol, release: 0.13 });

/** Pitch step for the "climb" sound: each step is a whole tone up a pentatonic-ish ladder, so a chain of events rings upward. */
let climbStep = 0;
const LADDER = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const climbFreq = (base: number) => base * Math.pow(2, LADDER[Math.min(LADDER.length - 1, Math.max(0, climbStep))]! / 12);

const UI_DEFS: Record<"tick" | "thunk" | "swish" | "pop" | "deny" | "climb" | "stamp" | "paper" | "shutter", SfxDef> = {
  // a rubber stamp coming down on a form
  stamp: {
    gap: 80,
    run: (c, t, o) => {
      tone(c, o, { t, dur: 0.1, freq: 150, freqEnd: 70, wave: "sine", vol: 0.28, release: 0.09 });
      noise(c, o, { t, dur: 0.05, vol: 0.12, type: "lowpass", f0: 900, q: 0.8 });
      noise(c, o, { t: t + 0.06, dur: 0.03, vol: 0.04, type: "bandpass", f0: 2600, q: 1.2 });
    },
  },
  // paper being crumpled and dropped
  paper: {
    gap: 100,
    run: (c, t, o) => {
      for (let i = 0; i < 6; i++) noise(c, o, { t: t + i * 0.035, dur: 0.03, vol: 0.07, type: "bandpass", f0: 2200 + i * 330, q: 0.7 });
      tone(c, o, { t: t + 0.3, dur: 0.06, freq: 220, freqEnd: 130, wave: "sine", vol: 0.1, release: 0.05 });
    },
  },
  // a camera shutter and flashbulb
  shutter: {
    gap: 120,
    run: (c, t, o) => {
      noise(c, o, { t, dur: 0.02, vol: 0.12, type: "highpass", f0: 3000, q: 0.8 });
      noise(c, o, { t: t + 0.05, dur: 0.025, vol: 0.1, type: "highpass", f0: 2400, q: 0.8 });
      tone(c, o, { t: t + 0.02, dur: 0.12, freq: 2400, freqEnd: 600, wave: "sine", vol: 0.03, release: 0.1 });
    },
  },
  tick: {
    gap: 45,
    run: (c, t, o) => tone(c, o, { t, dur: 0.035, freq: 900 + Math.random() * 160, freqEnd: 700, wave: "sine", vol: 0.04, release: 0.03 }),
  },
  thunk: {
    gap: 30,
    run: (c, t, o) => {
      tone(c, o, { t, dur: 0.09, freq: 260, freqEnd: 110, wave: "sine", vol: 0.2, release: 0.08 });
      tone(c, o, { t, dur: 0.04, freq: 1300, freqEnd: 900, wave: "sine", vol: 0.05, release: 0.03 });
      noise(c, o, { t, dur: 0.02, vol: 0.05, type: "bandpass", f0: 1800, q: 1 });
    },
  },
  swish: {
    gap: 80,
    run: (c, t, o) => noise(c, o, { t, dur: 0.16, vol: 0.06, type: "bandpass", f0: 500, f1: 2400, q: 0.9, attack: 0.05 }),
  },
  pop: {
    gap: 40,
    run: (c, t, o) => {
      tone(c, o, { t, dur: 0.07, freq: 420, freqEnd: 760, wave: "sine", vol: 0.12, release: 0.06 });
      tone(c, o, { t: t + 0.05, dur: 0.1, freq: 760, freqEnd: 620, wave: "sine", vol: 0.07, release: 0.09 });
    },
  },
  deny: {
    gap: 90,
    run: (c, t, o) => {
      tone(c, o, { t, dur: 0.07, freq: 190, freqEnd: 150, wave: "triangle", vol: 0.12, release: 0.06 });
      tone(c, o, { t: t + 0.08, dur: 0.09, freq: 150, freqEnd: 120, wave: "triangle", vol: 0.12, release: 0.08 });
    },
  },
  climb: {
    gap: 0,
    run: (c, t, o) => {
      const f = climbFreq(523);
      tone(c, o, { t, dur: 0.14, freq: f, wave: "triangle", vol: 0.13, release: 0.12 });
      tone(c, o, { t, dur: 0.1, freq: f * 2, wave: "sine", vol: 0.04, release: 0.09 });
    },
  },
};

const DEFS: Record<SfxName, SfxDef> = {
  ...UI_DEFS,
  click: {
    gap: 30,
    run: (c, t, o) => {
      tone(c, o, { t, dur: 0.05, freq: 1100, freqEnd: 760, wave: "sine", vol: 0.1, release: 0.04 });
      noise(c, o, { t, dur: 0.01, vol: 0.025, type: "bandpass", f0: 2400, q: 0.8 });
    },
  },
  hover: {
    gap: 70,
    run: (c, t, o) => tone(c, o, { t, dur: 0.03, freq: 1700, wave: "sine", vol: 0.025, release: 0.025 }),
  },
  confirm: {
    run: (c, t, o) => seq(c, o, t, [["C6", 0, 0.07], ["G6", 0.07, 0.15]], 0.25, 0.13),
  },
  cancel: {
    run: (c, t, o) => seq(c, o, t, [["G5", 0, 0.07], ["C5", 0.07, 0.14]], 0.5, 0.12),
  },
  error: {
    gap: 120,
    run: (c, t, o) => {
      tone(c, o, { t, dur: 0.12, freq: 130, freqEnd: 100, wave: "sawtooth", vol: 0.12 });
      tone(c, o, { t: t + 0.15, dur: 0.16, freq: 110, freqEnd: 80, wave: "sawtooth", vol: 0.12 });
    },
  },
  notice: {
    run: (c, t, o) => {
      seq(c, o, t, [["E5", 0, 0.1], ["G5", 0.09, 0.1], ["C6", 0.18, 0.3]], "triangle", 0.14);
      seq(c, o, t, [["E6", 0.18, 0.25]], 0.125, 0.04);
    },
  },
  urgent: {
    duck: 0.6,
    run: (c, t, o) => {
      for (let i = 0; i < 4; i++) {
        tone(c, o, { t: t + i * 0.11, dur: 0.09, freq: i % 2 ? 660 : 990, wave: 0.125, vol: 0.14 });
      }
      seq(c, o, t, [["A3", 0, 0.44]], "triangle", 0.12);
    },
  },
  coin: {
    run: (c, t, o) => {
      tone(c, o, { t, dur: 0.06, freq: noteFreq("B5"), wave: 0.5, vol: 0.13, release: 0.02 });
      tone(c, o, { t: t + 0.06, dur: 0.35, freq: noteFreq("E6"), wave: 0.5, vol: 0.13, release: 0.3 });
    },
  },
  spend: {
    run: (c, t, o) => {
      seq(c, o, t, [["E6", 0, 0.05], ["B5", 0.05, 0.05], ["E5", 0.1, 0.14]], 0.5, 0.11);
      noise(c, o, { t, dur: 0.012, vol: 0.05, type: "highpass", f0: 4000 });
    },
  },
  day: {
    gap: 150,
    run: (c, t, o) => tone(c, o, { t, dur: 0.03, freq: 700, wave: "triangle", vol: 0.05 }),
  },
  raceDay: {
    duck: 1.9,
    run: (c, t, o) => {
      for (let i = 0; i < 3; i++) noise(c, o, { t: t + i * 0.15, dur: 0.08, vol: 0.08, type: "highpass", f0: 1800 });
      seq(
        c,
        o,
        t,
        [["C5", 0, 0.12], ["C5", 0.15, 0.12], ["C5", 0.3, 0.12], ["E5", 0.45, 0.2], ["G5", 0.7, 0.2], ["C6", 0.95, 0.8]],
        0.25,
        0.13,
      );
      seq(c, o, t, [["C3", 0, 0.4], ["G3", 0.45, 0.4], ["C3", 0.95, 0.8]], "triangle", 0.2);
    },
  },
  lightsOut: {
    duck: 1.5,
    run: (c, t, o) => {
      for (let i = 0; i < 3; i++) tone(c, o, { t: t + i * 0.25, dur: 0.14, freq: 440, wave: "square", vol: 0.11 });
      tone(c, o, { t: t + 0.85, dur: 0.5, freq: 880, wave: "square", vol: 0.13, release: 0.25 });
      noise(c, o, { t: t + 0.85, dur: 0.6, vol: 0.08, type: "bandpass", f0: 300, f1: 2500, q: 1, attack: 0.2 });
    },
  },
  pit: {
    run: (c, t, o) => {
      tone(c, o, { t, dur: 0.12, freq: 120, freqEnd: 55, wave: "sine", vol: 0.22, release: 0.1 });
      for (let i = 0; i < 6; i++) {
        noise(c, o, { t: t + 0.12 + i * 0.055, dur: 0.035, vol: 0.13, type: "highpass", f0: 3500 });
      }
    },
  },
  overtake: {
    run: (c, t, o) => {
      noise(c, o, { t, dur: 0.35, vol: 0.12, type: "bandpass", f0: 500, f1: 3500, q: 1.2, attack: 0.1 });
      tone(c, o, { t, dur: 0.25, freq: 300, freqEnd: 900, wave: 0.125, vol: 0.08 });
    },
  },
  safetyCar: {
    duck: 1.7,
    run: (c, t, o) => {
      for (let i = 0; i < 3; i++) {
        tone(c, o, { t: t + i * 0.5, dur: 0.25, freq: 650, freqEnd: 900, wave: "square", vol: 0.09, attack: 0.01, release: 0.02 });
        tone(c, o, { t: t + i * 0.5 + 0.25, dur: 0.25, freq: 900, freqEnd: 650, wave: "square", vol: 0.09, attack: 0.01, release: 0.02 });
      }
    },
  },
  crash: {
    duck: 0.9,
    run: (c, t, o) => {
      noise(c, o, { t, dur: 0.8, vol: 0.32, type: "lowpass", f0: 4000, f1: 150, q: 0.7, attack: 0.005 });
      noise(c, o, { t, dur: 0.1, vol: 0.18, type: "highpass", f0: 2500 });
      tone(c, o, { t, dur: 0.5, freq: 220, freqEnd: 35, wave: "sawtooth", vol: 0.18 });
    },
  },
  fastestLap: {
    duck: 1.3,
    run: (c, t, o) => {
      seq(c, o, t, [["C6", 0, 0.07], ["E6", 0.07, 0.07], ["G6", 0.14, 0.07], ["C7", 0.21, 0.07]], 0.125, 0.1);
      tone(c, o, {
        t: t + 0.28,
        dur: 0.7,
        freq: noteFreq("E7"),
        wave: 0.125,
        vol: 0.09,
        vibrato: { rate: 7, depth: 12 },
      });
      seq(c, o, t, [["G6", 0.28, 0.7]], "triangle", 0.08);
    },
  },
  purple: {
    run: (c, t, o) => {
      const bell = (n: string, off: number) => {
        const f = noteFreq(n);
        tone(c, o, { t: t + off, dur: 0.35, freq: f, wave: "sine", vol: 0.12, release: 0.32 });
        tone(c, o, { t: t + off, dur: 0.25, freq: f * 2.76, wave: "sine", vol: 0.04, release: 0.23 });
      };
      bell("A6", 0);
      bell("E7", 0.09);
    },
  },
  flag: {
    duck: 1.6,
    run: (c, t, o) => {
      for (let i = 0; i < 8; i++) {
        tone(c, o, { t: t + i * 0.06, dur: 0.05, freq: i % 2 ? 1568 : 1175, wave: 0.5, vol: 0.09 });
      }
      seq(c, o, t, [["C5", 0.6, 0.8], ["E5", 0.6, 0.8], ["G5", 0.6, 0.8], ["C6", 0.6, 0.8]], 0.25, 0.07);
      noise(c, o, { t: t + 0.6, dur: 0.6, vol: 0.06, type: "highpass", f0: 6000 });
    },
  },
  win: {
    duck: 2.2,
    run: (c, t, o) => {
      seq(
        c,
        o,
        t,
        [["C5", 0, 0.11], ["E5", 0.12, 0.11], ["G5", 0.24, 0.11], ["C6", 0.36, 0.14], ["G5", 0.54, 0.11], ["C6", 0.66, 0.14], ["E6", 0.8, 0.8]],
        0.25,
        0.12,
      );
      seq(c, o, t, [["E5", 0.8, 0.8], ["G5", 0.8, 0.8]], 0.5, 0.05);
      seq(c, o, t, [["C3", 0, 0.5], ["F3", 0.54, 0.26], ["C3", 0.8, 0.8]], "triangle", 0.2);
      kick(c, o, t);
      kick(c, o, t + 0.54);
      noise(c, o, { t: t + 0.8, dur: 0.5, vol: 0.05, type: "highpass", f0: 6500 });
    },
  },
  title: {
    duck: 3.2,
    run: (c, t, o) => {
      noise(c, o, { t, dur: 0.7, vol: 0.09, type: "highpass", f0: 5000 });
      const power = (a: string, b: string, d: string, off: number) =>
        seq(c, o, t, [[a, off, 0.36], [b, off, 0.36], [d, off, 0.36]], 0.25, 0.09);
      power("A3", "E4", "A4", 0);
      power("F3", "C4", "F4", 0.4);
      power("G3", "D4", "G4", 0.8);
      seq(c, o, t, [["A2", 0, 0.36], ["F2", 0.4, 0.36], ["G2", 0.8, 0.36], ["C2", 1.25, 1.4]], "triangle", 0.22);
      for (const off of [0, 0.4, 0.8, 1.25]) kick(c, o, t + off, 0.26);
      seq(
        c,
        o,
        t,
        [["C4", 1.25, 1.4], ["E4", 1.25, 1.4], ["G4", 1.25, 1.4], ["C5", 1.25, 1.4], ["E5", 1.25, 1.4]],
        0.25,
        0.07,
        { vibrato: { rate: 6, depth: 6 } },
      );
      seq(c, o, t, [["C6", 1.4, 0.06], ["E6", 1.46, 0.06], ["G6", 1.52, 0.06], ["C7", 1.58, 0.5]], 0.125, 0.08);
      noise(c, o, { t: t + 1.25, dur: 1.2, vol: 0.07, type: "highpass", f0: 6000 });
    },
  },
  reveal: {
    duck: 1.7,
    run: (c, t, o) => {
      noise(c, o, { t, dur: 0.7, vol: 0.12, type: "bandpass", f0: 200, f1: 6000, q: 1.5, attack: 0.6 });
      tone(c, o, { t, dur: 0.7, freq: 100, freqEnd: 800, wave: "sawtooth", vol: 0.06, attack: 0.6, release: 0.05 });
      seq(c, o, t, [["C5", 0.72, 0.6], ["E5", 0.72, 0.6], ["G5", 0.72, 0.6], ["C6", 0.72, 0.6]], 0.25, 0.08);
      seq(c, o, t, [["G7", 0.85, 0.12], ["C8", 0.95, 0.2]], "sine", 0.05);
      kick(c, o, t + 0.72, 0.28);
    },
  },
  vote: {
    run: (c, t, o) => {
      knock(c, o, t);
      knock(c, o, t + 0.17);
    },
  },
  press: {
    run: (c, t, o) => {
      for (const off of [0, 0.09, 0.22, 0.3]) {
        noise(c, o, { t: t + off, dur: 0.008, vol: 0.12, type: "highpass", f0: 2500 });
        noise(c, o, { t: t + off + 0.025, dur: 0.012, vol: 0.1, type: "bandpass", f0: 1500, q: 1.5 });
        tone(c, o, { t: t + off, dur: 0.012, freq: 3000, freqEnd: 1800, wave: "square", vol: 0.03 });
      }
    },
  },
  signed: {
    duck: 1.2,
    run: (c, t, o) => {
      for (let i = 0; i < 3; i++) {
        noise(c, o, { t: t + i * 0.08, dur: 0.07, vol: 0.07, type: "bandpass", f0: 2200, f1: 3200, q: 3 });
      }
      tone(c, o, { t: t + 0.38, dur: 0.14, freq: 140, freqEnd: 50, wave: "sine", vol: 0.34, release: 0.12 });
      noise(c, o, { t: t + 0.38, dur: 0.06, vol: 0.12, type: "lowpass", f0: 800 });
      seq(c, o, t, [["G5", 0.52, 0.1], ["C6", 0.62, 0.4]], 0.25, 0.1);
    },
  },
  fired: {
    duck: 1.8,
    run: (c, t, o) => {
      const line: ReadonlyArray<readonly [string, number, number]> = [
        ["A4", 0, 0.3],
        ["G4", 0.3, 0.3],
        ["F4", 0.6, 0.3],
        ["E4", 0.9, 0.8],
      ];
      for (const [n, off, dur] of line) {
        const f = noteFreq(n);
        const last = off > 0.8;
        tone(c, o, {
          t: t + off,
          dur,
          freq: f,
          freqEnd: f * (last ? 0.8 : 0.97),
          wave: "triangle",
          vol: 0.16,
          vibrato: { rate: 5, depth: 4 },
        });
        tone(c, o, { t: t + off, dur, freq: f * 0.5, freqEnd: f * (last ? 0.4 : 0.48), wave: 0.5, vol: 0.05 });
      }
    },
  },
  upgrade: {
    run: (c, t, o) => {
      for (let i = 0; i < 4; i++) {
        noise(c, o, { t: t + i * 0.045, dur: 0.015, vol: 0.1, type: "highpass", f0: 2000 });
        tone(c, o, { t: t + i * 0.045, dur: 0.015, freq: 900, wave: "square", vol: 0.04 });
      }
      seq(c, o, t, [["C5", 0.22, 0.08], ["E5", 0.3, 0.08], ["G5", 0.38, 0.1]], 0.25, 0.1);
      tone(c, o, { t: t + 0.48, dur: 0.3, freq: noteFreq("C7"), wave: "sine", vol: 0.08, release: 0.28 });
    },
  },
};

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

const lastPlayed = new Map<SfxName, number>();

function duckMusic(seconds: number): void {
  if (!ctx || !graph) return;
  try {
    const now = ctx.currentTime;
    const p = graph.musicDuck.gain;
    p.cancelScheduledValues(now);
    p.setTargetAtTime(0.3, now, 0.03);
    p.setTargetAtTime(1, now + seconds, 0.4);
  } catch {
    /* ignore */
  }
}

export const sfx = {
  /** Play a sound effect. No-op when muted, unlocked yet, or unsupported. */
  play(name: SfxName, step = 0): void {
    try {
      climbStep = step;
      if (settings.muted) return;
      const def = DEFS[name];
      if (!def) return;
      const c = ensureCtx();
      if (!c || !graph) return;
      const gap = def.gap ?? 25;
      const nowMs = Date.now();
      const last = lastPlayed.get(name);
      if (last !== undefined && nowMs - last < gap) return;
      lastPlayed.set(name, nowMs);
      if (c.state === "suspended") {
        const p = c.resume();
        if (p && typeof p.catch === "function") p.catch(() => undefined);
      }
      retro = name === "reveal";
      try {
        def.run(c, c.currentTime + 0.005, graph.sfxBus);
      } finally {
        retro = false;
      }
      if (def.duck) duckMusic(def.duck);
    } catch {
      /* never throws */
    }
  },
  /** Called automatically on the first pointerdown/keydown. Safe to call manually. */
  unlock,
  setMuted(muted: boolean): void {
    patchSettings({ muted: !!muted });
  },
  toggleMuted(): boolean {
    patchSettings({ muted: !settings.muted });
    return settings.muted;
  },
  isMuted(): boolean {
    return settings.muted;
  },
  /** Sound effect volume, 0..1 */
  setVolume(v: number): void {
    patchSettings({ sfxVolume: clamp01(v, settings.sfxVolume) });
  },
  getVolume(): number {
    return settings.sfxVolume;
  },
  names: SFX_NAMES,
};

/**
 * Internal surface shared with music.ts and SoundControls.tsx.
 * Not part of the game-facing API.
 */
export const audioCore = {
  getSettings: (): SoundSettings => settings,
  subscribe(fn: () => void): () => void {
    settingListeners.add(fn);
    return () => {
      settingListeners.delete(fn);
    };
  },
  setMusicVolume(v: number): void {
    patchSettings({ musicVolume: clamp01(v, settings.musicVolume) });
  },
  /** current context if one exists and audio is allowed (not muted is checked by callers) */
  context(): AudioContext | null {
    return ctx;
  },
  /** destination for sound effects (volume and mute already applied downstream) */
  sfxInput(): AudioNode | null {
    return graph ? graph.sfxBus : null;
  },
  /** destination for music voices (ducked and volume controlled) */
  musicInput(): AudioNode | null {
    return graph ? graph.musicDuck : null;
  },
  /** run fn once the context exists (immediately if it already does) */
  onReady(fn: () => void): () => void {
    readyListeners.add(fn);
    return () => {
      readyListeners.delete(fn);
    };
  },
  ensure: ensureCtx,
};
