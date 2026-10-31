import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { autoPlaySeasons, autoPlayDays } from "../src/career/headless";
import { apply } from "../src/career/reducer";
import { REAL } from "../src/career/records";
import { expectedRole } from "../src/career/status";
import { openConvo, convoSay } from "../src/career/convo";
import { crewEffect, ensureCrew, newCrew, setSlot, chemistry } from "../src/career/pitcrew";
import { generateTrack, PROFILES } from "../src/audio/musicGen";
import { TRACK_NAMES, compileDef } from "../src/audio/music";
import { buildEngineLoop, layerWeights, rpmFor } from "../src/audio/engineSynth";

describe("career records", () => {
  it("starts from the real totals and exposes them", () => {
    const s = newCareer("fer", 3, 1, "quick");
    const ham = s.drivers["dr-har"];
    expect(ham.rec?.p1).toBe(REAL["dr-har"][0]);
    expect(ham.rec?.wdc.length).toBe(7);
    expect(s.teams.fer.wcc?.length).toBe(16);
    expect(s.teams.mcl.wcc?.length).toBe(10);
  });
  it("counts new wins on top, and awards a title with the ceremony queued", () => {
    const s = newCareer("mcl", 4, 1, "quick");
    const before = Object.values(s.drivers).reduce((n, d) => n + (d.rec?.p1 ?? 0), 0);
    autoPlaySeasons(s, 1);
    const after = Object.values(s.drivers).reduce((n, d) => n + (d.rec?.p1 ?? 0), 0);
    expect(after).toBeGreaterThan(before);
    const champs = Object.values(s.drivers).filter((d) => d.rec?.wdc.includes(2026));
    expect(champs.length).toBe(1);
    expect(Object.values(s.teams).filter((t) => t.wcc?.includes(2026)).length).toBe(1);
    expect((s.achievements ?? []).length).toBeGreaterThan(5);
  }, 240000);
});

describe("roles", () => {
  it("a champion is not an equal of a pay driver, and the old hand takes the lead at Verdant Racing", () => {
    const s = newCareer("ast", 5, 1, "quick");
    const alo = s.drivers["dr-gar"];
    const str = s.drivers["dr-bri"];
    expect(expectedRole(alo, str)).toBe("number1");
    expect(alo.role).toBe("number1");
  });
  it("demoting a proud driver makes him unhappy", () => {
    const s = newCareer("ast", 5, 1, "quick");
    const alo = s.drivers["dr-gar"];
    const g = alo.grievance;
    apply(s, { type: "setRole", driverId: "dr-gar", role: "number2" });
    expect(alo.grievance).toBeGreaterThan(g);
    expect(alo.causes.role).toBeGreaterThan(0);
  });
});

describe("conversations", () => {
  it("opens with what he cares about and ends in a reaction", () => {
    const s = newCareer("ast", 5, 1, "quick");
    apply(s, { type: "setRole", driverId: "dr-gar", role: "number2" });
    const id = openConvo(s, s.drivers["dr-gar"]);
    expect(id).not.toBeNull();
    const cv = s.convos!.find((c) => c.id === id)!;
    expect(cv.lines.length).toBeGreaterThan(0);
    expect(cv.options.length).toBeGreaterThan(1);
    convoSay(s, cv.id, cv.options[0].id);
    expect(cv.lines.some((l) => l.who === "you")).toBe(true);
  });
});

describe("pit crew", () => {
  it("chemistry lowers the chance of a bad stop, and a shuffle costs familiarity", () => {
    const crew = newCrew("mcl", 0.8, 9);
    const base = crewEffect(crew);
    const c2 = structuredClone(crew);
    for (const k of Object.keys(c2.bond)) c2.bond[k] = 0;
    expect(crewEffect(c2).fumble).toBeGreaterThan(base.fumble);
    const c3 = structuredClone(crew);
    const spare = c3.members.find((m) => !c3.lineup.includes(m.id))!;
    const before = chemistry(c3);
    setSlot(c3, 0, spare.id);
    expect(chemistry(c3)).toBeLessThan(before);
  });
  it("is created lazily for every team", () => {
    const s = newCareer("fer", 1, 1, "quick");
    expect(ensureCrew(s, "fer", 0.88).members).toHaveLength(12);
  });
});

