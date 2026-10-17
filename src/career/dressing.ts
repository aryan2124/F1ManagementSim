import { boardMove } from "./board";
import { news, pushCard, recap } from "./cards";
import { driversOf } from "./finance";
import { logSpend } from "./log";
import { clamp, fmtDay, rngFor, round2 } from "./util";
import type { CareerState, DriverState, PressState, RiftState } from "./types";

export const newRift = (): RiftState => ({ heat: 0, stage: 0, causes: {}, asked: 0, truceUntil: 0 });
export const newPress = (): PressState => ({ mood: 0, quotes: [], silence: 0, heat: 0, lastStory: -99 });

export const RIFT_WORD = ["Calm", "Tension", "Feud", "Open war"];
export const RIFT_CAUSE: Record<string, string> = {
  equal: "Two drivers of equal speed: each believes he deserves to lead",
  standings: "Level in the standings",
  contact: "Touching or racing too hard against each other",
  orders: "Team orders and who the team backs",
  upgrades: "Too few upgrades to go round",
  press: "The press keeps asking who is better",
};

const mates = (s: CareerState): [DriverState, DriverState] | null => {
  const ds = driversOf(s, s.teamId);
  return ds.length >= 2 ? [ds[0], ds[1]] : null;
};
const ego = (d: DriverState) => (d.spec.psyche as { ego?: number } | undefined)?.ego ?? 0.5;
const stageOf = (h: number): RiftState["stage"] => (h >= 0.8 ? 3 : h >= 0.55 ? 2 : h >= 0.3 ? 1 : 0);

function addHeat(s: CareerState, key: string, v: number) {
  const r = s.rift;
  r.causes[key] = round2((r.causes[key] ?? 0) + v);
  r.heat = round2(clamp(r.heat + v, 0, 1.2));
}

/** Weekly: the rift grows or cools by cause. */
export function riftWeekly(s: CareerState) {
  const m = mates(s);
  const r = s.rift;
  if (!m) return;
  const [a, b] = m;
  const gap = Math.abs(a.spec.pace - b.spec.pace);
  const egoMul = 0.8 + (ego(a) + ego(b)) * 0.4;
  const truce = s.day < r.truceUntil ? 0.4 : 1;
  if (gap < 0.012) addHeat(s, "equal", 0.025 * egoMul * truce);
  if (s.round >= 3) {
    const p1 = s.standings.drivers[a.id] ?? 0;
    const p2 = s.standings.drivers[b.id] ?? 0;
    if (p1 + p2 > 15 && Math.abs(p1 - p2) < Math.max(8, 0.15 * Math.max(p1, p2))) addHeat(s, "standings", 0.03 * egoMul * truce);
    const me = s.teams[s.teamId];
    const recent = me.projects.filter((p) => p.status === "fitted" && (p.fittedRound ?? 0) >= s.round - 3).length;
    if (recent < 1 && gap < 0.02) addHeat(s, "upgrades", 0.015 * truce);
  }
  if (s.press.heat > 0.5 && r.heat > 0.25) addHeat(s, "press", 0.02);
  r.heat = round2(clamp(r.heat - 0.03, 0, 1.2));
  for (const k of Object.keys(r.causes)) r.causes[k] = round2(r.causes[k] * 0.9);
  const was = r.stage;
  r.stage = stageOf(r.heat);
  if (r.stage > was) riftRises(s, a, b);
  if (r.stage < r.asked) r.asked = r.stage;
  if (r.stage >= 1) {
    for (const d of [a, b]) {
      d.morale = clamp(d.morale - 0.004 * r.stage, 0, 1);
      d.grievance = round2(clamp(d.grievance + 0.004 * r.stage, 0, 1));
    }
  }
}

/** After a race: finishing next to each other lights it. */
export function riftAfterRace(s: CareerState, order: string[], dnf: string[]) {
  const m = mates(s);
  if (!m) return;
  const [a, b] = m;
  const ia = order.indexOf(a.id);
  const ib = order.indexOf(b.id);
  if (ia < 0 || ib < 0) return;
  const ok = !dnf.includes(a.id) && !dnf.includes(b.id);
  if (ok && Math.abs(ia - ib) === 1 && Math.min(ia, ib) < 8) addHeat(s, "contact", 0.07);
  if (dnf.includes(a.id) !== dnf.includes(b.id) && Math.min(ia, ib) < 14 && Math.abs(ia - ib) <= 2) addHeat(s, "contact", 0.1);
  s.rift.stage = stageOf(s.rift.heat);
}

