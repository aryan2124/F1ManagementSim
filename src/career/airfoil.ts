/**
 * A small real 2D solver for the Sim Lab: a Hess-Smith panel method (constant-strength sources on every panel plus one
 * vortex shared by all of them, closed with the Kutta condition) on a NACA four digit section. It gives true pressure
 * coefficients along the chord and a lift coefficient, so a wing section the player draws behaves like a wing section.
 * It is a prototype: inviscid flow, with drag and stall added from simple closed form rules.
 */
export interface Section {
  /** Angle of attack in degrees. */
  alpha: number;
  /** Maximum camber as a fraction of the chord (0 to 0.09). */
  camber: number;
  /** Position of maximum camber (0.2 to 0.6). */
  pos: number;
  /** Thickness as a fraction of the chord (0.06 to 0.18). */
  thick: number;
}
export interface SectionResult {
  cl: number;
  cd: number;
  stalled: boolean;
  /** Chordwise positions and pressure coefficients, upper then lower surface, leading edge to trailing edge. */
  x: number[];
  cpUpper: number[];
  cpLower: number[];
  /** Section outline for drawing, upper and lower y at x. */
  yUpper: number[];
  yLower: number[];
  /** Lowest pressure coefficient (the suction peak). */
  cpMin: number;
}

function nacaPoints(m: number, p: number, t: number, n: number): { x: number[]; y: number[] } {
  // cosine spacing, trailing edge along the top to the leading edge and back along the bottom (counter clockwise)
  const xs: number[] = [];
  for (let i = 0; i <= n; i++) xs.push(0.5 * (1 - Math.cos((Math.PI * i) / n)));
  const camber = (x: number) => (m === 0 ? 0 : x < p ? (m / (p * p)) * (2 * p * x - x * x) : (m / ((1 - p) * (1 - p))) * (1 - 2 * p + 2 * p * x - x * x));
  const slope = (x: number) => (m === 0 ? 0 : x < p ? ((2 * m) / (p * p)) * (p - x) : ((2 * m) / ((1 - p) * (1 - p))) * (p - x));
  const thick = (x: number) => 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1036 * x * x * x * x);
  const up: [number, number][] = [];
  const lo: [number, number][] = [];
  for (const x of xs) {
    const th = Math.atan(slope(x));
    const yt = thick(x);
    up.push([x - yt * Math.sin(th), camber(x) + yt * Math.cos(th)]);
    lo.push([x + yt * Math.sin(th), camber(x) - yt * Math.cos(th)]);
  }
  const px: number[] = [];
  const py: number[] = [];
  for (let i = n; i >= 0; i--) { px.push(up[i][0]); py.push(up[i][1]); }
  for (let i = 1; i <= n; i++) { px.push(lo[i][0]); py.push(lo[i][1]); }
  return { x: px, y: py };
}

function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let piv = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(a[r][i]) > Math.abs(a[piv][i])) piv = r;
    [a[i], a[piv]] = [a[piv], a[i]];
    [b[i], b[piv]] = [b[piv], b[i]];
    for (let r = i + 1; r < n; r++) {
      const f = a[r][i] / a[i][i];
      if (!f) continue;
      for (let c = i; c < n; c++) a[r][c] -= f * a[i][c];
      b[r] -= f * b[i];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let c = i + 1; c < n; c++) s -= a[i][c] * x[c];
    x[i] = s / a[i][i];
  }
  return x;
}

const cache = new Map<string, SectionResult>();

