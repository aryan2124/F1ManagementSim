// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

vi.mock("pixi.js", () => {
  const make = (): any => new Proxy(function () {}, { get: (_t, p) => (p === Symbol.toPrimitive ? () => 0 : p === "then" ? undefined : make()), apply: () => make(), construct: () => make(), set: () => true });
  return { Application: class { canvas = document.createElement("canvas"); stage = make(); ticker = { add() {}, remove() {} }; renderer = make(); init() { return Promise.resolve(); } destroy() {} }, Container: make(), Graphics: make(), Sprite: make(), Text: make() };
});

import { People } from "../src/ui/career/People";
import { newCareer } from "../src/career/world";
import { driversOf } from "../src/career/finance";
import { coverGaps } from "../src/career/health";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("medical room panel", () => {
  it("shows a laid-up driver and who drives instead, and nothing when everyone is fit", () => {
    const s = newCareer("wil", 7);
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    const d = (() => ({ ok: true, message: "", state: s })) as any;
    act(() => root.render(<People s={s} d={d} />));
    expect(el.querySelector("[data-testid=medical]")).toBeNull();
    const [a] = driversOf(s, s.teamId);
    a.out = { cause: "injury", races: 2, from: s.round, year: s.year, label: "bruised ribs" };
    coverGaps(s);
    act(() => root.render(<People s={{ ...s }} d={d} />));
    const panel = el.querySelector("[data-testid=medical]")!;
    expect(panel).not.toBeNull();
    expect(panel.textContent).toContain(a.spec.name);
    expect(panel.textContent).toContain("bruised ribs");
    expect(panel.textContent).toContain("drives");
    act(() => root.unmount());
  });
});
