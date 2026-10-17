import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { reduce } from "../src/career/reducer";
import { autoTo } from "../src/career/autoplay";
import { advanceDay, resolveCard } from "../src/career/tick";
import { setNextCar, nextCarOf } from "../src/career/nextcar";
import { forceStory, STORY_IDS } from "../src/career/stories";
import { startHunt, sponsorMail, traineeMail } from "../src/career/mail";
import { AREAS } from "../src/career/types";
import type { CareerState } from "../src/career/types";

/** Days without racing: the clock runs, weekends are skipped, so a year costs milliseconds. */
function quiet(s: CareerState, days: number, answer?: (s: CareerState) => void) {
  for (let i = 0; i < days && !s.fired; i++) {
    s.weekend = null;
    for (const c of [...s.cards]) if (c.options.length > 1 && (c.urgency >= 2 || (answer && c.kind === "mail"))) resolveCard(s, c.id, answer ? c.options[(s.day + c.id) % c.options.length].id : c.defaultOption ?? c.options[0].id);
    advanceDay(s);
  }
}
const carSum = (s: CareerState) => AREAS.reduce((a, k) => a + s.teams[s.teamId].car[k], 0);
const finite = (s: CareerState) => Object.values(s.teams).every((t) => Number.isFinite(t.cash) && AREAS.every((a) => Number.isFinite(t.car[a])));

describe("simulate to a day", () => {
  it("runs a full season and more on its own, handling every card and weekend", () => {
    const s = newCareer("wil", 11);
    const start = s.day;
    const r = autoTo(s, start + 400, 400);
    expect(r.done).toBe(true);
    expect(s.day).toBeGreaterThanOrEqual(start + 400);
    expect(s.fired).toBe(false);
    expect(s.history.length).toBeGreaterThanOrEqual(1);
    expect(finite(s)).toBe(true);
    expect(s.weekend === null || s.weekend.stage === "done").toBe(true);
  }, 240000);

  it("works in chunks through the reducer", () => {
    let s = newCareer("mcl", 5);
    const target = s.day + 90;
    let guard = 0;
    while (s.day < target && guard++ < 50) s = reduce(s, { type: "autoTo", day: target, max: 14 }).state;
    expect(s.day).toBe(target);
    expect(guard).toBeLessThan(10);
  }, 120000);

  it("three years with varied answers to every card never breaks the state", () => {
    for (const seed of [2, 9]) {
      const s = newCareer("hss", seed);
      quiet(s, 365 * 3, () => undefined);
      expect(finite(s)).toBe(true);
      expect(s.cards.length).toBeLessThan(60);
    }
  }, 120000);
});

describe("next year's car", () => {
  const winter = (setup: (s: CareerState) => void, seed = 21) => {
    const s = newCareer("mer", seed);
    setup(s);
    const y = s.year;
    // run to the January after
    let guard = 0;
    while (s.year === y && guard++ < 500) quiet(s, 5);
    return s;
  };

  it("neglecting it leaves the car behind a team that put work in", () => {
    // the January swing is random, so the claim is about the average over a few seeds
    let diff = 0;
    for (const seed of [21, 5, 8]) {
      const neglect = winter((s) => setNextCar(s, "evolve", 0), seed);
      const worked = winter((s) => setNextCar(s, "evolve", 0.6), seed);
      diff += carSum(worked) - carSum(neglect);
      expect(neglect.nextCarLast?.note).toMatch(/step back|disaster|about where/);
    }
    expect(diff / 3).toBeGreaterThan(0.4);
  }, 400000);

  it("a revolution with weak designers is worse than a quiet evolution", () => {
    const weak = (s: CareerState) => {
      for (const st of Object.values(s.staff)) if (st.teamId === s.teamId && (st.role === "td" || st.role === "designer")) st.skill = 25;
    };
    // the January swing is random, so the claim is about the average over a few seeds
    let rs = 0;
    let es = 0;
    for (const seed of [21, 5, 8]) {
      rs += carSum(winter((s) => { weak(s); setNextCar(s, "revolve", 0.8); }, seed));
      es += carSum(winter((s) => { weak(s); setNextCar(s, "evolve", 0.8); }, seed));
    }
    expect(rs).toBeLessThan(es);
  }, 400000);

  it("changing course costs work already done", () => {
    const s = newCareer("mer", 3);
    setNextCar(s, "evolve", 0.5);
    nextCarOf(s).points = 20;
    const msg = setNextCar(s, "revolve", 0.5);
    expect(nextCarOf(s).points).toBeCloseTo(12, 5);
    expect(msg).toContain("40 percent");
  });
});

describe("inbox and stories", () => {
  it("every story can be built and answered with every option", () => {
    expect(STORY_IDS.length).toBeGreaterThanOrEqual(20);
    for (const id of STORY_IDS) {
      const probe = newCareer("alp", 8);
      probe.teams[probe.teamId].sponsors.push({ id: 900, name: "Test Co", retainer: 5, bonusPerRace: 0.1, objective: "x", objKind: "top5", mood: 0.5, endYear: probe.year + 1, demand: 0.2 });
      probe.cards = [];
      if (!forceStory(probe, id)) continue;
      const card = probe.cards.find((c) => c.kind === "event");
      expect(card, id).toBeTruthy();
      const opts = card!.options.map((o) => o.id);
      expect(opts.length).toBeGreaterThanOrEqual(2);
      for (const o of opts) {
        const s = structuredClone(probe);
        const c = s.cards.find((x) => x.kind === "event")!;
        expect(() => resolveCard(s, c.id, o), `${id}:${o}`).not.toThrow();
        expect(Number.isFinite(s.teams[s.teamId].cash), `${id}:${o}`).toBe(true);
        for (let i = 0; i < 12; i++) advanceDay(s);
        expect(finite(s)).toBe(true);
      }
    }
  }, 120000);

  it("sponsor letters, trainee letters and a sponsor hunt arrive in the inbox and can be answered", () => {
    const s = newCareer("wil", 14);
    s.cards = [];
    sponsorMail(s, 0.2);
    traineeMail(s);
    const mails = s.cards.filter((c) => c.kind === "mail");
    expect(mails.length).toBeGreaterThanOrEqual(1);
    for (const m of mails) {
      expect(m.mail?.from).toBeTruthy();
      expect(m.urgency).toBe(1);
      for (const o of m.options) expect(() => resolveCard(structuredClone(s), m.id, o.id)).not.toThrow();
    }
    const before = s.teams[s.teamId].sponsors.length;
    const sp = s.cards.find((c) => c.kind === "mail" && c.data?.m === "sponsor");
    if (sp) {
      resolveCard(s, sp.id, "accept");
      expect(s.teams[s.teamId].sponsors.length).toBe(before + 1);
    }
    expect(startHunt(s, "agency")).toContain("replies");
    expect(startHunt(s, "cold")).toContain("already");
    quiet(s, 12);
    expect(s.cards.some((c) => c.kind === "mail" && (c.data?.m === "sponsor" || c.data?.m === "none"))).toBe(true);
  });

  it("over three seasons the inbox fills and stories fire, and mail never stops the clock", () => {
    const s = newCareer("mcl", 17);
    quiet(s, 365 * 3);
    const keys = Object.keys(s.story.last);
    expect(keys.filter((k) => k.startsWith("st:")).length).toBeGreaterThanOrEqual(3);
    expect(keys).toContain("mailSponsor");
    expect(s.cards.filter((c) => c.kind === "mail").length).toBeLessThanOrEqual(8);
  }, 40000);
});
