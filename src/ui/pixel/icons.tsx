import type { CSSProperties } from "react";
import type { Category } from "../../career/modules";
import { Grid, PAL, arrowD, arrowL, arrowR, arrowU, gridRects } from "./grid";

/** 16x16 pixel icons, one per regulation module, plus department icons.
 *  Each icon is a string-array pixel map (see ICON_MAPS). The maps are composed once at load from
 *  a few shared motifs (wing, tyre, battery, flag, coin, headset...) plus a modifier that makes each unique. */

export const CATEGORY_COLOR: Record<Category, string> = {
  Aero: "#4a9bf0",
  Power: "#f9c74f",
  Tyres: "#e63946",
  "Race format": "#ff7a1a",
  Communication: "#2ec4b6",
  Operations: "#9a8fbf",
  Financial: "#57cc99",
  Chassis: "#b66cff",
  "Pit lane": "#ff9a4a",
  Scoring: "#f4e9d0",
  Qualifying: "#7ad7ff",
  People: "#ff8fb8",
};

// ---------- shared motifs ----------

function tyre(g: Grid, cx: number, cy: number, r: number, ring: string) {
  g.disc(cx, cy, r, "m");
  g.ring(cx, cy, r - 1, ring, 1.3);
  g.disc(cx, cy, Math.max(1, r - 3), "s");
  g.disc(cx, cy, 0.3, "k");
}
function battery(g: Grid, x: number, y: number, w: number, h: number, fill = "n") {
  g.r(x + Math.floor(w / 2) - 1, y - 2, 3, 2, "d");
  g.r(x, y, w, h, "d");
  g.r(x + 1, y + 1, w - 2, h - 2, fill);
}
function drop(g: Grid, x: number, y: number, ch: string) {
  g.p(x + 3, y, ch).r(x + 2, y + 1, 3, 2, ch).r(x + 1, y + 3, 5, 2, ch).r(x, y + 5, 7, 3, ch).r(x + 1, y + 8, 5, 1, ch);
  g.p(x + 2, y + 6, "w");
}
function carSide(g: Grid, x: number, y: number, body: string) {
  g.r(x, y, 3, 1, "d"); // rear wing
  g.r(x + 1, y + 1, 1, 3, "d");
  g.r(x + 2, y + 2, 10, 2, body); // body
  g.r(x + 6, y + 1, 2, 1, "w"); // helmet
  g.r(x + 11, y + 3, 3, 1, body); // nose
  g.r(x + 12, y + 4, 2, 1, "d"); // front wing
  g.r(x + 2, y + 3, 3, 3, "m"); // rear wheel
  g.r(x + 9, y + 4, 3, 2, "m"); // front wheel
}
function headset(g: Grid, band = "d", cup = "t") {
  g.ring(7.5, 7, 5.5, band, 1.4);
  g.r(0, 9, 16, 7, ".");
  for (let y = 8; y < 16; y++) for (let x = 0; x < 16; x++) if (g.c[y][x] !== ".") g.c[y][x] = ".";
  g.r(1, 6, 3, 6, cup).r(12, 6, 3, 6, cup);
  g.r(1, 6, 1, 6, "w");
  g.l(3, 12, 6, 14, "d");
  g.r(6, 14, 3, 1, "d");
}
function flag(g: Grid, x: number, y: number, w: number, h: number, a: string, b: string) {
  g.r(x - 1, y, 1, h + 5, "d");
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) g.p(x + i, y + j, (i + j) % 2 === 0 ? a : b);
}
function coin(g: Grid, cx: number, cy: number, r: number) {
  g.disc(cx, cy, r, "h").disc(cx, cy, r - 1, "y");
  g.p(cx - r + 1, cy - 1, "w");
}
function stopwatch(g: Grid, cx: number, cy: number, r: number) {
  g.r(cx - 1, cy - r - 2, 3, 2, "d");
  g.disc(cx, cy, r, "d").disc(cx, cy, r - 1, "w");
  g.l(cx, cy, cx, cy - r + 2, "k").l(cx, cy, cx + 2, cy + 1, "r");
}
function lock(g: Grid, x: number, y: number, body: string) {
  g.r(x + 1, y - 3, 1, 3, "d").r(x + 4, y - 3, 1, 3, "d").r(x + 1, y - 4, 4, 1, "d");
  g.r(x, y, 6, 5, body);
  g.p(x + 2, y + 1, "k").p(x + 3, y + 1, "k").p(x + 2, y + 2, "k").p(x + 3, y + 2, "k").p(x + 2, y + 3, "k");
}
function trophy(g: Grid) {
  g.r(4, 1, 8, 5, "y").r(5, 6, 6, 2, "y").r(7, 8, 2, 3, "y").r(4, 11, 8, 2, "h");
  g.r(2, 2, 2, 3, "y").r(12, 2, 2, 3, "y");
  g.p(5, 2, "w").p(5, 3, "w");
}
function cloud(g: Grid, x: number, y: number) {
  g.disc(x + 3, y + 3, 2.5, "l").disc(x + 7, y + 2, 3, "l").disc(x + 10, y + 4, 2.2, "l").r(x + 2, y + 4, 9, 2, "l");
}
function heart(g: Grid, x: number, y: number, ch: string) {
  g.r(x + 1, y, 2, 1, ch).r(x + 4, y, 2, 1, ch).r(x, y + 1, 7, 2, ch).r(x + 1, y + 3, 5, 1, ch).r(x + 2, y + 4, 3, 1, ch).p(x + 3, y + 5, ch);
}
function gear(g: Grid, cx: number, cy: number, r: number, ch: string, hole = "n") {
  g.disc(cx, cy, r, ch);
  g.r(cx - 1, cy - r - 1, 3, 2, ch).r(cx - 1, cy + r, 3, 2, ch).r(cx - r - 1, cy - 1, 2, 3, ch).r(cx + r, cy - 1, 2, 3, ch);
  const o = Math.round(r * 0.75);
  g.r(cx - o - 1, cy - o - 1, 2, 2, ch).r(cx + o, cy - o - 1, 2, 2, ch).r(cx - o - 1, cy + o, 2, 2, ch).r(cx + o, cy + o, 2, 2, ch);
  g.disc(cx, cy, Math.max(1, r - 3), hole);
}
function shield(g: Grid, ch: string) {
  g.r(2, 1, 12, 2, ch).r(2, 3, 12, 5, ch).r(3, 8, 10, 2, ch).r(4, 10, 8, 2, ch).r(5, 12, 6, 1, ch).r(6, 13, 4, 1, ch);
  g.r(2, 1, 12, 1, "w");
}

