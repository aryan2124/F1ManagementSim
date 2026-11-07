import { news } from "./cards";
import { planOf } from "./rndplan";
import { TRAIT_NAME } from "./traits";
import { round2 } from "./util";
import { TRAITS, type CareerState, type Trait } from "./types";

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
