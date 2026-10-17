import { Sub } from "../skin/Sub";
import { useState } from "react";
import { PALETTE, baseColour, liveryPreview, teamColour, teamLabel } from "../../career/brand";
import { allocated, budgetMax, budgetMin, budgetPool, budgetScale, CASH_LINES, driversOf, forecast, facilityUpkeep } from "../../career/finance";
import { capRoom } from "../../career/rnd";
import { CFG } from "../../career/config";
import { teamStaff } from "../../career/car";
import { BUDGET_LABEL, type Budgets } from "../../career/types";
import { fmtMoney } from "../../career/util";
import { Bar, Tip, type Props } from "./common";
import { SpendLog } from "./Car";
import { boardParts } from "../../career/board";
import { fmtDay } from "../../career/util";

const HELP: Record<keyof Budgets, string> = {
  drivers: "Both drivers' salaries for the year. Signing a driver whose pay would pass this is refused until you raise it. You cannot set it below what is already contracted.",
  staff: "Everyone except drivers on the payroll: engineers, designers and the like. Hiring above it is refused until you raise it.",
  rnd: "Cap room you allow yourself to commit to new parts this year. It is not cash: it is limited by the cost cap, not the owner's pool. Starting a part that would pass it is refused until you raise it.",
  facilities: "Running costs of the tunnel, simulator, factory and academy buildings, plus upgrade projects. A new upgrade that would pass it is refused until you raise it.",
  academy: "Scouting, scouts and coaches, trial days, retainers and training for young drivers. Signing or promoting past it is refused until you raise it.",
};

