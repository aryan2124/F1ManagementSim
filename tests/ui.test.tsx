// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

// PixiJS needs WebGL, which jsdom doesn't have. Stub it so we can test React + session flow.
vi.mock("pixi.js", () => {
  const make = (): any =>
    new Proxy(function () {}, {
      get: (_t, p) => (p === Symbol.toPrimitive ? () => 0 : p === "then" ? undefined : make()),
      apply: () => make(),
      construct: () => make(),
      set: () => true,
    });
  class Application {
    canvas = document.createElement("canvas");
    stage = make();
    ticker = { add() {}, remove() {} };
    renderer = make();
    init() {
      return Promise.resolve();
    }
    destroy() {}
  }
  return { Application, Container: make(), Graphics: make(), Sprite: make(), Text: make() };
});

import App from "../src/App";
import { RaceScreen } from "../src/ui/RaceScreen";
import { QualiScreen } from "../src/ui/QualiScreen";
import { Results } from "../src/ui/Results";
import { RaceSession } from "../src/game/session";
import { createQualiSession, createWeekend, raceConfigFrom, simulateQualifying, type WeekendSettings } from "../src/game/setup";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(node: React.ReactNode) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => root.render(node));
  return { el, root };
}
const click = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const byText = (root: HTMLElement, sel: string, text: string) =>
  [...root.querySelectorAll(sel)].find((n) => n.textContent?.includes(text)) as HTMLElement;

const refresh = () => act(() => void vi.advanceTimersByTime(400)); // lets the UI poll the sim like the real timer

const SETTINGS: WeekendSettings = { teamId: "mer", circuitId: "silverstone", distance: "quick", seed: 31 };
const T = { "dr-wex": "S", "dr-bel": "M" } as const;

function raceSession(settings = SETTINGS) {
  const w = createWeekend(settings);
  const grid = simulateQualifying(w);
  return { w, session: new RaceSession(raceConfigFrom(w, grid, { ...T }), w.humanIds) };
}

describe("UI flow", () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it("menu shows 11 teams and the 23 race calendar", () => {
    const { el } = mount(<App />);
    expect(el.textContent).toContain("NEW CAREER");
    click(byText(el, "button", "SIMULATE A RACE WEEKEND"));
    expect(el.textContent).toContain("CHOOSE YOUR TEAM");
    expect(el.querySelectorAll(".team-card")).toHaveLength(11);
    expect(el.querySelectorAll(".cal-row")).toHaveLength(23);
    expect(el.textContent).toContain("Silverstone");
  });

  it("menu -> skip qualifying -> grid briefing -> race screen renders", () => {
    const { el } = mount(<App />);
    click(byText(el, "button", "SIMULATE A RACE WEEKEND"));
    click(byText(el, "button", "SKIP TO THE GRID"));
    expect(el.textContent).toContain("STARTING GRID");
    expect(el.querySelectorAll(".grid-table tr")).toHaveLength(22);
    click(byText(el, "button", "TO THE PIT WALL"));
    expect(el.textContent).toContain("THE PIT WALL");
    click(byText(el, "button", "GO TO THE GRID"));
    expect(el.textContent).toContain("TIMING");
    expect(el.querySelectorAll(".tower li")).toHaveLength(22);
    expect(el.querySelectorAll(".carcard")).toHaveLength(2);
  });

  it("menu -> qualifying screen: start Q1, send a car out", () => {
    const { el } = mount(<App />);
    click(byText(el, "button", "SIMULATE A RACE WEEKEND"));
    click(byText(el, "button", "GO TO QUALIFYING"));
    expect(el.textContent).toContain("QUALIFYING");
    expect(el.querySelectorAll(".qboard li")).toHaveLength(22);
    click(byText(el, "button", "START Q1"));
    refresh();
    expect(el.textContent).toContain("GREEN");
  });

  it("qualifying plays through to a grid and hands it to the briefing", () => {
    const w = createWeekend(SETTINGS);
    const q = createQualiSession(w);
    let done = false;
    const { el } = mount(<QualiScreen session={q} meta={w.meta} onDone={() => (done = true)} />);
    for (let seg = 0; seg < 3; seg++) {
      click(byText(el, "button", `START Q${seg + 1}`));
      refresh();
      for (let i = 0; i < 20000 && q.sim.phase === "running"; i++) q.advance(0.25);
      refresh();
      if (seg < 2) {
        click(byText(el, "button", `ON TO Q${seg + 2}`));
        refresh();
      }
    }
    expect(q.sim.phase).toBe("done");
    refresh();
    click(byText(el, "button", "VIEW THE GRID"));
    expect(done).toBe(true);
    expect(q.sim.results()).toHaveLength(22);
  });

  it("race screen controls drive the sim and the results screen shows a classification", () => {
    const { w, session } = raceSession();
    session.speed = 8;
    session.start();
    let finished = false;
    const { el } = mount(<RaceScreen session={session} meta={w.meta} onFinish={() => (finished = true)} />);

    click(byText(el, ".carcard:first-child .ctl button", "PUSH"));
    expect(session.sim.car("dr-wex").push).toBe(2);
    click(byText(el, ".carcard:first-child .ctl button", "ATTACK"));
    expect(session.sim.car("dr-wex").mode).toBe("attack");
    expect(el.textContent).toContain("MUST USE A 2ND COMPOUND");

    for (let i = 0; i < 6000 && !session.finished; i++) session.advance(0.25);
    expect(session.finished).toBe(true);
    refresh();
    expect(el.textContent).toContain("RACE COMPLETE");
    click(byText(el, "button", "VIEW CLASSIFICATION"));
    expect(finished).toBe(true);

    const r = mount(<Results session={session} gp={w.meta.gp} onAgain={() => {}} onMenu={() => {}} />);
    // the short podium scene plays first and can be skipped
    expect(r.el.querySelector(".podium")).toBeTruthy();
    click(r.el.querySelector(".podium") as Element);
    expect(r.el.querySelectorAll(".class-table tbody tr")).toHaveLength(22);
    expect(r.el.textContent).toContain("YOUR TEAM SCORED");
    // nobody pitted, so the player's cars are disqualified under the two compound rule
    expect(r.el.textContent).toContain("DSQ");
  });

  it("race waits on the grid until the player starts the lights", () => {
    const { w, session } = raceSession({ ...SETTINGS, seed: 3 });
    const { el } = mount(<RaceScreen session={session} meta={w.meta} onFinish={() => {}} />);
    expect(el.textContent).toContain("ON THE GRID");
    session.advance(1);
    expect(session.sim.tick).toBe(0);
    click(byText(el, "button", "START LIGHTS"));
    session.advance(1);
    expect(session.sim.tick).toBeGreaterThan(0);
    expect(session.sim.phase).toBe("grid"); // lights run at real time: 1s in, still on the grid
  });

  it("pit button queues a stop that the sim carries out", () => {
    const { w, session } = raceSession({ ...SETTINGS, seed: 9 });
    session.speed = 8;
    session.start();
    const { el } = mount(<RaceScreen session={session} meta={w.meta} onFinish={() => {}} />);
    for (let i = 0; i < 40; i++) session.advance(0.25);
    refresh();
    const car = session.sim.car("dr-wex");
    if (car.status === "racing") {
      click(el.querySelector(".carcard:first-child .pit button[title=\"Box for Hard\"]") as Element);
      expect(car.pitRequest).not.toBeNull();
    }
    for (let i = 0; i < 6000 && !session.finished; i++) session.advance(0.25);
    if (car.status !== "dnf") expect(car.stops).toBeGreaterThanOrEqual(1);
  });
});
