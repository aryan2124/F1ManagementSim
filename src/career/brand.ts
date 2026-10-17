import { driversOf } from "./finance";
import { chaseOf } from "./records";
import { boardMove } from "./board";
import { TEAMS } from "../game/data";
import { news, pushCard, recap, ticker } from "./cards";
import { logSpend } from "./log";
import { clamp, fmtMoney, rngFor, round2 } from "./util";
import { makeSponsor } from "./world";
import { multiply } from "./factors";
import { identityOf, publishIdentity } from "./identity";
import type { BrandState, CareerState, Sponsor } from "./types";

/** How much a team's identity matters to its fans. 1 is Ferrari. */
export const HERITAGE: Record<string, number> = {
  fer: 1, mcl: 0.8, wil: 0.8, mer: 0.55, rbr: 0.35, alp: 0.45, ast: 0.2, hss: 0.2, rbs: 0.3, aud: 0.15, cad: 0.1,
};
export const heritageOf = (id: string): number => HERITAGE[id] ?? 0.3;
export const heritageWord = (h: number) => (h >= 0.85 ? "a historic name" : h >= 0.5 ? "a proud old team" : h >= 0.3 ? "an established team" : "a young team");

export const PALETTE: { name: string; color: number }[] = [
  { name: "electric blue", color: 0x1f6bff }, { name: "lime green", color: 0x8bd600 }, { name: "hot pink", color: 0xff3d9a },
  { name: "gold", color: 0xe5b800 }, { name: "violet", color: 0x7a3dff }, { name: "teal", color: 0x00a99d },
];
const PREFIXES = ["Aurelia", "Northgate", "Volta", "Helix", "Orbital", "Tessera", "Zephyr", "Pulsar"];

export const newBrand = (s: CareerState): BrandState => ({
  fans: Math.round(30 + heritageOf(s.teamId) * 35),
  color: null, prefix: null, backlashDue: null, by: null, offers: [],
});

export const fansBase = (id: string) => 30 + heritageOf(id) * 35;

export function teamLabel(s: CareerState, id = s.teamId): string {
  return identityOf(s, id).name;
}
export function teamColour(s: CareerState, id = s.teamId): number {
  return identityOf(s, id).color;
}

/** What it would cost the team's standing to change identity. */
export function identityCost(s: CareerState, kind: "livery" | "rename") {
  const h = heritageOf(s.teamId);
  const k = kind === "rename" ? 1 : 0.55;
  return { fans: Math.round(k * (4 + h * 20)), board: Math.round(k * (1 + h * 7)) };
}

/** Three real offers: a clean one, a bigger one that wants the livery, and a title deal that wants the name. */
export function sponsorShortlist(s: CareerState): Sponsor[] {
  const rng = rngFor(s, `spons:${s.day}`);
  const me = s.teams[s.teamId];
  const taken = new Set([...me.sponsors.map((x) => x.name)]);
  const fanMul = 0.8 + s.brand.fans / 250;
  // reputation, the story around the team and recent form all scale what sponsors offer
  const size = me.aiIncome * rng.range(0.16, 0.28) * fanMul * multiply(s, s.teamId, ["reputation", "story", "form"]).value;
  const out: Sponsor[] = [];
  const clean = makeSponsor(rng, s.uid++, size, s.year, taken);
  clean.breakFee = round2(clean.retainer * 0.3);
  out.push(clean);
  const l = makeSponsor(rng, s.uid++, size * 1.4, s.year, taken);
  const pal = rng.pick(PALETTE.filter((p) => p.color !== (TEAMS.find((t) => t.id === s.teamId)?.color ?? 0)));
  l.terms = { kind: "livery", color: pal.color };
  l.breakFee = round2(l.retainer * 0.5);
  l.demand = Math.max(l.demand, 0.3);
  out.push(l);
  if (!s.brand.prefix) {
    const r = makeSponsor(rng, s.uid++, size * 2.1, s.year, taken);
    r.terms = { kind: "rename", prefix: r.name.split(" ")[0] ?? rng.pick(PREFIXES), color: rng.chance(0.5) ? rng.pick(PALETTE).color : undefined };
    r.endYear = Math.max(r.endYear, s.year + 2);
    r.breakFee = round2(r.retainer * 0.8);
    r.demand = 0.4;
    out.push(r);
  }
  return out;
}

