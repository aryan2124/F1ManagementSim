import { useState, type ReactNode } from "react";
import { sfx } from "../../audio/sound";

/** A row of pill tabs that splits a long page into rooms. The choice is remembered for the session. */
export function Sub<T extends string>({ id, tabs, children }: { id: string; tabs: { k: T; label: string; n?: number }[]; children: (k: T) => ReactNode }) {
  const store = `bb.sub.${id}`;
  const [k, setK] = useState<T>(() => {
    try {
      const v = sessionStorage.getItem(store) as T | null;
      if (v && tabs.some((t) => t.k === v)) return v;
    } catch {
      /* storage blocked */
    }
    return tabs[0]!.k;
  });
  const pick = (n: T) => {
    setK(n);
    sfx.play("swish");
    try {
      sessionStorage.setItem(store, n);
    } catch {
      /* ignore */
    }
  };
  return (
    <>
      <div className="sub" role="tablist" data-nosfx>
        {tabs.map((t) => (
          <button key={t.k} role="tab" aria-selected={k === t.k} className={k === t.k ? "on" : ""} onClick={() => pick(t.k)}>
            {t.label}
            {t.n ? <span className="n">{t.n}</span> : null}
          </button>
        ))}
      </div>
      <div key={k} className="sub-body">
        {children(k)}
      </div>
    </>
  );
}

/** Help text that folds away. */
export function Fold({ title, children, open }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="fold" open={open}>
      <summary>{title}</summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}
