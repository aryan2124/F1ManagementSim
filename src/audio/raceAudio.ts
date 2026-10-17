import { audioCore, noise, noiseBuffer, sfx, tone } from "./sound";
import type { RaceSession } from "../game/session";
import type { QualiSession } from "../game/qsession";
import type { SimEvent } from "../sim/types";
import { LIGHTS_TICKS } from "../sim/engine";
import { LAYER_RPM, buildEngineLoop, layerWeights } from "./engineSynth";
import { getPrefs } from "../ui/prefs";

/**
 * The sound of a race, all made in code: the engine of the car on camera, crashes,
 * rain, thunder and tyre noise. What you hear follows the camera:
 *  - sounds follow the camera: only the followed driver's moments are heard;
 *  - things that concern everybody (safety car, red flag, thunder, the chequered flag) are always heard.
 * It stays quiet: every layer is low and the engine fades out when the race is fast forwarded.
 */

interface Layers {
  c: AudioContext;
  out: GainNode;
  engine: GainNode;
  engineTone: BiquadFilterNode;
  layers: { src: AudioBufferSourceNode; g: GainNode; rpm: number }[];
  whine: OscillatorNode;
  whineG: GainNode;
  air: GainNode;
  rain: GainNode;
  rainLP: BiquadFilterNode;
  srcs: AudioBufferSourceNode[];
}


const softCache = new WeakMap<AudioContext, Record<string, AudioBuffer>>();
/** Four seconds of noise with the harsh top taken off: brown is a deep smooth rumble, pink is a soft even wash (rain). Cached per context. */
function softNoise(c: AudioContext, kind: "brown" | "pink"): AudioBuffer {
  let m = softCache.get(c);
  if (!m) softCache.set(c, (m = {}));
  if (m[kind]) return m[kind];
  const rate = c.sampleRate || 22050;
  const buf = c.createBuffer(1, rate * 4, rate);
  const d = buf.getChannelData(0);
  let peak = 0;
  if (kind === "brown") {
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last;
      peak = Math.max(peak, Math.abs(last));
    }
  } else {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      const x = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
      d[i] = x;
      peak = Math.max(peak, Math.abs(x));
    }
  }
  const k = peak > 0 ? 0.9 / peak : 1;
  for (let i = 0; i < d.length; i++) d[i] *= k;
  m[kind] = buf;
  return buf;
}

export class RaceAudio {
  private L: Layers | null = null;
  private off: (() => void) | null = null;
  private lastLights = 0;
  private rainDrift = 0;
  private lastFollow = "";
  private lastV = 0;
  private smoothV = 0;
  private stopped = false;

  constructor(private readonly session: RaceSession | QualiSession) {
    this.off = session.onEvent((e) => this.onEvent(e));
  }

  stop() {
    this.stopped = true;
    this.off?.();
    const L = this.L;
    if (!L) return;
    try {
      const t = L.c.currentTime;
      L.out.gain.setTargetAtTime(0, t, 0.08);
      window.setTimeout(() => {
        try {
          for (const l of L.layers) l.src.stop();
          L.whine.stop();
          for (const s of L.srcs) s.stop();
          L.out.disconnect();
        } catch {
          /* already stopped */
        }
      }, 400);
    } catch {
      /* ignore */
    }
    this.L = null;
  }

