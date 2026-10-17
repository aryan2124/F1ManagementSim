import { useState } from "react";
import { PLink } from "./Profile";
import { AREAS, AREA_LABEL, STAFF_LABEL, type Area, type Know, type Phil, type Staff, type Trait } from "../../career/types";
import { AREA_TRAITS, TRAIT_BLURB, TRAIT_NAME, trackNeed } from "../../career/traits";
import { HOURS_PER_READING, FACILITY_LABEL, facilityFor, quality, readerFor, sigmaOf } from "../../career/know";
import { LEAD_ROLES, fitFor, leadFor, staffReadout } from "../../career/capability";
import { GUIDANCE_LABEL, GUIDANCE_TEXT, conceptAdvice, hints, pipeline, studyAdvice, wantsAdvice, wantsHints } from "../../career/guide";
import { circuitMeta } from "../../game/circuits";
import { lapDelta, fmtDay } from "../../career/util";
import type { Props } from "./common";

const MIN = -0.6;
const MAX = 0.6;
/** The rulebook weights run from nothing to a bit over double an average trait. */
const REG_MIN = 0;
const REG_MAX = 2.2;
const pct = (v: number) => `${Math.max(0, Math.min(100, ((v - MIN) / (MAX - MIN)) * 100))}%`;

/** Position and width (in percent) of an error band on a bar running from `min` to `max`, kept inside the bar. */
function bandStyle(est: number, half: number, min: number, max: number) {
  const at = (v: number) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
  const lo = at(est - half);
  const hi = at(est + half);
  return { left: `${lo}%`, width: `${Math.max(1, hi - lo)}%` };
}
const atOn = (v: number, min: number, max: number) => `${Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100))}%`;

/** A number with its error bar: the marker is the best estimate, the band is how far off it could be. */
export function ErrBar({ k, truth }: { k: Know; truth?: number }) {
  const lo = Math.max(MIN, k.est - k.err);
  const hi = Math.min(MAX, k.est + k.err);
  return (
    <div className="tr-bar" title={`Estimate ${k.est.toFixed(2)} s, could be off by ${k.err.toFixed(2)} s`}>
      <i className="tr-zero" style={{ left: pct(0) }} />
      <i className="tr-band" style={{ left: pct(lo), width: `${Math.max(1, parseFloat(pct(hi)) - parseFloat(pct(lo)))}%` }} />
      <i className="tr-mark" style={{ left: pct(k.est) }} />
      {truth !== undefined && <i className="tr-truth" style={{ left: pct(truth) }} />}
    </div>
  );
}

const sign = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;

export function GuidancePanel({ s }: Props) {
  const lv = s.guidance ?? "off";
  const hs = hints(s);
  const stud = studyAdvice(s);
  const cadv = conceptAdvice(s);
  return (
    <section className="panel">
      <h3>HELP: {GUIDANCE_LABEL[lv]}</h3>
      <p className="dim small">{GUIDANCE_TEXT[lv]} The help level was chosen when this career started. You can change it in Settings (the cog).</p>
      {wantsHints(s) && hs.length === 0 && <p className="small">Nothing stands out right now.</p>}
      {hs.map((h, i) => <p key={i} className={`small ${h.tone === "warn" ? "warn" : ""}`}>{h.text}</p>)}
      {wantsAdvice(s) && stud.map((x, i) => <p key={`s${i}`} className="small"><b>Suggested:</b> {x}</p>)}
      {wantsAdvice(s) && cadv && <p className="small"><b>Concept:</b> {cadv}</p>}
    </section>
  );
}

