import { useEffect, useRef, useState } from "react";

/**
 * In-game confirmation, replacing the browser's own popup. Call `ask("Are you sure?", () => doIt())` from anywhere,
 * and mount <ConfirmHost /> once at the root. Enter confirms, Escape cancels.
 */
interface Ask {
  message: string;
  onYes: () => void;
  yes: string;
  no: string;
  title: string;
}

const EVENT = "boxbox-confirm";

export function ask(message: string, onYes: () => void, opts: { yes?: string; no?: string; title?: string } = {}) {
  const detail: Ask = { message, onYes, yes: opts.yes ?? "YES", no: opts.no ?? "CANCEL", title: opts.title ?? "ARE YOU SURE?" };
  window.dispatchEvent(new CustomEvent<Ask>(EVENT, { detail }));
}

export function ConfirmHost() {
  const [cur, setCur] = useState<Ask | null>(null);
  const yesRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const on = (e: Event) => setCur((e as CustomEvent<Ask>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  useEffect(() => {
    if (!cur) return;
    yesRef.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setCur(null);
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [cur]);
  if (!cur) return null;
  const yes = () => {
    const f = cur.onYes;
    setCur(null);
    f();
  };
  return (
    <div className="confirm-back" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setCur(null); }}>
      <div className="confirm-box" role="alertdialog" aria-modal="true" aria-label={cur.title}>
        <h4>{cur.title}</h4>
        <p>{cur.message}</p>
        <div className="row-btns">
          <button ref={yesRef} className="btn primary" onClick={yes}>{cur.yes}</button>
          <button className="btn" onClick={() => setCur(null)}>{cur.no}</button>
        </div>
      </div>
    </div>
  );
}
