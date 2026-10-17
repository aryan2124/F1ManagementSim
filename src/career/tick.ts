import { socialWeekly } from "./social";
import { boardMove } from "./board";
import { CFG } from "./config";
import { passiveRead, study } from "./know";
import { TRAIT_NAME } from "./traits";
import { wantsAdvice } from "./guide";
import { resolveMail, mailWeekly } from "./mail";
import { storiesDaily, storiesWeekly } from "./stories";
import { threadsWeekly } from "./threads";
import { designQuality, nextCarWeekly, resolveNextCar } from "./nextcar";
import { addFact } from "./facts";
import { standingsRank, staffOf, teamRanking, carRating, noisyRanking } from "./car";
import { factoryClosed, launchDay, summerEnd, summerStart, testDay, winterStart } from "./calendar";
import { pushCard, ticker, news, recap } from "./cards";
import { askingSalary, extendDriver, hireStaff, signDriver, staffAsk } from "./contracts";
import { tickTalks } from "./talks";
import { budgetBlock, driversOf, monthlyBooks, startFacility, tickFacility } from "./finance";
import { aiResearch, capRoom, fitParts, generateIdeas, maxConcurrent, resetAllowance, scrapProject, startProject, tickRnd } from "./rnd";
import { endOfSeason, isWeakestTeam, newSeason, newSeasonPlayer, playerRank, switchTeam, yearEndPlayer } from "./season";
import { clamp, isHuman, epochDay, fmtMoney, fmtRange, rngFor, round2, ymd } from "./util";
import { autoPractice, delegatedParts, simulateWeekend, startWeekend } from "./weekend";
import { AREAS, AREA_LABEL, TRAITS, type Area, type Card, type CardOption, type CareerState, type Project, type TeamState, type WeekendState } from "./types";
import { baseTeam } from "./car";
import { brandWeekly, offerSponsors, resolveBacklash, resolveSponsorPick } from "./brand";
import { eraDaily, eraStory, eraStoryCard, eraSummer, eraWeekly } from "./eras";
import { academyMonth, decide, resignProspect, resolveBid, resolveTalk } from "./academy";
import { riftWeekly, pressWeekly, resolveRift, resolvePressStory } from "./dressing";
import { midSeasonReview, resolveMid, summerDeals } from "./silly";
import { poachWeekly, resolveStaffPoach } from "./poach";
import { weeklyReach } from "./convo";
import { devWeekly, resolveTestDay, seasonTestDays, testDayCard, onBatchDecided, onHold, resolveCrisis, resolveNotice } from "./dev";
import { fadeSlights } from "./status";
import { aiMonthly, driverRumours, pressConference, resolveMedia, settlePromises, weeklyPeople } from "./people";
import { eventsWeekly, resolveEvent } from "./events";
import { ideaBody, ideaOptions } from "./ideas";
import { FOCUS_TEXT, STANCE_TEXT, activePlan, focusLabel, ideaScore, planOf, weakestArea } from "./rndplan";
import { logSpend } from "./log";

const seasonOver = (s: CareerState) => s.round >= s.calendar.length;
const closedYear = (s: CareerState) => s.history.some((h) => h.year === s.year);

// ---------------------------------------------------------------- cards that expire

function takeDefault(s: CareerState, c: Card) {
  if (c.mail) {
    resolveCard(s, c.id, c.defaultOption ?? c.options[0].id, true);
    return;
  }
  recap(s, `No answer in time on "${c.title}": ${c.options.find((o) => o.id === c.defaultOption)?.label ?? "default"} chosen.`);
  resolveCard(s, c.id, c.defaultOption ?? c.options[0].id, true);
}

function expireCards(s: CareerState) {
  for (const c of [...s.cards]) {
    if (c.deadline !== undefined && s.day > c.deadline) {
      if (c.options.length === 1) s.cards = s.cards.filter((x) => x.id !== c.id);
      else takeDefault(s, c);
    }
  }
  // keep the pile short: notices are capped, and when too many decisions stack up the oldest minor ones take their default
  const notices = s.cards.filter((c) => c.notice);
  while (notices.length > 8) {
    const old = notices.shift() as Card;
    s.cards = s.cards.filter((c) => c.id !== old.id);
  }
  let decisions = s.cards.filter((c) => !c.notice && !c.mail);
  while (decisions.length > 7) {
    const minor = decisions.filter((c) => c.urgency === 1).sort((a, b) => a.created - b.created)[0];
    if (!minor) break;
    takeDefault(s, minor);
    decisions = s.cards.filter((c) => !c.notice && !c.mail);
  }
}

// ---------------------------------------------------------------- card answers

