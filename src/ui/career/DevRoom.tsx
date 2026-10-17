import { useEffect, useMemo, useRef, useState } from "react";
import type { Card, CardOption, CareerState, DevReact, Idea, Project, Staff } from "../../career/types";
import { AREA_LABEL, type Area } from "../../career/types";
import { StaffBody, StaffPortrait } from "../pixel/portraits";
import { sfx } from "../../audio/sound";
import { TEST_PLANS, bestEstimate, devOf, pitchLine, scrapReact } from "../../career/dev";
import { capRoom } from "../../career/rnd";
import { fmtMoney, fmtRange } from "../../career/util";
import { hex, teamOf, type Dispatch } from "./common";
import "./devroom.css";

const KINDS: Card["kind"][] = ["devCrisis", "staffNotice", "testDay", "projectReady", "ideaBatch", "rndDirection", "media", "info"];
const isScene = (c: Card) => KINDS.includes(c.kind) && (c.kind === "info" ? /^(Pre|In)-season test report/.test(c.title) : !c.notice);
const ICON: Record<DevReact, string> = { fume: "!!", stung: "...", nod: "ok", shrug: "~", sulk: "...", pale: "?!", grin: ":D", proud: "^^" };

/** Typewriter text. */
function useType(text: string, ms = 16) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const id = setInterval(() => setN((x) => (x >= text.length ? (clearInterval(id), x) : x + 1)), ms);
    return () => clearInterval(id);
  }, [text, ms]);
  return text.slice(0, n);
}

/** A person with a face that moves with how they feel. */
export function Person({ st, react, size = 88, say, name = true }: { st?: Staff; react?: DevReact; size?: number; say?: string; name?: boolean }) {
  const typed = useType(say ?? "");
  if (!st) return null;
  const whole = size >= 60;
  return (
    <div className={`dr-person ${react ? "r-" + react : ""}`}>
      {whole ? (
        <div className="dr-body" style={{ width: Math.round(size * 0.9) }}>
          <StaffBody seed={st.id} role={st.role} size={Math.round(size * 0.9)} react={react} />
          {react && <i className="dr-ico">{ICON[react]}</i>}
        </div>
      ) : (
      <div className="dr-face" style={{ width: size, height: size }}>
        <StaffPortrait seed={st.id} role={st.role} size={size} />
        {react && <i className="dr-ico">{ICON[react]}</i>}
      </div>
      )}
      {name && <b className="dr-name">{st.name}</b>}
      {say !== undefined && <p className="dr-bubble">{typed}<span className="dr-caret">_</span></p>}
    </div>
  );
}

const chiefOf = (s: CareerState): Staff | undefined =>
  Object.values(s.staff).filter((x) => x.teamId === s.teamId && !x.intern && (x.role === "designer" || x.role === "td")).sort((a, b) => b.skill - a.skill)[0];

const rankIn = (s: CareerState, a: Area): number => {
  const v = s.teams[s.teamId].car[a];
  return 1 + Object.values(s.teams).filter((t) => t.car[a] > v).length;
};