export function Money({ s, d }: Props) {
  const me = s.teams[s.teamId];
  const f = forecast(s, s.teamId);
  const L = me.ledger;
  const spent = CFG.capBaseProgramme + me.capSpent;
  const scale = budgetScale(s);
  const committed: Record<keyof Budgets, number> = {
    drivers: driversOf(s, s.teamId).reduce((a, x) => a + x.salary, 0),
    staff: teamStaff(s, s.teamId).reduce((a, x) => a + x.salary, 0),
    rnd: L.rnd,
    facilities: L.facilities + 0,
    academy: L.academy,
  };
  const yearSoFar: Record<keyof Budgets, number> = { drivers: L.drivers, staff: L.staffPay, rnd: L.rnd, facilities: L.facilities, academy: L.academy };
  const pool = budgetPool(s);
  const given = allocated(s);
  const free = pool.pool - given;
  return (
    <Sub id="money" tabs={[
      { k: "now", label: "CASH AND BOARD" },
      { k: "budget", label: "BUDGETS" },
      { k: "cap", label: "COST CAP" },
      { k: "brand", label: "SPONSORS AND LIVERY" },
    ]}>
      {(tab) => (
        <>
          {tab === "now" && (
            <div className="c-cols">
              <div>
                <section className="panel">
          <h3>CASH</h3>
          <p className="c-big">{fmtMoney(me.cash)}</p>
          <p className="dim small">Forecast at year end: <b>{fmtMoney(f.endCash)}</b>. The last 20 percent of the prize money arrives after the season.</p>
          <div className="c-row"><span>Income this year</span><b>{fmtMoney(L.income)}</b></div>
          <div className="c-row"><span>&nbsp;&nbsp;Prize money</span><b>{fmtMoney(L.prize)}</b></div>
          <div className="c-row"><span>&nbsp;&nbsp;Sponsors</span><b>{fmtMoney(L.sponsors)}</b></div>
          <div className="c-row"><span>Costs this year</span><b>{fmtMoney(L.costs)}</b></div>
          <div className="c-row"><span>&nbsp;&nbsp;Drivers</span><b>{fmtMoney(L.drivers)}</b></div>
          <div className="c-row"><span>&nbsp;&nbsp;Staff</span><b>{fmtMoney(L.staffPay)}</b></div>
          <div className="c-row"><span>&nbsp;&nbsp;Travel</span><b>{fmtMoney(L.travel)}</b></div>
          <div className="c-row"><span>&nbsp;&nbsp;Facilities</span><b>{fmtMoney(L.facilities)}</b></div>
          <div className="c-row"><span>&nbsp;&nbsp;Academy and scouting</span><b>{fmtMoney(L.academy)}</b></div>
          <div className="c-row"><span>&nbsp;&nbsp;Running costs</span><b>{fmtMoney(L.other)}</b></div>
        </section>
              </div>
              <div>
                <BoardPanel s={s} d={d} />
              </div>
            </div>
          )}
          {tab === "budget" && (
            <div className="c-cols">
              <div>
                <section className="panel">
          <h3>THE OWNER'S POOL <Tip text="The owner funds one pool of money for the year. You split it between drivers, staff, facilities and the academy. Every slice you raise comes out of another, because the pool is fixed." /></h3>
          <div className="c-row"><span>Expected income (sponsors and prize money)</span><b>{fmtMoney(pool.income, 0)}</b></div>
          <div className="c-row"><span>Running costs and travel you cannot choose</span><b>-{fmtMoney(pool.fixed, 0)}</b></div>
          <div className="c-row"><span>Cash reserve you may burn</span><b>+{fmtMoney(pool.draw, 0)}</b></div>
          <div className="c-row"><span>Pool to share out</span><b>{fmtMoney(pool.pool, 0)}</b></div>
          <Bar v={Math.min(given, pool.pool)} max={Math.max(pool.pool, 1)} color={free < 0 ? "var(--red)" : "var(--hot)"} />
          <p className={free < 0 ? "warn small" : "dim small"}>{free < 0 ? `You have given out ${fmtMoney(given, 0)}, ${fmtMoney(-free, 0)} more than the pool. New spending in these areas is refused until you lower a line.` : `${fmtMoney(given, 0)} given out, ${fmtMoney(free, 0)} still free. Finishing higher and winning sponsors makes the pool bigger next year.`}</p>
        </section>
              </div>
              <div>
                <section className="panel">
          <h3>BUDGETS <Tip text="Ceilings you set for each area. Anything that would take an area past its ceiling is refused until you raise it. A low board can squeeze them." /></h3>
          <p className="dim small">Four of these are slices of the pool above. R&D is cap room, so it has its own limit.</p>
          {scale < 1 && <p className="warn small">The board has squeezed your ceilings to {Math.round(scale * 100)} percent because trust is low.</p>}
          {(Object.keys(BUDGET_LABEL) as (keyof Budgets)[]).map((k) => {
            const cap = Math.round(s.budgets[k] * scale);
            const over = (k === "drivers" || k === "staff" ? committed[k] : yearSoFar[k]) > cap;
            const lo = budgetMin(s, k);
            const hi = Math.max(budgetMax(s, k), s.budgets[k]);
            return (
              <div className="c-bud" key={k}>
                <div className="c-row">
                  <span>{BUDGET_LABEL[k]} <Tip text={HELP[k]} /></span>
                  <b className={over ? "bad" : ""}>{fmtMoney(k === "drivers" || k === "staff" ? committed[k] : yearSoFar[k])} of {fmtMoney(cap, 0)}</b>
                </div>
                <Bar v={k === "drivers" || k === "staff" ? committed[k] : yearSoFar[k]} max={Math.max(cap, 1)} color={over ? "var(--red)" : "var(--hot)"} />
                <input type="range" min={lo} max={Math.max(hi, lo + 1)} step={1} value={Math.min(Math.max(s.budgets[k], lo), Math.max(hi, lo + 1))} onChange={(e) => d({ type: "setBudget", key: k, value: Number(e.target.value) })} aria-label={`${BUDGET_LABEL[k]} ceiling`} />
                <p className="dim small">
                  Ceiling {fmtMoney(s.budgets[k], 0)}. Range now {fmtMoney(lo, 0)} to {fmtMoney(hi, 0)}{(CASH_LINES as readonly string[]).includes(k) ? " (the top is what the pool still allows)" : " (the top is what the cost cap allows)"}. {k === "drivers" || k === "staff" ? `Full-year pay at current contracts shown. So far this year: ${fmtMoney(yearSoFar[k])}.` : `Spent so far this year.`} {k === "facilities" ? `Running costs of the buildings add ${fmtMoney(facilityUpkeep(me))} a year.` : ""}
                </p>
              </div>
            );
          })}
        </section>
              </div>
            </div>
          )}
          {tab === "cap" && (
            <div className="c-cols">
              <div>
                <section className="panel">
          <h3>COST CAP</h3>
          <div className="c-row"><span>Limit</span><b>{fmtMoney(me.capLimit)}</b></div>
          <div className="c-row"><span>Base programme (fixed)</span><b>{fmtMoney(CFG.capBaseProgramme)}</b></div>
          <div className="c-row"><span>New parts so far</span><b>{fmtMoney(me.capSpent)}</b></div>
          <div className="c-row"><span>Room left</span><b className={capRoom(me) < 0 ? "bad" : ""}>{fmtMoney(capRoom(me))}</b></div>
          <Bar v={spent} max={me.capLimit} color={capRoom(me) < 0 ? "var(--red)" : "var(--hot)"} />
          <p className="dim small">Cap room only goes down when you start a project, borrow tunnel time or pay for overtime, and only goes up when a scrapped project returns part of its cost or a new financial year starts. Going over brings a fine, a smaller cap next year and a hit with the board. Projected at year end: {fmtMoney(f.capAtEnd)} of room.</p>
        </section>
              </div>
              <div>
                <SpendLog s={s} />
              </div>
            </div>
          )}
          {tab === "brand" && (
            <div className="c-cols">
              <div>
                <section className="panel">
          <h3>SPONSORS</h3>
          {me.sponsors.map((sp) => (
            <div className="c-item" key={sp.id}>
              <b>{sp.name}</b> <span className="dim">until {sp.endYear}</span>
              <p className="small">Pays {fmtMoney(sp.retainer)} a year, and {fmtMoney(sp.bonusPerRace)} for each race where: {sp.objective.toLowerCase()}. Mood {Math.round(sp.mood * 100)}%.</p>
              {sp.demand > 0 && <p className="dim small">Their events cost practice runs and driver time.</p>}
              {sp.terms && <p className="small warn">{sp.terms.kind === "rename" ? `Title deal: the team runs as "${sp.terms.prefix} ${s.teams[s.teamId] ? teamLabel(s).replace(`${sp.terms.prefix} `, "") : ""}".` : "Livery deal: the car wears their colour."}</p>}
              <button className="tiny" onClick={() => { if (window.confirm(`End the ${sp.name} deal now? Break fee ${fmtMoney(sp.breakFee ?? sp.retainer * 0.3)}.`)) d({ type: "endSponsor", id: sp.id }); }}>END DEAL ({fmtMoney(sp.breakFee ?? sp.retainer * 0.3)})</button>
            </div>
          ))}
          {me.sponsors.length === 0 && <p className="dim">No sponsors. Offers will arrive.</p>}
        </section>
              </div>
              <div>
                <LiverySection s={s} d={d} />
              </div>
            </div>
          )}
        </>
      )}
    </Sub>
  );
}

