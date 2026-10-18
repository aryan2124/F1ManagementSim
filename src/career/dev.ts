import { addFact } from "./facts";
import { correct, testLearn } from "./know";
import { nextCarReport } from "./nextcar";
import { multiply } from "./factors";
import { news, pushCard, recap, sendLetter } from "./cards";
import { teamPost } from "./social";
import { AREAS, AREA_LABEL, TRAITS, type Area, type CareerState, type DevEntry, type DevReact, type DevRec, type DevState, type Idea, type Project, type Staff, type TeamState } from "./types";
import { clamp, fmtMoney, isHuman, rngFor, round2 } from "./util";

/**
 * The development record. Every call the manager makes about the car (back an idea, overrule a pitch, scrap, hold,
 * fit, test) is written down against the person whose idea it was. People remember. Nothing here touches the car
 * or a race result: it moves mood, standing, who stays, and what the world says.
 */

const blank = (): DevRec => ({ backed: 0, overruled: 0, scrapped: 0, landed: 0, missed: 0, heard: 0 });

export function devOf(t: TeamState): DevState {
  return (t.dev ??= { rec: {}, log: [], landed: 0, missed: 0 });
}
export const recOf = (t: TeamState, id: string): DevRec => (devOf(t).rec[id] ??= blank());

export function devNote(s: CareerState, t: TeamState, e: Omit<DevEntry, "day">) {
  const d = devOf(t);
  d.log.push({ day: s.day, ...e });
  if (d.log.length > 120) d.log.splice(0, d.log.length - 120);
}

/** A note from someone in the building lands in the Inbox. It never stops the clock. */
function note(s: CareerState, st: Staff | undefined, subject: string, body: string) {
  const chief = st ?? Object.values(s.staff).filter((x) => x.teamId === s.teamId && !x.intern && (x.role === "td" || x.role === "designer")).sort((a, b) => b.skill - a.skill)[0];
  sendLetter(s, { from: chief?.name ?? "The factory", role: chief?.role ?? "staff", subject, body });
}

const has = (st: Staff, tr: string) => st.traits.includes(tr);

/** How hard a setback lands on this person. */
export function thinSkin(st: Staff): number {
  let k = 1;
  if (has(st, "hothead")) k *= 1.45;
  if (has(st, "perfectionist")) k *= 1.3;
  if (has(st, "loyal")) k *= 0.7;
  if (has(st, "veteran")) k *= 0.8;
  if (has(st, "pragmatic")) k *= 0.85;
  if (st.intern) k *= 1.3;
  return k;
}

/** What the person's face does when their idea is binned. */
export function scrapReact(st: Staff): DevReact {
  if (st.intern) return "pale";
  if (has(st, "hothead")) return "fume";
  if (has(st, "perfectionist")) return "stung";
  if (has(st, "veteran") || has(st, "pragmatic") || has(st, "cautious")) return "nod";
  if (has(st, "motivator")) return "shrug";
  return "sulk";
}

const bump = (st: Staff, by: number) => { st.mood = round2(clamp(st.mood + by, 0, 1)); };
const mine = (s: CareerState, teamId: string) => isHuman(s, teamId);

/** An idea is backed and goes to the factory. */
export function onBacked(s: CareerState, teamId: string, p: Project) {
  if (!mine(s, teamId) || !p.lead) return;
  const t = s.teams[teamId];
  const st = s.staff[p.lead];
  if (!st) return;
  recOf(t, st.id).backed++;
  bump(st, p.rookie ? 0.1 : 0.04);
  devNote(s, t, { kind: "backed", text: `${st.name}'s "${p.name}" got the go-ahead.`, staffId: st.id, projectId: p.id, react: p.rookie ? "grin" : "proud" });
}

