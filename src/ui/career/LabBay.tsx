import { useEffect, useRef } from "react";
import type { Design } from "../../career/design";

type Inst = "desk" | "cfd" | "tunnel" | "sim" | "dyno";
const W = 360;
const H = 150;

/** One short animation per instrument. It plays while the test runs; the numbers come from the real reading. */
export function LabBay({ inst, model, color, onDone }: { inst: Inst; model: Design; color: string; onDone: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    let raf = 0;
    const t0 = performance.now();
    const LEN = inst === "desk" ? 1800 : 2400;
    const car = (x: number, y: number, k = 1, stroke = color) => {
      ctx.strokeStyle = stroke; ctx.fillStyle = stroke; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x + 30 * k, y - 10 * k); ctx.lineTo(x + 90 * k, y - 14 * k); ctx.lineTo(x + 130 * k, y - 24 * k); ctx.lineTo(x + 170 * k, y - 20 * k); ctx.lineTo(x + 200 * k, y - 4 * k); ctx.lineTo(x + 200 * k, y); ctx.closePath(); ctx.stroke();
      const wing = 10 + model.frontWing * 10;
      ctx.fillRect(x - 6 * k, y - wing * k * 0.5, 22 * k, 3 * k);
      ctx.fillRect(x + 188 * k, y - (20 + model.rearWing * 8) * k, 18 * k, 3 * k);
      for (const wx of [x + 38 * k, x + 160 * k]) { ctx.beginPath(); ctx.arc(wx, y + 2 * k, 11 * k, 0, 7); ctx.stroke(); }
    };
    const draw = (now: number) => {
      const t = now - t0;
      const k = Math.min(1, t / LEN);
      ctx.fillStyle = "#0a1b2a"; ctx.fillRect(0, 0, W, H);
      ctx.font = "9px monospace";
      if (inst === "desk") {
        ctx.strokeStyle = "#1c4663"; ctx.lineWidth = 1;
        for (let x = 0; x < W; x += 18) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 40 + k * 300, H); ctx.clip(); car(60, 100, 1, "#4fc3f7"); ctx.restore();
        ctx.fillStyle = "#ffd54f"; ctx.fillRect(40 + k * 300, 40, 3, 70);
        ctx.fillStyle = "#9ad"; ctx.fillText("SKETCHING THE SHAPE", 10, 14);
      } else if (inst === "cfd") {
        car(80, 100, 1, "#4fc3f7");
        for (let i = 0; i < 14; i++) {
          const y0 = 30 + i * 6;
          ctx.strokeStyle = `hsl(${200 - i * 6},80%,60%)`; ctx.beginPath();
          for (let x = 0; x < W * Math.min(1, k * 1.3); x += 4) {
            const bump = Math.exp(-((x - 190) ** 2) / 4000) * (46 - Math.abs(y0 - 80)) * 0.5 * (y0 < 80 ? -1 : 0.4);
            const yy = y0 + bump + Math.sin(x / 14 + t / 120 + i) * 1.2;
            x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
          }
          ctx.stroke();
        }
        ctx.fillStyle = "#9ad"; ctx.fillText("SOLVING THE FLOW", 10, 14);
      } else if (inst === "tunnel") {
        ctx.fillStyle = "#13293a"; ctx.fillRect(0, 118, W, 30);
        car(90, 112, 0.9, "#4fc3f7");
        ctx.fillStyle = "#6a7"; for (let i = 0; i < 4; i++) { ctx.save(); ctx.translate(24, 75); ctx.rotate(t / 60 + i * 1.57); ctx.fillRect(-2, -20, 4, 20); ctx.restore(); }
        for (let i = 0; i < 26; i++) {
          const x = ((t / 5 + i * 31) % (W - 50)) + 40, y = 40 + ((i * 17) % 70);
          ctx.fillStyle = `rgba(220,240,255,${0.15 + (i % 4) * 0.12})`; ctx.fillRect(x, y + Math.sin(x / 20) * 2, 18, 2);
        }
        ctx.fillStyle = "#9ad"; ctx.fillText(`TUNNEL RUNNING ${Math.round(40 + k * 260)} KPH`, 10, 14);
      } else if (inst === "sim") {
        ctx.strokeStyle = "#35495c"; ctx.lineWidth = 14; ctx.beginPath(); ctx.ellipse(180, 78, 130, 44, 0, 0, 7); ctx.stroke();
        const a = (t / 800) * 6.283;
        ctx.fillStyle = color; ctx.fillRect(180 + 130 * Math.cos(a) - 5, 78 + 44 * Math.sin(a) - 3, 11, 7);
        ctx.fillStyle = "#9ad"; ctx.fillText(`SIMULATOR LAP ${(78 + (1 - k) * 2).toFixed(2)}`, 10, 14);
      } else {
        const shake = Math.sin(t / 12) * (1 + k * 3);
        ctx.fillStyle = "#37474f"; ctx.fillRect(110 + shake, 50, 140, 60);
        ctx.fillStyle = "#546e7a"; for (let i = 0; i < 4; i++) ctx.fillRect(122 + i * 32 + shake, 38, 18, 14);
        ctx.fillStyle = "#0e1a24"; ctx.fillRect(20, 130, 320, 10);
        ctx.fillStyle = k > 0.8 ? "#ff5252" : "#66bb6a"; ctx.fillRect(20, 130, 320 * k, 10);
        ctx.fillStyle = "#9ad"; ctx.fillText(`DYNO ${Math.round(6000 + k * 9000)} RPM`, 10, 14);
      }
      if (t < LEN) raf = requestAnimationFrame(draw);
      else onDone();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [inst, model, color, onDone]);
  return <canvas ref={ref} width={W} height={H} className="lab-bay" aria-label={`${inst} running`} />;
}
