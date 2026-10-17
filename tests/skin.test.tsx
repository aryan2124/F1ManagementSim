// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Sub, Fold } from "../src/ui/skin/Sub";
import { Num } from "../src/ui/skin/Num";
import { applyLook, setPref } from "../src/ui/prefs";
import { installJuice } from "../src/ui/skin/juice";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  sessionStorage.clear();
  localStorage.clear();
});
function mount(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}

describe("design system parts", () => {
  it("Sub shows one room at a time, with a badge, and remembers the choice", () => {
    const el = mount(
      <Sub id="t" tabs={[{ k: "a", label: "ALPHA" }, { k: "b", label: "BETA", n: 3 }]}>
        {(k) => <p className="room">{k}</p>}
      </Sub>,
    );
    expect(el.querySelector(".room")?.textContent).toBe("a");
    expect(el.querySelector(".sub .n")?.textContent).toBe("3");
    act(() => (el.querySelectorAll(".sub button")[1] as HTMLElement).click());
    expect(el.querySelector(".room")?.textContent).toBe("b");
    expect(el.querySelectorAll(".sub button.on").length).toBe(1);
    expect(sessionStorage.getItem("bb.sub.t")).toBe("b");
    act(() => root!.unmount());
    host!.remove();
    const el2 = mount(
      <Sub id="t" tabs={[{ k: "a", label: "ALPHA" }, { k: "b", label: "BETA" }]}>
        {(k) => <p className="room">{k}</p>}
      </Sub>,
    );
    expect(el2.querySelector(".room")?.textContent).toBe("b");
  });

  it("Fold hides its body until opened", () => {
    const el = mount(<Fold title="HELP">text</Fold>);
    expect((el.querySelector("details") as HTMLDetailsElement).open).toBe(false);
  });

  it("Num renders its value and survives a change", () => {
    const el = mount(<Num v={5}>$5</Num>);
    expect(el.textContent).toBe("$5");
    act(() => root!.render(<Num v={9}>$9</Num>));
    expect(el.textContent).toBe("$9");
  });

  it("look preferences switch the page classes", () => {
    setPref("crt", false);
    setPref("swirl", false);
    applyLook();
    expect(document.body.classList.contains("no-crt")).toBe(true);
    expect(document.body.classList.contains("no-swirl")).toBe(true);
    setPref("crt", true);
    setPref("swirl", true);
    applyLook();
    expect(document.body.classList.contains("no-crt")).toBe(false);
  });

  it("juice installs once, tags new panels for the pop-in, and removes cleanly", async () => {
    const off = installJuice();
    const p = document.createElement("section");
    p.className = "panel";
    document.body.appendChild(p);
    await new Promise((r) => setTimeout(r, 10));
    expect(p.dataset.pop).toBe("1");
    p.remove();
    off();
  });
});
