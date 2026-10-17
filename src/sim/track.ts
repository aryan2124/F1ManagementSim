export interface Vec {
  x: number;
  y: number;
}

export interface TrackDef {
  name: string;
  country: string;
  /** Closed loop of control points in metres. s = 0 (start/finish line) is at the first point. */
  points: Vec[];
  width: number;
  /** Surface grip multiplier (street circuits are lower). Default 1. */
  gripScale?: number;
  /** Top speed cap in m/s. Default PHYS.V_TOP. */
  vmax?: number;
  /** Incident risk multiplier (tight, walled circuits are higher). Default 1. */
  risk?: number;
  /** Which side of the main straight the pit lane is on: +1 left of travel, -1 right. Default +1. */
  pitSide?: 1 | -1;
}

export interface TrackModel {
  def: TrackDef;
  /** Spacing between samples in metres. */
  ds: number;
  length: number;
  n: number;
  x: Float64Array;
  y: Float64Array;
  heading: Float64Array;
  /** Signed curvature (1/m). Positive = turning right on screen (clockwise). */
  curv: Float64Array;
  /** Nominal speed profile in m/s (physics-limited, with braking + acceleration passes). */
  speed: Float64Array;
  /** True where the track is straight enough to overtake / deploy. */
  straight: Uint8Array;
  /** Pit lane runs this far either side of the start/finish line. */
  pitIn: number;
  pitOut: number;
  /** Distance past the line where cars stop in their box. */
  boxS: number;
  pitSide: 1 | -1;
  /** Numbered corners along the lap (sequential, like the turn numbers on a real circuit map). */
  corners: { s: number; k: number; n: number }[];
  /** Nominal lap time from the speed profile. */
  nominalLap: number;
}

/**
 * Physics constants. Cornering grip grows with speed because of downforce:
 *   a_lat(v) = A_MECH + K_AERO * v^2
 * which gives slow corners ~2.2g, and 250+ km/h sweepers that are flat out. These were calibrated
 * against real pole lap times across the calendar (see tests/calibration).
 */
export const PHYS = {
  A_MECH: 20, // m/s^2 mechanical grip (~2g)
  K_AERO: 0.0075, // 1/m, downforce contribution
  V_TOP: 94, // m/s (~338 km/h)
  V_MIN: 14, // m/s (~50 km/h), tightest hairpins
  /** Scale on straight-line acceleration and braking. */
  ACC: 1,
  BRK: 1,
};

/** Maximum speed through a corner of curvature k (1/m). */
export function cornerSpeed(k: number, gripScale: number, vTop: number): number {
  const a = PHYS.A_MECH * gripScale;
  const kk = PHYS.K_AERO * gripScale;
  if (k <= kk * 1.0001) return vTop;
  return Math.min(vTop, Math.max(PHYS.V_MIN, Math.sqrt(a / (k - kk))));
}

/**
 * Longitudinal acceleration at speed v (m/s). Traction-limited (~1.2g) up to ~190 km/h, then drag-limited:
 * about 200 to 300 km/h in 4 seconds, and a slow crawl towards top speed.
 */
export function accelAt(v: number): number {
  let a: number;
  if (v <= 52) a = 11.5;
  else if (v <= 83) a = 11.5 - ((v - 52) / 31) * 8.9;
  else a = 2.6 - ((v - 83) / 17) * 2.0;
  return PHYS.ACC * Math.max(0.6, a);
}

/** Braking deceleration at speed v (m/s). Downforce and drag make high-speed braking much stronger (~5.5g from 340 km/h). */
export function brakeAt(v: number): number {
  return PHYS.BRK * (33 + 0.0028 * v * v);
}

