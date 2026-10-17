import { askRetainer, levelOf, reportOf, signProspect, stars, trialDay } from "./academy";
import { standingsRank } from "./car";
import { news, recap, sendMail } from "./cards";
import { logSpend } from "./log";
import { clamp, fmtMoney, rngFor, round2 } from "./util";
import { makeSponsor } from "./world";
import type { Card, CareerState, Sponsor } from "./types";

/**
 * The inbox. Letters from sponsors, scouts and young drivers. Nothing here is urgent and nothing stops the clock,
 * but a team that never reads its mail misses deals, and a team that signs everyone who writes gets what it deserves.
 */

const SHADY = ["MoonCoin Exchange", "Lucky Seven Holdings", "Hydra Mining Group", "QuickLoan Direct"];
const rankOf = (s: CareerState) => Math.max(1, standingsRank(s).indexOf(s.teamId) + 1);

function offerData(sp: Sponsor, shady: boolean): NonNullable<Card["data"]> {
  return { m: "sponsor", name: sp.name, retainer: sp.retainer, bonus: sp.bonusPerRace, objective: sp.objective, objKind: sp.objKind, endYear: sp.endYear, demand: sp.demand, shady: shady ? 1 : 0 };
}

/** A sponsor writes. `scale` is how big the company thinks the team is. */
export function sponsorMail(s: CareerState, scale: number, from?: string) {
  const me = s.teams[s.teamId];
  const rng = rngFor(s, `spmail:${s.day}:${s.uid}`);
  const taken = new Set(me.sponsors.map((x) => x.name));
  const poor = rankOf(s) >= 8 || me.cash < 20 || me.board < 35;
  const shady = rng.chance(poor ? 0.3 : 0.07);
  const sp = makeSponsor(rng, s.uid++, me.aiIncome * scale, s.year, taken);
  if (shady) {
    sp.name = rng.pick(SHADY);
    sp.retainer = round2(sp.retainer * 1.8);
    sp.bonusPerRace = round2(sp.bonusPerRace * 1.8);
    sp.endYear = s.year + 1;
  }
  const first = ["Dana", "Rui", "Mara", "Tomas", "Ines", "Kofi"][Math.floor(rng.next() * 6)];
  const body = shady
    ? `Hi! ${sp.name} loves what you are doing. We can pay ${fmtMoney(sp.retainer)} a year, no strings, paid quickly. We do not usually put offers in writing, so please do not show this to your lawyers. Sign this week.`
    : `Dear team principal, ${sp.name} has been following the team and would like to talk about a partnership: ${fmtMoney(sp.retainer)} a year until ${sp.endYear}, plus ${fmtMoney(sp.bonusPerRace, 2)} each race when the result is: ${sp.objective.toLowerCase()}.`;
  sendMail(s, {
    from: from ?? `${first}, ${sp.name}`,
    role: shady ? "Sponsor (unsolicited)" : "Sponsor",
    subject: `${sp.name}: partnership offer`,
    body,
    options: [
      { id: "accept", label: "Accept the offer", detail: `${fmtMoney(sp.retainer)} a year until ${sp.endYear}`, lines: shady ? ["Money is money."] : [`Bonus when: ${sp.objective.toLowerCase()}.`], warn: shady ? "Nobody has checked who these people are." : undefined },
      { id: "counter", label: "Ask for more", detail: "They may agree to 20 percent more, or walk away" },
      { id: "decline", label: "Politely decline" },
    ],
    days: 18,
    def: "decline",
    data: offerData(sp, shady),
  });
}

