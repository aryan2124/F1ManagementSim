import { resolveReach } from "./convo";
import { tempo } from "./storyteller";
import { boardMove } from "./board";
import { resolveStory } from "./stories";
import { resolveThread } from "./threads";
import type { Rng } from "../sim/rng";
import { baseTeam, staffOf, teamRanking, standingsRank } from "./car";
import { factoryClosed } from "./calendar";
import { news, pushCard, recap, ticker } from "./cards";
import { askingSalary } from "./contracts";
import { driversOf } from "./finance";
import { levelOf } from "./academy";
import { logSpend } from "./log";
import { addCause, resolveGrievance } from "./people";
import { capRoom, injectIdea } from "./rnd";
import { planOf, weakestArea } from "./rndplan";
import { CFG } from "./config";
import { clamp, fmtMoney, rngFor, round2 } from "./util";
import { AREA_LABEL, type Area, type CardOption, type CareerState, type Idea } from "./types";

/**
 * Story events. Each one is earned: it only becomes possible when the state of the team makes it likely, it has a cooldown,
 * its text uses the real names and numbers, and at most one big event happens in any week.
 */

interface Built {
  title: string;
  body: string;
  options: CardOption[];
  data?: Record<string, number | string | boolean>;
  deadline?: number;
  defaultOption?: string;
  urgency?: 1 | 2 | 3;
}
interface Ev {
  id: string;
  big: boolean;
  cooldown: number;
  weight: (s: CareerState) => number;
  build: (s: CareerState, rng: Rng) => Built | null;
  resolve: (s: CareerState, option: string, data: Record<string, number | string | boolean>) => void;
}

const me = (s: CareerState) => s.teams[s.teamId];
const staffName = (s: CareerState, id: string) => s.staff[id]?.name ?? "A staff member";

const realOfferFor = (s: CareerState) => {
  const r = s.rumours.find((x) => x.real && x.driverId && s.drivers[x.driverId]?.teamId === s.teamId && s.day - x.day < 120);
  if (r) return r;
  return undefined;
};

const weakestOf = (s: CareerState): Area => weakestArea(s, s.teamId);
const grid = (s: CareerState, a: Area) => Object.values(s.teams).reduce((x, q) => x + q.car[a], 0) / Object.keys(s.teams).length;

