import type { Graphics } from "pixi.js";
import { sampleTrack, type TrackModel } from "../sim/track";
import type { Debris, Recovery } from "../sim/recovery";
import { STAGES } from "../sim/recovery";

/**
 * The recovery crew, the debris and the crash poses, drawn procedurally in world pixels (one pixel is about 1.2 m, a car is
 * seven by four). Every frame is keyed from the sim's recovery stage and how far through it the sim is, so the picture can
 * never disagree with the clock that decides how long the safety car stays out.
 */

const MPP = 1.2;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => x * x * (3 - 2 * x);
const mod = (a: number, n: number) => ((a % n) + n) % n;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** How to draw the car sprite while its crash is being cleared. */
export interface PoseDraw {
  rot: number;
  sx: number;
  sy: number;
  tint: number;
  /** Extra sideways shift in world pixels (the car being pushed or dragged out). */
  off: number;
  /** Lifted off the ground by a crane, 0 to 1. */
  lift: number;
  hidden: boolean;
  burning: boolean;
  /** The sprite is replaced by a drawing of the car on its side or its back. */
  custom: boolean;
}

const hash = (id: string) => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
};

export function poseDraw(r: Recovery, tick: number): PoseDraw {
  const out: PoseDraw = { rot: 0, sx: 1, sy: 1, tint: 0xffffff, off: 0, lift: 0, hidden: false, custom: false, burning: r.fire && STAGES.indexOf(r.stage) <= STAGES.indexOf("check") };
  const jitter = (hash(r.carId) - 0.5) * 0.5;
  const prog = clamp01((tick - r.stageStart) / Math.max(1, r.stageEnd - r.stageStart));
  // the way the car came to rest
  let rot = jitter;
  let sy = 1;
  let tint = 0xffffff;
  switch (r.pose) {
    case "nose_in":
      rot = 0.38 * r.side;
      break;
    case "rear_in":
      rot = -0.34 * r.side;
      break;
    case "spun":
      rot = Math.PI * (0.6 + hash(r.carId) * 0.8);
      break;
    case "buried":
      rot = 0.18 * r.side + jitter * 0.4;
      tint = 0xcdb98a;
      break;
    case "side":
      sy = 0.55;
      tint = 0xc9c9d4;
      break;
    case "back":
      sy = -0.9;
      tint = 0x8d8da0;
      break;
    default:
      break;
  }
  // turning the car back over
  const si = STAGES.indexOf(r.stage);
  if (r.pose === "side" || r.pose === "back") {
    if (si > STAGES.indexOf("right")) {
      sy = 1;
      tint = 0xffffff;
    } else if (r.stage === "right") {
      const k = ease(prog);
      sy = lerp(r.pose === "side" ? 0.55 : -0.9, 1, k);
      tint = k > 0.6 ? 0xffffff : tint;
    }
  }
  out.custom = (r.pose === "side" || r.pose === "back") && si <= STAGES.indexOf("right") && !(r.stage === "right" && prog > 0.85);
  out.rot = rot;
  out.sy = sy;
  out.tint = tint;
  // being removed
  if (r.stage === "remove") {
    const k = ease(prog);
    if (r.method === "push" || r.method === "tractor") out.off = r.side * (k * 14);
    else if (r.method === "crane") {
      out.lift = Math.sin(Math.min(1, k * 1.2) * Math.PI * 0.5);
      out.off = r.side * (k * 12);
    }
    if (prog > 0.97) out.hidden = true;
  } else if (si > STAGES.indexOf("remove")) out.hidden = true;
  return out;
}

type G = Graphics;

class Frame {
  constructor(private g: G, private track: TrackModel) {}
  at(s: number, lat: number) {
    const t = sampleTrack(this.track, mod(s, this.track.length));
    const nx = Math.sin(t.heading);
    const ny = -Math.cos(t.heading);
    return { x: (t.x + nx * lat) / MPP, y: (t.y + ny * lat) / MPP, h: t.heading };
  }
  px(x: number, y: number, c: number, a = 1) {
    this.g.rect(Math.round(x), Math.round(y), 1, 1).fill(a < 1 ? { color: c, alpha: a } : c);
  }
  /** A rotated block in car-local units. */
  block(cx: number, cy: number, h: number, f0: number, f1: number, s0: number, s1: number, c: number) {
    const fx = Math.cos(h), fy = Math.sin(h), rx = -fy, ry = fx;
    const P = (f: number, s: number) => [cx + fx * f + rx * s, cy + fy * f + ry * s];
    const a = P(f0, s0), b = P(f1, s0), d = P(f1, s1), e = P(f0, s1);
    this.g.poly([a[0], a[1], b[0], b[1], d[0], d[1], e[0], e[1]]).fill(c);
  }
}

/** A marshal in an orange vest: a body pixel, a helmet pixel, and a leg that flickers while running. */
function marshal(f: Frame, x: number, y: number, now: number, running: boolean, arm = false) {
  f.px(x, y, 0xff7a1a);
  f.px(x, y - 1, 0xf4e9d0);
  if (running && Math.floor(now / 90) % 2) f.px(x + 1, y, 0x14111f, 0.7);
  if (arm) f.px(x + 1, y - 1, 0xff7a1a);
}