/** A young driver, or his family, writes in. */
export function traineeMail(s: CareerState) {
  const a = s.academy;
  const me = s.teams[s.teamId];
  const held = Object.values(a.prospects).filter((x) => x.status === "academy" && x.owner === s.teamId).length;
  if (held >= 3 + me.facilities.academy) return;
  const rng = rngFor(s, `traineemail:${s.day}`);
  const pool = Object.values(a.prospects).filter((p) => p.status === "free" && s.year - p.born >= 14 && s.year - p.born <= 21 && p.series !== "kart" && !a.shortlist.includes(p.id));
  if (!pool.length) return;
  pool.sort((x, y) => levelOf(y) + rng.next() * 0.25 - (levelOf(x) + rng.next() * 0.25));
  const p = pool[Math.min(pool.length - 1, Math.floor(Math.pow(rng.next(), 1.4) * Math.min(pool.length, 12)))];
  const r = reportOf(s, p);
  const age = s.year - p.born;
  const tone = rng.pick([
    `I am ${age} and I race in ${p.series.toUpperCase()}. I know you get hundreds of these, but I have attached my best laps and I will drive anything you give me.`,
    `My father says I should not write to you, so I am writing to you. ${p.series.toUpperCase()}, ${age} years old, ${p.wins} win${p.wins === 1 ? "" : "s"} so far this year. Please watch the footage.`,
    `Dear sir or madam, please find the highlights of my season. I have been told I am smooth in the wet. I would be grateful for even one test day.`,
  ]);
  sendMail(s, {
    from: p.name,
    role: `Young driver, ${p.nat}`,
    subject: `Highlights: ${p.name} (${p.series.toUpperCase()})`,
    body: `${tone}\n\nYour scouts have not seen him much. First read: ${r.stars.lo === r.stars.hi ? r.stars.lo : `${r.stars.lo} to ${r.stars.hi}`} stars.`,
    options: [
      { id: "reel", label: "Watch the highlights", detail: "Costs nothing, your scouts learn a little more" },
      { id: "trial", label: "Invite him for a trial day", detail: "$0.25m. You will see him in your own car" },
      { id: "sign", label: "Offer an academy deal", detail: `About ${fmtMoney(askRetainer(s, p))} a year plus his racing costs`, warn: "Signing blind is how academies fill with nobodies." },
      { id: "no", label: "Send a polite no" },
    ],
    days: 30,
    def: "no",
    data: { m: "trainee", pid: p.id },
  });
}

export function mailWeekly(s: CareerState) {
  const me = s.teams[s.teamId];
  const rng = rngFor(s, `mail:${s.day}:${s.teamId}`);
  const inbox = s.cards.filter((c) => c.kind === "mail");
  if (inbox.length >= 8) return;
  const fanMul = 0.8 + s.brand.fans / 250;
  const rank = rankOf(s);
  const rankMul = clamp(1.15 - rank * 0.04, 0.6, 1.15);
  if (s.day - (s.story.last.mailSponsor ?? -999) > 28 && me.sponsors.length < 6 && rng.chance(0.07 + s.brand.fans / 1200 + (rank <= 5 ? 0.04 : 0))) {
    s.story.last.mailSponsor = s.day;
    sponsorMail(s, rng.range(0.12, 0.24) * fanMul * rankMul);
  }
  if (s.day - (s.story.last.mailTrainee ?? -999) > 21 && rng.chance(0.1)) {
    s.story.last.mailTrainee = s.day;
    traineeMail(s);
  }
}

// ---------------------------------------------------------------- hunting for sponsors yourself

export const HUNT = {
  cold: { label: "Send cold emails", cost: 0, days: 12, text: "Free and slow. A bad team gets few replies." },
  agency: { label: "Hire a sponsorship agency", cost: 1.2, days: 7, text: "$1.2m fee. Better introductions and bigger offers." },
  personal: { label: "Work the rooms yourself", cost: 0, days: 5, text: "Dinners and hospitality. Both drivers lose some morale to the appearances." },
} as const;
export type HuntMode = keyof typeof HUNT;

export function huntCooldown(s: CareerState): number {
  return Math.max(0, 40 - (s.day - (s.story.last.hunt ?? -999)));
}

export function startHunt(s: CareerState, mode: HuntMode): string | null {
  const me = s.teams[s.teamId];
  const h = HUNT[mode];
  if (huntCooldown(s) > 0) return `You already have people looking. Try again in ${huntCooldown(s)} days.`;
  if (me.cash < h.cost) return "Not enough cash for the agency fee.";
  if (h.cost) {
    me.cash = round2(me.cash - h.cost);
    me.ledger.costs += h.cost;
    logSpend(s, "Sponsorship agency fee", { cash: -h.cost });
  }
  if (mode === "personal") {
    for (const d of Object.values(s.drivers)) if (d.teamId === s.teamId) d.morale = clamp(d.morale - 0.03, 0, 1);
  }
  s.story.last.hunt = s.day;
  (s.story.queue ??= []).push({ day: s.day + h.days, id: `hunt:${mode}`, data: {} });
  return `${h.label}: replies are due in about ${h.days} days.`;
}

