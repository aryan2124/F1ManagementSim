import type { CSSProperties, ReactElement } from "react";
import { Grid, PAL, gridRects, rng } from "./grid";
import { DeptIcon, type DeptKind } from "./icons";

/** Wide short pixel scenes for screen headers. Logical size 480x48 (a 960x96 scene at 2px per pixel),
 *  drawn as SVG rects, scaled to the container width with crisp edges. */

export type BannerTheme = "hq" | "news" | "car" | "people" | "money" | "calendar" | "rules" | "academy" | "world" | "garage";
export const BANNER_THEMES: BannerTheme[] = ["hq", "news", "car", "people", "money", "calendar", "rules", "academy", "world", "garage"];

const W = 480;
const H = 48;

const P: Record<string, string> = {
  ...PAL,
  A: "#1d3a7a", // blueprint
  a: "#5b8fd8",
  B: "#244a96",
  c: "#2a2150", // wall
  C: "#352a60",
  z: "#17132a",
  F: "#8a5a2b",
  f: "#5a3a1c",
  G: "#3a2f66",
  M: "#101a3a",
  v: "#1f5a4a",
  V: "#2a7a5a",
  j: "#8fa0c8",
  x: "#e8b98f",
  X: "#c98d5f",
  J: "#27396b",
  q: "#4a3a30",
  Y: "#3a4a2a",
  Z: "#5a7a3a",
};

// ---------- helpers ----------

/** A head and shoulders. `to` is the y of the desk or counter they sit behind: the torso reaches down to it and a chair back shows behind. */
function bust(g: Grid, x: number, y: number, suit: string, hair = "k", skin = "x", to = y + 12) {
  const bottom = Math.max(to, y + 12);
  g.r(x - 6, y + 4, 13, bottom - y - 4, "G").r(x - 6, y + 4, 13, 1, "C");
  g.r(x - 4, y + 7, 9, bottom - y - 7, suit).r(x - 3, y + 6, 7, 1, suit);
  g.r(x - 1, y + 5, 3, 2, "X");
  g.disc(x, y + 2, 3, skin, 3.5);
  g.r(x - 3, y - 1, 7, 2, hair);
  g.p(x - 1, y + 2, "k").p(x + 1, y + 2, "k");
}
function bigText(g: Grid, x: number, y: number, s: string, ch: string, scale = 2) {
  const t = new Grid(s.length * 4, 5).text(0, 0, s, ch);
  for (let j = 0; j < 5; j++) for (let i = 0; i < t.w; i++) if (t.c[j][i] !== ".") g.r(x + i * scale, y + j * scale, scale, scale, ch);
}
function bands(g: Grid, y0: number, y1: number, a: string, b: string, step = 8) {
  for (let y = y0; y < y1; y++) {
    g.r(0, y, W, 1, Math.floor((y - y0) / step) % 2 === 0 ? a : b);
  }
  for (let y = y0 + step; y < y1; y += step) for (let x = (y / step) % 2; x < W; x += 2) g.p(x, y, a);
}
function floor(g: Grid, y: number, a = "z", line = "G") {
  g.r(0, y, W, H - y, a).r(0, y, W, 1, line);
  for (let x = 0; x < W; x += 24) g.r(x, y + 3, 12, 1, line);
}
function car(g: Grid, x: number, y: number, body: string, wheel = "m") {
  g.r(x, y, 3, 1, "d").r(x + 1, y + 1, 1, 3, "d");
  g.r(x + 2, y + 2, 12, 3, body).r(x + 7, y + 1, 3, 1, "w");
  g.r(x + 13, y + 3, 4, 2, body).r(x + 15, y + 5, 3, 1, "d");
  g.r(x + 2, y + 4, 4, 4, wheel).r(x + 11, y + 5, 4, 3, wheel);
}
function kart(g: Grid, x: number, y: number, body: string) {
  g.r(x, y + 2, 11, 2, body).r(x + 7, y, 2, 2, "w").r(x + 9, y + 1, 2, 1, "w").r(x + 10, y + 2, 2, 1, "d");
  g.r(x + 1, y + 3, 3, 3, "m").r(x + 8, y + 3, 3, 3, "m").r(x + 5, y + 2, 2, 1, "k");
}
function pixelFlag(g: Grid, x: number, y: number, w: number, h: number, a: string, b: string) {
  g.r(x - 1, y, 1, h + 5, "d");
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) g.p(x + i, y + j, (i + j) % 2 === 0 ? a : b);
}

function G_(g: Grid, key: string) {
  return gridRects(g.rows(), P, key);
}