function riftRises(s: CareerState, a: DriverState, b: DriverState) {
  const r = s.rift;
  const top = Object.entries(r.causes).sort((x, y) => y[1] - x[1])[0];
  const why = top ? RIFT_CAUSE[top[0]] : "Two strong characters in one garage";
  const names = `${a.spec.name} and ${b.spec.name}`;
  if (r.stage === 1) {
    news(s, `Tension in the garage: ${names} are watching each other closely.`, { importance: 2, cause: why, tag: "rivalry" });
    s.press.heat = clamp(s.press.heat + 0.12, 0, 1);
  } else if (r.stage >= 2 && r.asked < r.stage) {
    r.asked = r.stage;
    s.press.heat = clamp(s.press.heat + 0.25, 0, 1);
    news(s, r.stage === 2 ? `${names} are in open disagreement, the press say.` : `${names}: the garage is at war.`, { importance: 3, cause: why, tag: "rivalry" });
    pushRiftCard(s, a, b, why);
  }
}

function pushRiftCard(s: CareerState, a: DriverState, b: DriverState, why: string) {
  const r = s.rift;
  const war = r.stage >= 3;
  const fast = a.spec.pace >= b.spec.pace ? a : b;
  const slow = fast === a ? b : a;
  const options = [
    { id: "talk", label: "Sit them down together", detail: "A fair hearing. Heat down, a few days of truce", lines: [`Works best when neither has a big ego (${Math.round((ego(a) + ego(b)) * 50)}% combined).`] },
    { id: "orders", label: `Name ${fast.spec.name} the lead driver`, detail: `${slow.spec.name} is angry, the feud cools`, lines: ["Sets roles: number one and number two.", `${slow.spec.name}'s grievance goes up, ${fast.spec.name}'s down.`] },
    { id: "race", label: "Let them race", detail: "Fans and press love it. Risk grows", lines: ["Heat up a little, fans up, morale up, but both drive less consistently."] },
    { id: "day", label: "Team building day", detail: "$0.4m, heat down, morale up", lines: ["Costs real money. Works a little."] },
  ];
  if (war) options.push({ id: "warn", label: "Fine both and warn them in public", detail: "Board approves, drivers sulk", lines: ["Heat down sharply. Both morale down. Press respects it."] });
  pushCard(s, "rivalry", war ? "Your drivers are at war" : "Your drivers are in a feud", `${a.spec.name} and ${b.spec.name} are fighting. The cause: ${why.toLowerCase()}. The press have noticed (story heat ${Math.round(s.press.heat * 100)}). A manager has to act, or live with it.`, options, { urgency: war ? 3 : 2, deadline: s.day + 8, defaultOption: "race", data: { a: a.id, b: b.id } });
}

