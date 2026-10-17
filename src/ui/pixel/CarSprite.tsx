import { useEffect, useRef } from "react";
import "./pixel.css";
import { AREAS, AREA_LABEL, AREA_RECTS, CAR_H, CAR_TOP_MARGIN, CAR_W, drawCar, type Area } from "./carDraw";

export { AREA_LABEL };
export type { Area };

export interface CarSpriteProps {
  teamColor: number;
  accent: number;
  /** 0..1 value per R&D area, drawn as a small gauge above that part */
  slots?: Partial<Record<Area, number>>;
  /** lights one area up */
  highlight?: Area | null;
  /** css width in px (default 360) */
  size?: number;
  /** 0..1 how assembled the car is (default 1) */
  build?: number;
  /** when given, the hot-spots become clickable buttons */
  onPick?: (area: Area) => void;
}

const PAD = 2;
const GAUGE_X: Record<Area, number> = { aero: 1, power: 13, cooling: 30, chassis: 42, tyres: 54 };
const SHORT: Record<Area, string> = { aero: "AERO", power: "POWER", cooling: "COOL", chassis: "CHASSIS", tyres: "TYRES" };
const W = CAR_W + PAD * 2;
const H = CAR_TOP_MARGIN + CAR_H + 1;

export function CarSprite({ teamColor, accent, slots, highlight, size = 360, build, onPick }: CarSpriteProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    ctx.imageSmoothingEnabled = false;
    let n = 0;
    const paint = () => {
      ctx.clearRect(0, 0, W, H);
      const pulse = highlight ? 0.5 + 0.5 * Math.sin(n * 0.7) : 1;
      drawCar(ctx, PAD, CAR_TOP_MARGIN, 1, { teamColor, accent, slots, highlight, pulse, build });
    };
    paint();
    if (!highlight) return;
    const id = window.setInterval(() => {
      n++;
      paint();
    }, 120);
    return () => window.clearInterval(id);
  }, [teamColor, accent, slots, highlight, build]);

  return (
    <div className="pixel-car" style={{ width: size }} role="group" aria-label="Car with R&D areas">
      {slots && (
        <div className="pixel-car-labels" aria-hidden="true">
          {AREAS.map((a) => (
            <span key={a} className={highlight === a ? "hot" : ""} style={{ left: `${((GAUGE_X[a] + 4.5 + PAD) / W) * 100}%` }}>{SHORT[a]}</span>
          ))}
        </div>
      )}
      <canvas ref={ref} width={W} height={H} aria-hidden="true" />
      {AREAS.map((a) =>
        AREA_RECTS[a].map((r, i) => {
          const style = {
            left: `${((r.x + PAD) / W) * 100}%`,
            top: `${((r.y + CAR_TOP_MARGIN) / H) * 100}%`,
            width: `${(r.w / W) * 100}%`,
            height: `${(r.h / H) * 100}%`,
          };
          const v = slots?.[a];
          const text = v == null ? AREA_LABEL[a] : `${AREA_LABEL[a]} ${Math.round(v * 100)}%`;
          if (!onPick) {
            return (
              <span key={a + i} className={`pixel-hit${highlight === a && i === 0 ? " on" : ""}`} style={style} data-area={a} title={text}>
                {i === 0 && <span className="pixel-tip">{text}</span>}
              </span>
            );
          }
          return (
            <button
              key={a + i}
              type="button"
              className={`pixel-hit${highlight === a && i === 0 ? " on" : ""}`}
              style={style}
              data-area={a}
              aria-label={text}
              aria-hidden={i === 0 ? undefined : true}
              tabIndex={i === 0 ? 0 : -1}
              onClick={() => onPick(a)}
            >
              {i === 0 && <span className="pixel-tip">{text}</span>}
            </button>
          );
        }),
      )}
    </div>
  );
}