type Draw = (g: Grid) => void;

const DRAW: Record<string, Draw> = {
  // ----- Aero -----
  activeWings: (g) => {
    g.r(1, 3, 1, 9, "d").r(14, 3, 1, 9, "d");
    g.r(2, 10, 12, 2, "t");
    g.l(2, 7, 13, 4, "h", 1).l(2, 8, 13, 5, "h", 1);
    g.r(7, 12, 2, 3, "s");
    g.p(6, 1, "y").p(9, 1, "y").p(7, 0, "y").p(8, 0, "y");
  },
  groundEffect: (g) => {
    g.r(1, 2, 14, 3, "b").r(5, 1, 5, 1, "w");
    g.r(0, 5, 16, 2, "s");
    g.r(3, 7, 3, 1, "k").r(10, 7, 3, 1, "k");
    arrowR(g, 1, 9, 12, "t");
    arrowR(g, 3, 12, 10, "t");
    g.r(0, 15, 16, 1, "d");
  },
  specFloor: (g) => {
    for (let i = 0; i < 5; i++) g.r(6 - i, 2 + i, 9, 1, i === 0 ? "w" : "d");
    g.r(2, 7, 9, 1, "s");
    g.p(7, 11, "g").p(8, 12, "g").p(9, 13, "g").p(10, 12, "g").p(11, 11, "g").p(12, 10, "g").p(13, 9, "g");
    g.p(7, 10, "g").p(8, 11, "g").p(9, 12, "g").p(10, 11, "g").p(11, 10, "g").p(12, 9, "g").p(13, 8, "g");
  },
  shrunkCars: (g) => {
    g.r(5, 6, 6, 3, "r").r(10, 7, 2, 2, "r").r(7, 5, 2, 1, "w");
    g.r(5, 9, 2, 2, "m").r(9, 9, 2, 2, "m");
    arrowR(g, 0, 7, 3, "t");
    arrowL(g, 15, 7, 3, "t");
    arrowD(g, 8, 0, 2, "t");
    g.r(1, 13, 14, 1, "d");
  },
  // ----- Power -----
  deployMaps: (g) => {
    battery(g, 3, 3, 10, 11);
    g.r(5, 10, 2, 2, "g").r(7, 8, 2, 4, "y").r(9, 6, 2, 6, "h");
    g.p(5, 5, "t").p(6, 5, "t").p(7, 5, "t");
  },
  fuelFlow: (g) => {
    g.r(0, 8, 16, 3, "s").r(0, 8, 16, 1, "d");
    g.r(7, 4, 2, 4, "d").r(5, 3, 6, 2, "r");
    g.r(2, 9, 3, 1, "y").r(7, 9, 4, 1, "y");
    g.p(3, 12, "y").p(3, 13, "y").p(8, 12, "y").p(8, 14, "y").p(12, 12, "y").p(12, 13, "y");
  },
  enginePackages: (g) => {
    g.r(2, 9, 12, 5, "s").r(2, 9, 12, 1, "d");
    g.r(3, 5, 2, 4, "d").r(7, 5, 2, 4, "d").r(11, 5, 2, 4, "d");
    g.r(3, 3, 2, 2, "h").r(7, 3, 2, 2, "t").r(11, 3, 2, 2, "y");
    g.r(0, 11, 2, 2, "r").r(14, 11, 2, 2, "d");
  },
  batterySwap: (g) => {
    battery(g, 1, 5, 5, 9, "g");
    battery(g, 10, 5, 5, 9, "n");
    arrowR(g, 6, 7, 3, "t");
    arrowL(g, 9, 11, 3, "h");
  },
  fuelCredits: (g) => {
    drop(g, 1, 2, "g");
    coin(g, 11, 11, 4);
    g.text(10, 9, "1", "h");
  },
  // ----- Tyres -----
  tyreLottery: (g) => {
    tyre(g, 5, 9, 5, "r");
    g.text(10, 1, "?", "y");
    g.r(10, 8, 5, 5, "w").p(11, 9, "k").p(13, 9, "k").p(12, 10, "k").p(11, 11, "k").p(13, 11, "k");
  },
  oneCompound: (g) => {
    tyre(g, 7, 7, 6, "y");
    g.text(6, 5, "1", "k");
  },
  coldTyres: (g) => {
    tyre(g, 7, 7, 6, "b");
    g.p(7, 4, "l").p(7, 5, "l").p(7, 9, "l").p(7, 10, "l").p(4, 7, "l").p(5, 7, "l").p(9, 7, "l").p(10, 7, "l").p(7, 7, "w");
    g.p(5, 5, "l").p(9, 5, "l").p(5, 9, "l").p(9, 9, "l");
  },
  // ----- Race format -----
  twoHeat: (g) => {
    flag(g, 3, 1, 4, 4, "w", "k");
    flag(g, 10, 1, 4, 4, "r", "y");
    g.text(6, 10, "2", "h");
  },
  reverseGrid: (g) => {
    g.r(1, 1, 5, 3, "y").r(1, 5, 5, 3, "h").r(1, 9, 5, 3, "r");
    arrowD(g, 8, 1, 10, "t");
    arrowU(g, 13, 13, 11, "g");
  },
  pushToPass: (g) => {
    g.disc(7, 7, 6, "r").ring(7, 7, 6, "h", 1.2);
    g.l(3, 4, 6, 7, "w").l(6, 7, 3, 10, "w").l(7, 4, 10, 7, "w").l(10, 7, 7, 10, "w");
    g.p(3, 3, "w");
  },
  successBallast: (g) => {
    g.ring(7.5, 4, 3.5, "d", 1.6);
    g.r(2, 7, 11, 1, "d");
    g.disc(7, 10, 5.5, "s", 4.5).r(2, 7, 11, 2, "d");
    g.r(1, 12, 13, 1, "s");
    g.text(4, 8, "KG", "w");
    g.p(3, 9, "w");
    arrowD(g, 14, 1, 4, "r");
  },
  // ----- Communication -----
  openRadio: (g) => {
    headset(g, "d", "t");
    g.r(5, 7, 1, 3, "g").r(7, 4, 1, 9, "g").r(9, 6, 1, 5, "g");
  },
  radioQuota: (g) => {
    headset(g, "d", "p");
    g.text(6, 4, "3", "y");
    g.r(5, 10, 6, 1, "y");
  },
  // ----- Operations -----
  parcFerme: (g) => {
    lock(g, 3, 8, "y");
    g.r(3, 8, 6, 5, "y");
    g.r(0, 14, 16, 1, "d");
  },
  inSeasonTesting: (g) => {
    g.r(7, 1, 2, 2, "h").r(6, 3, 4, 2, "h").r(5, 5, 6, 2, "h").r(4, 7, 8, 2, "h").r(3, 9, 10, 2, "h");
    g.r(6, 4, 4, 1, "w").r(5, 7, 6, 1, "w");
    g.r(1, 11, 14, 2, "d");
    g.p(14, 3, "y").p(13, 2, "y").p(14, 1, "y");
  },
  // ----- Financial -----
  talentCap: (g) => {
    g.r(1, 0, 14, 2, "r");
    arrowD(g, 3, 2, 2, "r");
    g.disc(7, 6, 3, "y").r(5, 5, 1, 1, "k").r(9, 5, 1, 1, "k");
    g.r(3, 10, 10, 4, "t").r(6, 9, 4, 1, "t");
    g.r(0, 14, 16, 1, "d");
  },
  tunnelBank: (g) => {
    g.r(0, 1, 16, 8, "s").r(1, 2, 14, 6, "n");
    g.r(3, 3, 1, 4, "d").r(2, 4, 3, 1, "d");
    g.r(7, 4, 6, 1, "t").r(6, 6, 8, 1, "t");
    g.r(3, 11, 6, 2, "y").r(3, 13, 6, 2, "h").r(10, 12, 5, 2, "y").r(10, 14, 5, 1, "h");
  },
  openBooks: (g) => {
    g.r(1, 3, 7, 10, "w").r(8, 3, 7, 10, "w").r(7, 3, 2, 10, "d");
    g.r(2, 5, 4, 1, "d").r(2, 7, 4, 1, "d").r(2, 9, 4, 1, "d").r(2, 11, 3, 1, "d");
    coin(g, 11, 7, 2);
    g.r(10, 11, 4, 1, "g");
  },
  customerParts: (g) => {
    g.r(1, 6, 9, 8, "o").r(1, 6, 9, 2, "d").r(4, 6, 3, 8, "y");
    coin(g, 12, 4, 3);
    g.text(11, 2, "$", "k");
    arrowL(g, 15, 11, 3, "g");
  },
  // ----- Chassis -----
  frozenChassis: (g) => {
    carSide(g, 1, 6, "l");
    g.p(4, 12, "l").p(4, 13, "l").p(9, 12, "l").p(9, 13, "l").p(9, 14, "l").p(12, 12, "l");
    g.p(8, 1, "w").p(8, 2, "w").p(8, 3, "w").p(7, 2, "w").p(9, 2, "w").p(6, 1, "b").p(10, 3, "b").p(6, 3, "b").p(10, 1, "b");
  },
  driverAids: (g) => {
    g.r(1, 4, 14, 9, "s").r(2, 3, 12, 1, "s").r(0, 6, 2, 5, "k");
    g.r(14, 6, 2, 5, "k");
    g.r(4, 5, 8, 3, "t").r(5, 6, 6, 1, "n");
    g.p(4, 10, "r").p(6, 10, "y").p(9, 10, "g").p(11, 10, "b");
    g.p(7, 12, "h").p(8, 12, "h");
    g.p(14, 1, "y").p(14, 3, "y").p(13, 2, "y").p(15, 2, "y");
  },
  moveableBallast: (g) => {
    carSide(g, 1, 8, "b");
    g.r(2, 1, 12, 1, "t").p(1, 1, "t").p(14, 1, "t").p(2, 0, "t").p(2, 2, "t").p(13, 0, "t").p(13, 2, "t");
    g.r(6, 3, 4, 3, "d").r(6, 3, 4, 1, "w").r(7, 6, 2, 1, "d");
  },
  stdGearbox: (g) => {
    gear(g, 7, 7, 5, "d");
    g.text(6, 5, "H", "w");
  },
  // ----- Race format cont -----
  scheduledSC: (g) => {
    carSide(g, 1, 6, "y");
    g.r(5, 4, 2, 1, "r").r(7, 4, 2, 1, "b");
    g.p(6, 3, "r").p(7, 3, "b");
    g.text(3, 11, "SC", "y");
  },
  stopWindow: (g) => {
    g.r(1, 1, 14, 11, "s").r(2, 2, 12, 9, "n");
    tyre(g, 8, 6, 3, "r");
    g.r(1, 13, 14, 2, "d").r(5, 13, 6, 2, "g");
  },
  defenceTokens: (g) => {
    shield(g, "b");
    coin(g, 7, 7, 2.5);
  },
  standingRestarts: (g) => {
    g.r(0, 1, 16, 2, "d");
    for (let i = 0; i < 5; i++) g.r(i * 3 + 1, 4, 2, 3, "r").r(i * 3 + 1, 8, 2, 3, i < 3 ? "e" : "r");
    g.p(1, 4, "w").p(4, 4, "w").p(7, 4, "w").p(10, 4, "w").p(13, 4, "w");
    g.r(0, 13, 16, 2, "s");
  },
  stageRacing: (g) => {
    g.r(1, 10, 4, 4, "t").r(6, 7, 4, 7, "g").r(11, 4, 4, 10, "y");
    flag(g, 12, 0, 3, 3, "w", "k");
    g.p(2, 11, "w").p(7, 8, "w");
  },
  timedFinish: (g) => {
    g.r(2, 0, 12, 2, "d").r(2, 14, 12, 2, "d");
    for (let i = 0; i < 6; i++) {
      g.r(3 + i, 2 + i, 10 - 2 * i, 1, "l");
      g.r(3 + (5 - i), 8 + i, 10 - 2 * (5 - i), 1, "l");
    }
    g.r(6, 5, 4, 1, "y").r(7, 6, 2, 2, "y").r(5, 12, 6, 2, "y").r(7, 8, 2, 4, "y");
  },
  checkpointCuts: (g) => {
    g.l(4, 1, 11, 9, "w", 2).l(12, 1, 5, 9, "d", 2);
    g.ring(4, 12, 2.5, "r", 1.5).ring(12, 12, 2.5, "r", 1.5);
    g.p(0, 4, "y").p(2, 4, "y").p(13, 4, "y").p(15, 4, "y");
  },
  handicapStart: (g) => {
    g.r(0, 1, 6, 3, "y").r(5, 6, 6, 3, "h").r(10, 11, 6, 3, "r");
    g.r(8, 1, 1, 1, "d").r(10, 1, 1, 1, "d").r(12, 1, 1, 1, "d").r(14, 1, 1, 1, "d");
    g.text(1, 6, "+", "t");
  },
  weatherCard: (g) => {
    g.disc(12, 3, 2.5, "y");
    cloud(g, 2, 3);
    g.p(4, 11, "b").p(4, 12, "b").p(8, 12, "b").p(8, 13, "b").p(12, 11, "b").p(12, 12, "b").p(6, 14, "b").p(10, 14, "b");
  },
  fanVote: (g) => {
    g.r(5, 1, 6, 6, "w").p(6, 3, "g").p(7, 4, "g").p(8, 3, "g").p(9, 2, "g");
    g.r(2, 7, 12, 8, "p").r(5, 7, 6, 1, "k");
    heart(g, 5, 9, "r");
  },
  formatSplit: (g) => {
    g.r(7, 10, 2, 5, "w");
    g.l(7, 10, 3, 4, "t", 2).l(9, 10, 13, 4, "h", 2);
    g.r(1, 1, 4, 1, "t").r(1, 2, 1, 3, "t").r(11, 1, 4, 1, "h").r(14, 2, 1, 3, "h");
  },
  // ----- Pit lane -----
  refuelling: (g) => {
    g.r(1, 2, 8, 12, "r").r(2, 3, 6, 4, "g").r(2, 3, 6, 1, "w");
    g.r(2, 9, 6, 1, "k");
    g.r(9, 4, 3, 1, "d").r(11, 5, 1, 6, "d").r(10, 11, 3, 3, "s");
    g.r(0, 14, 10, 1, "d");
  },
  fixedStop: (g) => {
    stopwatch(g, 7, 8, 5);
    g.r(12, 1, 3, 1, "y").r(12, 3, 3, 1, "y");
    g.p(3, 12, "r").p(11, 12, "r");
  },
  // ----- Operations -----
  tyrePool: (g) => {
    g.r(2, 1, 12, 4, "m").r(2, 6, 12, 4, "m").r(2, 11, 12, 4, "m");
    g.r(3, 2, 10, 1, "r").r(3, 7, 10, 1, "y").r(3, 12, 10, 1, "w");
    g.r(2, 1, 2, 1, "s").r(2, 6, 2, 1, "s").r(2, 11, 2, 1, "s");
  },
  upgradeQuota: (g) => {
    arrowU(g, 7, 7, 7, "g");
    g.r(8, 1, 1, 1, "g");
    g.r(1, 8, 14, 7, "o").r(1, 8, 14, 2, "d").r(6, 8, 4, 7, "y");
    g.r(2, 12, 2, 2, "t").r(12, 12, 2, 2, "t");
  },
  // ----- Scoring -----
  lapLed: (g) => {
    g.r(2, 2, 12, 12, "s").r(4, 4, 8, 8, "n");
    g.p(2, 2, ".").p(13, 2, ".").p(2, 13, ".").p(13, 13, ".");
    g.text(6, 5, "1", "y");
    g.r(5, 0, 4, 3, "r").r(5, 0, 4, 1, "w");
    g.r(11, 12, 4, 1, "g").p(13, 11, "g");
  },
  bestCar: (g) => {
    trophy(g);
    g.text(7, 2, "1", "h");
    g.r(5, 14, 6, 1, "r");
  },
  playoff: (g) => {
    g.r(0, 2, 4, 1, "t").r(0, 6, 4, 1, "t").r(3, 2, 1, 5, "t").r(3, 4, 3, 1, "t");
    g.r(0, 10, 4, 1, "s").r(0, 14, 4, 1, "s").r(3, 10, 1, 5, "s").r(3, 12, 3, 1, "s");
    g.r(5, 4, 1, 1, "t").r(5, 5, 1, 3, "t");
    g.r(5, 8, 5, 1, "t");
    g.r(5, 8, 1, 4, "t");
    g.r(10, 6, 5, 5, "y").r(11, 7, 3, 3, "h");
    g.p(8, 13, "r").p(10, 13, "r").p(12, 13, "r").p(14, 13, "r");
  },
  // ----- Qualifying -----
  aggregateQuali: (g) => {
    g.r(3, 1, 10, 2, "t").r(3, 13, 10, 2, "t");
    g.l(3, 3, 8, 7, "t", 2).l(8, 8, 3, 12, "t", 2);
    g.r(10, 3, 3, 3, "y");
    g.p(12, 5, "n");
  },
  singleShot: (g) => {
    g.ring(7, 7, 5, "r", 1.4);
    g.r(7, 0, 1, 4, "r").r(7, 11, 1, 4, "r").r(0, 7, 4, 1, "r").r(11, 7, 4, 1, "r");
    g.p(7, 7, "y").p(6, 7, "y").p(8, 7, "y").p(7, 6, "y").p(7, 8, "y");
    g.text(12, 11, "1", "w");
  },
  qualiTyreLock: (g) => {
    tyre(g, 6, 6, 5, "r");
    lock(g, 9, 9, "y");
  },
  // ----- People -----
  rookieRule: (g) => {
    g.r(1, 1, 14, 14, "g").r(2, 2, 12, 12, "w");
    g.r(3, 3, 10, 10, "g");
    g.text(6, 5, "R", "w");
  },
};