  private build(): Layers | null {
    if (this.L) return this.L;
    const c = audioCore.context();
    const dest = audioCore.sfxInput();
    if (!c || !dest || this.stopped) return null;
    try {
      const out = c.createGain();
      out.gain.value = 0;
      out.connect(dest);
      // the engine: four seamless loops of a V6 at different revs (see engineSynth.ts), cross-faded by rpm and
      // played faster or slower to follow it, through a tone control the player can set in Settings
      const engine = c.createGain();
      engine.gain.value = 0;
      const engineTone = c.createBiquadFilter();
      engineTone.type = "lowpass";
      engineTone.frequency.value = 700 + 2000 * Math.max(0, Math.min(1, getPrefs().engineTone ?? 0.5));
      engineTone.Q.value = 0.5;
      engine.connect(engineTone);
      engineTone.connect(out);
      const rate = c.sampleRate || 22050;
      const layers = LAYER_RPM.map((lr, i) => {
        const loop = buildEngineLoop(rate, lr, 11 + i);
        const buf = c.createBuffer(1, loop.data.length, rate);
        buf.getChannelData(0).set(loop.data);
        const src = c.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const g = c.createGain();
        g.gain.value = 0;
        src.connect(g);
        g.connect(engine);
        src.start(0, Math.random() * 0.1);
        return { src, g, rpm: loop.rpm };
      });
      // the turbo and the motor-generator: a faint thin whistle that climbs with the revs and fades off the throttle
      const whine = c.createOscillator();
      whine.type = "sine";
      const whineG = c.createGain();
      whineG.gain.value = 0;
      whine.connect(whineG);
      whineG.connect(out);
      whine.start();
      const srcs: AudioBufferSourceNode[] = [];
      const loop = (f: BiquadFilterNode, g: GainNode, buf: AudioBuffer = noiseBuffer(c)) => {
        const s = c.createBufferSource();
        s.buffer = buf;
        s.loop = true;
        s.connect(f);
        f.connect(g);
        g.connect(out);
        s.start(0, Math.random() * 0.5);
        srcs.push(s);
      };
      // air rushing past: filtered noise that grows with speed
      const airF = c.createBiquadFilter();
      airF.type = "bandpass";
      airF.frequency.value = 700;
      airF.Q.value = 0.5;
      const air = c.createGain();
      air.gain.value = 0;
      loop(airF, air);
      // rain: soft pink noise with the harsh top cut away, a gentle wash that swells and fades, like rain on a roof
      const rainBP = c.createBiquadFilter();
      rainBP.type = "bandpass";
      rainBP.frequency.value = 900;
      rainBP.Q.value = 0.35;
      const rainLP = c.createBiquadFilter();
      rainLP.type = "lowpass";
      rainLP.frequency.value = 2200;
      rainLP.Q.value = 0.3;
      const rain = c.createGain();
      rain.gain.value = 0;
      rainBP.connect(rainLP);
      rainLP.connect(rain);
      rain.connect(out);
      const rainSrc = c.createBufferSource();
      rainSrc.buffer = softNoise(c, "pink");
      rainSrc.loop = true;
      rainSrc.connect(rainBP);
      rainSrc.start(0, Math.random() * 2);
      srcs.push(rainSrc);
      this.L = { c, out, engine, engineTone, layers, whine, whineG, air, rain, rainLP, srcs };
      out.gain.setTargetAtTime(1, c.currentTime, 0.2);
    } catch {
      this.L = null;
    }
    return this.L;
  }

  /** Called every frame or two from the race screen. */
  update(): void {
    if (this.stopped) return;
    const L = this.build();
    if (!L) return;
    const s = this.session as RaceSession;
    const sim = s.sim;
    const c = L.c;
    const t = c.currentTime;
    const quali = !("lightsAt" in (sim as object));
    const car = sim.car(s.followId) as unknown as { v: number; s: number; status: string; removed?: boolean; phase?: string };
    const fast = s.speed >= 16 || s.speed === 0;
    const racing = quali ? (sim as unknown as { phase: string }).phase === "running" : sim.phase === "racing" || sim.phase === "grid";
    // engine
    let v = car.status === "dnf" || car.removed ? 0 : car.v;
    if (quali && (car.phase === "garage" || car.phase === "queue" || car.phase === "crashed")) v = 0;
    const inPit = car.status === "pit_stop";
    if (inPit) v = 0;
        // one smooth curve with speed (no gear sawtooth: the constant rise and fall of pitch sounded like a wobble)
    this.smoothV += (v - this.smoothV) * 0.04;
    const driveRpm = 5200 + Math.min(1, this.smoothV / 90) * 5200;
    const idle = !quali && sim.phase === "grid" ? 38 : 0;
    // revs: the real curve while moving, a steady idle on the grid, near nothing when stopped
    const rpm = v > 0.5 ? driveRpm : idle ? 4800 : 3600;
    const speedMute = quali ? (s.speed <= 8 ? 1 : 0) : s.speed <= 2 ? 1 : s.speed <= 4 ? 0.8 : s.speed <= 8 ? 0.4 : 0;
    const level = !racing || fast || (v < 0.5 && !idle) ? 0 : (0.16 + Math.min(1, v / 85) * 0.16) * speedMute;
    // on the throttle or lifting: the engine is quieter and burbles when the car slows hard
    const dv = v - this.lastV;
    this.lastV = v;
    void dv;
    const load = 1;
    const w = layerWeights(rpm);
    L.layers.forEach((l, i) => {
      l.src.playbackRate.setTargetAtTime(rpm / l.rpm, t, 0.3);
      l.g.gain.setTargetAtTime(w[i]!, t, 0.05);
    });
    L.engine.gain.setTargetAtTime(level * load, t, 0.1);
    L.whine.frequency.setTargetAtTime(240 + rpm * 0.03, t, 0.08);
    L.whineG.gain.setTargetAtTime(0, t, 0.12);
    L.air.gain.setTargetAtTime(!racing || fast ? 0 : Math.min(1, v / 85) * 0.05 * speedMute, t, 0.3);
    // rain
    const wx = sim.weather;
    let rain = 0;
    if (wx && (quali || sim.phase !== "finished")) {
      const k = Math.min(2, Math.floor((((car.s % sim.track.length) + sim.track.length) % sim.track.length) / (sim.track.length / 3)));
      rain = Math.max(0, Math.min(1, wx.rainSector(k, wx.t) * 1.4));
    }
    // a slow swell on the wash, and the odd drop pattering on the roof, so it breathes instead of hissing
    this.rainDrift += (Math.random() - 0.5) * 0.25;
    this.rainDrift = Math.max(-0.7, Math.min(0.7, this.rainDrift));
    L.rain.gain.setTargetAtTime(fast ? 0 : rain * 0.085 * (1 + this.rainDrift * 0.3), t, 0.8);
    if (!fast && rain > 0.12 && Math.random() < rain * 0.45) {
      noise(c, L.out, { t: t + Math.random() * 0.08, dur: 0.04, vol: 0.012 + Math.random() * 0.016, type: "bandpass", f0: 1400 + Math.random() * 1600, q: 1.4, attack: 0.004 });
    }
    // the starting lights: a beep per light, lower than a fire alarm
    if (!quali && sim.phase === "grid" && s.started) {
      const since = sim.tick - (sim.lightsAt - LIGHTS_TICKS);
      const n = since < 0 ? 0 : Math.min(5, Math.floor(since / (LIGHTS_TICKS / 5)) + 1);
      if (n > this.lastLights && n >= 1) {
        tone(c, L.out, { t: t + 0.01, dur: 0.2, freq: 330, wave: "sine", vol: 0.22, attack: 0.012, release: 0.12 });
      }
      this.lastLights = n;
    }
    if (this.lastFollow !== s.followId) this.lastFollow = s.followId;
  }

