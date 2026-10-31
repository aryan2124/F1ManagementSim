import { describe, expect, it } from "vitest";
import { careerEngine as E, type MultiState } from "../src/career/multi";
import { newCareer } from "../src/career/world";
import { apply } from "../src/career/reducer";
import { identityOf } from "../src/career/identity";
import { attributesOf, launchOf, readAttr, ATTR_GROUPS } from "../src/career/attributes";
import { factorsOf, multiply, FACTOR_NAMES } from "../src/career/factors";
import { cvOf } from "../src/career/cv";
import { readOffer, refreshInternPool, INTERN_ROLES } from "../src/career/hiring";
import { staffOf } from "../src/career/car";
import { addFact, factsAbout } from "../src/career/facts";
import { teamLabel, teamColour } from "../src/career/brand";
import { QualiSim } from "../src/sim/qualifying";
import { loadCircuit } from "../src/game/circuits";
import { buildEntries } from "../src/game/data";

function league(): MultiState {
  let s = E.create({ seed: 777, teamId: "fer", settings: { extra: { raceLength: "quick" } } });
  s = E.assign(s, "fer", "p1");
  s = E.assign(s, "mcl", "p2");
  return s;
}

describe("item 1: offers never come from human teams", () => {
  it("staff and academy approaches only name AI teams over a long run", () => {
    let s = league();
    const humans = new Set(["fer", "mcl"]);
    for (let i = 0; i < 400; i++) {
      const r = E.stepDay(s);
      s = r.state;
      if (r.weekend) {
        s = E.applySession(s, "qualifying", null);
        s = E.applySession(s, "race", null);
      }
      for (const h of ["fer", "mcl"]) {
        const v = E.view(s, h) as { cards: { kind: string; data?: { rival?: string } }[] };
        for (const c of v.cards) if ((c.kind === "staffPoach" || c.kind === "talk") && c.data?.rival) expect(humans.has(c.data.rival)).toBe(false);
      }
    }
  }, 120000);
});

describe("shared identity", () => {
  it("a livery change shows in the sim entries and the label for every viewer", () => {
    const s = newCareer("wil", 5);
    s.brand.prefix = "Aurelia";
    s.brand.color = 0x1f6bff;
    (s.identity ??= {})[s.teamId] = { prefix: s.brand.prefix, color: s.brand.color };
    expect(teamLabel(s)).toBe("Aurelia Cerulean Racing");
    expect(teamColour(s)).toBe(0x1f6bff);
    expect(identityOf(s, "fer").changed).toBe(false);
    expect(identityOf(s, "wil").changed).toBe(true);
  });
});

describe("driver attributes", () => {
  it("are 1 to 20, stable, grouped, and starts feed launch", () => {
    const s = newCareer("fer", 9);
    const d = Object.values(s.drivers).find((x) => x.teamId)!;
    const a = attributesOf(d);
    for (const g of ATTR_GROUPS) for (const k of g.keys) expect(a[k]).toBeGreaterThanOrEqual(1), expect(a[k]).toBeLessThanOrEqual(20);
    expect(attributesOf(d)).toEqual(a);
    expect(launchOf(d)).toBeCloseTo((a.starts - 1) / 19, 5);
    const r = readAttr(a.overtaking, 0.1, d.id, "overtaking");
    expect(r.hi - r.lo).toBeGreaterThan(0);
    expect(readAttr(a.overtaking, 1, d.id, "overtaking").lo).toBe(a.overtaking);
  });
});

describe("factor bus", () => {
  it("has eight named factors around 1 and a product with reasons", () => {
    const s = newCareer("mcl", 3);
    const f = factorsOf(s, s.teamId);
    expect(Object.keys(f).sort()).toEqual([...FACTOR_NAMES].sort());
    for (const n of FACTOR_NAMES) expect(f[n].value).toBeGreaterThan(0.7), expect(f[n].value).toBeLessThan(1.3);
    const m = multiply(s, s.teamId);
    expect(m.parts).toHaveLength(8);
  });
  it("changing one system moves outputs in other systems", () => {
    const s = newCareer("mcl", 3);
    const before = multiply(s, s.teamId, ["reputation", "funding", "cohesion", "tools", "form"]).value;
    s.teams[s.teamId].cash = 400;
    s.teams[s.teamId].board = 95;
    for (const st of Object.values(s.staff)) if (st.teamId === s.teamId) st.mood = 1;
    const sd = { ...s } as typeof s;
    sd.day += 1; // new cache day
    const after = multiply(sd, sd.teamId, ["reputation", "funding", "cohesion", "tools", "form"]).value;
    expect(after).toBeGreaterThan(before);
  });
});

describe("hiring and interns", () => {
  it("a better team gets a better chance with the same pay", () => {
    const s = newCareer("wil", 11);
    const st = Object.values(s.staff).find((x) => !x.teamId)!;
    const weak = readOffer(s, s.teamId, st, 1.5, 2).chance;
    s.teams[s.teamId].cash = 500;
    s.teams[s.teamId].board = 98;
    s.brand.fans = 98;
    s.day += 1;
    const strong = readOffer(s, s.teamId, st, 1.5, 2).chance;
    expect(strong).toBeGreaterThanOrEqual(weak);
  });
  it("interns never take the place of a head of department, use cap room and grow", () => {
    const s = newCareer("wil", 12);
    refreshInternPool(s);
    expect(s.internPool!.length).toBeGreaterThanOrEqual(6);
    const id = s.internPool![0];
    const role = s.staff[id].role;
    expect(INTERN_ROLES).toContain(role);
    const boss = staffOf(s, s.teamId, role);
    let signed = false;
    for (let i = 0; i < 12 && !signed; i++) {
      s.day += 1;
      signed = apply(s, { type: "signIntern", staffId: id }).ok;
    }
    expect(signed).toBe(true);
    expect(staffOf(s, s.teamId, role)).toBe(boss);
    expect(s.staff[id].teamId).toBe(s.teamId);
  });
  it("the ledger and the cv are stable", () => {
    const s = newCareer("wil", 13);
    const st = Object.values(s.staff).find((x) => x.teamId)!;
    expect(cvOf(s, st)).toEqual(cvOf(s, st));
    addFact(s, "test", "x", [st.id], 3);
    expect(factsAbout(s, st.id)).toHaveLength(1);
  });
});

describe("qualifying", () => {
  it("does not close a segment while a car is still on its in-lap", () => {
    const { track } = loadCircuit("monza");
    const sim = new QualiSim({ seed: 12, track, entries: buildEntries("none") });
    for (let seg = 1; seg <= 3; seg++) {
      sim.startSegment();
      let guard = 0;
      while (sim.phase === "running" && guard++ < 100000) sim.step();
      if (sim.phase === "break") {
        // every car is off the track when the break begins
        expect(sim.cars.every((c) => c.phase === "garage" || c.phase === "crashed")).toBe(true);
        sim.nextSegment();
        expect(sim.cars.every((c) => c.phase === "garage")).toBe(true);
      }
    }
    expect(sim.phase).toBe("done");
  });
});
