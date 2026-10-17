/**
 * A modern F1 engine, built from what makes one sound like one (all of it made in code, no samples):
 *
 *  - 1.6 litre V6, four stroke: every cylinder fires once per two crank turns, so the engine fires THREE times per
 *    crank revolution. At 15,000 rpm that is a 750 Hz firing note, at idle (about 5,000 rpm) it is 250 Hz. The old
 *    sound sat at 60 to 100 Hz, which is a diesel truck, not a racing engine.
 *  - The sound is a train of sharp exhaust pressure pulses, not a smooth wave. Each cylinder makes its own pulse, a
 *    little different in strength and timing, which gives the V6 its raspy, slightly uneven edge.
 *  - The exhaust pipes and the body of the car colour it: a thump low down, a strong band in the 2 to 4 kHz range
 *    (where the ear is most sensitive and where the "scream" lives) and a roll-off above about 8 kHz.
 *  - A thin hiss of combustion and intake noise rides on every pulse.
 *
 * Because the sound has to follow the revs, we render a few seamless loops at different rpm and the player
 * cross-fades between them while changing their playback speed (the classic "rpm layers" trick used in racing games).
 * The loop holds a whole number of four-stroke cycles, so it joins up without a click.
 */

/** Small seedable random numbers so every loop is the same each time (and testable). */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

interface Bi {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** RBJ cookbook biquads. */
function biquad(kind: "lp" | "hp" | "peak", fs: number, f0: number, q: number, gainDb = 0): Bi {
  const w = (2 * Math.PI * Math.min(f0, fs * 0.45)) / fs;
  const cw = Math.cos(w);
  const al = Math.sin(w) / (2 * q);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  if (kind === "lp") {
    b0 = (1 - cw) / 2;
    b1 = 1 - cw;
    b2 = (1 - cw) / 2;
    a0 = 1 + al;
    a1 = -2 * cw;
    a2 = 1 - al;
  } else if (kind === "hp") {
    b0 = (1 + cw) / 2;
    b1 = -(1 + cw);
    b2 = (1 + cw) / 2;
    a0 = 1 + al;
    a1 = -2 * cw;
    a2 = 1 - al;
  } else {
    const A = Math.pow(10, gainDb / 40);
    b0 = 1 + al * A;
    b1 = -2 * cw;
    b2 = 1 - al * A;
    a0 = 1 + al / A;
    a1 = -2 * cw;
    a2 = 1 - al / A;
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** Run a filter over a loop twice in a ring so the end flows into the start (no seam). */
function ringFilter(d: Float32Array, f: Bi) {
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < d.length; i++) {
      const x = d[i]!;
      const y = f.b0 * x + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
      if (pass === 1) d[i] = y;
    }
  }
}

export interface EngineLoop {
  data: Float32Array;
  /** The rpm this loop really plays at (nudged so a whole number of cycles fits). */
  rpm: number;
}

/**
 * Engine tone, built the way engine simulators do it (a rough summary of what the public guides agree on):
 *
 *  1. The sound is a train of exhaust PRESSURE PULSES, one per cylinder firing, not a sine or a saw. Each pulse is a soft
 *     "thump": a quick rise and a smooth exponential fall, so almost all of its energy is low, and the harmonics roll off
 *     smoothly instead of ringing.
 *  2. No two cylinders are quite alike: a little difference in strength and timing is what makes it a living engine and
 *     not a buzz (the "burble").
 *  3. The pulses go down an EXHAUST PIPE: a short feedback delay with a darkening filter in the loop. This gives the
 *     hollow, throaty resonance and blends the pulses into one note at speed.
 *  4. The body and intake add a couple of broad humps (low chest, mid growl) and a quiet, pulsing breath of noise.
 *  5. Everything is rolled off softly above a few kHz so it never gets shrill.
 *
 * This is tuned to be warm and easy on the ears for a long race: a big, muscular V8 character at a lower pitch than a
 * real 15,000 rpm F1 engine. The loop holds a whole number of engine cycles and the pipe runs round the loop, so it
 * joins up without a click.
 */
const PITCH = 0.42; // our rpm to "road engine" rpm: keeps the note low and full
const CYL = 8;

export function buildEngineLoop(sampleRate: number, rpm: number, seed = 7, seconds = 1.5): EngineLoop {
  const fs = sampleRate;
  const eng = rpm * PITCH;
  const cycPerSec = eng / 120; // four stroke: one cycle is two turns
  const cycles = Math.max(2, Math.round(cycPerSec * seconds));
  const len = Math.round((cycles / cycPerSec) * fs);
  const realCyc = cycles / (len / fs);
  const realRpm = (realCyc * 120) / PITCH;
  const r = rng(seed + Math.round(rpm));
  const d = new Float32Array(len);
  const fire = (realCyc * CYL); // firings per second
  const per = len / (cycles * CYL); // samples between firings
  // pulse shape: soft rise, smooth fall; faster engines have shorter pulses
  const rise = Math.max(0.0004, 0.0016 - fire * 0.0000025);
  const fall = Math.max(0.0013, 0.0052 - fire * 0.0000085);
  const gain = Array.from({ length: CYL }, () => 0.86 + r() * 0.28);
  const lag = Array.from({ length: CYL }, () => (r() - 0.5) * 0.14 * per);
  const n = Math.min(Math.floor(fs * 0.03), len);
  for (let c = 0; c < cycles; c++) {
    for (let k = 0; k < CYL; k++) {
      const start = (c * CYL + k) * per + lag[k]! + (r() - 0.5) * 0.08 * per;
      const g = gain[k]! * (0.9 + r() * 0.2);
      for (let j = 0; j < n; j++) {
        const tt = j / fs;
        const v = (1 - Math.exp(-tt / rise)) * Math.exp(-tt / fall);
        const idx = (((Math.floor(start) + j) % len) + len) % len;
        d[idx] += g * v;
      }
    }
  }
  // remove the DC of the one-sided pulses
  let mean = 0;
  for (let i = 0; i < len; i++) mean += d[i]!;
  mean /= len;
  for (let i = 0; i < len; i++) d[i] -= mean;

  // exhaust pipe: a feedback delay with a dark filter in the loop, run round the loop so it joins up
  const pipeHz = 150 + Math.min(120, fire * 0.18);
  const D = Math.max(8, Math.round(fs / pipeHz));
  const fb = 0; // no resonant pipe: a comb of ringing tones is what reads as electric
  let lp = 0;
  const lpk = 0.38; // darkening in the loop
  const wet = new Float32Array(len);
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < len; i++) {
      const back = wet[(i - D + len * 4) % len]!;
      lp += lpk * (back - lp);
      const y = d[i]! + fb * lp;
      wet[i] = y;
    }
  }
  // body: a chest hump, a growl hump, a firm low cut and a soft top
  ringFilter(wet, biquad("hp", fs, 48, 0.7));
  ringFilter(wet, biquad("peak", fs, 130, 0.9, 4));
  ringFilter(wet, biquad("peak", fs, Math.min(700, 300 + fire * 0.5), 0.7, 1.5));
  ringFilter(wet, biquad("lp", fs, 2400, 0.5));
  ringFilter(wet, biquad("lp", fs, 2400, 0.5));
  // intake breath: quiet noise that swells on every firing
  const breath = new Float32Array(len);
  for (let i = 0; i < len; i++) breath[i] = r() * 2 - 1;
  ringFilter(breath, biquad("hp", fs, 250, 0.7));
  ringFilter(breath, biquad("lp", fs, 1400, 0.6));
  let peak = 0;
  for (let i = 0; i < len; i++) {
    const ph = ((i / per) % 1);
    const swell = 0.5 + 0.5 * Math.cos(2 * Math.PI * ph);
    void breath; void swell;
    peak = Math.max(peak, Math.abs(wet[i]!));
  }
  const k = peak > 0 ? 1 / peak : 1;
  for (let i = 0; i < len; i++) d[i] = Math.tanh(wet[i]! * k * 0.8) * 0.6;
  return { data: d, rpm: realRpm };
}