/** The pitches that were on the table when one (or none) was picked. Whoever lost the argument remembers. */
export function onBatchDecided(s: CareerState, teamId: string, offered: number[], chosenId: number | null) {
  if (!mine(s, teamId)) return;
  const t = s.teams[teamId];
  const seen = new Set<string>();
  for (const id of offered) {
    if (id === chosenId) continue;
    const idea = t.ideas.find((i) => i.id === id);
    const st = idea?.lead ? s.staff[idea.lead] : undefined;
    if (!idea || !st || seen.has(st.id)) continue;
    seen.add(st.id);
    // somebody else's pitch won: that is an argument lost, which stings more when you did not win anything at all
    const r = recOf(t, st.id);
    r.overruled++;
    bump(st, -0.025 * thinSkin(st) * (1 + 0.2 * Math.min(4, r.overruled - 1)) * (chosenId === null ? 0.6 : 1));
    if (r.overruled === 3 || r.overruled === 6) devNote(s, t, { kind: "overruled", text: `${st.name} has now been overruled ${r.overruled} times.`, staffId: st.id, react: scrapReact(st) });
  }
}

/** A project is thrown away. The author is in the room. */
export function onScrap(s: CareerState, teamId: string, p: Project) {
  if (!mine(s, teamId)) return;
  const t = s.teams[teamId];
  const st = p.lead ? s.staff[p.lead] : undefined;
  const frac = clamp(p.status === "ready" ? 1 : p.progress / Math.max(1, p.days), 0, 1);
  const d = devOf(t);
  (d.scrapped ??= []).push({ name: p.name, area: p.area, gain: p.trueGain, day: s.day, staffId: st?.id });
  if (!st) { devNote(s, t, { kind: "scrapped", text: `"${p.name}" was scrapped.`, projectId: p.id }); return; }
  const r = recOf(t, st.id);
  r.scrapped++;
  const hit = (0.03 + 0.12 * frac) * thinSkin(st) * (1 + 0.15 * Math.min(4, r.scrapped - 1));
  bump(st, -hit);
  const react = scrapReact(st);
  devNote(s, t, { kind: "scrapped", text: `"${p.name}" was scrapped${frac > 0.6 ? " late" : ""}. ${st.name} ${react === "fume" ? "stormed out of the room" : react === "stung" ? "went very quiet" : react === "pale" ? "went pale" : react === "nod" ? "nodded and went back to work" : react === "shrug" ? "shrugged it off" : "took it badly"}.`, staffId: st.id, projectId: p.id, react });
  // a trainee takes it hardest, and the department notices when it is the third time
  if (st.intern) st.known = clamp(st.known, 0, 1);
  if (r.scrapped >= 3) devNote(s, t, { kind: "overruled", text: `${st.name} has had ${r.scrapped} projects scrapped. He is asking himself whether this is the place for him.`, staffId: st.id, react });
}

/** A finished part goes into the crate. */
export function onHold(s: CareerState, teamId: string, p: Project, held: boolean) {
  if (!mine(s, teamId)) return;
  const t = s.teams[teamId];
  const st = p.lead ? s.staff[p.lead] : undefined;
  if (held) {
    p.heldSince = s.day;
    devNote(s, t, { kind: "held", text: `"${p.name}" is in the crate.`, staffId: st?.id, projectId: p.id, react: st ? (has(st, "hothead") ? "fume" : has(st, "perfectionist") ? "stung" : "shrug") : undefined });
  } else {
    p.heldSince = undefined;
  }
}

/** Fitted: the money leaves, the author stands by the car. */
export function onFit(s: CareerState, teamId: string, p: Project) {
  if (!mine(s, teamId)) return;
  const t = s.teams[teamId];
  const st = p.lead ? s.staff[p.lead] : undefined;
  devNote(s, t, { kind: "fitted", text: `"${p.name}" went on the car.`, staffId: st?.id, projectId: p.id, react: "proud" });
}

