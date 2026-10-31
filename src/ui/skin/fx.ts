import { sfx } from "../../audio/sound";

/** Three sizes of feedback, used everywhere so the game speaks with one voice. Each stacks several channels: shake, wash, sound. */
export type Tier = "small" | "medium" | "big";
const SHAKE: Record<Tier, { px: number; ms: number }> = { small: { px: 2.5, ms: 90 }, medium: { px: 5, ms: 200 }, big: { px: 9, ms: 420 } };
const WASH: Record<Tier, number> = { small: 30, medium: 60, big: 110 };

const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Shake an element (default: the whole app). */
export function shake(tier: Tier, el?: Element | null) {
  const t = (el ?? document.getElementById("root")) as HTMLElement | null;
  if (!t || reduced() || typeof t.animate !== "function") return;
  const { px, ms } = SHAKE[tier];
  const k: Keyframe[] = [];
  const steps = Math.max(4, Math.round(ms / 28));
  for (let i = 0; i <= steps; i++) {
    const decay = 1 - i / steps;
    k.push({ transform: i === steps ? "translate(0,0)" : `translate(${((i % 2 ? 1 : -1) * px * decay).toFixed(1)}px, ${((i % 3 ? 1 : -1) * px * 0.6 * decay).toFixed(1)}px)` });
  }
  t.animate(k, { duration: ms, easing: "linear" });
}

/** A coloured wash around the screen edge. */
export function wash(tier: Tier, colour: string) {
  if (reduced()) return;
  const b = document.body;
  b.style.setProperty("--wash", colour);
  b.style.setProperty("--wash-size", `${WASH[tier]}px`);
  b.classList.remove("fx-wash");
  void b.offsetWidth;
  b.classList.add("fx-wash");
  window.setTimeout(() => b.classList.remove("fx-wash"), 750);
}

const GOOD = "rgba(79, 208, 138, 0.38)";
const BAD = "rgba(255, 85, 96, 0.34)";
const INFO = "rgba(59, 156, 255, 0.28)";

/** The whole bundle for an outcome: shake (bad and big only), wash and sound, scaled by tier. */
export function feel(kind: "good" | "bad" | "info", tier: Tier = "medium") {
  wash(tier, kind === "good" ? GOOD : kind === "bad" ? BAD : INFO);
  if (kind === "bad") shake(tier);
  if (tier === "big" && kind !== "bad") shake("small");
  sfx.play(kind === "good" ? (tier === "big" ? "win" : tier === "medium" ? "purple" : "pop") : kind === "bad" ? (tier === "small" ? "deny" : "crash") : "notice");
}