/** The rpm of each layer. With playback speed limited to about 0.8 to 1.3 they overlap, and cover idle to the 15,000 limit. */
export const LAYER_RPM = [8500];

/** How loud each layer is at a given rpm (the loudest two overlap, power adds to one). */
export function layerWeights(rpm: number, layers: number[] = LAYER_RPM): number[] {
  const w = layers.map((lr, i) => {
    const lo = i === 0 ? -Infinity : layers[i - 1]!;
    const hi = i === layers.length - 1 ? Infinity : layers[i + 1]!;
    if (rpm <= lo || rpm >= hi) return 0;
    if (rpm < lr) return Math.sin(((rpm - lo) / (lr - lo)) * Math.PI * 0.5);
    return Math.cos(((rpm - lr) / (hi - lr)) * Math.PI * 0.5);
  });
  // below the first layer or above the last one it simply holds
  if (rpm <= layers[0]!) w[0] = 1;
  if (rpm >= layers[layers.length - 1]!) w[layers.length - 1] = 1;
  return w;
}

/** The revs of the car on screen, from how fast it is going: eight gears, each pulling to the limiter, then dropping a notch on the shift. */
export function rpmFor(v: number, gearLen = 11.5): { rpm: number; gear: number } {
  const gear = Math.min(8, Math.floor(v / gearLen) + 1);
  const frac = Math.max(0, Math.min(1, (v - (gear - 1) * gearLen) / gearLen));
  const lo = gear === 1 ? 5200 : 10400;
  return { rpm: lo + frac * (14400 - lo), gear };
}