/** The first race with a part on: the truth comes out. */
export function onLanding(s: CareerState, teamId: string, p: Project) {
  if (!mine(s, teamId)) return;
  const t = s.teams[teamId];
  const mid = (p.predLo + p.predHi) / 2;
  if (mid < 0.01) return;
  const ratio = p.trueGain / mid;
  const st = p.lead ? s.staff[p.lead] : undefined;
  const d = devOf(t);
  if (ratio >= 0.85) {
    d.landed++;
    if (st) {
      const r = recOf(t, st.id);
      r.landed++;
      bump(st, p.rookie ? 0.14 : 0.06);
      devNote(s, t, { kind: "landed", text: `"${p.name}" delivered what ${st.name} said it would.`, staffId: st.id, projectId: p.id, react: "grin" });
      note(s, st, `${p.name}: it worked`, `The numbers from the track are in. "${p.name}" gave what I told you it would, about ${(p.trueGain).toFixed(2)} s a lap. The garage noticed.\n\n${st.name}`);
      if (p.rookie && st.intern) {
        // the project is real work: it teaches the trainee, a little, never more than his own potential
        const gap = Math.max(0, st.intern.potential - st.skill);
        st.skill = round2(st.skill + Math.min(gap, 1.5 + 2 * ratio));
        st.known = clamp(st.known + 0.2, 0, 1);
        news(s, `${st.name}'s first design works. The garage has noticed the trainee.`, { importance: 2, tag: "people" });
        teamPost(s, `${st.name} is a trainee. Remember the name.`, 0.7);
        note(s, undefined, `${st.name} made a part that works`, `${st.name} is still a trainee and the part he pitched delivered. You can offer him a proper job from the People screen when you are ready, if he would beat the person in the seat.`);
      }
    }
    if (p.trueGain > 0.12) teamPost(s, `The new ${AREA_LABEL[p.area].toLowerCase()} package works. The factory delivered.`, 0.6);
  } else if (ratio < 0.5) {
    d.missed++;
    if (st) {
      const r = recOf(t, st.id);
      r.missed++;
      bump(st, -0.05 * thinSkin(st));
      devNote(s, t, { kind: "missed", text: `"${p.name}" fell well short of what ${st.name} promised.`, staffId: st.id, projectId: p.id, react: scrapReact(st) });
      note(s, st, `${p.name}: short of the number`, `I have gone through the data from the weekend. "${p.name}" gave far less than I told you it would. I would rather you heard it from me.\n\n${st.name}`);
      if (p.rookie) news(s, `${st.name}'s first part fell short. He is quiet this week.`, { importance: 1, tag: "people" });
    }
    if (p.size !== "S") teamPost(s, `The upgrade did not do what it should have.`, -0.5);
  }
  // an idea scrapped earlier that turns out to be what this one was, and better, is a regret
  const old = (d.scrapped ?? []).find((x) => x.area === p.area && x.gain > p.trueGain + 0.05 && s.day - x.day < 270);
  if (old) {
    devNote(s, t, { kind: "regret", text: `"${old.name}", which you scrapped, would have beaten "${p.name}".`, staffId: old.staffId });
    d.scrapped = (d.scrapped ?? []).filter((x) => x !== old);
  }
}

/** The result of a track test, folded with any earlier ones. */
export function bestEstimate(p: Project): { est: number; sd: number } | undefined {
  const runs = p.testRuns ?? [];
  if (!runs.length) return undefined;
  let w = 0;
  let a = 0;
  for (const r of runs) { const k = 1 / (r.sd * r.sd); w += k; a += r.est * k; }
  return { est: round2(a / w), sd: round2(Math.sqrt(1 / w)) };
}

export const TEST_PLANS = {
  quick: { label: "Quick comparison", cost: 0.1, sd: 0.1, says: "A few laps with and without. Cheap and noisy." },
  compare: { label: "Back to back", cost: 0.3, sd: 0.055, says: "Old part, new part, same fuel, same tyres, same driver." },
  longrun: { label: "Long run", cost: 0.6, sd: 0.03, says: "A full stint to see it settle. Costs a day of the garage." },
} as const;