/** The replies arrive. How good they are depends on where the team really is. */
export function huntResult(s: CareerState, mode: HuntMode) {
  const rng = rngFor(s, `hunt:${mode}`);
  const rank = rankOf(s);
  const fanMul = 0.8 + s.brand.fans / 250;
  const rankMul = clamp(1.15 - rank * 0.04, 0.6, 1.15);
  const boost = mode === "agency" ? 1.25 : mode === "personal" ? 1.1 : 1;
  const expect = mode === "cold" ? 0.8 + (11 - rank) * 0.1 : mode === "agency" ? 1.3 + (11 - rank) * 0.1 : 1.6;
  let n = 0;
  for (let i = 0; i < 3; i++) if (rng.chance(clamp(expect / 3 - i * 0.12, 0.05, 0.85))) n++;
  if (!n) {
    sendMail(s, { from: "Your sponsorship inbox", role: "Result", subject: "The replies are in", body: rank >= 8 ? "Nobody wrote back. Companies are not queueing up to put their name on a car at the back of the grid." : "Nothing came of it this time.", options: [{ id: "ok", label: "Noted" }, { id: "ok", label: "Delete" }], days: 10, def: "ok", data: { m: "none" } });
    news(s, "Your sponsor hunt turned up nothing.", { importance: 1, tag: "money" });
    return;
  }
  for (let i = 0; i < n; i++) sponsorMail(s, rng.range(0.14, 0.26) * fanMul * rankMul * boost);
  recap(s, `${n} sponsor${n > 1 ? "s" : ""} replied to your approach. Check the inbox.`);
}

// ---------------------------------------------------------------- answers

export function resolveMail(s: CareerState, c: Card, option: string) {
  const d = c.data ?? {};
  const me = s.teams[s.teamId];
  switch (String(d.m)) {
    case "sponsor": {
      const base = { name: String(d.name), retainer: Number(d.retainer), bonus: Number(d.bonus) };
      if (option === "decline") break;
      let retainer = base.retainer;
      if (option === "counter") {
        const rng = rngFor(s, `counter:${c.id}`);
        const ok = d.shady ? true : rng.chance(clamp(0.45 + s.brand.fans / 250 - rankOf(s) * 0.02, 0.15, 0.8));
        if (!ok) {
          recap(s, `${base.name} walked away when you asked for more.`);
          break;
        }
        retainer = round2(retainer * 1.2);
      }
      me.sponsors.push({
        id: s.uid++,
        name: base.name,
        retainer,
        bonusPerRace: base.bonus,
        objective: String(d.objective),
        objKind: d.objKind as "bothPoints" | "podiums" | "top5",
        mood: 0.6,
        endYear: Number(d.endYear),
        demand: Number(d.demand),
        breakFee: round2(retainer * 0.3),
      });
      recap(s, `${base.name} signed at ${fmtMoney(retainer)} a year.`);
      news(s, `${base.name} joins the team as a sponsor.`, { importance: 1, tag: "money" });
      if (d.shady) (s.story.queue ??= []).push({ day: s.day + 30 + Math.floor(rngFor(s, `sh:${c.id}`).next() * 40), id: "shadyBust", data: { name: base.name, retainer } });
      break;
    }
    case "scout": {
      if (option.startsWith("trial:")) {
        const why = trialDay(s, option.slice(6));
        recap(s, why ?? "Trial day booked.");
      }
      break;
    }
    case "trainee": {
      const p = s.academy.prospects[String(d.pid)];
      if (!p) break;
      if (option === "reel") {
        p.seen += 1.5;
        p.quality = Math.max(p.quality, 0.5);
        p.confidence = clamp(p.confidence + 0.12, 0, 1);
        if (!s.academy.shortlist.includes(p.id)) s.academy.shortlist.push(p.id);
        recap(s, `${p.name} added to the shortlist; the scouts have watched his footage.`);
      } else if (option === "trial") {
        if (!s.academy.shortlist.includes(p.id)) s.academy.shortlist.push(p.id);
        recap(s, trialDay(s, p.id) ?? `${p.name} drove your car for a day. See his page in the academy.`);
      } else if (option === "sign") {
        const why = signProspect(s, p.id, 2, askRetainer(s, p), round2(0.5 + stars(p) * 0.4), false);
        recap(s, why ?? `${p.name} signed an academy deal.`);
      }
      break;
    }
    default:
      break;
  }
}
