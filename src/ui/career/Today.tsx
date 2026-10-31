import { PLink } from "./Profile";
import { useEffect, useState, type ReactNode } from "react";
import { FOCUS, type FocusKind } from "../../career/focus";
import type { CareerState } from "../../career/types";
import { circuitMeta } from "../../game/circuits";
import { daysTo, factoryClosed, inSummerBreak, launchDay, summerEnd, winterEnd } from "../../career/calendar";
import { fmtDay, fmtMoney, ymd } from "../../career/util";
import { capRoom, nextAllowanceReset } from "../../career/rnd";
import { standingsRank } from "../../career/car";
import { agenda, type AgendaItem } from "../../career/agenda";
import { eraNote } from "../../career/eras";
import { ordinal } from "../../career/world";
import { teamColour, teamLabel } from "../../career/brand";
import { Bar, CardView, Tip, driverName, hex, type Props, type Tab } from "./common";
import { FactoryScene } from "../pixel/FactoryScene";
import { DeptIcon } from "../pixel/icons";
import { Num } from "../skin/Num";

export interface Clock {
  running: boolean;
  speed: 1 | 2 | 4;
  stopped: string;
}

const KIND_MARK: Partial<Record<AgendaItem["kind"], string>> = { race: "R", sprint: "S", deadline: "!", test: "T", launch: "L", contract: "C", era: "E", reset: "H", promise: "P", sponsor: "$" };

function DayStrip({ s }: { s: Props["s"] }) {
  const items = agenda(s);
  const days = Array.from({ length: 21 }, (_, i) => s.day - 3 + i);
  const WD = ["S", "M", "T", "W", "T", "F", "S"];
  return (
    <div className="c-strip" aria-label="The next three weeks">
      {days.map((day) => {
        const { d: dd, wd, m } = ymd(day);
        const its = items.filter((x) => x.day === day && KIND_MARK[x.kind]);
        const shut = factoryClosed(day, s.year);
        return (
          <div key={day} tabIndex={0} className={`c-sd ${day === s.day ? "now" : ""} ${day < s.day ? "past" : ""} ${shut ? "shut" : ""}`}>
            <span className="sd-pop"><b>{fmtDay(day, true)}</b>{shut ? "Factory shut\n" : ""}{its.map((x) => x.label).join("\n") || "Nothing scheduled"}</span>
            <small>{WD[wd]}</small>
            <b>{dd === 1 ? `${dd}/${m}` : dd}</b>
            <i>{its.slice(0, 2).map((x) => KIND_MARK[x.kind]).join("")}</i>
          </div>
        );
      })}
    </div>
  );
}

function FactoryBox({ s, go }: { s: Props["s"]; go: (t: Tab) => void }) {
  const me = s.teams[s.teamId];
  const closed = factoryClosed(s.day, s.year);
  const { m } = ymd(s.day);
  const build = me.projects.filter((p) => p.status === "building");
  const lv = (n: number) => Math.max(1, Math.min(5, Math.round(n || 1)));
  const kids = Object.values(s.academy.prospects).filter((p) => p.owner === s.teamId && p.status === "academy").length;
  return (
    <div className="c-factory">
      <FactoryScene
        closed={closed}
        night={false}
        winter={m === 12 || m <= 2}
        levels={{ tunnel: lv(me.facilities.tunnel), sim: lv(me.facilities.sim), factory: lv(me.facilities.factory), academy: lv(me.facilities.academy) }}
        busy={{ tunnel: !closed && me.tunnelLeft > 0 && build.some((p) => p.tunnelHours > 0), sim: !closed && !!s.weekend, factory: !closed && build.length > 0, academy: !closed && kids > 0 }}
        teamColor={teamColour(s)}
        carBay={{ building: build.length > 0, progress: 0.5 }}
        onOpen={(dep) => go(dep === "academy" ? "academy" : dep === "sim" ? "people" : "car")}
      />
    </div>
  );
}