const RND_EVENTS: Ev[] = [
  {
    id: "driverFeedback",
    big: false,
    cooldown: 90,
    weight: (s) => (driversOf(s, s.teamId).length ? 1.6 : 0),
    build: (s) => {
      const dr = driversOf(s, s.teamId).sort((a, b) => b.spec.pace - a.spec.pace)[0];
      if (!dr) return null;
      const area = weakestOf(s);
      const word: Record<Area, string> = { aero: "the front end washes out in fast corners", chassis: "the car is nervous over the kerbs", power: "he is losing out on the straights", cooling: "the engine is running hot and he is lifting off", tyres: "the rears fall off a cliff in the long runs" };
      return {
        title: `${dr.spec.name}: "${word[area]}"`,
        body: `After the session ${dr.spec.name} came to the engineers with a clear complaint: ${word[area]}. The data backs him up. You can turn it into a project, or ask him to drive around it.`,
        options: [
          { id: "fix", label: "Build a fix around his feedback", detail: "A sure-thing idea appears, 25 percent stronger", lines: ["He feels heard: mood up."] },
          { id: "adapt", label: "Ask him to adapt", detail: "Free now, he is less happy", lines: ["Mood down a little. No new idea."] },
        ],
        data: { driverId: dr.id, area },
        deadline: s.day + 10,
        defaultOption: "adapt",
      };
    },
    resolve: (s, opt, data) => {
      const dr = s.drivers[String(data.driverId)];
      if (opt === "fix") {
        injectIdea(s, s.teamId, String(data.area) as Area, "safe", { gainMul: 1.25, note: `Built from ${dr?.spec.name ?? "the driver"}'s feedback.`, daysMul: 0.85 });
        if (dr) dr.morale = clamp(dr.morale + 0.04, 0, 1);
        recap(s, "A driver-led fix is on the table in the Car screen.");
      } else if (dr) {
        dr.morale = clamp(dr.morale - 0.03, 0, 1);
        addCause(dr, "ignoredFeedback", 0.04);
      }
    },
  },
  {
    id: "supplierDeal",
    big: false,
    cooldown: 150,
    weight: (s) => (capRoom(me(s)) < 25 ? 2 : 0.8),
    build: (s) => ({
      title: "A supplier offers a bulk deal",
      body: `A composites supplier will cut the cost of every part you start in the next 12 weeks by 15 percent. The catch: they cut corners now and then, and about three parts in ten will underdeliver. A better supplier would charge full price and promise nothing less than the drawings.`,
      options: [
        { id: "cheap", label: "Take the cheap deal", detail: "Parts cost 15 percent less, some underdeliver", lines: ["Marked on the Car screen while it runs."] },
        { id: "premium", label: "Pay for the premium supplier", detail: "$1.2m now, parts 5 percent stronger for 12 weeks" },
        { id: "no", label: "Stay as you are" },
      ],
      deadline: s.day + 8,
      defaultOption: "no",
    }),
    resolve: (s, opt) => {
      const plan = planOf(me(s));
      if (opt === "cheap") {
        plan.cheapUntil = s.day + 84;
        recap(s, "Cheap supplier deal signed for 12 weeks.");
      } else if (opt === "premium") {
        me(s).cash = round2(me(s).cash - 1.2);
        me(s).ledger.costs += 1.2;
        plan.cheapUntil = 0;
        for (const i of me(s).ideas) { i.trueGain = round2(i.trueGain * 1.05 + (i.trueGain > 0 ? 0.003 : 0)); }
        logSpend(s, "Premium supplier retainer", { cash: -1.2 });
        recap(s, "Premium supplier: current ideas are 5 percent stronger.");
      }
    },
  },
  {
    id: "staffPitch",
    big: false,
    cooldown: 120,
    weight: (s) => (staffOf(s, s.teamId, "designer") ? 1.4 : 0),
    build: (s) => {
      const des = staffOf(s, s.teamId, "designer");
      if (!des) return null;
      const area: Area = des.traits.includes("innovator") ? "aero" : weakestOf(s);
      return {
        title: `${des.name} pitches a radical concept`,
        body: `${des.name} has been sketching in his own time: a ${AREA_LABEL[area].toLowerCase()} concept nobody on the grid has tried. He believes in it. The honest view of the data is that it could be a leap, or a dud.`,
        options: [
          { id: "back", label: "Back the concept", detail: "A big gamble goes on the table, he is delighted", lines: ["Cost is real. The result is a coin toss."] },
          { id: "refine", label: "Ask him to refine it first", detail: "A smaller, safer version appears, he is lukewarm" },
          { id: "no", label: "Decline", detail: "He is disappointed" },
        ],
        data: { area, staffId: des.id },
        deadline: s.day + 10,
        defaultOption: "refine",
      };
    },
    resolve: (s, opt, data) => {
      const des = s.staff[String(data.staffId)];
      const area = String(data.area) as Area;
      if (opt === "back") {
        injectIdea(s, s.teamId, area, "gamble", { gainMul: 1.5, note: `${des?.name ?? "The designer"}'s own concept.` });
        if (des) des.mood = clamp((des.mood ?? 0.6) + 0.08, 0, 1);
      } else if (opt === "refine") {
        injectIdea(s, s.teamId, area, "safe", { gainMul: 1.15, note: "A cautious cut of the designer's concept." });
      } else if (des) des.mood = clamp((des.mood ?? 0.6) - 0.06, 0, 1);
    },
  },
  {
    id: "rivalUpgrade",
    big: false,
    cooldown: 100,
    weight: (s) => (s.round >= 2 ? 1.5 : 0),
    build: (s, rng) => {
      const others = teamRanking(s).filter((x) => x !== s.teamId).slice(0, 4);
      if (!others.length) return null;
      const t = others[Math.floor(rng.next() * others.length)];
      const area = AREAS_ARR[Math.floor(rng.next() * AREAS_ARR.length)];
      return {
        title: `${baseTeam(t).name} are bringing a big ${AREA_LABEL[area].toLowerCase()} update`,
        body: `Word in the paddock says ${baseTeam(t).name} have a large ${AREA_LABEL[area].toLowerCase()} package ready for the next races. It may be nothing, or it may move them past you.`,
        options: [
          { id: "spy", label: "Pay for intel", detail: "$0.8m, learn how good it really is", lines: ["You learn their real gain, a news item."] },
          { id: "counter", label: "Counter-develop at speed", detail: "A rushed idea appears: 30 percent faster to build, 30 percent dearer" },
          { id: "ignore", label: "Ignore it" },
        ],
        data: { team: t, area },
        deadline: s.day + 8,
        defaultOption: "ignore",
      };
    },
    resolve: (s, opt, data) => {
      const area = String(data.area) as Area;
      const t = String(data.team);
      if (opt === "spy") {
        me(s).cash = round2(me(s).cash - 0.8);
        me(s).ledger.costs += 0.8;
        const gap = round2(s.teams[t].car[area] - grid(s, area));
        news(s, `Intel: ${baseTeam(t).name}'s ${AREA_LABEL[area].toLowerCase()} is ${gap > 0.15 ? "well ahead" : gap > 0 ? "a little ahead" : "not a threat"} of the grid average.`, { importance: 2, tag: "ai", cause: "You paid for intelligence" });
        logSpend(s, "Intelligence on a rival upgrade", { cash: -0.8 });
      } else if (opt === "counter") {
        injectIdea(s, s.teamId, area, "safe", { daysMul: 0.7, costMul: 1.3, note: "Rushed in answer to a rival's package." });
      }
    },
  },
  {
    id: "reliabilityScare",
    big: false,
    cooldown: 140,
    weight: (s) => (s.round >= 3 ? 1.3 : 0),
    build: (s) => ({
      title: "Cooling temperatures are creeping up",
      body: "The data from the last race shows the power unit cooling is closer to its limit than it should be. A fix costs money now. Left alone, the risk of a failure on a hot day goes up.",
      options: [
        { id: "fix", label: "Fix it properly", detail: "$1.5m of cap room, a cooling project appears", lines: ["Reliability protected."] },
        { id: "monitor", label: "Monitor and turn the engine down on hot days", detail: "Free, costs a little pace", lines: ["Cooling -0.01, but safe."] },
        { id: "risk", label: "Carry on", detail: "Risk a failure", lines: ["Cooling quietly gets worse."] },
      ],
      deadline: s.day + 8,
      defaultOption: "monitor",
    }),
    resolve: (s, opt) => {
      const t = me(s);
      if (opt === "fix") {
        t.capSpent = round2(t.capSpent + 1.5);
        t.ledger.rnd += 1.5;
        injectIdea(s, s.teamId, "cooling", "safe", { note: "Reliability fix." });
        logSpend(s, "Cooling reliability fix", { cap: -1.5 });
      } else if (opt === "monitor") {
        t.car.cooling = round2(t.car.cooling - 0.01);
      } else {
        t.car.cooling = round2(t.car.cooling - 0.03);
        s.story.arcs.coolingRisk = 1;
      }
    },
  },
];
const AREAS_ARR: Area[] = ["aero", "chassis", "power", "cooling", "tyres"];

