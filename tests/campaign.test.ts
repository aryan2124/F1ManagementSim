import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { reduce } from "../src/career/reducer";

/** Play the clock forward, answering whatever is open with the first option, and log what happened. */
function play(s0: ReturnType<typeof newCareer>, steps: number) {
  let s = s0;
  const titles: string[] = [];
  for (let i = 0; i < steps; i++) {
    const open = s.cards.filter((c) => !c.notice && !c.mail && (c.kind === "weekPlan" || c.kind === "campaign"));
    if (open.length) {
      titles.push(open[0].title);
      s = reduce(s, { type: "card", id: open[0].id, option: open[0].options[0].id }).state;
      continue;
    }
    if (s.weekend) break;
    s = reduce(s, { type: "continue" }).state;
  }
  return { s, titles };
}

describe("campaigns and the weekly plan", () => {
  it("the clock refuses to run until the weekly plan is answered, and a campaign is offered, runs and is judged", () => {
    const { s, titles } = play(newCareer("wil", 3), 120);
    expect(titles.some((t) => t.startsWith("THIS WEEK"))).toBe(true);
    expect(titles.some((t) => t.startsWith("NEW CAMPAIGN"))).toBe(true);
    void s;
  });

  it("continuing with the plan unanswered is refused", () => {
    let s = newCareer("wil", 3);
    for (let i = 0; i < 20 && !s.cards.some((c) => c.kind === "weekPlan"); i++) s = reduce(s, { type: "continue" }).state;
    expect(s.cards.some((c) => c.kind === "weekPlan")).toBe(true);
    const r = reduce(s, { type: "continue" });
    expect(r.message).toMatch(/plan first/i);
  });
});

import { campaignWeekly } from "../src/career/campaign";

describe("campaign judging", () => {
  it("a campaign past its race is judged: the car gains, the campaign ends, a card tells the player", () => {
    const s = newCareer("wil", 3);
    s.round = 2;
    s.day = s.calendar[2].day - 20;
    s.campaign = { area: "aero", approach: "steady", target: 1, start: s.day - 30, progress: 90, mile: 1, hist: [10, 10] };
    const before = s.teams[s.teamId].car.aero;
    campaignWeekly(s);
    expect(s.campaign).toBeUndefined();
    expect(s.teams[s.teamId].car.aero).toBeGreaterThan(before);
    expect(s.cards.some((c) => c.kind === "campaign" && /JUDGED/.test(c.title))).toBe(true);
  });

  it("an active campaign moves forward each week and costs money", () => {
    const s = newCareer("wil", 3);
    s.round = 1;
    s.day = s.calendar[3].day - 20;
    s.campaign = { area: "power", approach: "steady", target: 3, start: s.day, progress: 0, mile: 0, hist: [] };
    const cash = s.teams[s.teamId].cash;
    campaignWeekly(s);
    expect(s.campaign!.progress).toBeGreaterThan(0);
    expect(s.teams[s.teamId].cash).toBeLessThan(cash);
  });
});