const CSS = `
.bbn{display:block;width:100%;aspect-ratio:10/1;min-height:56px;image-rendering:pixelated;background:#14111f;}
.bbn .bl{animation:bbn-bl 1.2s steps(1) infinite;}
.bbn .bl2{animation:bbn-bl 1.8s steps(1) infinite;animation-delay:.5s;}
.bbn .bl3{animation:bbn-bl 2.4s steps(1) infinite;animation-delay:1s;}
@keyframes bbn-bl{0%{opacity:1}50%{opacity:.15}}
.bbn .ti{animation:bbn-ti var(--bbn-dur,28s) steps(var(--bbn-steps,300)) infinite;}
@keyframes bbn-ti{from{transform:translateX(0)}to{transform:translateX(var(--bbn-shift,-300px))}}
.bbn .walk{animation:bbn-walk var(--bbn-dur,16s) steps(60) infinite;}
@keyframes bbn-walk{from{transform:translateX(-30px)}to{transform:translateX(510px)}}
.bbn .walk2{animation:bbn-walk2 var(--bbn-dur,22s) steps(60) infinite;}
@keyframes bbn-walk2{from{transform:translateX(510px)}to{transform:translateX(-30px)}}
.bbn .bob{animation:bbn-bob .6s steps(1) infinite;}
@keyframes bbn-bob{0%{transform:translateY(0)}50%{transform:translateY(-1px)}}
.bbn .hit{animation:bbn-hit 2.4s steps(1) infinite;transform-box:fill-box;transform-origin:bottom right;}
@keyframes bbn-hit{0%{transform:translateY(-4px)}85%{transform:translateY(-4px)}90%{transform:translateY(0)}95%{transform:translateY(0)}100%{transform:translateY(-4px)}}
.bbn .sweep{animation:bbn-sweep 3s steps(12) infinite;}
@keyframes bbn-sweep{from{transform:translateX(0)}to{transform:translateX(240px)}}
.bbn .rise{animation:bbn-rise 2s steps(4) infinite;}
@keyframes bbn-rise{0%{transform:translateY(2px)}100%{transform:translateY(-2px)}}
@media (prefers-reduced-motion:reduce){.bbn .bl,.bbn .bl2,.bbn .bl3,.bbn .ti,.bbn .walk,.bbn .walk2,.bbn .bob,.bbn .hit,.bbn .sweep,.bbn .rise{animation:none}}
`;

// ---------- scenes ----------

function hq(): ReactElement[] {
  const g = new Grid(W, H);
  bands(g, 0, 40, "c", "C");
  g.r(0, 0, W, 2, "s");
  // window onto the factory yard
  g.r(12, 5, 110, 31, "k").r(14, 7, 106, 27, "A");
  g.disc(98, 14, 5, "y", 5);
  const R = rng(21);
  for (let x = 16; x + 9 <= 119; x += 10) {
    const h = 6 + Math.floor(R() * 10);
    g.r(x, 34 - h, Math.min(9, 119 - x), h, "B");
    for (let k = 0; k < h - 2; k += 3) if (R() < 0.5) g.p(x + 2, 34 - h + 1 + k, "y").p(x + 5, 34 - h + 1 + k, "y");
  }
  g.r(66, 5, 2, 29, "k").r(14, 19, 106, 2, "k");
  g.r(10, 35, 114, 2, "F");
  // trophy shelves
  g.r(140, 14, 70, 2, "F").r(140, 28, 70, 2, "F");
  for (let i = 0; i < 4; i++) {
    const x = 146 + i * 16;
    g.r(x, 8, 6, 5, "y").r(x + 2, 12, 2, 2, "y").r(x - 1, 8, 1, 3, "y").r(x + 6, 8, 1, 3, "y");
    g.r(x, 22, 6, 5, i % 2 ? "w" : "y").r(x + 2, 26, 2, 2, "y");
  }
  // wall clock
  g.disc(236, 12, 6, "w", 6).ring(236, 12, 6, "k", 1).r(236, 8, 1, 5, "k").r(236, 12, 4, 1, "k");
  // desk, chair and the team principal
  g.r(250, 29, 130, 3, "F").r(250, 29, 130, 1, "y").r(254, 32, 122, 8, "f");
  bust(g, 318, 12, "J", "d", "x", 29);
  g.r(262, 24, 16, 5, "s").r(264, 25, 12, 3, "M").r(268, 28, 8, 1, "d");
  g.r(336, 27, 14, 2, "w").r(338, 26, 8, 1, "w").r(356, 25, 6, 4, "r").r(357, 24, 4, 1, "w");
  g.r(296, 28, 14, 1, "k");
  // cabinet with a model car, pennants
  g.r(398, 30, 66, 10, "F").r(398, 30, 66, 1, "y").r(400, 32, 62, 7, "f");
  car(g, 418, 22, "r");
  pixelFlag(g, 402, 6, 14, 10, "r", "w");
  pixelFlag(g, 436, 6, 14, 10, "y", "k");
  floor(g, 40);
  const lamp = new Grid(W, H).r(263, 26, 2, 1, "g").r(274, 26, 2, 1, "y");
  return [...G_(g, "h"), <g key="l" className="bl">{G_(lamp, "l")}</g>];
}

