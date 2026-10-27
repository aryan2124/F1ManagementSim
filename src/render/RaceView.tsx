import { useEffect, useRef, useState } from "react";
import { Application, Container, Graphics, Rectangle, Sprite, Text, type Texture } from "pixi.js";
import type { LiveSession, LiveSim } from "../game/live";
import type { CircuitMeta } from "../game/circuits";
import { TEAMS } from "../game/data";
import { sampleTrack } from "../sim/track";
import type { SimEvent } from "../sim/types";
import type { ReactNode } from "react";
import { buildTrackArt, M_PER_PX, themeGround } from "./trackArt";
import { loadScene } from "./sceneGround";
import { AnimLayer } from "./animLayer";
import { MIXED_FANS, VENUES } from "../game/venues";
import { makeCarTexture, makeCarTextureHi, makeSafetyCarTexture, makeSafetyCarTextureHi } from "./sprites";
import { getPrefs, setPref } from "../ui/prefs";
import { useUiTick } from "../ui/hooks";
import { WeatherFx } from "./weatherFx";
import { drawCrew, lift } from "./pitCrew";
import { DT } from "../sim/engine";

export const VIEW_W = 640;
export const VIEW_H = 360;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: number;
  size: number;
}

const SNAP = Math.PI / 8;

/** The pixel race canvas (PixiJS) + overlays (start lights, safety car, follow tag). */
export function RaceView({ session, meta, children }: { session: LiveSession<LiveSim>; meta: CircuitMeta; children?: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const [zoom, setZoomState] = useState(() => Math.max(1, Math.min(2.5, Math.round((getPrefs().zoom || 1) * 4) / 4)));
  const changeZoom = (z: number) => {
    const v = Math.round(Math.max(1, Math.min(2.5, z)) * 4) / 4;
    setZoomState(v);
    setPref("zoom", v);
    window.dispatchEvent(new CustomEvent("boxbox-zoom", { detail: v }));
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "+" || e.key === "=") changeZoom(zoom + 0.25);
      else if (e.key === "-" || e.key === "_") changeZoom(zoom - 0.25);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useUiTick(100);
  const sim = session.sim;
  void sim;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let cancelled = false;
    const app = new Application();
    let cleanup: (() => void) | null = null;

    const ready = app
      .init({
        width: VIEW_W,
        height: VIEW_H,
        antialias: false,
        background: themeGround(meta.theme),
        resolution: 1,
        autoDensity: false,
        roundPixels: true,
        // ask for the fast GPU on laptops that have two, and never fall back to a slower path silently
        powerPreference: "high-performance",
        preference: "webgl",
      })
      .then(async () => {
        try {
          await document.fonts?.load('8px "Press Start 2P"');
        } catch {
          /* fall back to the default font */
        }
        if (cancelled) return;
        const canvas = app.canvas;
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.imageRendering = "pixelated";
        canvas.style.display = "block";
        el.appendChild(canvas);

        const track = session.sim.track;
        const scene = await loadScene(meta.id);
        if (cancelled) return;
        const liveTeams = TEAMS.map((tm) => session.sim.cars.find((c) => c.entry.team.id === tm.id)?.entry.team ?? tm);
        const art = buildTrackArt(track, liveTeams, meta, 5, scene);
        const world = new Container();
        // The static world (ground, road, trees, stands, crowds) is thousands of small shapes. Redrawing them
        // every frame is what made the game slow, so bake them once into big textures and draw only the tiles in view.
        const TILE = 1024;
        const tiles: { sprite: Sprite; x: number; y: number; lo: Texture; hi?: Texture }[] = [];
        const b = art.bounds;
        const bx0 = Math.floor(b.minX / TILE) * TILE;
        const by0 = Math.floor(b.minY / TILE) * TILE;
        for (let ty = by0; ty < b.maxY; ty += TILE) {
          for (let tx = bx0; tx < b.maxX; tx += TILE) {
            const tex = app.renderer.generateTexture({ target: art.container, frame: new Rectangle(tx, ty, TILE, TILE), resolution: 1, antialias: false });
            tex.source.scaleMode = "nearest";
            const sp = new Sprite(tex);
            sp.position.set(tx, ty);
            world.addChild(sp);
            tiles.push({ sprite: sp, x: tx, y: ty, lo: tex });
          }
        }
        // the art stays alive so the tiles in view can be baked again at double resolution when the player zooms in
        const skids = new Graphics();
        world.addChild(skids);
        let skidSegs = 0;
        const lastRear = new Map<string, { x: number; y: number }[]>();
        const donut = new Map<string, { x: number; y: number; heading: number }>();
        const night = /Night$/.test(meta.theme);
        const anim = new AnimLayer(app.renderer, meta.id, scene, track, night, VENUES[meta.id]?.fans ?? MIXED_FANS);
        world.addChild(anim.container);
        const fx = new Graphics();
        world.addChild(fx);
        // the zoom: the ground, scenery and particles scale up (chunky pixels), the cars are drawn on top at screen size
        // with a detailed texture so that zooming in reveals more car, not just bigger blobs
        const zoomRoot = new Container();
        zoomRoot.addChild(world);
        app.stage.addChild(zoomRoot);
        const carLayer = new Container();
        app.stage.addChild(carLayer);
        let Z = Math.max(1, Math.min(2.5, getPrefs().zoom || 1));
        let res = 1;
        const applyZoom = (z: number) => {
          Z = Math.max(1, Math.min(2.5, z));
          const want = Z > 1.25 ? 2 : 1;
          if (want !== res) {
            res = want;
            app.renderer.resize(VIEW_W, VIEW_H, res);
          }
        };
        applyZoom(Z);
        const onZoom = (e: Event) => applyZoom((e as CustomEvent<number>).detail);
        window.addEventListener("boxbox-zoom", onZoom);
        const wfx = new WeatherFx(VIEW_W, VIEW_H);
        app.stage.addChild(wfx.container);
        const redBorder = new Graphics();
        app.stage.addChild(redBorder);
        const L = track.length;
        const wrap = (v: number) => ((v % L) + L) % L;

        const textures = new Map<string, Texture>();
        const texturesHi = new Map<string, Texture>();
        // built from the entries in this session (they carry any livery colour), falling back to the base list
        const specs = new Map<string, (typeof TEAMS)[number]>();
        for (const t of TEAMS) specs.set(t.id, t);
        for (const c of session.sim.cars) specs.set(c.entry.team.id, c.entry.team);
        for (const t of specs.values()) {
          textures.set(t.id, makeCarTexture(app.renderer, t));
          texturesHi.set(t.id, makeCarTextureHi(app.renderer, t));
        }
        const scTex = makeSafetyCarTexture(app.renderer);
        const scTexHi = makeSafetyCarTextureHi(app.renderer);
        const scSprite = new Sprite(scTex);
        scSprite.anchor.set(0.5);
        scSprite.visible = false;

        const sprites = new Map<string, { sprite: Sprite; label: Text | null }>();
        for (const c of session.sim.cars) {
          const sprite = new Sprite(textures.get(c.entry.team.id));
          sprite.anchor.set(0.5);
          carLayer.addChild(sprite);
          let label: Text | null = null;
          if (c.entry.human) {
            label = new Text({
              text: c.entry.driver.code,
              style: { fontFamily: "Press Start 2P", fontSize: 8, fill: 0xffffff, stroke: { color: 0x14111f, width: 3 } },
            });
            label.anchor.set(0.5, 1);
            carLayer.addChild(label);
          }
          sprites.set(c.id, { sprite, label });
        }
        carLayer.addChild(scSprite);

        const particles: Particle[] = [];
        let shake = 0;
        const cam = { x: 0, y: 0, init: false };

        const proj = (x: number, y: number) => ({ x: Math.round(((x - cam.x) * Z + VIEW_W / 2) * res) / res, y: Math.round(((y - cam.y) * Z + VIEW_H / 2) * res) / res });
        const posOf = (id: string) => {
          const over = donut.get(id);
          if (over) return over;
          const car = session.sim.car(id);
          const i = session.interp(car);
          const t = sampleTrack(track, i.s);
          const nx = Math.sin(t.heading);
          const ny = -Math.cos(t.heading);
          return {
            x: (t.x + nx * i.lateral) / M_PER_PX,
            y: (t.y + ny * i.lateral) / M_PER_PX,
            heading: t.heading,
          };
        };

        const burst = (x: number, y: number, colors: number[], n: number, speed: number) => {
          for (let k = 0; k < n; k++) {
            const a = Math.random() * Math.PI * 2;
            const sp = (0.3 + Math.random()) * speed;
            particles.push({
              x,
              y,
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp,
              life: 0,
              max: 0.4 + Math.random() * 0.5,
              color: colors[Math.floor(Math.random() * colors.length)],
              size: Math.random() < 0.3 ? 2 : 1,
            });
          }
        };

        const offEvent = session.onEvent((e: SimEvent) => {
          if (!e.carId) return;
          const p = posOf(e.carId);
          if (e.kind === "overtake") burst(p.x, p.y, [0xffffff, 0xf9c74f, 0xff7a1a], 14, 40);
          else if (e.kind === "fastest_lap") burst(p.x, p.y, [0xb66cff, 0xe0b8ff, 0xffffff], 22, 55);
          else if (e.kind === "crash") {
            burst(p.x, p.y, [0xff7a1a, 0xe63946, 0xf9c74f, 0x333333], 34, 70);
            shake = 7;
          } else if (e.kind === "spin" || e.kind === "lockup") burst(p.x, p.y, [0xeeeeee, 0xbbbbbb, 0x888888], e.kind === "spin" ? 16 : 8, 30);
          else if (e.kind === "gravel" || e.kind === "off_track") burst(p.x, p.y, [0xc9b27c, 0xa08c5b, 0x7a6a44], 22, 45);
          else if (e.kind === "wall" || e.kind === "damage" || e.kind === "debris") {
            burst(p.x, p.y, [0x222222, 0xe63946, 0xf9c74f, 0xffffff], e.kind === "wall" ? 26 : 12, 60);
            if (e.kind === "wall") shake = Math.max(shake, 4);
          } else if (e.kind === "failure") burst(p.x, p.y, [0x999999, 0x555555, 0xdddddd], 18, 25);
          else if (e.kind === "pit_out") burst(p.x, p.y, [0xffffff, 0xcccccc], 8, 25);
        });

        let skid = 0;
        // ---- donuts after the flag: the champion and the drivers who are retiring burn rubber on the start straight
        const cel = session as unknown as { donutIds?: string[]; celebrateFrom: number; celebrateMs: number; sim: { phase?: string } };
        let zoomBack = false;
        const runDonuts = () => {
          donut.clear();
          if (cel.sim.phase !== "finished" || !cel.donutIds?.length) return;
          const now = performance.now();
          if (!cel.celebrateFrom) {
            cel.celebrateFrom = now;
            cel.celebrateMs = 3500 + 3200 * Math.min(3, cel.donutIds!.length);
            session.directing = false;
            session.followId = cel.donutIds![0]!;
            window.dispatchEvent(new CustomEvent("boxbox-zoom", { detail: 2 }));
          }
          const el = (now - cel.celebrateFrom) / 1000;
          if (el * 1000 > cel.celebrateMs) {
            if (!zoomBack) {
              zoomBack = true;
              window.dispatchEvent(new CustomEvent("boxbox-zoom", { detail: Math.max(1, getPrefs().zoom || 1) }));
            }
            return;
          }
          cel.donutIds!.forEach((id, i) => {
            const t = Math.max(0, el - 0.4 * i);
            const c0 = sampleTrack(track, L - 30 - i * 26);
            const nx = Math.sin(c0.heading), ny = -Math.cos(c0.heading);
            const cx = (c0.x + nx * (i % 2 ? 2 : -2)) / M_PER_PX;
            const cy = (c0.y + ny * (i % 2 ? 2 : -2)) / M_PER_PX;
            // spin up over the first second, then hold a tight circle
            const spin = Math.min(1, t / 1.0);
            const th = i * 1.7 + (t < 1 ? 1.65 * t * t : 1.65 + 3.3 * (t - 1));
            const rad = (9 - 4 * Math.min(1, t / 1.6)) / M_PER_PX;
            const x = cx + Math.cos(th) * rad;
            const y = cy + Math.sin(th) * rad;
            const heading = th + Math.PI / 2 + 0.55 * spin;
            donut.set(id, { x, y, heading });
            if (t < 0.2) return;
            // smoke off the rear tyres and rubber on the tarmac
            const bx = Math.cos(heading), by = Math.sin(heading);
            for (let k = 0; k < 3; k++) burst(x - bx * 3.2 + (Math.random() - 0.5) * 2, y - by * 3.2 + (Math.random() - 0.5) * 2, [0xffffff, 0xe6e6e6, 0xbdbdbd], 1, 12);
            const px = -by, py = bx;
            const rear = [
              { x: x - bx * 2.6 + px * 1.1, y: y - by * 2.6 + py * 1.1 },
              { x: x - bx * 2.6 - px * 1.1, y: y - by * 2.6 - py * 1.1 },
            ];
            const prev = lastRear.get(id);
            if (prev && skidSegs < 1400) {
              for (let w = 0; w < 2; w++) skids.moveTo(prev[w]!.x, prev[w]!.y).lineTo(rear[w]!.x, rear[w]!.y);
              skids.stroke({ width: 1, color: 0x0c0c10, alpha: 0.5 });
              skidSegs += 2;
            }
            lastRear.set(id, rear);
          });
        };
        const onTick = (ticker: { deltaMS: number }) => {
          const dt = ticker.deltaMS / 1000;
          session.advance(dt);
          runDonuts();

          // camera
          const f = posOf(session.followId);
          if (!cam.init) {
            cam.x = f.x;
            cam.y = f.y;
            cam.init = true;
          }
          const k = 1 - Math.pow(0.0005, dt);
          cam.x += (f.x - cam.x) * k;
          cam.y += (f.y - cam.y) * k;
          {
            // keep the view inside the world so the edge of the map is never visible
            const bb = art.bounds;
            const hx = VIEW_W / 2 / Z + 2;
            const hy = VIEW_H / 2 / Z + 2;
            cam.x = bb.maxX - bb.minX <= hx * 2 ? (bb.minX + bb.maxX) / 2 : Math.min(bb.maxX - hx, Math.max(bb.minX + hx, cam.x));
            cam.y = bb.maxY - bb.minY <= hy * 2 ? (bb.minY + bb.maxY) / 2 : Math.min(bb.maxY - hy, Math.max(bb.minY + hy, cam.y));
          }
          shake = Math.max(0, shake - dt * 14);
          const sx = shake > 0 ? Math.round((Math.random() - 0.5) * shake * 2) : 0;
          const sy = shake > 0 ? Math.round((Math.random() - 0.5) * shake * 2) : 0;
          zoomRoot.scale.set(Z);
          zoomRoot.position.set(Math.round((VIEW_W / 2 - cam.x * Z + sx) * res) / res, Math.round((VIEW_H / 2 - cam.y * Z + sy) * res) / res);
          carLayer.position.set(sx, sy);
          // only the tiles that touch the screen are drawn
          const vw = VIEW_W / Z;
          const vh = VIEW_H / Z;
          const vx0 = cam.x - vw / 2 - 8;
          const vy0 = cam.y - vh / 2 - 8;
          let bakedOne = false;
          for (const t of tiles) {
            const vis = t.x < vx0 + vw + 16 && t.x + TILE > vx0 && t.y < vy0 + vh + 16 && t.y + TILE > vy0;
            t.sprite.visible = vis;
            if (!vis) {
              // out of view: let go of the big texture
              if (t.hi && Z < 1.3) {
                t.sprite.texture = t.lo;
                t.hi.destroy(true);
                t.hi = undefined;
              }
              continue;
            }
            if (Z >= 1.3) {
              if (!t.hi && !bakedOne) {
                // one tile per frame so zooming in never stalls
                bakedOne = true;
                t.hi = app.renderer.generateTexture({ target: art.container, frame: new Rectangle(t.x, t.y, TILE, TILE), resolution: 2, antialias: false });
                t.hi.source.scaleMode = "nearest";
              }
              if (t.hi) t.sprite.texture = t.hi;
            } else {
              if (t.hi) {
                t.sprite.texture = t.lo;
                t.hi.destroy(true);
                t.hi = undefined;
              }
            }
          }

          anim.update(dt, cam.x, cam.y, vw, vh, session.sim.weather?.windBase ?? 3);

          // cars
          const crewJobs: { x: number; y: number; h: number; p: number; colour: number; slow: boolean }[] = [];
          for (const c of session.sim.cars) {
            const s = sprites.get(c.id);
            if (!s) continue;
            const p = posOf(c.id);
            const sp = proj(p.x, p.y);
            s.sprite.x = sp.x;
            s.sprite.y = sp.y;
            if (Z >= 1.3) {
              // zoomed in: the detailed car, turning smoothly
              s.sprite.texture = texturesHi.get(c.entry.team.id)!;
              s.sprite.scale.set(Z / 3.2);
              s.sprite.rotation = p.heading + (c.spin || 0);
            } else {
              s.sprite.texture = textures.get(c.entry.team.id)!;
              s.sprite.scale.set(Z);
              s.sprite.rotation = Math.round(p.heading / SNAP) * SNAP + (c.spin || 0);
            }
            s.sprite.visible = !c.removed;
            s.sprite.alpha = c.status === "dnf" ? 0.55 : 1;
            if (c.status === "pit_stop" && c.stopSecs && !c.removed) {
              const prog = Math.max(0, Math.min(1, 1 - ((c.pitTimer ?? 0) * DT) / c.stopSecs));
              const up = lift(prog);
              if (up > 0) s.sprite.scale.set(s.sprite.scale.x * (1 + 0.05 * up));
              crewJobs.push({ x: p.x, y: p.y, h: p.heading, p: prog, colour: c.entry.team.color, slow: !!c.slowStop });
            }
            // boost: a flame of hot pixels streams out of the back while the push to pass is on
            if (!c.removed && (c.boostUntil ?? 0) > session.sim.tick && c.v > 20 && Math.random() < 0.6) {
              const bfx = Math.cos(p.heading);
              const bfy = Math.sin(p.heading);
              particles.push({ x: p.x - bfx * 3 + (Math.random() - 0.5), y: p.y - bfy * 3 + (Math.random() - 0.5), vx: -bfx * 22, vy: -bfy * 22, life: 0, max: 0.18 + Math.random() * 0.12, color: Math.random() < 0.5 ? 0x4cc9f0 : 0xffffff, size: 1 });
            }
            // a car with a damaged floor throws sparks off the tarmac
            if (!c.removed && (c.damage?.floor ?? 0) > 0.03 && c.v > 40 && Math.random() < 0.12) {
              const sfx = Math.cos(p.heading);
              const sfy = Math.sin(p.heading);
              particles.push({ x: p.x - sfx * 2.4, y: p.y - sfy * 2.4, vx: -sfx * 20 + (Math.random() - 0.5) * 14, vy: -sfy * 20 + (Math.random() - 0.5) * 14, life: 0, max: 0.25 + Math.random() * 0.2, color: Math.random() < 0.5 ? 0xffd23f : 0xff7a1a, size: 1 });
            }
            if (c.removed && s.label) s.label.visible = false;
            // wet spray behind a fast car, smoke from a damaged or stricken one
            const wxw = session.sim.weather;
            if (wxw && !c.removed && c.v > 25) {
              const wetHere = wxw.wet[Math.min(2, Math.floor(wrap(c.s) / (L / 3)))];
              if (wetHere > 0.12 && Math.random() < Math.min(0.9, wetHere * 1.3) * Math.min(1, c.v / 70)) {
                // the car travels along (cos h, sin h), so the rooster tail sits straight behind it and drifts back
                const fx1 = Math.cos(p.heading);
                const fy1 = Math.sin(p.heading);
                const back = 6 + Math.random() * 3;
                particles.push({ x: p.x - fx1 * back + (Math.random() - 0.5) * 3, y: p.y - fy1 * back + (Math.random() - 0.5) * 3, vx: -fx1 * 6 + (Math.random() - 0.5) * 6, vy: -fy1 * 6 + (Math.random() - 0.5) * 6, life: 0, max: 0.35 + wetHere * 0.5, color: 0xd8e4f2, size: Math.random() < 0.4 ? 2 : 1 });
              }
            }
            if (!c.removed && (c.damage?.puncture || c.incident) && Math.random() < 0.25) burst(p.x, p.y, c.damage?.puncture ? [0xdddddd, 0x888888] : [0xc9b27c, 0x777777], 1, 14);
            if (s.label) {
              s.label.x = sp.x;
              s.label.y = sp.y - 6 * Z;
              s.label.alpha = c.status === "dnf" ? 0.5 : 1;
            }
            // tyre smoke under heavy braking
            if (c.status === "racing" && c.v > 30 && Math.random() < 0.02) {
              const t = sampleTrack(track, c.s);
              if (Math.abs(t.curv) > 0.004) burst(p.x, p.y, [0xdddddd, 0xaaaaaa], 1, 10);
            }
          }

          // safety car leads the pack, and goes into the pit lane at the end of its last lap
          const scs = session.sim.sc;
          if (scs && scs.vis) {
            const t = sampleTrack(track, scs.s);
            const nx = Math.sin(t.heading), ny = -Math.cos(t.heading);
            scSprite.visible = true;
            const scp = proj((t.x + nx * scs.lat) / M_PER_PX, (t.y + ny * scs.lat) / M_PER_PX);
            scSprite.x = scp.x;
            scSprite.y = scp.y;
            if (Z >= 1.3) {
              scSprite.texture = scTexHi;
              scSprite.scale.set(Z / 3.2);
              scSprite.rotation = t.heading;
            } else {
              scSprite.texture = scTex;
              scSprite.scale.set(Z);
              scSprite.rotation = Math.round(t.heading / SNAP) * SNAP;
            }
            skid++;
            scSprite.tint = skid % 20 < 10 ? 0xffffff : 0xffe9a0;
          } else scSprite.visible = false;

          // overlays: weather, local yellows, red flag
          const fcar = session.sim.car(session.followId);
          const fsec = Math.min(2, Math.floor(wrap(fcar.s) / (L / 3)));
          wfx.update(dt, session.sim.weather ?? undefined, session.sim.weather ? session.sim.weather.wet[fsec] : 0, (f.x - cam.x) / Math.max(dt, 0.001), (f.y - cam.y) / Math.max(dt, 0.001));
          redBorder.clear();
          const incs = (session.sim as { inc?: { red: { active: boolean }; yellowAt: (k: number) => boolean } }).inc;
          if (incs?.red.active) redBorder.rect(2, 2, VIEW_W - 4, VIEW_H - 4).stroke({ width: 4, color: 0xe63946, alpha: 0.6 + 0.4 * Math.sin(skid * 0.4) });

          // particles
          fx.clear();
          for (const j of crewJobs) drawCrew(fx, j.x, j.y, j.h, j.p, j.colour, performance.now(), j.slow, []);
          if (incs) {
            for (let k = 0; k < 3; k++) {
              if (!incs.yellowAt(k)) continue;
              const post = sampleTrack(track, (k * L) / 3 + 40);
              const nx = Math.sin(post.heading);
              const ny = -Math.cos(post.heading);
              const fx0 = (post.x + nx * 11) / M_PER_PX;
              const fy0 = (post.y + ny * 11) / M_PER_PX;
              const wave = Math.floor(performance.now() / 180) % 2;
              fx.rect(Math.round(fx0), Math.round(fy0) - 8, 1, 9).fill(0xdddddd);
              fx.rect(Math.round(fx0) + 1, Math.round(fy0) - 8 + wave, 6, 4).fill(0xf9c74f);
            }
          }
          for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.life += dt;
            if (p.life > p.max) {
              particles.splice(i, 1);
              continue;
            }
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vx *= 0.96;
            p.vy *= 0.96;
            fx.rect(Math.round(p.x), Math.round(p.y), p.size, p.size).fill({ color: p.color, alpha: 1 - p.life / p.max });
          }
        };
        app.ticker.add(onTick);
        cleanup = () => {
          offEvent();
          window.removeEventListener("boxbox-zoom", onZoom);
          app.ticker.remove(onTick);
          anim.destroy();
        };
      });

    return () => {
      cancelled = true;
      ready.then(() => {
        cleanup?.();
        app.destroy(true, { children: true, texture: true });
      });
    };
  }, [session, meta]);

  const followCar = session.sim.car(session.followId);

  return (
    <div className="raceview">
      <div className="raceview-canvas" ref={host} />
      <div className="crt" />
      {children}
      <div className="zoombox" title="Zoom (keys + and -)">
        <button className="tiny" onClick={() => changeZoom(zoom - 0.25)} aria-label="Zoom out">-</button>
        <span>{zoom.toFixed(2).replace(/0$/, "")}x</span>
        <button className="tiny" onClick={() => changeZoom(zoom + 0.25)} aria-label="Zoom in">+</button>
      </div>
      <div className="follow-tag" style={{ borderColor: `#${followCar.entry.team.color.toString(16).padStart(6, "0")}` }}>
        CAM {followCar.entry.driver.code}
      </div>
    </div>
  );
}
