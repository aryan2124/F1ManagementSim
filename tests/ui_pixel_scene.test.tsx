// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FactoryScene, type Dept } from "../src/ui/pixel/FactoryScene";
import { AREA_LABEL, CarSprite } from "../src/ui/pixel/CarSprite";
import { CarReveal } from "../src/ui/pixel/CarReveal";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
function mount(node: React.ReactNode) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  act(() => root.render(node));
  return { el, root };
}
const click = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent("click", { bubbles: true })));

const LEVELS = { tunnel: 3, sim: 2, factory: 4, academy: 1 };
const IDLE = { tunnel: false, sim: false, factory: false, academy: false };
const BUSY = { tunnel: true, sim: true, factory: true, academy: true };

/** A fake 2D context that accepts every call, so the drawing code really runs in jsdom. */
function fakeCtx() {
  return new Proxy({} as Record<string, unknown>, {
    get: (t, p) => (p in t ? t[p as string] : () => undefined),
    set: (t, p, v) => ((t[p as string] = v), true),
  });
}

beforeEach(() => void vi.useFakeTimers());
afterEach(() => {
  act(() => roots.splice(0).forEach((r) => r.unmount()));
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("FactoryScene", () => {
  it("mounts without a canvas context (jsdom has none) and fills its container", () => {
    const { el } = mount(<FactoryScene closed={false} night={false} levels={LEVELS} busy={IDLE} teamColor={0xe8002d} />);
    const scene = el.querySelector(".pixel-scene") as HTMLElement;
    expect(scene).toBeTruthy();
    expect(el.querySelector("canvas")).toBeTruthy();
    expect(el.querySelectorAll("button")).toHaveLength(5);
  });

  it("draws every state through a stubbed context without throwing", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => fakeCtx()) as never);
    for (const closed of [false, true])
      for (const night of [false, true])
        for (const winter of [false, true])
          for (const lvl of [1, 3, 5]) {
            const { root } = mount(
              <FactoryScene closed={closed} night={night} winter={winter} levels={{ tunnel: lvl, sim: lvl, factory: lvl, academy: lvl }} busy={closed ? IDLE : BUSY} teamColor={0x27f4d2} carBay={{ building: !closed, progress: 0.5 }} />,
            );
            act(() => void vi.advanceTimersByTime(500));
            act(() => root.unmount());
          }
  });

  it("fires onOpen for each building button with a descriptive label", () => {
    const seen: Dept[] = [];
    const { el } = mount(<FactoryScene closed={false} night={true} levels={LEVELS} busy={BUSY} teamColor={0xff8000} carBay={{ building: true, progress: 0.3 }} onOpen={(d) => seen.push(d)} />);
    for (const d of ["tunnel", "sim", "factory", "academy", "car"] as Dept[]) {
      const b = el.querySelector(`button[data-dept="${d}"]`) as HTMLButtonElement;
      expect(b).toBeTruthy();
      expect(b.getAttribute("aria-label")).toContain("click to open");
      click(b);
    }
    expect(seen).toEqual(["tunnel", "sim", "factory", "academy", "car"]);
    expect((el.querySelector('button[data-dept="tunnel"]') as HTMLElement).getAttribute("aria-label")).toBe("Wind tunnel level 3: click to open Car and R&D");
  });

  it("shows CLOSED when the factory is shut and not otherwise", () => {
    const a = mount(<FactoryScene closed={true} night={false} winter levels={LEVELS} busy={IDLE} teamColor={0xe8002d} />);
    expect(a.el.textContent).toContain("CLOSED");
    expect(a.el.querySelector('button[data-dept="factory"]')!.getAttribute("aria-label")).toContain("closed");
    const b = mount(<FactoryScene closed={false} night={false} levels={LEVELS} busy={IDLE} teamColor={0xe8002d} />);
    expect(b.el.textContent).not.toContain("CLOSED");
  });
});

describe("CarSprite", () => {
  it("mounts, labels the five areas and reports picks", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => fakeCtx()) as never);
    const picked: string[] = [];
    const slots = { aero: 0.2, chassis: 0.5, power: 0.9, cooling: 0.1, tyres: 0.7 };
    const { el } = mount(<CarSprite teamColor={0xe8002d} accent={0xfff200} slots={slots} highlight="power" size={300} onPick={(a) => picked.push(a)} />);
    expect(Object.keys(AREA_LABEL)).toHaveLength(5);
    const primary = [...el.querySelectorAll("button[data-area]")].filter((b) => b.getAttribute("tabindex") !== "-1");
    expect(primary).toHaveLength(5);
    primary.forEach((b) => click(b));
    expect(picked.sort()).toEqual(["aero", "chassis", "cooling", "power", "tyres"]);
    act(() => void vi.advanceTimersByTime(400));
  });

  it("mounts without a canvas context", () => {
    const { el } = mount(<CarSprite teamColor={0x2745b8} accent={0xe8002d} />);
    expect(el.querySelector("canvas")).toBeTruthy();
  });
});

describe("CarReveal", () => {
  it("calls onDone after the skip key, once", () => {
    const onDone = vi.fn();
    const { el } = mount(<CarReveal teamColor={0xe8002d} accent={0xfff200} teamName="Ferrari" year={2027} onDone={onDone} />);
    expect(el.querySelector(".pixel-continue")).toBeNull();
    act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(el.querySelector(".pixel-continue")).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(5000));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("skips on click and finishes on CONTINUE immediately", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => fakeCtx()) as never);
    const onDone = vi.fn();
    const { el } = mount(<CarReveal teamColor={0x27f4d2} accent={0x1a1a1a} teamName="Mercedes" year={2028} onDone={onDone} />);
    act(() => void vi.advanceTimersByTime(1500));
    click(el.querySelector(".pixel-reveal")!);
    const btn = el.querySelector(".pixel-continue") as HTMLButtonElement;
    expect(btn.textContent).toBe("CONTINUE");
    click(btn);
    expect(onDone).toHaveBeenCalledTimes(1);
    act(() => void vi.advanceTimersByTime(5000));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("runs to the end by itself and then continues", () => {
    const onDone = vi.fn();
    mount(<CarReveal teamColor={0xff8000} accent={0x2f9bff} teamName="McLaren" year={2027} onDone={onDone} />);
    act(() => void vi.advanceTimersByTime(3000));
    expect(onDone).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1200)); // animation ends, the hold starts
    expect(onDone).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(4000));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("jumps straight to the end with reduced motion", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
    const { el } = mount(<CarReveal teamColor={0xe8002d} accent={0xfff200} teamName="Ferrari" year={2027} onDone={() => {}} />);
    expect(el.querySelector(".pixel-continue")).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
