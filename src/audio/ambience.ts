import { audioCore, noise, noiseBuffer, tone } from "./sound";

/**
 * The sound of the building. A soft looping bed (air handling, a far-off hum) with small human noises
 * scattered on top at random: keys, a chair, paper, a phone down the corridor. Always quiet, and it
 * follows the mute switch and the sound-effects volume.
 */

export type Room = "office" | "factory" | "lab";

interface Live { src: AudioBufferSourceNode; hum: OscillatorNode; gain: GainNode; timer: number; room: Room }
let live: Live | null = null;
let wanted: Room | null = null;
let unsub: (() => void) | null = null;

const level = () => {
  const st = audioCore.getSettings();
  return st.muted ? 0 : 0.5 * st.sfxVolume * st.sfxVolume;
};

function events(c: AudioContext, room: Room) {
  const dest = audioCore.sfxInput();
  if (!dest) return;
  const t = c.currentTime + 0.02;
  const pick = Math.random();
  const vol = 0.5 + Math.random() * 0.4;
  if (pick < 0.4) {
    // keys: a short run of soft ticks
    const n = 4 + Math.floor(Math.random() * 9);
    let at = t;
    for (let i = 0; i < n; i++) { at += 0.05 + Math.random() * 0.09; noise(c, dest, { t: at, dur: 0.018, vol: 0.05 * vol, type: "bandpass", f0: 2400 + Math.random() * 1600, q: 1.5 }); }
  } else if (pick < 0.55) {
    noise(c, dest, { t, dur: 0.4, vol: 0.04 * vol, type: "bandpass", f0: 1400, f1: 3200, q: 0.7, attack: 0.08 });
  } else if (pick < 0.7) {
    tone(c, dest, { t, dur: 0.35, freq: 150, freqEnd: 96, wave: "triangle", vol: 0.035 * vol, release: 0.25 });
    noise(c, dest, { t, dur: 0.3, vol: 0.02 * vol, type: "lowpass", f0: 600, f1: 200 });
  } else if (pick < 0.8) {
    for (let i = 0; i < 2; i++) { const at = t + i * 0.55; tone(c, dest, { t: at, dur: 0.16, freq: 1150, wave: "square", vol: 0.012 * vol }); tone(c, dest, { t: at + 0.2, dur: 0.16, freq: 1450, wave: "square", vol: 0.012 * vol }); }
  } else if (room === "factory" || room === "lab") {
    noise(c, dest, { t, dur: 0.18, vol: 0.05 * vol, type: "bandpass", f0: 900, q: 2 });
    tone(c, dest, { t: t + 0.04, dur: 0.12, freq: 220, freqEnd: 160, wave: "triangle", vol: 0.03 * vol });
  } else {
    noise(c, dest, { t, dur: 0.12, vol: 0.04 * vol, type: "lowpass", f0: 500 });
  }
}

function build(room: Room): void {
  const c = audioCore.context();
  const dest = audioCore.sfxInput();
  if (!c || !dest) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  src.loop = true;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = room === "factory" ? 380 : 240;
  const gain = c.createGain();
  gain.gain.value = 0.0001;
  src.connect(lp); lp.connect(gain); gain.connect(dest);
  const hum = c.createOscillator();
  hum.type = "sine";
  hum.frequency.value = room === "factory" ? 62 : 50;
  const hg = c.createGain();
  hg.gain.value = room === "factory" ? 0.35 : 0.18;
  hum.connect(hg); hg.connect(gain);
  src.start(); hum.start();
  gain.gain.linearRampToValueAtTime(Math.max(0.0001, level() * 0.16), c.currentTime + 1.5);
  const schedule = () => {
    if (!live) return;
    try { if (level() > 0) events(c, live.room); } catch { /* ignore */ }
    live.timer = window.setTimeout(schedule, 1800 + Math.random() * 4200);
  };
  live = { src, hum, gain, timer: window.setTimeout(schedule, 1200), room };
}

function kill(fade = 0.6): void {
  const l = live;
  live = null;
  if (!l) return;
  window.clearTimeout(l.timer);
  const c = audioCore.context();
  try {
    if (c) { l.gain.gain.cancelScheduledValues(c.currentTime); l.gain.gain.setValueAtTime(Math.max(0.0001, l.gain.gain.value), c.currentTime); l.gain.gain.linearRampToValueAtTime(0.0001, c.currentTime + fade); }
    window.setTimeout(() => { try { l.src.stop(); l.hum.stop(); l.src.disconnect(); l.hum.disconnect(); l.gain.disconnect(); } catch { /* ignore */ } }, fade * 1000 + 80);
  } catch { /* ignore */ }
}

function reconcile(): void {
  try {
    if (!wanted || level() <= 0) { kill(0.4); return; }
    if (live && live.room === wanted) {
      const c = audioCore.context();
      if (c) live.gain.gain.linearRampToValueAtTime(Math.max(0.0001, level() * 0.16), c.currentTime + 0.3);
      return;
    }
    kill(0.5);
    build(wanted);
  } catch { /* never throws */ }
}

export const ambience = {
  /** Fade the room's bed in. Safe to call repeatedly and before audio is unlocked. */
  play(room: Room): void {
    wanted = room;
    if (!unsub) {
      const a = audioCore.subscribe(reconcile);
      const b = audioCore.onReady(reconcile);
      unsub = () => { a(); b(); };
    }
    reconcile();
  },
  stop(): void {
    wanted = null;
    kill(0.5);
  },
  room(): Room | null {
    return live ? live.room : null;
  },
};