/** The car drawn as a blueprint with the five areas lit by where the team stands. */
export function Blueprint({ s, sel, onPick, weak, mark }: { s: CareerState; sel?: Area | null; onPick?: (a: Area) => void; weak?: Area | null; mark?: Area | null }) {
  const n = Object.keys(s.teams).length;
  const zone = (a: Area) => {
    const r = rankIn(s, a);
    return r <= n / 3 ? "good" : r <= (2 * n) / 3 ? "mid" : "bad";
  };
  const Z = ({ a, x, y, w, h }: { a: Area; x: number; y: number; w: number; h: number }) => (
    <g className={`bp-z ${zone(a)} ${sel === a ? "sel" : ""} ${weak === a ? "weak" : ""} ${mark === a ? "mark" : ""}`} onClick={() => onPick?.(a)} role={onPick ? "button" : undefined} aria-label={AREA_LABEL[a]}>
      <rect x={x} y={y} width={w} height={h} rx="3" />
      <text x={x + w / 2} y={y + h / 2 - 2} textAnchor="middle">{AREA_LABEL[a].split(" ")[0].toUpperCase()}</text>
      <text x={x + w / 2} y={y + h / 2 + 11} textAnchor="middle" className="rk">P{rankIn(s, a)} of {n}</text>
    </g>
  );
  return (
    <svg className="bp" viewBox="0 0 560 220" role="img" aria-label="Car blueprint">
      <g className="bp-line">
        <path d="M70 140 L150 118 L250 110 L330 96 L420 100 L470 118 L500 140 L470 150 L120 150 Z" />
        <circle cx="140" cy="158" r="26" /><circle cx="440" cy="158" r="30" />
        <path d="M40 124 L90 124 M40 132 L96 132" />
        <path d="M490 92 L530 92 L530 128 M490 100 L530 100" />
        <path d="M20 196 H540" className="dim" /><path d="M20 190 V202 M540 190 V202" className="dim" />
      </g>
      <Z a="aero" x={20} y={40} w={104} h={44} />
      <Z a="chassis" x={190} y={36} w={118} h={44} />
      <Z a="cooling" x={316} y={150} w={110} h={40} />
      <Z a="power" x={430} y={36} w={110} h={44} />
      <Z a="tyres" x={100} y={166} w={90} h={40} />
    </svg>
  );
}

/** Money leaving or arriving: the figure rolls and coins fly. */
export function MoneyTicker({ from, to, label }: { from: number; to: number; label: string }) {
  const [v, setV] = useState(from);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 1400);
      setV(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    sfx.play(to < from ? "spend" : "coin");
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [from, to]);
  return (
    <div className={`dr-money ${to < from ? "out" : "in"}`}>
      <span className="dim small">{label}</span>
      <b>{fmtMoney(v)}</b>
      <div className="dr-coins" aria-hidden>{Array.from({ length: 7 }, (_, i) => <i key={i} style={{ animationDelay: `${i * 0.12}s` }} />)}</div>
    </div>
  );
}

