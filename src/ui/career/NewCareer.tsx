import { CarSprite } from "../pixel/CarSprite";
import { useEffect, useState } from "react";
import { TEAMS } from "../../game/data";
import { newCareer } from "../../career/world";
import { loadCareer, parseCareer } from "../../career/save";
import { fmtDay } from "../../career/util";
import type { CareerState } from "../../career/types";
import { SLOT } from "./CareerApp";
import { hex } from "./common";
import { MODULES } from "../../career/modules";
import { HelpPicker } from "./HelpPicker";
import { getPrefs, setPref } from "../prefs";
import type { Guidance } from "../../career/types";
import { ModuleIcon, CATEGORY_COLOR } from "../pixel/icons";

export function NewCareer({ onStart, onBack, onTutorial }: { onStart: (s: CareerState) => void; onBack: () => void; onTutorial: (next: CareerState) => void }) {
  const [ask, setAsk] = useState<CareerState | null>(null);
  const [teamId, setTeamId] = useState("wil");
  const [difficulty, setDifficulty] = useState<0 | 1 | 2>(1);
  const [help, setHelp] = useState<Guidance>(getPrefs().help);
  const [length, setLength] = useState<"full" | "half" | "quick">("half");
  const [saved, setSaved] = useState<CareerState | null>(null);
  const [err, setErr] = useState("");
  const [eraMode, setEraMode] = useState<"natural" | "locked">("natural");
  const [locked, setLocked] = useState<string[]>([]);
  const toggle = (id: string) => setLocked((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  useEffect(() => {
    void loadCareer(SLOT).then(setSaved);
  }, []);
  const importFile = async (f: File | undefined) => {
    if (!f) return;
    const c = parseCareer(await f.text());
    if (c) onStart(c);
    else setErr("That file is not a BOX BOX career.");
  };
  const cats = Array.from(new Set(MODULES.map((m) => m.category)));
  const [cat, setCat] = useState<string>("all");
  const shown = MODULES.filter((m) => cat === "all" || m.category === cat);
  const start = () => {
    setPref("help", help);
    // every new career offers the tutorial first; saying no goes straight in
    setAsk(newCareer(teamId, Math.floor(Math.random() * 1e6), difficulty, length, { eraMode, lockedModules: locked, guidance: help }));
  };
  return (
    <div className="screen menu nc">
      <header className="hero small">
        <h2>CAREER MODE</h2>
        <p>PICK ANY TEAM. THE CLOCK ONLY MOVES WHEN YOU SAY SO.</p>
      </header>
      <div className="nc-top">
        <button className="tiny" onClick={onBack}>{"< BACK"}</button>
        <label className="tiny nc-import">IMPORT A SAVE FILE<input type="file" accept="application/json,.json" hidden onChange={(e) => void importFile(e.target.files?.[0])} /></label>
      </div>
      {err && <p className="warn">{err}</p>}
      {saved && (
        <section className="panel nc-continue">
          <div>
            <h3>CONTINUE</h3>
            <p className="dim">{TEAMS.find((t) => t.id === saved.teamId)?.name}, {fmtDay(saved.day)} {saved.year}, round {saved.round + 1}.</p>
          </div>
          <button className="btn primary" onClick={() => onStart(saved)}>CONTINUE CAREER</button>
        </section>
      )}
      <section className="panel nc-step">
        <h3><span className="nc-n">1</span> CHOOSE YOUR TEAM</h3>
        <div className="teams">
          {TEAMS.map((t) => (
            <button key={t.id} className={`team-card ${teamId === t.id ? "selected" : ""}`} style={{ ["--team" as string]: hex(t.color) }} onClick={() => setTeamId(t.id)}>
              <div className="stripe" />
              <div className="tname">{t.name}</div>
              <CarSprite teamColor={t.color} accent={t.accent} size={112} />
            </button>
          ))}
        </div>
      </section>
      <section className="panel nc-step">
        <h3><span className="nc-n">2</span> SET THE GAME</h3>
        <div className="nc-opts">
          <div className="nc-opt"><span className="nc-lab">AI PIT WALLS</span><div className="seg">{([0, 1, 2] as const).map((x) => <button key={x} className={difficulty === x ? "on" : ""} onClick={() => setDifficulty(x)}>{["ROOKIE", "PRO", "LEGEND"][x]}</button>)}</div></div>
          <div className="nc-opt"><span className="nc-lab">RACE LENGTH</span><div className="seg">{(["quick", "half", "full"] as const).map((x) => <button key={x} className={length === x ? "on" : ""} onClick={() => setLength(x)}>{x === "quick" ? "QUICK" : x === "half" ? "HALF" : "FULL"}</button>)}</div><span className="dim small">Quick is 10 laps, half is half distance.</span></div>
          <div className="nc-opt"><span className="nc-lab">REGULATIONS</span><div className="seg">{(["natural", "locked"] as const).map((x) => <button key={x} className={eraMode === x ? "on" : ""} onClick={() => setEraMode(x)}>{x === "natural" ? "NEW ERA EVERY 4 TO 5 YEARS" : "LOCKED"}</button>)}</div></div>
          <div className="nc-opt"><span className="nc-lab">HELP</span><HelpPicker value={help} onChange={setHelp} /></div>
        </div>
      </section>
      {eraMode === "locked" && (
        <section className="panel nc-step">
          <h3><span className="nc-n">3</span> LOCKED RULES <span className="dim small">({locked.length} chosen)</span></h3>
          <p className="dim">The rules never change. Tick the modules you want in force for the whole career. None is fine.</p>
          <div className="nc-cats">
            {["all", ...cats].map((c) => <button key={c} className={`tiny ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>{c.toUpperCase()}</button>)}
          </div>
          <ul className="nc-mods">
            {shown.map((m) => (
              <li key={m.id} className={locked.includes(m.id) ? "on" : ""} style={{ ["--cat" as string]: (CATEGORY_COLOR as Record<string, string>)[m.category] ?? "#8a7fd0" }}>
                <button className="nc-mod" onClick={() => toggle(m.id)} aria-pressed={locked.includes(m.id)}>
                  <span className="nc-ico"><ModuleIcon id={m.id} size={40} /></span>
                  <span className="nc-txt">
                    <b>{m.name} <em>{m.category}</em></b>
                    <span>{m.rule}</span>
                    <span className="dim">{m.intent}</span>
                  </span>
                  <span className="nc-check">{locked.includes(m.id) ? "IN" : "OUT"}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {ask && (
        <div className="nc-ask" role="dialog" aria-label="Tutorial">
          <div className="nc-ask-card">
            <h3>NEW TO BOX BOX?</h3>
            <p>A short tutorial on a practice career shows you where everything is, walks you through your first race weekend, and plays a mock race where the regulations change. It takes about ten minutes and your real career waits for you.</p>
            <div className="nc-ask-btns">
              <button className="btn primary big" onClick={() => onTutorial(ask)}>YES, SHOW ME</button>
              <button className="btn big" onClick={() => onStart(ask)}>NO THANKS, START</button>
            </div>
            <p className="dim small">You can always find it later on the main menu.</p>
          </div>
        </div>
      )}
      <div className="nc-go">
        <button className="btn primary big" onClick={start}>START A NEW CAREER</button>
        {saved && <p className="dim small">Starting a new career replaces the saved one on its next autosave.</p>}
      </div>
    </div>
  );
}
