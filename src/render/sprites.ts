import { Graphics, type Renderer, type Texture } from "pixi.js";
import type { TeamSpec } from "../sim/types";

/** Tiny pixel car, 7x4 px, facing +x. */
export function makeCarTexture(renderer: Renderer, team: TeamSpec): Texture {
  const g = new Graphics();
  const dark = shade(team.color, 0.65);
  // rear wing
  g.rect(0, 0, 1, 4).fill(team.accent);
  // sidepods
  g.rect(2, 0, 3, 1).fill(dark);
  g.rect(2, 3, 3, 1).fill(dark);
  // body
  g.rect(1, 1, 5, 2).fill(team.color);
  // nose
  g.rect(6, 1, 1, 2).fill(shade(team.color, 1.15));
  // front wing
  g.rect(6, 0, 1, 1).fill(team.accent);
  g.rect(6, 3, 1, 1).fill(team.accent);
  // helmet
  g.rect(3, 1, 1, 2).fill(0xf4e9d0);
  const tex = renderer.generateTexture({ target: g, resolution: 1 });
  tex.source.scaleMode = "nearest";
  g.destroy();
  return tex;
}

export function makeSafetyCarTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  g.rect(0, 0, 1, 4).fill(0x222222);
  g.rect(1, 0, 6, 4).fill(0xff9f1c);
  g.rect(2, 1, 2, 2).fill(0x222222);
  g.rect(3, 1, 1, 1).fill(0xffee00);
  g.rect(3, 2, 1, 1).fill(0xe63946);
  g.rect(6, 1, 1, 2).fill(0xffffff);
  const tex = renderer.generateTexture({ target: g, resolution: 1 });
  tex.source.scaleMode = "nearest";
  g.destroy();
  return tex;
}

/** The safety car in the same four-times detail as the zoomed-in race cars (36 x 18 px, facing +x). */
export function makeSafetyCarTextureHi(renderer: Renderer): Texture {
  const g = new Graphics();
  const r = (x: number, y: number, w: number, h: number, c: number) => g.rect(x, y, w, h).fill(c);
  const tyre = 0x14141a;
  // wheels poking out under the body
  r(5, 0, 7, 3, tyre);
  r(5, 15, 7, 3, tyre);
  r(25, 0, 7, 3, tyre);
  r(25, 15, 7, 3, tyre);
  r(6, 0, 5, 1, 0x3a3a46);
  r(6, 17, 5, 1, 0x3a3a46);
  r(26, 0, 5, 1, 0x3a3a46);
  r(26, 17, 5, 1, 0x3a3a46);
  // body: rear deck, cabin, bonnet
  r(1, 2, 34, 14, 0xff9f1c);
  r(1, 2, 34, 2, 0xffc14d);
  r(1, 14, 34, 2, 0xc77400);
  // boot spoiler and tail lights
  r(0, 3, 2, 12, 0x222222);
  r(0, 4, 1, 2, 0xe63946);
  r(0, 12, 1, 2, 0xe63946);
  // glasshouse
  r(12, 4, 14, 10, 0x1b2230);
  r(13, 5, 5, 8, 0x2c3a52);
  r(21, 5, 4, 8, 0x2c3a52);
  r(18, 5, 3, 8, 0xff9f1c);
  // roof light bar, lit yellow with a red end
  r(16, 3, 4, 12, 0x2a2a30);
  r(17, 4, 2, 5, 0xffee00);
  r(17, 9, 2, 5, 0xffb300);
  r(16, 3, 4, 1, 0xe63946);
  r(16, 14, 4, 1, 0xe63946);
  // white racing stripe and bonnet vents
  r(2, 8, 10, 2, 0xffffff);
  r(27, 7, 7, 1, 0xc77400);
  r(27, 10, 7, 1, 0xc77400);
  // front splitter and headlights
  r(34, 3, 2, 12, 0x222222);
  r(34, 4, 1, 2, 0xfff4c2);
  r(34, 12, 1, 2, 0xfff4c2);
  const tex = renderer.generateTexture({ target: g, resolution: 1 });
  tex.source.scaleMode = "nearest";
  g.destroy();
  return tex;
}