function news(): ReactElement[] {
  const g = new Grid(W, H);
  bands(g, 0, 40, "c", "C");
  g.r(0, 0, W, 2, "s");
  for (let x = 10; x < W; x += 44) g.r(x, 2, 6, 3, "y");
  // monitor wall
  for (let i = 0; i < 3; i++) {
    const x = 12 + i * 40;
    g.r(x, 7, 36, 24, "s").r(x + 2, 9, 32, 20, "M");
    g.r(x + 4, 24, 4, 3, "g").r(x + 10, 20, 4, 7, "y").r(x + 16, 16, 4, 11, "h").r(x + 22, 12, 4, 15, "t");
    g.r(x + 4, 11, 12, 1, "w").r(x + 4, 13, 8, 1, "d");
  }
  // desk and anchors
  bust(g, 205, 14, "J", "H", "x", 29);
  bust(g, 255, 14, "p", "k", "X", 29);
  g.r(160, 29, 140, 3, "F").r(160, 29, 140, 1, "y").r(162, 32, 136, 8, "G");
  g.r(214, 33, 32, 6, "r").r(215, 34, 30, 4, "k");
  bigText(g, 218, 34, "BB", "y", 1);
  g.r(184, 26, 8, 3, "w").r(268, 26, 6, 3, "w");
  // logo and sign
  g.r(330, 8, 40, 14, "k").r(331, 9, 38, 12, "r");
  bigText(g, 336, 11, "NEWS", "w", 2);
  g.r(398, 8, 66, 24, "k").r(400, 10, 62, 20, "M");
  g.r(404, 24, 8, 4, "g").r(414, 20, 8, 8, "y").r(424, 16, 8, 12, "h").r(434, 14, 8, 14, "t").r(444, 12, 8, 16, "p");
  floor(g, 40);
  const msg = "BOX BOX NEWS * RULES TALK * TRANSFERS * LAP RECORDS * ";
  const tw = msg.length * 4;
  const tg = new Grid(tw, 5).text(0, 0, msg, "y");
  // sign blinking
  const live = new Grid(W, H).r(340, 25, 24, 7, "r").r(341, 26, 22, 5, "e").r(343, 27, 3, 3, "r").r(349, 27, 3, 3, "r").r(355, 27, 3, 3, "r");
  const sty = { "--bbn-shift": `-${tw}px`, "--bbn-steps": String(tw), "--bbn-dur": "24s" } as CSSProperties;
  return [
    ...G_(g, "n"),
    <g key="live" className="bl">{G_(live, "lv")}</g>,
    <rect key="tk" x={0} y={41} width={W} height={7} fill="#0b0814" />,
    <svg key="tks" x={0} y={42} width={W} height={5} viewBox={`0 0 ${W} 5`} overflow="hidden">
      <g className="ti" style={sty}>
        {gridRects(tg.rows(), P, "ta")}
        <g transform={`translate(${tw} 0)`}>{gridRects(tg.rows(), P, "tb")}</g>
        <g transform={`translate(${tw * 2} 0)`}>{gridRects(tg.rows(), P, "tc")}</g>
        <g transform={`translate(${tw * 3} 0)`}>{gridRects(tg.rows(), P, "td")}</g>
      </g>
    </svg>,
  ];
}

function carScene(): ReactElement[] {
  const g = new Grid(W, H);
  g.r(0, 0, W, 40, "c");
  // blueprint wall
  g.r(8, 3, 300, 35, "k").r(10, 5, 296, 31, "A");
  for (let x = 10; x < 306; x += 8) g.r(x, 5, 1, 31, "B");
  for (let y = 5; y < 36; y += 8) g.r(10, y, 296, 1, "B");
  // car blueprint side view, large
  const L = (x0: number, y0: number, x1: number, y1: number) => g.l(x0, y0, x1, y1, "a");
  L(30, 28, 200, 28);
  L(30, 28, 38, 18);
  L(38, 18, 60, 18);
  L(60, 18, 90, 14);
  L(90, 14, 116, 14);
  L(116, 14, 150, 22);
  L(150, 22, 196, 24);
  L(196, 24, 200, 28);
  L(36, 12, 36, 22);
  L(36, 12, 56, 12);
  g.ring(62, 27, 7, "a", 1).ring(165, 27, 6, "a", 1);
  g.disc(62, 27, 2, "a").disc(165, 27, 2, "a");
  L(60, 18, 66, 24);
  L(100, 14, 108, 9);
  L(108, 9, 118, 9);
  // dimension lines
  g.r(30, 33, 170, 1, "a").r(30, 31, 1, 5, "a").r(199, 31, 1, 5, "a");
  g.r(210, 8, 90, 1, "a").r(210, 8, 1, 4, "a").r(299, 8, 1, 4, "a");
  bigText(g, 226, 8, "4.4M", "w", 1);
  // wing cross sections, kept clear of the labels
  g.r(222, 28, 24, 2, "a").r(224, 25, 20, 1, "a").r(226, 22, 16, 1, "a");
  g.r(262, 25, 36, 3, "a").r(266, 22, 28, 2, "a");
  // drafting table with a model car standing on it
  g.r(326, 29, 96, 3, "F").r(326, 29, 96, 1, "y").r(332, 32, 3, 8, "f").r(414, 32, 3, 8, "f");
  car(g, 356, 21, "r");
  // lamp at the left end of the table
  g.r(332, 27, 6, 2, "d").l(335, 27, 339, 15, "d").l(339, 15, 347, 13, "d").r(345, 13, 7, 2, "y").r(347, 15, 3, 5, "y");
  // monitor on its own stand
  g.r(434, 14, 38, 22, "s").r(436, 16, 34, 18, "M").r(448, 36, 10, 2, "s").r(444, 38, 18, 2, "s");
  g.r(440, 29, 22, 1, "t").r(442, 26, 16, 1, "t").r(446, 23, 8, 1, "t").r(448, 23, 1, 7, "t").r(452, 23, 1, 7, "t");
  floor(g, 40);
  const led = new Grid(W, H).r(464, 17, 2, 2, "g").r(467, 17, 2, 2, "r");
  const hl = new Grid(W, H).r(358, 27, 18, 1, "w");
  return [...G_(g, "c"), <g key="l" className="bl">{G_(led, "l")}</g>, <g key="s" className="bl3">{G_(hl, "h")}</g>];
}

