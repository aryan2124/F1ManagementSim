import { useEffect, useMemo, useRef, useState } from "react";
import type { LiveSession, LiveSim } from "../game/live";
import { BRAINS, DEFAULT_BRAIN } from "../sim/strategy";
import { makeProfile, TeamRadar, intensityWord } from "../sim/radar";
import { STATE_LABEL, wetLoss } from "../sim/weather";
import { RaceSim } from "../sim/engine";
import type { Compound } from "../sim/types";
import { CompoundBadge } from "./Briefing";
import { useUiTick } from "./hooks";

/** The radar the player's own team looks at. */
export function useTeamRadar(session: LiveSession<LiveSim>, teamId: string): TeamRadar | null {
  const sim = session.sim;
  return useMemo(() => {
    if (!sim.weather) return null;
    if (sim instanceof RaceSim) return sim.strat.radar(teamId);
    const skill = (BRAINS[teamId] ?? DEFAULT_BRAIN).skill;
    return new TeamRadar(sim.weather, makeProfile(teamId, skill, (sim as unknown as { cfg: { seed: number } }).cfg.seed));
  }, [sim, teamId]);
}

export function wetWord(w: number): string {
  return w < 0.06 ? "DRY" : w < 0.22 ? "DAMP" : w < 0.45 ? "WET" : w < 0.75 ? "VERY WET" : "STANDING WATER";
}

/** A one line weather read-out for the top bar. */
export function WeatherChip({ session }: { session: LiveSession<LiveSim> }) {
  useUiTick(500);
  const wx = session.sim.weather;
  if (!wx) return <div className="wxchip dry">DRY</div>;
  const n = wx.now();
  const cls = n.rain > 0.7 ? "storm" : n.rain > 0.05 ? "rain" : n.cloud > 0.5 ? "cloud" : "sun";
  return (
    <div className={`wxchip ${cls}`} title="Air and track temperature, wind">
      <b>{STATE_LABEL[n.state].toUpperCase()}</b>
      <span>
        AIR {Math.round(n.airC)}C TRACK {Math.round(n.trackC)}C
      </span>
      <span>WIND {Math.round(n.wind)} m/s</span>
    </div>
  );
}

const PALETTE: [number, number, number, number][] = [
  // threshold, r, g, b
  [0.04, 120, 170, 230],
  [0.12, 70, 130, 255],
  [0.24, 40, 200, 120],
  [0.4, 240, 220, 60],
  [0.58, 255, 150, 40],
  [0.76, 235, 50, 50],
  [0.9, 230, 70, 220],
];

function paint(field: Float32Array, cols: number, rows: number, ctx: CanvasRenderingContext2D) {
  const img = ctx.createImageData(cols, rows);
  for (let i = 0; i < field.length; i++) {
    const v = field[i];
    let c: [number, number, number, number] | null = null;
    for (const p of PALETTE) if (v >= p[0]) c = p;
    const o = i * 4;
    if (!c) {
      img.data[o + 3] = 0;
      continue;
    }
    img.data[o] = c[1];
    img.data[o + 1] = c[2];
    img.data[o + 2] = c[3];
    img.data[o + 3] = 215;
  }
  ctx.putImageData(img, 0, 0);
}

const OFFSETS = [0, 600, 1200, 1800];

