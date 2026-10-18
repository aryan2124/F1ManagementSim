import { news, pushCard, recap } from "./cards";
import { addBoost } from "./rnd";
import { planOf } from "./rndplan";
import { AREA_TRAITS, TRAIT_GAIN_K, TRAIT_NAME, addTrait } from "./traits";
import { logSpend } from "./log";
import { nextId, rngFor, round2, fmtMoney } from "./util";
import { TRAITS, type Card, type CareerState, type Project, type Trait } from "./types";

/**
 * Things that go wrong in development and break the plan: a rival copies a part, a part cracks at the track, the tunnel breaks down.
 * Each one puts a few honest choices in front of the manager, and none of them is free.
 */

const COOLDOWN = 49;
const trOf = (p: Project): Trait => p.trait ?? AREA_TRAITS[p.area][0];

export function devEventsWeekly(s: CareerState) {
  const t = s.teams[s.teamId];
  const plan = planOf(t);
  if (s.round < 2 || s.day - (plan.eventDay ?? -999) < COOLDOWN || s.cards.some((c) => c.kind === "devEvent")) return;
  const rng = rngFor(s, `devEvent:${s.day}`);
  if (!rng.chance(0.2)) return;
  const live = t.projects.filter((p) => p.status === "fitted" && p.fittedYear === s.year && !p.worn && (p.delivered ?? 0) >= 0.03 && !p.forNext);
  const kinds: string[] = [];
  if (live.length) kinds.push("copied", "cracked");
  if (t.tunnelLeft > 60) kinds.push("tunnel");
  if (!kinds.length) return;
  const kind = kinds[Math.floor(rng.next() * kinds.length)];
  plan.eventDay = s.day;
  if (kind === "tunnel") {
    const lost = Math.round(t.tunnelLeft * 0.25);
    const fee = round2(1.5 + lost / 40);
    pushCard(s, "devEvent", "The wind tunnel balance has failed", `A fault in the tunnel's balance means every run since the last calibration is suspect. The tunnel is out for days. You are about to lose ${lost} hours of your allowance unless you pay for time at an outside facility.`, [
      { id: "pay", label: `Hire outside tunnel time (${fmtMoney(fee)})`, detail: "Keeps the allowance. Takes cash, not cap room.", lines: [`Costs ${fmtMoney(fee)} of cash`, "Projects keep their pace"] },
      { id: "carry", label: "Wait for the repair", detail: `Lose ${lost} hours of allowance.`, lines: ["Tunnel projects may stall until the allowance resets"], warn: "Stalled projects miss races." },
    ], { urgency: 2, deadline: s.day + 5, defaultOption: "carry", data: { kind, lost, fee } });
    return;
  }
  const p = live.sort((a, b) => (b.delivered ?? 0) - (a.delivered ?? 0))[0];
  const tr = trOf(p);
  if (kind === "copied") {
    const rivals = Object.values(s.teams).filter((x) => x.id !== s.teamId);
    const rv = rivals[Math.floor(rng.next() * rivals.length)];
    const loss = round2((p.delivered ?? 0) * 0.3);
    pushCard(s, "devEvent", `${rv.id.toUpperCase()} have copied "${p.name}"`, `Photographs from the last race show ${rv.id.toUpperCase()} running something very close to your ${TRAIT_NAME[tr].toLowerCase()} part. If it stands, your edge shrinks: about ${loss.toFixed(2)} s of what the part gives is gone, because the gain was only worth something while they did not have it.`, [
      { id: "protest", label: "Protest to the stewards", detail: "Costs nothing. Two in five go your way.", lines: ["If it fails you lose the edge anyway", "The paddock hears about it either way"] },
      { id: "outdevelop", label: "Out-develop them", detail: "Take the loss, point the office at the same trait.", lines: [`Matching projects ${Math.round(0.25 * 100)}% cheaper for five weeks`, `You lose ${loss.toFixed(2)} s now`] },
      { id: "accept", label: "Accept it", detail: "It happens to everyone.", lines: [`You lose ${loss.toFixed(2)} s`] },
    ], { urgency: 2, deadline: s.day + 6, defaultOption: "accept", data: { kind, projectId: p.id, loss, rival: rv.id } });
    return;
  }
  const redoCost = round2(p.cost * 0.55);
  const redoDays = Math.max(5, Math.round(p.days * 0.4));
  pushCard(s, "devEvent", `"${p.name}" has cracked`, `The crew found a fatigue crack in the part during the race weekend. It is giving ${(p.delivered ?? 0).toFixed(2)} s a lap right now and will not stay in one piece at that load.`, [
    { id: "redesign", label: `Emergency redesign (${fmtMoney(redoCost)}, ${redoDays} days)`, detail: "The gain goes until the new part is built, then comes back in full.", lines: [`${fmtMoney(redoCost)} of cap room`, "Runs outside the factory's normal limit, but eats tunnel time"], warn: "A slower car until it lands." },
    { id: "runon", label: "Run it at reduced load", detail: "Keep half the gain for the rest of the season.", lines: ["No cost", "Half the gain stays on the car"] },
    { id: "pull", label: "Pull it and move on", detail: "The gain is gone for good.", lines: ["The slot and the money were spent for nothing"] },
  ], { urgency: 2, deadline: s.day + 5, defaultOption: "runon", data: { kind, projectId: p.id, redoCost, redoDays } });
}