describe("music", () => {
  it("writes a different valid tune for every seed and every scene", () => {
    for (const scene of TRACK_NAMES) {
      const a = generateTrack(scene, 1);
      const b = generateTrack(scene, 2);
      expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
      expect(JSON.stringify(generateTrack(scene, 1))).toBe(JSON.stringify(a));
      expect(a.chords).toHaveLength(8);
      expect(a.melody).toHaveLength(8);
      expect(a.bpm).toBeGreaterThanOrEqual(PROFILES[scene].bpm[0]);
      const comp = compileDef(a);
      expect(comp.steps).toHaveLength(128);
      expect(comp.steps.some((st) => st.some((e) => e.kind === "lead"))).toBe(true);
    }
    const bpms = new Set(Array.from({ length: 40 }, (_, i) => generateTrack("race", i).drums + generateTrack("race", i).bass));
    expect(bpms.size).toBeGreaterThan(8);
  });
});

describe("engine sound", () => {
  it("loops without a seam and rises in pitch with the revs", () => {
    const lo = buildEngineLoop(44100, 5000, 1);
    const hi = buildEngineLoop(44100, 13000, 1);
    expect(lo.data.length).toBeGreaterThan(1000);
    expect(Math.abs(hi.rpm - 13000) / 13000).toBeLessThan(0.03);
    expect(Math.abs(lo.rpm - 5000) / 5000).toBeLessThan(0.03);
    expect(hi.rpm).toBeGreaterThan(lo.rpm);
    expect(Math.abs(lo.data[0]! - lo.data[lo.data.length - 1]!)).toBeLessThan(0.5);
    expect(layerWeights(9000).reduce((a, b) => a + b, 0)).toBeGreaterThan(0.9);
    expect(rpmFor(80).rpm).toBeGreaterThan(rpmFor(5).rpm);
  });
});

describe("a season stays healthy", () => {
  it("runs a few weeks with the new people systems on", () => {
    const s = newCareer("ast", 8, 1, "quick");
    autoPlayDays(s, 90);
    expect(Number.isFinite(s.teams.ast.cash)).toBe(true);
  }, 120000);
});

import { loadCircuit } from "../src/game/circuits";
import { buildEntries } from "../src/game/data";
import { RaceSim } from "../src/sim/engine";
import { runQualifying } from "../src/sim/qualifying";

describe("double stacking", () => {
  it("the second car of a team waits when both are called in together, and never shares the box", () => {
    const { track } = loadCircuit("silverstone");
    const entries = buildEntries("none");
    const cfg = { seed: 21, laps: 10, track, entries };
    const { rows } = runQualifying(cfg);
    const sim = new RaceSim({ ...cfg, grid: rows.map((q) => q.carId) });
    const team = sim.cars[0].entry.team.id;
    const pair = sim.cars.filter((c) => c.entry.team.id === team);
    expect(pair).toHaveLength(2);
    let overlapped = false;
    let guard = 0;
    let called = false;
    while (sim.phase !== "finished" && guard++ < 60000) {
      sim.step();
      if (!called && pair.every((c) => c.status === "racing") && pair[0].lap >= 2) {
        called = true;
        // put the team-mate a few car lengths behind so the stops land together
        pair[1].s = pair[0].s - 22;
        pair[1].v = pair[0].v;
        for (const c of pair) sim.command({ type: "pit", carId: c.id, compound: "H" } as never);
      }
      if (pair[0].status === "pit_stop" && pair[1].status === "pit_stop") overlapped = true;
      if (called && pair.every((c) => c.stops >= 1)) break;
    }
    for (let i = 0; i < 80; i++) sim.step();
    expect(called).toBe(true);
    expect(overlapped).toBe(false);
    expect(pair.every((c) => c.stops >= 1)).toBe(true);
    expect(sim.stackLog.length).toBeGreaterThanOrEqual(1);
    expect(sim.stackLog[0].wait).toBeGreaterThan(1);
  }, 120000);
});