export function TraitPanel({ s, d }: Props) {
  const me = s.teams[s.teamId];
  const [n, setN] = useState(2);
  const pipe = pipeline(s, s.teamId);
  return (
    <section className="panel">
      <h3>THE CAR, TRAIT BY TRAIT</h3>
      <p className="dim small">Each area is made of two traits. The area is worth their average minus a price for a lopsided pair, so the weaker side is where work pays most. Every number is an estimate with an error bar: the line is your best guess, the band is how far off it could be, and numbers to the right are faster. Studies, practice runs and races tighten the bands. Building a part or starting a new car loosens them.</p>
      <div className="seg"><span className="dim small" style={{ alignSelf: "center" }}>STUDY SIZE</span>{[1, 2, 4, 6].map((x) => <button key={x} className={n === x ? "on" : ""} onClick={() => setN(x)}>{x} READING{x > 1 ? "S" : ""} ({x * HOURS_PER_READING} h)</button>)}</div>
      {AREAS.map((a) => {
        const [x, y] = AREA_TRAITS[a];
        const reader = readerFor(s, s.teamId, a);
        return (
          <div className="c-item" key={a}>
            <div className="c-line">
              <b>{AREA_LABEL[a]}</b>
              <span className="dim small">believed {lapDelta(me.believed[a])} s | measured in the {FACILITY_LABEL[facilityFor(a)]} (level {me.facilities[facilityFor(a)]}), read by {reader ? reader.name : "nobody"}</span>
            </div>
            {[x, y].map((tr) => {
              const k = me.know[tr];
              const q = quality(s, s.teamId, tr);
              return (
                <div className="tr-row" key={tr}>
                  <span title={TRAIT_BLURB[tr]}>{TRAIT_NAME[tr]}</span>
                  <ErrBar k={k} />
                  <b>{sign(k.est)} <span className="dim">+/- {k.err.toFixed(2)}</span></b>
                  {pipe[tr] > 0 && <span className="small good" title="What the projects running or waiting would add if they deliver what the staff predict">in the pipeline {sign(pipe[tr])}</span>}
                  <span className="dim small" title="How clean one reading is, from the instrument, the person reading it and the data lead">reading {Math.round(q * 100)}% (+/- {sigmaOf(q).toFixed(2)})</span>
                  <button className="tiny" onClick={() => d({ type: "study", trait: tr, readings: n })}>STUDY</button>
                </div>
              );
            })}
          </div>
        );
      })}
      <p className="dim small">Allowance hours left: {Math.round(me.tunnelLeft)} of {Math.round(me.tunnelTotal)}. Studies use the same hours as parts, so every study is a part you are not building.</p>
    </section>
  );
}

export function RulebookPanel({ s, d }: Props) {
  const me = s.teams[s.teamId];
  const next = s.calendar[s.round];
  const meta = next ? circuitMeta(next.circuitId) : null;
  const need = next ? trackNeed(next.circuitId) : null;
  const [n, setN] = useState(2);
  return (
    <section className="panel">
      <h3>WHAT THE RULES REWARD</h3>
      <p className="dim small">The regulations do not reward every trait equally, and nobody publishes the weights. 1.00 is an average trait; 1.30 means a second found there is worth about a third more on the clock. Your engineers have to work it out from the data. The weights drift a little each winter and are redrawn when a new rule era starts.</p>
      {meta && need && <p className="small">Next race, {meta.gp}: a {need.df > 0.3 ? "slow, downforce-hungry" : need.df < -0.3 ? "fast, power-and-drag" : "mixed"} circuit, {need.sev > 1.1 ? "hard on tyres" : need.sev < 0.9 ? "kind to tyres" : "average tyre wear"}.</p>}
      <div className="seg"><span className="dim small" style={{ alignSelf: "center" }}>STUDY SIZE</span>{[1, 2, 4].map((x) => <button key={x} className={n === x ? "on" : ""} onClick={() => setN(x)}>{x} ({x * HOURS_PER_READING} h)</button>)}</div>
      {AREAS.flatMap((a) => AREA_TRAITS[a]).map((tr) => {
        const k = me.regKnow[tr];
        return (
          <div className="tr-row" key={tr}>
            <span>{TRAIT_NAME[tr]}</span>
            <div className="tr-bar"><i className="tr-zero" style={{ left: atOn(1, REG_MIN, REG_MAX) }} /><i className="tr-band" style={bandStyle(k.est, k.err, REG_MIN, REG_MAX)} /><i className="tr-mark" style={{ left: atOn(k.est, REG_MIN, REG_MAX) }} /></div>
            <b>{k.est.toFixed(2)} <span className="dim">+/- {k.err.toFixed(2)}</span></b>
            <button className="tiny" onClick={() => d({ type: "studyRegs", trait: tr, readings: n })}>STUDY</button>
          </div>
        );
      })}
    </section>
  );
}

