import { useEffect, useMemo, useRef, useState } from "react";
import type { RaceSession } from "../game/session";
import { useMusic } from "../audio/useMusic";
import { sfx } from "../audio/sound";
import { music } from "../audio/music";
import { NATION_NAME, anthemLength, hasAnthem, playAnthem } from "../audio/anthems";
import { Flag } from "./pixel/Flag";
import { DriverPortrait } from "./pixel/portraits";
import { setSwirl } from "./skin/Swirl";
import { juiceUp } from "./skin/juice";

const hex = (c: number) => "#" + c.toString(16).padStart(6, "0");
const CONFETTI = ["#ff8a1f", "#ffd25a", "#4fd08a", "#3b9cff", "#ff5560", "#c28bff", "#fbf1d6"];
const fmtGap = (g: number, p: number) => (p === 1 ? "WINNER" : Number.isFinite(g) ? `+${g.toFixed(3)}s` : "");

/**
 * The podium as a staged reveal, in the Balatro spirit: third place drops in, then second, then the winner, each with a
 * thunk, a rising chime, a wobble, and for the winner a shake, a flash and a confetti burst. Click or any key skips.
 */
export function Podium({ session, gp, onDone }: { session: RaceSession; gp: string; onDone: () => void }) {
  useMusic("podium");
  const [shown, setShown] = useState(0); // how many steps have landed: 0..3
  const [flash, setFlash] = useState(false);
  const [shake, setShake] = useState(false);
  const [anthem, setAnthem] = useState(false);
  const done = useRef(onDone);
  done.current = onDone;
  const root = useRef<HTMLDivElement>(null);
  const top = useMemo(() => {
    const sim = session.sim;
    return sim
      .results()
      .filter((r) => r.status === "FIN")
      .slice(0, 3)
      .map((r) => {
        const c = sim.car(r.carId);
        return { pos: r.position, id: r.carId, nat: (c.entry.driver as { nat?: string }).nat, name: c.entry.driver.name, code: c.entry.driver.code, team: c.entry.team.name, color: hex(c.entry.team.color), human: c.entry.human, gap: r.gap, points: r.points };
      });
  }, [session]);
  const order = useMemo(() => [...top].reverse(), [top]); // third first
  const confetti = useMemo(() => Array.from({ length: 90 }, (_, i) => ({ x: (i * 53) % 100, d: ((i * 37) % 22) / 10, s: 5 + (i % 4) * 2, c: CONFETTI[i % CONFETTI.length]!, sp: 2.6 + ((i * 17) % 20) / 10, r: (i * 47) % 360 })), []);

  useEffect(() => {
    setSwirl("race");
    const timers: number[] = [];
    order.forEach((_, i) => {
      timers.push(
        window.setTimeout(() => {
          setShown(i + 1);
          sfx.play("thunk");
          sfx.play("climb", i * 2 + 1);
          if (i === order.length - 1) {
            sfx.play("win");
            setFlash(true);
            setShake(true);
            window.setTimeout(() => setFlash(false), 220);
            window.setTimeout(() => setShake(false), 650);
          }
        }, 900 + i * 1500),
      );
    });
    // after the winner has landed, the podium music gives way to the winner's national anthem
    const winnerNat = top.find((x) => x.pos === 1)?.nat;
    const anthemAt = 900 + order.length * 1500 + 900;
    let stopAnthem: (() => void) | null = null;
    timers.push(
      window.setTimeout(() => {
        music.stop();
        setAnthem(true);
        stopAnthem = playAnthem(winnerNat).stop;
      }, anthemAt),
    );
    timers.push(window.setTimeout(() => done.current(), anthemAt + Math.round(anthemLength(winnerNat) * 1000) + 1800));
    const skip = () => done.current();
    window.addEventListener("keydown", skip);
    return () => {
      stopAnthem?.();
      timers.forEach(clearTimeout);
      window.removeEventListener("keydown", skip);
    };
  }, [order, top]);

  useEffect(() => {
    if (shown === 0 || !root.current) return;
    const el = root.current.querySelector<HTMLElement>(`[data-step="${shown}"] .pd-card`);
    juiceUp(el, 0.12, 4);
  }, [shown]);

  if (top.length === 0) return null;
  // winner in the middle, second on the left, third on the right
  const slot = (pos: number) => (pos === 1 ? 1 : pos === 2 ? 0 : 2);
  const rank = (pos: number) => order.findIndex((d) => d.pos === pos) + 1;
  return (
    <div ref={root} className={`podium podium2${shake ? " shake" : ""}`} role="dialog" aria-label={`${gp} podium`} onClick={onDone}>
      {flash && <i className="pd-flash" />}
      <h2 className="pd-title"><span>{gp.toUpperCase()}</span></h2>
      <div className="pd-stage">
        {[2, 1, 3].map((pos) => {
          const d = top.find((x) => x.pos === pos);
          if (!d) return <div key={pos} className="pd-slot empty" />;
          const on = shown >= rank(pos);
          return (
            <div key={pos} className={`pd-slot p${pos}${on ? " on" : ""}`} data-step={rank(pos)} style={{ order: slot(pos), ["--team" as string]: d.color }}>
              <div className="pd-card">
                {pos === 1 && <b className="pd-crown">WINNER</b>}
                <DriverPortrait code={d.code} teamColor={d.color} seed={d.id} mood={pos === 1 ? "happy" : "ok"} size={pos === 1 ? 112 : 88} />
                <b className="pd-name">{d.name}</b>
                <span className="pd-flag"><Flag nat={d.nat} height={pos === 1 ? 18 : 14} /></span>
                <span className="pd-team">{d.team}{d.human ? "  (YOU)" : ""}</span>
                <span className="pd-line"><i className="badge gold">{fmtGap(d.gap, d.pos)}</i>{d.points > 0 && <i className="badge good">+{d.points} PTS</i>}</span>
              </div>
              <div className="pd-step"><b>{pos}</b></div>
            </div>
          );
        })}
      </div>
      {shown >= order.length && (
        <div className="pd-confetti" aria-hidden="true">
          {confetti.map((c, i) => (
            <i key={i} style={{ left: `${c.x}%`, width: c.s, height: c.s * 1.6, background: c.c, animationDelay: `${c.d}s`, animationDuration: `${c.sp}s`, transform: `rotate(${c.r}deg)` }} />
          ))}
        </div>
      )}
      {anthem && (
        <p className="pd-anthem">
          {top.find((x) => x.pos === 1)?.nat && <Flag nat={top.find((x) => x.pos === 1)?.nat} height={14} />}
          <span>{hasAnthem(top.find((x) => x.pos === 1)?.nat) ? "NATIONAL ANTHEM OF" : "IN HONOUR OF"} {(NATION_NAME[top.find((x) => x.pos === 1)?.nat ?? ""] ?? "the winner").toUpperCase()}</span>
        </p>
      )}
      <p className="podium-skip">CLICK OR PRESS ANY KEY TO CONTINUE</p>
    </div>
  );
}
