import { useEffect, useMemo, useRef, useState } from "react";
import { agenda, type AgendaItem } from "../../career/agenda";
import { skipTarget } from "../../career/autoplay";
import { epochDay, fmtDay, MONTH_NAMES, ymd } from "../../career/util";
import type { Props } from "./common";

const KIND_LABEL: Record<AgendaItem["kind"], string> = {
  race: "Race",
  weekend: "Race weekend",
  reply: "Reply due",
  sprint: "Sprint weekend",
  test: "Test",
  launch: "Car launch",
  shutdown: "Factory closed",
  deadline: "Decision deadline",
  contract: "Contract ends",
  sponsor: "Sponsor",
  era: "Regulations",
  reset: "Tunnel allowance",
  project: "Part ready",
  facility: "Facility",
  promise: "Promise due",
  academy: "Academy",
  season: "Season",
  today: "Today",
};

export function Calendar({ s, d, net }: Props & { net?: boolean }) {
  const [run, setRun] = useState<{ target: number; from: number } | null>(null);
  const [note, setNote] = useState("");
  const dRef = useRef(d);
  dRef.current = d;
  const dayRef = useRef(s.day);
  dayRef.current = s.day;
  useEffect(() => {
    if (!run) return;
    const id = window.setTimeout(() => {
      const r = dRef.current({ type: "autoTo", day: run.target, max: 14 });
      if (!r.ok) {
        setRun(null);
        setNote(r.message);
      } else if (dayRef.current >= run.target || r.message === "Arrived.") {
        setRun(null);
        setNote("Arrived. The team AI handled every decision on the way: default answers to every card, every weekend simulated.");
      } else setRun({ ...run });
    }, 15);
    return () => window.clearTimeout(id);
  }, [run, s.day]);
  const { y: y0, m: m0 } = ymd(s.day);
  const [cur, setCur] = useState({ y: y0, m: m0 });
  const [sel, setSel] = useState<number>(s.day);
  const items = useMemo(() => agenda(s), [s]);
  const first = epochDay(cur.y, cur.m, 1);
  const lead = (ymd(first).wd + 6) % 7; // Monday first
  const daysIn = ymd(epochDay(cur.m === 12 ? cur.y + 1 : cur.y, cur.m === 12 ? 1 : cur.m + 1, 1) - 1).d;
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => first + i)];
  while (cells.length % 7) cells.push(null);
  const on = (day: number) => items.filter((x) => (x.until ? day >= x.day && day <= x.until : x.day === day));
  const upcoming = items.filter((x) => (x.until ?? x.day) >= s.day && x.kind !== "shutdown").slice(0, 14);
  const shift = (n: number) => {
    const m = cur.m + n;
    setCur({ y: cur.y + Math.floor((m - 1) / 12), m: ((m - 1 + 12) % 12) + 1 });
  };
  const selItems = on(sel);
  const landing = skipTarget(s, sel);
  return (
    <div className="c-cols">
      <section className="panel">
        <div className="c-calhead">
          <button className="tiny" onClick={() => shift(-1)}>{"<"}</button>
          <h3>{MONTH_NAMES[cur.m - 1].toUpperCase()} {cur.y}</h3>
          <button className="tiny" onClick={() => shift(1)}>{">"}</button>
          <button className="tiny" onClick={() => { setCur({ y: y0, m: m0 }); setSel(s.day); }}>TODAY</button>
        </div>
        <div className="c-grid">
          {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((w) => <div key={w} className="c-gh">{w}</div>)}
          {cells.map((day, i) => {
            if (day === null) return <div key={i} className="c-gd empty" />;
            const its = on(day);
            const shut = its.some((x) => x.kind === "shutdown");
            return (
              <button key={i} className={`c-gd ${day === s.day ? "today" : ""} ${day < s.day ? "past" : ""} ${shut ? "shut" : ""} ${day === sel ? "sel" : ""}`} onClick={() => setSel(day)}>
                <b>{ymd(day).d}</b>
                {its.filter((x) => x.kind !== "shutdown").slice(0, 3).map((x, k) => (
                  <em key={k} className={`k-${x.kind} ${x.action ? "act" : ""}`}>{x.label}</em>
                ))}
                {its.filter((x) => x.kind !== "shutdown").length > 3 && <small>+{its.filter((x) => x.kind !== "shutdown").length - 3} more</small>}
                {its.length > 0 && <span className="sd-pop"><b>{fmtDay(day, true)}</b>{its.map((x) => `${KIND_LABEL[x.kind]}: ${x.label}${x.sub ? ` (${x.sub})` : ""}`).join("\n")}</span>}
              </button>
            );
          })}
        </div>
        <div className="c-legend">
          {(["weekend", "race", "sprint", "reply", "test", "launch", "deadline", "contract", "sponsor", "era", "reset", "project"] as const).map((k) => <span key={k} className={`k-${k}`}>{KIND_LABEL[k]}</span>)}
          <span className="k-shutdown">Factory closed</span>
        </div>
        {!net && (
          <div className="c-skip">
            <h4>LET THE TEAM AI RUN THINGS</h4>
            {run ? (
              <>
                <div className="bar"><i style={{ width: `${Math.min(100, ((s.day - run.from) / Math.max(1, run.target - run.from)) * 100)}%` }} /></div>
                <p className="small">Simulating to {fmtDay(run.target, true)}. Now {fmtDay(s.day, true)}.</p>
                <button className="btn" onClick={() => setRun(null)}>STOP</button>
              </>
            ) : (
              <>
                <p className="dim small">Pick a day above and the clock runs there on its own. Every card gets its default answer and every race weekend is simulated for you. Good for testing the long game.</p>
                <div className="row-btns">
                  <button className="btn primary" disabled={landing <= s.day} onClick={() => { setNote(""); setRun({ target: landing, from: s.day }); }}>
                    {landing <= s.day ? "PICK A FUTURE DAY" : `SIMULATE TO ${fmtDay(landing, true).toUpperCase()}`}
                  </button>
                  {landing !== sel && landing > s.day && <p className="small dim">{fmtDay(sel, true)} has something on it, so the clock stops at {fmtDay(landing, true)} and you arrive before it starts.</p>}
                  <button className="btn" onClick={() => { setNote(""); setRun({ target: s.day + 30, from: s.day }); }}>+30 DAYS</button>
                  <button className="btn" onClick={() => { setNote(""); setRun({ target: s.day + 365, from: s.day }); }}>+1 SEASON</button>
                  <button className="btn" onClick={() => { setNote(""); setRun({ target: s.day + 365 * 3, from: s.day }); }}>+3 SEASONS</button>
                </div>
              </>
            )}
            {note && <p className="small">{note}</p>}
          </div>
        )}
        <h4>{fmtDay(sel, true).toUpperCase()}</h4>
        {selItems.length === 0 && <p className="dim">Nothing is dated on this day.</p>}
        {selItems.map((x, i) => (
          <p key={i} className="small"><b>{KIND_LABEL[x.kind]}:</b> {x.label}{x.sub ? <span className="dim"> ({x.sub})</span> : null}</p>
        ))}
      </section>
      <section className="panel">
        <h3>COMING UP</h3>
        {upcoming.map((x, i) => (
          <div key={i} className={`c-up ${x.action ? "act" : ""}`}>
            <span className={`k-${x.kind} tag`}>{KIND_LABEL[x.kind]}</span>
            <div>
              <b>{x.label}</b>
              <p className="dim small">{fmtDay(x.day)} {x.day === s.day ? "(today)" : `(in ${x.day - s.day} days)`}{x.sub ? ` | ${x.sub}` : ""}</p>
            </div>
          </div>
        ))}
        <p className="dim small">Highlighted rows need an answer from you before the date shown. Rival teams and the rule makers keep their own dates; only the ones that affect you are listed.</p>
      </section>
    </div>
  );
}
