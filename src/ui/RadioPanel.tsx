import { useEffect, useRef, useState } from "react";
import type { LiveSession, LiveSim } from "../game/live";
import type { RaceSession } from "../game/session";
import { hex } from "./colors";
import { CompoundBadge } from "./Briefing";
import type { Compound } from "../sim/types";
import type { Prompt } from "../sim/radio";
import { useUiTick } from "./hooks";
import { DT } from "../sim/engine";
import { clock, scramble } from "./radioFx";

export const ICONS: Record<string, string> = {
  overtake: ">>",
  fastest_lap: "FL",
  crash: "!!",
  failure: "XX",
  sc_deployed: "SC",
  sc_ending: "SC",
  sc_in: "GO",
  pit_in: "PIT",
  pit_out: "OUT",
  chequered: "FIN",
  finish: "FIN",
  green: "GO",
  lights: "..",
  tyre_warning: "TY",
  lap: "LAP",
  vsc: "VSC",
  vsc_ending: "VSC",
  vsc_in: "GO",
  penalty: "PEN",
  warning: "WRN",
  contact: "HIT",
  rule: "RUL",
  yellow: "YEL",
  yellow_clear: "GRN",
  spin: "SPN",
  lockup: "LCK",
  off_track: "OFF",
  gravel: "GRV",
  wall: "WAL",
  damage: "DMG",
  debris: "DEB",
  red_flag: "RED",
  red_restart: "RST",
  weather: "WX",
  lightning: "ZAP",
  radio: "RDO",
  prompt: "ASK",
  order: "ORD",
  q_start: "Q",
  q_end: "Q",
  q_lap: "LAP",
  q_purple: "PB",
  q_eliminated: "OUT",
  q_deleted: "DEL",
  q_red: "RED",
  q_green: "GO",
  q_chequered: "FIN",
  q_mistake: "!!",
  q_impede: "IMP",
};

/** A line being keyed in: the characters arrive one at a time, like a transmission being read out. */
function Typed({ text }: { text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (n >= text.length) return;
    const h = window.setTimeout(() => setN((x) => Math.min(text.length, x + 2)), 28);
    return () => window.clearTimeout(h);
  }, [n, text]);
  return (
    <>
      {text.slice(0, n)}
      {n < text.length && <i className="keyed">_</i>}
    </>
  );
}

type Filter = "all" | "team" | "control";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "ALL" },
  { id: "team", label: "MY TEAM" },
  { id: "control", label: "RACE CONTROL" },
];

