import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { apply } from "../src/career/reducer";
import { pushCard } from "../src/career/cards";
import { deriveFx } from "../src/career/tradeoff";
import { inboxItems, isDecision, unreadCount } from "../src/ui/career/Inbox";

describe("decisions as pictures", () => {
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
    s.cardBudget = {};
    pushCard(s, "event", "PLAN", "x", [{ id: "car", label: "THE CAR" }, { id: "money", label: "THE MONEY" }], { urgency: 2 });
    const c = s.cards[0];
    expect(isDecision(c)).toBe(true);
    const items = inboxItems(s);
    expect(items[0].kind).toBe("decision");
    expect(unreadCount(s)).toBe(before + 1);
    apply(s, { type: "card", id: c.id, option: "car" });
    expect(s.cards.some((x) => x.id === c.id)).toBe(false);
    expect(unreadCount(s)).toBe(before);
  });
});