function people(): ReactElement[] {
  const g = new Grid(W, H);
  bands(g, 0, 36, "z", "G", 6);
  const R = rng(7);
  for (let i = 0; i < 40; i++) g.p(Math.floor(R() * W), Math.floor(R() * 14), "w");
  const cols = ["r", "t", "h", "b", "p", "y"];
  const homes = 6;
  const wlit: [number, number][] = [];
  for (let i = 0; i < homes; i++) {
    const x = 6 + i * 78;
    const c = cols[i % cols.length];
    g.r(x, 14, 70, 22, "s").r(x, 14, 70, 3, c).r(x, 33, 70, 3, "m");
    g.r(x + 2, 17, 66, 1, "d");
    for (let k = 0; k < 4; k++) {
      g.r(x + 6 + k * 14, 21, 10, 7, "k").r(x + 7 + k * 14, 22, 8, 5, "y");
      wlit.push([x + 6 + k * 14, 21]);
    }
    g.r(x + 62, 20, 6, 13, "n").r(x + 63, 21, 4, 11, "k");
    // awning
    for (let k = 0; k < 66; k += 6) g.r(x + 2 + k, 28, 3, 3, c).r(x + 5 + k, 28, 3, 3, "w");
    pixelFlag(g, x + 8, 5, 6, 4, c, "w");
    g.r(x + 40, 11, 8, 3, "d").r(x + 43, 9, 2, 2, "d");
  }
  // tarmac
  g.r(0, 36, W, 12, "m").r(0, 36, W, 1, "d");
  for (let x = 0; x < W; x += 20) g.r(x, 43, 10, 1, "y");
  // people
  const walker = new Grid(10, 12);
  walker.disc(4, 2, 2, "x", 2).r(2, 0, 5, 2, "k").r(2, 5, 5, 4, "r").r(2, 9, 2, 3, "n").r(5, 9, 2, 3, "n");
  const walker2 = new Grid(10, 12);
  walker2.disc(4, 2, 2, "X", 2).r(2, 0, 5, 2, "h").r(2, 5, 5, 4, "t").r(2, 9, 2, 3, "k").r(5, 9, 2, 3, "k");
  const blink = new Grid(W, H);
  wlit.filter((_, i) => i % 3 === 0).forEach(([x, y]) => blink.r(x + 1, y + 1, 8, 5, "e"));
  const stand = new Grid(W, H);
  for (let i = 0; i < 9; i++) {
    const x = 20 + i * 52;
    stand.disc(x, 38, 2, i % 2 ? "x" : "X", 2).r(x - 2, 40, 5, 4, ["b", "y", "g", "p"][i % 4]);
  }
  return [
    ...G_(g, "p"),
    ...G_(stand, "st"),
    <g key="bl" className="bl2">{G_(blink, "bk")}</g>,
    <g key="w1" transform="translate(0 36)"><g className="walk">{G_(walker, "w1")}</g></g>,
    <g key="w2" transform="translate(0 33)"><g className="walk2">{G_(walker2, "w2")}</g></g>,
  ];
}

