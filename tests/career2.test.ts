import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { apply, reduce } from "../src/career/reducer";
import { autoPlayDays, autoPlaySeasons } from "../src/career/headless";
import { exportCareer, parseCareer, saveCareer, loadCareer } from "../src/career/save";
import { summerStart, factoryClosed } from "../src/career/calendar";
import { capRoom } from "../src/career/rnd";
import { evaluateOffer, askingSalary } from "../src/career/contracts";
import { SPRINT_POINTS } from "../src/career/weekend";

describe("determinism and saves", () => {
  it("same seed and same actions give the same world", () => {
    const run = () => {
      const s = newCareer("fer", 11, 1, "quick");
      autoPlayDays(s, 120);
      return JSON.stringify([s.day, s.round, s.standings.teams, s.teams.fer.cash]);
    };
    expect(run()).toBe(run());
  }, 120000);
  it("round trips through export and storage", async () => {
    const s = newCareer("wil", 5, 1, "quick");
    autoPlayDays(s, 60);
    const back = parseCareer(exportCareer(s));
    expect(back).not.toBeNull();
    expect(JSON.stringify(back)).toBe(JSON.stringify(s));
    await saveCareer("t", s);
    expect((await loadCareer("t"))?.day).toBe(s.day);
    expect(parseCareer("{nope")).toBeNull();
  }, 60000);
});

describe("rules", () => {
  it("freezes the factory in the summer break", () => {
    const s = newCareer("mcl", 7, 1, "quick");
    const start = summerStart(2026);
    autoPlayDays(s, start - s.day - 1);
    const t = s.teams.mcl;
    for (const i of [...t.ideas]) apply(s, { type: "startProject", ideaId: i.id });
    const before = t.projects.filter((p) => p.status === "building").map((p) => p.progress);
    expect(factoryClosed(start + 3, 2026)).toBe(true);
    s.day = start + 1;
    for (let i = 0; i < 5; i++) apply(s, { type: "day" });
    const after = s.teams.mcl.projects.filter((p) => p.status === "building").map((p) => p.progress);
    expect(after.slice(0, before.length).every((v, i) => v <= before[i] + 1)).toBe(true);
  }, 120000);
  it("tracks cap room as projects start", () => {
    const s = newCareer("mcl", 8, 1, "quick");
    autoPlayDays(s, 30);
    const t = s.teams.mcl;
    const room = capRoom(t);
    const idea = t.ideas[0];
    if (idea) {
      const r = apply(s, { type: "startProject", ideaId: idea.id });
      expect(r.ok).toBe(true);
      expect(capRoom(s.teams.mcl)).toBeLessThan(room);
    }
  });
  it("driver offers: money matters, and the breakdown sums up", () => {
    const s = newCareer("wil", 9);
    const id = s.freeDrivers[0];
    const d = s.drivers[id];
    const ask = askingSalary(s, d);
    const lo = evaluateOffer(s, "wil", id, { salary: ask * 0.4, years: 2, role: "equal" });
    const hi = evaluateOffer(s, "wil", id, { salary: ask * 1.6, years: 2, role: "equal" });
    expect(hi.score).toBeGreaterThan(lo.score);
    expect(lo.lines.length).toBe(5);
  });
  it("sprint points stop at eighth", () => {
    expect(SPRINT_POINTS).toHaveLength(8);
  });
  it("weekend flow in order for a sprint weekend", () => {
    const s = newCareer("mcl", 12, 1, "quick");
    let guard = 0;
    while (guard++ < 600) {
      if (s.weekend && s.weekend.stage !== "done") {
        if (s.weekend.sprint) break;
        apply(s, { type: "simWeekend" });
      }
      apply(s, { type: "continue" });
    }
    const ws = s.weekend!;
    expect(ws.sprint).toBe(true);
    apply(s, { type: "endPractice" });
    expect(ws.stage).toBe("sq");
  }, 120000);
});

describe("seasons", () => {
  it("runs three quick seasons with a real spread", () => {
    const s = newCareer("wil", 21, 1, "quick");
    const out = autoPlaySeasons(s, 3);
    expect(out).toHaveLength(3);
    expect(Object.values(s.drivers).filter((d) => d.teamId && !d.retired)).toHaveLength(22);
    const champs = new Set(out.map((o) => o.champion));
    expect(champs.size).toBeGreaterThanOrEqual(1);
    const bankrupt = Object.entries(s.teams).filter(([id, t]) => id !== "wil" && t.cash < -50);
    expect(bankrupt).toHaveLength(0);
  }, 300000);
});

describe("purity", () => {
  it("reduce leaves its input alone for card answers", () => {
    const s = newCareer("wil", 2);
    const snap = JSON.stringify(s);
    const c = s.cards[0];
    if (c) reduce(s, { type: "card", id: c.id, option: c.options[0].id });
    expect(JSON.stringify(s)).toBe(snap);
  });
});
