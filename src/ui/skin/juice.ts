import { sfx } from "../../audio/sound";

/** Balatro's "juice up": a quick overshoot scale and a decaying wobble. Safe to call on any element. */
export function juiceUp(el: Element | null | undefined, amount = 0.14, rot = 3): void {
  if (!el || typeof (el as HTMLElement).animate !== "function") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const s = 1 + amount;
  const r = rot * (Math.random() < 0.5 ? -1 : 1);
  (el as HTMLElement).animate(
    [
      { transform: "scale(1) rotate(0deg)" },
      { transform: `scale(${s}) rotate(${r}deg)`, offset: 0.22 },
      { transform: `scale(${1 - amount * 0.35}) rotate(${-r * 0.6}deg)`, offset: 0.5 },
      { transform: `scale(${1 + amount * 0.12}) rotate(${r * 0.25}deg)`, offset: 0.75 },
      { transform: "scale(1) rotate(0deg)" },
    ],
    { duration: 380, easing: "ease-out" },
  );
}

const TARGET = "button, .juicy, [role=button], select, summary, label.chk";
let installed = false;

/** Global feel: hover ticks, press thunks, a wobble on every click, tilt on cards, staggered pop-in on new panels. */
export function installJuice(): () => void {
  if (installed || typeof document === "undefined") return () => undefined;
  installed = true;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  let lastHover: Element | null = null;

  const over = (e: PointerEvent) => {
    const t = (e.target as Element | null)?.closest?.(TARGET);
    if (!t || t === lastHover) return;
    lastHover = t;
    if ((t as HTMLButtonElement).disabled) return;
    sfx.play("tick");
  };
  const out = (e: PointerEvent) => {
    const t = (e.target as Element | null)?.closest?.(TARGET);
    if (t && t === lastHover && !t.contains(e.relatedTarget as Node | null)) lastHover = null;
  };
  const click = (e: MouseEvent) => {
    const t = (e.target as Element | null)?.closest?.(TARGET) as HTMLButtonElement | null;
    if (!t) return;
    if (t.disabled || t.getAttribute("aria-disabled") === "true") {
      sfx.play("deny");
      juiceUp(t, 0.05, 2);
      return;
    }
    if (t.closest(".sound-controls, [data-nosfx]")) return;
    sfx.play(t.classList.contains("primary") || t.classList.contains("go") ? "confirm" : "thunk");
    if (!t.classList.contains("on") && !t.classList.contains("nowob")) juiceUp(t, t.classList.contains("big") ? 0.06 : 0.1, 2);
  };
  const move = (e: PointerEvent) => {
    if (reduce) return;
    const t = (e.target as Element | null)?.closest?.(".tilt") as HTMLElement | null;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    t.style.setProperty("--ry", `${(x * 9).toFixed(2)}deg`);
    t.style.setProperty("--rx", `${(-y * 7).toFixed(2)}deg`);
    t.style.setProperty("--gx", `${((x + 0.5) * 100).toFixed(0)}%`);
    t.style.setProperty("--gy", `${((y + 0.5) * 100).toFixed(0)}%`);
  };
  const leave = (e: PointerEvent) => {
    const t = (e.target as Element | null)?.closest?.(".tilt") as HTMLElement | null;
    if (!t || t.contains(e.relatedTarget as Node | null)) return;
    t.style.removeProperty("--ry");
    t.style.removeProperty("--rx");
  };

  // stagger new panels and cards so a screen assembles instead of appearing
  const POP = ".panel, .c-card, .team-card, .home-item, .c-opt, .nc-opt, .c-prog, .stat-tile, .c-notice";
  const mo = new MutationObserver((list) => {
    for (const m of list) {
      m.addedNodes.forEach((n) => {
        if (!(n instanceof HTMLElement)) return;
        const els = n.matches(POP) ? [n] : Array.from(n.querySelectorAll<HTMLElement>(POP));
        let i = 0;
        for (const el of els) {
          if (el.dataset.pop) continue;
          el.dataset.pop = "1";
          el.style.setProperty("--i", String(Math.min(i++, 10)));
        }
      });
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
  // elements already on the page at install time
  document.querySelectorAll<HTMLElement>(POP).forEach((el, i) => {
    el.dataset.pop = "1";
    el.style.setProperty("--i", String(Math.min(i, 10)));
  });

  document.addEventListener("pointerover", over, true);
  document.addEventListener("pointerout", out, true);
  document.addEventListener("click", click, true);
  document.addEventListener("pointermove", move, true);
  document.addEventListener("pointerout", leave, true);
  return () => {
    installed = false;
    mo.disconnect();
    document.removeEventListener("pointerover", over, true);
    document.removeEventListener("pointerout", out, true);
    document.removeEventListener("click", click, true);
    document.removeEventListener("pointermove", move, true);
    document.removeEventListener("pointerout", leave, true);
  };
}