export function shade(color: number, f: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 255) * f));
  const gg = Math.min(255, Math.round(((color >> 8) & 255) * f));
  const b = Math.min(255, Math.round((color & 255) * f));
  return (r << 16) | (gg << 8) | b;
}

/**
 * The same car drawn in four times the detail (32 x 18 px, facing +x), used when the player zooms in:
 * rear wing with end plates and DRS flap, fat rear tyres with a sidewall highlight, sidepods with inlets,
 * engine cover and airbox, halo and helmet, nose cone, front tyres on their wishbones, front wing end plates
 * and a livery stripe. At the normal zoom the little 7 x 4 car is still used, so the classic look is untouched.
 */
export function makeCarTextureHi(renderer: Renderer, team: TeamSpec): Texture {
  const g = new Graphics();
  const body = team.color;
  const dark = shade(body, 0.62);
  const mid = shade(body, 0.82);
  const light = shade(body, 1.25);
  const acc = team.accent;
  const accDark = shade(acc, 0.6);
  const tyre = 0x14141a;
  const tyreHi = 0x3a3a46;
  const carbon = 0x1c1c24;
  const r = (x: number, y: number, w: number, h: number, c: number) => g.rect(x, y, w, h).fill(c);
  // rear wing: main plane, DRS flap, end plates, a beam wing under it
  r(0, 2, 3, 14, accDark);
  r(0, 2, 2, 14, acc);
  r(2, 3, 1, 12, shade(acc, 1.2));
  r(0, 1, 4, 1, carbon);
  r(0, 16, 4, 1, carbon);
  r(3, 5, 2, 8, carbon);
  // rear tyres
  r(5, 0, 7, 4, tyre);
  r(5, 14, 7, 4, tyre);
  r(6, 0, 5, 1, tyreHi);
  r(6, 17, 5, 1, tyreHi);
  r(7, 1, 3, 2, 0x22222c);
  r(7, 15, 3, 2, 0x22222c);
  // floor edge and sidepods
  r(10, 4, 12, 10, dark);
  r(11, 4, 9, 2, mid);
  r(11, 12, 9, 2, mid);
  // sidepod inlets
  r(19, 4, 3, 2, carbon);
  r(19, 12, 3, 2, carbon);
  // engine cover and the spine down the middle
  r(4, 7, 18, 4, body);
  r(6, 8, 14, 2, light);
  // airbox above the driver's head
  r(14, 7, 4, 4, carbon);
  r(15, 8, 2, 2, 0x3a3a46);
  // livery stripe
  r(5, 8, 9, 1, acc);
  r(5, 9, 9, 1, accDark);
  // cockpit, helmet, halo
  r(19, 6, 6, 6, carbon);
  r(20, 7, 3, 4, 0xf4e9d0);
  r(21, 8, 1, 2, acc);
  r(19, 6, 6, 1, 0x555566);
  r(19, 11, 6, 1, 0x555566);
  r(24, 6, 1, 6, 0x555566);
  // nose cone: wide at the cockpit, narrowing to the tip
  r(24, 7, 4, 4, body);
  r(27, 8, 3, 2, light);
  r(29, 8, 1, 2, mid);
  // front wishbones and tyres
  r(22, 4, 5, 1, carbon);
  r(22, 13, 5, 1, carbon);
  r(22, 5, 1, 2, carbon);
  r(22, 11, 1, 2, carbon);
  r(22, 1, 5, 4, tyre);
  r(22, 13, 5, 4, tyre);
  r(23, 1, 3, 1, tyreHi);
  r(23, 16, 3, 1, tyreHi);
  // front wing: main plane and end plates
  r(29, 1, 3, 16, accDark);
  r(30, 1, 2, 16, acc);
  r(29, 0, 3, 1, carbon);
  r(29, 17, 3, 1, carbon);
  const tex = renderer.generateTexture({ target: g, resolution: 1 });
  tex.source.scaleMode = "linear";
  g.destroy();
  return tex;
}
