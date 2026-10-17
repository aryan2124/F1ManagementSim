// @ts-nocheck
import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { advanceDay, resolveCard } from "../src/career/tick";
import { openTalk, askPriority, soundOut } from "../src/career/talks";
import { planSession } from "../src/career/weekend";
import { QualiSession } from "../src/game/qsession";
import { RaceSession } from "../src/game/session";
import { allOut } from "../src/ui/SkipPrompt";
import { skipVerdict, SKIP_SPEED, SessionRelay } from "../src/shared/careerNet";
import { careerEngine as E } from "../src/career/multi";

function toWeekend(s) {
  let guard = 0;
  while (!s.weekend && guard++ < 400) {
    for (const c of [...s.cards]) if (c.options.length > 1 && c.urgency >= 2) resolveCard(s, c.id, c.defaultOption ?? c.options[0].id);
    advanceDay(s);
  }
}

describe("talks cannot be asked the same thing twice", () => {
  it("each feeler goes out once per set of talks", () => {
    const s = newCareer("wil", 4);
    const rival = Object.values(s.drivers).find((d) => d.teamId && d.teamId !== s.teamId && !d.retired);
    const r = openTalk(s, "driver", rival.id);
    expect(r.ok).toBe(true);
    const t = r.talk;
    expect(askPriority(s, t).ok).toBe(true);
    t.status = "open";
    expect(askPriority(s, t).ok).toBe(false);
    expect(soundOut(s, t).ok).toBe(true);
    t.status = "open";
    const again = soundOut(s, t);
    expect(again.ok).toBe(false);
    expect(again.message).toMatch(/already/);
  });
});

describe("help level is chosen at the start", () => {
  it("a new career carries the chosen level and shows no in-game question", () => {
    for (const g of ["off", "hints", "full"]) {
      const s = newCareer("wil", 4, 1, "quick", { guidance: g });
      expect(s.guidance).toBe(g);
      expect(s.cards.some((c) => c.kind === "welcome")).toBe(false);
    }
    expect(newCareer("wil", 4).guidance).toBe("off");
  });
  it("a league founder gets the level from the create settings", () => {
    const ms = E.create({ seed: 5, teamId: "fer", settings: { extra: { guidance: "full", raceLength: "quick" } } });
    expect(ms.slices.fer.top.guidance).toBe("full");
  });
});

describe("skipping a session when every car is out", () => {
  it("qualifying: out only once all your drivers are eliminated, and skip finishes it", () => {
    const s = newCareer("wil", 9, 1, "quick");
    toWeekend(s);
    const plan = planSession(s, "quali");
    const q = new QualiSession(plan.qualiCfg ?? plan.cfg, plan.humanIds);
    expect(allOut(q, q.humanIds)).toBe(false);
    q.skipToEnd();
    expect(q.sim.phase).toBe("done");
    expect(allOut(q, q.humanIds)).toBe(false);
  }, 120000);
  it("the race: a retired car counts as out, and skip runs it to the flag", () => {
    const s = newCareer("wil", 9, 1, "quick");
    toWeekend(s);
    const plan = planSession(s, "race");
    const r = new RaceSession(plan.raceCfg, plan.humanIds);
    expect(allOut(r, r.humanIds)).toBe(false);
    for (const id of r.humanIds) r.sim.car(id).status = "dnf";
    expect(allOut(r, r.humanIds)).toBe(true);
    // one still running in a league means nobody may skip
    r.sim.car(r.humanIds[0]).status = "running";
    expect(allOut(r, r.humanIds)).toBe(false);
    r.sim.car(r.humanIds[0]).status = "dnf";
    r.skipToEnd();
    expect(r.sim.phase).toBe("finished");
  }, 180000);
});