/** Run a test on a built part. Costs cash, uses the garage, and tightens what the engineers believe. */
export function testPart(s: CareerState, teamId: string, id: number, plan: keyof typeof TEST_PLANS): { ok: boolean; message: string; est?: number; sd?: number } {
  const t = s.teams[teamId];
  const p = t.projects.find((x) => x.id === id);
  if (!p || (p.status !== "ready" && p.status !== "building")) return { ok: false, message: "Nothing to test." };
  if (p.status === "building" && p.progress < p.days * 0.6) return { ok: false, message: "It is not far enough along to run." };
  const cfg = TEST_PLANS[plan];
  if ((p.testRuns ?? []).some((r) => r.plan === plan)) return { ok: false, message: "You already ran that plan on this part." };
  if (t.cash < cfg.cost) return { ok: false, message: `You cannot afford it (${fmtMoney(cfg.cost)}).` };
  const q = multiply(s, teamId, ["tools", "knowledge", "talent"]).value;
  const sd = round2(cfg.sd / Math.sqrt(clamp(q, 0.6, 1.6)));
  const est = round2(p.trueGain + rngFor(s, `test:${p.id}:${plan}`).gauss() * sd);
  t.cash = round2(t.cash - cfg.cost);
  (p.testRuns ??= []).push({ plan, est, sd, day: s.day });
  const st = p.lead ? s.staff[p.lead] : undefined;
  devNote(s, t, { kind: "tested", text: `${cfg.label} on "${p.name}": about ${est.toFixed(2)} s a lap, give or take ${sd.toFixed(2)}.`, staffId: st?.id, projectId: p.id });
  return { ok: true, message: `${cfg.label}: about ${est.toFixed(2)} s a lap (give or take ${sd.toFixed(2)}).`, est, sd };
}

/** The weekly pulse: patience in the crate, rookie pitches, notices, the crisis arc. */
export function devWeekly(s: CareerState) {
  const t = s.teams[s.teamId];
  const d = devOf(t);
  // parts in the crate: the author waits, and the field catches up
  for (const p of t.projects) {
    if (p.status !== "ready" || !p.hold || p.heldSince === undefined) continue;
    const st = p.lead ? s.staff[p.lead] : undefined;
    if (st) bump(st, -0.008 * thinSkin(st));
    if (!p.stale && s.day - p.heldSince > 60) {
      p.stale = true;
      p.trueGain = round2(p.trueGain * 0.88);
      devNote(s, t, { kind: "stale", text: `"${p.name}" has sat in the crate for two months. Rivals have found similar gains, so it is worth less now.`, staffId: st?.id, projectId: p.id, react: st ? "sulk" : undefined });
      news(s, `"${p.name}" has been in the crate too long and has lost some of its edge.`, { importance: 1, tag: "people" });
    }
  }
  // notices: somebody overruled and scrapped one time too many
  const live = s.cards.some((c) => c.kind === "staffNotice");
  if (!live) {
    for (const st of Object.values(s.staff)) {
      if (st.teamId !== s.teamId || st.intern || st.driverId) continue;
      const r = d.rec[st.id];
      if (!r || r.overruled + r.scrapped < 3 || st.mood > 0.3) continue;
      if (s.day - (d.noticeDay?.[st.id] ?? -999) < 150) continue;
      if (rngFor(s, `notice:${st.id}:${s.day}`).next() > 0.35) continue;
      pushCard(s, "staffNotice", `${st.name} wants a word`, `${st.name} (${st.role}) has been overruled ${r.overruled} times and had ${r.scrapped} projects scrapped. He is standing in your doorway with a letter in his hand.`, [
        { id: "counter", label: "Counter-offer", detail: "A 15 percent raise. Pride is soothed, the budget is not.", lines: ["Mood recovers a good way", "Costs about 15 percent more in wages"] },
        { id: "listen", label: "Sit down and listen", detail: "Give him a real say on the next pitch.", lines: ["Mood recovers a little", "He will expect to be backed next time"] },
        { id: "go", label: "Let him go", detail: "A rival will have him by the summer.", lines: ["He leaves and takes what he knows", "Everyone in the room watches how you handle it"], warn: "Staff who leave carry knowledge of your direction." },
      ], { urgency: 3, deadline: s.day + 7, defaultOption: "listen", data: { staffId: st.id } });
      (d.noticeDay ??= {})[st.id] = s.day;
      break;
    }
  }
  // a development crisis: only from a real run of overruling and misses
  const overrules = Object.values(d.rec).reduce((n, r) => n + r.overruled + r.scrapped, 0);
  if (!d.crisis && overrules >= 6 && d.missed >= 2 && !s.cards.some((c) => c.kind === "devCrisis")) {
    d.crisis = { stage: 1, since: s.day };
    const des = Object.values(s.staff).find((x) => x.teamId === s.teamId && (x.role === "designer" || x.role === "td"));
    pushCard(s, "devCrisis", "The drawing office is split", `${des?.name ?? "Your chief designer"} asks for a meeting. Pitches have been overruled ${overrules} times and ${d.missed} parts have missed. Two camps have formed at the drawing boards and they have stopped sharing work.`, [
      { id: "all", label: "Call everyone in", detail: "Own the decisions in front of the whole office.", lines: ["Tension eases a good way", "The board hears you took the blame"] },
      { id: "back", label: "Back your people for a month", detail: "Let them choose the next batch themselves.", lines: ["Staff regain some trust", "Your say is worth less for a month"] },
      { id: "hard", label: "Hold the line", detail: "You made the calls and you stand by them.", lines: ["The split deepens", "Some will look for the door"], warn: "Idea production may slow." },
    ], { urgency: 3, deadline: s.day + 7, defaultOption: "all" });
  }
  if (d.crisis && d.crisis.stage === 2 && s.day - d.crisis.since > 35) {
    d.crisis.stage = 3;
    d.slowUntil = Math.max(d.slowUntil ?? 0, s.day + 42);
    devNote(s, t, { kind: "crisis", text: "The split cost the factory six weeks of ideas." });
    news(s, "Whispers from the factory: development has stalled while the designers argue.", { importance: 2, tag: "people" });
  }
  if (d.crisis && s.day - d.crisis.since > 150) d.crisis = undefined;
}