  /** Does this event belong to the scene on screen? */
  private inScene(e: SimEvent): boolean {
    const f = this.session.followId;
    return e.carId === f || e.otherId === f;
  }

  /** The pops and crackles of an engine off throttle. */

  private squeal() {
    const L = this.build();
    if (!L) return;
    noise(L.c, L.out, { t: L.c.currentTime + 0.01, dur: 0.45, vol: 0.035, type: "bandpass", f0: 2600, f1: 1800, q: 4, attack: 0.05 });
  }

  private thunder(delay: number) {
    const L = this.build();
    if (!L) return;
    const c = L.c;
    const t = c.currentTime + delay;
    noise(c, L.out, { t, dur: 2.6, vol: 0.3, type: "lowpass", f0: 260, f1: 60, q: 0.7, attack: 0.25 });
    noise(c, L.out, { t: t + 0.3, dur: 1.8, vol: 0.08, type: "lowpass", f0: 180, f1: 50, q: 0.7, attack: 0.4 });
  }

  private onEvent(e: SimEvent) {
    if (this.stopped) return;
    const s = this.session;
    if (s.speed >= 16) return; // no wall of noise when the race is fast forwarded
    const sim = s.sim;
    const mine = this.inScene(e);
    switch (e.kind) {
      case "crash":
        if (mine) sfx.play("crash");
        break;
      case "wall":
      case "gravel":
        if (mine) sfx.play("crash");
        break;
      case "contact":
        break;
      case "spin":
      case "lockup":
      case "off_track":
        if (mine) {
          this.squeal();
        }
        break;
      case "overtake": {
        if (!mine) break;
        const car = e.carId ? sim.car(e.carId) : null;
        if (!car) break;
        sfx.play("overtake");
        break;
      }
      case "pit_in":
      case "pit_out":
        if (mine && e.kind === "pit_in") sfx.play("pit");
        break;
      case "fastest_lap":
        if (mine) sfx.play("fastestLap");
        break;
      case "q_purple":
        if (mine) sfx.play("purple");
        break;
      case "sc_deployed":
      case "vsc":
        sfx.play("safetyCar");
        break;
      case "red_flag":
        sfx.play("flag");
        break;
      case "lightning":
        this.thunder(0.4 + Math.random() * 1.6);
        break;
      case "chequered":
        sfx.play("flag");
        break;
      case "finish":
        if (mine && e.carId && sim.car(e.carId).position === 1) sfx.play("win");
        break;
      default:
        break;
    }
  }
}
