import type { CSSProperties, ReactElement } from "react";
import { Grid, PAL, gridRects } from "./grid";

/** An animated pixel news studio: anchor behind a desk, a monitor with a rotating graphic, blinking eyes,
 *  a lower-third with the headline and an optional BREAKING banner. All art is SVG rects, animation is CSS steps. */

const W = 160;
const H = 90;

const PALX: Record<string, string> = {
  ...PAL,
  S: "#e8b98f",
  D: "#c98d5f",
  H: "#3a2414",
  J: "#27396b", // jacket
  K: "#1a2850",
  F: "#8a5a2b", // desk top
  G: "#3a2f66", // desk front
  P: "#1f1838", // wall dark
  Q: "#2a2150", // wall light
  M: "#101a3a", // monitor screen
};

function staticScene(): Grid {
  const g = new Grid(W, H);
  // wall: banded with dithered edges
  for (let y = 0; y < 70; y++) {
    const band = Math.floor(y / 14) % 2 === 0 ? "P" : "Q";
    g.r(0, y, W, 1, band);
  }
  for (let y = 13; y < 70; y += 14) for (let x = y % 28 === 13 ? 0 : 1; x < W; x += 2) g.p(x, y, y % 28 === 13 ? "Q" : "P");
  // vertical studio light strips
  for (const x of [6, 36, 86, 150]) {
    g.r(x, 0, 2, 66, "s");
    g.r(x, 0, 2, 3, "y");
    g.r(x, 63, 2, 3, "y");
  }
  // logo plate on the left
  g.r(10, 6, 24, 17, "k").r(11, 7, 22, 15, "r");
  g.text(14, 9, "BOX", "w").text(14, 15, "BOX", "w");
  // monitor frame
  g.r(94, 6, 56, 40, "k").r(95, 7, 54, 38, "s").r(97, 9, 50, 34, "k").r(98, 10, 48, 32, "M");
  g.r(118, 46, 8, 4, "s").r(112, 50, 20, 2, "s");
  // anchor torso: jacket, shirt, tie
  g.r(40, 52, 40, 16, "J").r(44, 48, 32, 4, "J").r(50, 46, 20, 2, "J");
  g.r(36, 56, 4, 12, "J").r(80, 56, 4, 12, "J");
  g.r(52, 48, 16, 20, "K");
  g.r(54, 46, 12, 2, "D").r(55, 46, 10, 12, "w");
  g.r(58, 48, 4, 3, "r").r(59, 51, 2, 14, "r");
  g.r(52, 50, 3, 18, "J").r(65, 50, 3, 18, "J");
  g.p(50, 52, "y").p(51, 52, "y"); // lapel pin
  g.r(66, 54, 2, 3, "k"); // lapel mic
  // neck
  g.r(55, 41, 10, 5, "D");
  // head
  g.disc(60, 30, 10, "S", 12);
  g.r(50, 30, 1, 4, "D").r(69, 30, 1, 4, "D");
  // hair
  g.r(50, 17, 20, 8, "H").r(48, 21, 3, 11, "H").r(69, 21, 3, 11, "H").r(52, 15, 16, 2, "H");
  g.r(53, 25, 5, 2, "H").r(51, 25, 3, 3, "H");
  g.p(52, 14, "H");
  // brows
  g.r(54, 27, 5, 1, "H").r(62, 27, 5, 1, "H");
  // eyes
  g.r(54, 30, 4, 3, "w").r(63, 30, 4, 3, "w");
  g.r(55, 30, 2, 3, "k").r(64, 30, 2, 3, "k");
  // nose and mouth
  g.r(59, 33, 2, 3, "D");
  g.r(57, 38, 6, 1, "e");
  // desk
  g.r(6, 66, 148, 3, "F").r(6, 66, 148, 1, "y");
  g.r(8, 69, 144, 21, "G").r(8, 69, 144, 1, "k");
  for (let x = 14; x < 150; x += 24) g.r(x, 73, 20, 12, "n").r(x + 1, 74, 18, 1, "s");
  // logo on desk front
  g.r(64, 72, 32, 14, "r").r(65, 73, 30, 12, "k");
  g.text(68, 76, "BB", "y").text(80, 76, "NEWS", "w");
  // hands, papers, plant
  g.r(50, 64, 6, 3, "S").r(66, 64, 6, 3, "S");
  g.r(86, 62, 16, 4, "w").r(87, 63, 10, 1, "d").r(110, 63, 8, 3, "y");
  g.r(20, 60, 6, 6, "g").r(21, 58, 4, 2, "g").r(22, 56, 2, 2, "g");
  g.r(22, 64, 2, 2, "o");
  return g;
}

/** Monitor content: a radar sweep over a globe, drawn in 8 frames. */
function monitorBase(): Grid {
  const g = new Grid(48, 32);
  g.r(0, 0, 48, 32, "M");
  g.r(0, 0, 48, 7, "r").text(2, 1, "LIVE", "w");
  g.disc(24, 19, 10, "n");
  g.ring(24, 19, 10, "t", 1.4);
  g.ring(24, 19, 5, "b", 1.0);
  g.r(14, 19, 21, 1, "b").r(24, 9, 1, 21, "b");
  g.r(2, 26, 8, 4, "y").r(2, 22, 8, 3, "g").r(38, 24, 8, 6, "h").r(38, 20, 8, 3, "p");
  return g;
}
function monitorFrame(i: number): Grid {
  const g = new Grid(48, 32);
  const a = (i / 8) * Math.PI * 2;
  const x1 = Math.round(24 + Math.sin(a) * 9);
  const y1 = Math.round(19 - Math.cos(a) * 9);
  g.l(24, 19, x1, y1, "y");
  g.disc(x1, y1, 1, "w");
  const b = a + 2.3;
  g.p(Math.round(24 + Math.sin(b) * 6), Math.round(19 - Math.cos(b) * 6), "r");
  g.r(2, 26 - (i % 4) * 2, 8, 1, "w");
  g.r(38, 22 + ((i + 2) % 4) * 2, 8, 1, "w");
  return g;
}

