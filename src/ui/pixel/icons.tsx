import type { CSSProperties } from "react";
import type { Category } from "../../career/modules";
import { Grid, PAL, arrowD, gridRects } from "./grid";

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

function flag(g: Grid, x: number, y: number, w: number, h: number, a: string, b: string) {
  g.r(x - 1, y, 1, h + 5, "d");
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) g.p(x + i, y + j, (i + j) % 2 === 0 ? a : b);
}

type Draw = (g: Grid) => void;

const DRAW: Record<string, Draw> = {
  // ----- Aero -----
  // ----- Power -----
  // ----- Tyres -----
  // ----- Race format -----
  openCooling: (g) => {
    g.r(2, 3, 11, 9, "h").r(3, 4, 9, 7, "d");
    for (let i = 0; i < 4; i++) g.r(4, 5 + i * 2 - (i > 2 ? 1 : 0), 7, 1, "t");
    arrowD(g, 12, 1, 5, "t");
  },
  attackZones: (g) => {
    g.r(1, 8, 13, 3, "d");
    g.r(4, 8, 6, 3, "r");
    g.l(3, 4, 7, 2, "y").l(7, 2, 11, 4, "y");
    g.p(7, 1, "w");
  },
  twoRaceWeekend: (g) => {
    flag(g, 1, 2, 5, 4, "w", "k");
    flag(g, 8, 2, 5, 4, "y", "k");
    g.r(2, 9, 5, 2, "h").r(8, 9, 5, 2, "h");
    g.text(2, 12, "2X", "w");
  },
  auditor: (g) => {
    g.r(2, 1, 9, 12, "w").r(3, 3, 7, 1, "d").r(3, 5, 7, 1, "d").r(3, 7, 5, 1, "d");
    g.disc(11, 11, 3, "y").ring(11, 11, 3, "h", 1);
  },
  sixWheels: (g) => {
    g.disc(7, 7, 6, "h").ring(7, 7, 6, "t", 1.2);
    g.text(3, 5, "SI", "w");
  },
  computerCars: (g) => {
    g.disc(7, 7, 6, "h").ring(7, 7, 6, "t", 1.2);
    g.text(3, 5, "CO", "w");
  },
  fuelIsMoney: (g) => {
    g.disc(7, 7, 6, "h").ring(7, 7, 6, "t", 1.2);
    g.text(3, 5, "FU", "w");
  },
  grenadeEra: (g) => {
    g.disc(7, 7, 6, "h").ring(7, 7, 6, "t", 1.2);
    g.text(3, 5, "GR", "w");
  },
  freedomAuction: (g) => {
    g.disc(7, 7, 6, "h").ring(7, 7, 6, "t", 1.2);
    g.text(3, 5, "FR", "w");
  },
  rainOnDemand: (g) => {
    g.disc(7, 7, 6, "h").ring(7, 7, 6, "t", 1.2);
    g.text(3, 5, "RA", "w");
  },
  theDraft: (g) => {
    g.disc(7, 7, 6, "h").ring(7, 7, 6, "t", 1.2);
    g.text(3, 5, "TH", "w");
  },
  energyAuction: (g) => {
    g.disc(7, 7, 6, "h").ring(7, 7, 6, "t", 1.2);
    g.text(3, 5, "EN", "w");
  },
  twinChassis: (g) => {
    g.disc(7, 7, 6, "h").ring(7, 7, 6, "t", 1.2);
    g.text(3, 5, "TW", "w");
  },
  kitLibrary: (g) => {
    g.disc(7, 7, 6, "h").ring(7, 7, 6, "t", 1.2);
    g.text(3, 5, "KI", "w");
  },
  transparentPaddock: (g) => {
    g.disc(7, 7, 6, "h").ring(7, 7, 6, "t", 1.2);
    g.text(3, 5, "TR", "w");
  },
  relayEra: (g) => {
    g.disc(7, 7, 6, "h").ring(7, 7, 6, "t", 1.2);
    g.text(3, 5, "RE", "w");
  },
  tyreWars: (g) => {
    g.disc(7, 7, 6, "h").ring(7, 7, 6, "t", 1.2);
    g.text(3, 5, "TY", "w");
  },
  wingsBanned: (g) => {
    g.disc(7, 7, 6, "h").ring(7, 7, 6, "t", 1.2);
    g.text(3, 5, "WI", "w");
  },
  // ----- Communication -----
  // ----- Operations -----
  // ----- Financial -----
  // ----- Chassis -----
  // ----- Race format cont -----
  // ----- Pit lane -----
  // ----- Operations -----
  // ----- Scoring -----
  // ----- Qualifying -----
  // ----- People -----
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