export function resolveNotice(s: CareerState, c: { data?: Record<string, number | string | boolean> }, option: string) {
  const st = s.staff[String(c.data?.staffId)];
  if (!st || st.teamId !== s.teamId) return;
  const t = s.teams[s.teamId];
  const r = recOf(t, st.id);
  if (option === "counter") {
    st.salary = round2(st.salary * 1.15);
    st.mood = round2(clamp(0.6, 0, 1));
    r.overruled = Math.max(0, r.overruled - 2);
    r.scrapped = Math.max(0, r.scrapped - 1);
    recap(s, `${st.name} stayed after a raise.`);
    devNote(s, t, { kind: "notice", text: `${st.name} handed in a letter and took the raise instead.`, staffId: st.id, react: "nod" });
  } else if (option === "listen") {
    st.mood = round2(clamp(st.mood + 0.18, 0, 1));
    r.heard++;
    r.overruled = Math.max(0, r.overruled - 2);
    r.scrapped = Math.max(0, r.scrapped - 1);
    recap(s, `${st.name} was heard. He will expect a say next time.`);
    devNote(s, t, { kind: "notice", text: `You sat down with ${st.name}. He stayed.`, staffId: st.id, react: "nod" });
  } else {
    st.teamId = null;
    s.freeStaff.push(st.id);
    for (const o of Object.values(s.staff)) if (o.teamId === s.teamId && o.id !== st.id) bump(o, -0.04);
    addFact(s, "staffLeft", `${st.name} left ${s.teamId.toUpperCase()} after being overruled.`, [st.id, s.teamId], 2);
    news(s, `${st.name} has left ${s.teamId.toUpperCase()}. Colleagues say he felt unheard.`, { importance: 2, tag: "people" });
    devNote(s, t, { kind: "notice", text: `${st.name} left.`, staffId: st.id, react: "sulk" });
  }
}