function money(): ReactElement[] {
  const g = new Grid(W, H);
  g.r(0, 0, W, 40, "c");
  // window with skyline
  g.r(8, 4, 120, 30, "k").r(10, 6, 116, 26, "A");
  const R = rng(11);
  for (let x = 12; x < 124; x += 8) {
    const h = 6 + Math.floor(R() * 14);
    g.r(x, 32 - h, 7, h, "B");
    for (let k = 0; k < h - 2; k += 3) if (R() < 0.6) g.p(x + 2, 32 - h + 1 + k, "y").p(x + 4, 32 - h + 1 + k, "y");
  }
  g.r(66, 4, 2, 28, "k").r(8, 18, 120, 2, "k");
  // chart board
  g.r(150, 4, 130, 32, "w").r(152, 6, 126, 28, "M");
  for (let y = 10; y < 32; y += 6) g.r(154, y, 122, 1, "n");
  const pts = [28, 26, 27, 22, 23, 18, 19, 14, 15, 10];
  for (let i = 0; i < pts.length - 1; i++) g.l(160 + i * 12, pts[i], 160 + (i + 1) * 12, pts[i + 1], "g", 2);
  for (let i = 0; i < pts.length; i++) g.r(158 + i * 12, pts[i] - 1, 4, 4, "y");
  bigText(g, 156, 7, "REV", "t", 1);
  // right wall: ledger shelves
  g.r(300, 6, 60, 28, "f");
  for (let y = 8; y < 32; y += 8) g.r(302, y + 5, 56, 2, "F");
  for (let y = 8; y < 32; y += 8) for (let x = 304; x < 356; x += 5) g.r(x, y, 4, 5, ["r", "b", "y", "g", "p"][((x + y) / 5) % 5 | 0]);
  // table
  g.r(120, 28, 300, 4, "F").r(120, 28, 300, 1, "y").r(130, 32, 280, 8, "f");
  // ledger open book on the table
  g.r(190, 22, 22, 6, "w").r(200, 22, 2, 6, "d");
  for (let k = 0; k < 4; k++) g.r(192, 23 + (k % 3) * 2, 6, 1, "d").r(204, 23 + (k % 3) * 2, 6, 1, "d");
  // coin stacks
  for (let i = 0; i < 4; i++) for (let k = 0; k <= i + 1; k++) g.r(240 + i * 8, 26 - k * 2, 6, 2, k % 2 ? "h" : "y");
  // chairs and people
  bust(g, 138, 14, "J", "q", "x", 28);
  bust(g, 330, 14, "e", "k", "X", 28);
  bust(g, 380, 14, "n", "H", "x", 28);
  g.r(386, 12, 0, 0, "k");
  // laptop
  g.r(300, 24, 14, 4, "s").r(302, 25, 10, 2, "t");
  floor(g, 40);
  const blink = new Grid(W, H).r(158, 9, 4, 4, "w");
  const up = new Grid(W, H).r(268, 8, 6, 3, "g").r(270, 8, 2, 1, "w");
  // ticker numbers right
  return [...G_(g, "m"), <g key="b" className="bl">{G_(blink, "b")}</g>, <g key="u" className="rise">{G_(up, "u")}</g>];
}

function calendar(): ReactElement[] {
  const g = new Grid(W, H);
  g.r(0, 0, W, 40, "c");
  g.r(0, 0, W, 6, "k");
  const months = ["MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV"];
  months.forEach((m, i) => {
    g.r(8 + i * 52, 1, 48, 4, i % 2 ? "G" : "n");
    g.text(18 + i * 52, 0, m, "y");
  });
  // planner grid: 3 rows of day cells per month
  const R = rng(5);
  for (let m = 0; m < 9; m++) {
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 8; col++) {
        const x = 8 + m * 52 + col * 6;
        const y = 8 + row * 9;
        g.r(x, y, 5, 8, "M");
        if (R() < 0.12) g.r(x, y, 5, 8, "r").p(x + 2, y + 3, "w");
        else if (R() < 0.1) g.r(x, y, 5, 8, "g");
      }
  }
  // wall flags
  pixelFlag(g, 448, 10, 10, 8, "w", "k");
  g.r(466, 10, 10, 20, "k").r(467, 11, 8, 18, "M");
  g.r(468, 12, 6, 4, "r").r(468, 18, 6, 4, "y").r(468, 24, 6, 4, "g");
  // console desk
  g.r(0, 34, W, 6, "F").r(0, 34, W, 1, "y").r(0, 40, W, 8, "G");
  for (let x = 6; x < W; x += 30) {
    g.r(x, 31, 22, 6, "s").r(x + 2, 32, 18, 4, "M");
    g.r(x + 3, 34, 3, 1, "t").r(x + 8, 33, 3, 2, "y").r(x + 13, 32, 3, 3, "g");
  }
  floor(g, 44, "G", "k");
  const leds = new Grid(W, H);
  for (let x = 6; x < W; x += 30) leds.r(x + 18, 38, 2, 2, "r").r(x + 4, 38, 2, 2, "g");
  return [
    ...G_(g, "k"),
    <g key="le" className="bl2">{G_(leds, "le")}</g>,
  ];
}