export const termsText = (s: CareerState, sp: Sponsor): string => {
  if (!sp.terms) return "No strings attached.";
  const c = identityCost(s, sp.terms.kind);
  const h = heritageOf(s.teamId);
  const heavy = h >= 0.5 ? ` ${heritageWord(h)[0].toUpperCase()}${heritageWord(h).slice(1)}: expect a loud reaction.` : "";
  if (sp.terms.kind === "livery") return `Wants the car painted in ${PALETTE.find((p) => p.color === sp.terms?.color)?.name ?? "their colour"}. Fans about ${c.fans} points, board about ${c.board}.${heavy}`;
  return `Wants the team called "${sp.terms.prefix} ${TEAMS.find((t) => t.id === s.teamId)?.name}"${sp.terms.color != null ? " and the car in their colour" : ""}. Fans about ${c.fans * (sp.terms.color != null ? 1.5 : 1) | 0} points, board about ${c.board}.${heavy}`;
};

export function offerSponsors(s: CareerState) {
  const offers = sponsorShortlist(s);
  s.brand.offers = offers;
  const options = offers.map((sp, i) => ({
    id: `pick:${i}`,
    label: `${sp.name}: ${fmtMoney(sp.retainer)} a year`,
    detail: `${sp.terms ? (sp.terms.kind === "rename" ? "Title sponsor" : "Livery change") : "Clean deal"}, until ${sp.endYear}`,
    lines: [`Bonus ${fmtMoney(sp.bonusPerRace, 2)} each race when: ${sp.objective.toLowerCase()}.`, termsText(s, sp), `Leaving early costs ${fmtMoney(sp.breakFee ?? 0)}.`],
  }));
  const cleanN = offers.filter((x) => !x.terms).length;
  if (cleanN >= 1) options.unshift({ id: "clean", label: `Sign every clean deal (${cleanN})`, detail: "No change to the car's look or the name. Fans do not mind.", lines: offers.filter((x) => !x.terms).map((x) => `${x.name}: ${fmtMoney(x.retainer)} a year until ${x.endYear}`) });
  options.push({ id: "none", label: "Turn them all down", detail: "Keep the weekend free and the identity intact", lines: [] });
  pushCard(s, "sponsorPick", "Sponsors want in", "Companies have come to the table. Clean deals change nothing about the team and can all be signed together. The bigger money comes with demands about how the team looks, and your fans will notice.", options, { deadline: s.day + 12, defaultOption: "none", data: { n: offers.length } });
}

export function signSponsor(s: CareerState, sp: Sponsor) {
  const me = s.teams[s.teamId];
  me.sponsors.push({ ...sp, mood: 0.6 });
  recap(s, `${sp.name} signed as a sponsor.`);
  if (!sp.terms) return;
  const c = identityCost(s, sp.terms.kind);
  let fans = c.fans;
  if (sp.terms.kind === "livery" && sp.terms.color != null) s.brand.color = sp.terms.color;
  if (sp.terms.kind === "rename") {
    s.brand.prefix = sp.terms.prefix ?? null;
    if (sp.terms.color != null) { s.brand.color = sp.terms.color; fans = Math.round(fans * 1.5); }
  }
  s.brand.by = sp.id;
  s.brand.fans = clamp(s.brand.fans - fans, 0, 100);
  boardMove(s, me, -c.board, "A sponsor changed the team's identity");
  const h = heritageOf(s.teamId);
  news(s, `${teamLabel(s)}: ${sp.name} deal changes the team's look. ${h >= 0.5 ? "Long-time fans are furious." : "Fans are split."}`, { importance: h >= 0.5 ? 3 : 2, cause: "A sponsor demanded a change to the team's identity", tag: "people" });
  logSpend(s, `Signed ${sp.name}: fans -${fans}, board -${c.board}`, {});
  s.brand.backlashDue = s.day + 14 + Math.round((1 - h) * 14);
  publishIdentity(s);
}

