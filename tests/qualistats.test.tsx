// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

vi.mock("pixi.js", () => {
  const make = (): any => new Proxy(function () {}, { get: (_t, p) => (p === Symbol.toPrimitive ? () => 0 : p === "then" ? undefined : make()), apply: () => make(), construct: () => make(), set: () => true });
  return { Application: class { canvas = document.createElement("canvas"); stage = make(); ticker = { add() {}, remove() {} }; renderer = make(); init() { return Promise.resolve(); } destroy() {} }, Container: make(), Graphics: make(), Sprite: make(), Text: make() };
});

import { QualiStats } from "../src/ui/QualiStats";
import { loadCircuit } from "../src/game/circuits";
import { buildEntries } from "../src/game/data";
import { runQualifying } from "../src/sim/qualifying";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("qualifying stats panel", () => {
  it("shows a driver's bests and compares with a second driver", () => {
    const { track } = loadCircuit("monza");
    const { sim } = runQualifying({ seed: 3, track, entries: buildEntries("none") });
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    const a = sim.order[0], b = sim.order[1];
    act(() => root.render(<QualiStats sim={sim} carId={a.id} onClose={() => {}} />));
    const panel = document.querySelector("[data-testid=quali-stats]")!;
    expect(panel.textContent).toContain(a.entry.driver.code);
    expect(panel.textContent).toContain("Q3 BEST");
    const sel = panel.querySelector("select") as HTMLSelectElement;
    act(() => { sel.value = b.id; sel.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(document.querySelector("[data-testid=quali-stats]")!.textContent).toContain(b.entry.driver.code);
    expect(document.querySelector("[data-testid=quali-stats]")!.textContent).toContain("GAP");
    act(() => root.unmount());
  });
});