function rules(): ReactElement[] {
  const g = new Grid(W, H);
  g.r(0, 0, W, 40, "q");
  for (let x = 0; x < W; x += 16) g.r(x, 0, 1, 40, "f").r(x + 8, 0, 1, 40, "f");
  g.r(0, 0, W, 3, "f");
  // emblem
  g.disc(240, 14, 10, "y", 10).disc(240, 14, 8, "n", 8);
  g.r(239, 6, 2, 16, "y").r(232, 9, 16, 1, "y");
  g.r(230, 10, 6, 1, "y").r(244, 10, 6, 1, "y").r(230, 11, 6, 2, "w").r(244, 11, 6, 2, "w");
  // flags
  pixelFlag(g, 40, 4, 22, 14, "b", "w");
  pixelFlag(g, 90, 4, 22, 14, "r", "w");
  pixelFlag(g, 400, 4, 22, 14, "g", "w");
  pixelFlag(g, 450, 4, 22, 14, "y", "k");
  // bench
  g.r(130, 26, 220, 14, "F").r(130, 26, 220, 2, "y").r(130, 38, 220, 2, "f");
  for (let x = 134; x < 346; x += 22) g.r(x, 30, 18, 6, "f").r(x + 1, 31, 16, 1, "F");
  bust(g, 190, 15, "k", "d", "x", 28);
  bust(g, 240, 15, "k", "k", "X", 28);
  bust(g, 290, 15, "k", "H", "x", 28);
  g.r(220, 24, 40, 3, "y").r(221, 25, 38, 1, "k");
  // gavel block and gavel
  g.r(150, 22, 14, 4, "o");
  // tables for parties
  g.r(30, 34, 80, 6, "F").r(30, 34, 80, 1, "y").r(370, 34, 80, 6, "F").r(370, 34, 80, 1, "y");
  g.r(40, 31, 12, 3, "w").r(60, 30, 14, 4, "w").r(380, 31, 12, 3, "w").r(400, 30, 14, 4, "w");
  bust(g, 90, 21, "n", "k", "x", 34);
  bust(g, 430, 21, "J", "H", "X", 34);
  floor(g, 40, "f", "o");
  const gavel = new Grid(20, 12).r(0, 0, 10, 5, "o").r(1, 0, 8, 1, "w").l(9, 3, 16, 10, "F", 2);
  const hit = new Grid(W, H).r(152, 16, 10, 4, "w");
  void hit;
  const lite = new Grid(W, H).r(232, 30, 16, 3, "r");
  return [
    ...G_(g, "r"),
    <g key="gv" transform="translate(147 12)"><g className="hit">{G_(gavel, "gv")}</g></g>,
    <g key="lt" className="bl">{G_(lite, "lt")}</g>,
  ];
}

function academy(): ReactElement[] {
  const g = new Grid(W, H);
  bands(g, 0, 30, "z", "G", 6);
  // tents
  for (let i = 0; i < 3; i++) {
    const x = 20 + i * 150;
    const c = ["t", "h", "p"][i];
    for (let k = 0; k < 14; k++) g.r(x + 14 - k, 8 + k, 2 * k + 40 - 2 * 0, 1, k % 4 < 2 ? c : "w");
    g.r(x + 8, 22, 56, 14, "n").r(x + 12, 24, 20, 12, "k");
    g.r(x + 36, 24, 24, 6, c).text(x + 38, 25, "JR", "w");
  }
  // trees of tyres and cones
  for (let i = 0; i < 6; i++) {
    const x = 96 + i * 66;
    g.r(x, 30, 8, 3, "m").r(x, 33, 8, 3, "m").r(x + 1, 31, 6, 1, "r");
  }
  g.r(0, 36, W, 12, "m").r(0, 36, W, 1, "d");
  for (let x = 0; x < W; x += 16) g.r(x, 36, 8, 1, x % 32 ? "w" : "r");
  for (let x = 24; x < W; x += 48) g.r(x, 41, 4, 4, "h").r(x + 1, 40, 2, 1, "h").r(x, 43, 4, 1, "w");
  const karts = new Grid(W, H);
  const cols = ["r", "y", "b", "g", "p", "h", "t"];
  for (let i = 0; i < 7; i++) kart(karts, 14 + i * 66, 42, cols[i]);
  const mover = new Grid(14, 8);
  kart(mover, 0, 0, "r");
  const mover2 = new Grid(14, 8);
  kart(mover2, 0, 0, "b");
  return [
    ...G_(g, "a"),
    ...G_(karts, "k"),
    <g key="m1" transform="translate(0 37)">
      <g className="walk" style={{ ["--bbn-dur" as string]: "7s" } as CSSProperties}>{G_(mover, "m1")}</g>
    </g>,
    <g key="m2" transform="translate(0 30)">
      <g className="walk" style={{ ["--bbn-dur" as string]: "11s", animationDelay: "-4s" } as CSSProperties}>{G_(mover2, "m2")}</g>
    </g>,
  ];
}

// coarse world map as ellipse blobs on a 300x36 grid
function worldGrid(): Grid {
  const m = new Grid(300, 36);
  const blobs: [number, number, number, number][] = [
    [50, 10, 24, 8], [60, 22, 8, 10], [75, 28, 6, 7], // americas
    [135, 9, 12, 5], [140, 20, 10, 11], [150, 28, 5, 4], // europe, africa
    [190, 10, 30, 8], [215, 16, 12, 5], [235, 28, 9, 5], // asia, oceania
    [22, 6, 8, 4], [120, 4, 4, 2], [250, 12, 5, 4],
  ];
  for (const [cx, cy, rx, ry] of blobs) m.disc(cx, cy, rx, "v", ry);
  const R = rng(3);
  for (let i = 0; i < 160; i++) {
    const x = Math.floor(R() * 300), y = Math.floor(R() * 36);
    if (m.c[y][x] === "v") m.p(x, y, "V");
  }
  return m;
}