export function resolveSponsorPick(s: CareerState, option: string) {
  if (option === "clean") {
    // everything that leaves the team's identity alone is simply accepted, up to six deals
    for (const sp of s.brand.offers) if (!sp.terms && s.teams[s.teamId].sponsors.length < 6) signSponsor(s, sp);
  } else if (option.startsWith("pick:")) {
    const sp = s.brand.offers[Number(option.slice(5))];
    if (sp) signSponsor(s, sp);
  }
  s.brand.offers = [];
}

/** Takes the identity back to normal. */
export function restoreIdentity(s: CareerState) {
  s.brand.color = null;
  s.brand.prefix = null;
  s.brand.by = null;
  s.brand.backlashDue = null;
  publishIdentity(s);
}

export function endSponsor(s: CareerState, id: number): { ok: boolean; message: string } {
  const me = s.teams[s.teamId];
  const sp = me.sponsors.find((x) => x.id === id);
  if (!sp) return { ok: false, message: "No such sponsor." };
  const fee = sp.breakFee ?? round2(sp.retainer * 0.3);
  if (me.cash < fee) return { ok: false, message: `Not enough cash for the ${fmtMoney(fee)} break fee.` };
  me.cash = round2(me.cash - fee);
  me.ledger.costs += fee;
  me.sponsors = me.sponsors.filter((x) => x.id !== id);
  logSpend(s, `Ended the ${sp.name} deal early: break fee ${fmtMoney(fee)}`, { cash: -fee });
  let extra = "";
  if (s.brand.by === id) {
    restoreIdentity(s);
    s.brand.fans = clamp(s.brand.fans + 5, 0, 100);
    extra = " The team's old identity is back and fans cheer.";
  }
  return { ok: true, message: `${sp.name} dropped for ${fmtMoney(fee)}.${extra}` };
}

/** Called after each race: fans follow results, merchandise pays. */
export function brandAfterRace(s: CareerState, positions: number[]) {
  const me = s.teams[s.teamId];
  const target = me.objectives[0]?.target ?? 6;
  const best = Math.min(...positions, 20);
  const avg = positions.length ? positions.reduce((a, b) => a + b, 0) / positions.length : 12;
  let d = best <= 3 ? 1.2 : avg <= target ? 0.5 : avg > target + 4 ? -0.6 : -0.1;
  if (best === 1) d += 0.8;
  s.brand.fans = clamp(s.brand.fans + d, 0, 100);
  const merch = round2(s.brand.fans * 0.012);
  me.cash = round2(me.cash + merch);
  me.ledger.income += merch;
  me.ledger.sponsors += merch;
}