const EVENTS: Ev[] = [
  ...RND_EVENTS,
  {
    id: "ambition",
    big: false,
    cooldown: 150,
    weight: (s) => (driversOf(s, s.teamId).some((d) => d.podiums >= 2 && d.morale > 0.55 && d.starts > 8) && driversOf(s, s.teamId).length > 1 ? 1.6 : 0),
    build: (s) => {
      const pair = driversOf(s, s.teamId);
      const d = [...pair].filter((x) => x.podiums >= 2 && x.morale > 0.55 && x.starts > 8).sort((a, b) => b.podiums - a.podiums)[0];
      if (!d) return null;
      const mate = pair.find((x) => x.id !== d.id);
      return {
        title: `${d.spec.name} wants more`,
        body: `${d.spec.name} has ${d.podiums} podiums for you and knows it. He wants his place in the team to match.`,
        options: [
          { id: "lead", label: "Make him the lead driver", lines: [`${d.spec.name} morale +10%`, mate ? `${mate.spec.name} morale -8%` : "no one else upset"] },
          { id: "goal", label: "Set him a podium goal", lines: ["Morale +4%", "No one else affected"] },
          { id: "wait", label: "Tell him to wait", lines: ["Morale -5%", "Trust unchanged"] },
        ],
        data: { driverId: d.id },
        deadline: s.day + 10,
        defaultOption: "goal",
        urgency: 2,
      };
    },
    resolve: (s, opt, data) => {
      const d = s.drivers[String(data.driverId)];
      if (!d || d.teamId !== s.teamId) return;
      const mate = driversOf(s, s.teamId).find((x) => x.id !== d.id);
      if (opt === "lead") {
        d.morale = clamp(d.morale + 0.1, 0, 1);
        if (mate) mate.morale = clamp(mate.morale - 0.08, 0, 1);
        recap(s, `${d.spec.name} is now the lead driver.`);
      } else if (opt === "goal") {
        d.morale = clamp(d.morale + 0.04, 0, 1);
        recap(s, `${d.spec.name} has a podium to chase.`);
      } else {
        d.morale = clamp(d.morale - 0.05, 0, 1);
        recap(s, `${d.spec.name} was told to wait.`);
      }
    },
  },
  {
    id: "rivalOffer",
    big: true,
    cooldown: 220,
    weight: (s) => {
      const r = realOfferFor(s);
      if (r) return 3.5;
      const unhappy = driversOf(s, s.teamId).find((d) => d.gStage >= 3 && d.spec.pace > 0.98);
      return unhappy ? 2 : 0;
    },
    build: (s, rng) => {
      const r = realOfferFor(s);
      const d = r ? s.drivers[r.driverId as string] : driversOf(s, s.teamId).find((x) => x.gStage >= 3 && x.spec.pace > 0.98);
      if (!d) return null;
      const order = teamRanking(s);
      const team = r?.teamId ?? order.filter((x) => x !== s.teamId)[Math.floor(rng.next() * 4)];
      const ask = askingSalary(s, d);
      return {
        title: `${baseTeam(team).name} want ${d.spec.name}`,
        body: `${baseTeam(team).name} have made a formal approach for ${d.spec.name}. He is ${d.gStage >= 3 ? "not happy with how things are going here" : "listening"}. His deal runs to ${d.endYear} at ${fmtMoney(d.salary)} a year (the market says about ${fmtMoney(ask)}).`,
        options: [
          { id: "match", label: "Match with a raise", detail: `${fmtMoney(Math.max(d.salary * 1.2, ask))} a year, he stays` },
          { id: "longer", label: "Offer a longer deal", detail: "Two more years at a small raise" },
          { id: "walk", label: "Let him decide", detail: "He may sign for them next year" },
        ],
        data: { driverId: d.id, team },
        deadline: s.day + 12,
        defaultOption: "walk",
        urgency: 3,
      };
    },
    resolve: (s, opt, data) => {
      const d = s.drivers[String(data.driverId)];
      if (!d || d.teamId !== s.teamId) return;
      if (opt === "match") {
        d.salary = round2(Math.max(d.salary * 1.2, askingSalary(s, d)));
        d.grievance = round2(clamp(d.grievance - 0.15, 0, 1));
        recap(s, `${d.spec.name} stays after a raise.`);
      } else if (opt === "longer") {
        d.endYear = Math.max(d.endYear, s.year) + 2;
        d.salary = round2(d.salary * 1.08);
        d.grievance = round2(clamp(d.grievance - 0.1, 0, 1));
        recap(s, `${d.spec.name} signs on until ${d.endYear}.`);
      } else {
        const team = String(data.team);
        if (d.endYear <= s.year + 1 && s.teams[team]) {
          d.endYear = Math.min(d.endYear, s.year);
          d.causes.noResign = 1;
          news(s, `${d.spec.name} is expected to join ${baseTeam(team).name} when his deal ends.`, { importance: 3, cause: "He chose to listen to their offer", tag: "people" });
        } else {
          d.grievance = round2(clamp(d.grievance + 0.04, 0, 1));
        }
      }
    },
  },
  {
    id: "ownerVisit",
    big: true,
    cooldown: 300,
    weight: (s) => (me(s).board < 50 ? 3 : 0) + (s.owner.trust < 0.4 ? 2 : 0) + (me(s).cash < 0 ? 2.5 : 0),
    build: (s) => ({
      title: `${s.owner.name} wants answers`,
      body: `${s.owner.name} has flown in. Board confidence is ${Math.round(me(s).board)} out of 100 and the owner's trust is ${s.owner.trust < 0.4 ? "low" : "shaky"}. He wants to hear how you will turn things around.`,
      options: [
        { id: "plan", label: "Present a cost plan", detail: "R&D ceiling cut by 10 percent, trust up" },
        { id: "patience", label: "Ask for patience", detail: s.owner.trust > 0.45 ? "He may give you time" : "He is unlikely to listen" },
        { id: "promise", label: "Promise results by year end", detail: "Board +6 if you hit the target, -8 if not" },
      ],
      deadline: s.day + 10,
      defaultOption: "patience",
      urgency: 3,
    }),
    resolve: (s, opt) => {
      if (opt === "plan") {
        s.budgets.rnd = Math.round(s.budgets.rnd * 0.9);
        s.owner.trust = clamp(s.owner.trust + 0.1, 0, 1);
        boardMove(s, me(s), 2, "A paddock event");
      } else if (opt === "patience") {
        const ok = rngFor(s, "patience").chance(clamp(s.owner.trust + 0.1, 0.1, 0.8));
        boardMove(s, me(s), ok ? 3 : -3, "A paddock event");
        recap(s, ok ? "The owner gave you more time." : "The owner was not convinced.");
      } else s.story.arcs.ownerPromise = 1;
    },
  },
  {
    id: "techUnhappy",
    big: false,
    cooldown: 240,
    weight: (s) => {
      const st = [staffOf(s, s.teamId, "td"), staffOf(s, s.teamId, "designer")].find((x) => x && x.mood < 0.45);
      return st ? 2.5 : 0;
    },
    build: (s) => {
      const st = [staffOf(s, s.teamId, "td"), staffOf(s, s.teamId, "designer")].find((x) => x && x.mood < 0.45);
      if (!st) return null;
      return {
        title: `${st.name} is restless`,
        body: `${st.name} (${st.role === "td" ? "technical director" : "chief designer"}) has been quiet in meetings and rivals have noticed. Mood: low. Their work drives how well the factory reads its own ideas.`,
        options: [
          { id: "raise", label: "Give a raise", detail: `${fmtMoney(st.salary * 1.15)} a year, mood up a lot` },
          { id: "say", label: "Give more say in decisions", detail: "Mood up some, costs nothing" },
          { id: "ignore", label: "Ignore it", detail: "Mood falls a little more" },
        ],
        data: { staffId: st.id },
        deadline: s.day + 12,
        defaultOption: "say",
      };
    },
    resolve: (s, opt, data) => {
      const st = s.staff[String(data.staffId)];
      if (!st || st.teamId !== s.teamId) return;
      if (opt === "raise") {
        st.salary = round2(st.salary * 1.15);
        st.mood = clamp(st.mood + 0.25, 0, 1);
      } else if (opt === "say") st.mood = clamp(st.mood + 0.12, 0, 1);
      else st.mood = clamp(st.mood - 0.05, 0, 1);
    },
  },
  {
    id: "breakthrough",
    big: true,
    cooldown: 200,
    weight: (s) => {
      const des = staffOf(s, s.teamId, "designer");
      return des && des.skill >= 74 && me(s).facilities.tunnel >= 4 && capRoom(me(s)) > 10 && !factoryClosed(s.day, s.year) ? 2 : 0;
    },
    build: (s) => {
      const des = staffOf(s, s.teamId, "designer");
      return {
        title: "A bold concept from the designers",
        body: `${des?.name ?? "Your chief designer"} has been working on something unusual in the evenings. It is a large package with a wide range of outcomes: it could be a big step, or a dud. It would be added to your idea list, not started yet.`,
        options: [
          { id: "add", label: "Add it to the ideas", detail: "A big, risky idea, appears in the Car screen" },
          { id: "no", label: "Not now", detail: "The designers drop it" },
        ],
        deadline: s.day + 8,
        defaultOption: "no",
      };
    },
    resolve: (s, opt) => {
      if (opt !== "add") return;
      const rng = rngFor(s, "bold");
      const sz = CFG.sizes.L;
      const gain = round2(sz.hi * clamp(0.5 + rng.gauss() * 0.4 + 0.5, 0.4, 1.5));
      const idea: Idea = {
        id: s.uid++,
        area: rng.pick(["aero", "chassis", "cooling"] as const),
        size: "L",
        name: "Bold concept from the design office",
        cost: round2(sz.cost * 1.05),
        days: sz.days,
        tunnelHours: sz.hours,
        predLo: round2(sz.lo * 0.4),
        predHi: round2(sz.hi * 1.4),
        trueGain: gain,
        created: s.day,
        expires: s.day + 24,
      };
      me(s).ideas.push(idea);
      recap(s, "The bold concept is on your ideas list.");
    },
  },
  {
    id: "rookieRun",
    big: false,
    cooldown: 150,
    weight: (s) => (prospectFor(s) ? 2 : 0),
    build: (s) => {
      const p = prospectFor(s);
      if (!p) return null;
      return {
        title: `${p.name} asks for a Friday run`,
        body: `${p.name}, from your academy, has asked for a chance to drive the car in practice. It would cost one practice run at the next race, but he would learn a lot and you would see him up close.`,
        options: [
          { id: "give", label: "Give him a run", detail: "One practice run less next race, he gains confidence" },
          { id: "no", label: "Not this year", detail: "He is disappointed" },
        ],
        data: { prospectId: p.id },
        deadline: s.day + 14,
        defaultOption: "no",
      };
    },
    resolve: (s, opt, data) => {
      const p = s.academy.prospects[String(data.prospectId)];
      if (!p) return;
      if (opt === "give") {
        s.story.arcs.lostRun = (s.story.arcs.lostRun ?? 0) + 1;
        p.seen += 3;
        p.trial = clamp(p.trial + 0.25, 0, 1);
        p.confidence = clamp(p.confidence + 0.08, 0, 1);
        p.log.unshift(`${s.year}: drove the car in practice.`);
      } else p.confidence = clamp(p.confidence - 0.05, 0, 1);
    },
  },
  {
    id: "teammateClash",
    big: true,
    cooldown: 150,
    weight: (s) => {
      const ds = driversOf(s, s.teamId);
      if (ds.length < 2) return 0;
      const a = s.rivalries.find((r) => (r.a === ds[0].id && r.b === ds[1].id) || (r.a === ds[1].id && r.b === ds[0].id));
      return (s.story.arcs.clash ?? 0) > 0 ? 3 : a && a.heat > 0.5 ? 2.5 : 0;
    },
    build: (s) => {
      const ds = driversOf(s, s.teamId).sort((a, b) => (s.standings.drivers[b.id] ?? 0) - (s.standings.drivers[a.id] ?? 0));
      if (ds.length < 2) return null;
      return {
        title: `${ds[0].spec.name} and ${ds[1].spec.name} clash`,
        body: `Your two drivers touched while racing each other. Both blame the other. ${ds[0].spec.name} leads the points (${s.standings.drivers[ds[0].id] ?? 0} to ${s.standings.drivers[ds[1].id] ?? 0}). The pit wall is waiting for your line.`,
        options: [
          { id: "orders", label: "Team orders from now on", detail: `${ds[0].spec.name} is favoured, ${ds[1].spec.name} will resent it` },
          { id: "race", label: "Let them race", detail: "Both stay fired up, it may happen again" },
          { id: "mediate", label: "Sit them down together", detail: "Both calmer, costs a little time" },
        ],
        data: { a: ds[0].id, b: ds[1].id },
        deadline: s.day + 6,
        defaultOption: "race",
        urgency: 3,
      };
    },
    resolve: (s, opt, data) => {
      const a = s.drivers[String(data.a)];
      const b = s.drivers[String(data.b)];
      s.story.arcs.clash = 0;
      if (!a || !b) return;
      if (opt === "orders") {
        a.role = "number1";
        b.role = "number2";
        a.grievance = round2(clamp(a.grievance - 0.05, 0, 1));
        addCause(b, "role", 0.1);
        b.morale = clamp(b.morale - 0.08, 0, 1);
      } else if (opt === "race") {
        s.story.arcs.clash = rngFor(s, "clash").chance(0.3) ? 1 : 0;
        a.morale = clamp(a.morale + 0.02, 0, 1);
        b.morale = clamp(b.morale + 0.02, 0, 1);
      } else {
        a.grievance = round2(clamp(a.grievance - 0.03, 0, 1));
        b.grievance = round2(clamp(b.grievance - 0.03, 0, 1));
        s.story.tone = clamp(s.story.tone + 0.05, -1, 1);
      }
    },
  },
  {
    id: "sponsorAsk",
    big: false,
    cooldown: 150,
    weight: (s) => (me(s).sponsors.some((x) => x.mood > 0.7) ? 1.6 : 0),
    build: (s) => {
      const sp = me(s).sponsors.find((x) => x.mood > 0.7);
      if (!sp) return null;
      const pay = round2(0.5 + sp.retainer * 0.05);
      return {
        title: `${sp.name} ask for an appearance`,
        body: `${sp.name} are happy with you and would like both drivers at a launch event. They would pay ${fmtMoney(pay)} on top of the retainer. The drivers will not enjoy it.`,
        options: [
          { id: "yes", label: "Agree", detail: `+${fmtMoney(pay)}, driver morale down a little` },
          { id: "no", label: "Politely decline", detail: "They understand" },
        ],
        data: { pay, name: sp.name },
        deadline: s.day + 10,
        defaultOption: "no",
      };
    },
    resolve: (s, opt, data) => {
      if (opt !== "yes") return;
      me(s).cash = round2(me(s).cash + Number(data.pay));
      me(s).ledger.sponsors = round2(me(s).ledger.sponsors + Number(data.pay));
      for (const d of driversOf(s, s.teamId)) d.morale = clamp(d.morale - 0.03, 0, 1);
      logSpend(s, `${data.name} appearance fee`, { cash: Number(data.pay) });
    },
  },
  {
    id: "ownerStretch",
    big: true,
    cooldown: 365,
    weight: (s) => (me(s).board >= 70 && s.owner.trust > 0.65 && (me(s).objectives[0]?.target ?? 1) > 1 ? 2 : 0),
    build: (s) => {
      const o = me(s).objectives[0];
      return {
        title: `${s.owner.name} sets a stretch target`,
        body: `The owner is delighted with the progress and would like to aim higher: finish ${o.target - 1 === 1 ? "first" : "in the top " + (o.target - 1)} instead of "${o.text}". If you make it, there is a $6m bonus. If you miss, the board will remember.`,
        options: [
          { id: "accept", label: "Accept the stretch", detail: "+$6m if met, board -5 if missed" },
          { id: "decline", label: "Keep the current target", detail: "No change" },
        ],
        data: { target: o.target - 1 },
        deadline: s.day + 14,
        defaultOption: "decline",
      };
    },
    resolve: (s, opt, data) => {
      if (opt === "accept") s.story.arcs.stretch = Number(data.target);
    },
  },
  {
    id: "factoryCrunch",
    big: false,
    cooldown: 200,
    weight: (s) => (me(s).facilities.factory <= 2 && me(s).projects.filter((p) => p.status === "building").length >= 3 ? 2 : 0),
    build: (s) => ({
      title: "The factory is stretched",
      body: `Three or more projects are running through a factory that is behind the others in equipment. The staff offer to work overtime for two weeks. It costs ${fmtMoney(1.2)} of cap room and cash but pulls every running project forward by two days.`,
      options: [
        { id: "pay", label: "Approve overtime", detail: "Two days saved on every project, $1.2m" },
        { id: "no", label: "Carry on", detail: "No change" },
      ],
      deadline: s.day + 6,
      defaultOption: "no",
    }),
    resolve: (s, opt) => {
      if (opt !== "pay") return;
      const t = me(s);
      for (const p of t.projects) if (p.status === "building") p.progress += 2;
      t.capSpent = round2(t.capSpent + 1.2);
      t.cash = round2(t.cash - 1.2);
      logSpend(s, "Factory overtime", { cap: -1.2, cash: -1.2 });
    },
  },
  {
    id: "pressTurns",
    big: true,
    cooldown: 250,
    weight: (s) => (s.story.tone < -0.35 && s.story.mediaCount > 3 ? 2.5 : 0),
    build: (s) => ({
      title: "The press turns on you",
      body: `A string of sharp answers has caught up with you. Columns call you cold and the sponsors have noticed. You can open the doors to the press, or sit it out.`,
      options: [
        { id: "open", label: "Open day for the press", detail: "Tone recovers, drivers tired" },
        { id: "quiet", label: "Say nothing", detail: "Sponsors uneasy" },
      ],
      deadline: s.day + 8,
      defaultOption: "quiet",
    }),
    resolve: (s, opt) => {
      if (opt === "open") {
        s.story.tone = clamp(s.story.tone + 0.3, -1, 1);
        for (const d of driversOf(s, s.teamId)) d.morale = clamp(d.morale - 0.03, 0, 1);
      } else for (const sp of me(s).sponsors) sp.mood = clamp(sp.mood - 0.05, 0, 1);
    },
  },
  {
    id: "legend",
    big: false,
    cooldown: 400,
    weight: (s) => (s.hall.length ? 1 : 0),
    build: (s) => {
      const h = s.hall[Math.floor(rngFor(s, "legend").next() * s.hall.length)];
      return {
        title: `${h.name} visits the garage`,
        body: `${h.name} (${h.text}) dropped by the garage and spent time with both drivers. The mood lifted.`,
        options: [{ id: "ok", label: "Good" }],
        deadline: s.day + 6,
      };
    },
    resolve: (s) => {
      for (const d of driversOf(s, s.teamId)) d.morale = clamp(d.morale + 0.04, 0, 1);
    },
  },
];

