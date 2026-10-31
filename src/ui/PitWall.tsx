import { useRef, useState } from "react";
import { COMPOUNDS } from "../sim/engine";
import type { Compound } from "../sim/types";
import { NO_ORDERS, type StandingOrders } from "../sim/standing";
import { CompoundBadge } from "./Briefing";
import { StrategyBoard } from "./StrategyBoard";
import { SetPicker } from "./SetPicker";
import type { TyreSet } from "../sim/tyreSets";

const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
export type Gamble = "safe" | "undercut" | "long";

const TYRE_TXT: Record<Compound, { grip: string; risk: string }> = {
  S: { grip: "Fastest. Gone quickly.", risk: "Wears out early" },
  M: { grip: "Balanced pace and life.", risk: "Safe middle" },
  H: { grip: "Slowest. Lasts longest.", risk: "Slow to warm up" },
  I: { grip: "For a damp track.", risk: "Dies on a dry one" },
  W: { grip: "For heavy rain.", risk: "Falls apart on a dry one" },
};

const STANCE: { k: StandingOrders["stance"]; name: string; gain: string; cost: string }[] = [
  { k: "tyres", name: "LOOK AFTER THE TYRES", gain: "Tyres last about 40% longer", cost: "Slower every lap" },
  { k: "balanced", name: "BALANCED", gain: "Standard pace", cost: "No surprises" },
  { k: "attack", name: "ATTACK", gain: "Quicker from the lights", cost: "Tyres die about 30% sooner, more mistakes" },
];

const CALLS: { k: Gamble; name: string; gain: string; cost: string }[] = [
  { k: "safe", name: "PLAY IT STRAIGHT", gain: "No surprises", cost: "Nothing gained" },
  { k: "undercut", name: "UNDERCUT READY", gain: "Pit stops 0.35 s faster", cost: "1 stop in 5 goes wrong. Tyres wear 6% faster" },
  { k: "long", name: "LONG RUN", gain: "Tyres wear 8% slower", cost: "Pit stops 0.4 s slower" },
];

function Timeline({ laps, life, lifeOf, start, orders, onStop, color, rain }: { laps: number; life: number; lifeOf: (c: Compound) => number; start: Compound; orders: StandingOrders; onStop: (lap: number | null) => void; color: string; rain: number[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const k = orders.stance === "tyres" ? 0.7 : orders.stance === "attack" ? 1.45 : 1;
  const wet = start === "I" || start === "W";
  const lasts = wet ? laps : Math.max(3, Math.round(life / k));
  const stop = orders.stopLap ?? Math.min(laps - 3, Math.max(3, Math.round(lasts * 0.9)));
  const second: Compound = orders.stopCompound ?? (start === "H" ? "M" : "H");
  const pct = (lap: number) => `${(lap / laps) * 100}%`;
  const place = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const lap = Math.round(((clientX - r.left) / r.width) * laps);
    onStop(Math.min(laps - 2, Math.max(2, lap)));
  };
  const down = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const mv = (ev: PointerEvent) => place(ev.clientX);
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };
  const over = stop > lasts;
  const stint2 = laps - stop;
  const life2 = Math.round(lifeOf(second) / k);
  return (
    <div className="tl">
      <div className="tl-bar" ref={ref} onPointerDown={(e) => { if (!(e.target as HTMLElement).classList.contains("tl-knob")) place(e.clientX); }}>
        <div className="tl-seg" style={{ left: 0, width: pct(stop), background: hex(COMPOUNDS[start].color) }}><b>{COMPOUNDS[start].name.toUpperCase()}</b><small>{stop} laps</small></div>
        <div className="tl-seg" style={{ left: pct(stop), width: pct(laps - stop), background: hex(COMPOUNDS[second].color) }}><b>{COMPOUNDS[second].name.toUpperCase()}</b><small>{stint2} laps</small></div>
        {!wet && stop > lasts && <div className="tl-dead" style={{ left: pct(lasts), width: pct(stop - lasts) }} title="Tyres are gone from here"><span>TYRES GONE</span></div>}
        {!wet && stint2 > life2 && <div className="tl-dead" style={{ left: pct(stop + life2), width: pct(stint2 - life2) }} title="Tyres are gone from here"><span>TYRES GONE</span></div>}
        <div className="tl-knob" style={{ left: pct(stop), borderColor: color }} onPointerDown={down}><span>BOX LAP {stop}</span></div>
      </div>
      <div className="tl-rain" title="Chance of rain on your radar, along the race">
        {rain.map((r, i) => <i key={i} style={{ opacity: 0.12 + r * 0.88 }} />)}
        <small>RAIN ALONG THE RACE: {Math.max(...rain) < 0.15 ? "none expected" : Math.max(...rain) < 0.45 ? "a chance" : "likely"}</small>
      </div>
      <div className={`tl-sum ${over ? "bad" : ""}`}>
        {orders.stopLap === null ? "No stop set yet: the pit wall will call it. " : ""}
        Start on {COMPOUNDS[start].name}, box on lap {stop}, finish on {COMPOUNDS[second].name}.{" "}
        {over ? `The first set lasts about ${lasts} laps, so it is gone ${stop - lasts} laps before the stop.` : `The first set has about ${lasts - stop} laps in hand.`}
        {stint2 > life2 && !wet ? ` The second stint of ${stint2} laps is longer than that set lasts (${life2}).` : ""}
      </div>
    </div>
  );
}

