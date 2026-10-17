import { OfficeFloor } from "./DevRoom";
import { AREAS, AREA_LABEL, type Delegation, type Level } from "../../career/types";
import { CFG } from "../../career/config";
import { facilityCost } from "../../career/finance";
import { maxConcurrent } from "../../career/rnd";
import { factoryClosed } from "../../career/calendar";
import { fmtMoney, fmtRange, fmtDay, lapDelta } from "../../career/util";
import { Bar, Tip, type Props } from "./common";
import { useState } from "react";
import { Sub } from "../skin/Sub";
import { AREA_DOES, committedTunnel, ideaFacts } from "../../career/ideas";
import { nextAllowanceReset } from "../../career/rnd";
import { FOCUS_TEXT, KIND_LABEL, KIND_TEXT, STANCE_TEXT, focusLabel, planOf } from "../../career/rndplan";
import { BenchGauge } from "./PartBench";
import { CarSprite } from "../pixel/CarSprite";
import { teamColour } from "../../career/brand";
import { teamOf } from "./common";
import type { RndPlan } from "../../career/types";
import { NextCarPanel } from "./NextCar";
import { DesignLab } from "./Lab";
import { ConceptPanel, DesignPanel, GuidancePanel, RulebookPanel, TraitPanel } from "./Engineering";

const FAC = { tunnel: "Wind tunnel", sim: "Simulator", factory: "Factory", academy: "Academy" } as const;
const DEL: { k: keyof Delegation; label: string }[] = [
  { k: "rnd", label: "R&D choices" },
  { k: "setup", label: "Weekend setup" },
  { k: "parts", label: "Fitting parts" },
];
const LEVELS: { k: Level; label: string }[] = [
  { k: "advise", label: "ADVISE" },
  { k: "do", label: "DO IT" },
  { k: "hands", label: "HANDS OFF" },
];

export function SpendLog({ s }: { s: Props["s"] }) {
  const [kind, setKind] = useState<"cap" | "tunnel" | "cash">("cap");
  const rows = s.spendLog.filter((e) => e[kind] !== 0).slice(0, 14);
  const unit = (v: number) => (kind === "tunnel" ? `${v > 0 ? "+" : ""}${Math.round(v)} h` : `${v > 0 ? "+" : ""}${fmtMoney(v)}`);
  return (
    <section className="panel">
      <h3>WHERE DID IT GO?</h3>
      <div className="seg">
        {(["cap", "tunnel", "cash"] as const).map((k) => <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{k === "cap" ? "CAP ROOM" : k === "tunnel" ? "TUNNEL HOURS" : "CASH"}</button>)}
      </div>
      <p className="dim small">{kind === "cap" ? "Every dollar of cap room used or returned." : kind === "tunnel" ? "Allowance resets, loans, and each finished project's total use." : "Monthly books and one-off payments."}</p>
      {rows.length === 0 && <p className="dim">Nothing logged yet.</p>}
      <ul className="c-notes small">
        {rows.map((e, i) => (
          <li key={i}><span className="dim">{fmtDay(e.day)}</span> {e.text} <b className={e[kind] < 0 ? "bad" : ""}>{unit(e[kind])}</b></li>
        ))}
      </ul>
    </section>
  );
}