export function RadarPanel({ session, teamId }: { session: LiveSession<LiveSim>; teamId: string }) {
  useUiTick(1000);
  const wx = session.sim.weather;
  const radar = useTeamRadar(session, teamId);
  const small = useRef<HTMLCanvasElement>(null);
  const [off, setOff] = useState(0);
  const COLS = 48;

  const now = wx ? wx.t : 0;
  const stamp = Math.floor(now / 4);
  useEffect(() => {
    const cv = small.current;
    if (!cv || !radar) return;
    const off2 = document.createElement("canvas");
    off2.width = COLS;
    off2.height = COLS;
    const o = off2.getContext("2d");
    const ctx = cv.getContext("2d");
    if (!o || !ctx) return;
    paint(radar.field(now, COLS, COLS, off), COLS, COLS, o);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(off2, 0, 0, cv.width, cv.height);
    // rings, crosshair, north marker
    ctx.strokeStyle = "rgba(180,200,255,0.35)";
    ctx.lineWidth = 1;
    const cx = cv.width / 2;
    const cy = cv.height / 2;
    for (const r of [0.33, 0.66, 1]) {
      ctx.beginPath();
      ctx.arc(cx, cy, (cv.width / 2 - 2) * r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, cv.height);
    ctx.moveTo(0, cy);
    ctx.lineTo(cv.width, cy);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(cx - 2, cy - 2, 5, 5);
    ctx.fillStyle = "#e63946";
    ctx.fillRect(cx - 1, cy - 1, 3, 3);
    ctx.fillStyle = "#cfd6ff";
    ctx.font = "8px 'Press Start 2P', monospace";
    ctx.fillText("N", cx - 4, 10);
    // wind arrow: the way the weather travels
    if (wx) {
      const a = wx.windDir + Math.PI;
      const ax = cv.width - 22;
      const ay = 22;
      ctx.strokeStyle = "#ffe08a";
      ctx.beginPath();
      ctx.moveTo(ax - Math.cos(a) * 10, ay - Math.sin(a) * 10);
      ctx.lineTo(ax + Math.cos(a) * 10, ay + Math.sin(a) * 10);
      ctx.stroke();
      ctx.fillStyle = "#ffe08a";
      ctx.fillRect(Math.round(ax + Math.cos(a) * 10) - 2, Math.round(ay + Math.sin(a) * 10) - 2, 4, 4);
    }
  }, [radar, stamp, off, now, wx]);

  if (!wx || !radar) {
    return (
      <section className="panel radar">
        <h3>WEATHER</h3>
        <p className="dim">Weather is switched off. Dry all weekend.</p>
      </section>
    );
  }

  const eta = radar.eta(now);
  const curve = radar.curve(now, 1800, 60);
  const mins = (s: number) => Math.max(1, Math.round(s / 60));
  let headline = "NO RAIN EXPECTED";
  if (eta.kind === "arrives") headline = `RAIN IN ~${mins(eta.sec)} MIN (${mins(eta.lo)} to ${mins(eta.hi)})`;
  else if (eta.kind === "clears") headline = `EASING IN ~${mins(eta.sec)} MIN (${mins(eta.lo)} to ${mins(eta.hi)})`;
  else if (radar.rain(now, 0) > 0.1) headline = "RAIN CONTINUES";

  const W = 250;
  const H = 62;
  const pts = (key: "rain" | "lo" | "hi") => curve.map((p, i) => `${(i / (curve.length - 1)) * W},${H - p[key] * H}`).join(" ");
  const band = `${pts("hi")} ${curve
    .map((_, i) => `${((curve.length - 1 - i) / (curve.length - 1)) * W},${H - curve[curve.length - 1 - i].lo * H}`)
    .join(" ")}`;

  const rep = session.reports;
  const sectorWords = [0, 1, 2].map((k) => {
    if (rep.at[k] < 0) return { w: -1, age: "no data" };
    const age = Math.round(((wx ? now : 0) - rep.at[k] * 0.1) / 60);
    return { w: rep.w[k], age: age < 1 ? "just now" : `${age} min ago` };
  });
  const seen = sectorWords.filter((s) => s.w >= 0);
  const meanSeen = seen.length ? seen.reduce((a, b) => a + b.w, 0) / seen.length : null;

  const comps: Compound[] = ["M", "I", "W"];
  const losses = meanSeen === null ? null : comps.map((c) => wetLoss(c, meanSeen));
  const best = losses ? losses.indexOf(Math.min(...losses)) : -1;
  const n = wx.now();

  const sky = n.rain > 0.7 ? "storm" : n.rain > 0.05 ? "rain" : n.cloud > 0.5 ? "cloud" : "sun";
  const skyIcon = sky === "storm" ? "ZAP" : sky === "rain" ? "RAIN" : sky === "cloud" ? "CLOUD" : "SUN";
  return (
    <section className="panel radar wx2">
      <h3>{teamId.toUpperCase()} RADAR</h3>
      <p className="dim small radar-note">Your team's view, not the truth.</p>
      <div className="wx-grid">
        <div className="wx-left">
          <canvas ref={small} width={288} height={288} className="radar-canvas wx-canvas" />
          <div className="seg wx-times">
            {OFFSETS.map((o) => (
              <button key={o} className={off === o ? "on" : ""} onClick={() => setOff(o)}>
                {o === 0 ? "NOW" : `+${o / 60}M`}
              </button>
            ))}
          </div>
          <div className="wx-legend" aria-label="Rain intensity">
            <i style={{ background: "#4682ff" }} />
            <i style={{ background: "#28c878" }} />
            <i style={{ background: "#f0dc3c" }} />
            <i style={{ background: "#eb3232" }} />
            <span>LIGHT</span>
            <span>RAIN</span>
            <span>HEAVY</span>
            <span>INTENSE</span>
          </div>
        </div>
        <div className="wx-right">
          <div className={`headline wx-head ${eta.kind}`}>
            <span className={`wx-ico ${sky}`}>{skyIcon}</span>
            <div>
              <b>{headline}</b>
              <div className="wx-conf" title="How sure your team's radar is">
                <i style={{ width: `${Math.round(eta.confidence * 100)}%` }} />
                <em>CONFIDENCE {Math.round(eta.confidence * 100)}%</em>
              </div>
            </div>
          </div>
          <div className="wx-tiles">
            <div>
              <em>SKY</em>
              <b>{intensityWord(n.rain).toUpperCase()}</b>
            </div>
            <div>
              <em>AIR</em>
              <b>{Math.round(n.airC)}C</b>
            </div>
            <div>
              <em>TRACK</em>
              <b>{Math.round(n.trackC)}C</b>
            </div>
            <div>
              <em>WIND</em>
              <b>{Math.round(n.wind)} m/s</b>
            </div>
          </div>
          <div className="wx-card">
            <h4>RAIN FORECAST, NEXT 30 MIN</h4>
            <svg className="fcurve" viewBox={`0 0 ${W} ${H + 12}`} width="100%">
              <rect x="0" y="0" width={W} height={H} fill="#0b1020" />
              {[0.14, 0.5, 0.8].map((y) => (
                <line key={y} x1="0" x2={W} y1={H - y * H} y2={H - y * H} stroke="#2c3560" strokeDasharray="2 3" />
              ))}
              <polygon points={band} fill="#4a6fe0" opacity="0.28" />
              <polyline points={pts("rain")} fill="none" stroke="#9cc3ff" strokeWidth="2" />
              <text x="2" y={H + 10} fill="#8d97c8" fontSize="8">
                NOW
              </text>
              <text x={W / 2 - 10} y={H + 10} fill="#8d97c8" fontSize="8">
                +15M
              </text>
              <text x={W - 28} y={H + 10} fill="#8d97c8" fontSize="8">
                +30M
              </text>
            </svg>
          </div>
          <div className="wx-card">
            <h4>ON TRACK (from your drivers)</h4>
            <div className="secwet">
              {sectorWords.map((s, k) => (
                <div key={k} className={`sw w${s.w < 0 ? "x" : Math.min(4, Math.floor(s.w * 5))}`}>
                  <b>S{k + 1}</b>
                  <span>{s.w < 0 ? "?" : wetWord(s.w)}</span>
                  <em>{s.age}</em>
                </div>
              ))}
            </div>
          </div>
          {losses && (
            <div className="wx-card">
              <h4>TYRE FIT AT THE REPORTED SURFACE</h4>
              <div className="fit">
                {comps.map((c, i) => (
                  <div key={c} className={i === best ? "best" : ""}>
                    <CompoundBadge c={c} size={16} />
                    <span>{c === "M" ? "SLICK" : c === "I" ? "INTER" : "WET"}</span>
                    <b>-{(losses[i] * 100).toFixed(0)}%</b>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
