import { useEffect, useRef, useState } from "react";
import { TEAMS } from "../game/data";
import { loadCareer, parseCareer } from "../career/save";
import { fmtDay } from "../career/util";
import type { CareerState } from "../career/types";
import { SLOT } from "./career/CareerApp";
import { ScreenBanner } from "./pixel/banners";
import { hex } from "./career/common";
import { DeptIcon, type DeptKind } from "./pixel/icons";
import { juiceUp } from "./skin/juice";

type Item = { id: string; kind: string; icon: string; label: string; note: string; run: () => void; primary?: boolean; disabled?: boolean };

/** The front door: four ways in. Arrow keys and Enter work too. */
export function Home({ onNew, onLoad, onOnline, onWeekend, onTutorial }: { onNew: () => void; onLoad: (c: CareerState) => void; onOnline: () => void; onWeekend: () => void; onTutorial: () => void }) {
  const [saved, setSaved] = useState<CareerState | null>(null);
  const [err, setErr] = useState("");
  const [cur, setCur] = useState(0);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    void loadCareer(SLOT).then(setSaved);
  }, []);
  const team = saved ? TEAMS.find((t) => t.id === saved.teamId) : undefined;
  const items: Item[] = [
    ...(saved ? [{ id: "continue", kind: "good", icon: "car", label: "CONTINUE CAREER", note: `${team?.name ?? saved.teamId}, ${fmtDay(saved.day)}, round ${saved.round + 1}`, run: () => onLoad(saved), primary: true }] : []),
    { id: "tutorial", kind: "good", icon: "academy", label: "TUTORIAL", note: "Ten minutes on a practice career: where everything is, your first race weekend, and what a rules change does.", run: onTutorial, primary: false },
    { id: "new", kind: "go", icon: "factory", label: "NEW CAREER", note: "Pick a team and run it for seasons: cars, people, money, the academy.", run: onNew, primary: !saved },
    { id: "load", kind: "info", icon: "rules", label: "LOAD CAREER", note: "Open a save file you exported from the settings cog.", run: () => file.current?.click() },
    { id: "online", kind: "tech", icon: "people", label: "ONLINE LEAGUE", note: "Run a team against friends in a shared world.", run: onOnline },
    { id: "weekend", kind: "bad", icon: "fans", label: "SIMULATE A RACE WEEKEND", note: "One weekend, any team and circuit. No career, no strings.", run: onWeekend },
  ];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setCur((c) => (c + 1) % items.length); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setCur((c) => (c + items.length - 1) % items.length); }
      else if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) items[cur]?.run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const importFile = async (f: File | undefined) => {
    if (!f) return;
    const c = parseCareer(await f.text());
    if (c) onLoad(c);
    else setErr("That file is not a BOX BOX career.");
  };
  return (
    <div className="screen home">
      <header className="home-hero">
        <h1 aria-label="BOX BOX">
          {"BOX".split("").map((ch, i) => <b key={"a" + i} className="lg" style={{ ["--d" as string]: `${i * 0.16}s` }} onPointerEnter={(e) => juiceUp(e.currentTarget, 0.2, 6)}>{ch}</b>)}
          <i className="lg-gap" />
          {"BOX".split("").map((ch, i) => <b key={"b" + i} className="lg hot" style={{ ["--d" as string]: `${0.5 + i * 0.16}s` }} onPointerEnter={(e) => juiceUp(e.currentTarget, 0.2, 6)}>{ch}</b>)}
        </h1>
        <p><span>THE RACING TEAM PRINCIPAL SIM</span></p>
      </header>
      <div className="home-frame tilt"><ScreenBanner theme="hq" className="home-banner" plate={false} /><i className="shine" /></div>
      <nav className="home-menu" aria-label="Main menu">
        {items.map((it, i) => (
          <button key={it.id} className={`home-item k-${it.kind}${it.primary ? " primary" : ""}${cur === i ? " cur" : ""}`} style={{ ["--i" as string]: i }} onMouseEnter={() => setCur(i)} onFocus={() => setCur(i)} onClick={it.run} disabled={it.disabled}>
            <span className="home-tile"><DeptIcon kind={it.icon as DeptKind} size={28} /></span>
            <span className="home-label">{it.label}</span>
            <span className="home-note">{it.note}</span>
            {it.id === "continue" && team && <i className="home-chip" style={{ background: hex(team.color) }} />}
            <span className="home-arrow" aria-hidden="true">{">"}</span>
          </button>
        ))}
      </nav>
      {err && <p className="warn center">{err}</p>}
      <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => void importFile(e.target.files?.[0])} />
      <footer className="home-foot dim small">Arrow keys and Enter work. The game saves by itself while you play a career.</footer>
    </div>
  );
}