export function RadioFeed({ session }: { session: LiveSession<LiveSim> }) {
  const ref = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const all = session.log;
  const seen = useRef<Set<number> | null>(null);
  if (seen.current === null) seen.current = new Set(all.map((l) => l.id));
  const fresh = new Set<number>();
  for (const l of all) if (!seen.current.has(l.id)) fresh.add(l.id);
  useEffect(() => {
    const h = window.setTimeout(() => {
      for (const id of fresh) seen.current?.add(id);
    }, 4000);
    return () => window.clearTimeout(h);
  });
  const lines = all
    .filter((l) => {
      const radio = l.kind === "radio" || l.kind === "prompt";
      if (filter === "all") return true;
      if (filter === "control") return !radio;
      return radio && (l.channel === "team" || l.channel === "driver");
    })
    .slice(-60)
    .reverse(); // newest first, so the latest message is always at the top
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [lines.length, filter]);
  return (
    <section className="radio panel">
      <div className="radio-head">
        <h3>RADIO + RACE CONTROL</h3>
        <div className="seg">
          {FILTERS.map((f) => (
            <button key={f.id} className={filter === f.id ? "on" : ""} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="feed" ref={ref}>
        {lines.map((l) => {
          const radio = l.kind === "radio" || l.kind === "prompt";
          const team = l.team ? session.sim.cars.find((c) => c.entry.team.id === l.team)?.entry.team : undefined;
          const rx = radio && l.channel === "rival" ? scramble(l.text, l.id) : null;
          const body = rx ? rx.text : l.text;
          const typed = radio && l.human !== false && fresh.has(l.id) && l.channel !== "rival" && l.id > 0;
          return (
            <div key={l.id} className={`line k-${l.kind} ${l.human ? "mine" : ""} ch-${l.channel ?? "control"} ${rx ? `rx-${rx.quality}` : ""} ${body.includes("[BLEEP]") ? "bleeped" : ""}`}>
              <b style={radio && team ? { background: hex(team.color), color: "#10101a" } : undefined}>{radio ? (l.channel === "rival" ? "RIV" : l.channel === "team" ? "PIT" : l.kind === "prompt" ? "ASK" : "DRV") : (ICONS[l.kind] ?? "..")}</b>
              <span>
                {radio && <em className="stamp">{clock(l.tick, DT)}</em>}
                {radio && l.human && l.carId && !session.humanIds.includes(l.carId) && team && <em className="stamp">{team.short} (other manager)</em>}
                {typed ? <Typed text={body} /> : body}
                {rx && rx.quality !== "clear" && <em className="static">{rx.quality === "bad" ? "SCANNER: BREAKING UP" : "SCANNER: WEAK"}</em>}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const PICK: { c: Compound; name: string }[] = [
  { c: "S", name: "SOFT" },
  { c: "M", name: "MEDIUM" },
  { c: "H", name: "HARD" },
  { c: "I", name: "INTER" },
  { c: "W", name: "WET" },
];

function PromptRow({ session, p }: { session: RaceSession; p: Prompt }) {
  const sim = session.sim;
  const [picking, setPicking] = useState(false);
  const car = sim.car(p.carId);
  const left = Math.max(0, Math.min(1, (p.expires - sim.tick) / Math.max(1, p.expires - p.tick)));
  const secs = Math.max(0, Math.ceil(((p.expires - sim.tick) * DT)));
  const urgent = secs <= 5;
  const send = (option: string) => sim.command({ type: "reply", promptId: p.id, option });
  return (
    <div className="prompt" style={{ ["--team" as string]: hex(car.entry.team.color) }}>
      <div className="ptop">
        <i className="chip" />
        <b>{car.entry.driver.code}</b>
        <span className="ptext">
          {p.text}
          {p.note && <em className="pnote">{p.note}</em>}
        </span>
      </div>
      <div className="popts">
        {picking ? (
          <>
            <span className="ppick">FIT WHICH TYRE?</span>
            {PICK.map((t) => (
              <button key={t.c} className={`pcomp ${p.compound === t.c ? "rec" : ""}`} title={p.compound === t.c ? "The pit wall's suggestion" : `Fit ${t.name}`} onClick={() => send(`box:${t.c}`)}>
                <CompoundBadge c={t.c} size={18} /> {t.name}
              </button>
            ))}
            <button onClick={() => setPicking(false)}>BACK</button>
          </>
        ) : (
          p.options.map((o) =>
            o.id === "box" ? (
              <span key={o.id} className="boxopt">
                <button title={o.note} onClick={() => send("box")}>
                  {o.label}
                </button>
                <button className="pchoose" title="Choose which tyre to fit" onClick={() => setPicking(true)}>
                  CHOOSE TYRE
                </button>
              </span>
            ) : (
              <button key={o.id} title={o.note} onClick={() => send(o.id)}>
                {o.label}
              </button>
            ),
          )
        )}
      </div>
      <div className={`pclock ${urgent ? "urgent" : ""}`} title="Time left to answer before the driver carries on by himself">
        {secs}s
      </div>
      <div className={`ptimer ${urgent ? "urgent" : ""}`}>
        <i style={{ width: `${left * 100}%` }} />
      </div>
    </div>
  );
}

/** Questions from the player's drivers, waiting for an answer. */
export function PromptBar({ session }: { session: RaceSession }) {
  useUiTick(200);
  const radio = session.sim.radio;
  if (!radio) return null;
  const open = radio.open();
  if (!open.length) return null;
  return (
    <div className="promptbar">
      {open.map((p) => (
        <PromptRow key={p.id} session={session} p={p} />
      ))}
    </div>
  );
}
