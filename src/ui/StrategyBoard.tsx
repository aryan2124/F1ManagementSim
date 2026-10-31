import type { Compound } from "../sim/types";
import { DELEGATED, NO_ORDERS, type StandingOrders } from "../sim/standing";
import { CompoundBadge } from "./Briefing";

/**
 * The strategy board: the plan, set before the race and changeable during it. The pit wall carries it out on its own,
 * so you are only asked about what the plan did not cover.
 */
export function StrategyBoard({ orders, onChange, laps, compact, copyFrom }: { orders: StandingOrders; onChange: (o: StandingOrders) => void; laps: number; compact?: boolean; copyFrom?: { label: string; orders: StandingOrders } }) {
  const set = (p: Partial<StandingOrders>) => onChange({ ...orders, ...p, delegated: false });
  const step = (cur: number | null, d: number, lo: number, hi: number, start: number) => Math.min(hi, Math.max(lo, (cur ?? start) + d));
  return (
    <div className={`sboard ${compact ? "compact" : ""}`}>
      <div className="sb-head">
        <h4>THE PLAN</h4>
        <div className="seg">
          <button className={orders.delegated ? "on" : ""} onClick={() => onChange(orders.delegated ? NO_ORDERS : DELEGATED)} title="The strategist runs sensible standing orders for the whole race. You are only asked about the big calls.">
            LEAVE IT TO THE STRATEGIST
          </button>
          {copyFrom && <button onClick={() => onChange({ ...copyFrom.orders })} title="Use the same plan as the other car">SAME AS {copyFrom.label}</button>}
          <button onClick={() => onChange(NO_ORDERS)} title="Clear every order. The driver and engineer ask you about everything.">CLEAR</button>
        </div>
      </div>
      <div className="sb-row">
        <span>PLANNED STOP</span>
        <div className="seg">
          <button onClick={() => set({ stopLap: orders.stopLap === null ? null : step(orders.stopLap, -1, 2, laps - 2, Math.round(laps * 0.4)) })} disabled={orders.stopLap === null}>-</button>
          <button className={orders.stopLap !== null ? "on" : ""} onClick={() => set({ stopLap: orders.stopLap === null ? Math.round(laps * 0.4) : null })}>{orders.stopLap === null ? "OFF" : `LAP ${orders.stopLap}`}</button>
          <button onClick={() => set({ stopLap: step(orders.stopLap, 1, 2, laps - 2, Math.round(laps * 0.4)) })}>+</button>
        </div>
        {orders.stopLap !== null && (
          <div className="seg">
            <button className={orders.stopCompound === null ? "on" : ""} onClick={() => set({ stopCompound: null })}>AUTO</button>
            {(["S", "M", "H"] as Compound[]).map((c) => (
              <button key={c} className={orders.stopCompound === c ? "on" : ""} onClick={() => set({ stopCompound: c })}><CompoundBadge c={c} size={16} /></button>
            ))}
          </div>
        )}
      </div>
      <div className="sb-row">
        <span>BOX AT TYRE WEAR</span>
        <div className="seg">
          <button onClick={() => set({ tyreLimit: orders.tyreLimit === null ? null : step(orders.tyreLimit, -0.05, 0.3, 1.1, 0.8) })} disabled={orders.tyreLimit === null}>-</button>
          <button className={orders.tyreLimit !== null ? "on" : ""} onClick={() => set({ tyreLimit: orders.tyreLimit === null ? 0.8 : null })}>{orders.tyreLimit === null ? "OFF" : `${Math.round(orders.tyreLimit * 100)}%`}</button>
          <button onClick={() => set({ tyreLimit: step(orders.tyreLimit, 0.05, 0.3, 1.1, 0.8) })}>+</button>
        </div>
      </div>
      <div className="sb-row">
        <span>SAFETY CAR</span>
        <div className="seg">
          <button className={orders.scBox ? "on" : ""} onClick={() => set({ scBox: !orders.scBox })}>{orders.scBox ? "BOX IF WORN" : "OFF"}</button>
          {orders.scBox && (
            <>
              <button onClick={() => set({ scWear: step(orders.scWear, -0.05, 0.1, 0.9, 0.3) })}>-</button>
              <button className="on">OVER {Math.round(orders.scWear * 100)}%</button>
              <button onClick={() => set({ scWear: step(orders.scWear, 0.05, 0.1, 0.9, 0.3) })}>+</button>
            </>
          )}
        </div>
      </div>
      <div className="sb-row">
        <span>RIVAL UNDERCUTS</span>
        <div className="seg">
          <button className={orders.cover ? "on" : ""} onClick={() => set({ cover: !orders.cover })}>{orders.cover ? "COVER IF REAL" : "ASK ME"}</button>
        </div>
      </div>
      {!compact && <p className="small dim">A cover only happens when the pit wall's numbers say the threat is real. Everything else still comes to you.</p>}
    </div>
  );
}
