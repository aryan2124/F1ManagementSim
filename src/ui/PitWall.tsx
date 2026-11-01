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

/** The planned stop laps and tyres of a plan, with the pit wall's defaults filled in where the player has not chosen. */
export function planOf(orders: StandingOrders, start: Compound, laps: number, lasts: number) {
  const first = orders.stopLap ?? Math.min(laps - 3, Math.max(3, Math.round(lasts * 0.9)));
  const stops = [first, ...(orders.later ?? []).map((l) => l.lap)];
  const comps: Compound[] = [start];
  const chosen: (Compound | null)[] = [null, orders.stopCompound, ...(orders.later ?? []).map((l) => l.compound)];
  for (let i = 1; i <= stops.length; i++) {
    const prev = comps[i - 1];
    comps.push(chosen[i] ?? (i === 1 ? (start === "H" ? "M" : "H") : prev === "H" ? "M" : prev === "M" ? "S" : "M"));
  }
  return { stops, comps, chosen };
}

function Timeline({ laps, life, lifeOf, start, orders, onChange, color, rain }: { laps: number; life: number; lifeOf: (c: Compound) => number; start: Compound; orders: StandingOrders; onChange: (o: StandingOrders) => void; color: string; rain: number[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const k = orders.stance === "tyres" ? 0.7 : orders.stance === "attack" ? 1.45 : 1;
  const wet = start === "I" || start === "W";
  const lasts = wet ? laps : Math.max(3, Math.round(life / k));
  const { stops, comps } = planOf(orders, start, laps, lasts);
  const pct = (lap: number) => `${(lap / laps) * 100}%`;
  const bounds = [0, ...stops, laps];
  const setStops = (next: number[]) => onChange({ ...orders, stopLap: next[0], later: next.slice(1).map((lap, i) => ({ lap, compound: orders.later?.[i]?.compound ?? null })), delegated: false });
  const move = (idx: number, clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const lap = Math.round(((clientX - r.left) / r.width) * laps);
    const lo = idx === 0 ? 2 : stops[idx - 1] + 2;
    const hi = idx === stops.length - 1 ? laps - 2 : stops[idx + 1] - 2;
    const next = [...stops];
    next[idx] = Math.min(Math.max(lo, hi), Math.max(Math.min(lo, hi), lap));
    setStops(next);
  };
  const down = (idx: number) => (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const mv = (ev: PointerEvent) => move(idx, ev.clientX);
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };
  const stint = (i: number) => bounds[i + 1] - bounds[i];
  const lifeOfStint = (i: number) => (wet ? laps : Math.max(3, Math.round(lifeOf(comps[i]) / k)));
  const over = stops.map((_, i) => stint(i) > lifeOfStint(i));
  const dead: { from: number; len: number }[] = [];
  for (let i = 0; i < comps.length && !wet; i++) if (stint(i) > lifeOfStint(i)) dead.push({ from: bounds[i] + lifeOfStint(i), len: stint(i) - lifeOfStint(i) });
  const add = () => {
    let bi = 0;
    for (let i = 1; i < comps.length; i++) if (stint(i) > stint(bi)) bi = i;
    if (stint(bi) < 4) return;
    const lap = Math.round(bounds[bi] + stint(bi) / 2);
    const next = [...stops, lap].sort((x, y) => x - y);
    const at = next.indexOf(lap);
    // keep the tyre choices of the stops that were already planned
    const chosen: (Compound | null)[] = [orders.stopCompound, ...(orders.later ?? []).map((l) => l.compound)];
    while (chosen.length < stops.length) chosen.push(null);
    chosen.splice(at, 0, null);
    onChange({ ...orders, stopLap: next[0], stopCompound: chosen[0] ?? null, later: next.slice(1).map((l, i) => ({ lap: l, compound: chosen[i + 1] ?? null })), delegated: false });
  };
  const remove = () => {
    if (!(orders.later ?? []).length) return;
    onChange({ ...orders, later: (orders.later ?? []).slice(0, -1), delegated: false });
  };
  const words = comps.map((c) => COMPOUNDS[c].name);
  return (
    <div className="tl">
      <div className="tl-bar" ref={ref} onPointerDown={(e) => { if (stops.length && !(e.target as HTMLElement).classList.contains("tl-knob")) { const r = ref.current!.getBoundingClientRect(); const lap = ((e.clientX - r.left) / r.width) * laps; let bi = 0; for (let i = 1; i < stops.length; i++) if (Math.abs(stops[i] - lap) < Math.abs(stops[bi] - lap)) bi = i; move(bi, e.clientX); } }}>
        {comps.map((c, i) => (
          <div key={i} className="tl-seg" style={{ left: pct(bounds[i]), width: pct(stint(i)), background: hex(COMPOUNDS[c].color) }}><b>{COMPOUNDS[c].name.toUpperCase()}</b><small>{stint(i)} laps</small></div>
        ))}
        {dead.map((d, i) => <div key={i} className="tl-dead" style={{ left: pct(d.from), width: pct(d.len) }} title="Tyres are gone from here"><span>TYRES GONE</span></div>)}
        {stops.map((lap, i) => <div key={i} className="tl-knob" style={{ left: pct(lap), borderColor: color }} onPointerDown={down(i)}><span>BOX LAP {lap}</span></div>)}
      </div>
      <div className="tl-rain" title="Chance of rain on your radar, along the race">
        {rain.map((r, i) => <i key={i} style={{ opacity: 0.12 + r * 0.88 }} />)}
        <small>RAIN ALONG THE RACE: {Math.max(...rain) < 0.15 ? "none expected" : Math.max(...rain) < 0.45 ? "a chance" : "likely"}</small>
      </div>
      <div className="tl-stops">
        <span className="dim">{stops.length} STOP{stops.length === 1 ? "" : "S"}</span>
        <button className="tiny" onClick={add} disabled={stops.length >= 6}>+ ADD A STOP</button>
        <button className="tiny" onClick={remove} disabled={!(orders.later ?? []).length}>- REMOVE LAST STOP</button>
        <small className="dim">Plan as many stops as you like. Two different dry compounds are still required.</small>
      </div>
      <div className={`tl-sum ${over.some(Boolean) ? "bad" : ""}`}>
        {orders.stopLap === null ? "No stop set yet: the pit wall will call it. " : ""}
        {`Start on ${words[0]}${words.slice(1).map((w) => `, then ${w}`).join("")}. ${stops.map((lap, i) => `Stop ${i + 1} on lap ${lap}.`).join(" ")} `}
        {over.some(Boolean) ? comps.map((c, i) => (over[i] ? `Stint ${i + 1} on ${COMPOUNDS[c].name} is ${stint(i)} laps but the set lasts about ${lifeOfStint(i)}.` : "")).filter(Boolean).join(" ") : "Every stint is within what its tyre lasts."}
      </div>
    </div>
  );
}

export function PitWall(props: {
  entries: { id: string; code: string; name: string; number: number; color: number }[];
  pos: Record<string, number>;
  laps: number;
  life: { S: number; M: number; H: number };
  /** The team strategist's own plan for this car, read with its skill. */
  advise?: (id: string) => { stops: number; laps: number[]; compounds: ("S" | "M" | "H")[] };
  tyres: Record<string, Compound>;
  setTyres: (t: Record<string, Compound>) => void;
  orders: Record<string, StandingOrders>;
  setOrders: (o: Record<string, StandingOrders>) => void;
  gambles: Record<string, Gamble>;
  setGambles: (g: Record<string, Gamble>) => void;
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
    const adv = props.advise?.(e.id);
    if (adv && adv.stops > 0) {
      const comps = adv.compounds;
      setO({ ...o, stance: l < laps * 0.5 ? "tyres" : "balanced", stopLap: adv.laps[0], stopCompound: comps[1] ?? null, later: adv.laps.slice(1).map((lap, i) => ({ lap, compound: comps[i + 2] ?? null })), delegated: false });
      return;
    }
    const usable = Math.max(3, l * 0.9);
    const n = Math.max(1, Math.min(4, Math.ceil(laps / usable) - 1));
    const laps_ = Array.from({ length: n }, (_, i) => Math.max(2 + i * 2, Math.min(laps - 2 - (n - 1 - i) * 2, Math.round((laps * (i + 1)) / (n + 1)))));
    setO({ ...o, stance: l < laps * 0.5 ? "tyres" : "balanced", stopLap: laps_[0], stopCompound: null, later: laps_.slice(1).map((lap) => ({ lap, compound: null })), delegated: false });
  };
  const plan = (id: string) => {
    const oo = orders[id] ?? NO_ORDERS;
    return oo.stopLap === null ? "stop: pit wall decides" : `box lap ${[oo.stopLap, ...(oo.later ?? []).map((l) => l.lap)].join(", ")}`;
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
        <h3>2. THE PLAN <small>drag a marker to move a stop</small></h3>
        <Timeline laps={laps} life={lifeOf(t)} lifeOf={lifeOf} start={t} orders={o} onChange={setO} color={hex(e.color)} rain={props.rain} />
        <div className="pw-row">
          {(() => {
            const lastsNow = Math.max(3, Math.round(lifeOf(t) / (o.stance === "tyres" ? 0.7 : o.stance === "attack" ? 1.45 : 1)));
            const pl = planOf(o, t, laps, lastsNow);
            const setComp = (i: number, c: Compound | null) => (i === 1 ? setO({ ...o, stopCompound: c, delegated: false }) : setO({ ...o, later: (o.later ?? []).map((l, j) => (j === i - 2 ? { ...l, compound: c } : l)), delegated: false }));
            return pl.stops.map((_, n) => (
              <div className="seg" key={n}>
                <span className="dim">{pl.stops.length > 1 ? `TYRE AFTER STOP ${n + 1}` : "SECOND TYRE"}</span>
                <button className={pl.chosen[n + 1] === null ? "on" : ""} onClick={() => setComp(n + 1, null)}>AUTO</button>
                {(["S", "M", "H"] as Compound[]).map((c) => <button key={c} className={pl.chosen[n + 1] === c ? "on" : ""} onClick={() => setComp(n + 1, c)}><CompoundBadge c={c} size={22} /></button>)}
              </div>
            ));
          })()}
          <button className="btn" onClick={proposal}>ASK THE STRATEGIST</button>
          <button className="btn" onClick={() => setO(NO_ORDERS)}>CLEAR</button>
        </div>
      </section>

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
        <h3>4. PRE-RACE CALL <small>for {e.code} only, one call for the whole race</small></h3>
        <div className="pw-cards">
          {CALLS.map((g) => (
            <button key={g.k} className={`pw-card ${(props.gambles[e.id] ?? "safe") === g.k ? "on" : ""}`} onClick={() => props.setGambles({ ...props.gambles, [e.id]: g.k })}>
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
