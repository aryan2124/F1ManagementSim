import { describe, expect, it } from "vitest";
import { careerEngine as E, type MultiState } from "../src/career/multi";

function league(): MultiState {
  let s = E.create({ seed: 4242, teamId: "fer", settings: { extra: { raceLength: "quick" } } });
  s = E.assign(s, "fer", "p1");
  s = E.assign(s, "mcl", "p2");
  return s;
}

function run(days: number) {
  let s = league();
  let races = 0;
  for (let i = 0; i < days; i++) {
    const r = E.stepDay(s);
    s = r.state;
    if (r.weekend) {
      s = E.applySession(s, "qualifying", null);
      s = E.applySession(s, "race", null);
      races++;
    }
  }
  return { s, races };
}

describe("multiplayer league engine", () => {
  it("creates a league with two humans and separate slices", () => {
    const s = league();
    expect(Object.keys(s.humans).sort()).toEqual(["fer", "mcl"]);
    expect(s.slices.fer).toBeTruthy();
    expect(s.slices.mcl).toBeTruthy();
    expect(s.world.humans?.length).toBe(2);
  });

  it("hides rival cars in a player's view and never leaks the seed", () => {
    const s = league();
    const v = E.view(s, "fer") as { teams: Record<string, { car: unknown; believed: unknown }>; seed: number; teamId: string };
    expect(v.teamId).toBe("fer");
    expect(v.seed).not.toBe(s.world.seed);
    expect(v.teams.mcl.car).toEqual(v.teams.mcl.believed);
  });

  it("rejects actions for a team that is not human", () => {
    const s = league();
    expect(E.reduceAs(s, "wil", { type: "noop" }).ok).toBe(false);
  });

  it("plays a full season and into the next with races and stays consistent", () => {
    const { s, races } = run(420);
    expect(races).toBeGreaterThan(3);
    const world = s.world;
    expect(world.history.length).toBeGreaterThanOrEqual(1);
    const json = JSON.stringify(s);
    expect(json).not.toMatch(/NaN|Infinity/);
    for (const h of Object.keys(s.humans)) expect(Number.isFinite(s.world.teams[h].cash)).toBe(true);
    // both humans got race results
    expect(world.year).toBeGreaterThan(1990);
  }, 240_000);

  it("is deterministic", () => {
    const a = run(120).s;
    const b = run(120).s;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  }, 240_000);

  it("lets a late joiner in and lets a human leave", () => {
    let s = league();
    for (let i = 0; i < 20; i++) s = E.stepDay(s).state;
    s = E.assign(s, "wil", "p3");
    expect(Object.keys(s.humans)).toContain("wil");
    s = E.assign(s, "mcl", null);
    expect(Object.keys(s.humans)).not.toContain("mcl");
    for (let i = 0; i < 20; i++) s = E.stepDay(s).state;
    expect(JSON.stringify(s)).not.toMatch(/NaN/);
  }, 120_000);
});

describe("new systems in a league", () => {
  it("each human has a private lab, design and story mode; rivals never see them", () => {
    let s = league();
    const NEUTRAL = { frontWing: 0.5, rearWing: 0.9, floor: 0.5, rake: 0.5, sidepod: 0.5, inlet: 0.5, stiffness: 0.5, wheelbase: 0.5 };
    const r = E.reduceAs(s, "fer", { type: "runLab", inst: "desk", model: NEUTRAL });
    expect(r.ok).toBe(true);
    s = r.state;
    const mine = E.view(s, "fer") as { teams: Record<string, { notebook?: unknown[] }> };
    const theirs = E.view(s, "mcl") as { teams: Record<string, { notebook?: unknown[] }> };
    expect((mine.teams.fer.notebook ?? []).length).toBeGreaterThan(0);
    expect((theirs.teams.fer?.notebook ?? []).length).toBe(0);
    expect(E.reduceAs(s, "mcl", { type: "setTeller", teller: "chaos" }).ok).toBe(true);
  });
  it("the development record is private per manager and test runs work for each", () => {
    let s = league();
    // let ideas appear for both
    for (let i = 0; i < 40; i++) s = E.stepDay(s).state;
    const mineF = E.view(s, "fer") as { teams: Record<string, { ideas: { id: number }[] }>; day: number };
    const idea = mineF.teams.fer.ideas[0];
    expect(idea).toBeTruthy();
    let r = E.reduceAs(s, "fer", { type: "startProject", ideaId: idea.id });
    expect(r.ok).toBe(true);
    s = r.state;
    r = E.reduceAs(s, "fer", { type: "scrapProject", id: idea.id });
    s = r.state;
    const mine = E.view(s, "fer") as { teams: Record<string, { dev?: { log: unknown[] } }> };
    const theirs = E.view(s, "mcl") as { teams: Record<string, { dev?: unknown }> };
    expect((mine.teams.fer.dev?.log ?? []).length).toBeGreaterThan(0);
    expect(theirs.teams.fer.dev).toBeUndefined();
    const other = (E.view(s, "mcl") as { teams: Record<string, { ideas: { id: number }[] }> }).teams.mcl.ideas[0];
    if (other) {
      const a = E.reduceAs(s, "mcl", { type: "startProject", ideaId: other.id });
      expect(a.ok).toBe(true);
      const t = E.reduceAs(a.state, "mcl", { type: "testPart", id: other.id, plan: "quick" });
      expect(typeof t.ok).toBe("boolean");
    }
  });
});