/** Weekly: fans drift back to the team's heritage level, and the backlash arrives on time. */
export function brandWeekly(s: CareerState) {
  publishIdentity(s);
  // sponsors read the team's form, the story around it and its standing: results and headlines move their mood
  const sm = multiply(s, s.teamId, ["form", "story", "reputation"]).value;
  for (const sp of s.teams[s.teamId].sponsors) sp.mood = clamp(sp.mood + (sm - 1) * 0.12, 0, 1);
  const b = s.brand;
  const base = fansBase(s.teamId);
  const fm = multiply(s, s.teamId, ["form", "story"]).value;
  // results and the story around the team move the fans, scaled by how much the team's identity means to them
  // a driver chasing a record pulls fans in
  const chasers = driversOf(s, s.teamId).filter((d) => chaseOf(s, d).on).length;
  b.fans = clamp(b.fans + (base - b.fans) * 0.01 + (fm - 1) * 1.4 * (0.6 + heritageOf(s.teamId) * 0.6) + 0.25 * chasers, 0, 100);
  if (b.backlashDue != null && s.day >= b.backlashDue && !s.cards.some((c) => c.kind === "fanBacklash")) {
    b.backlashDue = null;
    const sp = s.teams[s.teamId].sponsors.find((x) => x.id === b.by);
    if (!sp) return;
    const h = heritageOf(s.teamId);
    if (b.fans > 45 && h < 0.5) { ticker(s, "The fans got used to the new look.", 1); return; }
    const fee = sp.breakFee ?? 1;
    pushCard(s, "fanBacklash", "Fan backlash", `Supporters are angry about the ${sp.terms?.kind === "rename" ? "new team name" : "new colours"} that ${sp.name} paid for. Fan mood is ${Math.round(b.fans)} out of 100 and the board has noticed. ${sp.name} want you to hold your nerve.`, [
      { id: "hold", label: "Hold firm", detail: `${sp.name} are pleased, fans grumble on`, lines: ["Sponsor mood up. Fans down a little more."] },
      { id: "fanday", label: "Fan day and a gesture", detail: "Costs $1.5m, wins some fans back", lines: ["Fans up a little. The deal stays."] },
      { id: "revert", label: "Break the deal and go back", detail: `Costs ${fmtMoney(fee)}, brings the old look back`, lines: ["Fans cheer. Lose the money."] },
    ], { urgency: 2, deadline: s.day + 10, defaultOption: "hold", data: { sponsorId: sp.id } });
  }
  if (b.fans < 22 && s.day % 28 < 7) { const me = s.teams[s.teamId]; boardMove(s, me, -1, "Fans have drifted away"); }
}

export function resolveBacklash(s: CareerState, option: string, sponsorId: number) {
  const me = s.teams[s.teamId];
  const sp = me.sponsors.find((x) => x.id === sponsorId);
  if (!sp) return;
  if (option === "hold") {
    sp.mood = clamp(sp.mood + 0.1, 0, 1);
    s.brand.fans = clamp(s.brand.fans - 3, 0, 100);
    boardMove(s, me, -2, "Fan backlash");
    recap(s, "You held firm. The sponsor is pleased; the fans are not.");
  } else if (option === "fanday") {
    me.cash = round2(me.cash - 1.5);
    me.ledger.costs += 1.5;
    s.brand.fans = clamp(s.brand.fans + 5, 0, 100);
    logSpend(s, "Fan day after the sponsor backlash", { cash: -1.5 });
    recap(s, "A fan day softened the mood.");
  } else {
    const r = endSponsor(s, sponsorId);
    recap(s, r.message);
  }
}

// ---------------------------------------------------------------- the team's own livery choice

export const LIVERY_COOLDOWN = 365;
export const baseColour = (s: CareerState): number => TEAMS.find((t) => t.id === s.teamId)?.color ?? 0xff3b3b;

export interface LiveryPreview {
  ok: boolean;
  /** Why not, when not ok. */
  why?: string;
  cost: number;
  fans: number;
  board: number;
  sponsorMood: number;
  /** A sponsor whose colour you would be dropping: the deal ends and the fee is due. */
  breaks: Sponsor | null;
  lines: string[];
}

