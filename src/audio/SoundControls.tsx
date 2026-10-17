import { useEffect, useSyncExternalStore } from "react";
import { audioCore, sfx } from "./sound";
import { music } from "./music";

/**
 * Installs one delegated document listener so every <button> gets a click
 * sound without editing each button. Disabled buttons (the disabled attribute
 * or aria-disabled="true") play the error sound instead. Add data-nosound to a
 * button (or any ancestor) to opt out. Pass { hover: true } for a very soft
 * hover tick on mouse pointers.
 */
export function useClickSounds(opts: { hover?: boolean } = {}): void {
  const hover = !!opts.hover;
  useEffect(() => {
    if (typeof document === "undefined") return;
    const buttonOf = (t: EventTarget | null): HTMLButtonElement | null => {
      const el = t instanceof Element ? t : null;
      const b = el ? (el.closest("button") as HTMLButtonElement | null) : null;
      if (!b || b.closest("[data-nosound]")) return null;
      return b;
    };
    const isDisabled = (b: HTMLButtonElement) => b.disabled || b.getAttribute("aria-disabled") === "true";
    const onClick = (e: Event) => {
      const b = buttonOf(e.target);
      if (!b) return;
      sfx.play(isDisabled(b) ? "error" : "click");
    };
    // Browsers usually swallow click on disabled buttons, so catch the press.
    // sfx throttles "error" so a browser that fires both only sounds once.
    const onDown = (e: Event) => {
      const b = buttonOf(e.target);
      if (b && isDisabled(b)) sfx.play("error");
    };
    const onOver = (e: Event) => {
      const pe = e as PointerEvent;
      if (pe.pointerType && pe.pointerType !== "mouse") return;
      const b = buttonOf(e.target);
      if (!b || isDisabled(b)) return;
      const from = buttonOf(pe.relatedTarget);
      if (from === b) return;
      sfx.play("hover");
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("pointerdown", onDown, true);
    if (hover) document.addEventListener("pointerover", onOver, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("pointerover", onOver, true);
    };
  }, [hover]);
}

const row = { display: "flex", alignItems: "center", gap: 8 } as const;
const label = { fontFamily: "var(--pix)", fontSize: 8, minWidth: 44 } as const;
const slider = { flex: 1, minWidth: 80, accentColor: "var(--hot, #ff8a3d)" } as const;

/** Mute toggle plus separate volume sliders for sound effects and music. */
export function SoundControls() {
  const s = useSyncExternalStore(audioCore.subscribe, audioCore.getSettings, audioCore.getSettings);
  return (
    <div className="sound-controls" role="group" aria-label="Sound settings" data-nosound style={{ display: "grid", gap: 6 }}>
      <div className="seg">
        <button
          type="button"
          className={s.muted ? "" : "on"}
          aria-pressed={!s.muted}
          aria-label={s.muted ? "Sound is off. Turn sound on" : "Sound is on. Mute sound"}
          onClick={() => {
            const muted = sfx.toggleMuted();
            if (!muted) sfx.play("confirm");
          }}
        >
          {s.muted ? "SOUND OFF" : "SOUND ON"}
        </button>
      </div>
      <label style={row}>
        <span style={label}>SFX</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(s.sfxVolume * 100)}
          aria-label="Sound effects volume"
          style={slider}
          onChange={(e) => sfx.setVolume(Number(e.currentTarget.value) / 100)}
          onPointerUp={() => sfx.play("click")}
        />
        <span style={{ ...label, minWidth: 28, textAlign: "right" }} aria-hidden="true">
          {Math.round(s.sfxVolume * 100)}
        </span>
      </label>
      <label style={row}>
        <span style={label}>MUSIC</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(s.musicVolume * 100)}
          aria-label="Music volume"
          style={slider}
          onChange={(e) => music.setVolume(Number(e.currentTarget.value) / 100)}
        />
        <span style={{ ...label, minWidth: 28, textAlign: "right" }} aria-hidden="true">
          {Math.round(s.musicVolume * 100)}
        </span>
      </label>
      <button type="button" className="tiny" onClick={() => sfx.play("notice")} aria-label="Play a test sound">
        TEST SOUND
      </button>
      <button type="button" className="tiny" onClick={() => music.skip()} aria-label="Skip to another tune" title="Another tune in this scene">
        NEXT TUNE
      </button>
    </div>
  );
}