function prospectFor(s: CareerState) {
  return Object.values(s.academy.prospects).find((p) => p.owner === s.teamId && p.status === "academy" && (p.series === "f2" || p.series === "f3") && p.confidence > 0.5 && levelOf(p) > 0.5);
}

/** Once a week: at most one big event, and only ones the state has earned. */
export function eventsWeekly(s: CareerState) {
  const st = s.story;
  if (s.weekend || s.cards.some((c) => !c.notice && !c.mail && c.kind === "event")) return; // at most one open event at a time
  const rng = rngFor(s, `events:${s.day}`);
  const live = EVENTS.filter((e) => s.day - (st.last[e.id] ?? -999) >= e.cooldown && (!e.big || s.day - st.bigDay >= 7));
  const scored = live.map((e) => ({ e, w: e.weight(s) / (1 + 0.3 * (st.count[e.id] ?? 0)) })).filter((x) => x.w > 0);
  if (!scored.length) return;
  const total = scored.reduce((a, x) => a + x.w, 0);
  if (!rng.chance(Math.min(0.55, (0.06 + 0.1 * total) * tempo(s)))) return;
  let r = rng.next() * total;
  let pick = scored[0].e;
  for (const x of scored) {
    r -= x.w;
    if (r <= 0) {
      pick = x.e;
      break;
    }
  }
  const b = pick.build(s, rng);
  if (!b) return;
  st.last[pick.id] = s.day;
  st.count[pick.id] = (st.count[pick.id] ?? 0) + 1;
  if (pick.big) st.bigDay = s.day;
  pushCard(s, "event", b.title, b.body, b.options, { deadline: b.deadline ?? s.day + 10, defaultOption: b.defaultOption ?? b.options[0].id, urgency: b.urgency ?? 2, data: { ...(b.data ?? {}), ev: pick.id } });
  ticker(s, b.title, 2);
}

