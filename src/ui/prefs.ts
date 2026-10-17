/** Small per-viewer preferences, kept in the browser. Reads never throw. */
const KEY = "boxbox.prefs";
export interface Prefs {
  podium: boolean;
  /** Scanlines and a dark vignette over everything. */
  crt: boolean;
  /** The moving swirl behind the screens. */
  swirl: boolean;
  /** How much help to start a career or league with: off, hints or full. */
  help: "off" | "hints" | "full";
  /** Engine brightness, 0 (soft) to 1 (screaming). */
  engineTone: number;
  /** Race view zoom, 1 is the classic view. */
  zoom: number;
}
const DEFAULTS: Prefs = { podium: true, crt: true, swirl: true, help: "off", engineTone: 0.5, zoom: 1 };

export function getPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS };
}
export function setPref<K extends keyof Prefs>(k: K, v: Prefs[K]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...getPrefs(), [k]: v }));
  } catch {
    /* ignore */
  }
}

/** Apply the look preferences to the page. Safe to call any time. */
export function applyLook(): void {
  if (typeof document === "undefined") return;
  const p = getPrefs();
  document.body.classList.toggle("no-crt", !p.crt);
  document.body.classList.toggle("no-swirl", !p.swirl);
}
