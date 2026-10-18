import { AREA_TRAITS, TRAIT_GAIN_K, addArea, addTrait } from "./traits";
import { news } from "./cards";
import { staffOf } from "./car";
import { pushCard } from "./cards";
import { logSpend } from "./log";
import { clamp, rngFor, round2 } from "./util";
import { AREAS, type CareerState, type NextCarPlan } from "./types";
import { factorsOf } from "./factors";
import { applyDesign } from "./lab";
import { TRAITS } from "./types";

/**
 * Next year's car. From the summer on the design office can put part of its time into the car for January.
 * The choice of philosophy and how much of the office it takes decide what the new car is like. Nothing here is random
 * luck alone: neglect leaves the team behind, a revolution with weak designers is a disaster, and the result is hidden until the test.
 */

export const APPROACH_LABEL: Record<NextCarPlan["approach"], string> = { evolve: "EVOLUTION", revolve: "REVOLUTION", copy: "FOLLOW THE LEADERS" };
export const APPROACH_TEXT: Record<NextCarPlan["approach"], string> = {
  evolve: "Refine what you have. Steady gains, little risk, a ceiling on how good it can get.",
  revolve: "Throw the concept away and start again. Brilliant with a strong technical director and designer, a disaster with weak ones.",
  copy: "Study the fastest cars and borrow what works. Closes part of the gap to the front, never leads the field.",
};

export const nextCarOf = (s: CareerState): NextCarPlan => {
  if (!s.nextCar || s.nextCar.year !== workYear(s)) s.nextCar = { approach: "evolve", share: 0.2, points: 0, year: workYear(s), decided: false };
  return s.nextCar;
};

/** The work from now until January counts toward the car for the coming year. */
const workYear = (s: CareerState) => s.year;

export function designQuality(s: CareerState, teamId = s.teamId): number {
  const td = staffOf(s, teamId, "td")?.skill ?? 55;
  const de = staffOf(s, teamId, "designer")?.skill ?? 55;
  const t = s.teams[teamId];
  const fx = factorsOf(s, teamId);
  return clamp(((td + de) / 200) * (1 + 0.04 * (t.facilities.factory - 3)) * fx.talent.value * fx.tools.value * fx.knowledge.value * fx.cohesion.value, 0.25, 1.1);
}

export const effortOf = (p: NextCarPlan) => clamp(p.points / 30, 0, 1.3);

export function setNextCar(s: CareerState, approach: NextCarPlan["approach"], share: number): string {
  const p = nextCarOf(s);
  share = clamp(Math.round(share * 20) / 20, 0, 1);
  let note = "";
  if (p.decided && approach !== p.approach && p.points > 0) {
    p.points = round2(p.points * 0.6);
    note = " Changing course cost 40 percent of the work already done.";
  }
  p.approach = approach;
  p.share = share;
  p.decided = true;
  return `Next year's car: ${APPROACH_LABEL[approach].toLowerCase()}, ${Math.round(share * 100)} percent of the design office.${note}`;
}

/** Called once a week for the player. */
export function nextCarWeekly(s: CareerState) {
  const p = nextCarOf(s);
  p.points = round2(p.points + p.share * (0.55 + 0.9 * designQuality(s)));
  // a nudge to decide, once the season is well under way
  if (!p.decided && s.calendar.length && s.round >= Math.floor(s.calendar.length * 0.4) && s.day - (s.story.last.nextCarCard ?? -999) >= 60 && !s.cards.some((c) => c.kind === "nextCar")) {
    s.story.last.nextCarCard = s.day;
    const q = designQuality(s);
    const word = q > 0.8 ? "a strong design team" : q > 0.6 ? "a decent design team" : "a thin design team";
    pushCard(
      s,
      "nextCar",
      "Next year's car: choose a direction",
      `The design office can start on next year's car now, but every hour spent on it is an hour not spent on this one. You have ${word}. Whatever you pick shows up on the car in January, and nobody will tell you how good it is until the test. If you do nothing the office keeps a small evolution going.`,
      [
        { id: "evolve:0.25", label: "Evolution, a quarter of the office", detail: "Safe, small gain next year, light cost this year", lines: ["The sensible default."] },
        { id: "evolve:0.5", label: "Evolution, half the office", detail: "A solid step next year, this year's upgrades slow down", lines: ["Gives up part of this season."] },
        { id: "revolve:0.6", label: "Revolution, most of the office", detail: "A new concept. Big swing either way", lines: [q > 0.7 ? "Your designers can pull it off." : "Your designers are not the people to bet on.", "This year's upgrades nearly stop."], warn: q < 0.6 ? "Weak staff: this is how teams end up at the back." : undefined },
        { id: "copy:0.35", label: "Follow the leaders", detail: "Close part of the gap to the front", lines: ["No chance to lead."] },
        { id: "evolve:0.05", label: "Ignore next year", detail: "All effort on this season", lines: ["The car will be older than the rivals' in January."], warn: "Neglect shows in January." },
      ],
      { urgency: 2, deadline: s.day + 21, defaultOption: "evolve:0.25" },
    );
  }
}