function catmullRom(p0: Vec, p1: Vec, p2: Vec, p3: Vec, t: number): Vec {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

export function buildTrack(def: TrackDef, ds = 4): TrackModel {
  const pts = def.points;
  const m = pts.length;
  // 1) dense Catmull-Rom sampling
  const dense: Vec[] = [];
  const STEPS = 40;
  for (let i = 0; i < m; i++) {
    const p0 = pts[(i - 1 + m) % m];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % m];
    const p3 = pts[(i + 2) % m];
    for (let k = 0; k < STEPS; k++) dense.push(catmullRom(p0, p1, p2, p3, k / STEPS));
  }
  // 2) resample at uniform arc length
  const cum: number[] = [0];
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1];
    const b = dense[i % dense.length];
    cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = cum[cum.length - 1];
  const n = Math.round(total / ds);
  const step = total / n;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const target = i * step;
    while (cum[j + 1] < target) j++;
    const a = dense[j];
    const b = dense[(j + 1) % dense.length];
    const f = (target - cum[j]) / (cum[j + 1] - cum[j]);
    x[i] = a.x + (b.x - a.x) * f;
    y[i] = a.y + (b.y - a.y) * f;
  }
  // 3) heading + curvature
  const heading = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n;
    const b = (i + 1) % n;
    heading[i] = Math.atan2(y[b] - y[a], x[b] - x[a]);
  }
  const rawCurv = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n;
    const b = (i + 1) % n;
    let d = heading[b] - heading[a];
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    rawCurv[i] = d / (2 * step);
  }
  const curv = new Float64Array(n);
  const W = 3; // moving-average half window
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = -W; k <= W; k++) sum += rawCurv[(i + k + n) % n];
    curv[i] = sum / (2 * W + 1);
  }
  // 4) speed profile: corner limit, then forward (accel) + backward (brake) passes, 2 sweeps for loop closure
  const speed = new Float64Array(n);
  const gripScale = def.gripScale ?? 1;
  const vTop = def.vmax ?? PHYS.V_TOP;
  for (let i = 0; i < n; i++) {
    speed[i] = cornerSpeed(Math.abs(curv[i]), gripScale, vTop);
  }
  for (let sweep = 0; sweep < 2; sweep++) {
    for (let i = 0; i < n; i++) {
      const nx = (i + 1) % n;
      const v = speed[i];
      const lim = Math.sqrt(v * v + 2 * accelAt(v) * step);
      if (lim < speed[nx]) speed[nx] = lim;
    }
    for (let i = n - 1; i >= 0; i--) {
      const pv = (i - 1 + n) % n;
      const v = speed[i];
      const lim = Math.sqrt(v * v + 2 * brakeAt(v) * step);
      if (lim < speed[pv]) speed[pv] = lim;
    }
  }
  const straight = new Uint8Array(n);
  for (let i = 0; i < n; i++) straight[i] = Math.abs(curv[i]) < 0.0016 ? 1 : 0;
  let nominalLap = 0;
  for (let i = 0; i < n; i++) nominalLap += step / speed[i];
  // numbered corners: contiguous stretches of real curvature, apex at the tightest point
  const corners: { s: number; k: number; n: number }[] = [];
  {
    const thr = 0.0045;
    let start = -1;
    let apex = 0;
    let startAt = 0;
    // begin scanning at a straight so we never split a corner across the line
    let first = 0;
    while (first < n && Math.abs(curv[first]) >= thr) first++;
    for (let o = 0; o < n; o++) {
      const i = (first + o) % n;
      const k = Math.abs(curv[i]);
      if (k >= thr) {
        if (start < 0) {
          start = o;
          startAt = i;
          apex = i;
        } else if (k > Math.abs(curv[apex])) apex = i;
      } else if (start >= 0) {
        if ((o - start) * step >= 12) corners.push({ s: apex * step, k: Math.abs(curv[apex]), n: 0 });
        start = -1;
      }
    }
    void startAt;
    corners.sort((a, b) => a.s - b.s);
    corners.forEach((c, i) => (c.n = i + 1));
  }
  return {
    def,
    ds: step,
    length: total,
    n,
    x,
    y,
    heading,
    curv,
    speed,
    straight,
    pitIn: 230,
    pitOut: 260,
    boxS: 40,
    pitSide: def.pitSide ?? 1,
    corners,
    nominalLap,
  };
}

export interface TrackSample {
  x: number;
  y: number;
  heading: number;
  speed: number;
  curv: number;
  straight: boolean;
}

const out: TrackSample = { x: 0, y: 0, heading: 0, speed: 0, curv: 0, straight: false };

/** Sample the track at a distance (any real number; wraps). Returns a shared object: copy if you keep it. */
export function sampleTrack(t: TrackModel, s: number): TrackSample {
  let u = s / t.ds;
  u = ((u % t.n) + t.n) % t.n;
  const i = Math.floor(u);
  const f = u - i;
  const j = (i + 1) % t.n;
  out.x = t.x[i] + (t.x[j] - t.x[i]) * f;
  out.y = t.y[i] + (t.y[j] - t.y[i]) * f;
  let dh = t.heading[j] - t.heading[i];
  while (dh > Math.PI) dh -= 2 * Math.PI;
  while (dh < -Math.PI) dh += 2 * Math.PI;
  out.heading = t.heading[i] + dh * f;
  out.speed = t.speed[i] + (t.speed[j] - t.speed[i]) * f;
  out.curv = t.curv[i] + (t.curv[j] - t.curv[i]) * f;
  out.straight = t.straight[i] === 1;
  return out;
}

/** Minimum distance between any two parts of the track that are far apart along the lap. Used to validate designs. */
export function minSelfClearance(t: TrackModel, minArc = 150): number {
  let best = Infinity;
  const stride = 2;
  for (let i = 0; i < t.n; i += stride) {
    for (let j = i + 1; j < t.n; j += stride) {
      let arc = (j - i) * t.ds;
      arc = Math.min(arc, t.length - arc);
      if (arc < minArc) continue;
      const d = Math.hypot(t.x[i] - t.x[j], t.y[i] - t.y[j]);
      if (d < best) best = d;
    }
  }
  return best;
}