export function resolveDevEvent(s: CareerState, c: Card, option: string) {
  const t = s.teams[s.teamId];
  const d = c.data ?? {};
  const kind = String(d.kind);
  if (kind === "tunnel") {
    if (option === "pay" && t.cash >= Number(d.fee)) {
      t.cash = round2(t.cash - Number(d.fee));
      logSpend(s, "Hired outside wind tunnel time", { cash: -Number(d.fee) });
      recap(s, "Outside tunnel hired: the allowance is safe.");
    } else {
      t.tunnelLeft = Math.max(0, t.tunnelLeft - Number(d.lost));
      recap(s, `The tunnel is back, ${d.lost} hours short.`);
    }
    return;
  }
  const p = t.projects.find((x) => x.id === Number(d.projectId));
  if (!p) return;
  const tr = trOf(p);
  const K = TRAIT_GAIN_K;
  if (kind === "copied") {
    const lose = () => {
      addTrait(t, tr, -round2(Number(d.loss) * K));
      p.delivered = round2((p.delivered ?? 0) - Number(d.loss));
    };
    if (option === "protest") {
      if (rngFor(s, `protest:${c.id}`).chance(0.4)) news(s, `The stewards ruled for you: ${String(d.rival).toUpperCase()} must take the copied part off.`, { importance: 2, tag: "rules" });
      else { lose(); news(s, `The stewards threw out your protest against ${String(d.rival).toUpperCase()}. Your edge is gone.`, { importance: 2, tag: "rules" }); }
    } else if (option === "outdevelop") {
      lose();
      addBoost(s, s.teamId, tr, 0.25, `answer to ${String(d.rival).toUpperCase()}`);
      recap(s, `You took the loss and pointed the office at ${TRAIT_NAME[tr].toLowerCase()}.`);
    } else { lose(); recap(s, "You let it go."); }
    return;
  }
  if (kind === "cracked") {
    const gain = p.delivered ?? 0;
    if (option === "runon") {
      addTrait(t, tr, -round2(gain * 0.5 * K));
      p.delivered = round2(gain * 0.5);
      recap(s, `"${p.name}" runs at reduced load and keeps half its gain.`);
      return;
    }
    addTrait(t, tr, -round2(gain * K));
    if (p.side) addTrait(t, p.side.trait, round2(p.side.amount * K));
    p.status = "scrapped";
    p.delivered = 0;
    if (option === "redesign") {
      const cost = Number(d.redoCost);
      t.capSpent = round2(t.capSpent + cost);
      t.ledger.rnd = round2(t.ledger.rnd + cost);
      logSpend(s, `Emergency redesign of "${p.name}"`, { cap: -cost });
      const np: Project = {
        ...p,
        id: nextId(s),
        name: `Redesign: ${p.name.replace(/^Redesign: /, "")}`,
        cost,
        days: Number(d.redoDays),
        start: s.day,
        progress: 0,
        status: "building",
        hold: false,
        delivered: undefined,
        fittedRound: undefined,
        fittedYear: undefined,
        worn: false,
        tested: undefined,
        testRuns: undefined,
        trueGain: gain,
        predLo: round2(gain * 0.9),
        predHi: round2(gain * 1.1),
        boost: undefined,
      };
      t.projects.push(np);
      recap(s, `Emergency redesign under way: ${Number(d.redoDays)} days.`);
    } else recap(s, `"${p.name}" is off the car.`);
  }
}

/** After the rules are redrawn: what each trait is now worth, and what that does to the team's own knowledge. */
export function regulationShock(s: CareerState, before: Record<Trait, number> | undefined) {
  if (!before || !s.regW) return;
  const t = s.teams[s.teamId];
  const diffs = TRAITS.map((tr) => ({ tr, d: round2(s.regW![tr] - before[tr]) })).sort((a, b) => b.d - a.d);
  const up = diffs.filter((x) => x.d >= 0.12).slice(0, 2);
  const down = diffs.filter((x) => x.d <= -0.12).slice(-2).reverse();
  if (!up.length && !down.length) return;
  for (const x of [...up, ...down]) t.regKnow[x.tr].err = round2(Math.min(0.3, t.regKnow[x.tr].err + 0.1 + Math.abs(x.d) * 0.2));
  const plan = planOf(t);
  plan.synergy = {};
  plan.boosts = [];
  const bit = (xs: typeof up) => xs.map((x) => TRAIT_NAME[x.tr].toLowerCase()).join(" and ");
  news(s, `The new rules change what wins. ${up.length ? `${bit(up)} ${up.length > 1 ? "are" : "is"} now worth more` : ""}${up.length && down.length ? ", " : ""}${down.length ? `${bit(down)} ${down.length > 1 ? "are" : "is"} worth less` : ""}. Your engineers are less sure of the numbers, and groundwork and weekend data on the old rules are void.`, { importance: 3, tag: "rules" });
}
