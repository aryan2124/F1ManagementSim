import { designEra } from "./eras";
import { MODULE_BY_ID } from "./modules";
import { addArea } from "./traits";
import { round2 } from "./util";
import { AREAS, TRAITS, type CareerState, type Trait } from "./types";

/**
 * Tutorial only: switch the practice career to a big, simple rulebook right now.
 * THE ELECTRIC ERA: a much larger electric share of power (a new battery deployment setting) and push to pass boost tokens in the race.
 * What the old rules paid for is worth less and what they ignored is worth more, and every team's figures are pulled toward the middle.
 */
export function launchTutorialEra(s: CareerState) {
  const era = designEra(s, s.year, 90);
  era.theme = "power";
  era.stage = 5;
  era.length = 4;
  era.modules = [
    { id: "deployMaps", role: "headline", intensity: 0.8, lobby: 0 },
    { id: "pushToPass", role: "support", intensity: 0.6, lobby: 0 },
  ];
  era.unknowns = era.modules.flatMap((m) => MODULE_BY_ID[m.id].unknowns.map((label, i) => ({ id: `${m.id}:${i}`, moduleId: m.id, label, truth: 0.5 })));
  era.routes = era.routes.map((r) => ({ ...r, weights: {} }));
  s.era.current = era;
  s.era.next = designEra(s, s.year + era.length, 91);
  s.era.past.push({ number: era.number, theme: era.theme, startYear: era.startYear, modules: era.modules.map((m) => m.id), story: ["The tutorial's electric era."] });
  const w = (s.regW ??= Object.fromEntries(TRAITS.map((t) => [t, 1])) as Record<Trait, number>);
  const me = s.teams[s.teamId];
  const ranked = [...TRAITS].sort((x, y) => me.dna[y] - me.dna[x]);
  for (const t of ranked.slice(0, 3)) w[t] = round2(w[t] * 0.45);
  for (const t of ranked.slice(-3)) w[t] = round2(Math.max(w[t] + 0.3, Math.min(2.6, w[t] * 1.9)));
  for (const area of AREAS) {
    const ts = Object.values(s.teams);
    const mean = ts.reduce((x, t) => x + t.car[area], 0) / ts.length;
    for (const t of ts) addArea(t, area, round2(mean + (t.car[area] - mean) * 0.6) - t.car[area]);
  }
}