export function resolveCrisis(s: CareerState, option: string) {
  const t = s.teams[s.teamId];
  const d = devOf(t);
  const all = Object.values(s.staff).filter((x) => x.teamId === s.teamId && !x.driverId);
  if (option === "all") {
    for (const x of all) bump(x, 0.07);
    s.teams[s.teamId].board = clamp(s.teams[s.teamId].board - 1, 0, 100);
    for (const r of Object.values(d.rec)) { r.overruled = Math.max(0, r.overruled - 2); r.scrapped = Math.max(0, r.scrapped - 1); }
    d.crisis = undefined;
    devNote(s, t, { kind: "crisis", text: "You owned it in front of the whole office. The tension eased." });
  } else if (option === "back") {
    for (const x of all) bump(x, 0.04);
    for (const r of Object.values(d.rec)) r.heard++;
    d.crisis = { stage: 2, since: s.day };
    devNote(s, t, { kind: "crisis", text: "You let the designers pick the next batch themselves." });
  } else {
    for (const x of all) bump(x, -0.05);
    d.crisis = { stage: 2, since: s.day };
    devNote(s, t, { kind: "crisis", text: "You held the line. The camps dug in." });
  }
}

/** Does this team have a trainee worth a pitch? A rookie's own idea, in the area he is best at. Rare, and a gamble. */
export function rookieCandidate(s: CareerState, teamId: string): { st: Staff; area: Area } | undefined {
  const t = s.teams[teamId];
  if ((t.dev?.slowUntil ?? 0) > s.day) return undefined;
  if (t.ideas.some((i) => i.rookie)) return undefined;
  const pool = Object.values(s.staff).filter((x) => x.teamId === teamId && x.intern && (x.role === "designer" || x.role === "aero" || x.role === "power" || x.role === "engineer" || x.role === "data" || x.role === "td"));
  if (!pool.length) return undefined;
  const rng = rngFor(s, `rookie:${teamId}:${s.day}`);
  const f = multiply(s, teamId, ["tools", "cohesion", "knowledge"]).value;
  for (const st of pool) {
    const mentor = Object.values(s.staff).find((x) => x.teamId === teamId && x.role === st.role && !x.intern);
    const p = clamp(0.03 + (st.intern!.potential - 50) / 900 + ((mentor?.skill ?? 55) - 55) / 1500, 0.01, 0.12) * f;
    if (rng.next() > p) continue;
    let area: Area = "aero";
    let best = -1;
    for (const a of AREAS) { const v = st.spec?.[a] ?? 0.5; if (v > best) { best = v; area = a; } }
    return { st, area };
  }
  return undefined;
}

/** Who is speaking for an idea, and what they say. Voiced from their own traits, never random. */
export function pitchLine(s: CareerState, i: Idea): { who?: Staff; line: string; record: string } {
  const t = s.teams[s.teamId];
  const who = i.lead ? s.staff[i.lead] : undefined;
  const area = AREA_LABEL[i.area].toLowerCase();
  const r = who ? t.dev?.rec[who.id] : undefined;
  const done = r ? r.landed + r.missed : 0;
  const record = who ? (done ? `${r!.landed} of his last ${done} parts landed.` : who.intern ? "A trainee. No record yet." : "No record with you yet.") : "";
  if (!who) return { line: `The factory thinks there is something in ${area}.`, record };
  const sz = i.size === "L" ? "A big one" : i.size === "M" ? "A solid step" : "A small, clean job";
  let line: string;
  if (i.lab) line = has(who, "data-driven") ? `This comes straight from your own lab run. The instrument says it is there, and I have checked the correlation. The track still has the last word.` : `You took this shape to the lab yourself. I read the numbers and I think a part can be made of it. We will not know until it runs.`;
  else if (i.rookie) line = `I know I am only the trainee. I have been drawing this at night: ${area}. Give me a chance and I will not waste it.`;
  else if (i.kind === "gamble") line = has(who, "innovator") ? `This is the one I want. It might not work, and if it does, nobody has it. ${area}. ${sz}.` : has(who, "cautious") ? `I am not comfortable with how wide the range is, but ${area} is where the gap is. Your call.` : `It is a swing. ${area}. ${sz}, wide range.`;
  else if (i.kind === "enabler") line = `It will not make us quicker on its own. It makes the next ${area} part better. ${has(who, "pragmatic") ? "Worth it." : "Think of it as groundwork."}`;
  else line = has(who, "perfectionist") ? `Small, and I have checked it twice. ${area}.` : has(who, "hothead") ? `Stop dithering and build it. ${area}. It works.` : has(who, "data-driven") ? `The numbers point at ${area}. ${sz}.` : has(who, "veteran") ? `I have seen this before. ${area} is where we gain. ${sz}.` : `${sz} in ${area}. I think it is the right one.`;
  return { who, line, record };
}