// ---------- department icons ----------

export type DeptKind = "tunnel" | "simulator" | "factory" | "academy" | "cash" | "cap" | "board" | "fans" | "sponsor" | "media" | "calendar" | "rules" | "people" | "car";

const DEPT: Record<DeptKind, Draw> = {
  tunnel: (g) => {
    g.r(0, 2, 16, 12, "s").r(1, 3, 14, 10, "n");
    g.r(1, 5, 1, 6, "d").r(2, 4, 2, 1, "d").r(2, 10, 2, 1, "d").r(0, 7, 4, 2, "d");
    g.r(6, 6, 6, 3, "r").r(8, 5, 2, 1, "w").r(12, 7, 2, 1, "r");
    g.r(5, 4, 8, 1, "t").r(5, 11, 8, 1, "t").r(4, 9, 1, 1, "t");
    g.r(14, 4, 1, 1, "t").r(14, 11, 1, 1, "t");
  },
  simulator: (g) => {
    g.r(1, 1, 14, 8, "s").r(2, 2, 12, 6, "n");
    g.l(8, 2, 5, 7, "d").l(8, 2, 11, 7, "d").r(7, 4, 2, 1, "y").r(7, 6, 2, 1, "y");
    g.r(6, 9, 4, 1, "d");
    g.disc(7.5, 12, 2.5, "d").disc(7.5, 12, 1, "r");
    g.r(1, 14, 14, 1, "o");
  },
  factory: (g) => {
    g.r(1, 6, 14, 8, "s");
    g.r(1, 4, 4, 2, "s").r(5, 4, 1, 2, "s");
    g.l(1, 6, 3, 3, "s").l(5, 6, 7, 3, "s");
    g.r(11, 1, 3, 5, "d");
    g.r(11, 0, 3, 1, "r");
    g.r(3, 8, 2, 2, "y").r(7, 8, 2, 2, "y").r(11, 8, 2, 2, "y");
    g.r(6, 11, 4, 3, "k");
  },
  academy: (g) => {
    g.l(0, 5, 8, 2, "k", 1);
    g.r(0, 5, 16, 1, "k").r(2, 4, 12, 1, "k").r(4, 3, 8, 1, "k").r(6, 2, 4, 1, "k");
    g.r(0, 5, 16, 1, "n").r(2, 4, 12, 1, "n").r(4, 3, 8, 1, "n").r(6, 2, 4, 1, "n").r(2, 6, 12, 1, "n");
    g.r(4, 7, 8, 4, "n").r(5, 7, 6, 1, "d");
    g.r(14, 6, 1, 6, "y").r(13, 12, 3, 2, "y");
  },
  cash: (g) => {
    g.r(0, 3, 16, 10, "g").r(1, 4, 14, 8, "n").r(2, 5, 12, 6, "g");
    g.disc(7.5, 8, 2.5, "y");
    g.text(6, 6, "$", "k");
    g.p(3, 6, "w").p(12, 10, "w");
  },
  cap: (g) => {
    g.r(0, 2, 16, 2, "r");
    arrowD(g, 3, 4, 2, "r");
    arrowD(g, 12, 4, 2, "r");
    g.disc(7.5, 10, 4, "h").disc(7.5, 10, 3, "y");
    g.text(6, 8, "$", "k");
  },
  board: (g) => {
    g.r(0, 1, 16, 9, "w").r(1, 2, 14, 7, "n");
    g.r(2, 7, 2, 1, "t").r(5, 5, 2, 3, "g").r(8, 4, 2, 4, "y").r(11, 3, 2, 5, "h");
    g.r(7, 10, 2, 2, "d");
    g.r(4, 12, 8, 1, "d").r(3, 13, 2, 2, "d").r(11, 13, 2, 2, "d");
  },
  fans: (g) => {
    g.disc(4, 11, 2, "y").disc(8, 11, 2, "t").disc(12, 11, 2, "p");
    g.r(1, 13, 14, 2, "n");
    g.r(8, 2, 1, 6, "d").r(9, 2, 5, 3, "r").p(10, 3, "w").p(12, 3, "w");
    g.r(2, 1, 1, 4, "y").p(3, 1, "y").p(1, 1, "y");
  },
  sponsor: (g) => {
    g.r(0, 2, 16, 9, "d").r(1, 3, 14, 7, "r");
    g.l(8, 4, 8, 4, "y").r(7, 4, 2, 5, "y").r(5, 6, 6, 1, "y").p(6, 5, "y").p(10, 5, "y").p(6, 8, "y").p(10, 8, "y");
    g.r(3, 11, 1, 3, "d").r(12, 11, 1, 3, "d");
  },
  media: (g) => {
    g.r(1, 3, 14, 9, "s").r(2, 4, 12, 7, "n");
    g.r(3, 5, 10, 5, "b").r(3, 5, 10, 1, "l");
    g.r(5, 7, 2, 2, "r").r(8, 6, 3, 1, "w").r(8, 8, 3, 1, "w");
    g.l(5, 3, 3, 0, "d").l(10, 3, 12, 0, "d");
    g.r(5, 13, 6, 2, "d");
  },
  calendar: (g) => {
    g.r(1, 2, 14, 13, "w").r(1, 2, 14, 3, "r");
    g.r(4, 0, 2, 3, "d").r(10, 0, 2, 3, "d");
    for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) g.r(3 + i * 3, 6 + j * 3, 2, 2, "d");
    g.r(9, 9, 2, 2, "r");
  },
  rules: (g) => {
    g.r(3, 1, 7, 4, "d").r(4, 5, 1, 2, "d").l(8, 5, 12, 11, "o", 2);
    g.r(2, 1, 1, 4, "w").r(10, 1, 1, 4, "w");
    g.r(5, 12, 9, 2, "s").r(4, 14, 11, 1, "d");
    g.p(1, 7, "y").p(0, 6, "y").p(1, 5, "y");
  },
  people: (g) => {
    g.disc(4.5, 3.5, 2.2, "y").r(2, 3, 1, 1, "k").r(6, 3, 1, 1, "k").r(0, 7, 9, 7, "t").r(1, 6, 7, 1, "t");
    g.disc(11.5, 5.5, 2.2, "h").r(9, 5, 1, 1, "k").r(13, 5, 1, 1, "k").r(7, 9, 9, 6, "p").r(8, 8, 7, 1, "p");
  },
  car: (g) => {
    g.r(0, 3, 4, 1, "d").r(1, 4, 1, 3, "d");
    g.r(2, 5, 11, 3, "r").r(5, 3, 3, 2, "w").r(6, 4, 1, 1, "k");
    g.r(11, 6, 5, 2, "r").r(13, 8, 3, 1, "d");
    g.r(2, 7, 4, 5, "m").r(10, 8, 4, 4, "m");
    g.r(3, 8, 2, 3, "s").r(11, 9, 2, 2, "s");
  },
};

