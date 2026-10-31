import { useEffect, useState } from "react";

type T = { id: number; text: string; tone: "good" | "bad" | "info"; out?: boolean };
const EVT = "bb-toast";

/** A short message that slides in and leaves by itself. Replaces lines that used to sit in the page. */
export function toast(text: string, tone: "good" | "bad" | "info" = "info") {
  window.dispatchEvent(new CustomEvent(EVT, { detail: { text, tone } }));
}

export function ToastHost() {
  const [list, setList] = useState<T[]>([]);
  useEffect(() => {
    let n = 0;
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail as { text: string; tone: T["tone"] };
      const id = ++n;
      setList((l) => [...l.slice(-3), { id, ...d }]);
      window.setTimeout(() => setList((l) => l.map((x) => (x.id === id ? { ...x, out: true } : x))), 3200);
      window.setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), 3450);
    };
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  if (!list.length) return null;
  return (
    <div className="toasts" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.tone}${t.out ? " out" : ""}`}>{t.text}</div>
      ))}
    </div>
  );
}