export function Car({ s, d }: Props) {
  const me = s.teams[s.teamId];
  const closed = factoryClosed(s.day, s.year);
  const active = me.projects.filter((p) => p.status === "building" || p.status === "ready");
  const plan = planOf(me);
  const recent = me.projects.filter((p) => p.status === "fitted").slice(-5).reverse();
  return (
    <Sub id="car" tabs={[
      { k: "overview", label: "OVERVIEW" },
      { k: "study", label: "STUDY" },
      { k: "build", label: "BUILD", n: me.ideas.length },
      { k: "lab", label: "DESIGN LAB" },
      { k: "next", label: "NEXT YEAR'S CAR" },
      { k: "money", label: "FACILITIES AND CONTROL" },
    ]}>
      {(tab) => (
        <>
          {tab === "overview" && (
            <div className="c-cols">
              <div>
                <OfficeFloor s={s} />
                <section className="panel c-carbay">
          <h3>YOUR CAR</h3>
          <CarSprite teamColor={teamColour(s)} accent={teamOf(s.teamId)?.accent ?? 0xffffff} size={420} slots={Object.fromEntries(AREAS.map((a) => [a, Math.max(0, Math.min(1, (me.believed[a] + 0.6) / 1.2))]))} highlight={plan.focus !== "balanced" && plan.focus !== "bank" ? plan.focus : null} />
          <p className="dim small">The gauges show what you believe about each area. A glowing part is where the factory is pushing.</p>
        </section>
                <section className="panel">
          <h3>THE CAR (WHAT YOU BELIEVE)</h3>
          <p className="dim small">Lap time against an average car, like a timing screen: a minus number means faster than average, a plus number slower. These are your engineers' estimates, not the truth. Race weekends correct them.</p>
          {AREAS.map((a) => (
            <div className="c-row" key={a}>
              <span>{AREA_LABEL[a]}</span>
              <b>{lapDelta(me.believed[a])}s</b>
              <Bar v={me.believed[a] + 1} max={2} />
            </div>
          ))}
          <div className="c-row">
            <span>Wind tunnel hours <Tip text="Parts for aero, chassis and cooling need wind tunnel time. Each running project draws its share every working day. When the hours run out those projects stall until the allowance refills." /></span>
            <b>{Math.round(me.tunnelLeft)} / {Math.round(me.tunnelTotal)}</b>
            <Bar v={me.tunnelLeft} max={me.tunnelTotal || 1} color="var(--teal)" />
          </div>
          <p className="dim small">Already promised to running projects: {committedTunnel(s, s.teamId)} h. Refills on {fmtDay(nextAllowanceReset(s))}.</p>
          {me.tunnelLeft <= 150 && <button className="btn" onClick={() => d({ type: "borrowTunnel" })}>BORROW 60 HOURS ($1.5m cap room, taken off the next allowance)</button>}
          {closed && <p className="warn">The factory is shut for the break. Nothing progresses until it reopens.</p>}
        </section>
              </div>
              <div>
                <section className="panel">
          <h3>IN PROGRESS ({active.length}/{maxConcurrent(me)})</h3>
          {active.length === 0 && <p className="dim">No projects running.</p>}
          {active.map((p) => (
            <div className="c-item" key={p.id}>
              <b>{p.name}</b> <em className="tag">{p.size}</em> <span className="dim">{AREA_LABEL[p.area]}</span>
              <p className="small">Staff expect your lap time to change by about {fmtRange(p.predLo, p.predHi)} (minus is faster). {p.status === "ready" ? (p.hold ? "Held back in the garage." : "Ready, goes on the car at the next race.") : `${Math.round((p.progress / p.days) * 100)}% built, ${Math.max(0, Math.ceil(p.days - p.progress))} days to go.`}</p>
              {p.tunnelHours > 0 && p.status === "building" && <p className="dim small">Draws {(p.tunnelHours / p.days).toFixed(1)} tunnel hours a day. Used so far: {Math.round(p.tunnelUsed ?? 0)} of {p.tunnelHours}.</p>}
              {p.status === "building" && <Bar v={p.progress} max={p.days} />}
              {p.status === "ready" && p.hold && <BenchGauge p={p} />}
              {p.status === "ready" && !p.hold && p.kind === "gamble" && <p className="warn small">A gamble part can come in below the staff's guess, even slower than your current car. Holding it back lets practice test it first.</p>}
              <div className="row-btns">
                {p.status === "ready" && (
                  <button className="btn" onClick={() => d({ type: "holdPart", id: p.id, hold: !p.hold })} title="A held part stays in the garage. Practice can test it on a bench so you learn what it really does before you fit it.">
                    {p.hold ? "FIT AT NEXT RACE" : "HOLD BACK FOR A TEST"}
                  </button>
                )}
                <button className="btn" onClick={() => { if (window.confirm(`Scrap "${p.name}"? The money is spent and the people who built it will remember.`)) d({ type: "scrapProject", id: p.id }); }}>SCRAP</button>
              </div>
            </div>
          ))}
          {recent.length > 0 && (
            <>
              <h4>RECENTLY FITTED</h4>
              <ul className="small">
                {recent.map((p) => (
                  <li key={p.id}>{p.name}: predicted {fmtRange(p.predLo, p.predHi)}, delivered {p.delivered !== undefined ? `${lapDelta(p.delivered)} s` : "unknown"}</li>
                ))}
              </ul>
            </>
          )}
        </section>
              </div>
            </div>
          )}
          {tab === "study" && (
            <div className="c-cols">
              <div>
                <GuidancePanel s={s} d={d} />
                <TraitPanel s={s} d={d} />
              </div>
              <div>
                <RulebookPanel s={s} d={d} />
              </div>
            </div>
          )}
          {tab === "build" && (
            <div className="c-cols">
              <div>
                <section className="panel">
          <h3>IDEAS FROM THE FACTORY</h3>
          <p className="dim small">Pick the ones worth the money. The lap time is how much the part changes a lap: a minus number is faster, and it is only the staff's guess until the part runs at a track. Choosing is a real trade: when the dashboard card offers a batch of these and you pick one (or none), the rest are shelved for good and their authors feel it. Money and cap room limit how many you can build.</p>
          {me.ideas.length === 0 && <p className="dim">No ideas on the table. New ones arrive weekly.</p>}
          {me.ideas.map((i) => {
            const f = ideaFacts(s, i);
            return (
              <div className="c-item" key={i.id}>
                <div className="c-line">
                  <div>
                    <b>{i.name}</b> <em className="tag">{i.size}</em> {i.kind && <em className={`tag k-${i.kind}`} title={KIND_TEXT[i.kind]}>{KIND_LABEL[i.kind]}</em>} <span className="dim">{AREA_LABEL[i.area]}</span>
                    {i.note && <p className="small">{i.note}</p>}
                    <p className="dim small">{AREA_DOES[i.area]}</p>
                    <ul className="c-facts">{f.lines.map((l, k) => <li key={k}>{l}</li>)}</ul>
                    {f.warn && <p className="warn small">{f.warn}</p>}
                    <p className="dim small">Offer ends {fmtDay(i.expires)}.</p>
                  </div>
                  <button className="btn primary" onClick={() => d({ type: "startProject", ideaId: i.id })}>START</button>
                </div>
              </div>
            );
          })}
        </section>
              </div>
              <div>
                <DesignPanel s={s} d={d} />
                <section className="panel">
          <h3>FACTORY DIRECTION</h3>
          <p className="dim small">Steer where the next ideas come from. Pushing one area starves the others, and a bold stance trades sure gains for big swings.</p>
          <div className="seg" style={{ flexWrap: "wrap" }}>
            {(["balanced", ...AREAS, "bank"] as RndPlan["focus"][]).map((f) => <button key={f} className={plan.focus === f ? "on" : ""} onClick={() => d({ type: "rndPlan", focus: f })}>{focusLabel(f).toUpperCase()}</button>)}
          </div>
          <p className="dim small">{plan.focus === "balanced" || plan.focus === "bank" ? FOCUS_TEXT[plan.focus] : `More ${AREA_LABEL[plan.focus].toLowerCase()} ideas until ${fmtDay(plan.until)}, fewer in every other area.`}</p>
          <div className="seg">
            {(["safe", "balanced", "bold"] as const).map((x) => <button key={x} className={plan.stance === x ? "on" : ""} onClick={() => d({ type: "rndPlan", stance: x })}>{x.toUpperCase()}</button>)}
          </div>
          <p className="dim small">{STANCE_TEXT[plan.stance]}</p>
          {AREAS.some((a) => (plan.synergy[a] ?? 0) > 0) && <p className="small">Groundwork laid: {AREAS.filter((a) => (plan.synergy[a] ?? 0) > 0).map((a) => `${AREA_LABEL[a]} +${Math.round((plan.synergy[a] ?? 0) * 100)}%`).join(", ")} on the next part fitted there.</p>}
          {s.day <= plan.cheapUntil && <p className="small warn">Cheap supplier deal running until {fmtDay(plan.cheapUntil)}: parts cost 15 percent less and may underdeliver.</p>}
        </section>
              </div>
            </div>
          )}
          {tab === "lab" && <DesignLab s={s} d={d} />}
          {tab === "next" && (
            <div className="c-cols">
              <div>
                <NextCarPanel s={s} d={d} />
              </div>
              <div>
                <ConceptPanel s={s} d={d} />
              </div>
            </div>
          )}
          {tab === "money" && (
            <div className="c-cols">
              <div>
                <section className="panel">
          <h3>FACILITIES</h3>
          {(Object.keys(FAC) as (keyof typeof FAC)[]).map((k) => (
            <div className="c-row" key={k}>
              <span>{FAC[k]} L{me.facilities[k]}</span>
              <button className="tiny" disabled={me.facilities[k] >= 5 || !!me.facilities.building} onClick={() => d({ type: "upgradeFacility", which: k })}>
                {me.facilities[k] >= 5 ? "MAX" : `UPGRADE ${fmtMoney(facilityCost(me.facilities[k]))}`}
              </button>
            </div>
          ))}
          {me.facilities.building && <p className="small">Building: {FAC[me.facilities.building.which]}, done {fmtDay(me.facilities.building.done)}.</p>}
        </section>
                <section className="panel">
          <h3>WHO DECIDES</h3>
          <p className="dim small">Advise: they suggest, you choose. Do it: they act and tell you. Hands off: they act and you hear nothing. R&D choices: the head of R&D picks the focus and starts projects, without your brief, so what they start gives up about a quarter of its gain. Weekend setup: the race engineers run practice and save their best setup (hands off also closes practice). Fitting parts: every finished part is bench tested, ones that would not make the car faster are scrapped, the rest are fitted even if you were holding them.</p>
          {DEL.map(({ k, label }) => (
            <div className="c-row" key={k}>
              <span>{label}</span>
              <div className="seg">
                {LEVELS.map((l) => (
                  <button key={l.k} className={me.delegation[k] === l.k ? "on" : ""} onClick={() => d({ type: "delegate", area: k, level: l.k })}>
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="dim small">Allowance resets each January and after the summer break. Base: {CFG.tunnelBaseHours} h, scaled by championship position.</p>
        </section>
              </div>
              <div>
                <SpendLog s={s} />
              </div>
            </div>
          )}
        </>
      )}
    </Sub>
  );
}
