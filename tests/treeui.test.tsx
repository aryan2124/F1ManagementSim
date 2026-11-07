// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

vi.mock("pixi.js", () => {
  const make = (): any => new Proxy(function () {}, { get: (_t, p) => (p === Symbol.toPrimitive ? () => 0 : p === "then" ? undefined : make()), apply: () => make(), construct: () => make(), set: () => true });
  return { Application: class { canvas = document.createElement("canvas"); stage = make(); ticker = { add() {}, remove() {} }; renderer = make(); init() { return Promise.resolve(); } destroy() {} }, Container: make(), Graphics: make(), Sprite: make(), Text: make() };
});

import { newCareer } from "../src/career/world";
import { apply } from "../src/career/reducer";
import { nodeKey, install, startBuild, tickTree, treeOf } from "../src/career/ctree";
import { startWeekend, practiceRun } from "../src/career/weekend";
import { TreeLive } from "../src/ui/career/Weekend";
import { Car } from "../src/ui/career/Car";
import { Inbox } from "../src/ui/career/Inbox";
import { sendSeasonReport } from "../src/career/treeplay";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
const mount = (node: any) => { const el = document.createElement("div"); document.body.appendChild(el); const r = createRoot(el); act(() => r.render(node)); return el; };

describe("tree screens render", () => {
  it("practice panel, car screen, skill tree and inbox folders", () => {
    const s = newCareer("fer", 21); const t = s.teams[s.teamId]; t.cash = 500;
    const id = nodeKey("fw", 0, 1);
    startBuild(s, t, id); for (let i = 0; i < 40; i++) tickTree(s, t);
    install(s, t, id, "A", true); install(s, t, id, "B", true);
    s.weekend = startWeekend(s);
    const drv = Object.values(s.drivers).find((d) => d.teamId === s.teamId)!.id;
    practiceRun(s, "setup", { ...s.weekend.setup }, drv);
    sendSeasonReport(s);
    const d = ((a: any) => apply(s, a)) as any;
    const live = mount(<TreeLive s={s} d={d} />);
    expect(live.querySelector("[data-testid=tree-live]")).toBeTruthy();
    expect(live.textContent).toContain("FP1");
    expect(live.textContent).toContain("REMOVE");
    s.weekend = null;
    const car = mount(<Car s={s} d={d} />);
    expect(car.querySelector("[data-testid=radial-tree]")).toBeTruthy();
    expect(car.querySelectorAll(".rt-arm").length).toBe(6);
    expect(car.querySelectorAll(".rt-node").length).toBe(72);
    expect(car.querySelectorAll(".rt-node.t4").length).toBe(18);
    expect(car.querySelector(".rt-node.built")).toBeTruthy();
    expect(car.querySelectorAll(".rt-slotcard").length).toBe(2);
    // the heat points at what the next track pays: none at an average track, a dozen at Monaco
    const day0 = s.day;
    const mon = s.calendar.find((r) => r.circuitId === "monaco");
    if (mon) {
      s.day = mon.day - 3;
      const hot = mount(<Car s={s} d={d} />);
      expect(hot.querySelectorAll(".rt-node.hot").length).toBe(12);
      s.day = day0;
    }
    const inbox = mount(<Inbox s={s} d={d} />);
    const labels = [...inbox.querySelectorAll(".fold button")].map((b) => b.textContent ?? "");
    expect(labels.some((l) => l.startsWith("PRACTICE"))).toBe(true);
    expect(labels.some((l) => l.startsWith("TRACK REPORTS"))).toBe(true);
    expect(treeOf(s, t).parts[id]).toBeTruthy();
  });
});
