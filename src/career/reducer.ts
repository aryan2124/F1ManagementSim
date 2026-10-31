import { runLab } from "./lab";
import { clampDesign } from "./design";
import { offerStaff, signIntern, promoteIntern } from "./hiring";
import { convoClose, convoSay, openConvo } from "./convo";
import { ensureCrew, setSlot } from "./pitcrew";
import { baseTeam } from "./car";
import { onRoleChange } from "./status";
import { poachStaff } from "./poach";
import { promiseTo, makePromise, PROMISE_DAYS, PROMISE_TEXT } from "./people";
import { planOf } from "./rndplan";
import { changeLivery, endSponsor } from "./brand";
import { canApproach, evaluateOffer, extendDriver, signDriver } from "./contracts";
import { pushCard, sendLetter } from "./cards";
import { ideaBody, ideaOptions } from "./ideas";
import { askPriority, closeTalk, openTalk, privateTalk, soundOut, submitJuniorOffer, submitOffer, talkFor } from "./talks";
import { facilityCost, startFacility, driversOf, budgetBlock, budgetMax, budgetMin, budgetPool, allocated } from "./finance";
import { testPart } from "./dev";
import { capRoom, designPart, labToIdea, scrapProject, startProject } from "./rnd";
import { study, studyRegs, newCarDoubt } from "./know";
import { TRAITS } from "./types";
import { continueClock, resolveCard, stepDay, syncWeekendDay } from "./tick";
import { autoTo } from "./autoplay";
import { setNextCar } from "./nextcar";
import { startHunt } from "./mail";
import { buyoutProspect, assignScout, decide, moveSeries, promoteToSeat, setMentor, setRookie, setTraining, signProspect, trialDay } from "./academy";
import { setPackage, setRoute, setSplit, startLab } from "./eras";
import { castVote, persuade, trade } from "./vote";
import { logSpend } from "./log";
import { rulesOf } from "./eras";
import { PART_NAME, fitNew } from "./powertrain";
import { endPractice, practiceRun, recordSession, setAlloc, simulateTo, simulateWeekend } from "./weekend";
import { CFG } from "./config";
import { launchTutorialEra } from "./tutorialEra";
import { fmtMoney, round2 } from "./util";
import type { Action, CareerState } from "./types";

export interface Result {
  state: CareerState;
  /** A short sentence for the player about what happened or why it did not. */
  message: string;
  ok: boolean;
}

/** The talent cap rule: the two drivers' pay together may not pass the cap. */
function talentCapMsg(s: CareerState, newSalary: number, replacingId: string | undefined, signingId: string): string | null {
  const cap = rulesOf(s).talentCap;
  if (!cap) return null;
  const others = driversOf(s, s.teamId).filter((d) => d.id !== replacingId && d.id !== signingId).reduce((a, d) => a + d.salary, 0);
  if (others + newSalary > cap) return `The talent cap rule limits both drivers' pay to ${fmtMoney(cap, 0)} together. This would make it ${fmtMoney(others + newSalary)}.`;
  return null;
}

/** The one entry point for every change to a career. Pure: the input state is never touched. */
export function reduce(prev: CareerState, a: Action): Result {
  const s = structuredClone(prev);
  const out = apply(s, a);
  return { state: s, message: out.message, ok: out.ok };
}

