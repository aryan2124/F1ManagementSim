import { donutDrivers } from "../../career/sendoff";
import { useMusic } from "../../audio/useMusic";
import { useMemo, useRef, useState } from "react";
import { loadCircuit } from "../../game/circuits";
import type { Weekend } from "../../game/setup";
import { RaceSession } from "../../game/session";
import { QualiSession } from "../../game/qsession";
import type { QualiRow } from "../../sim/qualifying";
import type { Compound } from "../../sim/types";
import { Briefing } from "../Briefing";
import { QualiScreen } from "../QualiScreen";
import { RaceScreen } from "../RaceScreen";
import { Results } from "../Results";
import { PROGRAMME_LABEL, type Programme, type SessionKind, type SetupVec } from "../../career/types";
import { setKeyFor, allocTotal } from "../../career/weekend";
import { SetPicker } from "../SetPicker";
import { failuresOf, raceExtras, planSession, extrasFromRows, rulesBrief, setupReview } from "../../career/weekend";
import { TRIM, changeSummary, engineersGuess } from "../../career/setup";
import { driversOf } from "../../career/finance";
import { ALLOWANCE, PART_NAME, swapCost, totalDrop, wearOf } from "../../career/powertrain";
import type { PartKind } from "../../career/types";
import { Bar, type Props } from "./common";
import { PROGRAMME_TRAITS } from "../../career/know";
import { TRAIT_NAME } from "../../career/traits";
import { ScreenBanner } from "../pixel/banners";
import { sessionTitle } from "../sessionTitle";
import { BenchGauge } from "./PartBench";
import { AREA_LABEL } from "../../career/types";
import "../pixel/themes.css";

const PROGS = Object.keys(PROGRAMME_LABEL) as Programme[];
const PROG_HELP: Record<Programme, { what: string; race: string; know: "setup" | "tyre" | "race" | "quali" | "part" }> = {
  setup: { what: "Runs your slider settings: you get a lap time and the driver's two biggest complaints.", race: "A setup near the best is worth lap time in qualifying and the race, every lap, and a driver who likes the car is quicker.", know: "setup" },
  tyres: { what: "Long runs to learn how fast the tyres wear on this track.", race: "Your tyre laps-left estimate in the race gets sharper, so pit calls are easier to get right.", know: "tyre" },
  raceSim: { what: "A pretend race stint with heavy fuel and old tyres. Timed with the race trim.", race: "Your drivers settle into the race rhythm: steadier lap times and fewer small mistakes.", know: "race" },
  qualiSim: { what: "A pretend flying lap on low fuel. Timed with the qualifying trim.", race: "Drivers gain confidence for one-lap pace, so they find more in qualifying.", know: "quali" },
  part: { what: "Bench-tests a part you held back in the garage (or one just fitted).", race: "Tells you what the part really gives before you commit to fitting it. Only useful if you have one.", know: "part" },
};

const skipWeekend = (d: Props["d"]) => {
  if (window.confirm("Skip the whole weekend?\n\nThe game will simulate qualifying and the race for you, with the setup as it is now. You will not watch them, and you can't take it back.")) d({ type: "simWeekend" });
};

const DRIVER_WORD = (v: number) => (v >= 0.75 ? "at home in the car" : v >= 0.55 ? "settling in" : v >= 0.4 ? "not sure about it" : "uneasy");
const TRIM_AXIS = { id: TRIM, label: "Trim", low: "Race: kind to the tyres", high: "Qualifying: one-lap pace" };