/** A little oval and a car going round it. The numbers come from the real test; this only shows the run. */
function TestTrack({ color, running }: { color: string; running: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    let raf = 0;
    const t0 = performance.now();
    const draw = (t: number) => {
      const a = ((t - t0) / (running ? 700 : 4000)) * Math.PI * 2;
      ctx.clearRect(0, 0, 300, 120);
      ctx.fillStyle = "#0e1a24"; ctx.fillRect(0, 0, 300, 120);
      ctx.strokeStyle = "#35495c"; ctx.lineWidth = 16;
      ctx.beginPath(); ctx.ellipse(150, 60, 112, 38, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "#cfd8dc"; ctx.lineWidth = 1; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.ellipse(150, 60, 112, 38, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      for (let k = 6; k >= 0; k--) {
        const b = a - k * 0.12;
        ctx.fillStyle = k === 0 ? color : color + "55";
        const x = 150 + 112 * Math.cos(b), y = 60 + 38 * Math.sin(b);
        ctx.fillRect(Math.round(x) - 5, Math.round(y) - 3, k === 0 ? 11 : 6, k === 0 ? 7 : 4);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [color, running]);
  return <canvas ref={ref} width={300} height={120} className="dr-track" aria-label="Test track" />;
}

function scrapLine(who: Staff | undefined, react: DevReact | undefined): string {
  if (!who) return "It is gone.";
  const r = react ?? "nod";
  return r === "fume" ? "Months of work, in a bin. Remember this." : r === "pale" ? "Oh. Right. Okay." : r === "stung" ? "I checked it twice." : r === "sulk" ? "Fine. Whatever you say." : r === "shrug" ? "It happens. On to the next one." : r === "grin" ? "Ha. Bold. I will bring a better one." : r === "proud" ? "I stand by it. But it is your call." : "Understood.";
}

type After = { kind: "back" | "fit" | "hold" | "scrap" | "focus" | "notice" | "crisis" | "later" | "press"; title: string; line: string; author?: Staff; react?: DevReact; cost?: { from: number; to: number; label: string }; others?: { st: Staff; react: DevReact }[] };

/** The scenes where the manager's big development calls are made. Replaces the plain decision cards for them. */
export function DevRoom({ s, d }: { s: CareerState; d: Dispatch }) {
  const [later, setLater] = useState<number[]>([]);
  const [after, setAfter] = useState<After | null>(null);
  const card = after ? undefined : s.cards.find((c) => isScene(c) && !later.includes(c.id));
  // a part scrapped from anywhere (the Car screen, the weekend, the verdict) gets the same scene
  const binned = devOf(s.teams[s.teamId]).scrapped?.length ?? 0;
  const seenBin = useRef(binned);
  useEffect(() => {
    if (binned <= seenBin.current) { seenBin.current = binned; return; }
    seenBin.current = binned;
    if (after) return;
    const e = (devOf(s.teams[s.teamId]).scrapped ?? [])[binned - 1];
    const who = e?.staffId ? s.staff[e.staffId] : undefined;
    const react = who ? scrapReact(who) : undefined;
    sfx.play("paper");
    setTimeout(() => sfx.play("thunk"), 450);
    setAfter({ kind: "scrap", title: "SCRAPPED", line: scrapLine(who, react), author: who, react });
  }, [binned]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!after) return;
    const id = setTimeout(() => setAfter(null), after.cost ? 3600 : 3000);
    return () => clearTimeout(id);
  }, [after]);
  if (after) return <Shell title={after.title}><AfterScene a={after} /><div className="dr-foot"><button className="btn" onClick={() => setAfter(null)}>CONTINUE</button></div></Shell>;
  if (!card) return null;
  const skip = () => { sfx.play("click"); setLater((l) => [...l, card.id]); };
  const res = (option: string) => d({ type: "card", id: card.id, option });
  if (card.kind === "rndDirection") return <Briefing s={s} card={card} res={res} setAfter={setAfter} skip={skip} />;
  if (card.kind === "ideaBatch") return <Pitches s={s} card={card} res={res} setAfter={setAfter} skip={skip} />;
  if (card.kind === "media") return <Press s={s} card={card} res={res} setAfter={setAfter} skip={skip} />;
  if (card.kind === "info" || card.kind === "testDay") return <TestDay s={s} card={card} res={res} skip={skip} />;
  if (card.kind === "projectReady") return <Verdict s={s} d={d} card={card} setAfter={setAfter} skip={skip} />;
  return <Talk s={s} card={card} res={res} setAfter={setAfter} skip={skip} />;
}

function Shell({ title, children, skip }: { title: string; children: React.ReactNode; skip?: () => void }) {
  return (
    <div className="prof-back over dr-back" role="presentation">
      <div className="prof dr" role="dialog" aria-modal="true" aria-label={title}>
        <header className="dr-head"><h2>{title}</h2>{skip && <button className="tiny" onClick={skip}>LATER (it stays in your inbox)</button>}</header>
        {children}
      </div>
    </div>
  );
}

function AfterScene({ a }: { a: After }) {
  return (
    <div className={`dr-after k-${a.kind}`}>
      <div className="dr-stage">
        {a.kind === "scrap" && <div className="dr-bin"><i className="paper" /><i className="paper p2" /><span>SKIP</span></div>}
        {a.kind === "hold" && <div className="dr-crate"><span>HELD</span><i /><i /></div>}
        {a.kind === "fit" && <div className="dr-fitcar"><i className="part" /><div className="dr-wheels"><i /><i /></div></div>}
        {a.kind === "back" && <div className="dr-stamp">APPROVED</div>}
        {a.author && <Person st={a.author} react={a.react} say={a.line} />}
      </div>
      {a.others && a.others.length > 0 && (
        <div className="dr-others">
          {a.others.map((o) => <Person key={o.st.id} st={o.st} react={o.react} size={44} />)}
          <p className="dim small">The others who pitched watch you decide.</p>
        </div>
      )}
      {!a.author && <p className="dr-line">{a.line}</p>}
      {a.cost && <MoneyTicker {...a.cost} />}
    </div>
  );
}

function Briefing({ s, card, res, setAfter, skip }: { s: CareerState; card: Card; res: (o: string) => unknown; setAfter: (a: After) => void; skip: () => void }) {
  const chief = chiefOf(s);
  const opts = card.options;
  const rec = opts.find((o) => /recommend/.test(o.label))?.id.slice(6) as Area | undefined;
  const [sel, setSel] = useState<Area | null>(rec ?? null);
  const lab = (s.teams[s.teamId].notebook ?? [])[0];
  const labBit = lab && s.day - lab.day < 30 ? ` Your last lab run, the ${lab.inst}, was ${s.day - lab.day} days ago and I have read it.` : "";
  const line = (rec ? `I have been through the numbers. ${AREA_LABEL[rec]} is where we are furthest behind. We are ${rankIn(s, rec)}th of ${Object.keys(s.teams).length}. That is my read, and I can be wrong.` : "Here is where we stand. Pick where you want the drawing office to spend the next four weeks.") + labBit;
  const go = (id: string, label: string) => {
    sfx.play("confirm");
    res(id);
    setAfter({ kind: "focus", title: "THE DIRECTION IS SET", line: `Understood. ${label}. We start this morning.`, author: chief, react: "proud" });
  };
  const opt = (a: Area) => opts.find((o) => o.id === `focus:${a}`);
  return (
    <Shell title="DRAWING OFFICE: WHERE DO WE POINT THE FACTORY?" skip={skip}>
      <div className="dr-row">
        <Person st={chief} say={line} />
        <div className="dr-col">
          <Blueprint s={s} sel={sel} onPick={setSel} weak={rec ?? null} />
          <p className="dim small">Click an area. Red means you trail the field there.</p>
        </div>
      </div>
      <div className="dr-foot">
        <button className="btn primary" disabled={!sel || !opt(sel)} onClick={() => sel && go(`focus:${sel}`, `${AREA_LABEL[sel]} for four weeks`)}>{sel ? `POINT THE FACTORY AT ${AREA_LABEL[sel].toUpperCase()}` : "PICK AN AREA ON THE BLUEPRINT"}</button>
        {opts.filter((o) => o.id === "focus:balanced" || o.id === "focus:bank").map((o) => <button key={o.id} className="btn" title={o.detail} onClick={() => go(o.id, o.label)}>{o.label.toUpperCase()}</button>)}
      </div>
    </Shell>
  );
}

const KIND_WORD: Record<string, string> = { safe: "SAFE", gamble: "GAMBLE", enabler: "GROUNDWORK" };

function Pitches({ s, card, res, setAfter, skip }: { s: CareerState; card: Card; res: (o: string) => unknown; setAfter: (a: After) => void; skip: () => void }) {
  const t = s.teams[s.teamId];
  const ideas = useMemo(() => card.options.filter((o) => o.id.startsWith("idea:")).map((o) => ({ o, i: t.ideas.find((x) => x.id === Number(o.id.slice(5))) })).filter((x): x is { o: CardOption; i: Idea } => !!x.i), [card, t.ideas]);
  const [foc, setFoc] = useState(ideas[0]?.i.id ?? -1);
  const cur = ideas.find((x) => x.i.id === foc) ?? ideas[0];
  const pl = cur ? pitchLine(s, cur.i) : null;
  const back = () => {
    if (!cur) return;
    const before = capRoom(t);
    const authors = new Set<string>();
    const others = ideas.filter((x) => x.i.id !== cur.i.id && x.i.lead && x.i.lead !== cur.i.lead).map((x) => s.staff[x.i.lead!]).filter((st): st is Staff => !!st && !authors.has(st.id) && !!authors.add(st.id)).map((st) => ({ st, react: (st.traits.includes("hothead") ? "fume" : st.traits.includes("perfectionist") ? "stung" : "sulk") as DevReact }));
    sfx.play("stamp");
    const r = res(cur.o.id) as { ok?: boolean } | undefined;
    if (r && r.ok === false) return;
    setAfter({ kind: "back", title: "BACKED", line: cur.i.rookie ? "You are giving me a real project? I will not let you down." : "Thank you. We start today.", author: pl?.who, react: cur.i.rookie ? "grin" : "proud", cost: { from: before, to: before - cur.i.cost, label: "CAP ROOM" }, others });
  };
  const none = card.options.find((o) => o.id === "none");
  return (
    <Shell title="DRAWING OFFICE: THE PITCHES" skip={skip}>
      <div className="dr-row">
        <Person st={pl?.who} say={pl?.line ?? ""} react={cur?.i.rookie ? "grin" : undefined} />
        <div className="dr-col">
          <Blueprint s={s} mark={cur?.i.area} weak={null} />
          {pl && <p className="dim small">{pl.record}</p>}
        </div>
      </div>
      <div className="dr-pitches">
        {ideas.map(({ o, i }) => {
          const who = i.lead ? s.staff[i.lead] : undefined;
          return (
            <button key={i.id} className={`dr-pitch ${i.id === cur?.i.id ? "on" : ""} ${i.rookie ? "rookie" : ""}`} onClick={() => { sfx.play("click"); setFoc(i.id); }}>
              {who && <StaffPortrait seed={who.id} role={who.role} size={36} />}
              <span><b>{i.name}</b><i className={`k-${i.kind ?? "safe"}`}>{i.rookie ? "ROOKIE PITCH" : i.lab ? "YOUR LAB" : KIND_WORD[i.kind ?? "safe"]}</i></span>
              <span className="small">{AREA_LABEL[i.area]}: {fmtRange(i.predLo, i.predHi)} a lap, {fmtMoney(i.cost)}, {i.days}d</span>
              {o.warn && <em className="warn small">{o.warn}</em>}
            </button>
          );
        })}
      </div>
      {cur && <div className="dr-facts">{cur.o.lines?.map((l, k) => <p key={k} className="small">{l}</p>)}</div>}
      <div className="dr-foot">
        <button className="btn primary" disabled={!cur} onClick={back}>BACK THIS ONE</button>
        {none && <button className="btn" onClick={() => { res("none"); setAfter({ kind: "later", title: "NOT NOW", line: "Nobody gets the money this month. The people who pitched go back to their desks.", others: undefined }); }}>NOT NOW</button>}
      </div>
    </Shell>
  );
}

function Verdict({ s, d, card, setAfter, skip }: { s: CareerState; d: Dispatch; card: Card; setAfter: (a: After) => void; skip: () => void }) {
  const t = s.teams[s.teamId];
  const p: Project | undefined = t.projects.find((x) => x.id === Number(card.data?.projectId));
  const [run, setRun] = useState<string | null>(null);
  useEffect(() => { if (!run) return; const id = setTimeout(() => setRun(null), 2400); return () => clearTimeout(id); }, [run]);
  const who = p?.lead ? s.staff[p.lead] : undefined;
  const est = p ? bestEstimate(p) : undefined;
  const team = teamOf(s.teamId);
  const col = hex(team?.color ?? 0xff8a1f);
  if (!p) return null;
  const test = (plan: keyof typeof TEST_PLANS) => {
    const before = t.cash;
    const r = d({ type: "testPart", id: p.id, plan });
    if (r.ok) { setRun(plan); sfx.play("upgrade"); void before; } else sfx.play("error");
    return r;
  };
  const last = (p.testRuns ?? [])[(p.testRuns ?? []).length - 1];
  const sayTest = run && last ? `${TEST_PLANS[last.plan as keyof typeof TEST_PLANS]?.label ?? "Run"} done. It is ${last.est >= 0 ? "faster" : "slower"} than the old part by about ${Math.abs(last.est).toFixed(2)} s a lap, give or take ${last.sd.toFixed(2)}.` : null;
  const say = sayTest ?? (who ? (who.intern ? "It is built. I think it is good, but you decide." : `It is built. We predicted ${fmtRange(p.predLo, p.predHi)} a lap. I would like to run it before it goes on the car.`) : "It is built.");
  const fit = () => { d({ type: "card", id: card.id, option: "fit" }); sfx.play("upgrade"); setAfter({ kind: "fit", title: "ON THE CAR", line: "Good. The crew will have it on by the next race.", author: who, react: "proud" }); };
  const hold = () => { d({ type: "card", id: card.id, option: "hold" }); sfx.play("thunk"); setAfter({ kind: "hold", title: "IN THE CRATE", line: who ? (who.traits.includes("hothead") ? "A crate. We built it for the car, not for a shelf." : "Fine. It will be waiting.") : "It waits.", author: who, react: who?.traits.includes("hothead") ? "fume" : "shrug" }); };
  const scrap = () => {
    if (!window.confirm(`Scrap "${p.name}"? The money is spent and ${who?.name ?? "the author"} will remember.`)) return;
    const react = who ? scrapReact(who) : undefined;
    d({ type: "scrapProject", id: p.id });
    d({ type: "card", id: card.id, option: "hold" });
    sfx.play("paper");
    setTimeout(() => sfx.play("thunk"), 450);
    setAfter({ kind: "scrap", title: "SCRAPPED", line: scrapLine(who, react), author: who, react });
  };
  return (
    <Shell title={`PART READY: ${p.name.toUpperCase()}`} skip={skip}>
      <div className="dr-row">
        <Person st={who} say={say} react={who && p.rookie ? "grin" : undefined} />
        <div className="dr-col">
          <TestTrack color={col} running={!!run} />
          <div className="dr-gauge" aria-label="What the engineers believe">
            <span className="small dim">Predicted {fmtRange(p.predLo, p.predHi)} a lap{est ? `, tested ${est.est.toFixed(2)} give or take ${est.sd.toFixed(2)}` : ", untested"}</span>
            <div className="bar"><i style={{ left: `${Math.max(0, Math.min(100, 50 + ((p.predLo + p.predHi) / 2) * 120))}%` }} className="pred" />{est && <i className="meas" style={{ left: `${Math.max(0, Math.min(100, 50 + est.est * 120))}%`, width: `${Math.max(2, est.sd * 240)}%` }} />}</div>
          </div>
        </div>
      </div>
      <div className="dr-tests">
        {(Object.keys(TEST_PLANS) as (keyof typeof TEST_PLANS)[]).map((k) => {
          const done = (p.testRuns ?? []).some((r) => r.plan === k);
          return <button key={k} className="tiny" disabled={done || t.cash < TEST_PLANS[k].cost || !!run} title={TEST_PLANS[k].says} onClick={() => test(k)}>{done ? "DONE: " : "TEST: "}{TEST_PLANS[k].label.toUpperCase()} ({fmtMoney(TEST_PLANS[k].cost)})</button>;
        })}
      </div>
      <div className="dr-foot">
        <button className="btn primary" onClick={fit}>FIT IT</button>
        <button className="btn" onClick={hold}>HOLD IT IN THE CRATE</button>
        <button className="btn dr-scrap" onClick={scrap}>SCRAP IT</button>
      </div>
      {devOf(t).rec && who && devOf(t).rec[who.id] && <p className="dim small">{who.name}: backed {devOf(t).rec[who.id].backed} times, overruled {devOf(t).rec[who.id].overruled}, scrapped {devOf(t).rec[who.id].scrapped}.</p>}
    </Shell>
  );
}

function Talk({ s, card, res, setAfter, skip }: { s: CareerState; card: Card; res: (o: string) => unknown; setAfter: (a: After) => void; skip: () => void }) {
  const who = card.data?.staffId ? s.staff[String(card.data.staffId)] : chiefOf(s);
  const isNotice = card.kind === "staffNotice";
  const rc = who ? s.teams[s.teamId].dev?.rec[who.id] : undefined;
  const react: DevReact = isNotice ? (who ? scrapReact(who) : "sulk") : "stung";
  const pick = (o: CardOption) => {
    sfx.play(o.id === "go" ? "fired" : "confirm");
    res(o.id);
    setAfter({ kind: isNotice ? "notice" : "crisis", title: isNotice ? "THE CONVERSATION" : "THE OFFICE", line: o.id === "go" ? "Then I will clear my desk." : o.id === "hard" ? "Then we are done talking." : o.id === "counter" ? "That is fair. I will stay." : "Thank you for hearing me.", author: who, react: o.id === "go" || o.id === "hard" ? "fume" : "nod" });
  };
  return (
    <Shell title={card.title.toUpperCase()} skip={skip}>
      <div className="dr-row">
        <Person st={who} react={react} say={isNotice ? (rc ? `I have been overruled ${rc.overruled} times and had ${rc.scrapped} projects scrapped. I have a letter in my pocket, and I would rather not use it.` : "I need a word.") : "People have stopped sharing work. There are two camps in the drawing office now, and we cannot go on like this."} />
        <div className="dr-col dr-opts">
          <p className="dim small">{card.body}</p>
          {card.options.map((o) => (
            <button key={o.id} className={`c-opt ${o.id === card.defaultOption ? "def" : ""}`} onClick={() => pick(o)}>
              <b>{o.label}</b><span className="dim">{o.detail}</span>
              {o.lines && <ul>{o.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
              {o.warn && <em className="warn">{o.warn}</em>}
            </button>
          ))}
        </div>
      </div>
    </Shell>
  );
}


/** What people in the office are saying right now. Every line is drawn from real state, so none of it can lie. */
export function overheard(s: CareerState): { st: Staff; line: string; react?: DevReact }[] {
  const t = s.teams[s.teamId];
  const d = devOf(t);
  const crate = t.projects.filter((p) => p.status === "ready" && p.hold);
  const out: { st: Staff; line: string; react?: DevReact }[] = [];
  for (const st of Object.values(s.staff)) {
    if (st.teamId !== s.teamId || st.driverId) continue;
    const r = d.rec[st.id];
    const mine = crate.find((p) => p.lead === st.id);
    let line = "";
    let react: DevReact | undefined;
    if (mine) { line = `Still looking at the crate with "${mine.name}" in it.`; react = "sulk"; }
    else if (r && r.scrapped >= 2 && st.mood < 0.45) { line = `Two of mine binned this year. I am not saying anything.`; react = scrapReact(st); }
    else if (r && r.overruled >= 3 && st.mood < 0.5) { line = `Overruled again. Why do we hold these meetings?`; react = "stung"; }
    else if (st.intern && t.projects.some((p) => p.lead === st.id && p.status === "building")) { line = `They gave me a real project. Do not touch my drawings.`; react = "grin"; }
    else if (st.intern) { line = `Staying late. I have an idea for the floor.`; }
    else if (r && r.landed >= 2 && st.mood > 0.6) { line = `That last part worked. Let us do it again.`; react = "proud"; }
    else if (st.mood > 0.75) { line = `Good week. Whistling at the boards.`; react = "grin"; }
    else if (st.mood < 0.35) { line = `Nobody listens down here.`; react = "sulk"; }
    if (line) out.push({ st, line, react });
  }
  return out;
}

/** The office, alive: your people at their desks, with what they are muttering. */
export function OfficeFloor({ s }: { s: CareerState }) {
  const people = useMemo(() => Object.values(s.staff).filter((x) => x.teamId === s.teamId && !x.driverId).sort((a, b) => b.skill - a.skill).slice(0, 8), [s.staff, s.teamId]);
  const talk = overheard(s);
  const [k, setK] = useState(0);
  useEffect(() => { if (talk.length < 2) return; const id = setInterval(() => setK((x) => x + 1), 4200); return () => clearInterval(id); }, [talk.length]);
  const cur = talk.length ? talk[k % talk.length] : undefined;
  const crates = s.teams[s.teamId].projects.filter((p) => p.status === "ready" && p.hold);
  return (
    <section className="panel dr-floor" aria-label="The drawing office">
      <div className="dr-desks">
        {people.map((st, i) => (
          <div key={st.id} className={`dr-desk ${cur?.st.id === st.id ? "talking" : ""} ${cur?.st.id === st.id && cur.react ? "r-" + cur.react : ""}`} style={{ animationDelay: `${(i % 4) * 0.3}s` }} title={`${st.name}, ${st.role}`}>
            <StaffPortrait seed={st.id} role={st.role} size={44} />
            {st.intern && <i className="dr-badge">TRAINEE</i>}
          </div>
        ))}
        {crates.map((p) => <div key={p.id} className="dr-mini-crate" title={`${p.name}, held ${p.heldSince !== undefined ? s.day - p.heldSince : 0} days`}>CRATE</div>)}
      </div>
      <p className="dr-over small">{cur ? <><b>{cur.st.name}:</b> "{cur.line}"</> : <span className="dim">The office is quiet. Everyone is working.</span>}</p>
    </section>
  );
}


/** Thursday's press conference: a reporter, flashbulbs, and your three answers. */
function Press({ s, card, res, setAfter, skip }: { s: CareerState; card: Card; res: (o: string) => unknown; setAfter: (a: After) => void; skip: () => void }) {
  const rep = { id: `rep${card.id}`, name: ["A reporter", "The paddock correspondent", "A journalist"][card.id % 3], role: "press", traits: [] } as unknown as Staff;
  const heat = Math.round(s.press.heat * 100);
  useEffect(() => { sfx.play("shutter"); const a = setTimeout(() => sfx.play("shutter"), 900); return () => clearTimeout(a); }, []);
  return (
    <Shell title="PRESS CONFERENCE" skip={skip}>
      <div className="dr-flash" aria-hidden />
      <div className="dr-row">
        <Person st={rep} say={card.body} react={heat > 55 ? "stung" : undefined} />
        <div className="dr-col dr-opts">
          <p className="dim small">The room is {heat > 55 ? "hostile" : heat > 25 ? "curious" : "quiet"}. Whatever you say will be on the feed within the hour.</p>
          {card.options.map((o) => (
            <button key={o.id} className="c-opt" onClick={() => { sfx.play("press"); res(o.id); setAfter({ kind: "press", title: "THE ROOM REACTS", line: `You said: ${o.label}. ${o.detail ?? ""}` }); }}>
              <b>{o.label}</b><span className="dim">{o.detail}</span>
            </button>
          ))}
        </div>
      </div>
    </Shell>
  );
}

/** Pre-season test: the car out on track, the numbers coming in on the garage screens. */
function TestDay({ s, card, res, skip }: { s: CareerState; card: Card; res: (o: string) => unknown; skip: () => void }) {
  const chief = chiefOf(s);
  const col = hex(teamOf(s.teamId)?.color ?? 0xff8a1f);
  return (
    <Shell title={card.data?.season ? "TEST DAY" : "PRE-SEASON TEST"} skip={skip}>
      <div className="dr-row">
        <Person st={chief} say={card.body} />
        <div className="dr-col">
          <TestTrack color={col} running />
          <div className="dr-screens" aria-hidden>{[0, 1, 2].map((i) => <i key={i} style={{ animationDelay: `${i * 0.4}s` }} />)}</div>
        </div>
      </div>
      {card.kind === "testDay" ? (
        <div className="dr-opts dr-col">
          {card.options.map((o) => (
            <button key={o.id} className={`c-opt ${o.id === card.defaultOption ? "def" : ""}`} onClick={() => { sfx.play("confirm"); res(o.id); }}>
              <b>{o.label}</b><span className="dim">{o.detail}</span>
              {o.lines && <ul>{o.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
            </button>
          ))}
        </div>
      ) : (
        <div className="dr-foot"><button className="btn primary" onClick={() => res("ok")}>BACK TO THE FACTORY</button></div>
      )}
    </Shell>
  );
}
