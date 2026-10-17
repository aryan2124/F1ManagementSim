import { useEffect, useRef } from "react";
import { Application, Container } from "pixi.js";
import { loadCircuit } from "../game/circuits";
import { TEAMS } from "../game/data";
import { buildTrackArt, M_PER_PX } from "./trackArt";
import { loadScene } from "./sceneGround";
import { AnimLayer } from "./animLayer";
import { MIXED_FANS } from "../game/venues";

/** Developer view: ?art=monaco&x=0&y=0&z=1&w=1280&h=720 draws one circuit's scenery without the race. */
export function ArtPreview({ params }: { params: URLSearchParams }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current!;
    if ((window as unknown as { __artStarted?: boolean }).__artStarted) return;
    (window as unknown as { __artStarted?: boolean }).__artStarted = true;
    const id = params.get("art")!;
    const W = Number(params.get("w") ?? 1280);
    const H = Number(params.get("h") ?? 720);
    const z = Number(params.get("z") ?? 1);
    const app = new Application();
    app
      .init({ width: W, height: H, antialias: false, background: 0x202020, resolution: 1, roundPixels: true, preference: "webgl" })
      .then(async () => {
        el.appendChild(app.canvas);
        const { meta, track } = loadCircuit(id);
        const scene = params.get("scene") === "off" ? null : await loadScene(id);
        const art = buildTrackArt(track, TEAMS, meta, 5, scene);
        const world = new Container();
        world.addChild(art.container);
        world.scale.set(z);
        const cxm = params.get("x") !== null ? Number(params.get("x")) : (art.bounds.minX + art.bounds.maxX) / 2 * M_PER_PX;
        const cym = params.get("y") !== null ? Number(params.get("y")) : (art.bounds.minY + art.bounds.maxY) / 2 * M_PER_PX;
        world.position.set(Math.round(W / 2 - (cxm / M_PER_PX) * z), Math.round(H / 2 - (cym / M_PER_PX) * z));
        const anim = new AnimLayer(app.renderer, id, scene, track, /Night$/.test(meta.theme), MIXED_FANS);
        world.addChild(anim.container);
        app.stage.addChild(world);
        const camx = (cxm / M_PER_PX);
        const camy = (cym / M_PER_PX);
        let last = performance.now();
        app.ticker.add(() => {
          const now = performance.now();
          anim.update((now - last) / 1000, camx, camy, W / z, H / z, 3);
          last = now;
        });
        (window as unknown as { __artReady: boolean }).__artReady = true;
      });
    return () => {
      app.ticker?.stop();
    };
  }, [params]);
  return <div ref={host} style={{ background: "#202020", width: "100vw", height: "100vh", overflow: "hidden" }} />;
}