export function resolveEvent(s: CareerState, c: { data?: Record<string, number | string | boolean> }, option: string) {
  const ev = String(c.data?.ev ?? "");
  if (ev.startsWith("thread:")) {
    resolveThread(s, ev, option, (c.data ?? {}) as Record<string, number | string | boolean>);
    return;
  }
  if (ev.startsWith("story:")) {
    resolveStory(s, ev, option, (c.data ?? {}) as Record<string, number | string | boolean>);
    return;
  }
  if (ev === "g3" || ev === "g4" || ev === "g5") return resolveGrievance(s, c, option);
  if (ev === "reach") return resolveReach(s, c, option);
  const e = EVENTS.find((x) => x.id === ev);
  if (e) e.resolve(s, option, c.data ?? {});
}

/** At the end of the year, pay off or call in anything the player promised the owner. */
export function eventsYearEnd(s: CareerState): string[] {
  const notes: string[] = [];
  const t = s.teams[s.teamId];
  const pos = standingsRank(s).indexOf(s.teamId) + 1 || 11;
  const obj = t.objectives[0]?.target ?? 6;
  if (s.story.arcs.ownerPromise) {
    const ok = pos <= obj;
    boardMove(s, t, ok ? 6 : -8, "A big decision");
    notes.push(ok ? "You kept your promise to the owner. Board +6." : "You missed the result you promised the owner. Board -8.");
    s.story.arcs.ownerPromise = 0;
  }
  if (s.story.arcs.stretch) {
    const ok = pos <= s.story.arcs.stretch;
    if (ok) {
      t.cash = round2(t.cash + 6);
      notes.push("You met the owner's stretch target: $6m bonus.");
    } else {
      boardMove(s, t, -5, "A big decision");
      notes.push("You missed the owner's stretch target. Board -5.");
    }
    s.story.arcs.stretch = 0;
  }
  void staffName;
  return notes;
}
