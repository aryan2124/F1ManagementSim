// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { loadCircuit } from "../src/game/circuits";
import { buildEntries } from "../src/game/data";
import { RaceSession } from "../src/game/session";
import { Debrief } from "../src/ui/Debrief";

vi.setConfig({ testTimeout: 300000 });
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("debrief panels", () => {
  it("shows what-if branches and incident replays for a finished race", async () => {
    const { track } = loadCircuit("monaco");
    const entries = buildEntries("mer");
    const humans = entries.filter((e) => e.human).map((e) => e.id);
    let session: RaceSession | undefined;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const s = new RaceSession({ seed, laps: 14, track, entries }, humans);
      let g = 0;
      while (s.sim.phase !== "finished" && g++ < 800) s.sim.run(1000);
      session = s;
      if (s.sim.clips.clips.length) break;
    }
    const div = document.createElement("div");
    document.body.appendChild(div);
    const root = createRoot(div);
    await act(async () => { root.render(<Debrief session={session!} />); });
    expect(div.textContent).toContain("WHAT IF");
    expect(div.textContent).toContain("INCIDENT REPLAY");
    const btn = [...div.querySelectorAll("button")].find((b) => b.textContent === "RUN THE BRANCHES")!;
    await act(async () => { btn.click(); await new Promise((r) => setTimeout(r, 15000)); });
    expect(div.textContent).toContain("Pit now for hards");
    expect(div.textContent).toContain("Save tyres from here");
    expect(div.textContent).toMatch(/Pit now for softs: (P\d+|did not finish)/);
  });
});
