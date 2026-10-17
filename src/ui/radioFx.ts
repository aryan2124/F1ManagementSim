import { hashSeed, Rng } from "../sim/rng";

/** Race clock for a radio line, mm:ss from the lights going out. */
export function clock(tick: number, dt: number): string {
  const s = Math.max(0, Math.floor(tick * dt));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * What a listener hears of a rival's transmission. Open-channel scanner reception varies: most lines are clean, some lose a word or two to
 * static and a few are mostly noise. The same line always sounds the same, so reopening the panel never changes it.
 */
export function scramble(text: string, id: number): { text: string; quality: "clear" | "weak" | "bad" } {
  const r = new Rng(hashSeed(`rx:${id}`));
  const roll = r.next();
  if (roll > 0.78) return { text, quality: "clear" };
  const bad = roll < 0.07;
  const colon = text.indexOf(": ");
  const head = colon >= 0 ? text.slice(0, colon + 2) : "";
  const words = (colon >= 0 ? text.slice(colon + 2) : text).split(" ");
  const out = words.map((w, i) => {
    if (i === 0 && !bad) return w;
    const drop = bad ? 0.55 : 0.18;
    return r.chance(drop) ? "~".repeat(Math.max(2, Math.min(5, w.length))) : w;
  });
  // collapse neighbouring dropouts
  const merged: string[] = [];
  for (const w of out) {
    if (w.startsWith("~") && merged.length && merged[merged.length - 1].startsWith("~")) continue;
    merged.push(w);
  }
  return { text: head + merged.join(" "), quality: bad ? "bad" : "weak" };
}
