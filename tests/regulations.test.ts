import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { MODULES } from "../src/career/modules";
import { newCareer } from "../src/career/world";
import { initDesigns } from "../src/career/design";
import { lockOf, startBuild, tickTree, treeOf } from "../src/career/ctree";
import { refreshMods } from "../src/career/treeplay";
import { rulesOf } from "../src/career/eras";

/**
 * Guard: every flag a regulation module can emit must be read by live code for the player's own career. rnd.ts
 * (the old R&D, now used by AI teams only) does not count. A flag with no reader is a rule that says something and
 * does nothing. If a flag must stay unbuilt, list it in KNOWN_GAPS with the reason, so the gap is a decision.
 */
const KNOWN_GAPS: Record<string, string> = {};

const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) ? [p] : []; });

describe("regulation modules", () => {
  const src = walk("src").filter((f) => !/career[\\/](modules|eras|rnd)\.ts$/.test(f));
  const text = src.map((f) => readFileSync(f, "utf8"));
  const flags = new Set<string>();
  for (const m of MODULES) for (const k of [0, 0.5, 1]) Object.keys(m.flags(k)).forEach((x) => flags.add(x));

  it("has a live reader for every flag, or the gap is on the list", () => {
    const dead = [...flags].filter((k) => !text.some((t) => new RegExp(`\\b${k}\\b`).test(t)));
    expect(dead.filter((k) => !(k in KNOWN_GAPS)).sort()).toEqual([]);
  });
  it("keeps the known gap list honest", () => {
    for (const k of Object.keys(KNOWN_GAPS)) expect(flags.has(k)).toBe(true);
    const fixed = Object.keys(KNOWN_GAPS).filter((k) => text.some((t) => new RegExp(`\\b${k}\\b`).test(t)));
    expect(fixed).toEqual([]);
  });

  const withModule = (id: string) => {
    const s = newCareer("fer", 21);
    initDesigns(s);
    const t = s.teams[s.teamId];
    t.cash = 900; t.capSpent = 0; t.facilities.factory = 5;
    s.era.current = { ...(s.era.current as object), startYear: s.year, length: 5, modules: [{ id, intensity: 0.5 }] } as never;
    return { s, t };
  };

  it("upgradeQuota caps the parts a season in the real tree", () => {
    const { s, t } = withModule("freedomAuction");
    const q = rulesOf(s).upgradeQuota as number;
    expect(q).toBe(3);
    const nodes = treeOf(s, t).nodes.filter((n) => n.tier === 1);
    let built = 0; const log: string[] = [];
    for (const n of nodes) {
      const r = startBuild(s, t, n.id, rulesOf(s)); log.push(r.message);
      if (r.ok) { built++; for (let i = 0; i < 40; i++) tickTree(s, t); }
    }
    expect(built, log.join(" | ")).toBe(q);
    const next = nodes.find((n) => !treeOf(s, t).parts[n.id])!;
    expect(lockOf(s, t, next, rulesOf(s)).ok).toBe(false);
  });
  it("areaMult scales what the tree's parts give", () => {
    const { s, t } = withModule("grenadeEra");
    refreshMods(s, t);
    expect(treeOf(s, t).mods?.gain.pu).toBeCloseTo(1.25, 2);
    expect(treeOf(s, t).mods?.gain.fw ?? 1).toBe(1);
  });
});