function world(): ReactElement[] {
  const g = new Grid(W, H);
  g.r(0, 0, W, H, "z");
  const R = rng(9);
  for (let i = 0; i < 50; i++) g.p(Math.floor(R() * W), Math.floor(R() * H), i % 5 ? "d" : "w");
  // ocean panel
  g.r(88, 2, 304, 40, "k").r(90, 4, 300, 36, "A");
  for (let x = 90; x < 390; x += 20) g.r(x, 4, 1, 36, "B");
  for (let y = 4; y < 40; y += 9) g.r(90, y, 300, 1, "B");
  const mp = worldGrid();
  for (let y = 0; y < 36; y++) for (let x = 0; x < 300; x++) if (mp.c[y][x] !== ".") g.p(90 + x, 4 + y, mp.c[y][x]);
  g.r(0, 42, W, 6, "G").r(0, 42, W, 1, "k");
  // sides: gauges
  for (let i = 0; i < 3; i++) {
    g.r(12 + i * 24, 8, 18, 28, "s").r(14 + i * 24, 10, 14, 24, "M");
    g.r(16 + i * 24, 28 - i * 4, 10, 4 + i * 4, ["g", "y", "h"][i]);
  }
  for (let i = 0; i < 3; i++) {
    g.r(404 + i * 24, 8, 18, 28, "s").r(406 + i * 24, 10, 14, 24, "M");
    g.r(408 + i * 24, 14 + i * 3, 10, 20 - i * 3, ["t", "p", "r"][i]);
  }
  const pins: [number, number][] = [[110, 12], [150, 20], [236, 12], [264, 18], [300, 28], [342, 22]];
  const pg = new Grid(W, H);
  pins.forEach(([x, y], i) => pg.r(x, y, 3, 3, i % 2 ? "y" : "r").r(x + 1, y + 3, 1, 2, "w"));
  const pg2 = new Grid(W, H);
  pins.forEach(([x, y], i) => i % 2 === 0 && pg2.r(x - 1, y - 1, 5, 5, "w"));
  const arcs = new Grid(W, H);
  for (let i = 0; i < pins.length - 1; i++) {
    const [x0, y0] = pins[i], [x1, y1] = pins[i + 1];
    for (let t = 0; t <= 20; t++) {
      if (t % 2) continue;
      const x = x0 + ((x1 - x0) * t) / 20;
      const y = y0 + ((y1 - y0) * t) / 20 - Math.sin((t / 20) * Math.PI) * 7;
      arcs.p(x + 1, y + 1, "w");
    }
  }
  const plane = new Grid(6, 4).r(0, 1, 5, 1, "w").r(2, 0, 1, 3, "w");
  return [
    ...G_(g, "w"),
    ...G_(arcs, "ar"),
    ...G_(pg, "pn"),
    <g key="p2" className="bl">{G_(pg2, "p2")}</g>,
    <g key="pl" transform="translate(0 14)"><g className="walk" style={{ ["--bbn-dur" as string]: "12s" } as CSSProperties}>{G_(plane, "pl")}</g></g>,
  ];
}


function garage(): ReactElement[] {
  const g = new Grid(W, H);
  g.r(0, 0, W, 40, "c").r(0, 0, W, 2, "k");
  // roller shutter, half up
  g.r(150, 3, 180, 14, "s").r(150, 3, 180, 1, "k");
  for (let y = 5; y < 17; y += 3) g.r(150, y, 180, 1, "n");
  g.r(150, 17, 180, 23, "M");
  // floor
  g.r(0, 40, W, 8, "G").r(0, 40, W, 1, "k");
  for (let x = 0; x < W; x += 16) g.r(x, 44, 8, 1, "C");
  // car on the jacks: low wedge with wings and wheels
  g.r(176, 30, 124, 5, "r").r(176, 30, 124, 1, "h");
  g.r(160, 32, 20, 3, "r").r(150, 28, 2, 8, "k").r(150, 28, 16, 2, "k");
  g.r(206, 26, 28, 5, "r").r(222, 22, 12, 5, "k").r(224, 23, 8, 3, "l");
  g.r(280, 24, 18, 2, "k").r(284, 26, 2, 5, "k");
  g.disc(196, 35, 5, "m", 5).disc(196, 35, 2, "s", 2);
  g.disc(284, 34, 6, "m", 6).disc(284, 34, 2, "s", 2);
  g.r(190, 38, 12, 2, "y").r(278, 38, 12, 2, "y");
  // tyre stacks on the left, three colours
  const stack = (x: number, cols: string[]) => cols.forEach((c, i) => { g.r(x, 36 - i * 5, 16, 5, "m"); g.r(x, 36 - i * 5, 16, 1, c); });
  stack(14, ["r", "r", "r"]);
  stack(34, ["y", "y"]);
  stack(54, ["w", "w", "w", "w"]);
  // telemetry screen with a trace, right side
  g.r(350, 8, 70, 30, "k").r(352, 10, 66, 26, "M");
  for (let x = 352; x < 418; x += 6) g.r(x, 10, 1, 26, "A");
  let y = 26;
  const R = rng(17);
  for (let x = 354; x < 416; x += 2) { y = Math.max(13, Math.min(32, y + Math.round((R() - 0.5) * 6))); g.p(x, y, "g").p(x + 1, y, "g"); }
  g.r(352, 33, 66, 1, "t");
  // tool chest and a mechanic
  g.r(432, 24, 28, 16, "r").r(432, 24, 28, 2, "k").r(434, 28, 24, 1, "k").r(434, 33, 24, 1, "k").r(444, 30, 4, 1, "y");
  bust(g, 330, 26, "b", "k", "x", 40);
  const blink = new Grid(W, H);
  blink.r(366, 12, 3, 3, "r");
  return [...G_(g, "ga"), <g key="b" className="bl">{G_(blink, "gb")}</g>];
}

