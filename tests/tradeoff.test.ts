import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { apply } from "../src/career/reducer";
import { pushCard } from "../src/career/cards";
import { resolveWeekPlan } from "../src/career/week";
import { deriveFx, mixEffect, mixFx, mixId, parseMix, dominant } from "../src/career/tradeoff";
import { inboxItems, isDecision, unreadCount } from "../src/ui/career/Inbox";

describe("decisions as pictures", () => {
  it("a blend parses back to the same shares and sums to one", () => {
    const m = parseMix(mixId({ car: 0.5, drivers: 0.3, money: 0.2 }))!;
    expect(m.car + m.drivers + m.money).toBeCloseTo(1, 5);
    expect(dominant(m)).toBe("car");
    expect(parseMix("car")).toBeNull();
    expect(parseMix("mix:1,2")).toBeNull();
  });

  it("all-in on money brings cash and costs fans; all-in on the car brings tunnel hours and costs cash", () => {
    const money = mixEffect({ car: 0, drivers: 0, money: 1 });
    expect(money.cash).toBeGreaterThan(0);
    expect(money.fans).toBeLessThan(0);
    const car = mixEffect({ car: 1, drivers: 0, money: 0 });
    expect(car.tunnel).toBeGreaterThan(0);
    expect(car.cash).toBeLessThan(0);
    const fx = mixFx({ car: 1, drivers: 0, money: 0 });
    expect(fx.car!.v).toBeGreaterThan(0.9);
    expect(fx.cash!.v).toBeLessThan(0);
  });

  it("the weekly plan applies a blend to the real state, the same way every time", () => {
    const run = () => {
      const s = newCareer("fer", 11);
      const me = s.teams[s.teamId];
      const t0 = me.tunnelLeft, c0 = me.cash;
      resolveWeekPlan(s, "mix:0.50,0.30,0.20");
      return { dt: me.tunnelLeft - t0, dc: me.cash - c0, kind: s.focus?.kind, mix: s.focus?.mix };
    };
    const a = run(), b = run();
    expect(a).toEqual(b);
    expect(a.dt).toBeCloseTo(3, 5);
    expect(a.kind).toBe("car");
    expect(a.mix).toBe("mix:0.50,0.30,0.20");
  });

  it("plain-words facts become meters with the right signs", () => {
    const own = deriveFx(["Own it", "Press respects it, the board winces", "Press mood up. Board down a little."])!;
    expect(own.next!.v).toBeLessThan(0);
    const day = deriveFx(["Fan day and a gesture", "Costs $1.5m, wins some fans back", "Fans up a little. The deal stays."])!;
    expect(day.cash!.v).toBeLessThan(-0.9);
    expect(day.fans!.v).toBeGreaterThan(0);
    const cheap = deriveFx(["Take the cheap deal", "Parts cost 15 percent less, some underdeliver"])!;
    expect(cheap.car?.v ?? 0).toBeGreaterThanOrEqual(0);
    expect(deriveFx(["Nothing here"])).toBeUndefined();
  });

  it("a decision lives in the inbox and nowhere else, and the tab count includes it", () => {
    const s = newCareer("fer", 12);
    s.cards = [];
    const before = unreadCount(s);
    pushCard(s, "weekPlan", "PLAN", "x", [{ id: "car", label: "THE CAR" }, { id: "money", label: "THE MONEY" }], { urgency: 2 });
    const c = s.cards[0];
    expect(isDecision(c)).toBe(true);
    const items = inboxItems(s);
    expect(items[0].kind).toBe("decision");
    expect(unreadCount(s)).toBe(before + 1);
    apply(s, { type: "card", id: c.id, option: "mix:0.34,0.33,0.33" });
    expect(s.cards.some((x) => x.id === c.id)).toBe(false);
    expect(unreadCount(s)).toBe(before);
  });
});