/** The pre-season test: a few days of running, and you choose what the programme is for. */
export function testDayCard(s: CareerState, inSeason = false) {
  if (s.cards.some((c) => c.kind === "testDay")) return;
  const t = s.teams[s.teamId];
  if (inSeason) return seasonTestCard(s);
  const trainees = Object.values(s.staff).filter((x) => x.teamId === s.teamId && x.intern);
  const options = [
    { id: "mileage", label: "Bank mileage", detail: "Long runs, steady laps, a team that comes home happy.", lines: ["The engineers learn a fair amount about the car", "Everyone in the garage is a little happier"] },
    { id: "mapping", label: "Aero mapping runs", detail: "Rake sweeps and wing changes. The most you can learn, and it costs.", lines: ["The engineers learn the most about the car", "Costs about $0.3m in tyres and fuel"] },
    { id: "race", label: "Race simulation", detail: "Stints, stops and starts, the way a Sunday will go.", lines: ["A fair amount learned", "Drivers go in more confident"] },
    ...(trainees.length ? [{ id: "trainees", label: "Give the trainees laps in the garage", detail: `${trainees.map((x) => x.name.split(" ").slice(-1)[0]).join(" and ")} get real hours on the data.`, lines: ["Trainees learn faster this month", "A little less learned about the car"] }] : []),
    { id: "show", label: "Show the car to the press and sponsors", detail: "Short runs, lots of cameras.", lines: ["A little learned", "The paddock talks about you, fans like it"] },
  ];
  pushCard(s, "testDay", "Pre-season test: what is the programme for?", `Three days of running. The track is open and the garage is full of people waiting for you to say what the days are for. ${t.cash < 0.5 ? "Cash is tight, so mapping runs would hurt." : ""}`, options, { urgency: 2, deadline: s.day + 2, defaultOption: "mileage" });
}

/** The two mid-season test days: short, targeted, and they cost something. Days off the race calendar. */
export function seasonTestDays(s: CareerState): number[] {
  const out: number[] = [];
  const n = s.calendar.length;
  for (const frac of [1 / 3, 2 / 3]) {
    const i = Math.max(0, Math.min(n - 2, Math.floor(n * frac) - 1));
    const r = s.calendar[i], nx = s.calendar[i + 1];
    if (r && nx && nx.day - (r.day + 2) >= 5) out.push(r.day + 2);
  }
  return out;
}

function testablePart(t: TeamState): Project | undefined {
  return [...t.projects].reverse().find((p) => (p.status === "ready" || (p.status === "building" && p.progress >= p.days * 0.6)) && !(p.testRuns ?? []).some((r) => r.plan === "compare"));
}

function seasonTestCard(s: CareerState) {
  const t = s.teams[s.teamId];
  const trainees = Object.values(s.staff).filter((x) => x.teamId === s.teamId && x.intern);
  const part = testablePart(t);
  const options = [
    { id: "tyres", label: "Tyre test", detail: "A day of compounds and temperatures on a closed track.", lines: ["Tyre wear, warm-up and grip become clearer", "Costs about $0.15m"] },
    { id: "correlate", label: "Correlate the simulator", detail: "Run what the sim says and see how far off it is.", lines: ["The two areas you know least about get sharper", "Costs about $0.2m"] },
    ...(part ? [{ id: "parts", label: `Run "${part.name}" on track`, detail: "A proper back-to-back against the old part.", lines: ["A real number on that part before you commit", "Costs what a part test costs"] }] : []),
    ...(trainees.length ? [{ id: "young", label: "Young engineer day", detail: `${trainees.map((x) => x.name.split(" ").slice(-1)[0]).join(" and ")} run the day.`, lines: ["Trainees learn quickly", "A little learned about the car"] }] : []),
    { id: "rest", label: "Rest the garage", detail: "Run only the minimum. Everyone goes home on time.", lines: ["Nothing learned", "The whole garage is happier, and it costs nothing"] },
  ];
  pushCard(s, "testDay", "Test day: what is it for?", "One day on a closed track between two race weekends. The crew is ready and the team wants to know what you are after.", options, { urgency: 2, deadline: s.day + 2, defaultOption: "rest", data: { season: 1 } });
}