const SCENES: Record<BannerTheme, () => ReactElement[]> = { hq, news, car: carScene, people, money, calendar, rules, academy, world, garage };

const PLATE: Record<BannerTheme, { t: string; sub: string; k: string; icon: DeptKind }> = {
  hq: { t: "HEADQUARTERS", sub: "Your team, your calendar, your call", k: "#ff8a1f", icon: "factory" },
  news: { t: "PADDOCK", sub: "What is happening in the world", k: "#ff5560", icon: "media" },
  car: { t: "CAR AND R&D", sub: "Study it, build it, race it", k: "#3b9cff", icon: "car" },
  people: { t: "PEOPLE", sub: "Drivers, engineers and the market", k: "#ff8ad0", icon: "people" },
  money: { t: "MONEY", sub: "Budgets, the cap and where it goes", k: "#4fd08a", icon: "cash" },
  calendar: { t: "CALENDAR", sub: "Everything that is coming", k: "#c28bff", icon: "calendar" },
  rules: { t: "RULES", sub: "The regulations and what they reward", k: "#c28bff", icon: "rules" },
  academy: { t: "ACADEMY", sub: "Tomorrow's drivers", k: "#3fe0cf", icon: "academy" },
  world: { t: "WORLD", sub: "The rest of the grid", k: "#6fc7ff", icon: "fans" },
  garage: { t: "THE GARAGE", sub: "Setup, runs and parts", k: "#ff8a1f", icon: "simulator" },
};
const MOTE: Record<BannerTheme, string> = { hq: "#ffd25a", news: "#ff8a8e", car: "#9fd0ff", people: "#ffb0e0", money: "#ffd25a", calendar: "#d9b8ff", rules: "#d9b8ff", academy: "#8ff0e4", world: "#a8dcff", garage: "#ffb066" };

/** A wide pixel scene to head a screen: rounded frame, drifting motes, a light sweep, a little parallax and a title plate. */
export function ScreenBanner({ theme, style, className, plate = true }: { theme: BannerTheme; style?: CSSProperties; className?: string; plate?: boolean }) {
  const fn = SCENES[theme] ?? SCENES.world;
  const pl = PLATE[theme] ?? PLATE.world;
  const motes = Array.from({ length: 16 }, (_, i) => i);
  return (
    <div
      className="bbn-frame"
      style={{ ["--bk" as string]: pl.k, ["--mote" as string]: MOTE[theme] ?? "#fff" }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--px", String(((e.clientX - r.left) / r.width - 0.5) * 2));
      }}
      onPointerLeave={(e) => e.currentTarget.style.setProperty("--px", "0")}
    >
      <svg
        className={`bbn${className ? " " + className : ""}`}
        data-banner={theme}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        shapeRendering="crispEdges"
        role="img"
        aria-label={`${theme} scene`}
        style={{ imageRendering: "pixelated", ...style }}
      >
        <style>{CSS}</style>
        {fn()}
      </svg>
      <div className="bbn-motes" aria-hidden="true">
        {motes.map((i) => (
          <i key={i} style={{ left: `${(i * 37 + 11) % 100}%`, animationDelay: `${-((i * 53) % 90) / 10}s`, animationDuration: `${7 + ((i * 29) % 60) / 10}s`, ["--s" as string]: `${3 + (i % 3) * 2}px` }} />
        ))}
      </div>
      <i className="bbn-shine" aria-hidden="true" />
      {plate && (
        <div className="bbn-plate">
          <span className="bbn-tile"><DeptIcon kind={pl.icon} size={26} /></span>
          <span className="bbn-text"><b>{pl.t}</b><small>{pl.sub}</small></span>
        </div>
      )}
    </div>
  );
}