export function PitWall(props: {
  entries: { id: string; code: string; name: string; number: number; color: number }[];
  pos: Record<string, number>;
  laps: number;
  life: { S: number; M: number; H: number };
  tyres: Record<string, Compound>;
  setTyres: (t: Record<string, Compound>) => void;
  orders: Record<string, StandingOrders>;
  setOrders: (o: Record<string, StandingOrders>) => void;
  gamble: Gamble;
  setGamble: (g: Gamble) => void;
  locks?: Record<string, Compound>;
  sets?: Record<string, Partial<Record<Compound, number>>>;
  setLists?: Record<string, TyreSet[]>;
  startSets: Record<string, string>;
  setStartSets: (s: Record<string, string>) => void;
  rain: number[];
  rainWords: string;
  pitLane?: boolean;
  rules: string[];
  rivals: { id: string; short: string; color: number; style: string; blurb: string }[];
  onBack: () => void;
  onGo: () => void;
}) {
  const { entries, laps, life, tyres, orders } = props;
  const [who, setWho] = useState(entries[0]?.id ?? "");
  const [info, setInfo] = useState(false);
  const e = entries.find((x) => x.id === who) ?? entries[0];
  if (!e) return null;
  const o = orders[e.id] ?? NO_ORDERS;
  const t = tyres[e.id] ?? "M";
  const setO = (n: StandingOrders) => props.setOrders({ ...orders, [e.id]: n });
  const lifeOf = (c: Compound) => (c === "I" || c === "W" ? laps : life[c as "S" | "M" | "H"]);
  const lk = props.locks?.[e.id];
  const stock = (c: Compound) => {
    const inv = props.sets?.[e.id] ?? props.sets?.[Object.keys(props.sets ?? {}).find((k) => k === e.id) ?? ""];
    return inv && (c === "S" || c === "M" || c === "H") ? inv[c] ?? 0 : null;
  };
  const list = props.setLists?.[e.id] ?? [];
  const proposal = () => {
    const l = life[t as "S" | "M" | "H"] ?? laps;
    setO({ ...o, stance: l < laps * 0.5 ? "tyres" : "balanced", stopLap: Math.max(2, Math.min(laps - 3, Math.round(l * 0.9))), delegated: false });
  };
  const plan = (id: string) => {
    const oo = orders[id] ?? NO_ORDERS;
    return oo.stopLap === null ? "stop: pit wall decides" : `box lap ${oo.stopLap}`;
  };
  return (
    <div className="screen pitwall theme-garage">
      <header className="pw-top">
        <button className="tiny" onClick={props.onBack}>{"< THE GRID"}</button>
        <h2>THE PIT WALL</h2>
        <button className="tiny" onClick={() => setInfo(true)} aria-label="Rules and rival pit walls">i  RULES</button>
      </header>
      <div className="pw-drivers">
        {entries.map((x) => (
          <button key={x.id} className={`pw-drv ${x.id === e.id ? "on" : ""}`} style={{ ["--team" as string]: hex(x.color) }} onClick={() => setWho(x.id)}>
            <i className="chip" /><b>{x.code}</b><span>P{props.pos[x.id]} on the grid</span><small>{tyres[x.id]} | {plan(x.id)}</small>
          </button>
        ))}
      </div>
      {props.pitLane && <p className="pw-warn">Starts from the pit lane: the setup was changed after parc ferme.</p>}

      <div className="pw-body">
      <div className="pw-left">
      <section className="pw-sec">
        <h3>1. START TYRE</h3>
        <div className="pw-tyres">
          {(["S", "M", "H", "I", "W"] as Compound[]).map((c) => {
            const left = stock(c);
            const dis = !!lk && lk !== c;
            return (
              <button key={c} className={`pw-tyre ${t === c ? "on" : ""}`} disabled={dis} onClick={() => props.setTyres({ ...tyres, [e.id]: c })} style={{ ["--c" as string]: hex(COMPOUNDS[c].color) }}>
                <CompoundBadge c={c} size={44} />
                <b>{COMPOUNDS[c].name.toUpperCase()}</b>
                <span className="big">{c === "I" || c === "W" ? "wet" : `${Math.round(lifeOf(c))} laps`}</span>
                <small>{TYRE_TXT[c].grip}</small>
                <small className="risk">{TYRE_TXT[c].risk}{left !== null ? ` | ${left} fresh` : ""}</small>
              </button>
            );
          })}
        </div>
        {lk && <p className="pw-warn">Qualifying lock: the fastest Q3 lap was on {COMPOUNDS[lk].name}s, so that is the start tyre.</p>}
      </section>

      <section className="pw-sec">
        <h3>2. THE PLAN <small>drag the box marker to move the stop</small></h3>
        <Timeline laps={laps} life={lifeOf(t)} lifeOf={lifeOf} start={t} orders={o} onStop={(lap) => setO({ ...o, stopLap: lap, delegated: false })} color={hex(e.color)} rain={props.rain} />
        <div className="pw-row">
          <div className="seg">
            <span className="dim">SECOND TYRE</span>
            <button className={o.stopCompound === null ? "on" : ""} onClick={() => setO({ ...o, stopCompound: null })}>AUTO</button>
            {(["S", "M", "H"] as Compound[]).map((c) => <button key={c} className={o.stopCompound === c ? "on" : ""} onClick={() => setO({ ...o, stopCompound: c })}><CompoundBadge c={c} size={22} /></button>)}
          </div>
          <button className="btn" onClick={proposal}>ASK THE STRATEGIST</button>
          <button className="btn" onClick={() => setO(NO_ORDERS)}>CLEAR</button>
        </div>
      </section>

      </div>
      <div className="pw-right">
      <section className="pw-sec">
        <h3>3. HOW HARD TO DRIVE</h3>
        <div className="pw-cards">
          {STANCE.map((s) => (
            <button key={s.k} className={`pw-card ${o.stance === s.k ? "on" : ""}`} onClick={() => setO({ ...o, stance: s.k, delegated: false })}>
              <b>{s.name}</b><span className="gain">{s.gain}</span><span className="cost">{s.cost}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="pw-sec">
        <h3>4. PRE-RACE CALL <small>one call for the whole race</small></h3>
        <div className="pw-cards">
          {CALLS.map((g) => (
            <button key={g.k} className={`pw-card ${props.gamble === g.k ? "on" : ""}`} onClick={() => props.setGamble(g.k)}>
              <b>{g.name}</b><span className="gain">{g.gain}</span><span className="cost">{g.cost}</span>
            </button>
          ))}
        </div>
      </section>

      <details className="pw-more">
        <summary>MORE ORDERS (safety car, cover, tyre limit)</summary>
        <StrategyBoard compact life={lifeOf(t)} orders={o} onChange={setO} laps={laps} />
      </details>
      {list.length > 0 && (
        <details className="pw-more">
          <summary>START SET: {props.startSets[e.id] ? "chosen" : "auto"}</summary>
          <SetPicker
            sets={list.filter((x) => (!lk || x.compound === lk) && !(x.runs > 0 && x.wear >= 0.8) && !Object.values(props.startSets).includes(x.id) || props.startSets[e.id] === x.id)}
            value={props.startSets[e.id] ?? ""}
            onChange={(sid) => {
              const x = list.find((y) => y.id === sid);
              const next = { ...props.startSets };
              if (x) { next[e.id] = x.id; props.setTyres({ ...tyres, [e.id]: x.compound }); } else delete next[e.id];
              props.setStartSets(next);
            }}
          />
        </details>
      )}

      </div>
      </div>

      <footer className="pw-go">
        <p>{entries.map((x) => `${x.code}: ${tyres[x.id]}, ${plan(x.id)}, ${(orders[x.id] ?? NO_ORDERS).stance}`).join("   |   ")}  ({props.rainWords})</p>
        <button className="btn primary big" onClick={props.onGo}>GO TO THE GRID</button>
      </footer>

      {info && (
        <div className="pw-modal" onClick={() => setInfo(false)}>
          <div className="pw-modal-box" onClick={(ev) => ev.stopPropagation()}>
            <h3>RULES IN FORCE</h3>
            <ul>
              <li>Two different dry compounds, or a disqualification. Run the inters or wets at any point and the rule is waived.</li>
              <li>Heavy rain: safety car start, or a red flag and a standing restart.</li>
              <li>Jump starts, track limits and contact earn time penalties.</li>
              <li>Pit lane limited to 80 km/h. A stop costs about 21 seconds.</li>
              <li>Classified if you complete 90% of the winner's laps.</li>
              {props.rules.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
            <h3>THE OTHER PIT WALLS</h3>
            <ul>{props.rivals.map((r) => <li key={r.id}><b style={{ color: hex(r.color) }}>{r.short}</b> {r.style}. {r.blurb}</li>)}</ul>
            <button className="btn primary" onClick={() => setInfo(false)}>CLOSE</button>
          </div>
        </div>
      )}
    </div>
  );
}