function Chapter({ s, go }: { s: Props["s"]; go: (t: Tab) => void }) {
  const me = s.teams[s.teamId];
  const closedYear = s.history.some((h) => h.year === s.year);
  const summer = inSummerBreak(s.day, s.year);
  const winter = factoryClosed(s.day, s.year) && !summer;
  if (closedYear) {
    const h = s.history[s.history.length - 1];
    const goal = s.owner.goal;
    const recs = s.news.filter((n) => n.tag === "record" && n.day >= s.day - 40).slice(0, 3);
    const expiring = Object.values(s.drivers).filter((x) => x.teamId === s.teamId && !x.retired && x.endYear <= s.year);
    const academyDec = s.academy.decisions.length;
    return (
      <section className="panel c-chapter">
        <h3>THE {h.year} SEASON IS OVER</h3>
        <p>
          <b>{h.champion}</b> is champion. You finished <b>{ordinal(h.playerPos)}</b> in the constructors' with {h.playerPoints} points. Owner's second goal ({goal.text}): <b>{goal.done === null ? "not judged" : goal.done ? "met" : "missed"}</b>.
        </p>
        {recs.map((r, i) => <p key={i} className="dim small">{r.text}</p>)}
        <h4>BEFORE THE NEW YEAR</h4>
        <ul className="c-tasks">
          <li className={expiring.length ? "todo" : "done"}><button className="linkish" onClick={() => go("people")}>Contracts</button> {expiring.length ? `${expiring.length} driver deal${expiring.length > 1 ? "s" : ""} ending` : "all drivers signed for next year"}</li>
          <li className={academyDec ? "todo" : "done"}><button className="linkish" onClick={() => go("academy")}>Academy</button> {academyDec ? `${academyDec} end of season decision${academyDec > 1 ? "s" : ""}` : "nothing to decide"}</li>
          <li className="todo"><button className="linkish" onClick={() => go("money")}>Budgets</button> set next year's ceilings</li>
          <li className="todo"><button className="linkish" onClick={() => go("rules")}>Rules</button> {eraNote(s) || "check the regulations"}</li>
        </ul>
        <p className="dim small">The new cars launch on {fmtDay(launchDay(s.year + 1))}. Cash {fmtMoney(me.cash)}.</p>
      </section>
    );
  }
  if (summer || winter) {
    const end = summer ? summerEnd(s.year) : winterEnd(s.year - (ymd(s.day).m === 12 ? 0 : 1));
    const expiring = Object.values(s.drivers).filter((x) => x.teamId === s.teamId && !x.retired && x.endYear <= s.year);
    return (
      <section className="panel c-chapter">
        <h3>{summer ? "SUMMER SHUTDOWN" : "WINTER SHUTDOWN"}: {Math.max(0, daysTo(s.day, end))} DAYS LEFT</h3>
        <p className="dim">The factory is closed by the rules. No design, building or tunnel work happens until {fmtDay(end + 1)}. Use the time.</p>
        <ul className="c-tasks">
          {summer && <li className={expiring.length ? "todo" : "done"}><button className="linkish" onClick={() => go("people")}>Driver talks</button> {expiring.length ? `${expiring.length} of your drivers are out of contract; rivals may approach them` : "your drivers are settled"}</li>}
          {summer && s.era.next && s.era.next.stage >= 1 && <li className="todo"><button className="linkish" onClick={() => go("rules")}>Regulations</button> new stage published: {eraNote(s)}</li>}
          <li className="todo"><button className="linkish" onClick={() => go("academy")}>Academy</button> review your prospects and scouts</li>
          <li className="todo"><button className="linkish" onClick={() => go("money")}>Budgets</button> check the ceilings against what you spend</li>
          <li className="todo"><button className="linkish" onClick={() => go("calendar")}>Calendar</button> see what is coming when the factory reopens</li>
        </ul>
      </section>
    );
  }
  void me;
  return null;
}

/** One line about who matters this week. */
function closedYearNow(s: CareerState): boolean {
  return s.history.some((h) => h.year === s.year);
}

function threatLine(s: CareerState): string {
  const ranked = Object.entries(s.standings.teams).sort((a, b) => b[1] - a[1]);
  const i = ranked.findIndex(([id]) => id === s.teamId);
  const mine = ranked[i]?.[1] ?? 0;
  if (ranked.every(([, p]) => p === 0)) return "Nobody has scored yet. Everything is still to play for.";
  const above = ranked[i - 1];
  const below = ranked[i + 1];
  if (i === 0 && below) return `You lead. ${teamLabel(s, below[0])} are ${mine - below[1]} points behind.`;
  if (above && below && above[1] - mine <= mine - below[1]) return `${teamLabel(s, above[0])} are ${above[1] - mine} points ahead. Catch them.`;
  if (below) return `${teamLabel(s, below[0])} are ${mine - below[1]} points behind you. Hold them off.`;
  return above ? `${teamLabel(s, above[0])} are ${above[1] - mine} points ahead.` : "";
}