export function drawRecoveries(g: G, recs: Recovery[], debris: Debris[], track: TrackModel, tick: number, now: number, colourOf: (carId: string) => number, latOf: (carId: string) => number) {
  const f = new Frame(g, track);
  const L = track.length;
  for (const d of debris) {
    if (d.gone) continue;
    const a = f.at(d.at, d.lat);
    const hidden = d.pickStart >= 0 && tick > d.pickStart + (d.pickEnd - d.pickStart) * 0.55;
    if (!hidden) {
      const col = d.kind === "wheel" ? 0x1b1b24 : d.kind === "tyre" ? 0x15151c : d.kind === "wing" ? 0xe8e8ee : d.kind === "bodywork" ? 0x9aa0b4 : 0xd4a017;
      f.px(a.x, a.y, col);
      if (d.size >= 2) {
        f.px(a.x + 1, a.y, 0x3a3a46);
        f.px(a.x, a.y + 1, d.kind === "wing" ? 0xe63946 : d.kind === "wheel" ? 0xc8c8d4 : 0x555566);
      }
      if (d.size === 3) {
        f.px(a.x - 1, a.y + 1, 0xe8e8ee);
        f.px(a.x + 2, a.y - 1, 0x3a3a46);
      }
    }
    // the marshal who goes for it: from the post at the edge, to the piece, and back
    if (d.pickStart >= 0 && tick >= d.pickStart && tick <= d.pickEnd) {
      const p = clamp01((tick - d.pickStart) / (d.pickEnd - d.pickStart));
      const out = p < 0.45 ? ease(p / 0.45) : p < 0.6 ? 1 : 1 - ease((p - 0.6) / 0.4);
      const lat = lerp(d.side * 12, d.lat, out);
      const m = f.at(d.at - 3, lat);
      marshal(f, m.x, m.y, now, p < 0.45 || p > 0.6, p >= 0.45 && p < 0.6);
    }
  }
  for (const r of recs) {
    if (r.stage === "done") continue;
    const si = STAGES.indexOf(r.stage);
    const prog = clamp01((tick - r.stageStart) / Math.max(1, r.stageEnd - r.stageStart));
    const pd = poseDraw(r, tick);
    const base = latOf(r.carId);
    const carLat = base + pd.off * MPP * 0.8;
    const car = f.at(r.at, carLat);
    const colour = colourOf(r.carId);
    const flick = Math.floor(now / 110) % 2;

    // a car on its side or its back is drawn whole: the underside, the wheels in the air
    if (pd.custom) {
      const rolling = r.stage === "right" ? ease(prog) : 0;
      const h = car.h + pd.rot + rolling * 0.25 * r.side;
      if (r.pose === "back") {
        f.block(car.x, car.y, h, -3.4, 3.4, -1.9, 1.9, 0x3b3b48);
        f.block(car.x, car.y, h, -1.2, 2.2, -0.7, 0.7, 0x23232d);
        for (const fs of [2.5, -2.5]) for (const ss of [1.9, -1.9]) f.block(car.x, car.y, h, fs - 0.5, fs + 0.5, ss - 0.5, ss + 0.5, 0x8d8da0);
        f.block(car.x, car.y, h, 3.4, 4.2, -1.6, 1.6, 0x55556a);
      } else {
        const lean = 1 - rolling * 0.6;
        f.block(car.x, car.y, h, -3.4, 3.4, -0.9 * lean, 0.9 * lean, colour);
        f.block(car.x, car.y, h, -3.4, -2.6, -1.8, 1.8, 0x555566);
        for (const fs of [2.4, 0, -2.4]) f.block(car.x, car.y, h, fs - 0.5, fs + 0.5, r.side * 1.2 * lean, r.side * 2.0 * lean, 0x15151c);
      }
    }
    // marshals run to the car from the post behind it
    const nM = r.method === "crane" || r.pose === "back" ? 5 : 3;
    const crewAt = (k: number, sideShift: number, runP: number) => {
      const start = f.at(r.at - 40 - k * 3, r.side * 13);
      const end = f.at(r.at + (k - 1) * 1.6, base + sideShift);
      return { x: lerp(start.x, end.x, runP), y: lerp(start.y, end.y, runP) };
    };
    if (r.stage === "dispatch") {
      for (let k = 0; k < nM; k++) {
        const m = crewAt(k, k % 2 ? 2 : -2, ease(prog));
        marshal(f, m.x, m.y, now, true);
      }
    } else if (r.stage === "fire") {
      for (let k = 0; k < 2; k++) {
        const m = crewAt(k, k ? 3 : -3, 1);
        marshal(f, m.x, m.y, now, false, true);
        // the extinguisher: white spray towards the car
        if (flick) f.px(m.x + (car.x - m.x) * 0.5, m.y + (car.y - m.y) * 0.5, 0xffffff, 0.9);
      }
    } else if (r.stage === "check" || r.stage === "right" || r.stage === "driver_out" || r.stage === "sweep") {
      const n = r.stage === "right" ? nM : r.stage === "sweep" ? 2 : 3;
      for (let k = 0; k < n; k++) {
        const m = crewAt(k, (k % 2 ? 2.4 : -2.4), 1);
        if (r.stage === "sweep") {
          const sw = f.at(r.at + (k ? 6 : -6) + Math.sin(now / 260 + k) * 3, r.side * 4);
          marshal(f, sw.x, sw.y, now, true);
        } else marshal(f, m.x, m.y, now, r.stage === "right" && flick === 1);
      }
    }

    // the medical car comes up from the pit exit for a heavy hit, parks to shield the work, and goes back
    if (r.medical && si <= STAGES.indexOf("remove")) {
      let k: number;
      const start = track.pitOut + 20;
      const dist = mod(r.at - 14 - start, L);
      if (r.stage === "dispatch") k = ease(prog) * 0.9;
      else k = 1;
      const m = f.at(start + dist * Math.min(1, k), r.side * 5.5);
      f.block(m.x, m.y, m.h, -2.6, 2.6, -1.4, 1.4, 0xf4f1e8);
      f.block(m.x, m.y, m.h, -2.6, -1.2, -1.4, 1.4, 0xe63946);
      if (flick) f.px(m.x, m.y - 1, 0x4cc9f0);
    }

    // the driver: sits, climbs out, walks off and waves, or is treated
    if (r.stage === "driver_out") {
      const dx = f.at(r.at + 1, base + r.side * ease(Math.min(1, prog * 1.6)) * (r.medical ? 0 : 5));
      f.px(dx.x, dy(dx), colour);
      f.px(dx.x, dy(dx) - 1, colour);
      if (r.wave && prog > 0.5 && flick) f.px(dx.x + 1, dy(dx) - 2, colour);
      if (r.medical) {
        const doc = f.at(r.at + 2.5, r.side * 6.5);
        f.px(doc.x, doc.y, 0xffffff);
        f.px(doc.x, doc.y - 1, 0xf4e9d0);
        f.px(doc.x + 1, doc.y, 0x2a9d8f);
      }
    } else if (si > STAGES.indexOf("driver_out") && r.wave) {
      // already at the barrier, watching
      const dx = f.at(r.at + 1, r.side * 14);
      f.px(dx.x, dy(dx), colour);
      f.px(dx.x, dy(dx) - 1, colour);
    }

    // the removal
    if (r.stage === "remove") {
      if (r.method === "push") {
        for (let k = 0; k < 3; k++) {
          const m = f.at(r.at - 3.6 + k * 0.5, carLat - r.side * (3 - k * 1.2));
          marshal(f, m.x, m.y, now, true);
        }
      } else if (r.method === "tractor") {
        const tp = f.at(r.at - 9 + prog * 3, r.side * (11 + prog * 10));
        const ts = f.at(r.at, carLat);
        f.block(tp.x, tp.y, tp.h, -2.2, 2.2, -1.2, 1.2, 0xf9c74f);
        f.block(tp.x, tp.y, tp.h, 0.4, 1.4, -1.2, 1.2, 0x3a3a46);
        g.moveTo(tp.x, tp.y).lineTo(ts.x, ts.y).stroke({ width: 1, color: 0x222228, alpha: 0.9 });
      } else if (r.method === "crane") {
        const base = f.at(r.at - 5, r.side * 14);
        f.block(base.x, base.y, base.h, -3, 3, -1.8, 1.8, 0xf9c74f);
        f.block(base.x, base.y, base.h, -3, -1.5, -1.8, 1.8, 0x3a3a46);
        const tip = f.at(r.at, carLat);
        g.moveTo(base.x, base.y).lineTo(tip.x, tip.y - 2 * pd.lift).stroke({ width: 1, color: 0xf9c74f });
        g.moveTo(tip.x, tip.y - 2 * pd.lift).lineTo(tip.x, tip.y).stroke({ width: 1, color: 0x222228, alpha: 0.8 });
      }
    }
    // a damaged barrier gets a repair crew
    if (r.barrier && r.stage === "sweep") {
      for (let k = 0; k < 4; k++) {
        const m = f.at(r.at - 4 + k * 2.6, r.side * 15);
        marshal(f, m.x, m.y, now, false, flick === 1);
        if (flick && k === 1) f.px(m.x + 1, m.y + 1, 0xffe28a);
      }
    }
    // fire and smoke on the car until it is out
    if (pd.burning) {
      for (let k = 0; k < 9; k++) {
        const fxp = car.x + (Math.random() - 0.5) * 4;
        const fyp = car.y + (Math.random() - 0.5) * 3;
        f.px(fxp, fyp, Math.random() < 0.5 ? 0xff7a1a : 0xffd23f);
      }
      f.px(car.x + (Math.random() - 0.5) * 2, car.y - 2 - Math.random() * 2, 0x444450, 0.7);
    }
  }
}

function dy(p: { y: number }) {
  return p.y;
}