export function solveSection(sec: Section, panelsPerSide = 40): SectionResult {
  const key = `${sec.alpha.toFixed(2)}|${sec.camber.toFixed(3)}|${sec.pos.toFixed(2)}|${sec.thick.toFixed(3)}|${panelsPerSide}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { x: px, y: py } = nacaPoints(sec.camber, sec.pos, sec.thick, panelsPerSide);
  const N = px.length - 1;
  const a = (sec.alpha * Math.PI) / 180;
  const cx: number[] = [], cy: number[] = [], th: number[] = [], len: number[] = [];
  for (let i = 0; i < N; i++) {
    const dx = px[i + 1] - px[i];
    const dy = py[i + 1] - py[i];
    cx.push((px[i] + px[i + 1]) / 2);
    cy.push((py[i] + py[i + 1]) / 2);
    th.push(Math.atan2(dy, dx));
    len.push(Math.hypot(dx, dy));
  }
  // influence of panel j on control point i, in the panel's own frame, returned as velocity in the i-th frame
  const infl = (i: number, j: number) => {
    const dx = cx[i] - px[j];
    const dy = cy[i] - py[j];
    const c = Math.cos(th[j]);
    const s = Math.sin(th[j]);
    const xi = dx * c + dy * s;
    const eta = -dx * s + dy * c;
    const l = len[j];
    let sx = 0, sy = 0;
    if (i === j) {
      sx = 0;
      sy = -0.5; // the outside of a counter clockwise panel is the minus side of its own frame, and a source pushes flow out
    } else {
      sx = (1 / (4 * Math.PI)) * Math.log((xi * xi + eta * eta) / ((xi - l) * (xi - l) + eta * eta));
      sy = (1 / (2 * Math.PI)) * (Math.atan2(eta, xi - l) - Math.atan2(eta, xi));
    }
    // vortex = source rotated a quarter turn
    const vx = -sy;
    const vy = sx;
    // back to the global frame
    const gsx = sx * c - sy * s, gsy = sx * s + sy * c;
    const gvx = vx * c - vy * s, gvy = vx * s + vy * c;
    return { gsx, gsy, gvx, gvy };
  };
  const nrm = (i: number): [number, number] => [Math.sin(th[i]), -Math.cos(th[i])];
  const tan = (i: number): [number, number] => [Math.cos(th[i]), Math.sin(th[i])];
  const A: number[][] = Array.from({ length: N + 1 }, () => new Array<number>(N + 1).fill(0));
  const B = new Array<number>(N + 1).fill(0);
  const vInf: [number, number] = [Math.cos(a), Math.sin(a)];
  const gammaCol: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    const [nx, ny] = nrm(i);
    let gx = 0, gy = 0;
    for (let j = 0; j < N; j++) {
      const f = infl(i, j);
      A[i][j] = f.gsx * nx + f.gsy * ny;
      gx += f.gvx;
      gy += f.gvy;
    }
    A[i][N] = gx * nx + gy * ny;
    gammaCol.push([gx, gy]);
    B[i] = -(vInf[0] * nx + vInf[1] * ny);
  }
  // Kutta: the tangential speeds on the first and last panels cancel
  const tangRow = (i: number, sign: number) => {
    const [tx, ty] = tan(i);
    for (let j = 0; j < N; j++) {
      const f = infl(i, j);
      A[N][j] += sign * (f.gsx * tx + f.gsy * ty);
    }
    A[N][N] += sign * (gammaCol[i][0] * tx + gammaCol[i][1] * ty);
    B[N] -= sign * (vInf[0] * tx + vInf[1] * ty);
  };
  tangRow(0, 1);
  tangRow(N - 1, 1);
  const sol = solve(A, B);
  const gamma = sol[N];
  const vt: number[] = [];
  for (let i = 0; i < N; i++) {
    const [tx, ty] = tan(i);
    let vx = vInf[0], vy = vInf[1];
    for (let j = 0; j < N; j++) {
      const f = infl(i, j);
      vx += sol[j] * f.gsx + gamma * f.gvx;
      vy += sol[j] * f.gsy + gamma * f.gvy;
    }
    vt.push(vx * tx + vy * ty);
  }
  const cp = vt.map((v) => 1 - v * v);
  let circ = 0;
  for (let i = 0; i < N; i++) circ += gamma * len[i];
  // sign: counter clockwise order with positive vortex gives negative lift in this frame, so flip
  const cl = -2 * circ;
  const half = panelsPerSide;
  const x: number[] = [], cpU: number[] = [], cpL: number[] = [], yU: number[] = [], yL: number[] = [];
  for (let k = 0; k < half; k++) {
    // upper surface runs trailing edge to leading edge, so read it backwards
    const iu = half - 1 - k;
    const il = half + k;
    x.push((cx[iu] + cx[il]) / 2);
    cpU.push(cp[iu]);
    cpL.push(cp[il]);
    yU.push(cy[iu]);
    yL.push(cy[il]);
  }
  const cpMin = Math.min(...cp);
  // closed form viscous touches: friction plus induced style growth, and a stall once the suction peak is too strong
  const stalled = cpMin < -4.2 - 18 * sec.camber || sec.alpha > 14 + 80 * sec.camber;
  const clOut = stalled ? cl * 0.62 : cl;
  const cd = 0.008 + 0.06 * sec.thick + 0.012 * clOut * clOut + (stalled ? 0.09 : 0);
  const res: SectionResult = { cl: clOut, cd, stalled, x, cpUpper: cpU, cpLower: cpL, yUpper: yU, yLower: yL, cpMin };
  if (cache.size > 400) cache.clear();
  cache.set(key, res);
  return res;
}