const CSS = `
.bbna{position:relative;width:100%;aspect-ratio:16/9;container-type:inline-size;background:#1f1838;overflow:hidden;image-rendering:pixelated;font-family:"VT323",monospace;}
.bbna svg{display:block;width:100%;height:100%;image-rendering:pixelated;}
.bbna .f{opacity:0;animation:bbna-f 1.6s steps(1) infinite;}
@keyframes bbna-f{0%{opacity:1}12.5%{opacity:0}100%{opacity:0}}
.bbna .blink{opacity:0;animation:bbna-blink 3.6s steps(1) infinite;}
@keyframes bbna-blink{0%{opacity:0}92%{opacity:0}93%{opacity:1}96%{opacity:1}97%{opacity:0}100%{opacity:0}}
.bbna .talk{opacity:0;animation:bbna-talk .64s steps(1) infinite;}
@keyframes bbna-talk{0%{opacity:0}30%{opacity:1}55%{opacity:0}75%{opacity:1}90%{opacity:0}}
.bbna .lt{position:absolute;left:3%;right:3%;bottom:5%;display:flex;align-items:stretch;min-height:11%;box-shadow:0 0 0 2px #0b0814;}
.bbna .lt b{flex:none;display:flex;align-items:center;padding:0 2.2cqw;background:#ff7a1a;color:#0b0814;font-family:"Press Start 2P",monospace;font-weight:400;font-size:max(6px,1.7cqw);}
.bbna .lt span{flex:1 1 auto;min-width:0;display:flex;align-items:center;padding:.4cqw 2cqw;background:#101a3a;color:#f4e9d0;font-size:max(13px,4cqw);line-height:1;border-top:2px solid #f9c74f;}
.bbna .lt i{font-style:normal;display:block;min-width:0;width:100%;white-space:nowrap;overflow:hidden;}
.bbna .lt i u{text-decoration:none;display:inline-block;padding-left:100%;animation:bbna-mq var(--mq,14s) linear infinite;}
@keyframes bbna-mq{from{transform:translateX(0)}to{transform:translateX(-100%)}}
@media (prefers-reduced-motion:reduce){.bbna .lt i u{animation:none;padding-left:0}}
.bbna .brk{position:absolute;left:3%;bottom:19%;padding:.8cqw 2cqw;background:#e63946;color:#fff;font-family:"Press Start 2P",monospace;font-size:max(7px,2cqw);box-shadow:0 0 0 2px #0b0814, 3px 3px 0 2px #0b0814;animation:bbna-brk 1s steps(1) infinite;}
@keyframes bbna-brk{0%{background:#e63946}50%{background:#9b1c28}}
@media (prefers-reduced-motion:reduce){.bbna .f,.bbna .blink,.bbna .talk,.bbna .brk{animation:none}.bbna .f:first-child{opacity:1}}
`;

export function NewsAnchor({ headline = "BOX BOX NEWS: STAY TUNED FOR THE LATEST FROM THE PADDOCK", breaking = false }: { headline?: string; breaking?: boolean }) {
  const scene = staticScene();
  const base = monitorBase();
  const frames: ReactElement[] = [];
  for (let i = 0; i < 8; i++) {
    const style: CSSProperties = { animationDelay: `${(i * 0.2).toFixed(2)}s` };
    frames.push(
      <g className="f" key={i} style={style}>
        {gridRects(monitorFrame(i).rows(), PALX, `m${i}`)}
      </g>,
    );
  }
  const lids = new Grid(W, H).r(54, 30, 4, 3, "S").r(63, 30, 4, 3, "S").r(54, 32, 4, 1, "D").r(63, 32, 4, 1, "D");
  const mouth = new Grid(W, H).r(57, 37, 6, 4, "k").r(58, 39, 4, 1, "r").r(58, 37, 4, 1, "w");
  return (
    <div className="bbna" data-component="news-anchor" role="img" aria-label={breaking ? `Breaking news: ${headline}` : `News: ${headline}`}>
      <style>{CSS}</style>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" shapeRendering="crispEdges" aria-hidden="true">
        {gridRects(scene.rows(), PALX, "s")}
        <g transform="translate(98 10)">
          {gridRects(base.rows(), PALX, "b")}
          {frames}
        </g>
        <g className="blink">{gridRects(lids.rows(), PALX, "l")}</g>
        <g className="talk">{gridRects(mouth.rows(), PALX, "t")}</g>
      </svg>
      {breaking ? <div className="brk">BREAKING</div> : null}
      <div className="lt">
        <b>{breaking ? "ALERT" : "NEWS"}</b>
        <span title={headline}><i><u style={{ ["--mq" as string]: `${Math.max(9, headline.length * 0.32)}s` } as CSSProperties}>{headline}</u></i></span>
      </div>
    </div>
  );
}