export function resolveCard(s: CareerState, id: number, option: string, auto = false) {
  const c = s.cards.find((x) => x.id === id);
  if (!c) return;
  s.cards = s.cards.filter((x) => x.id !== id);
  const me = s.teams[s.teamId];
  const d = c.data ?? {};
  switch (c.kind) {
    case "rndDirection": {
      if (option.startsWith("focus:")) {
        const plan = planOf(me);
        plan.focus = option.slice(6) as typeof plan.focus;
        plan.until = s.day + 28;
        recap(s, `Factory effort: ${focusLabel(plan.focus).toLowerCase()} for four weeks.`);
      }
      break;
    }
    case "testDay":
      resolveTestDay(s, option, !!d.season);
      break;
    case "staffNotice":
      resolveNotice(s, c, option);
      break;
    case "devCrisis":
      resolveCrisis(s, option);
      break;
    case "ideaBatch": {
      const offered = String(d.offered ?? "").split(",").filter(Boolean).map(Number);
      const chosen = option.startsWith("idea:") ? Number(option.slice(5)) : null;
      onBatchDecided(s, s.teamId, offered, chosen);
      // a real tradeoff: whatever was put to you and not taken is shelved for good, the people go back to their desks
      me.ideas = me.ideas.filter((i) => !offered.includes(i.id) || i.id === chosen);
      if (option.startsWith("idea:")) {
        const r = startProject(s, s.teamId, Number(option.slice(5)));
        if (r.ok) recap(s, "Project started.");
        else if (!auto) recap(s, r.why ?? "Could not start.");
      }
      break;
    }
    case "projectReady": {
      const p = me.projects.find((x) => x.id === Number(d.projectId));
      if (p && p.status === "ready") {
        p.hold = option === "hold";
        onHold(s, s.teamId, p, p.hold);
        recap(s, p.hold ? `${p.name}: held back.` : `${p.name}: will be fitted at the next race.`);
      }
      break;
    }
    case "mail":
      resolveMail(s, c, option);
      break;
    case "nextCar":
      resolveNextCar(s, option);
      break;
    case "event":
      resolveEvent(s, c, option);
      break;
    case "media":
      resolveMedia(s, String(d.q), option);
      break;
    case "talk": {
      const pid = String(d.prospectId);
      if (d.bid) resolveBid(s, option, d);
      else if (d.resign) {
        if (option === "resign") resignProspect(s, pid);
        else decide(s, pid, "release");
      } else resolveTalk(s, pid, option);
      break;
    }
    case "rivalry":
      resolveRift(s, option, String(d.a), String(d.b));
      break;
    case "pressStory":
      resolvePressStory(s, option);
      break;
    case "sponsorPick":
      resolveSponsorPick(s, option);
      break;
    case "fanBacklash":
      resolveBacklash(s, option, Number(d.sponsorId));
      break;
    case "sponsorOffer": {
      if (option === "accept") {
        me.sponsors.push({
          id: s.uid++,
          name: String(d.name),
          retainer: Number(d.retainer),
          bonusPerRace: Number(d.bonus),
          objective: String(d.objective),
          objKind: d.objKind as "bothPoints" | "podiums" | "top5",
          mood: 0.6,
          endYear: Number(d.endYear),
          demand: Number(d.demand),
        });
        recap(s, `${d.name} signed as a sponsor.`);
      }
      break;
    }
    case "sponsorReview": {
      const sp = me.sponsors.find((x) => x.id === Number(d.sponsorId));
      if (!sp) break;
      if (option === "renew") {
        sp.endYear = s.year + 2;
        sp.retainer = round2(sp.retainer * (0.88 + sp.mood * 0.3));
        recap(s, `${sp.name} renewed at ${fmtMoney(sp.retainer)}.`);
      } else {
        me.sponsors = me.sponsors.filter((x) => x.id !== sp.id);
        recap(s, `${sp.name} dropped.`);
      }
      break;
    }
    case "contractExpiring": {
      const dr = s.drivers[String(d.driverId)];
      if (!dr || dr.teamId !== s.teamId) break;
      if (option === "renew") {
        const offer = { salary: round2(askingSalary(s, dr) * 1.05), years: 2, role: dr.role };
        extendDriver(s, dr.id, offer);
        recap(s, `${dr.spec.name} re-signed until ${dr.endYear} for ${fmtMoney(offer.salary)}.`);
      } else if (option === "exercise" && dr.optionYear) {
        dr.endYear = dr.optionYear;
        dr.optionYear = undefined;
        recap(s, `${dr.spec.name}: team option taken up, he stays until ${dr.endYear}.`);
      } else if (option === "release") {
        dr.endYear = s.year;
        recap(s, `${dr.spec.name} will leave at the end of the season.`);
      }
      break;
    }
    case "staffExpiring": {
      const st = s.staff[String(d.staffId)];
      if (!st || st.teamId !== s.teamId) break;
      if (option === "renew") {
        st.endYear = s.year + 2;
        st.salary = staffAsk(st);
        recap(s, `${st.name} re-signed.`);
      }
      break;
    }
    case "staffPoach":
      resolveStaffPoach(s, option, d);
      break;
    case "summerHub": {
      if (option === "offsite") {
        me.cash = round2(me.cash - 0.6);
        for (const st of Object.values(s.staff)) if (st.teamId === s.teamId) st.mood = clamp(st.mood + 0.1, 0, 1);
        recap(s, "Team offsite: staff morale up.");
      } else if (option === "holiday") {
        for (const dr of driversOf(s, s.teamId)) dr.morale = clamp(dr.morale + 0.08, 0, 1);
        recap(s, "Drivers sent on holiday: morale up.");
      }
      break;
    }
    case "welcome": {
      if (option === "off" || option === "hints" || option === "full") s.guidance = option;
      break;
    }
    case "firing": {
      if (option.startsWith("join:")) {
        const id = option.slice(5);
        switchTeam(s, id);
        news(s, `You take over at ${baseTeam(id).name}.`);
        recap(s, `You now run ${baseTeam(id).name}.`);
      }
      break;
    }
    case "owner":
      if (d.mid) resolveMid(s, option, d);
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------- the daily tick

function monthly(s: CareerState, month: number) {
  monthlyBooks(s);
  academyMonth(s, month);
  aiMonthly(s);
  monthlyPlayer(s);
}

/** The monthly work that belongs to one person's team: budgets, staff mood, the board, sponsors. */
export function monthlyPlayer(s: CareerState) {
  budgetCheck(s);
  const me = s.teams[s.teamId];
  const rng = rngFor(s, `month:${s.teamId}`);
  // staff mood drifts toward how the team is doing
  const rank = playerRank(s);
  const expect = (me.objectives[0]?.target ?? 6) - rank; // positive = ahead of target
  for (const st of Object.values(s.staff)) {
    if (st.teamId !== s.teamId) continue;
    st.mood = clamp(st.mood + (st.mood < 0.65 ? 0.02 : -0.01) + clamp(expect, -3, 3) * 0.006, 0, 1);
  }
  // board confidence follows results against the owner's target (once the season is under way)
  if (s.round >= 3 && !closedYear(s)) {
    boardMove(s, me, clamp(expect * 0.8, -3, 2), expect >= 0 ? "Results beat the owner's target" : "Results short of the owner's target");
  }
  if ((me.debt ?? 0) > 30) boardMove(s, me, -0.6, "Heavy borrowing");
  if (me.cash < 0) {
    boardMove(s, me, -3, "The team is overdrawn");
    ticker(s, "The team is overdrawn. The board is worried.", 3);
  }
  // sponsors lose patience when promises are not met
  for (const sp of me.sponsors) sp.mood = clamp(sp.mood + (rank <= (me.objectives[0]?.target ?? 6) ? 0.01 : -0.01), 0, 1);
  // an offer from a new sponsor now and then
  if (!closedYear(s) && me.sponsors.length < 4 && !s.cards.some((c) => c.kind === "sponsorPick") && rng.chance(0.2)) offerSponsors(s);
  checkFired(s);
}

/** A notice when a budget ceiling the player set has been passed. */
function budgetCheck(s: CareerState) {
  const t = s.teams[s.teamId];
  const spent: Record<string, number> = { drivers: t.ledger.drivers, staff: t.ledger.staffPay, rnd: t.ledger.rnd, facilities: t.ledger.facilities, academy: t.ledger.academy };
  for (const [k, v] of Object.entries(spent)) {
    const cap = s.budgets[k as keyof typeof s.budgets];
    const key = `budget:${k}:${s.year}`;
    if (cap > 0 && v > cap && !s.story.arcs[key]) {
      s.story.arcs[key] = 1;
      pushCard(s, "info", `Over your ${k} budget`, `Spent this year on ${k}: ${fmtMoney(v)}, over the ceiling you set (${fmtMoney(cap, 0)}). Nothing is blocked, but the owner is watching. Raise the ceiling in the Money screen if it is deliberate.`, [{ id: "ok", label: "OK" }], { urgency: 2, deadline: s.day + 20 });
      boardMove(s, t, -0.5, "Over a budget ceiling");
    }
  }
}

export function checkFired(s: CareerState) {
  const me = s.teams[s.teamId];
  if (s.fired || closedYear(s)) return;
  // the first season is a grace period for the weakest car; after that no seat is safe
  if (isWeakestTeam(s, s.teamId) && s.year === CFG.firstYear) {
    me.board = Math.max(me.board, 22);
    return;
  }
  if (me.board > 14) return;
  if (s.humans) {
    // a league keeps every seat filled: the owner's last warning bites instead
    const key = `warned:${s.year}`;
    if (s.story.arcs[key]) return;
    s.story.arcs[key] = 1;
    me.board = 30;
    s.owner.trust = clamp(s.owner.trust - 0.25, 0, 1);
    for (const sp of me.sponsors) sp.mood = clamp(sp.mood - 0.15, 0, 1);
    pushCard(s, "info", "The owner's last warning", "Results and money have run out of patience. In a league the owner cannot replace you, so he takes it out on the team: trust is gone, sponsors are uneasy and the board is watching every decision. Turn it around this season.", [{ id: "ok", label: "Understood" }], { urgency: 3, deadline: s.day + 7 });
    return;
  }
  const ranking = teamRanking(s);
  const mine = ranking.indexOf(s.teamId);
  let cands = ranking.slice(mine + 1, mine + 4);
  if (!cands.length) cands = ranking.filter((id) => id !== s.teamId).slice(-3).reverse();
  if (!cands.length) return;
  s.fired = true;
  pushCard(
    s,
    "firing",
    "The owner has ended your contract",
    `Results and money have run out of patience. The owner is letting you go. Teams that want a principal with your experience:`,
    cands.map((id) => ({ id: `join:${id}`, label: `Join ${baseTeam(id).name}`, detail: `Car ranked ${ranking.indexOf(id) + 1} of ${ranking.length}` })),
    { urgency: 3, deadline: s.day + 7, defaultOption: `join:${cands[0]}` },
  );
}

/** Rich AI teams put spare cash into their facilities, one project at a time. */
function aiInvest(s: CareerState, id: string) {
  const t = s.teams[id];
  if (t.facilities.building || t.cash < 90 + t.facilities.tunnel * 10) return;
  const order = (["tunnel", "factory", "sim"] as const).filter((w) => t.facilities[w] < 5).sort((a, b) => t.facilities[a] - t.facilities[b]);
  if (order.length && rngFor(s, `inv:${id}`).chance(0.1 + 0.2 * t.skillBrain)) startFacility(s, id, order[0]);
}

function weekly(s: CareerState) {
  const closed = factoryClosed(s.day, s.year);
  for (const id of Object.keys(s.teams)) {
    if (isHuman(s, id)) continue;
    if (!closed && !closedYear(s)) aiResearch(s, id);
    aiInvest(s, id);
  }
  if (closedYear(s)) return;
  weeklyPeople(s);
  eraWeekly(s);
  weeklyPlayer(s, true);
}

/** The weekly work that belongs to one person: promises, the press, the dressing room, ideas. `first` is false for the second human onward. */
export function weeklyPlayer(s: CareerState, first: boolean) {
  const closed = factoryClosed(s.day, s.year);
  if (closedYear(s)) return;
  brandWeekly(s);
  riftWeekly(s);
  pressWeekly(s);
  settlePromises(s);
  poachWeekly(s);
  devWeekly(s);
  midSeasonReview(s);
  if (s.round > 0 || s.day > epochDay(s.year, 3, 1)) {
    eventsWeekly(s);
    storiesWeekly(s);
    threadsWeekly(s);
    socialWeekly(s);
    mailWeekly(s);
    driverRumours(s, first);
  }
  nextCarWeekly(s);
  passiveRead(s, s.teamId);
  generateIdeas(s, s.teamId);
  if (closed) return;
  rndManage(s);
}

/** The factory's rhythm: ideas arrive weekly, and every fourth week the player steers. The head of R&D acts for the player when delegated. */
function rndManage(s: CareerState) {
  const me = s.teams[s.teamId];
  const lvl = me.delegation.rnd;
  const monthly = s.day % 28 === 2;
  const plan = activePlan(s, me);
  if (lvl === "do" || lvl === "hands") {
    // "do it": they act and tell you; "hands off": they act and you hear nothing
    const say = (m: string) => {
      if (lvl === "do") recap(s, m);
    };
    if (monthly) delegatedEngineering(s, me, say);
    if (monthly && plan.focus === "balanced") {
      // delegation is a gamble on the people: a weak head of R&D or a sour office sometimes picks the wrong area
      const dq = clamp(designQuality(s) * 0.85 + 0.2, 0.3, 1);
      plan.focus = rngFor(s, `deleg:${s.day}`).chance(dq) ? weakestArea(s, s.teamId) : (AREAS[Math.floor(rngFor(s, `delegw:${s.day}`).next() * AREAS.length)] ?? weakestArea(s, s.teamId));
      plan.until = s.day + 28;
      say(`Your head of R&D put the effort into ${focusLabel(plan.focus).toLowerCase()} for the month.`);
    }
    let n = 0;
    while (n++ < 2 && capRoom(me) > 3 && me.projects.filter((p) => p.status === "building").length < maxConcurrent(me) && me.ideas.length) {
      const best = [...me.ideas].sort((a, b) => ideaScore(s, me, b) - ideaScore(s, me, a))[0];
      if (capRoom(me) < best.cost || budgetBlock(s, "rnd", best.cost)) break;
      const started = startProject(s, s.teamId, best.id);
      if (started.ok) {
        const pr = me.projects.find((q) => q.id === best.id);
        if (pr) pr.unbriefed = true;
      }
      say(`Your designers started "${best.name}".`);
    }
    return;
  }
  if (lvl !== "advise" || !monthly) return;
  const recNow = weakestArea(s, s.teamId);
  // only ask when it is worth a decision: the gap moved off what the factory is already on, and it has been a while
  if (!s.cards.some((c) => c.kind === "rndDirection") && plan.focus !== recNow && s.day - (plan.asked ?? -999) >= 84) {
    plan.asked = s.day;
    const rec = recNow;
    const advice = wantsAdvice(s);
    const mk = (id: Area | "balanced" | "bank", detail: string): CardOption => ({ id: `focus:${id}`, label: advice && id === rec ? `${focusLabel(id)} (engineers recommend)` : focusLabel(id), detail, lines: [id === "balanced" || id === "bank" ? FOCUS_TEXT[id] : `More ${AREA_LABEL[id as Area].toLowerCase()} ideas for four weeks, fewer everywhere else.`] });
    pushCard(s, "rndDirection", "Where should the factory put its effort?", `Four weeks of design time. ${advice ? `The engineers think ${AREA_LABEL[rec].toLowerCase()} is where the car is weakest, but they can be wrong.` : "Read the trait numbers on the Car screen to decide where it is weakest."} Stance is ${plan.stance}: ${STANCE_TEXT[plan.stance].toLowerCase()} (you can change it on the Car screen).`, [...(advice ? [mk(rec, "Where the staff see the biggest gap")] : []), mk("balanced", "No change"), mk("bank", "Hold back, save money"), ...AREAS.filter((a) => !advice || a !== rec).map((a) => mk(a, "Your call"))], { urgency: 2, deadline: s.day + 6, defaultOption: "focus:balanced" });
  }
  // the card offers every idea on the table (the same list as the Car screen), best first within each kind of bet
  const order = { safe: 0, gamble: 1, enabler: 2 } as const;
  const sorted = [...me.ideas].sort((a, b) => (order[a.kind ?? "safe"] ?? 0) - (order[b.kind ?? "safe"] ?? 0) || (b.predLo + b.predHi) / 2 - (a.predLo + a.predHi) / 2);
  const picks = sorted.slice(0, 8);
  const fresh = picks.some((i) => !(plan.offered ?? []).includes(i.id));
  if (picks.length && fresh && !s.cards.some((c) => c.kind === "ideaBatch")) {
    plan.offered = picks.map((i) => i.id);
    pushCard(s, "ideaBatch", "What should the factory build?", ideaBody(s, picks.length, sorted.length), [...ideaOptions(s, picks), { id: "none", label: "Not now", detail: "Every idea on the table is shelved for good" }], { urgency: 2, deadline: s.day + 6, defaultOption: "none", data: { offered: picks.map((i) => i.id).join(",") } });
  }
}

/** A delegated head of R&D reads some of the data (studies the loosest number) but does not commission work, pick leads or read the rulebook: that stays with a person. */
function delegatedEngineering(s: CareerState, me: TeamState, say: (m: string) => void) {
  if (me.tunnelLeft > 0.35 * me.tunnelTotal) {
    const loosest = [...TRAITS].sort((a, b) => me.know[b].err - me.know[a].err)[0];
    if (me.know[loosest].err > 0.1) {
      const r = study(s, s.teamId, loosest, 2);
      if (r.ok) say(`Your engineers ran a study on ${TRAIT_NAME[loosest].toLowerCase()}.`);
    }
  }
}

function summerBegin(s: CareerState) {
  eraSummer(s);
  summerDeals(s);
  summerPlayer(s);
}

/** The summer break for one person: the hub card and the contracts that need an answer. */
export function summerPlayer(s: CareerState) {
  const me = s.teams[s.teamId];
  pushCard(
    s,
    "summerHub",
    "Summer shutdown",
    `The factory is closed for 14 days. No design, building or wind tunnel work, as the rules require. Your engineers rest and rival teams talk to expiring drivers. Contracts can now be agreed with drivers whose deals end this year. How do you spend the break?`,
    [
      { id: "offsite", label: "Team offsite", detail: "Staff mood up, costs $0.6m" },
      { id: "holiday", label: "Drivers on holiday", detail: "Driver morale up" },
      { id: "admin", label: "Quiet break", detail: "Nothing changes" },
    ],
    { urgency: 2, deadline: summerEnd(s.year), defaultOption: "admin" },
  );
  const end = epochDay(s.year, 12, 1);
  for (const dr of driversOf(s, s.teamId)) {
    if (dr.endYear <= s.year) {
      pushCard(s, "contractExpiring", `${dr.spec.name}: contract ends this year`, `${dr.spec.name} is out of contract. He asks about ${fmtMoney(askingSalary(s, dr))} a year. Renew now at 5 percent over that for two years, or negotiate in the People screen. Rival teams are allowed to approach him from now on.`, [
        { id: "renew", label: "Renew now", detail: `${fmtMoney(askingSalary(s, dr) * 1.05)} for 2 years` },
        { id: "talk", label: "I will negotiate myself", detail: "Open the People screen" },
        ...(dr.optionYear && dr.optionYear > dr.endYear ? [{ id: "exercise", label: "Take up the team option", detail: `One more year at ${fmtMoney(dr.salary)}, no negotiation` }] : []),
        { id: "release", label: "Let him go at the end of the year" },
      ], { urgency: 2, deadline: end, defaultOption: "talk", data: { driverId: dr.id } });
    }
  }
  for (const st of Object.values(s.staff)) {
    if (st.teamId !== s.teamId) continue;
    if (st.endYear <= s.year) {
      pushCard(s, "staffExpiring", `${st.name}'s contract ends`, `${st.name} (${st.role}) is out of contract this year. Renewing costs about ${fmtMoney(staffAsk(st))} a year.`, [
        { id: "renew", label: "Renew for 2 years" },
        { id: "let", label: "Let them go" },
      ], { urgency: 1, deadline: end, defaultOption: "renew", data: { staffId: st.id } });
    }
  }
  void me;
}

function sponsorReviews(s: CareerState) {
  const me = s.teams[s.teamId];
  for (const sp of me.sponsors) {
    if (sp.endYear > s.year) continue;
    const price = round2(sp.retainer * (0.88 + sp.mood * 0.3));
    pushCard(s, "sponsorReview", `${sp.name} contract review`, `${sp.name} (${sp.objective.toLowerCase()}) mood: ${sp.mood > 0.65 ? "happy" : sp.mood > 0.45 ? "neutral" : "unhappy"}. They offer ${fmtMoney(price)} a year for two more seasons.`, [
      { id: "renew", label: "Renew", detail: fmtMoney(price) },
      { id: "drop", label: "Let them go" },
    ], { urgency: 2, deadline: epochDay(s.year, 12, 5), defaultOption: "renew", data: { sponsorId: sp.id } });
  }
}

function raceWeek(s: CareerState) {
  const race = s.calendar[s.round];
  if (!race || (s.weekend && s.weekend.stage !== "done")) return raceWeekPlayer(s);
  if (s.day === race.day - 3) {
    const dl = s.teams[s.teamId].delegation.parts;
    if (dl !== "advise") {
      const lines = delegatedParts(s);
      if (dl === "do") for (const l of lines) recap(s, l);
    }
    for (const id of Object.keys(s.teams)) {
      const fitted = fitParts(s, id);
      if (id === s.teamId && fitted.length) {
        recap(s, `Fitted: ${fitted.map((p) => p.name).join(", ")}.`);
        ticker(s, `${fitted.length} new part${fitted.length > 1 ? "s" : ""} fitted for the race.`, 2);
      }
    }
  }
  raceWeekPlayer(s);
}

/** Race week for one person: close an old weekend, open the new one. Parts are fitted for every team before this runs. */
export function raceWeekPlayer(s: CareerState, fittedHere?: string[]) {
  const race = s.calendar[s.round];
  if (s.weekend && s.weekend.stage === "done") {
    const done = s.calendar[s.weekend.round];
    if (done && s.day > done.day) s.weekend = null;
  } else if (s.weekend && s.weekend.stage !== "done") {
    const cur = s.calendar[s.weekend.round];
    if (cur && s.day > cur.day + 1) {
      simulateWeekend(s);
      recap(s, "The weekend ran without you.");
      s.weekend = null;
    }
  }
  if (!race || s.weekend) return;
  if (s.day === race.day - 2) {
    void fittedHere;
    s.weekend = startWeekend(s);
    s.stopReason = "race week";
    const sd = s.teams[s.teamId].delegation.setup;
    if (sd !== "advise") autoPractice(s, sd === "hands");
  }
}

/** The day of the weekend each stage belongs to: practice and sprint qualifying on Friday, the sprint and qualifying on Saturday, the race on Sunday. */
export function stageDay(raceDay: number, stage: WeekendState["stage"]): number {
  return stage === "practice" || stage === "sq" ? raceDay - 2 : stage === "sprint" || stage === "quali" ? raceDay - 1 : raceDay;
}

/** Let the calendar catch up with the weekend: the date moves on as the sessions are played, so Saturday really is Saturday. */
export function syncWeekendDay(s: CareerState) {
  const ws = s.weekend;
  if (!ws) return;
  const race = s.calendar[ws.round];
  if (!race) return;
  const want = stageDay(race.day, ws.stage);
  let guard = 0;
  while (s.day < want && guard++ < 5) advanceDay(s);
}

/** What happened to the shared world today, for the other humans' own passes. */
interface DayCtx {
  done: Record<string, Project[]>;
  facility: Record<string, string | null>;
  newSeason: boolean;
  endOfSeason: boolean;
}
let dayCtx: DayCtx = { done: {}, facility: {}, newSeason: false, endOfSeason: false };

export function advanceDay(s: CareerState): void {
  s.day += 1;
  dayCtx = { done: {}, facility: {}, newSeason: false, endOfSeason: false };
  const { y, m, d } = ymd(s.day);
  expireCards(s);
  if (y > s.year) {
    dayCtx.newSeason = true;
    newSeason(s);
  }
  if (d === 1) monthly(s, m);

  if (s.day === summerStart(s.year)) summerBegin(s);
  if (s.day === summerEnd(s.year) + 1) {
    resetAllowance(s);
    s.summerDone = true;
    recap(s, "The factory reopens. Wind tunnel allowances reset.");
    ticker(s, "Summer shutdown over. Factories reopen.", 2);
  }
  if (s.day === winterStart(s.year)) {
    recap(s, "Winter shutdown begins.");
    ticker(s, "Christmas shutdown: factories closed for two weeks.", 1);
  }
  if (m === 11 && d === 15) sponsorReviews(s);
  if (s.day === launchDay(s.year) && !closedYear(s)) {
    const me = s.teams[s.teamId];
    pushCard(s, "launch", `${s.year} car launch`, `The new car is on show. Early numbers say it is ${carFeel(s)}. You will know more after the test on ${ymdLabel(testDay(s.year))}.`, [{ id: "ok", label: "OK" }], { urgency: 2, deadline: s.day + 5 });
    void me;
  }
  if (s.day === testDay(s.year)) {
    // a good test day lifts the garage: people see the car running and the press has something to write
    for (const st of Object.values(s.staff)) if (st.teamId === s.teamId) st.mood = clamp(st.mood + 0.03 * Math.min(1.3, designQuality(s) + 0.4), 0, 1);
    addFact(s, "test", `${s.teamId.toUpperCase()} finished the pre-season test.`, [s.teamId], 1);
    eraStory(s);
    testDayCard(s);
  }

  if (!closedYear(s) && seasonTestDays(s).includes(s.day)) testDayCard(s, true);

  if (s.day % 7 === 2) weekly(s);
  if (!closedYear(s) && s.calendar[s.round] && s.calendar[s.round].day - s.day === 3) pressConference(s);
  eraDaily(s);
  tickTalks(s);

  for (const id of Object.keys(s.teams)) {
    const done = tickRnd(s, id);
    dayCtx.done[id] = done;
    if (id === s.teamId) projectCards(s, done);
    const f = tickFacility(s, id);
    dayCtx.facility[id] = f;
    if (f && id === s.teamId) facilityNotice(s, f);
  }
  storiesDaily(s);
  if (!closedYear(s)) raceWeek(s);
  if (seasonOver(s) && !closedYear(s) && !s.weekend && s.day >= s.calendar[s.calendar.length - 1].day + 2) { dayCtx.endOfSeason = true; endOfSeason(s); checkFired(s); }
  capWarning(s);
}

function projectCards(s: CareerState, done: Project[]) {
  for (const p of done) {
    ticker(s, `Project finished: ${p.name}.`, 2);
    recap(s, `Ready to fit: ${p.name}.`);
    logSpend(s, `Finished "${p.name}": used ${Math.round(p.tunnelUsed ?? 0)} tunnel hours in total`, { tunnel: 0 });
    pushCard(
      s,
      "projectReady",
      `Part ready: ${p.name}`,
      `Built and ready. Staff expect it to change your lap time by about ${fmtRange(p.predLo, p.predHi)} (minus is faster). Do you want it on the car at the next race, or held back? Held parts sit in the crate: the person who built it waits, and after two months rivals catch up and it is worth less.\nWhy hold one back: the staff's number is a guess, and a gamble can come in worse than predicted, even slower than your current part. A held part stays in the garage, and the next practice session can bench-test it (run a PART TEST) so you learn the real gain before it ever goes on the race car. Fit what tests well and scrap what does not. The cost of holding is that the car does not get faster until you release it.`,
      [
        { id: "fit", label: "Fit it at the next race", detail: p.kind === "gamble" ? "Risky: a gamble can underdeliver" : "Recommended" },
        { id: "hold", label: "Hold it back to test it", detail: "Test it in the next practice before fitting" },
      ],
      { urgency: 2, deadline: s.day + 6, defaultOption: "fit", data: { projectId: p.id } },
    );
  }
}

function facilityNotice(s: CareerState, f: string) {
  recap(s, `${f} upgrade complete.`);
  ticker(s, `Facility upgrade finished: ${f}.`, 2);
}

function capWarning(s: CareerState) {
  const me = s.teams[s.teamId];
  if (capRoom(me) < 0 && !s.cards.some((c) => c.kind === "capWarning") && !me.breached && !s.recap.includes("capwarn")) {
    me.breached = false;
    if (!closedYear(s)) {
      pushCard(s, "capWarning", "You are over the cost cap", `Projects have used more than your cap room. Going over means a fine, a smaller cap next year and a hit to the board's trust. Scrap or finish projects to get back under.`, [{ id: "ok", label: "Understood" }], { urgency: 3, deadline: s.day + 20 });
    }
  }
}

/**
 * The day for every human after the first, in a multiplayer league. The shared world has already moved
 * (advanceDay ran for the first human), so this only does the work that belongs to this person's team.
 */
export function playerDay(s: CareerState): void {
  const { m, d } = ymd(s.day);
  expireCards(s);
  if (dayCtx.newSeason) newSeasonPlayer(s);
  if (d === 1) {
    academyMonth(s, m, true);
    monthlyPlayer(s);
  }
  if (s.day === summerStart(s.year)) summerPlayer(s);
  if (s.day === summerEnd(s.year) + 1) recap(s, "The factory reopens. Wind tunnel allowances reset.");
  if (s.day === winterStart(s.year)) recap(s, "Winter shutdown begins.");
  if (m === 11 && d === 15) sponsorReviews(s);
  if (s.day === launchDay(s.year) && !closedYear(s)) {
    pushCard(s, "launch", `${s.year} car launch`, `The new car is on show. Early numbers say it is ${carFeel(s)}. You will know more after the test on ${ymdLabel(testDay(s.year))}.`, [{ id: "ok", label: "OK" }], { urgency: 2, deadline: s.day + 5 });
  }
  if (s.day === testDay(s.year)) {
    eraStoryCard(s);
    testDayCard(s);
  }
  if (s.day % 7 === 2 && !closedYear(s)) {
    weeklyPeople(s, s.teamId);
    fadeSlights(s);
    weeklyReach(s);
    weeklyPlayer(s, false);
  }
  if (!closedYear(s) && s.calendar[s.round] && s.calendar[s.round].day - s.day === 3) pressConference(s);
  projectCards(s, dayCtx.done[s.teamId] ?? []);
  const f = dayCtx.facility[s.teamId];
  if (f) facilityNotice(s, f);
  storiesDaily(s);
  if (!closedYear(s)) raceWeekPlayer(s);
  if (dayCtx.endOfSeason) {
    const last = s.history[s.history.length - 1];
    const ranks = standingsRank(s);
    yearEndPlayer(s, last?.champion ?? "?", last?.championTeam ?? null, ranks, ranks.indexOf(s.teamId) + 1, []);
  }
  capWarning(s);
}

const ymdLabel = (day: number) => {
  const { m, d } = ymd(day);
  return `${d}/${m}`;
};

function carFeel(s: CareerState): string {
  const idx = noisyRanking(s, "feel", 0.35).indexOf(s.teamId);
  const believed = idx <= 2 ? "looking quick" : idx <= 6 ? "a midfield car on paper" : "on the back foot";
  void carRating;
  return believed;
}

/** Why the clock should stop on the day that just began. */
export function stopNow(s: CareerState, before: number): string | null {
  if (s.weekend && s.weekend.stage !== "done") return "Race week";
  for (const c of s.cards) {
    if (c.notice && c.urgency < 3) continue;
    if (c.id > before && c.urgency >= 2) return c.title;
    if (c.deadline !== undefined && c.deadline <= s.day + 1 && c.urgency >= 2 && c.options.length > 1 && !c.warned) {
      c.warned = true;
      return `Last chance: ${c.title}`;
    }
  }
  return null;
}

/** One day for the animated clock: returns why it should stop, or "" to keep going. */
export function stepDay(s: CareerState, first: boolean): string {
  if (s.weekend && s.weekend.stage !== "done") return "Finish the race weekend first.";
  if (s.fired) return "Choose where to go next.";
  if (first) {
    s.recap = [];
    s.stopReason = "";
  }
  const before = s.uid;
  advanceDay(s);
  const why = stopNow(s, before);
  if (why) s.stopReason = why;
  return why ?? "";
}

/** Advance days until something needs the player. Quiet days collapse. */
export function continueClock(s: CareerState, single = false): string {
  if (s.weekend && s.weekend.stage !== "done") return "Finish the race weekend first.";
  if (s.fired) return "Choose where to go next.";
  s.recap = [];
  s.stopReason = "";
  const startDay = s.day;
  for (let i = 0; i < 400; i++) {
    const before = s.uid;
    advanceDay(s);
    if (single) return "";
    const why = stopNow(s, before);
    if (why) {
      s.stopReason = why;
      return why;
    }
    if (s.day - startDay > 120) break;
  }
  return "";
}

export { scrapProject, startFacility, hireStaff, signDriver, staffOf, standingsRank };
