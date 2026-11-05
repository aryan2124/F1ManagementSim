import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { runLab } from "../src/career/lab";
import { caseFile } from "../src/career/casefile";
import { TRAITS } from "../src/career/types";

describe("case file", () => {
  it("one line per trait, from the notebook and belief only", () => {
    const s = newCareer("fer", 4);
    const t = s.teams[s.teamId];
    t.tunnelLeft = 500;
    const lines = caseFile(s, s.teamId);
    expect(lines).toHaveLength(TRAITS.length);
    expect(lines.every((l) => l.status === "open" || l.status === "leaning" || l.status === "settled")).toBe(true);
    runLab(s, s.teamId, "desk", {});
    runLab(s, s.teamId, "tunnel", {});
    const after = caseFile(s, s.teamId);
    const df = after.find((l) => l.trait === "downforce")!;
    expect(df.readings.length).toBe(2);
    expect(df.next.length).toBeGreaterThan(10);
  });
  it("a disagreement is flagged as a conflict with a next step", () => {
    const s = newCareer("fer", 4);
    const t = s.teams[s.teamId];
    t.notebook = [
      { id: 1, day: s.day, inst: "tunnel", model: {} as never, readings: [{ trait: "downforce", value: 0.2, err: 0.03 }], note: "", seed: 1 },
      { id: 2, day: s.day, inst: "cfd", model: {} as never, readings: [{ trait: "downforce", value: -0.1, err: 0.05 }], note: "", seed: 2 },
    ];
    const l = caseFile(s, s.teamId).find((x) => x.trait === "downforce")!;
    expect(l.status).toBe("conflict");
    expect(l.next).toMatch(/disagree/);
  });
});
