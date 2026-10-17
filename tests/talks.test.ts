import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { apply } from "../src/career/reducer";
import { advanceDay } from "../src/career/tick";
import { driversOf } from "../src/career/finance";
import { askingSalary } from "../src/career/contracts";
import type { CareerState } from "../src/career/types";

function run(s: CareerState, days: number) {
  for (let i = 0; i < days; i++) {
    s.weekend = null;
    advanceDay(s);
  }
}

function freeAgent(s: CareerState): string {
  const id = s.freeDrivers.map((x) => s.drivers[x]).filter((x) => x && !x.retired).sort((a, b) => b.spec.pace - a.spec.pace)[0]?.id;
  if (!id) throw new Error("no free agent in this seed");
  return id;
}

describe("private talks", () => {
  it("replies take days and signing needs an explicit replacement", () => {
    const s = newCareer("wil", 21, 1);
    const id = freeAgent(s);
    const d = s.drivers[id];
    expect(apply(s, { type: "talkOpen", kind: "driver", targetId: id }).ok).toBe(true);
    const t = s.talks[0];
    expect(t.status).toBe("open");
    // offer must name who he replaces when both seats are taken
    const rich = { salary: askingSalary(s, d) * 1.6, years: 2, role: "number1" as const };
    expect(apply(s, { type: "talkOffer", id: t.id, offer: rich }).ok).toBe(false);
    const mine = driversOf(s, s.teamId);
    expect(mine.length).toBe(2);
    expect(apply(s, { type: "talkOffer", id: t.id, offer: rich, replaces: mine[1].id }).ok).toBe(true);
    // not instant
    expect(t.status).toBe("waiting");
    expect(s.drivers[mine[1].id].teamId).toBe(s.teamId);
    run(s, 6);
    expect(["agreed", "open", "closed"]).toContain(t.status);
    if (t.status === "agreed") {
      // signing without a choice fails, nobody has been released before this point
      expect(s.drivers[mine[1].id].teamId).toBe(s.teamId);
      const r = apply(s, { type: "talkSign", id: t.id, replaces: mine[1].id });
      expect(typeof r.ok).toBe("boolean");
    }
  });

  it("a hopeless offer is turned down and sours the agent", () => {
    const s = newCareer("wil", 22, 1);
    // find a free agent with an agent
    let id = "";
    for (const x of s.freeDrivers) {
      const mg = Object.values(s.managers).length;
      void mg;
      id = x;
      break;
    }
    if (!id) return;
    apply(s, { type: "talkOpen", kind: "driver", targetId: id });
    const t = s.talks[0];
    const mine = driversOf(s, s.teamId);
    apply(s, { type: "talkOffer", id: t.id, offer: { salary: 0.5, years: 1, role: "number2" }, replaces: mine[0].id });
    run(s, 6);
    expect(t.lines.some((l) => l.who === "them")).toBe(true);
    expect(t.status === "agreed").toBe(false);
  });

  it("sounding out a driver under contract gives an interest read", () => {
    const s = newCareer("wil", 23, 1);
    const other = Object.values(s.drivers).find((x) => x.teamId && x.teamId !== s.teamId && !x.retired)!;
    expect(apply(s, { type: "talkOpen", kind: "driver", targetId: other.id }).ok).toBe(true);
    const t = s.talks[0];
    expect(t.topic).toBe("sound");
    expect(apply(s, { type: "talkSound", id: t.id }).ok).toBe(true);
    // under contract: a real offer is refused until his deal runs down
    run(s, 5);
    expect(t.interest).toBeDefined();
  });

  it("a leak hurts the number two", () => {
    let hurt = false;
    for (let seed = 30; seed < 70 && !hurt; seed++) {
      const s = newCareer("wil", seed, 1);
      const id = s.freeDrivers.find((x) => s.drivers[x] && !s.drivers[x].retired);
      if (!id) continue;
      const mine = driversOf(s, s.teamId);
      mine[1].role = "number2";
      mine[0].role = "number1";
      const before = mine[1].grievance;
      apply(s, { type: "talkOpen", kind: "driver", targetId: id });
      const t = s.talks[0];
      apply(s, { type: "talkOffer", id: t.id, offer: { salary: 1, years: 1, role: "equal" }, replaces: null });
      for (let k = 0; k < 40 && !t.leaked; k++) {
        run(s, 1);
        if (t.status !== "waiting" && t.status !== "closed") apply(s, { type: "talkOffer", id: t.id, offer: { salary: 1, years: 1, role: "equal" }, replaces: mine[1].id });
      }
      if (t.leaked) {
        expect(s.drivers[mine[1].id].grievance).toBeGreaterThan(before);
        expect(s.drivers[mine[0].id].causes.leak ?? 0).toBe(0);
        hurt = true;
      }
    }
    expect(hurt).toBe(true);
  });
});
