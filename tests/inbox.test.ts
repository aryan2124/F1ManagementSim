import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { pushCard } from "../src/career/cards";
import { apply } from "../src/career/reducer";
import { advanceDay, stopNow } from "../src/career/tick";

const opts = [{ id: "a", label: "A" }, { id: "b", label: "B" }];
const mk = () => newCareer("fer", 21);

describe("inbox as the only door", () => {
  it("a mandatory card is never answered by the clock", () => {
    const s = mk();
    const c = pushCard(s, "event", "Must decide", "x", opts, { deadline: s.day + 1, defaultOption: "a", mandatory: true });
    for (let i = 0; i < 6; i++) advanceDay(s);
    expect(s.cards.some((x) => x.id === c.id)).toBe(true);
    expect(stopNow(s, s.uid + 99)).toContain("Needs an answer");
  });
  it("an event-based card lapses at the next race weekend, not by day", () => {
    const s = mk();
    const c = pushCard(s, "event", "Before the race", "x", opts, { defaultOption: "a", lapse: "race" });
    advanceDay(s); advanceDay(s);
    if (!s.weekend) expect(s.cards.some((x) => x.id === c.id)).toBe(true);
    s.round += 1;
    advanceDay(s);
    expect(s.cards.some((x) => x.id === c.id)).toBe(false);
  });
  it("standing orders answer a kind of letter, but never a mandatory one", () => {
    const s = mk();
    apply(s, { type: "standingOrder", kind: "event", option: "b" });
    const free = pushCard(s, "event", "Routine", "x", opts, { deadline: s.day + 20 });
    const must = pushCard(s, "event", "Serious", "x", opts, { deadline: s.day + 20, mandatory: true });
    advanceDay(s);
    expect(s.cards.some((x) => x.id === free.id)).toBe(false);
    expect(s.cards.some((x) => x.id === must.id)).toBe(true);
  });
  it("when away, letters wait past their deadline unless a standing order applies", () => {
    const s = mk();
    apply(s, { type: "setAway", away: true });
    const c = pushCard(s, "event", "Wait for me", "x", opts, { deadline: s.day + 1, defaultOption: "a" });
    for (let i = 0; i < 5; i++) advanceDay(s);
    expect(s.cards.some((x) => x.id === c.id)).toBe(true);
    apply(s, { type: "setAway", away: false });
    advanceDay(s); advanceDay(s);
    expect(s.cards.some((x) => x.id === c.id)).toBe(false);
  });
});
