import { useEffect, useState } from "react";
import type { DevReact, Staff } from "../../career/types";
import { StaffBody, StaffPortrait } from "../pixel/portraits";
import "./devroom.css";

const ICON: Record<DevReact, string> = { fume: "!!", stung: "...", nod: "ok", shrug: "~", sulk: "...", pale: "?!", grin: ":D", proud: "^^" };

/** Typewriter text. */
function useType(text: string, ms = 16) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const id = setInterval(() => setN((x) => (x >= text.length ? (clearInterval(id), x) : x + 1)), ms);
    return () => clearInterval(id);
  }, [text, ms]);
  return text.slice(0, n);
}

/** A person with a face that moves with how they feel. */
export function Person({ st, react, size = 88, say, name = true }: { st?: Staff; react?: DevReact; size?: number; say?: string; name?: boolean }) {
  const typed = useType(say ?? "");
  if (!st) return null;
  const whole = size >= 60;
  return (
    <div className={`dr-person ${react ? "r-" + react : ""}`}>
      {whole ? (
        <div className="dr-body" style={{ width: Math.round(size * 0.9) }}>
          <StaffBody seed={st.id} role={st.role} size={Math.round(size * 0.9)} react={react} />
          {react && <i className="dr-ico">{ICON[react]}</i>}
        </div>
      ) : (
      <div className="dr-face" style={{ width: size, height: size }}>
        <StaffPortrait seed={st.id} role={st.role} size={size} />
        {react && <i className="dr-ico">{ICON[react]}</i>}
      </div>
      )}
      {name && <b className="dr-name">{st.name}</b>}
      {say !== undefined && <p className="dr-bubble">{typed}<span className="dr-caret">_</span></p>}
    </div>
  );
}
