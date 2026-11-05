import { useRef, useState } from "react";
import { METERS, deriveFx, mixFx, mixId, type Fx, type Mix } from "../../career/tradeoff";
import type { CardOption } from "../../career/types";

/** What an option does: given explicitly, or read from its plain-words facts. */
export const fxOf = (o: CardOption): Fx | undefined => o.fx ?? deriveFx([o.label, o.detail ?? "", ...(o.lines ?? [])]);

/** A tiny five-bar glyph on every option, so all the choices can be compared at a glance. */
export function MiniMeters({ fx }: { fx: Fx | undefined }) {
  if (!fx) return null;
  return (
    <span className="tf-mini" aria-hidden="true">
      {METERS.map((m) => {
        const v = Math.max(-1, Math.min(1, fx[m.id]?.v ?? 0));
        return <span key={m.id} className="tf-mcol" title={m.label}><i className={v >= 0 ? "up" : "down"} style={{ height: `${Math.abs(v) * 50}%`, [v >= 0 ? "bottom" : "top"]: "50%" }} /></span>;
      })}
    </span>
  );
}

/** Five bars around a centre line. A choice slides them left (worse) or right (better), so the trade-off is a picture. */
export function Meters({ fx }: { fx: Fx | null }) {
  return (
    <div className="tf-meters" aria-label="What this choice does">
      {METERS.map((m) => {
        const f = fx?.[m.id];
        const v = Math.max(-1, Math.min(1, f?.v ?? 0));
        return (
          <div className="tf-row" key={m.id}>
            <span className="tf-name">{m.label}</span>
            <div className="tf-track">
              <i className="tf-mid" />
              <b className={`tf-bar ${v >= 0 ? "up" : "down"}`} style={{ left: v >= 0 ? "50%" : `${50 + v * 50}%`, width: `${Math.abs(v) * 50}%` }} />
            </div>
            <span className={`tf-say ${f && f.v > 0.001 ? "up" : f && f.v < -0.001 ? "down" : ""}`}>{f ? f.say : "no change"}</span>
          </div>
        );
      })}
    </div>
  );
}

const TRI = { car: [50, 8], drivers: [8, 88], money: [92, 88] } as const;

function toMix(x: number, y: number): Mix {
  // barycentric weights of the point inside the triangle
  const [ax, ay] = TRI.car, [bx, by] = TRI.drivers, [cx, cy] = TRI.money;
  const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  let a = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d;
  let b = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d;
  let c = 1 - a - b;
  a = Math.max(0, a); b = Math.max(0, b); c = Math.max(0, c);
  const t = a + b + c || 1;
  return { car: a / t, drivers: b / t, money: c / t };
}
function toPoint(m: Mix): [number, number] {
  return [m.car * TRI.car[0] + m.drivers * TRI.drivers[0] + m.money * TRI.money[0], m.car * TRI.car[1] + m.drivers * TRI.drivers[1] + m.money * TRI.money[1]];
}

/** The weekly plan as a dial: drag the puck between CAR, DRIVERS and MONEY and the bars move with it. */
export function PlanDial({ onConfirm, onOther }: { onConfirm: (id: string) => void; onOther: (id: string) => void }) {
  const [mix, setMix] = useState<Mix>({ car: 0.5, drivers: 0.3, money: 0.2 });
  const box = useRef<SVGSVGElement>(null);
  const drag = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    setMix(toMix(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100));
  };
  const [px, py] = toPoint(mix);
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return (
    <div className="tf-dial">
      <svg ref={box} viewBox="0 0 100 100" className="tf-tri" role="slider" aria-label="Split this week's effort between car, drivers and money"
        onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); drag(e); }}
        onPointerMove={(e) => { if (e.buttons) drag(e); }}>
        <polygon points="50,8 8,88 92,88" className="tf-poly" />
        <text x="50" y="6" className="tf-corner" textAnchor="middle">CAR {pct(mix.car)}</text>
        <text x="4" y="98" className="tf-corner" textAnchor="start">DRIVERS {pct(mix.drivers)}</text>
        <text x="96" y="98" className="tf-corner" textAnchor="end">MONEY {pct(mix.money)}</text>
        <circle cx={px} cy={py} r="5" className="tf-puck" />
      </svg>
      <Meters fx={mixFx(mix)} />
      <div className="c-confirm">
        <button className="btn primary" onClick={() => onConfirm(mixId(mix))}>SET THIS WEEK'S PLAN</button>
        <button className="tiny" title="A week of coaching the academy instead" onClick={() => onOther("academy")}>ACADEMY WEEK INSTEAD</button>
      </div>
    </div>
  );
}