const AXES: { k: keyof Phil; lo: string; hi: string; text: string }[] = [
  { k: "df", lo: "LOW DRAG", hi: "DOWNFORCE", text: "Which side of the aero trade the car leans on. Engineers who share it do better work on the traits that match." },
  { k: "risk", lo: "PROVEN", hi: "RADICAL", text: "How much the design office reaches. Radical ideas have wider results and suit engineers who like them." },
  { k: "innov", lo: "REFINE", hi: "INVENT", text: "Polishing what you have against looking for something new." },
];

/** A person's specialty and philosophy as the player can read them: a best guess with a band that narrows as they get to know the person. */
export function StaffFit({ s, st }: { s: Props["s"]; st: Staff }) {
  const r = staffReadout(s, st);
  const me = s.teams[s.teamId];
  const tr = AREA_TRAITS[r.best][0];
  const f = fitFor(s, st, me.concept, tr);
  return (
    <div className="sf">
      {AREAS.map((a) => (
        <div className="sf-row" key={a} title={`${AREA_LABEL[a]}: ${Math.round(r.spec[a] * 100)}% +/- ${Math.round(r.half * 100)}`}>
          <span>{AREA_LABEL[a].split(" ")[0]}</span>
          <div className="tr-bar sm"><i className="tr-band" style={bandStyle(r.spec[a], r.half, 0, 1)} /><i className="tr-mark" style={{ left: atOn(r.spec[a], 0, 1) }} /></div>
        </div>
      ))}
      <p className="small dim">Leans {r.phil.df > 0.25 ? "downforce" : r.phil.df < -0.25 ? "low drag" : "neutral"}, {r.phil.risk > 0.25 ? "radical" : r.phil.risk < -0.25 ? "proven" : "balanced"}, {r.phil.innov > 0.25 ? "inventive" : r.phil.innov < -0.25 ? "refining" : "balanced"} (read to +/- {Math.round(r.half * 100)}). With your concept: fit x{f.mult.toFixed(2)}.</p>
    </div>
  );
}

export function ConceptPanel({ s, d }: Props) {
  const me = s.teams[s.teamId];
  const [draft, setDraft] = useState<Phil>(me.concept);
  const locked = me.conceptDay !== undefined && s.day - me.conceptDay < 28;
  const crew = (["aero", "power", "designer", "td", "data"] as const).map((r) => Object.values(s.staff).find((x) => x.teamId === s.teamId && x.role === r)).filter((x): x is Staff => !!x);
  return (
    <section className="panel">
      <h3>CONCEPT AND PEOPLE</h3>
      <p className="dim small">The car has a philosophy, and so does every engineer. A part made by someone whose specialty and instincts match the concept is better and easier to read. Changing the concept mid-season costs certainty, because the team has to relearn how the car answers.</p>
      {AXES.map((ax) => (
        <div className="c-axis" key={ax.k}>
          <div className="c-line"><span className="dim small">{ax.lo}</span><b>{sign(draft[ax.k])}</b><span className="dim small">{ax.hi}</span></div>
          <input type="range" min={-1} max={1} step={0.05} value={draft[ax.k]} onChange={(e) => setDraft({ ...draft, [ax.k]: Number(e.target.value) })} />
          <p className="dim small">{ax.text}</p>
        </div>
      ))}
      <button className="btn" disabled={locked || (draft.df === me.concept.df && draft.risk === me.concept.risk && draft.innov === me.concept.innov)} onClick={() => d({ type: "setConcept", phil: draft })}>SET CONCEPT</button>
      {locked && <p className="dim small">Settling until {fmtDay((me.conceptDay ?? 0) + 28)}.</p>}
      <h4>YOUR ENGINEERS AGAINST THIS CONCEPT</h4>
      {crew.length === 0 && <p className="dim small">No design staff.</p>}
      {crew.map((x) => (
        <div className="c-item" key={x.id}>
          <b><PLink kind="staff" id={x.id}>{x.name}</PLink></b> <span className="dim">{STAFF_LABEL[x.role]}</span>
          <StaffFit s={s} st={x} />
        </div>
      ))}
    </section>
  );
}