function FocusRow({ s, d }: { s: Props["s"]; d: Props["d"] }) {
  const cur = s.focus?.kind;
  return (
    <section className="panel c-focus">
      <h3>THIS WEEK'S FOCUS</h3>
      <div className="focus-cards">
        {(Object.keys(FOCUS) as FocusKind[]).map((k, i) => (
          <button key={k} className={`focus-card clickable ${cur === k ? "sel" : ""}`} onClick={() => d({ type: "setFocus", kind: k })} title={`Press ${i + 1}`}>
            <b>{i + 1}. {FOCUS[k].label}</b>
            <span className="gain">{FOCUS[k].gain}</span>
            <span className="cost">{FOCUS[k].cost}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

const WD_LONG = 7;
void WD_LONG;

const STAGE_BUTTON: Record<string, string> = { practice: "GO TO PRACTICE", sq: "GO TO SPRINT QUALIFYING", sprint: "GO TO THE SPRINT", quali: "GO TO QUALIFYING", race: "GO TO THE RACE" };
/** The big button on a weekend day names the next thing to do, instead of CONTINUE. */
export function weekendButton(s: CareerState): string {
  const ws = s.weekend;
  if (!ws) return "CONTINUE";
  return ws.entered ? STAGE_BUTTON[ws.stage] ?? "CONTINUE" : "START WEEKEND";
}
function weekendNote(s: CareerState): string {
  const ws = s.weekend;
  if (!ws) return "";
  const gp = circuitMeta(s.calendar[ws.round].circuitId).gp;
  const dead = Object.keys(ws.dead ?? {}).length;
  return `${gp} race weekend${ws.entered ? "" : " begins"}.${dead ? " A unit has failed and needs replacing." : ""}`;
}

export function Today({ s, d, onWeekend, msg, go, clock, play, pause, setSpeed, dock }: Props & { dock?: ReactNode; onWeekend: () => void; msg: string; go: (t: Tab) => void; clock: Clock; play: () => void; pause: () => void; setSpeed: (v: 1 | 2 | 4) => void }) {
  const me = s.teams[s.teamId];
  const next = s.calendar[s.round];
  const inWeekend = !!s.weekend && s.weekend.stage !== "done";
  const toNext = next ? daysTo(s.day, next.day) : null;
  const rank = standingsRank(s).indexOf(s.teamId) + 1;
  const decisions = s.cards.filter((c) => !c.notice && !c.mail).sort((a, b) => b.urgency - a.urgency || a.created - b.created);
  const notices = s.cards.filter((c) => c.notice).sort((a, b) => b.created - a.created);
  const topDrivers = Object.entries(s.standings.drivers).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topTeams = Object.entries(s.standings.teams).sort((a, b) => b[1] - a[1]);
  const urgent = decisions.some((c) => c.urgency === 3);
  const [more, setMore] = useState(false);
  const [fullTable, setFullTable] = useState(false);
  // notices clear themselves after five days
  useEffect(() => {
    for (const n of notices) if (n.created < s.day - 5) d({ type: "dismiss", id: n.id });
  }, [s.day]); // eslint-disable-line react-hooks/exhaustive-deps
  // number keys choose the weekly focus
  useEffect(() => {
    const ks: FocusKind[] = ["car", "drivers", "money", "academy"];
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || e.ctrlKey || e.metaKey) return;
      const i = Number(e.key) - 1;
      if (i >= 0 && i < 4 && !inWeekend && !clock.running) d({ type: "setFocus", kind: ks[i] });
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [inWeekend, clock.running]); // eslint-disable-line react-hooks/exhaustive-deps
  const myIdx = topTeams.findIndex(([id]) => id === s.teamId);
  const shownTeams = fullTable ? topTeams : topTeams.slice(Math.max(0, Math.min(myIdx - 2, topTeams.length - 5)), Math.max(0, Math.min(myIdx - 2, topTeams.length - 5)) + 5);
  return (
    <div className="c-today">
      <section className="panel c-head hero-head">
        <div className="hh-date">
          <h2 className="c-date">{fmtDay(s.day, true).toUpperCase()}, {s.year}</h2>
          {next ? (
            <div className="hh-next">
              <span className="badge gold">ROUND {next.round} OF {s.calendar.length}</span>
              {next.sprint && <span className="badge tech">SPRINT</span>}
              <b>{circuitMeta(next.circuitId).gp}</b>
              <span className="hh-count"><Num v={toNext ?? 0}>{toNext === 0 ? "THIS WEEKEND" : toNext}</Num>{toNext !== 0 && <small>{toNext === 1 ? "day to go" : "days to go"}</small>}</span>
            </div>
          ) : (
            <p className="dim">The season is over.</p>
          )}
          <p className="hh-threat">{threatLine(s)}</p>
          {eraNote(s) && <p className="dim small">Regulations: {eraNote(s)}</p>}
          {Object.entries(s.gridDrops ?? {}).filter(([, l]) => l.length).map(([id, l]) => (
            <p key={id} className="small warn">Grid penalty at the next race: {s.drivers[id]?.spec.name ?? id}, {l.reduce((a, x) => a + x.places, 0)} places ({l.map((x) => x.why).join("; ")}).</p>
          ))}
        </div>
        <div className="tiles hh-tiles">
          <div className="stat-tile" style={{ ["--tile" as string]: me.cash < 0 ? "var(--c-bad)" : "var(--c-gold)", ["--i" as string]: 0 }}><span>CASH <Tip text="Real money in the bank. Prize money, sponsors and fees come in; salaries and upkeep go out each month." /></span><b><Num v={me.cash}>{fmtMoney(me.cash)}</Num></b><u><DeptIcon kind="cash" size={22} /></u></div>
          <div className="stat-tile" style={{ ["--tile" as string]: me.board < 28 ? "var(--c-bad)" : "var(--c-good)", ["--i" as string]: 3 }}><span>BOARD <Tip text="How much the board trusts you, 0 to 100. Below about 15 you can be sacked, unless yours is the weakest car on the grid." /></span><b><Num v={Math.round(me.board)}>{Math.round(me.board)}</Num></b><Bar v={me.board} max={100} color={me.board < 28 ? "var(--c-bad)" : "var(--c-good)"} /><u><DeptIcon kind="board" size={22} /></u></div>
          <div className="stat-tile" style={{ ["--tile" as string]: "var(--c-go)", ["--i" as string]: 5 }}><span>STANDING</span><b><Num v={rank} good="down">P{rank}</Num></b><u><DeptIcon kind="car" size={22} /></u></div>
        </div>
        <button className="tiny c-morebtn" onClick={() => setMore((m) => !m)}>{more ? "LESS" : "MORE NUMBERS"}</button>
        {more && <div className="tiles hh-tiles c-drawer">
          <div className="stat-tile" style={{ ["--tile" as string]: capRoom(me) < 0 ? "var(--c-bad)" : "var(--c-cap)", ["--i" as string]: 1 }}><span>CAP ROOM <Tip text="How much more you can spend on new car parts this season under the cost cap. Each project uses some when you start it. It resets at the new financial year." /></span><b><Num v={capRoom(me)}>{fmtMoney(capRoom(me))}</Num></b><u><DeptIcon kind="cap" size={22} /></u></div>
          <div className="stat-tile" style={{ ["--tile" as string]: "var(--c-time)", ["--i" as string]: 2 }}><span>TUNNEL <Tip text={`Wind tunnel hours left. Projects that need the tunnel use some every day. The allowance refills on ${fmtDay(nextAllowanceReset(s))}.`} /></span><b><Num v={Math.round(me.tunnelLeft)}>{Math.round(me.tunnelLeft)}h</Num></b><u><DeptIcon kind="tunnel" size={22} /></u></div>
          <div className="stat-tile" style={{ ["--tile" as string]: s.brand.fans < 25 ? "var(--c-bad)" : "var(--c-tech)", ["--i" as string]: 4 }}><span>FANS <Tip text={`How much supporters love the team, 0 to 100. Results move it slowly. Changing the livery or name for a sponsor hurts it, most for historic teams. Fans pay through merchandise and make sponsors offer more. Below about 22 the board worries.`} /></span><b><Num v={Math.round(s.brand.fans)}>{Math.round(s.brand.fans)}</Num></b><Bar v={s.brand.fans} max={100} color="var(--c-tech)" /><u><DeptIcon kind="fans" size={22} /></u></div>
        </div>}
      </section>

      {!inWeekend && !closedYearNow(s) && <FocusRow s={s} d={d} />}

      <FactoryBox s={s} go={go} />
      <DayStrip s={s} />
      <Chapter s={s} go={go} />

      <div className="c-cols">
        <section className="panel">
          <h3>DECISIONS ({decisions.length})</h3>
          {decisions.length === 0 && <p className="dim">Nothing needs you. The factory is working.</p>}
          {decisions.map((c) => <CardView key={c.id} c={c} d={d} />)}
          {s.recap.length > 0 && (
            <div className="c-recap">
              <h4>SINCE LAST TIME</h4>
              <div className="c-chips c-fade">{s.recap.map((r, i) => <span key={i} style={{ opacity: Math.max(0.45, 1 - (s.recap.length - 1 - i) * 0.12) }}>{r}</span>)}</div>
            </div>
          )}
          {msg && <p className="c-msg">{msg}</p>}
          {urgent && !inWeekend && <p className="dim small">Urgent decisions stop the clock until you answer.</p>}
        </section>

        <aside>
          <section className="panel">
            <h3>NOTICES {notices.length > 0 && <button className="tiny" onClick={() => notices.forEach((n) => d({ type: "dismiss", id: n.id }))}>CLEAR ALL</button>}</h3>
            {notices.length === 0 && <p className="dim small">Nothing to read.</p>}
            {notices.slice(0, 6).map((c) => <CardView key={c.id} c={c} d={d} compact />)}
          </section>
          <section className="panel">
            <h3>PADDOCK NEWS</h3>
            <ul className="c-ticker">
              {s.ticker.slice(0, 4).map((t, i) => (
                <li key={i} className={`i${t.importance} headline`}><b>{t.text}</b><span className="dim">{fmtDay(t.day)}</span></li>
              ))}
            </ul>
          </section>
          <section className="panel">
            <h3>CONSTRUCTORS</h3>
            <ol className="c-table">
              {shownTeams.map(([id, p]) => (
                <li key={id} className={id === s.teamId ? "mine" : ""} style={{ ["--team" as string]: hex(teamColour(s, id)) }}>
                  <i className="chip" /> <PLink kind="team" id={id}>{teamLabel(s, id)}</PLink> <b>{p}</b>
                </li>
              ))}
            </ol>
            <button className="tiny wide" onClick={() => setFullTable((f) => !f)}>{fullTable ? "SHOW LESS" : "FULL TABLE"}</button>
            <h3>DRIVERS</h3>
            <ol className="c-table">
              {topDrivers.map(([id, p]) => (
                <li key={id} className={s.drivers[id]?.teamId === s.teamId ? "mine" : ""}>
                  <PLink kind="driver" id={id}>{driverName(s, id)}</PLink> <b>{p}</b>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>

      <div className="c-dock">
        {dock ? dock : clock.running ? (
          <>
            <div className="c-run"><i /><b>{fmtDay(s.day, true)}</b><span className="dim">days are passing, the clock stops when something needs you</span></div>
            <div className="seg">{([1, 2, 4] as const).map((v) => <button key={v} className={clock.speed === v ? "on" : ""} onClick={() => setSpeed(v)}>{v}x</button>)}</div>
            <button className="btn primary big" onClick={pause}>PAUSE</button>
          </>
        ) : inWeekend ? (
          <>
            <span className="dim">{weekendNote(s)}</span>
            <button className="btn primary big pulse" onClick={() => { d({ type: "enterWeekend" }); onWeekend(); }}>{weekendButton(s)}</button>
          </>
        ) : (
          <>
            {clock.stopped && <span className="dim c-stopped">Stopped: {clock.stopped}</span>}
            <button className="btn" onClick={() => d({ type: "day" })}>ONE DAY</button>
            {!!next && toNext !== null && toNext > 3 && <button className="btn" title="Runs at top speed and stops for anything that needs you" onClick={() => { setSpeed(4); play(); }}>SKIP TO RACE WEEK</button>}
            <button className={`btn primary big ${s.cards.some((c) => !c.notice && !c.mail) ? "" : "pulse"}`} onClick={play}>CONTINUE (SPACE)</button>
          </>
        )}
      </div>
    </div>
  );
}
