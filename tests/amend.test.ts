import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { apply } from "../src/career/reducer";
import { amendState, amendmentsMonthly, proposeAmendment } from "../src/career/amendments";
import { setKeystone } from "../src/career/keystones";

describe("amendments", () => {
  it("a banned keystone comes off every car and cannot be fitted again", () => {
    const s = newCareer("fer", 5);
    const rival = Object.keys(s.teams).find((id) => id !== s.teamId)!;
    s.teams[rival].keystones = ["deep-floor"];
    s.teams[s.teamId].cash = 5;
    // every other team votes for, by hand, so the outcome is not luck
    const r = proposeAmendment(s, s.teamId, "ban-keystone", "deep-floor");
    expect(r.ok, r.message).toBe(true);
    expect(proposeAmendment(s, s.teamId, "ban-keystone", "deep-floor").ok).toBe(false);
    for (const id of Object.keys(s.teams)) amendState(s).open!.votes[id] = id !== rival;
    amendmentsMonthly(s);
    expect(s.teams[rival].keystones).not.toContain("deep-floor");
    expect(amendState(s).banned).toContain("deep-floor");
    expect(setKeystone(s, s.teamId, 0, "deep-floor").ok).toBe(false);
    expect(amendState(s).history.at(-1)!.passed).toBe(true);
  });
  it("can be defeated", () => {
    const s = newCareer("fer", 6);
    s.teams[s.teamId].cash = 5;
    proposeAmendment(s, s.teamId, "ban-keystone", "deep-floor");
    for (const id of Object.keys(s.teams)) amendState(s).open!.votes[id] = false;
    amendmentsMonthly(s);
    expect(amendState(s).banned).toEqual([]);
    expect(apply).toBeTypeOf("function");
  });
});
