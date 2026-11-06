import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";

describe("timing towers: only the i opens stats", () => {
  it("race tower row click moves the camera only; the i opens stats", () => {
    const src = readFileSync("src/ui/RaceScreen.tsx", "utf8");
    expect(src).toContain("onClick={() => { session.followId = c.id; }}");
    expect(src).toMatch(/aria-label=\{`\$\{c\.entry\.driver\.code\} stats`\}[^>]*onClick=\{\(e\) => \{ e\.stopPropagation\(\); setStatsId\(c\.id\); \}\}>i</);
  });
  it("quali tower row click moves the camera only; the i opens stats", () => {
    const src = readFileSync("src/ui/QualiScreen.tsx", "utf8");
    expect(src).toContain("onClick={() => (session.followId = c.id)}");
    expect(src).toMatch(/onClick=\{\(e\) => \{ e\.stopPropagation\(\); onStats\(c\.id\); \}\}>i</);
  });
});