/** The same, mutating the state it is given (headless runs and tests). */
export function apply(s: CareerState, a: Action): { ok: boolean; message: string } {
  const me = s.teams[s.teamId];
  const fail = (message: string) => ({ ok: false, message });
  const good = (message = "") => ({ ok: true, message });
  switch (a.type) {
    case "continue": {
      const why = continueClock(s);
      return good(why);
    }
    case "day": {
      const why = continueClock(s, true);
      return why ? fail(why) : good();
    }
    case "markRead": {
      if (a.what === "card") {
        const c = s.cards.find((x) => x.id === a.id);
        if (c) c.read = true;
      } else if (a.what === "talk") {
        const t = s.talks.find((x) => x.id === a.id);
        if (t) t.unread = false;
      } else {
        const l = (s.letters ?? []).find((x) => x.id === a.id);
        if (l) l.read = true;
      }
      return good();
    }
    case "huntSponsors": {
      const why = startHunt(s, a.mode);
      return why && !why.includes("replies are due") ? fail(why) : good(why ?? "");
    }
    case "nextCar": {
      return good(setNextCar(s, a.approach, a.share));
    }
    case "autoTo": {
      const r = autoTo(s, a.day, a.max ?? 30);
      return r.why ? fail(r.why) : good(r.done ? "Arrived." : "");
    }
    case "card":
      resolveCard(s, a.id, a.option);
      return good();
    case "startProject": {
      if (me.cash < -20) return fail("The team is too deep in debt to start new work.");
      const idea = me.ideas.find((i) => i.id === a.ideaId);
      const rb = idea ? budgetBlock(s, "rnd", idea.cost) : null;
      if (rb) return fail(rb);
      const r = startProject(s, s.teamId, a.ideaId);
      if (!r.ok) return fail(r.why ?? "Could not start.");
      return good(idea && capRoom(me) < 0 ? "Started, but you are now over the cost cap." : "Project started.");
    }
    case "testPart": {
      const r = testPart(s, s.teamId, a.id, a.plan);
      return r.ok ? good(r.message) : fail(r.message);
    }
    case "scrapProject":
      scrapProject(s, s.teamId, a.id);
      return good("Project scrapped.");
    case "holdPart": {
      const p = me.projects.find((x) => x.id === a.id);
      if (p && p.status === "ready") p.hold = a.hold;
      return good(a.hold ? "Held back from the next race." : "Will be fitted at the next race.");
    }
    case "upgradeFacility": {
      const fb = budgetBlock(s, "facilities", facilityCost(me.facilities[a.which]));
      if (fb) return fail(fb);
      const r = startFacility(s, s.teamId, a.which);
      return r.ok ? good("Facility project started. It takes about three months.") : fail(r.why ?? "Could not start.");
    }
    case "rndPlan": {
      const plan = planOf(me);
      if (a.stance) plan.stance = a.stance;
      if (a.focus) { plan.focus = a.focus; plan.until = s.day + 28; }
      return good("Factory direction saved.");
    }
    case "delegate":
      me.delegation[a.area] = a.level;
      return good();
    case "sign": {
      const d = s.drivers[a.driverId];
      if (!d) return fail("Unknown driver.");
      const can = canApproach(s, a.driverId);
      if (!can.ok) return fail(can.why ?? "Not available.");
      const verdict = evaluateOffer(s, s.teamId, a.driverId, a.offer);
      if (verdict.verdict !== "accept") return fail(verdict.verdict === "counter" ? `He wants more: about ${fmtMoney(verdict.counterSalary ?? a.offer.salary)}.` : "He turned the offer down.");
      const seat = driversOf(s, s.teamId)[a.slot];
      const capMsg = talentCapMsg(s, a.offer.salary, seat?.id, a.driverId);
      if (capMsg) return fail(capMsg);
      const bb = budgetBlock(s, "drivers", a.offer.salary - (seat?.salary ?? 0) - (d.teamId === s.teamId ? d.salary : 0));
      if (bb) return fail(bb);
      if (d.teamId === null) {
        const notes = signDriver(s, s.teamId, a.driverId, a.offer, seat?.id);
        if (a.offer.promise) promiseTo(s, a.driverId, a.offer.promise);
        return good(notes.join(" "));
      }
      if (d.teamId === s.teamId) {
        extendDriver(s, a.driverId, a.offer);
        if (a.offer.promise) promiseTo(s, a.driverId, a.offer.promise);
        return good(`${d.spec.name} extended until ${d.endYear}.`);
      }
      d.next = { teamId: s.teamId, salary: a.offer.salary, endYear: s.year + a.offer.years, role: a.offer.role, replaces: seat?.id };
      if (a.offer.promise) makePromise(s, a.driverId, a.offer.promise, PROMISE_TEXT[a.offer.promise], PROMISE_DAYS[a.offer.promise] + 150, a.offer.promise === "academy" ? (s.academy?.graduates.length ?? 0) : s.round);
      return good(`${d.spec.name} will join you next season.`);
    }
    case "talkOpen": {
      const r = openTalk(s, a.kind, a.targetId);
      return r.ok ? good(r.message) : fail(r.message);
    }
    case "talkSound": {
      const t = talkFor(s, a.id);
      if (!t) return fail("No such talks.");
      const r = soundOut(s, t);
      return r.ok ? good(r.message) : fail(r.message);
    }
    case "talkAsk": {
      const t = talkFor(s, a.id);
      if (!t) return fail("No such talks.");
      const r = askPriority(s, t);
      return r.ok ? good(r.message) : fail(r.message);
    }
    case "talkOffer": {
      const t = talkFor(s, a.id);
      if (!t || t.kind !== "driver") return fail("No such talks.");
      const d = s.drivers[t.targetId];
      if (!d) return fail("Unknown driver.");
      if (t.topic === "sound" && d.teamId !== s.teamId && canApproach(s, d.id).ok) t.topic = "sign";
      const mine = driversOf(s, s.teamId);
      if (t.topic === "sign" && mine.length >= 2 && a.replaces === undefined) return fail("Choose who he would replace first. Nobody is released until you sign.");
      if (a.replaces && !mine.some((x) => x.id === a.replaces)) return fail("That is not one of your drivers.");
      if (a.replaces === null && mine.length >= 2 && t.topic === "sign") return fail("Both seats are taken. Choose who he would replace.");
      const r = submitOffer(s, t, a.offer, t.topic === "extend" ? d.id : a.replaces);
      return r.ok ? good(r.message) : fail(r.message);
    }
    case "talkJuniorOffer": {
      const t = talkFor(s, a.id);
      if (!t || t.kind !== "junior") return fail("No such talks.");
      const r = submitJuniorOffer(s, t, { years: a.years, retainer: a.retainer, buyout: a.buyout, firstRefusal: a.firstRefusal });
      return r.ok ? good(r.message) : fail(r.message);
    }
    case "talkClose": {
      const t = talkFor(s, a.id);
      if (!t) return fail("No such talks.");
      closeTalk(s, t);
      return good("You ended the talks.");
    }
    case "talkPrivate": {
      const r = privateTalk(s, a.kind, a.targetId, a.topic);
      if (r.ok) {
        const who = a.kind === "manager" ? s.managers[a.targetId]?.name : a.kind === "driver" ? s.drivers[a.targetId]?.spec.name : s.academy.prospects[a.targetId]?.name;
        sendLetter(s, { from: who ?? "Someone", role: a.kind === "driver" ? "Driver" : a.kind === "junior" ? "Academy driver" : "Agent", subject: `Our chat (${a.topic})`, body: r.message, read: true });
      }
      return r.ok ? good(r.message) : fail(r.message);
    }
    case "talkSign": {
      const t = talkFor(s, a.id);
      if (!t || t.status !== "agreed") return fail("Nothing is agreed yet.");
      if (t.kind === "junior") {
        const j = t.junior;
        if (!j) return fail("Nothing is agreed yet.");
        const err = signProspect(s, t.targetId, j.years, j.retainer, j.buyout, j.firstRefusal);
        if (err) return fail(err);
        t.status = "closed";
        t.lines.push({ who: "you", text: "Contract signed.", day: s.day });
        return good(`${s.academy.prospects[t.targetId]?.name ?? "He"} signed with your academy.`);
      }
      const d = s.drivers[t.targetId];
      const offer = t.agreed;
      if (!d || !offer) return fail("Nothing is agreed yet.");
      const mine = driversOf(s, s.teamId);
      const own = d.teamId === s.teamId;
      const replaces = own ? null : a.replaces !== undefined ? a.replaces : t.replaces;
      if (!own && mine.length >= 2 && !replaces) return fail("Choose who he replaces before you sign.");
      const seat = replaces ? s.drivers[replaces] : undefined;
      const verdict = evaluateOffer(s, s.teamId, d.id, offer);
      if (verdict.verdict !== "accept") return fail("The situation has changed and he no longer accepts those terms.");
      const capMsg = talentCapMsg(s, offer.salary, own ? d.id : seat?.id, d.id);
      if (capMsg) return fail(capMsg);
      const bb = budgetBlock(s, "drivers", offer.salary - (own ? d.salary : seat?.salary ?? 0));
      if (bb) return fail(bb);
      let msg: string;
      if (own) {
        extendDriver(s, d.id, offer);
        msg = `${d.spec.name} extended until ${d.endYear}.`;
        if (offer.promise) promiseTo(s, d.id, offer.promise);
      } else if (d.teamId === null) {
        msg = signDriver(s, s.teamId, d.id, offer, seat?.id).join(" ");
        if (offer.promise) promiseTo(s, d.id, offer.promise);
      } else {
        d.next = { teamId: s.teamId, salary: offer.salary, endYear: s.year + offer.years, role: offer.role, replaces: seat?.id };
        if (offer.promise) makePromise(s, d.id, offer.promise, PROMISE_TEXT[offer.promise], PROMISE_DAYS[offer.promise] + 150, offer.promise === "academy" ? (s.academy?.graduates.length ?? 0) : s.round);
        msg = `${d.spec.name} will join you next season.`;
      }
      t.status = "closed";
      t.lines.push({ who: "you", text: "Contract signed.", day: s.day });
      return good(msg);
    }
    case "extend": {
      const d = s.drivers[a.driverId];
      if (!d || d.teamId !== s.teamId) return fail("Not your driver.");
      const verdict = evaluateOffer(s, s.teamId, a.driverId, a.offer);
      if (verdict.verdict !== "accept") return fail(verdict.verdict === "counter" ? `He wants more: about ${fmtMoney(verdict.counterSalary ?? a.offer.salary)}.` : "He turned the offer down.");
      const capMsg2 = talentCapMsg(s, a.offer.salary, a.driverId, a.driverId);
      if (capMsg2) return fail(capMsg2);
      const bb2 = budgetBlock(s, "drivers", a.offer.salary - d.salary);
      if (bb2) return fail(bb2);
      extendDriver(s, a.driverId, a.offer);
      if (a.offer.promise) promiseTo(s, a.driverId, a.offer.promise);
      return good(`${d.spec.name} extended until ${d.endYear}.`);
    }
    case "poachStaff": {
      const r = poachStaff(s, a.staffId, a.offerSalary);
      return r.ok ? good(r.message) : fail(r.message);
    }
    case "promise": {
      const r = promiseTo(s, a.driverId, a.kind);
      return r.ok ? good(r.message) : fail(r.message);
    }
    case "signStaff": {
      const st = s.staff[a.staffId];
      if (!st) return fail("Unknown person.");
      if (st.teamId && st.teamId !== s.teamId) return fail("Under contract with another team.");
      if (st.intern) return fail("Trainees are signed from the trainee list.");
      const bb = budgetBlock(s, "staff", a.offerSalary - (Object.values(s.staff).find((x) => x.teamId === s.teamId && x.role === st.role && (st.role !== "engineer" || x.driverId === a.forDriverId))?.salary ?? 0));
      if (bb && st.role !== "scout" && st.role !== "coach") return fail(bb);
      if (a.forDriverId) st.driverId = a.forDriverId;
      const o = offerStaff(s, st, round2(a.offerSalary), a.years);
      return o.ok ? good(o.message) : fail(o.message);
    }
    case "runLab": {
      const r = runLab(s, s.teamId, a.inst, a.model);
      return r.ok ? good(r.message) : fail(r.message);
    }
    case "setDesignNext": {
      me.designNext = a.model ? clampDesign(a.model) : undefined;
      return good(a.model ? "That shape is now the plan for January." : "The January shape plan is cleared.");
    }
    case "signIntern": {
      const r = signIntern(s, a.staffId);
      return r.ok ? good(r.message) : fail(r.message);
    }
    case "promoteIntern": {
      const r = promoteIntern(s, a.staffId);
      return r.ok ? good(r.message) : fail(r.message);
    }
    case "releaseStaff": {
      const st = s.staff[a.staffId];
      if (!st || st.teamId !== s.teamId) return fail("Not on your team.");
      const left = Math.max(1, st.endYear - s.year + 1);
      me.cash = round2(me.cash - st.salary * left * 0.4);
      st.teamId = null;
      s.freeStaff.push(st.id);
      return good(`${st.name} released. Payout ${fmtMoney(st.salary * left * 0.4)}.`);
    }
    case "practiceRun": {
      const out = practiceRun(s, a.programme, a.setup, a.driverId, { fresh: a.fresh, setId: a.setId });
      return out.length ? good(out[0]) : fail("No runs left.");
    }
    case "setTeller": {
      s.teller = a.teller;
      return good(`Story mode: ${a.teller}.`);
    }
    case "setTweak": {
      if (!s.weekend) return fail("No weekend.");
      if (s.weekend.parc) return fail("Parc ferme: the setup is locked.");
      const tw: Record<string, number> = {};
      for (const k of Object.keys(a.tweak)) tw[k] = Math.max(-0.4, Math.min(0.4, Math.round(a.tweak[k] * 20) / 20));
      (s.weekend.tweak ??= {})[a.driverId] = tw;
      return good("That driver's own settings are saved.");
    }
    case "setSetup": {
      if (!s.weekend) return fail("No weekend.");
      if (s.weekend.parc) {
        if (!a.force) return fail("Parc ferme: the setup is locked.");
        s.weekend.parcBroken = true;
        s.weekend.setup = { ...a.setup };
        return good("Setup changed after parc ferme: both cars start from the pit lane.");
      }
      s.weekend.setup = { ...a.setup };
      return good("Setup saved. The next run will tell you what it is worth.");
    }
    case "swapPart": {
      const ws = s.weekend;
      if (!ws || ws.stage === "done") return fail("There is no weekend to do this in.");
      const dr = s.drivers[a.driverId];
      if (!dr || dr.teamId !== s.teamId) return fail("Not your driver.");
      const was = ws.parc;
      const places = fitNew(s, a.driverId, a.part);
      return good(`New ${PART_NAME[a.part]} fitted to ${dr.spec.name}'s car.${places ? ` He takes a ${places} place grid penalty${was ? " (parc ferme breach included)" : ""}.` : " No penalty: still within the season allowance."}`);
    }
    case "enterWeekend":
      if (s.weekend) s.weekend.entered = true;
      return good();
    case "endPractice":
      endPractice(s);
      syncWeekendDay(s);
      return good();
    case "setAlloc": {
      const r = setAlloc(s, a.alloc);
      return r.ok ? good(r.message) : fail(r.message);
    }
    case "recordSession":
      recordSession(s, a.kind, a.order, a.points, a.grid, a.dnf, a.moods, { locks: a.locks, used: a.used, sets: a.sets, failed: a.failed, fastest: a.fastest, pit: a.pit, radio: a.radio, duels: a.duels });
      syncWeekendDay(s);
      return good();
    case "simWeekend": {
      simulateWeekend(s);
      syncWeekendDay(s);
      return good("The weekend was simulated.");
    }
    case "tutorialEra":
      launchTutorialEra(s);
      return good();
    case "simTo": {
      simulateTo(s, a.until);
      syncWeekendDay(s);
      return good();
    }
    case "sponsor":
      return good();
    case "livery": {
      const r = changeLivery(s, a.color);
      return r.ok ? good(r.message) : fail(r.message);
    }
    case "endSponsor": {
      const r = endSponsor(s, a.id);
      return r.ok ? good(r.message) : fail(r.message);
    }
    case "step": {
      const why = stepDay(s, !!a.first);
      return why ? { ok: false, message: why } : good();
    }
    case "dismiss":
      s.cards = s.cards.filter((c) => !(c.id === a.id && c.options.length <= 1));
      return good();
    case "setBudget": {
      const want = Math.max(0, Math.round(a.value));
      const hi = budgetMax(s, a.key);
      const lo = budgetMin(s, a.key);
      const v = Math.max(Math.min(lo, s.budgets[a.key]), Math.min(want, hi));
      if (want > hi && a.key !== "rnd") {
        s.budgets[a.key] = Math.max(v, s.budgets[a.key]);
        return good(`The owner's pool is ${budgetPool(s).pool.toFixed(0)}m and ${allocated(s).toFixed(0)}m is already given out. Lower another line first.`);
      }
      if (want < lo) {
        s.budgets[a.key] = Math.max(v, Math.min(lo, s.budgets[a.key]));
        return good(a.key === "facilities" ? "Running costs of the buildings alone come to that much." : "Contracts already signed cost that much.");
      }
      s.budgets[a.key] = v;
      return good();
    }
    case "eraSplit":
      setSplit(s, s.teamId, a.value);
      return good();
    case "eraRoute": {
      const r = setRoute(s, s.teamId, a.route, a.hedge);
      return r ? fail(r) : good("Route saved.");
    }
    case "eraLab": {
      const r = startLab(s, s.teamId, a.unknown);
      return r ? fail(r) : good("Study started.");
    }
    case "eraVote": {
      const r = castVote(s, a.moduleId, a.vote);
      return r ? fail(r) : good();
    }
    case "eraPersuade": {
      const r = persuade(s, a.moduleId, a.teamId, a.dir);
      return r.ok ? good(r.message) : fail(r.message);
    }
    case "eraTrade": {
      const r = trade(s, a.teamId, a.myModule, a.theirModule);
      return r.ok ? good(r.message) : fail(r.message);
    }
    case "eraPackage":
      setPackage(s, s.teamId, a.pkg);
      return good();
    case "labToIdea": {
      const r = labToIdea(s, s.teamId, a.entryId);
      if (!r.ok) return fail(r.why ?? "Could not send it.");
      if (!s.cards.some((c) => c.kind === "ideaBatch")) {
        const i = r.idea!;
        pushCard(s, "ideaBatch", "Your lab shape is on the table", ideaBody(s, 1, 1), [...ideaOptions(s, [i]), { id: "none", label: "Not now", detail: "The idea stays on the Car screen until its offer ends" }], { urgency: 2, deadline: s.day + 6, defaultOption: "none", data: { offered: String(i.id) } });
      }
      return good(`"${r.idea!.name}" is with the drawing office.`);
    }
    case "designPart": {
      if (me.tunnelLeft < 6) return fail("A design brief needs 6 allowance hours of simulation time and there are not enough left.");
      const r = designPart(s, s.teamId, a.area, a.trait, a.kind, a.lead, a.size);
      if (!r.ok) return fail(r.why ?? "Could not draw that up.");
      me.tunnelLeft = Math.max(0, me.tunnelLeft - 6);
      return good("The design office has drawn it up. It is on the Car screen under proposals.");
    }
    case "study": {
      if (!TRAITS.includes(a.trait)) return fail("Unknown trait.");
      const r = study(s, s.teamId, a.trait, a.readings);
      return r.ok ? good(`Study done: ${r.hours} hours used.`) : fail(r.why ?? "Could not run it.");
    }
    case "studyRegs": {
      if (!TRAITS.includes(a.trait)) return fail("Unknown trait.");
      const r = studyRegs(s, s.teamId, a.trait, a.readings);
      return r.ok ? good(`Rulebook study done: ${r.hours} hours used.`) : fail(r.why ?? "Could not run it.");
    }
    case "setConcept": {
      if (me.conceptDay !== undefined && s.day - me.conceptDay < 28) return fail("The design office needs four weeks to settle after a change of direction.");
      const next = { ...me.concept };
      for (const k of ["df", "risk", "innov"] as const) if (a.phil[k] !== undefined) next[k] = Math.max(-1, Math.min(1, Math.round((a.phil[k] as number) * 20) / 20));
      const moved = Math.abs(next.df - me.concept.df) + Math.abs(next.risk - me.concept.risk) + Math.abs(next.innov - me.concept.innov);
      me.concept = next;
      me.conceptDay = s.day;
      // re-planning costs certainty: the team has to re-learn how its car answers the new direction
      if (moved > 0.2) newCarDoubt(me, Math.min(0.06, moved * 0.04));
      return good("The new direction is set. Engineers whose instincts match it will do better work.");
    }
    case "setGuidance":
      s.guidance = a.level;
      return good(a.level === "off" ? "Guidance off: facts only." : a.level === "hints" ? "Guidance on: plain-language flags." : "Guidance on: full recommendations.");
    case "borrow": {
      const amt = Math.round(a.amount);
      if (!(amt >= 5)) return fail("The bank lends in lumps of at least $5m.");
      if ((me.debt ?? 0) + amt > CFG.debtMax) return fail(`The bank will not lend more than ${fmtMoney(CFG.debtMax, 0)} in total.`);
      me.debt = round2((me.debt ?? 0) + amt);
      me.cash = round2(me.cash + amt);
      logSpend(s, `Borrowed ${fmtMoney(amt)} from the bank`, { cash: amt });
      return good(`Borrowed ${fmtMoney(amt)}. It costs ${Math.round(CFG.debtRate * 100)} percent a year and the board dislikes a big debt.`);
    }
    case "repay": {
      const amt = Math.min(Math.round(a.amount), Math.round(me.debt ?? 0));
      if (!(amt >= 1)) return fail("Nothing to repay.");
      if (me.cash < amt) return fail("Not enough cash.");
      me.debt = round2((me.debt ?? 0) - amt);
      me.cash = round2(me.cash - amt);
      logSpend(s, `Repaid ${fmtMoney(amt)} to the bank`, { cash: -amt });
      return good(`Repaid ${fmtMoney(amt)}.`);
    }
    case "borrowTunnel": {
      if (me.tunnelLeft > 150) return fail("You still have plenty of hours.");
      me.tunnelLeft += 60;
      me.tunnelTotal += 60;
      me.tunnelDebt = (me.tunnelDebt ?? 0) + 60;
      me.capSpent = round2(me.capSpent + 1.5);
      logSpend(s, "Borrowed 60 wind tunnel hours from the next allowance", { cap: -1.5, tunnel: 60 });
      return good("Borrowed 60 hours. They come off the next allowance, and it cost $1.5m of cap room.");
    }
    case "shortlist": {
      const l = s.academy.shortlist;
      s.academy.shortlist = a.on ? [...new Set([...l, a.id])] : l.filter((x) => x !== a.id);
      return good();
    }
    case "assignScout": {
      const r = assignScout(s, a.staffId, a.series);
      return r ? fail(r) : good();
    }
    case "trialDay": {
      const r = trialDay(s, a.id);
      return r ? fail(r) : good("Trial day done. The scouts' ranges have narrowed.");
    }
    case "buyoutProspect": {
      const err = buyoutProspect(s, a.id);
      return err ? fail(err) : good("Bought out. He joins your academy.");
    }
    case "signProspect": {
      const r = signProspect(s, a.id, a.years, a.retainer, a.buyout, a.firstRefusal);
      return r ? fail(r) : good("Signed to your academy.");
    }
    case "training": {
      const r = setTraining(s, a.id, a.focus);
      return r ? fail(r) : good();
    }
    case "moveSeries": {
      const r = moveSeries(s, a.id, a.series);
      return r ? fail(r) : good();
    }
    case "mentor": {
      const r = setMentor(s, a.id, a.driverId);
      return r ? fail(r) : good();
    }
    case "decide": {
      const r = decide(s, a.id, a.decision);
      return r ? fail(r) : good();
    }
    case "rookie": {
      const r = setRookie(s, a.id);
      return r ? fail(r) : good();
    }
    case "promote": {
      const r = promoteToSeat(s, a.id, a.slot, a.salary, a.years);
      return good(r);
    }
    case "setRole": {
      const d = s.drivers[a.driverId];
      if (!d || d.teamId !== s.teamId) return fail("Not your driver.");
      const before = d.role;
      d.role = a.role;
      // the other driver follows: one number one means one number two
      const mate = driversOf(s, s.teamId).find((x) => x.id !== d.id);
      if (mate) {
        if (a.role === "number1" && mate.role === "number1") {
          mate.role = "number2";
          onRoleChange(s, mate, "number1", "number2");
        } else if (a.role === "number1" && mate.role === "equal") {
          mate.role = "number2";
          onRoleChange(s, mate, "equal", "number2");
        } else if (a.role === "equal" && mate.role === "number2" && before === "number1") {
          mate.role = "equal";
          onRoleChange(s, mate, "number2", "equal");
        }
      }
      onRoleChange(s, d, before, a.role);
      return good(a.role === "number1" ? `${d.spec.name} is your number one.` : a.role === "number2" ? `${d.spec.name} is now your second driver.` : `${d.spec.name} is treated as an equal.`);
    }
    case "convoSay": {
      const err = convoSay(s, a.id, a.option);
      return err ? fail(err) : good();
    }
    case "convoClose": {
      convoClose(s, a.id);
      return good();
    }
    case "setCrew": {
      const crew = ensureCrew(s, s.teamId, baseTeam(s.teamId).pitCrew);
      const why = setSlot(crew, a.slot, a.memberId);
      return why ? fail(why) : good("Pit crew line-up changed. They will need stops together to settle.");
    }
    case "ackCeremony": {
      s.ceremonies = (s.ceremonies ?? []).slice(1);
      return good();
    }
    case "researchDriver": {
      const d = s.drivers[a.driverId];
      if (!d) return fail("Unknown driver.");
      const cost = 0.2;
      const t = s.teams[s.teamId];
      if (t.cash < cost) return fail("Not enough cash.");
      const know = (s.driverKnow ??= {});
      if ((know[d.id] ?? 0) >= 0.95) return fail("You already know everything there is to know.");
      t.cash = round2(t.cash - cost);
      t.ledger.other += cost;
      know[d.id] = Math.min(1, (know[d.id] ?? 0.2) + 0.45);
      return good(`Your scouts report back on ${d.spec.name}. It cost ${fmtMoney(cost)}.`);
    }
    case "meeting": {
      const d = s.drivers[a.driverId];
      if (!d || d.teamId !== s.teamId) return fail("Not your driver.");
      const key = `meet:${d.id}`;
      const already = (s.convos ?? []).some((c) => c.open && c.driverId === d.id);
      if (!already && s.day - (s.story.last[key] ?? -99) < 7) return fail("You talked to him this week. Give it a few days.");
      s.story.last[key] = s.day;
      openConvo(s, d);
      return good(`${d.spec.name} sits down with you.`);
    }
  }
  void pushCard;
  return fail("Unknown action.");
}
