import { KIND_LABEL, KIND_TEXT } from "./rndplan";
import { nextAllowanceReset, capRoom, maxConcurrent } from "./rnd";
import { fmtDay, fmtMoney, fmtRange } from "./util";
import { TRAIT_NAME } from "./traits";
import { fitFor } from "./capability";
import { believedAreaGain, picks, wantsHints } from "./guide";
import { AREA_LABEL, type Area, type CardOption, type CareerState, type Idea } from "./types";

export const AREA_DOES: Record<Area, string> = {
  aero: "Aero shapes the air. It gives grip in corners and trims drag on the straights.",
  chassis: "Chassis is the structure and suspension geometry. It helps over kerbs, in slow corners and with balance.",
  power: "Power unit is the engine and hybrid system. It gives acceleration and top speed.",
  cooling: "Cooling and packaging lets the bodywork wrap tighter, and helps the car finish races.",
  tyres: "Tyre and suspension work is kinder to the tyres and helps in the long runs.",
};

/** Tunnel hours the running projects still have to draw, so the player can see whether a new one will stall. */
export function committedTunnel(s: CareerState, teamId: string): number {
  const t = s.teams[teamId];
  let n = 0;
  for (const p of t.projects) if (p.status === "building" && p.tunnelHours > 0) n += (p.tunnelHours / p.days) * Math.max(0, p.days - p.progress);
  return Math.round(n);
}

export function ideaFacts(s: CareerState, i: Idea): { lines: string[]; warn?: string } {
  const t = s.teams[s.teamId];
  const room = capRoom(t);
  const lines: string[] = [];
  lines.push(`Lap time about ${fmtRange(i.predLo, i.predHi)}, minus means faster (the staff's guess, not a promise)`);
  if (i.trait) {
    const lead = i.lead ? s.staff[i.lead] : undefined;
    const f = fitFor(s, lead, t.concept, i.trait);
    lines.push(`Works on ${TRAIT_NAME[i.trait].toLowerCase()}${lead ? `, led by ${lead.name} (specialty ${Math.round(f.specialty * 100)}%, instincts match ${Math.round(f.philosophy * 100)}%)` : ", with nobody to lead it"}`);
    if (wantsHints(s)) lines.push(`On your own numbers it would move the ${AREA_LABEL[i.area].toLowerCase()} by about ${believedAreaGain(s, s.teamId, i.trait, (i.predLo + i.predHi) / 2).toFixed(2)} s`);
    const pk = picks(s).find((x) => x.id === i.id);
    if (pk) lines.push(`Advice: worth a look. ${pk.why}`);
  }
  lines.push(`Costs ${fmtMoney(i.cost)} of cap room. You have ${fmtMoney(room)}, so ${fmtMoney(room - i.cost)} would be left`);
  lines.push(`Takes ${i.days} days to build`);
  let warn: string | undefined;
  if (i.tunnelHours > 0) {
    const free = t.tunnelLeft - committedTunnel(s, s.teamId);
    lines.push(`Uses ${i.tunnelHours} wind tunnel hours. ${Math.round(t.tunnelLeft)} left of ${t.tunnelTotal}, and ${committedTunnel(s, s.teamId)} are already promised to running projects`);
    if (free < i.tunnelHours) warn = `Short of tunnel time by about ${Math.round(i.tunnelHours - free)} hours: it will stall until the allowance resets on ${fmtDay(nextAllowanceReset(s))}.`;
  } else lines.push("Does not use the wind tunnel");
  if (room < i.cost) warn = `You cannot afford this inside the cost cap: ${fmtMoney(i.cost - room)} over.`;
  else if (s.budgets.rnd - t.ledger.rnd < i.cost) warn = warn ?? `This goes over your R&D budget of ${fmtMoney(s.budgets.rnd, 0)}. You can raise it in the Money screen.`;
  return { lines, warn };
}

export function ideaOptions(s: CareerState, ideas: Idea[]): CardOption[] {
  return ideas.map((i) => {
    const f = ideaFacts(s, i);
    return { id: `idea:${i.id}`, label: `${i.kind ? KIND_LABEL[i.kind] + ": " : ""}${i.name} (${AREA_LABEL[i.area]})`, detail: `${fmtRange(i.predLo, i.predHi)} a lap, ${fmtMoney(i.cost)}, ${i.days} days`, lines: [...(i.kind ? [KIND_TEXT[i.kind]] : []), AREA_DOES[i.area], ...f.lines], warn: f.warn };
  });
}

export function ideaBody(s: CareerState, shown = 0, total = 0): string {
  const t = s.teams[s.teamId];
  const running = t.projects.filter((p) => p.status === "building").length;
  return `A month of design work has produced these. They are the same ideas as on the Car screen${shown && total > shown ? `, the best ${shown} of ${total}` : ""}. They are different kinds of bet, so this is about risk, not just the biggest number. Cap room left ${fmtMoney(capRoom(t))}. Wind tunnel ${Math.round(t.tunnelLeft)} of ${t.tunnelTotal} hours left until ${fmtDay(nextAllowanceReset(s))}. Projects running: ${running} of ${maxConcurrent(t)}.\nThe lap time shown is how much each part changes a lap: a minus number is faster. It is only the staff's guess until the part runs at a track.`;
}
