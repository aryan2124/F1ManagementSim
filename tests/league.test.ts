import { describe, expect, it } from "vitest";
import { applyMessage, newLeague } from "../src/shared/league";

const join = (s: ReturnType<typeof newLeague>, id: string, name: string) => applyMessage(s, id, { t: "join", id, name });

describe("click-to-advance league", () => {
  it("does not advance until everyone is ready", () => {
    let s = newLeague("x");
    s = join(s, "a", "Aryan");
    s = join(s, "b", "Sam");
    expect(s.hostId).toBe("a");
    s = applyMessage(s, "a", { t: "ready", ready: true });
    expect(s.day).toBe(1);
    s = applyMessage(s, "b", { t: "ready", ready: true });
    expect(s.day).toBe(2);
    expect(Object.values(s.members).every((m) => !m.ready)).toBe(true);
  });

  it("host can mark a silent manager away so the league moves on", () => {
    let s = newLeague("x");
    s = join(s, "a", "Aryan");
    s = join(s, "b", "Sam");
    s = applyMessage(s, "a", { t: "ready", ready: true });
    s = applyMessage(s, "a", { t: "away", target: "b", away: true });
    expect(s.day).toBe(2);
  });

  it("non-hosts cannot mark other people away", () => {
    let s = newLeague("x");
    s = join(s, "a", "Aryan");
    s = join(s, "b", "Sam");
    const before = s;
    s = applyMessage(s, "b", { t: "away", target: "a", away: true });
    expect(s).toBe(before);
  });

  it("never advances an empty league and rejoining keeps state", () => {
    let s = newLeague("x");
    expect(s.day).toBe(1);
    s = join(s, "a", "Aryan");
    s = applyMessage(s, "a", { t: "ready", ready: true }); // solo league: advances
    expect(s.day).toBe(2);
    s = join(s, "a", "Aryan");
    expect(Object.keys(s.members)).toHaveLength(1);
  });
});