export function resolveRift(s: CareerState, option: string, aId: string, bId: string) {
  const a = s.drivers[aId];
  const b = s.drivers[bId];
  const r = s.rift;
  if (!a || !b) return;
  const fast = a.spec.pace >= b.spec.pace ? a : b;
  const slow = fast === a ? b : a;
  const rng = rngFor(s, `rift:${s.day}`);
  if (option === "talk") {
    const ok = rng.chance(clamp(0.85 - (ego(a) + ego(b)) * 0.4, 0.2, 0.8));
    r.heat = round2(r.heat * (ok ? 0.55 : 0.9));
    r.truceUntil = s.day + (ok ? 28 : 7);
    for (const d of [a, b]) d.morale = clamp(d.morale + (ok ? 0.02 : -0.02), 0, 1);
    recap(s, ok ? "The sit-down worked. A truce holds for now." : "The sit-down went badly. Little changed.");
  } else if (option === "orders") {
    fast.role = "number1";
    slow.role = "number2";
    addHeatNeg(s, 0.22);
    slow.grievance = round2(clamp(slow.grievance + 0.06, 0, 1));
    fast.grievance = round2(clamp(fast.grievance - 0.04, 0, 1));
    r.causes.orders = round2((r.causes.orders ?? 0) + 0.1);
    recap(s, `${fast.spec.name} is now the lead driver. ${slow.spec.name} is not happy.`);
  } else if (option === "race") {
    r.heat = round2(clamp(r.heat + 0.05, 0, 1.2));
    s.brand.fans = clamp(s.brand.fans + 1, 0, 100);
    s.press.mood = clamp(s.press.mood + 0.04, -1, 1);
    for (const d of [a, b]) d.morale = clamp(d.morale + 0.02, 0, 1);
    recap(s, "You let them race. The fans love it.");
  } else if (option === "day") {
    const me = s.teams[s.teamId];
    me.cash = round2(me.cash - 0.4);
    me.ledger.costs += 0.4;
    r.heat = round2(r.heat * 0.85);
    for (const d of [a, b]) d.morale = clamp(d.morale + 0.03, 0, 1);
    logSpend(s, "Team building day for the drivers", { cash: -0.4 });
  } else if (option === "warn") {
    r.heat = round2(r.heat * 0.5);
    boardMove(s, s.teams[s.teamId], 1, "Peace in the garage");
    s.press.mood = clamp(s.press.mood + 0.03, -1, 1);
    for (const d of [a, b]) d.morale = clamp(d.morale - 0.06, 0, 1);
    recap(s, "A public warning cooled the garage and soured both drivers.");
  }
  r.stage = stageOf(r.heat);
  r.asked = Math.min(r.asked, r.stage);
}
const addHeatNeg = (s: CareerState, v: number) => {
  s.rift.heat = round2(clamp(s.rift.heat - v, 0, 1.2));
};

/** What the rift does on track: both drivers lose consistency. Stage 2 is a little, stage 3 a lot. */
export function riftTrackEffect(s: CareerState): { consistency: number; pace: number } {
  const st = s.rift.stage;
  return { consistency: st >= 3 ? 0.05 : st >= 2 ? 0.025 : 0, pace: st >= 3 ? 0.002 : 0 };
}

// ---------------------------------------------------------------- the press

/** Remember what the player said, so it can come back. */
export function recordQuote(s: CareerState, qid: string, option: string) {
  const day = s.day;
  const q = s.press.quotes;
  const un = driversOf(s, s.teamId).filter((d) => d.gStage >= 2).sort((a, b) => b.grievance - a.grievance)[0];
  if (qid === "mood" && option === "up") q.push({ day, kind: "mood", text: "Everyone is buzzing" });
  if (qid === "unhappy" && option === "support" && un) q.push({ day, kind: "support", text: `${un.spec.name} has our full support`, driverId: un.id });
  if (qid === "money" && option === "deny") q.push({ day, kind: "money", text: "We are fine for money" });
  if (qid === "rival" && option === "cool") q.push({ day, kind: "fair", text: "Hard but fair racing" });
  if (qid === "behind" && option === "back") q.push({ day, kind: "plan", text: "We back the plan" });
  if (q.length > 12) q.shift();
  // silence and honesty
  const P = s.press;
  const silent = option === "no" || option === "deflect" || option === "time" || option === "patient";
  P.silence = silent ? P.silence + 1 : 0;
  if (P.silence === 3) {
    P.mood = clamp(P.mood - 0.12, -1, 1);
    news(s, "Reporters complain the team is stonewalling: three press conferences in a row without an answer.", { importance: 2, cause: "Repeated no comment", tag: "people" });
  }
  const honest = ["honest", "own", "listen", "patient"].includes(option);
  if (honest) P.mood = clamp(P.mood + 0.03, -1, 1);
}

const contradicted = (s: CareerState, qt: PressState["quotes"][number]): string | null => {
  const me = s.teams[s.teamId];
  const ds = driversOf(s, s.teamId);
  if (qt.kind === "mood") {
    const avg = ds.reduce((a, d) => a + d.morale, 0) / Math.max(1, ds.length);
    return avg < 0.45 ? "Both drivers are low on morale, which the press can see." : null;
  }
  if (qt.kind === "support") {
    const d = qt.driverId ? s.drivers[qt.driverId] : null;
    return d && (d.gStage >= 4 || d.teamId !== s.teamId) ? `${d.spec.name} is now ${d.teamId !== s.teamId ? "gone" : "making demands"}.` : null;
  }
  if (qt.kind === "money") return me.cash < 0 ? "The team is overdrawn." : null;
  if (qt.kind === "fair") {
    const r = [...s.rivalries].sort((a, b) => b.heat - a.heat)[0];
    return r && r.heat > 1.0 ? "The rivalry has boiled over." : null;
  }
  if (qt.kind === "plan") {
    const rank = Object.entries(s.standings.teams).sort((a, b) => b[1] - a[1]).findIndex(([id]) => id === s.teamId) + 1;
    return s.round >= 8 && rank > (me.objectives[0]?.target ?? 6) + 3 ? "The team is far behind the target." : null;
  }
  return null;
};