export function Practice({ s, d, msg, net }: Props & { msg: string; net?: boolean }) {
  useMusic("garage");
  const ws = s.weekend!;
  const mine = driversOf(s, s.teamId);
  const [setup, setSetup] = useState<SetupVec>({ ...ws.setup });
  const [prog, setProg] = useState<Programme>("setup");
  const [driver, setDriver] = useState(mine[0]?.id ?? "");
  const [help, setHelp] = useState(false);
  const [ask, setAsk] = useState(false);
  const [setId, setSetId] = useState<string>("");
  const [alloc, setAllocS] = useState(ws.alloc ?? ws.allocRec?.alloc ?? { S: 4, M: 5, H: 4 });
  const axes = ws.axes;
  const rows = ws.axes.concat([TRIM_AXIS]);
  const runs = ws.runs ?? [];
  const timed = runs.filter((r) => r.delta !== null);
  const lastTimed = timed[timed.length - 1];
  const best = timed.length ? Math.min(...timed.map((r) => r.delta as number)) : 0;
  const spread = Math.max(0.1, ...timed.map((r) => Math.abs(r.delta as number)));
  const knownAvg = axes.length ? axes.reduce((a, x) => a + (ws.known[x.id] ?? 0), 0) / axes.length : 0;
  const benchParts = s.teams[s.teamId].projects.filter((q) => q.status === "ready" && q.hold);
  const unsaved = rows.some((a) => Math.abs((setup[a.id] ?? 0) - (ws.setup[a.id] ?? 0)) > 1e-6);
  const knowOf = (k: string) => (k === "setup" ? knownAvg : k === "tyre" ? ws.tyreKnow : k === "race" ? ws.raceKnow : k === "quali" ? ws.qualiKnow : null);
  const peak = useRef(ws.runsLeft);
  peak.current = Math.max(peak.current, ws.runsLeft);
  const total = peak.current;
  const pct = (v: number) => `${((v + 1) / 2) * 100}%`;
  const myList = ws.setList?.[setKeyFor(s, driver)] ?? [];
  const dry = myList.filter((x) => x.compound === "S" || x.compound === "M" || x.compound === "H");
  const picked = dry.find((x) => x.id === setId);
  const allocTot = allocTotal(ws.sprint);
  const allocSum = alloc.S + alloc.M + alloc.H;
  const rec = ws.allocRec;
  const nameOf = (id: string) => s.drivers[id]?.spec.code ?? id;
  return (
    <div className={`theme-garage c-garage${net ? "" : " screen"}`}>
      <ScreenBanner theme="garage" />
      <PartsPanel s={s} d={d} />
      {!ws.setList && rec && (
        <section className="panel c-alloc">
          <h3>TYRE ALLOCATION FOR THE WEEKEND</h3>
          <p className="small">You take {allocTot} dry sets per car (plus the wets you always carry). Choose the split before anything runs. Sets used in practice and qualifying are not there on Sunday.</p>
          <div className="c-allocrow">
            {(["S", "M", "H"] as const).map((c) => (
              <div key={c} className={`c-allocbox c-${c}`}>
                <b>{c === "S" ? "SOFT" : c === "M" ? "MEDIUM" : "HARD"}</b>
                <div className="seg"><button disabled={alloc[c] <= 1} onClick={() => setAllocS({ ...alloc, [c]: alloc[c] - 1 })}>-</button><span>{alloc[c]}</span><button disabled={allocSum >= allocTot} onClick={() => setAllocS({ ...alloc, [c]: alloc[c] + 1 })}>+</button></div>
              </div>
            ))}
            <span className={allocSum === allocTot ? "dim small" : "warn small"}>{allocSum} of {allocTot}</span>
          </div>
          <p className="small"><b>The engineers recommend {rec.alloc.S} soft, {rec.alloc.M} medium, {rec.alloc.H} hard{rec.sure ? "" : " (a rough guess)"}.</b></p>
          <ul className="small dim">{rec.why.map((w, i) => <li key={i}>{w}</li>)}</ul>
          <div className="row-btns">
            <button className="btn" onClick={() => setAllocS(rec.alloc)}>USE THEIR SPLIT</button>
            <button className="btn primary" disabled={allocSum !== allocTot} onClick={() => d({ type: "setAlloc", alloc })}>CONFIRM {alloc.S}/{alloc.M}/{alloc.H}</button>
          </div>
        </section>
      )}
      {ws.setList && (
        <section className="panel c-alloc">
          <h4>YOUR TYRES <span className="dim small">(carried through practice, qualifying and the race)</span></h4>
          {mine.map((m) => {
            const l = (ws.setList?.[setKeyFor(s, m.id)] ?? []).filter((x) => x.compound === "S" || x.compound === "M" || x.compound === "H");
            return <div key={m.id}><b>{m.spec.code}</b><SetPicker sets={l} readonly /></div>;
          })}
        </section>
      )}
      <section className="panel">
        <h3>THE GARAGE: PRACTICE {ws.sprint ? "(SPRINT WEEKEND: ONE SESSION)" : `(${ws.sessionsLeft} SESSION${ws.sessionsLeft === 1 ? "" : "S"} LEFT)`}</h3>
        <div className="c-pips" title="Runs left in this session">
          {Array.from({ length: Math.max(total, ws.runsLeft) }, (_, i) => <i key={i} className={i < ws.runsLeft ? "on" : ""} />)}
          <span className="dim small">{ws.runsLeft} run{ws.runsLeft === 1 ? "" : "s"} left in this session</span>
        </div>
        {ws.runsLeft <= 0 && ws.sessionsLeft <= 0 && <p className="c-msg">All runs used. Finish your setup from what you learned, press SAVE SETUP, then END PRACTICE.</p>}
        <p className="small">Nobody can tell you the best setup: <b>work it out.</b> Change one thing, send a driver out, and read the lap time and what he says. The engineers' guess comes from a simulator that is never quite right.</p>
        <button className="linkish small" onClick={() => setHelp(!help)}>{help ? "Hide" : "Show"} the full guide</button>
        {help && (
          <div className="c-how">
            <p><b>Lap time:</b> every timed run is measured against your first run (the baseline). Minus is quicker. There is noise in it, so a difference of a few hundredths means nothing: new tyres and a good engineer cut the noise.</p>
            <p><b>Change one slider at a time.</b> The axes interact (the best balance moves with the downforce you run), so if you change two things together you will not know which one did it.</p>
            <p><b>The drivers:</b> after a run the driver tells you his two biggest complaints. They are honest but they are HIS: each driver has his own taste, so the two of them will disagree, and a poor reporter can point the wrong way. You pick the compromise. A driver who is at home in the car is quicker and steadier.</p>
            <p><b>The engineers' guess:</b> it comes from the simulator. It improves with runs but it carries a built-in error that more runs do not remove (a better simulator facility makes it smaller). Your own lap times can prove it wrong.</p>
            <p><b>Trim:</b> toward qualifying buys one-lap pace and costs tyre wear on Sunday; toward the race does the opposite. It only shows in qualifying simulations and race simulations.</p>
            <p><b>Tyres:</b> a run on fresh tyres is cleaner but uses one of that driver's sets and it comes off what the team has for the weekend. A used set carries its wear into the next session.</p>
            <p><b>Conditions:</b> the forecast moves the best setting (a wet race wants more downforce), and the track rubbers in between sessions, so old readings go a little stale. The notebook remembers last year's setup here as a starting point.</p>
            {ws.ruleNotes.map((n, i) => <p key={i} className="warn small">Rule this weekend: {n}</p>)}
            {ws.weatherCard && <p className="small">Weather card: {ws.weatherCard.kind}, rain chance {Math.round(ws.weatherCard.chance[0] * 100)} to {Math.round(ws.weatherCard.chance[1] * 100)}%.</p>}
          </div>
        )}
        {!help && ws.ruleNotes.map((n, i) => <p key={i} className="warn small">Rule this weekend: {n}</p>)}
        {!help && ws.weatherCard && <p className="small">Weather card: {ws.weatherCard.kind}, rain chance {Math.round(ws.weatherCard.chance[0] * 100)} to {Math.round(ws.weatherCard.chance[1] * 100)}%.</p>}
      </section>
      <div className="c-cols">
        <section className="panel">
          <h4>CAR SETUP <span className="dim small">(both drivers share this)</span></h4>
          <p className="small dim">White tick: the setup saved on the car. Blue tick: what your last run used. Each driver can nudge it for himself in the box underneath.</p>
          {rows.map((a) => {
            const v = setup[a.id] ?? 0;
            const isTrim = a.id === TRIM;
            return (
              <div className="c-axis" key={a.id}>
                <div className="c-row"><span>{a.label.toUpperCase()}</span><span><b>{v.toFixed(2)}</b></span></div>
                <div className="c-slide">
                  <div className="c-rangebar">
                    {lastTimed && <i className="guess" style={{ left: pct(lastTimed.setup[a.id] ?? 0) }} title="Where your last timed run was" />}
                    {unsaved && Math.abs(v - (ws.setup[a.id] ?? 0)) > 1e-6 && <i className="saved" style={{ left: pct(ws.setup[a.id] ?? 0) }} title="Currently saved value" />}
                  </div>
                  <input type="range" min={-1} max={1} step={0.05} value={v} onChange={(e) => setSetup({ ...setup, [a.id]: Number(e.target.value) })} />
                </div>
                <div className="c-ends small dim"><span>{a.low}</span><span>{isTrim ? "shows in quali and race simulations" : ""}</span><span>{a.high}</span></div>
              </div>
            );
          })}
          <div className="tweak-box">
            <p className="small"><b>{(s.drivers[driver]?.spec.name ?? "Driver").toUpperCase()}'S TWEAKS</b> <span className="dim">(his car only, added to the car setup above, up to 0.4 either way. Pick the driver on the right.)</span></p>
            {ws.axes.map((a) => {
              const cur = ws.tweak?.[driver]?.[a.id] ?? 0;
              return (
                <label key={a.id} className="small lab-dial">
                  <span>{a.label}</span>
                  <input type="range" min={-0.4} max={0.4} step={0.05} value={cur} onChange={(e) => d({ type: "setTweak", driverId: driver, tweak: { ...(ws.tweak?.[driver] ?? {}), [a.id]: Number(e.target.value) } })} />
                  <em className="dim">{cur >= 0 ? "+" : ""}{cur.toFixed(2)} = {((setup[a.id] ?? 0) + cur).toFixed(2)} on his car</em>
                </label>
              );
            })}
          </div>
          <div className="row-btns">
            <button className={`btn${unsaved ? " primary" : ""}`} onClick={() => d({ type: "setSetup", setup })}>{unsaved ? "SAVE SETUP (CHANGED)" : "SAVE SETUP"}</button>
            {lastTimed && <button className="btn" onClick={() => setSetup({ ...lastTimed.setup })}>BACK TO LAST RUN</button>}
            {timed.length > 1 && <button className="btn" onClick={() => { const b = timed.reduce((x, y) => ((y.delta as number) < (x.delta as number) ? y : x)); setSetup({ ...b.setup }); }}>BACK TO QUICKEST RUN</button>}
            <button className="btn" onClick={() => setAsk(!ask)}>{ask ? "HIDE" : "ASK"} THE ENGINEERS</button>
          </div>
          {ask && (
            <div className="c-how">
              <p className="small"><b>The simulator says:</b> {knownAvg < 0.05 ? "nothing yet. Run the setup programme first." : "this is a model, not the track. Trust your lap times over it."}</p>
              {knownAvg >= 0.05 && axes.map((a) => {
                const g = engineersGuess(ws, a);
                return (
                  <div key={a.id} className="c-row small">
                    <span>{a.label}</span>
                    <span><b>{g.value.toFixed(2)}</b> <span className="dim">({g.trust})</span> <button className="tiny" onClick={() => setSetup({ ...setup, [a.id]: g.value })}>TRY IT</button></span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        <section className="panel">
          <h3>RUN PLAN</h3>
          <div className="c-progs">
            {PROGS.map((p) => {
              const h = PROG_HELP[p];
              const k = knowOf(h.know);
              return (
                <button key={p} className={`c-prog${prog === p ? " on" : ""}`} onClick={() => setProg(p)}>
                  <b>{PROGRAMME_LABEL[p]}</b>
                  <span className="small">{h.what}</span>
                  <span className="small c-race">IN THE RACE: {h.race}</span>
                  {(PROGRAMME_TRAITS[p] ?? []).length > 0 && <span className="small dim">ALSO TEACHES THE ENGINEERS ABOUT: {PROGRAMME_TRAITS[p].map((x) => TRAIT_NAME[x].toLowerCase()).join(", ")}</span>}
                  {k != null && <Bar v={k} />}
                </button>
              );
            })}
          </div>
          <div className="c-row"><span>Driver</span><div className="seg">{mine.map((m) => <button key={m.id} className={driver === m.id ? "on" : ""} onClick={() => setDriver(m.id)}>{m.spec.code}</button>)}</div></div>
          <p className="small dim">{nameOf(driver)} is {DRIVER_WORD(ws.confidence[driver] ?? 0.4)} (from his last run).</p>
          <div className="c-sets">
            <p className="small"><b>Which set goes on?</b> <span className="dim">A new set gives cleaner times. A used set is quicker to get a read on, but it carries its wear, and every set you run now is one less on Sunday. Leave it on AUTO and the garage picks.</span></p>
            <SetPicker sets={dry} value={setId} onChange={setSetId} />
            {!ws.setList && <p className="small dim">Your sets are unpacked when you confirm the split above or send the first car out.</p>}
          </div>
          <div className="row-btns">
            <button className="btn primary big" disabled={ws.runsLeft <= 0} onClick={() => d({ type: "practiceRun", programme: prog, setup, driverId: driver, setId: picked?.id })}>
              SEND HIM OUT
            </button>
            <span className="dim small">Programme: {PROGRAMME_LABEL[prog]}</span>
          </div>
          {unsaved && <p className="small warn">The run uses the sliders as they are now, and they become the car's setup.</p>}
          {msg && <p className="c-msg">{msg}</p>}
          <h4>THE EVIDENCE</h4>
          {timed.length === 0 && <p className="dim small">No timed runs yet. A setup, qualifying simulation or race simulation run gives a lap time.</p>}
          <ul className="c-runs small">
            {timed.slice(-12).map((r) => {
              const prev = timed[timed.indexOf(r) - 1];
              const w = Math.round((Math.abs(r.delta as number) / spread) * 100);
              return (
                <li key={r.n} className={(r.delta as number) === best ? "bestrun" : ""}>
                  <span className="n">#{r.n}</span>
                  <span>{nameOf(r.driverId)}</span>
                  <span className="dim">{r.programme === "setup" ? "setup" : r.programme === "qualiSim" ? "quali" : "race"}{r.fresh ? " new" : ""}{r.wet ? " wet" : ""}</span>
                  <span className="dim">{changeSummary(ws, r.setup, prev?.setup)}</span>
                  <span className="bar"><i className={(r.delta as number) <= 0 ? "fast" : "slow"} style={{ width: `${Math.max(3, w)}%` }} /></span>
                  <b>{(r.delta as number) >= 0 ? "+" : ""}{(r.delta as number).toFixed(2)}s</b>
                </li>
              );
            })}
          </ul>
          <h4>WHAT WE KNOW</h4>
          <div className="c-row"><span>Engineers' picture</span><Bar v={knownAvg} /></div>
          <div className="c-row"><span>Tyre wear</span><Bar v={ws.tyreKnow} /></div>
          <div className="c-row"><span>Race pace</span><Bar v={ws.raceKnow} /></div>
          <div className="c-row"><span>Qualifying</span><Bar v={ws.qualiKnow} /></div>
          {benchParts.length > 0 && (
            <>
              <h4>PARTS ON THE BENCH</h4>
              <p className="dim small">How a part test works: the staff's number is a guess. A PART TEST run measures the part for real, with a small error. Compare the marker to the teal band, then fit it or scrap it.</p>
              {benchParts.map((bp) => (
                <div className="c-item" key={bp.id}>
                  <b>{bp.name}</b> <span className="dim small">{AREA_LABEL[bp.area]}{bp.kind === "gamble" ? ", a gamble" : ""}</span>
                  <BenchGauge p={bp} />
                  <div className="row-btns">
                    <button className="tiny" onClick={() => d({ type: "holdPart", id: bp.id, hold: false })}>FIT AT NEXT RACE</button>
                    <button className="tiny" onClick={() => d({ type: "scrapProject", id: bp.id })}>SCRAP</button>
                  </div>
                </div>
              ))}
            </>
          )}
          <h4>DRIVER FEEDBACK AND RUN LOG</h4>
          <ul className="c-notes small">
            {ws.notes.slice(0, 12).map((n, i) => <li key={i} className={i < 3 ? "" : "dim"}>{n}</li>)}
            {ws.notes.length === 0 && <li className="dim">Nothing yet. Send a driver out.</li>}
          </ul>
          <div className="row-btns">
            <button className="btn primary" onClick={() => { if (unsaved && !window.confirm("You have moved sliders without saving. The car will keep the old saved setup. End practice anyway?")) return; d({ type: "endPractice" }); }}>END PRACTICE</button>
            {!net && <button className="btn" title="Let the game play qualifying and the race for you" onClick={() => skipWeekend(d)}>SKIP THE WEEKEND</button>}
          </div>
        </section>
      </div>
    </div>
  );
}

/** Parc ferme: the setup is locked after qualifying. Changing it anyway means starting from the pit lane. */
/** Power units and gearboxes: wear, the season allowance, penalties, and the swap button. Works at any point of the weekend, parc ferme or not. */
export function PartsPanel({ s, d, forced }: Props & { forced?: boolean }) {
  const ws = s.weekend!;
  const mine = driversOf(s, s.teamId);
  const rows = mine.map((dr) => ({ dr, w: wearOf(s, dr.id), dead: ws.dead?.[dr.id] ?? [] }));
  const penalties = Object.entries(ws.drops ?? {}).filter(([id, l]) => s.drivers[id]?.teamId === s.teamId && l.length);
  const carried = Object.entries(s.gridDrops ?? {}).filter(([, l]) => l.length);
  const swap = (id: string, part: PartKind) => {
    const c = swapCost(s, id, part, ws.parc);
    const name = s.drivers[id]?.spec.name ?? "the driver";
    const msg = c.places
      ? `Fit a new ${PART_NAME[part]} to ${name}?\n\nIt costs a ${c.places} place grid penalty:\n- ${c.reasons.join("\n- ")}`
      : `Fit a new ${PART_NAME[part]} to ${name}?\n\nNo penalty: still within the season allowance of ${ALLOWANCE[part]}.`;
    if (c.places === 0 || window.confirm(msg)) d({ type: "swapPart", driverId: id, part });
  };
  return (
    <section className={`panel c-parts ${rows.some((r) => r.dead.length) ? "dead" : ""}`}>
      <h4>POWER UNITS AND GEARBOXES</h4>
      {forced && <p className="c-msg warn">A unit has failed. It has to be replaced before the next session.</p>}
      {rows.map(({ dr, w, dead }) => (
        <div className="c-part-row" key={dr.id}>
          <b>{dr.spec.name}</b>
          {(["pu", "gb"] as const).map((part) => {
            const isDead = dead.includes(part);
            const cost = swapCost(s, dr.id, part, ws.parc);
            return (
              <span className="c-part" key={part}>
                {part === "pu" ? "Power unit" : "Gearbox"} {w[part].n}/{ALLOWANCE[part]}
                <span className="bar"><i style={{ width: `${Math.round(w[part].life * 100)}%`, background: isDead ? "var(--red)" : w[part].life < 0.3 ? "var(--yellow)" : "var(--green)" }} /></span>
                {isDead ? <b className="bad">FAILED</b> : <small className="dim">{Math.round(w[part].life * 100)}%</small>}
                <button className={`btn tiny ${isDead ? "primary" : ""}`} onClick={() => swap(dr.id, part)}>
                  {isDead ? "REPLACE" : "SWAP"}{cost.places ? ` (-${cost.places})` : ""}
                </button>
              </span>
            );
          })}
        </div>
      ))}
      {ws.parc && <p className="dim small">Parc ferme is on. You can still swap, but it counts as a breach: 5 extra grid places.</p>}
      {penalties.map(([id, list]) => (
        <p key={id} className="small warn">{s.drivers[id].spec.name} starts the race {totalDrop(list)} places down: {list.map((x) => x.why).join("; ")}.</p>
      ))}
      {carried.length > 0 && carried.map(([id, list]) => (
        <p key={id} className="small warn">Next race: {s.drivers[id]?.spec.name ?? id} {totalDrop(list)} places down ({list.map((x) => x.why).join("; ")}).</p>
      ))}
    </section>
  );
}

function ParcStrip({ s, d }: Props) {
  const ws = s.weekend!;
  const [edit, setEdit] = useState(false);
  const [setup, setSetup] = useState<SetupVec>({ ...ws.setup });
  if (ws.parcBroken) return <p className="c-msg warn">Setup changed after parc ferme: both cars will start from the pit lane.</p>;
  return (
    <section className="panel c-parc">
      <h4>PARC FERME</h4>
      <p className="dim small">The setup is locked now. You may change it anyway, but both cars then start from the pit lane, behind everyone.</p>
      {!edit ? (
        <button className="btn" onClick={() => setEdit(true)}>CHANGE THE SETUP ANYWAY</button>
      ) : (
        <>
          {ws.axes.map((a) => (
            <div className="c-axis" key={a.id}>
              <div className="c-row"><span>{a.label.toUpperCase()}</span><b>{(setup[a.id] ?? 0).toFixed(2)}</b></div>
              <input type="range" min={-1} max={1} step={0.05} value={setup[a.id] ?? 0} onChange={(e) => setSetup({ ...setup, [a.id]: Number(e.target.value) })} />
              <div className="c-ends small dim"><span>{a.low}</span><span>{a.high}</span></div>
            </div>
          ))}
          <div className="row-btns">
            <button className="btn primary" onClick={() => { if (window.confirm("Change the setup and start both cars from the pit lane?")) { d({ type: "setSetup", setup, force: true }); setEdit(false); } }}>CONFIRM: PIT LANE START</button>
            <button className="btn" onClick={() => setEdit(false)}>CANCEL</button>
          </div>
        </>
      )}
    </section>
  );
}

/** The grid the race will really start from: qualifying times where known, penalties shown against the cars that took them. */
function briefRows(rows: QualiRow[] | null, grid: string[], drops: Record<string, number> | undefined, prevOrder: string[]): QualiRow[] {
  const base = rows && rows.length === prevOrder.length ? rows : fakeRows(prevOrder);
  const by = new Map(base.map((r) => [r.carId, r] as const));
  return grid.map((id, i) => {
    const r = by.get(id) ?? fakeRows([id])[0];
    return { ...r, position: i + 1, gridPenalty: drops?.[id] ?? r.gridPenalty };
  });
}

function fakeRows(order: string[]): QualiRow[] {
  return order.map((carId, i) => ({ position: i + 1, carId, time: NaN, q1: NaN, q2: NaN, q3: NaN, out: 0 as const, gridPenalty: 0, note: "", dnq: false }));
}

/** The live part of the weekend. Uses the career's own sessions and hands every result back to the reducer. */
export function WeekendFlow({ s, d, msg, onExit }: Props & { msg: string; onExit: () => void }) {
  const ws = s.weekend;
  const [qs, setQs] = useState<QualiSession | null>(null);
  const [rs, setRs] = useState<RaceSession | null>(null);
  const [view, setView] = useState<"play" | "brief" | "race" | "results">("play");
  const rows = useRef<QualiRow[] | null>(null);
  const lastKind = useRef<SessionKind>("race");
  const stage = ws?.stage;
  const plan = useMemo(() => (ws && (stage === "sq" || stage === "quali" || stage === "sprint" || stage === "race") ? planSession(s, stage) : null), [stage, ws?.round, ws?.parcBroken]); // eslint-disable-line react-hooks/exhaustive-deps
  const wk: Weekend | null = useMemo(() => {
    if (!plan) return null;
    const { meta, track } = loadCircuit(plan.circuitId);
    return { settings: plan.settings, meta, track, entries: plan.entries, humanIds: plan.humanIds, laps: plan.laps, aiTyres: plan.aiTyres };
  }, [plan]);

  if (!ws || ws.stage === "done") {
    return (
      <div className="screen">
        <section className="panel">
          <h3>WEEKEND COMPLETE</h3>
          <button className="btn primary big" onClick={onExit}>BACK TO THE FACTORY</button>
        </section>
      </div>
    );
  }
  if (ws.stage === "practice") return <Practice s={s} d={d} msg={msg} />;

  const kind = ws.stage;
  const deadAny = Object.keys(ws.dead ?? {}).length > 0;
  const startQuali = () => {
    if (!plan?.qualiCfg) return;
    const live = new QualiSession(plan.qualiCfg, plan.humanIds);
    live.speed = 8;
    setQs(live);
    lastKind.current = kind as SessionKind;
  };
  if (kind === "sq" || kind === "quali") {
    if (!qs) {
      return (
        <div className="screen">
          <section className="panel">
            <h3>{kind === "sq" ? "SPRINT QUALIFYING" : "QUALIFYING"}</h3>
            <p className="dim">{plan ? sessionTitle(plan.gp, kind === "sq" ? "sq" : "quali") : ""}. Setup is locked once this session ends.</p>
            <div className="row-btns">
              <button className="btn primary big" disabled={deadAny} onClick={startQuali}>{deadAny ? "REPLACE THE FAILED UNIT FIRST" : "GO TO THE GARAGE"}</button>
              <button className="btn" onClick={() => skipWeekend(d)}>SKIP THE WEEKEND</button>
            </div>
          </section>
          <PartsPanel s={s} d={d} forced={deadAny} />
        </div>
      );
    }
    return (
      <>
      <QualiScreen
        session={qs}
        meta={wk!.meta}
        kind={kind === "sq" ? "sq" : "quali"}
        onDone={() => {
          const r = qs.sim.results();
          rows.current = r;
          const order = r.map((x) => x.carId);
          const ex = extrasFromRows(r, plan!.humanIds, qs.sim.finalSets());
          d({ type: "recordSession", kind: kind as SessionKind, order, points: {}, grid: order, dnf: [], locks: ex.locks, used: ex.used, sets: ex.sets });
          setQs(null);
          setView("play");
        }}
      />
      </>
    );
  }

  // sprint or race
  const prevOrder = (kind === "sprint" ? ws.results.sq : ws.results.quali)?.grid ?? [];
  if ((view === "play" || view === "brief") && deadAny) {
    return (
      <div className="screen">
        <PartsPanel s={s} d={d} forced />
        <section className="panel"><p className="dim">The session starts as soon as the failed unit is replaced.</p><button className="btn" onClick={onExit}>BACK TO THE FACTORY</button></section>
      </div>
    );
  }
  if (view === "play" || view === "brief") {
    return (
      <>
      {ws.parc && <ParcStrip s={s} d={d} />}
      <PartsPanel s={s} d={d} />
      <Briefing
        weekend={wk!}
        title={sessionTitle(wk!.meta.gp, ws.stage === "sprint" ? "sprint" : "race")}
        quali={briefRows(rows.current, plan!.raceCfg?.grid ?? prevOrder, plan!.drops, prevOrder)}
        onBack={onExit}
        locks={plan!.locks}
        sets={plan!.raceCfg?.tyreSets}
        setLists={plan!.raceCfg?.tyreSetList}
        pitLane={!!ws.parcBroken}
        extraRules={rulesBrief(plan!.raceCfg?.rules, plan!.laps)}
        onStart={(tyres: Record<string, Compound>, startSets?: Record<string, string>) => {
          const locked: Record<string, Compound> = {};
          if (plan!.locks) for (const id of plan!.humanIds) if (plan!.locks[id]) locked[id] = plan!.locks[id];
          const cfg = { ...plan!.raceCfg!, startTyres: { ...plan!.aiTyres, ...tyres, ...locked }, startSets: { ...(plan!.raceCfg!.startSets ?? {}), ...(startSets ?? {}) } };
          setRs(new RaceSession(cfg, plan!.humanIds));
          lastKind.current = kind as SessionKind;
          setView("race");
        }}
      />
      </>
    );
  }
  if (view === "race" && rs) {
    return (
      <>
      <RaceScreen
        session={rs}
        meta={wk!.meta}
        kind={ws.stage === "sprint" ? "sprint" : "race"}
        onFinish={() => setView("results")}
        donuts={(sess) => {
          if (ws.stage !== "race") return [];
          const pts: Record<string, number> = {};
          for (const r of sess.sim.results()) pts[r.carId] = r.points;
          return donutDrivers(s, pts, sess.sim.cars.map((c) => c.id));
        }}
      />
      </>
    );
  }
  if (view === "results" && rs) {
    return (
      <Results
        session={rs}
        gp={sessionTitle(wk!.meta.gp, ws.stage === "sprint" ? "sprint" : "race")}
        menuLabel="RECORD THE RESULT"
        review={ws.stage === "race" || ws.stage === "sprint" ? setupReview(s, ws) : null}
        onMenu={() => {
          const res = rs.sim.results();
          const points: Record<string, number> = {};
          for (const r of res) points[r.carId] = r.points;
          const moods: Record<string, { morale: number; trust: number; grievance: number; strat?: number }> = {};
          for (const id of plan!.humanIds) { const m = rs.sim.radio?.moods.get(id); if (m) moods[id] = { ...m }; }
          d({ type: "recordSession", kind: lastKind.current, order: res.map((r) => r.carId), points, dnf: res.filter((r) => r.dnf).map((r) => r.carId), moods, failed: failuresOf(res, plan!.humanIds), ...raceExtras(rs.sim, plan!.humanIds) });
          setRs(null);
          setView("play");
        }}
      />
    );
  }
  return null;
}
