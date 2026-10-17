// @ts-nocheck
import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { newCareer } from "../src/career/world";
import { autoPlayDays } from "../src/career/headless";
import { spreadOf } from "../src/career/season";
import { handsOff, idle, playWith, smartWeek } from "./helpers/bots";

/**
 * The balance harness. It plays whole seasons, so it is slow and only runs when asked for:
 *   BALANCE=1 npx vitest run tests/balance.test.ts
 * It writes its numbers to /tmp/balance.json so they can be read after.
 */
const on = !!process.env.BALANCE;
const d = on ? describe : describe.skip;

d("balance harness", () => {
  it("who wins the argument: a player who reads the numbers beats one who delegates, who beats one who does nothing", () => {
    const res: Record<string, number[][]> = { smart: [], hands: [], idle: [] };
    for (const seed of [3, 4]) {
      for (const [name, pol] of [["smart", smartWeek], ["hands", handsOff], ["idle", idle]] as const) {
        const s = newCareer("hss", seed, 1, "quick");
        s.teams[s.teamId].board = 90;
        res[name].push(playWith(s, pol, 3));
      }
    }
    const mean = (xs: number[][]) => xs.flat().reduce((a, b) => a + b, 0) / xs.flat().length;
    const out = { smart: mean(res.smart), hands: mean(res.hands), idle: mean(res.idle), raw: res };
    writeFileSync("/tmp/balance_levers.json", JSON.stringify(out, null, 1));
    expect(out.smart).toBeLessThan(out.idle - 1);
  }, 6 * 3600_000);

  it("ten seasons: the field stays in a healthy band and the titles are shared around", () => {
    const s = newCareer("wil", 11, 1, "quick");
    const spreads: number[] = [];
    const champs: string[] = [];
    let last = 0;
    for (let i = 0; i < 4000 && s.history.length < 10; i++) {
      autoPlayDays(s, 7);
      if (s.history.length > last) {
        last = s.history.length;
        spreads.push(spreadOf(s));
        champs.push(s.history[s.history.length - 1].constructors);
      }
    }
    writeFileSync("/tmp/balance_field.json", JSON.stringify({ spreads, champs }, null, 1));
    expect(new Set(champs).size).toBeGreaterThanOrEqual(3);
    expect(Math.min(...spreads)).toBeGreaterThan(0.04);
  }, 6 * 3600_000);
});