export function pressWeekly(s: CareerState) {
  const P = s.press;
  const me = s.teams[s.teamId];
  const target = me.objectives[0]?.target ?? 6;
  // the mood follows results slowly
  if (s.round >= 2) {
    const rank = Object.entries(s.standings.teams).sort((a, b) => b[1] - a[1]).findIndex(([id]) => id === s.teamId) + 1;
    P.mood = clamp(P.mood + (rank <= target ? 0.02 : -0.02), -1, 1);
  }
  P.mood = round2(P.mood * 0.985);
  P.heat = round2(clamp(P.heat * 0.88, 0, 1));
  // the press shape the rest of the game
  s.brand.fans = clamp(s.brand.fans + P.mood * 0.3, 0, 100);
  for (const sp of me.sponsors) sp.mood = clamp(sp.mood + P.mood * 0.004, 0, 1);
  for (const d of driversOf(s, s.teamId)) d.morale = clamp(d.morale + P.mood * 0.004, 0, 1);
  if (P.mood < -0.5 && s.day % 28 < 7) boardMove(s, me, -0.5, "A hostile press");
  // old words come back
  if (!s.cards.some((c) => c.kind === "pressStory") && s.day - P.lastStory > 21) {
    const qt = P.quotes.find((x) => !x.called && s.day - x.day > 14 && s.day - x.day < 150 && contradicted(s, x));
    if (qt) {
      qt.called = true;
      P.lastStory = s.day;
      const why = contradicted(s, qt) ?? "";
      news(s, `"${qt.text}": the press remember what the team said on ${fmtDay(qt.day)}. ${why}`, { importance: 3, cause: "Something you said in public no longer matches reality", tag: "people" });
      pushCard(s, "pressStory", "The press quote you back at yourself", `On ${fmtDay(qt.day)} you said: "${qt.text}". ${why} A columnist has put the two side by side.`, [
        { id: "own", label: "Own it", detail: "Press respects it, the board winces", lines: ["Press mood up. Board down a little."] },
        { id: "spin", label: "Say it was misread", detail: "A gamble", lines: ["Half the time it works. If not, the press turn on you."] },
        { id: "silent", label: "Say nothing", detail: "The story runs on", lines: ["Press mood down. Fans notice."] },
      ], { urgency: 2, deadline: s.day + 6, defaultOption: "silent", data: { kind: qt.kind } });
    }
  }
}

export function resolvePressStory(s: CareerState, option: string) {
  const P = s.press;
  const me = s.teams[s.teamId];
  const rng = rngFor(s, `spin:${s.day}`);
  if (option === "own") {
    P.mood = clamp(P.mood + 0.08, -1, 1);
    boardMove(s, me, -0.5, "A hostile press");
    recap(s, "You owned the mistake. The press respect it.");
  } else if (option === "spin") {
    if (rng.chance(0.5)) {
      P.mood = clamp(P.mood + 0.02, -1, 1);
      recap(s, "The spin held.");
    } else {
      P.mood = clamp(P.mood - 0.18, -1, 1);
      s.brand.fans = clamp(s.brand.fans - 1.5, 0, 100);
      for (const sp of me.sponsors) sp.mood = clamp(sp.mood - 0.04, 0, 1);
      recap(s, "The spin backfired. The press turned on you.");
    }
  } else {
    P.mood = clamp(P.mood - 0.1, -1, 1);
    s.brand.fans = clamp(s.brand.fans - 0.8, 0, 100);
    recap(s, "Silence let the story run.");
  }
}

export const pressWord = (m: number) => (m > 0.4 ? "Friendly" : m > 0.12 ? "Warm" : m > -0.12 ? "Neutral" : m > -0.4 ? "Cool" : "Hostile");
