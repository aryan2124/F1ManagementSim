import { useEffect, useRef } from "react";
import { factoryClosed, inSummerBreak, weekendOf } from "../../career/calendar";
import { ymd } from "../../career/util";
import type { CareerState } from "../../career/types";

/** A small pixel picture of the factory. It reflects what is really happening: shutdowns, projects running, tunnel use, race week, the academy. */
export function FactoryView({ s }: { s: CareerState }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const sref = useRef(s);
  sref.current = s;
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    let f = 0;
    const P = 4;
    const W = cv.width / P;
    const H = cv.height / P;
    const r = (x: number, y: number, w: number, h: number, c: string) => {
      ctx.fillStyle = c;
      ctx.fillRect(x * P, y * P, w * P, h * P);
    };
    const draw = () => {
      f++;
      const st = sref.current;
      const me = st.teams[st.teamId];
      const closed = factoryClosed(st.day, st.year);
      const { m } = ymd(st.day);
      const winter = m === 12 || m <= 2;
      const summer = inSummerBreak(st.day, st.year);
      const raceWeek = !!weekendOf(st, st.day) || (!!st.weekend && st.weekend.stage !== "done");
      r(0, 0, W, H, winter ? "#2b3350" : summer ? "#7ec8e8" : "#4a6fb0");
      // sun or moon
      r(W - 14, 4, 6, 6, winter ? "#d8dcef" : "#ffe27a");
      // ground and road
      r(0, H - 8, W, 8, winter ? "#e8eef7" : "#3f7d3a");
      r(0, H - 5, W, 3, "#444a5a");
      for (let x = 0; x < W; x += 6) r(x, H - 4, 3, 1, "#9aa");
      // wind tunnel: a long tube, glowing when hours are being used
      const tl = me.facilities.tunnel;
      const useTunnel = me.projects.some((p) => p.status === "building" && p.tunnelHours > 0) && me.tunnelLeft > 0 && !closed;
      r(4, H - 22, 18 + tl * 3, 12, "#8b93a8");
      r(4, H - 22, 18 + tl * 3, 2, "#aab2c8");
      const glow = useTunnel ? (f % 8 < 4 ? "#7fffd4" : "#37c9a3") : "#2a3040";
      r(8, H - 18, 12 + tl * 3, 5, glow);
      // factory with a saw-tooth roof; lit windows = running projects
      const fx = 36 + tl * 3;
      const fl = me.facilities.factory;
      r(fx, H - 24, 22 + fl * 3, 16, "#b8654a");
      for (let i = 0; i < 3 + fl; i++) r(fx + i * 6, H - 28, 4, 4, "#8f4b36");
      const building = me.projects.filter((p) => p.status === "building").length;
      for (let i = 0; i < 4; i++) r(fx + 3 + i * 5, H - 19, 3, 4, !closed && i < building + 1 ? (f % 20 < 17 ? "#ffd866" : "#c9a43c") : "#2a2f3c");
      // simulator dome
      const sx = fx + 28 + fl * 3;
      r(sx, H - 20, 12, 12, "#6c7a96");
      r(sx + 2, H - 23, 8, 3, "#8c9ab6");
      r(sx + 4, H - 14, 4, 6, "#20263a");
      // academy hut
      const kids = Object.values(st.academy.prospects).filter((p) => p.owner === st.teamId && p.status === "academy").length;
      const ax = sx + 18;
      r(ax, H - 16, 10, 8, "#d9a441");
      r(ax - 1, H - 18, 12, 2, "#a67a22");
      for (let i = 0; i < Math.min(kids, 4); i++) r(ax + 1 + i * 2, H - 12, 1, 3, "#fff");
      // closed sign or trucks
      if (closed) {
        r(W / 2 - 14, 5, 28, 8, "#c0392b");
        ctx.fillStyle = "#fff";
        ctx.font = `${P * 5}px monospace`;
        ctx.fillText("CLOSED", (W / 2 - 12) * P, 11.2 * P);
        if (winter) for (let i = 0; i < 24; i++) r((i * 29 + f * (1 + (i % 3))) % W, (i * 13 + f * 2) % (H - 8), 1, 1, "#fff");
      }
      if (raceWeek) {
        const tx = (f * 2) % (W + 30) - 20;
        r(tx, H - 12, 18, 7, "#e7e7ef");
        r(tx + 13, H - 14, 6, 5, "#c9c9d6");
        r(tx + 2, H - 6, 3, 2, "#111");
        r(tx + 13, H - 6, 3, 2, "#111");
      }
    };
    const id = window.setInterval(draw, 140);
    draw();
    return () => window.clearInterval(id);
  }, []);
  return <canvas ref={ref} className="c-factory" width={560} height={140} aria-label="The factory" />;
}
