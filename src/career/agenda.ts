import { seasonTestDays } from "./dev";
import { launchDay, summerEnd, summerStart, testDay, winterEnd, winterStart } from "./calendar";
import { eraDates } from "./eras";
import { driversOf } from "./finance";
import { nextAllowanceReset } from "./rnd";
import { epochDay } from "./util";
import { loadCircuit } from "../game/circuits";
import type { CareerState } from "./types";
import { factorsOf } from "./factors";

export type AgendaKind = "race" | "sprint" | "test" | "launch" | "shutdown" | "deadline" | "contract" | "sponsor" | "era" | "reset" | "project" | "facility" | "promise" | "academy" | "season" | "today" | "reply" | "weekend";

export interface AgendaItem {
  day: number;
  until?: number;
  kind: AgendaKind;
  label: string;
  sub?: string;
  /** Needs the player to act before this date. */
  action?: boolean;
}

/** Everything dated that the player may care about, for the calendar screen. */
export function agenda(s: CareerState): AgendaItem[] {
  const out: AgendaItem[] = [];
  const me = s.teams[s.teamId];
  for (const r of s.calendar) {
    let gp = r.circuitId;
    try {
      gp = loadCircuit(r.circuitId).meta.gp;
    } catch {
      /* keep id */
    }
    out.push({ day: r.day, kind: r.sprint ? "sprint" : "race", label: gp, sub: r.sprint ? `Round ${r.round}, sprint weekend` : `Round ${r.round}` });
    // the whole weekend is in the diary, not just Sunday
    out.push({ day: r.day - 2, kind: "weekend", label: r.sprint ? "Practice + sprint quali" : "Practice", sub: `${gp}. The weekend starts here and the clock stops.` });
    out.push({ day: r.day - 1, kind: "weekend", label: r.sprint ? "Sprint + qualifying" : "Qualifying", sub: `${gp}. Setup is locked after this.` });
  }
  for (const day of seasonTestDays(s)) out.push({ day, kind: "test", label: "In-season test day", sub: "One day on a closed track. Choose what it is for." });
  for (const y of [s.year, s.year + 1]) {
    out.push({ day: launchDay(y), kind: "launch", label: `${y} car launch` });
    out.push({ day: testDay(y), kind: "test", label: `${y} pre-season test` });
    out.push({ day: summerStart(y), until: summerEnd(y), kind: "shutdown", label: "Summer shutdown", sub: "Factory closed, driver talks open" });
    out.push({ day: epochDay(y, 11, 15), kind: "sponsor", label: "Sponsor reviews", sub: "Contracts ending this year" });
  }
  for (const y of [s.year - 1, s.year, s.year + 1]) out.push({ day: winterStart(y), until: winterEnd(y), kind: "shutdown", label: "Winter shutdown", sub: "Factory closed" });
  out.push({ day: nextAllowanceReset(s), kind: "reset", label: "Wind tunnel allowance resets" });
  for (const c of s.cards) {
    if (c.deadline !== undefined && !c.notice && c.options.length > 1) out.push({ day: c.deadline, kind: "deadline", label: c.title, sub: `Decide by this day or the default is taken: ${c.options.find((o) => o.id === c.defaultOption)?.label ?? ""}`, action: true });
  }
  for (const d of driversOf(s, s.teamId)) out.push({ day: epochDay(d.endYear, 12, 31), kind: "contract", label: `${d.spec.name}: contract ends`, sub: `${d.endYear}` });
  for (const st of Object.values(s.staff)) if (st.teamId === s.teamId) out.push({ day: epochDay(st.endYear, 12, 31), kind: "contract", label: `${st.name}: contract ends`, sub: st.role });
  for (const sp of me.sponsors) out.push({ day: epochDay(sp.endYear, 11, 15), kind: "sponsor", label: `${sp.name}: review`, sub: "Renew or let go" });
  for (const e of eraDates(s)) out.push({ day: e.day, kind: "era", label: e.label });
  const fxa = factorsOf(s, s.teamId);
  const speed = (1 + 0.06 * (me.facilities.factory - 3)) * fxa.tools.value * fxa.talent.value * fxa.cohesion.value;
  for (const p of me.projects) if (p.status === "building") out.push({ day: s.day + Math.max(1, Math.ceil((p.days - p.progress) / speed)), kind: "project", label: `${p.name}: ready (estimate)`, sub: "Stalls if the tunnel allowance runs out" });
  if (me.facilities.building) out.push({ day: me.facilities.building.done, kind: "facility", label: `${me.facilities.building.which} upgrade complete` });
  for (const p of s.promises) if (p.kept === undefined) out.push({ day: p.due, kind: "promise", label: `Promise to ${s.drivers[p.driverId]?.spec.name ?? "a driver"} due`, sub: p.text, action: true });
  // conversations that are waiting on someone, and letters that will lapse
  for (const tk of s.talks) {
    const n = s.drivers[tk.targetId]?.spec.name ?? s.academy.prospects[tk.targetId]?.name ?? "Someone";
    if (tk.status === "waiting" && tk.replyOn !== undefined) out.push({ day: tk.replyOn, kind: "reply", label: `Reply expected: ${n}`, sub: tk.kind === "junior" ? "Academy talks" : "Contract talks" });
    if (tk.status === "agreed" && tk.agreedUntil !== undefined) out.push({ day: tk.agreedUntil, kind: "deadline", label: `${n}: sign or the offer lapses`, sub: "Terms are agreed", action: true });
  }
  for (const c of s.cards) if (c.kind === "mail" && c.deadline !== undefined) out.push({ day: c.deadline, kind: "reply", label: `Lapses: ${c.title}`, sub: `From ${c.mail?.from ?? "the inbox"}` });
  const last = s.calendar[s.calendar.length - 1];
  if (last) out.push({ day: last.day + 2, kind: "season", label: `${s.year} season review` });
  return out.filter((x) => x.day >= s.day - 120).sort((a, b) => a.day - b.day);
}
