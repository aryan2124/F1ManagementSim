import { useEffect, useMemo, useState } from "react";
import type { CareerState } from "../../career/types";
import { sfx } from "../../audio/sound";
import "./devroom.css";
import { DriverPortrait } from "../pixel/portraits";
import { Cup, PLink } from "./Profile";
import { hex, teamOf, type Dispatch } from "./common";
import { ROLE_WORD } from "../../career/status";

/** A conversation with a driver: he says what is on his mind, you answer, he reacts. */
export function ConvoPanel({ s, d }: { s: CareerState; d: Dispatch }) {
  const [gone, setGone] = useState<number[]>([]);
  const cv = (s.convos ?? []).find((c) => c.open && !gone.includes(c.id));
  if (!cv) return null;
  const x = s.drivers[cv.driverId];
  if (!x) return null;
  const team = teamOf(x.teamId);
  const leave = () => {
    setGone((g) => [...g, cv.id]);
    d({ type: "convoClose", id: cv.id });
  };
  return (
    <div className="prof-back over" role="presentation">
      <div className="prof convo" role="dialog" aria-modal="true" aria-label={`Conversation with ${x.spec.name}`}>
        <header className="prof-head" style={{ ["--team" as string]: hex(team?.color ?? 0x888888) }}>
          <div className={`dr-person dr-walkin r-${x.gStage >= 3 ? "fume" : x.grievance > 0.55 ? "stung" : x.morale > 0.7 ? "grin" : x.morale < 0.4 ? "sulk" : "none"}`}>
            <div className="dr-face" style={{ width: 64, height: 64 }}>
              <DriverPortrait code={x.spec.code} teamColor={hex(team?.color ?? 0x888888)} seed={x.id} size={64} mood={x.gStage >= 3 ? "angry" : x.grievance > 0.55 ? "tense" : x.morale > 0.7 ? "happy" : "ok"} />
              <i className="dr-ico">{x.gStage >= 3 ? "!!" : x.grievance > 0.55 ? "..." : x.morale > 0.7 ? ":D" : x.morale < 0.4 ? "..." : "?"}</i>
            </div>
          </div>
          <div>
            <h2><PLink kind="driver" id={x.id}>{x.spec.name}</PLink></h2>
            <p className="dim small">Wants a word. {ROLE_WORD[x.role]} at {team?.name}.</p>
          </div>
        </header>
        <div className="convo-lines">
          {cv.lines.map((l, i) => (
            <p key={i} className={`line ${l.who}`}>
              {l.who === "note" ? <em>{l.text}</em> : <><b>{l.who === "him" ? x.spec.name.split(" ").slice(-1)[0] : "You"}:</b> {l.text}</>}
            </p>
          ))}
        </div>
        {cv.open && cv.options.length > 0 ? (
          <div className="convo-opts">
            {cv.options.map((o) => (
              <button key={o.id} className="opt" onClick={() => d({ type: "convoSay", id: cv.id, option: o.id })}>
                <b>{o.label}</b>
                <span className="small dim">{o.detail}</span>
              </button>
            ))}
            <button className="tiny" onClick={leave}>WALK OUT (he will notice)</button>
          </div>
        ) : (
          <button className="tiny primary" onClick={leave}>DONE</button>
        )}
      </div>
    </div>
  );
}

const CONFETTI = 70;

/** A title is won. This can happen mid-season, whenever the maths says nobody can catch the leader. */
export function CeremonyOverlay({ s, d }: { s: CareerState; d: Dispatch }) {
  const c = (s.ceremonies ?? [])[0];
  useEffect(() => {
    if (c) sfx.play("title");
  }, [c?.kind, c?.id, c?.year]); // eslint-disable-line react-hooks/exhaustive-deps
  const bits = useMemo(
    () =>
      Array.from({ length: CONFETTI }, (_, i) => ({
        l: (i * 37) % 100,
        dl: ((i * 53) % 90) / 30,
        du: 3 + ((i * 17) % 40) / 10,
        c: ["#f5c542", "#ffffff", "#ff4d6d", "#4dd2ff", "#8aff80", "#b48cff"][i % 6]!,
        r: (i * 29) % 360,
      })),
    [],
  );
  if (!c) return null;
  const wdc = c.kind === "wdc";
  const x = wdc ? s.drivers[c.id] : undefined;
  const team = teamOf(wdc ? x?.teamId : c.id);
  const col = hex(team?.color ?? 0xf5c542);
  const left = Math.max(0, s.calendar.length - (c.round));
  const title = wdc ? `${x?.spec.name ?? "?"}` : `${team?.name ?? c.id}`;
  const early = left > 0;
  return (
    <div className={`cer ${wdc ? "wdc" : "wcc"} ${c.mine ? "mine" : ""}`} style={{ ["--team" as string]: col }} role="dialog" aria-modal="true" aria-label="Championship won">
      <div className="cer-rays" />
      {bits.map((b, i) => (
        <i key={i} className="conf" style={{ left: `${b.l}%`, background: b.c, animationDelay: `${b.dl}s`, animationDuration: `${b.du}s`, transform: `rotate(${b.r}deg)` }} />
      ))}
      <div className="cer-card">
        <p className="cer-year">{c.year}</p>
        <h1 className="cer-h">{wdc ? "WORLD CHAMPION" : "CONSTRUCTORS' CHAMPIONS"}</h1>
        <div className="cer-cup"><Cup tone={wdc ? "gold" : "wcc"} /></div>
        {wdc && x && <div className="cer-por"><DriverPortrait code={x.spec.code} teamColor={col} seed={x.id} size={96} mood="happy" /></div>}
        <h2 className="cer-name">{title}</h2>
        <p className="cer-sub">{wdc ? `drives for ${team?.name ?? "no team"}` : `${x ? "" : "with "}${(s.teams[c.id]?.wcc?.length ?? 1)} constructors' titles`}</p>
        <p className="cer-note">{early ? `Clinched with ${left} ${left === 1 ? "race" : "races"} still to run.` : "Settled at the last race."}{c.mine ? " It is your team." : ""}</p>
        <button className="tiny primary" onClick={() => d({ type: "ackCeremony" })}>{c.mine ? "CELEBRATE" : "CONTINUE"}</button>
      </div>
    </div>
  );
}