// ---------- fallback and map building ----------

const FALLBACK: Draw = (g) => {
  g.r(2, 2, 12, 12, "s").r(3, 3, 10, 10, "n");
  g.text(6, 5, "?", "d");
};

function build(fn: Draw): string[] {
  const g = new Grid(16, 16);
  fn(g);
  return g.outline().rows();
}

export const ICON_MAPS: Record<string, string[]> = Object.fromEntries(Object.entries(DRAW).map(([id, fn]) => [id, build(fn)]));
export const DEPT_MAPS = Object.fromEntries(Object.entries(DEPT).map(([k, fn]) => [k, build(fn)])) as Record<DeptKind, string[]>;
export const FALLBACK_MAP: string[] = build(FALLBACK);

export function hasIcon(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(ICON_MAPS, id);
}

function PixelSvg({ rows, size, title, style, attrs }: { rows: string[]; size: number; title?: string; style?: CSSProperties; attrs?: Record<string, string> }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      role="img"
      aria-label={title}
      style={{ imageRendering: "pixelated", display: "inline-block", verticalAlign: "middle", flex: "none", ...style }}
      {...attrs}
    >
      {title ? <title>{title}</title> : null}
      {gridRects(rows, PAL)}
    </svg>
  );
}

/** A 16x16 pixel icon for one regulation module. Unknown ids get a generic "?" tile. */
export function ModuleIcon({ id, size = 32 }: { id: string; size?: number }) {
  const known = hasIcon(id);
  return <PixelSvg rows={known ? ICON_MAPS[id] : FALLBACK_MAP} size={size} title={known ? undefined : "unknown module"} attrs={{ "data-icon": known ? id : "fallback", "data-fallback": known ? "0" : "1" }} />;
}

/** A small 16x16 department icon for headers and stats. */
export function DeptIcon({ kind, size = 24 }: { kind: DeptKind; size?: number }) {
  const rows = DEPT_MAPS[kind] ?? FALLBACK_MAP;
  return <PixelSvg rows={rows} size={size} attrs={{ "data-dept": String(kind) }} />;
}

export const DEPT_KINDS = Object.keys(DEPT) as DeptKind[];