function LiverySection({ s, d }: Props) {
  const [pick, setPick] = useState<number | "home" | null>(null);
  const now = teamColour(s);
  const hex = (c: number) => "#" + c.toString(16).padStart(6, "0");
  const target = pick === null ? null : pick === "home" ? null : pick;
  const pv = pick === null ? null : liveryPreview(s, target);
  return (
    <section className="panel">
      <h3>LIVERY</h3>
      <p className="small">The car wears <i className="c-swatch" style={{ background: hex(now) }} /> {s.brand.color == null ? "the team's own colours" : "a changed colour"}. You can repaint it yourself, but fans, the board and sponsors will react. Once a year at most.</p>
      <div className="c-acts">
        <button className={`tiny ${pick === "home" ? "on" : ""}`} onClick={() => setPick("home")}><i className="c-swatch" style={{ background: hex(baseColour(s)) }} /> OUR COLOURS</button>
        {PALETTE.map((p) => <button key={p.color} className={`tiny ${pick === p.color ? "on" : ""}`} onClick={() => setPick(p.color)}><i className="c-swatch" style={{ background: hex(p.color) }} /> {p.name.toUpperCase()}</button>)}
      </div>
      {pv && (
        <div className="c-how">
          {pv.ok ? pv.lines.map((l, i) => <p key={i} className="small">{l}</p>) : <p className="small warn">{pv.why}</p>}
          {pv.ok && <button className="btn primary" onClick={() => { if (window.confirm("Repaint the cars?")) { d({ type: "livery", color: target }); setPick(null); } }}>REPAINT THE CARS ({fmtMoney(pv.cost)})</button>}
        </div>
      )}
    </section>
  );
}

const word = (v: number) => (v > 0.5 ? "strong" : v > 0.15 ? "good" : v > -0.15 ? "neutral" : v > -0.5 ? "poor" : "bad");

function BoardPanel({ s, d }: Props) {
  const me = s.teams[s.teamId];
  const p = boardParts(s);
  const debt = me.debt ?? 0;
  return (
    <section className="panel">
      <h3>THE BOARD <Tip text="The board's confidence is one number from 0 to 100. Below about 14 you can be sacked, in any seat. It is built from results against the owner's target, the state of the books and the owner's trust. The list shows what moved it." /></h3>
      <div className="c-row"><span>Confidence</span><b>{Math.round(me.board)} / 100</b><Bar v={me.board} max={100} color={me.board < 30 ? "var(--red)" : "var(--green)"} /></div>
      <div className="c-row"><span>Results against target</span><b>{word(p.results)}</b></div>
      <div className="c-row"><span>The books</span><b>{word(p.money)}</b></div>
      <div className="c-row"><span>The owner's trust</span><b>{word(p.trust)}</b></div>
      <h4>WHAT MOVED IT</h4>
      {(s.boardLog ?? []).length === 0 && <p className="dim small">Nothing yet.</p>}
      <ul className="c-notes small">
        {(s.boardLog ?? []).slice(0, 8).map((e, i) => <li key={i}><span className="dim">{fmtDay(e.day)}</span> {e.why} <b className={e.delta < 0 ? "bad" : "good"}>{e.delta > 0 ? "+" : ""}{e.delta}</b></li>)}
      </ul>
      <h4>BANK</h4>
      <p className="dim small">Debt is {fmtMoney(debt)} at {Math.round(CFG.debtRate * 100)} percent a year. Cash in hand is {fmtMoney(me.cash)}. Borrowing keeps you solvent and lets you build, but interest comes out of every month and a large debt wears the board down. Limit {fmtMoney(CFG.debtMax, 0)}.</p>
      <div className="seg">
        {[10, 25].map((a) => <button key={a} onClick={() => d({ type: "borrow", amount: a })}>BORROW {fmtMoney(a, 0)}</button>)}
        {debt > 0 && [10, 25, 80].map((a) => <button key={`r${a}`} onClick={() => d({ type: "repay", amount: a })}>REPAY {a === 80 ? "ALL" : fmtMoney(a, 0)}</button>)}
      </div>
    </section>
  );
}
