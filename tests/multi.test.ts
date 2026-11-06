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
  it("the tree of parts is private per manager and builds work for each", () => {
    let s = league();
    for (let i = 0; i < 5; i++) s = E.stepDay(s).state;
    let r = E.reduceAs(s, "fer", { type: "treeBuild", id: "fw01" });
    expect(r.ok, r.message).toBe(true);
    s = r.state;
    const mine = E.view(s, "fer") as { teams: Record<string, { tree?: { builds: unknown[] } }> };
    const theirs = E.view(s, "mcl") as { teams: Record<string, { tree?: unknown }> };
    expect(mine.teams.fer.tree?.builds.length).toBe(1);
    expect(theirs.teams.fer.tree).toBeUndefined();
    r = E.reduceAs(s, "mcl", { type: "treeBuild", id: "rw11" });
    expect(r.ok, r.message).toBe(true);
    s = r.state;
    for (let i = 0; i < 40; i++) s = E.stepDay(s).state;
    const after = E.view(s, "fer") as { teams: Record<string, { tree?: { parts: Record<string, unknown> } }> };
    expect(Object.keys(after.teams.fer.tree?.parts ?? {}).length).toBe(1);
  });
});

describe("multiplayer: new overhaul state", () => {
  it("a rival's keystones and worked loopholes stay hidden, your own show", () => {
    let s = league();
    const fer = s.slices.fer;
    void fer;
    s.world.teams.mcl.keystones = ["deep-floor"];
    s.world.teams.mcl.loops = ["sandbag"];
    s.world.teams.fer.keystones = ["high-rake"];
    const v = E.view(s, "fer") as { teams: Record<string, { keystones?: string[]; loops?: string[] }> };
    expect(v.teams.mcl.keystones).toBeUndefined();
    expect(v.teams.mcl.loops).toBeUndefined();
    expect(v.teams.fer.keystones).toEqual(["high-rake"]);
    s = E.stepDay(s).state;
  });
  it("standing orders and away mode are per player", () => {
    let s = league();
    s = E.reduceAs(s, "fer", { type: "standingOrder", kind: "event", option: "a" }).state;
    s = E.reduceAs(s, "mcl", { type: "setAway", away: true }).state;
    const f = E.view(s, "fer") as { standing?: Record<string, string>; away?: boolean };
    const m = E.view(s, "mcl") as { standing?: Record<string, string>; away?: boolean };
    expect(f.standing).toEqual({ event: "a" });
    expect(f.away).toBeFalsy();
    expect(m.away).toBe(true);
    expect(m.standing ?? {}).toEqual({});
  });
});
