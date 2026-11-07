import { METERS, deriveFx, type Fx } from "../../career/tradeoff";
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