export function resolveNextCar(s: CareerState, option: string) {
  const [a, v] = option.split(":");
  setNextCar(s, a as NextCarPlan["approach"], Number(v));
}

/** Idea flow this season falls with the share the office gives to next year's car. */
export const ideaDrag = (s: CareerState, teamId: string): number => (teamId === s.teamId ? 1 - (nextCarOf(s).share * 0.5) : 1);

/** In January: the plan decides how the player's car moves. Runs after the field's own swing and compression. */
export function applyNextCar(s: CareerState) {
  const p = s.nextCar && s.nextCar.year === s.year - 1 ? s.nextCar : null;
  const me = s.teams[s.teamId];
  const plan: NextCarPlan = p ?? { approach: "evolve", share: 0, points: 0, year: s.year - 1, decided: false };
  const e = effortOf(plan);
  const q = designQuality(s);
  const rng = rngFor(s, "nextcar");
  const others = Object.values(s.teams).filter((t) => t.id !== s.teamId);
  const shifts: number[] = [];
  for (const a of AREAS) {
    let shift = 0;
    if (plan.approach === "evolve") shift = 0.11 * e + rng.gauss() * 0.04;
    else if (plan.approach === "revolve") shift = (q - 0.62) * 0.85 * e + 0.02 + rng.gauss() * 0.15 * (0.5 + e);
    else {
      const top = [...others].sort((x, y) => y.car[a] - x.car[a]).slice(0, 3);
      const mean = top.reduce((v, t) => v + t.car[a], 0) / top.length;
      shift = Math.max(-0.02, (mean - me.car[a]) * 0.4 * Math.min(e, 1)) + rng.gauss() * 0.03;
    }
    if (e < 0.3) shift -= (0.3 - e) * 0.45;
    addArea(me, a, round2(shift));
    shifts.push(shift);
  }
  // the shape chosen in the lab becomes the car, scaled by how well the office could build it
  const built = applyDesign(s, s.teamId, e, q);
  if (built) {
    const dm = TRAITS.reduce((x, tr) => x + built.delta[tr], 0) / TRAITS.length;
    for (const a of AREAS) addArea(me, a, round2(dm * 0.8));
    shifts.push(dm);
    s.story.last.designNote = s.day;
  }
  // research banked all year for the new car goes on it now; anything still being built becomes an ordinary project
  let banked = 0;
  for (const p of me.projects) {
    if (!p.forNext) continue;
    if (p.status === "ready") {
      addTrait(me, p.trait ?? AREA_TRAITS[p.area][0], round2(p.trueGain * TRAIT_GAIN_K));
      p.status = "fitted";
      p.fittedYear = s.year;
      p.delivered = p.trueGain;
      p.hold = false;
      banked += p.trueGain;
    } else p.forNext = false;
  }
  if (banked > 0) {
    shifts.push(banked);
    news(s, `The research banked last year went onto the new car: about ${banked.toFixed(2)} s a lap.`, { importance: 2, tag: "people" });
  }
  const avg = shifts.reduce((x, y) => x + y, 0) / shifts.length;
  const note =
    avg > 0.12 ? "The new car is a clear step forward." : avg > 0.04 ? "The new car is a modest step." : avg > -0.04 ? "The new car is about where last year's was." : avg > -0.12 ? "The new car is a step back." : "The new car is a disaster.";
  s.nextCarLast = { approach: plan.approach, share: plan.share, effort: round2(e), note };
  logSpend(s, `New car programme: ${APPROACH_LABEL[plan.approach].toLowerCase()}`, {});
  s.nextCar = { approach: plan.approach, share: Math.min(plan.share, 0.2), points: 0, year: s.year, decided: false };
}

/** The line for the pre-season test report. */
export function nextCarReport(s: CareerState): string {
  const l = s.nextCarLast;
  if (!l) return "";
  const how = `Last year you chose ${APPROACH_LABEL[l.approach].toLowerCase()} with ${Math.round(l.share * 100)} percent of the design office; the work reached ${Math.round(l.effort * 100)} percent of what a full programme gives. `;
  return how + l.note;
}