describe("the league vote to skip", () => {
  const rand0 = () => 0.1;
  const rand1 = () => 0.9;
  it("is open until a side has a majority or everyone has voted", () => {
    expect(skipVerdict({}, ["a", "b", "c"], rand0)).toBeNull();
    expect(skipVerdict({ a: "skip" }, ["a", "b", "c"], rand0)).toBeNull();
    expect(skipVerdict({ a: "skip", b: "skip" }, ["a", "b", "c"], rand0)).toBe("skip");
    expect(skipVerdict({ a: "watch", b: "watch" }, ["a", "b", "c"], rand0)).toBe("watch");
  });
  it("a tie is settled at random", () => {
    const b = { a: "skip", b: "watch" };
    expect(skipVerdict(b, ["a", "b"], rand0)).toBe("skip");
    expect(skipVerdict(b, ["a", "b"], rand1)).toBe("watch");
    expect(skipVerdict({ a: "skip" }, ["a", "b"], rand0)).toBeNull();
  });
  it("a lone voter decides at once", () => {
    expect(skipVerdict({ a: "watch" }, ["a"], rand0)).toBe("watch");
  });
  it("skipping runs the session clock flat out", () => {
    const relay = SessionRelay.create("t", "x", {}, ["a", "b"]);
    relay.start(1000);
    const r = relay.forceSpeed(SKIP_SPEED, 2000);
    expect(r?.seg.speed).toBe(SKIP_SPEED);
    expect(relay.speed()).toBe(SKIP_SPEED);
  });
  it("the league engine accepts a skip vote and nothing else", () => {
    let ms = E.create({ seed: 5, teamId: "fer", settings: { extra: { raceLength: "quick" } } });
    ms = E.assign(ms, "fer", "p1");
    const ok = E.reduceAs(ms, "fer", { type: "vote", topic: "skip", option: "skip" });
    expect(ok.ok).toBe(true);
    expect(E.reduceAs(ms, "fer", { type: "vote", topic: "skip", option: "dance" }).ok).toBe(false);
    expect(E.reduceAs(ms, "fer", { type: "vote", topic: "rules", option: "skip" }).ok).toBe(false);
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { SkipPrompt } from "../src/ui/SkipPrompt";

describe("the skip prompt on screen", () => {
  it("alone: a skip button once the drivers are out, nothing before", () => {
    const s = newCareer("wil", 9, 1, "quick");
    toWeekend(s);
    const plan = planSession(s, "quali");
    const q = new QualiSession(plan.qualiCfg ?? plan.cfg, plan.humanIds);
    expect(renderToStaticMarkup(createElement(SkipPrompt, { session: q }))).toBe("");
    for (const id of q.humanIds) (q.sim.car(id) as any).eliminatedIn = 1;
    expect(renderToStaticMarkup(createElement(SkipPrompt, { session: q }))).toContain("SKIP TO THE RACE");
  }, 60000);
  it("in a league: the vote only shows when everyone is out, and then shows the tally and the settled result", () => {
    const s = newCareer("wil", 9, 1, "quick");
    toWeekend(s);
    const plan = planSession(s, "quali");
    const q = new QualiSession(plan.qualiCfg ?? plan.cfg, plan.humanIds);
    const others = [...Object.values(q.sim.cars)].map((c: any) => c.id).filter((id) => !q.humanIds.includes(id)).slice(0, 2);
    const net = { allHumanIds: [...q.humanIds, ...others], votes: {}, myTeam: "wil", cast: () => {} };
    for (const id of q.humanIds) (q.sim.car(id) as any).eliminatedIn = 1;
    // a rival manager's car is still in: no prompt
    expect(renderToStaticMarkup(createElement(SkipPrompt, { session: q, net }))).toBe("");
    for (const id of others) (q.sim.car(id) as any).eliminatedIn = 1;
    const open = renderToStaticMarkup(createElement(SkipPrompt, { session: q, net: { ...net, votes: { skip: { wil: "skip" } } } }));
    expect(open).toContain("KEEP WATCHING (0)");
    expect(open).toContain("SKIP TO THE RACE (1)");
    expect(open).toContain("tie is settled at random");
    const done = renderToStaticMarkup(createElement(SkipPrompt, { session: q, net: { ...net, votes: { skipResult: { result: "skip" } } } }));
    expect(done).toContain("voted to skip");
  }, 60000);
});