function resolveSeasonTest(s: CareerState, option: string) {
  const t = s.teams[s.teamId];
  const spend = (m: number) => { t.cash = round2(t.cash - m); t.ledger.rnd = round2(t.ledger.rnd + m); };
  let said = "";
  if (option === "tyres") {
    spend(0.15);
    for (const tr of ["wear", "warmup", "grip"] as const) correct(t, tr, 0.55);
    said = "Tyre test: wear, warm-up and grip are better understood. $0.15m spent.";
  } else if (option === "correlate") {
    spend(0.2);
    const worst = [...TRAITS].sort((a, b) => t.know[b].err - t.know[a].err).slice(0, 2);
    for (const tr of worst) correct(t, tr, 0.65);
    said = `Simulator correlation: ${worst.join(" and ")} are better understood. $0.2m spent.`;
  } else if (option === "parts") {
    const part = testablePart(t);
    const r = part ? testPart(s, s.teamId, part.id, "compare") : { ok: false, message: "Nothing to run." };
    said = r.ok ? `Back-to-back on "${part!.name}": ${r.message}` : r.message;
  } else if (option === "young") {
    for (const st of Object.values(s.staff)) if (st.teamId === s.teamId && st.intern) st.skill = round2(st.skill + Math.min(0.8, Math.max(0, st.intern.potential - st.skill)));
    testLearn(t, 0.15);
    said = "The young engineers ran the day and learned a lot.";
  } else {
    for (const st of Object.values(s.staff)) if (st.teamId === s.teamId) st.mood = clamp(st.mood + 0.03, 0, 1);
    said = "A quiet day. Everyone was glad of it.";
  }
  recap(s, said);
  devNote(s, t, { kind: "tested", text: `Test day: ${said}` });
  note(s, undefined, "Test day report", `${said}\n\nYour estimates have moved. The Car screen shows the new picture.`);
}

export function resolveTestDay(s: CareerState, option: string, season = false) {
  if (season) return resolveSeasonTest(s, option);
  const t = s.teams[s.teamId];
  let learn = 0.5;
  let said = "";
  if (option === "mapping") {
    learn = 0.8;
    t.cash = round2(t.cash - 0.3);
    t.ledger.rnd = round2(t.ledger.rnd + 0.3);
    said = "Aero mapping: the most learned, $0.3m spent.";
  } else if (option === "race") {
    learn = 0.5;
    for (const d of Object.values(s.drivers)) if (d.teamId === s.teamId) d.morale = clamp(d.morale + 0.03, 0, 1);
    said = "Race simulation: the drivers feel ready.";
  } else if (option === "trainees") {
    learn = 0.35;
    for (const st of Object.values(s.staff)) if (st.teamId === s.teamId && st.intern) st.skill = round2(st.skill + Math.min(1.2, Math.max(0, st.intern.potential - st.skill)));
    said = "The trainees spent three days on the data and learned a lot.";
  } else if (option === "show") {
    learn = 0.3;
    s.story.tone = clamp(s.story.tone + 0.05, -1, 1);
    s.brand.fans = clamp(s.brand.fans + 1, 0, 100);
    said = "The paddock noticed. Fans liked the cameras.";
  } else {
    for (const st of Object.values(s.staff)) if (st.teamId === s.teamId) st.mood = clamp(st.mood + 0.02, 0, 1);
    said = "Mileage banked. A happy garage.";
  }
  testLearn(t, learn);
  recap(s, said);
  devNote(s, t, { kind: "tested", text: `Pre-season test: ${said}` });
  note(s, undefined, "Pre-season test report", `${said} Three days of running have given the engineers a better idea of the car's real pace. Your estimates have moved closer to the truth. ${nextCarReport(s)}`);
}
