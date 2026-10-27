import type { Graphics } from "pixi.js";

/**
 * The pit crew, drawn procedurally in world pixels around a stopped car (one world pixel is about 1.2 m).
 * Everything is keyframed from the stop's progress, 0 to 1:
 *   0.00 to 0.14  crew run in from the pit wall to their corners
 *   0.14 to 0.30  jacks go up, the car lifts
 *   0.30 to 0.72  wheel guns flash at the four corners, old wheels come off, new wheels go on
 *   0.72 to 0.86  jacks drop, guns go up
 *   0.86 to 1.00  crew step back and the lollipop is raised to release the car
 * A slow stop (a fumbled wheel) keeps one corner flashing past the end.
 */

const ease = (x: number) => x * x * (3 - 2 * x);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** How high the car sits on the jacks, 0 to 1. */
export function lift(p: number): number {
  return ease(clamp01((p - 0.14) / 0.16)) * (1 - ease(clamp01((p - 0.72) / 0.14)));
}

interface Man { fx: number; sx: number; kind: "wheel" | "jackF" | "jackR" | "lolly" | "fire"; corner?: number }

// positions in car-local units, forward then sideways (world pixels): the car is about 4.6 long and 1.8 wide
const CREW: Man[] = [
  { fx: 1.6, sx: 1.9, kind: "wheel", corner: 0 },
  { fx: 1.6, sx: -1.9, kind: "wheel", corner: 1 },
  { fx: -1.6, sx: 1.9, kind: "wheel", corner: 2 },
  { fx: -1.6, sx: -1.9, kind: "wheel", corner: 3 },
  { fx: 3.6, sx: 0, kind: "jackF" },
  { fx: -3.6, sx: 0, kind: "jackR" },
  { fx: 5.4, sx: 2.6, kind: "lolly" },
  { fx: -0.2, sx: -3.2, kind: "fire" },
];

export function drawCrew(g: Graphics, x: number, y: number, heading: number, p: number, colour: number, now: number, slow: boolean, wheelsOff: boolean[]) {
  const fx = Math.cos(heading);
  const fy = Math.sin(heading);
  const rx = -fy;
  const ry = fx;
  const at = (f: number, s: number) => ({ x: x + fx * f + rx * s, y: y + fy * f + ry * s });
  const run = ease(clamp01(p / 0.14));
  const back = ease(clamp01((p - 0.86) / 0.14));
  const flick = Math.floor(now / 70) % 2;
  for (const m of CREW) {
    // walk in from the pit wall (further out to the side), step back at the end
    const out = (1 - run) * 6 + back * 3;
    const side = m.sx === 0 ? 0 : Math.sign(m.sx) * out;
    const end = m.kind === "jackF" ? 1 : m.kind === "jackR" ? -1 : 0;
    const pos = at(m.fx + end * out * 0.5, m.sx + side + (m.sx === 0 ? out * 0.6 : 0));
    const px = Math.round(pos.x);
    const py = Math.round(pos.y);
    const stride = run < 1 || back > 0 ? Math.floor(now / 90) % 2 : 0;
    // body in the team colour, helmet pixel above it, legs flicker while moving
    g.rect(px, py, 1, 1).fill(colour);
    g.rect(px, py - 1, 1, 1).fill(0xf4e9d0);
    if (stride) g.rect(px + 1, py, 1, 1).fill({ color: 0x14111f, alpha: 0.7 });
    if (m.kind === "wheel" && p >= 0.3 && p < (slow && m.corner === 3 ? 1 : 0.72)) {
      // the gun: a bright flash beside the wheel, and sparks of dust
      const gun = at(m.fx + (m.sx > 0 ? 0 : 0), m.sx * 0.55);
      if (flick) g.rect(Math.round(gun.x), Math.round(gun.y), 1, 1).fill(0xffe28a);
    }
    if (m.kind === "wheel" && p >= 0.4 && p < 0.72) {
      // the old wheel rolls out of the way once the nut is off
      const w = at(m.fx, m.sx * 1.35 + Math.sign(m.sx) * ease((p - 0.4) / 0.32) * 1.2);
      g.rect(Math.round(w.x), Math.round(w.y), 1, 1).fill(0x222228);
      wheelsOff[m.corner ?? 0] = true;
    }
    if ((m.kind === "jackF" || m.kind === "jackR") && lift(p) > 0.05) {
      // the jack arm reaches under the nose or tail
      const j = at(m.fx - end * 0.9, 0);
      g.rect(Math.round(j.x), Math.round(j.y), 1, 1).fill(0xffd23f);
    }
    if (m.kind === "lolly") {
      // the lollipop: held down while the stop runs, raised for the release, and red then green
      const up = p > 0.9;
      const stick = at(m.fx, m.sx);
      g.rect(Math.round(stick.x), Math.round(stick.y) - 2, 1, 2).fill(0xdddddd);
      g.rect(Math.round(stick.x) - 1, Math.round(stick.y) - 3, 3, 1).fill(up ? 0x57cc99 : 0xe63946);
    }
    if (m.kind === "fire" && p > 0.05 && p < 0.95) g.rect(px - 1, py, 1, 1).fill(0xe63946);
  }
  // fresh wheels fitted: a quick white pop on the last gun
  if (p > 0.72 && p < 0.78) for (let c = 0; c < 4; c++) {
    const w = at(c < 2 ? 1.6 : -1.6, c % 2 ? -1.35 : 1.35);
    g.rect(Math.round(w.x), Math.round(w.y), 1, 1).fill(0xffffff);
  }
}