/** What a new colour would do, before the player commits. Pass null for the team's own colours. */
export function liveryPreview(s: CareerState, color: number | null): LiveryPreview {
  const base = baseColour(s);
  const target = color == null ? base : color;
  const now = teamColour(s);
  const h = heritageOf(s.teamId);
  const out: LiveryPreview = { ok: true, cost: 0, fans: 0, board: 0, sponsorMood: 0, breaks: null, lines: [] };
  if (target === now) return { ...out, ok: false, why: "That is the colour the car wears already." };
  const wait = LIVERY_COOLDOWN - (s.day - (s.brand.liveryDay ?? -9999));
  if (wait > 0) return { ...out, ok: false, why: `You changed the look recently. The fans would call it a circus. Wait ${wait} more days.` };
  const c = identityCost(s, "livery");
  const home = target === base;
  out.cost = round2(0.5 + 0.5 * h);
  if (home) {
    out.fans = Math.round(3 + h * 5);
    out.sponsorMood = 0.03;
    out.lines.push(`Going back to the team's own colours: fans about +${out.fans}. ${h >= 0.5 ? "The old guard will love it." : "Most will shrug."}`);
  } else {
    const away = now === base ? 1 : 0.6;
    out.fans = -Math.round(c.fans * 0.7 * away);
    out.board = -Math.round(c.board * 0.5 * away);
    out.sponsorMood = -0.04;
    out.lines.push(`A new colour: fans about ${out.fans}, board about ${out.board}. ${h >= 0.5 ? `${heritageWord(h)[0].toUpperCase()}${heritageWord(h).slice(1)}: expect a loud reaction.` : "A young team can get away with it."}`);
    out.lines.push("Merchandise sales dip for a few weeks while old stock sits on the shelves.");
  }
  const sp = s.teams[s.teamId].sponsors.find((x) => x.id === s.brand.by);
  if (sp && s.brand.by != null) {
    const theirs = sp.terms?.color;
    if (theirs != null && theirs !== target) {
      out.breaks = sp;
      out.lines.push(`${sp.name} paid for the current colours. Repainting breaks their deal: the ${fmtMoney(sp.breakFee ?? sp.retainer * 0.3)} fee is due and their retainer ends.`);
    }
  }
  out.lines.push(`Repaint and new merchandise: ${fmtMoney(out.cost)}. Every other sponsor notes the change (mood ${out.sponsorMood >= 0 ? "+" : ""}${Math.round(out.sponsorMood * 100)}%).`);
  return out;
}

export function changeLivery(s: CareerState, color: number | null): { ok: boolean; message: string } {
  const pv = liveryPreview(s, color);
  if (!pv.ok) return { ok: false, message: pv.why ?? "Not possible." };
  const me = s.teams[s.teamId];
  const fee = pv.breaks ? (pv.breaks.breakFee ?? round2(pv.breaks.retainer * 0.3)) : 0;
  if (me.cash < pv.cost + fee) return { ok: false, message: `Not enough cash: ${fmtMoney(pv.cost + fee)} needed.` };
  if (pv.breaks) endSponsor(s, pv.breaks.id);
  me.cash = round2(me.cash - pv.cost);
  me.ledger.costs += pv.cost;
  logSpend(s, "New livery: repaint and merchandise", { cash: -pv.cost });
  const base = baseColour(s);
  const target = color == null ? base : color;
  s.brand.color = target === base ? null : target;
  s.brand.liveryDay = s.day;
  publishIdentity(s);
  s.brand.fans = clamp(s.brand.fans + pv.fans, 0, 100);
  boardMove(s, me, pv.board, "A livery change");
  for (const sp of me.sponsors) sp.mood = clamp(sp.mood + pv.sponsorMood, 0, 1);
  const h = heritageOf(s.teamId);
  news(s, `${teamLabel(s)} unveil ${target === base ? "their traditional colours again" : "a new livery"}. ${target === base ? "Fans are delighted." : h >= 0.5 ? "Traditionalists are not happy." : "Reaction is mixed."}`, { importance: 2, cause: "The team changed its livery", tag: "people" });
  return { ok: true, message: `New livery on the cars. Fans ${pv.fans >= 0 ? "+" : ""}${pv.fans}, board ${pv.board >= 0 ? "+" : ""}${pv.board}.${pv.breaks ? ` ${pv.breaks.name} deal ended.` : ""}` };
}
