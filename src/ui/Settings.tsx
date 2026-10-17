import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { applyLook, getPrefs, setPref } from "./prefs";
import { SoundControls } from "../audio/SoundControls";

/** A pixel cog, drawn with rects so it stays crisp at any size. */
export function Cog({ size = 18 }: { size?: number }) {
  const px = (x: number, y: number, w = 1, h = 1) => <rect key={`${x}-${y}-${w}-${h}`} x={x} y={y} width={w} height={h} />;
  return (
    <svg width={size} height={size} viewBox="0 0 9 9" shapeRendering="crispEdges" fill="currentColor" aria-hidden="true">
      {px(4, 0)}
      {px(1, 1)}{px(7, 1)}
      {px(2, 2, 5, 1)}
      {px(0, 4)}{px(8, 4)}
      {px(1, 3, 1, 3)}{px(7, 3, 1, 3)}
      {px(2, 3, 1, 3)}{px(6, 3, 1, 3)}
      {px(3, 3, 3, 1)}{px(3, 5, 3, 1)}
      {px(2, 6, 5, 1)}
      {px(1, 7)}{px(7, 7)}
      {px(4, 8)}
    </svg>
  );
}

/** One SETTINGS button with everything that is not part of playing: volume, save export and friends. */
export function SettingsButton({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [podium, setPod] = useState(() => getPrefs().podium);
  const [crt, setCrt] = useState(() => getPrefs().crt);
  const [swirl, setSwirlP] = useState(() => getPrefs().swirl);
  const [tone, setTone] = useState(() => getPrefs().engineTone);
  const [zoom, setZoom] = useState(() => Math.max(1, Math.min(2.5, Math.round(getPrefs().zoom * 4) / 4 || 1)));
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button className="set-btn" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Cog /> <span>SETTINGS</span>
      </button>
      {open && (
        <div className="set-back" role="presentation" onClick={() => setOpen(false)}>
          <div className="set-box" role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
            <header>
              <h3><Cog size={16} /> SETTINGS</h3>
              <button className="tiny" onClick={() => setOpen(false)}>CLOSE</button>
            </header>
            <section>
              <h4>SOUND</h4>
              <SoundControls />
              <label className="set-check set-range">Engine tone (soft to screaming, applies from the next session)
                <input type="range" min={0} max={1} step={0.05} value={tone} onChange={(e) => { const v = Number(e.target.value); setTone(v); setPref("engineTone", v); }} />
              </label>
            </section>
            <section>
              <h4>RACE</h4>
              <label className="set-check"><input type="checkbox" checked={podium} onChange={(e) => { setPod(e.target.checked); setPref("podium", e.target.checked); }} /> Podium animation after a race</label>
              <label className="set-check set-range">Race view zoom ({zoom.toFixed(2)}x)
                <input type="range" min={1} max={2.5} step={0.25} value={zoom} onChange={(e) => { const v = Number(e.target.value); setZoom(v); setPref("zoom", v); window.dispatchEvent(new CustomEvent("boxbox-zoom", { detail: v })); }} />
              </label>
            </section>
            <section>
              <h4>LOOK</h4>
              <label className="set-check"><input type="checkbox" checked={crt} onChange={(e) => { setCrt(e.target.checked); setPref("crt", e.target.checked); applyLook(); }} /> Scanlines and screen edge shading</label>
              <label className="set-check"><input type="checkbox" checked={swirl} onChange={(e) => { setSwirlP(e.target.checked); setPref("swirl", e.target.checked); applyLook(); }} /> Moving background</label>
            </section>
            {children && <section><h4>GAME</h4><div className="set-game">{children}</div></section>}
          </div>
        </div>
      )}
    </>
  );
}

let extras: ReactNode = null;
const subs = new Set<() => void>();
/** A screen can hand its own settings (save export and the like) to the one cog that is always on screen. */
export function setSettingsExtras(n: ReactNode): void {
  extras = n;
  subs.forEach((f) => f());
}
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => void subs.delete(f);
};

/** The settings cog that is always there, on every screen. */
export function GlobalSettings() {
  const n = useSyncExternalStore(subscribe, () => extras);
  return (
    <div className="set-fixed">
      <SettingsButton>{n}</SettingsButton>
    </div>
  );
}