export function DesignPanel({ s, d }: Props) {
  const me = s.teams[s.teamId];
  const [area, setArea] = useState<Area>("aero");
  const [trait, setTrait] = useState<Trait>("downforce");
  const [kind, setKind] = useState<"safe" | "gamble" | "enabler">("safe");
  const [lead, setLead] = useState<string>("");
  const [size, setSize] = useState<"S" | "M" | "L">("M");
  const candidates = Object.values(s.staff).filter((x) => x.teamId === s.teamId && LEAD_ROLES[area].includes(x.role));
  const chosen = lead ? s.staff[lead] : leadFor(s, s.teamId, trait);
  const busy = chosen ? me.projects.filter((p) => p.status === "building" && p.lead === chosen.id).length : 0;
  const f = fitFor(s, chosen, me.concept, trait, busy);
  const pickArea = (a: Area) => {
    setArea(a);
    setTrait(AREA_TRAITS[a][0]);
    setLead("");
  };
  return (
    <section className="panel">
      <h3>COMMISSION A PART</h3>
      <p className="dim small">Do not wait for the factory to think of something. Choose the trait you want to improve, how bold the idea is, and who leads it. The design office drafts a proposal (6 allowance hours of simulation time) that appears below with its own prediction and cost.</p>
      <div className="seg" style={{ flexWrap: "wrap" }}>{AREAS.map((a) => <button key={a} className={area === a ? "on" : ""} onClick={() => pickArea(a)}>{AREA_LABEL[a].toUpperCase()}</button>)}</div>
      <div className="seg">{AREA_TRAITS[area].map((tr) => <button key={tr} className={trait === tr ? "on" : ""} onClick={() => { setTrait(tr); setLead(""); }} title={TRAIT_BLURB[tr]}>{TRAIT_NAME[tr].toUpperCase()}</button>)}</div>
      <div className="seg">{(["safe", "gamble", "enabler"] as const).map((k) => <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{k === "safe" ? "SURE THING" : k === "gamble" ? "GAMBLE" : "GROUNDWORK"}</button>)}</div>
      <div className="seg">{(["S", "M", "L"] as const).map((k) => <button key={k} className={size === k ? "on" : ""} onClick={() => setSize(k)} title="Bigger parts cost more cap room and take longer, and gain more.">{k === "S" ? "SMALL" : k === "M" ? "MEDIUM" : "LARGE"}</button>)}</div>
      <label className="small dim">Led by <select value={lead} onChange={(e) => setLead(e.target.value)}><option value="">Best fit available{chosen ? ` (${chosen.name})` : ""}</option>{candidates.map((x) => <option key={x.id} value={x.id}>{x.name} ({STAFF_LABEL[x.role]})</option>)}</select></label>
      <p className="small">{chosen ? `${chosen.name}: specialty ${Math.round(f.specialty * 100)}%, instincts match ${Math.round(f.philosophy * 100)}%, familiarity ${Math.round(f.familiarity * 100)}%, workload x${f.workload.toFixed(2)}. Overall x${f.mult.toFixed(2)} on their skill.` : "Nobody to lead this: the work will be poor."}</p>
      <button className="btn primary" onClick={() => d({ type: "designPart", area, trait, kind, lead: lead || undefined, size })}>DRAW IT UP (6 h)</button>
    </section>
  );
}
