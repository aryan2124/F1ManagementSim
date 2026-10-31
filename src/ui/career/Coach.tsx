import { useEffect, useRef, useState } from "react";
import type { Action, CareerState } from "../../career/types";
import type { Tab } from "./common";
import { planOf } from "../../career/rndplan";
import { sfx } from "../../audio/sound";
import "./coach.css";
import { ask } from "../Confirm";

/**
 * The tutorial coach: a small card that walks a new player through the real screens of a practice career.
 * It waits for the player to do each thing instead of talking at them, can be moved out of the way, and can be left at any time.
 */
type Phase = number;
interface Base { day: number; round: number; runsLeft: number }
interface Ctx { s: CareerState; tab: Tab; inWeekend: boolean; running: boolean; base: Base; startRound: number }
interface Target { sel: string; text?: RegExp }
export interface Step {
  id: string;
  chapter: string;
  title: string;
  body: string[];
  phase: Phase;
  target?: Target | ((c: Ctx) => Target | undefined);
  needsTab?: Tab;
  /** The coach moves on by itself when this turns true. */
  done?: (c: Ctx) => boolean;
  skipIf?: (c: Ctx) => boolean;
  /** Nothing to press here: it moves on when the situation changes. */
  passive?: boolean;
  demo?: boolean;
  last?: boolean;
}

const TAB_LABEL: Record<Tab, string> = { today: "TODAY", inbox: "INBOX", calendar: "CALENDAR", car: "CAR & R&D", people: "PEOPLE", academy: "ACADEMY", money: "MONEY", rules: "RULES", world: "WORLD" };
const tabBtn = (t: Tab): Target => ({ sel: ".c-tabs button", text: new RegExp(`^${TAB_LABEL[t].replace("&", "\\&")}`) });
const pending = (s: CareerState) => s.cards.some((c) => !c.notice && !c.mail);

export const STEPS: Step[] = [
  { id: "welcome", chapter: "1 THE FACTORY", phase: 0, title: "Welcome to BOX BOX", body: ["You run an F1 team: the car, the people, the money and every race weekend.", "This takes about ten minutes and uses a practice career. Nothing here is saved, and you can leave any time."] },
  { id: "tabs", chapter: "1 THE FACTORY", phase: 0, title: "Everything lives in these tabs", target: { sel: ".c-tabs" }, body: ["TODAY is home. INBOX holds mail and messages, CALENDAR the races and deadlines, CAR & R&D builds the car, PEOPLE is staff and drivers, ACADEMY grows young talent, MONEY is the cost cap, RULES is the regulations, WORLD is the standings.", "Keys 1 to 9 jump between them."] },
  { id: "car-open", chapter: "1 THE FACTORY", phase: 0, title: "Open the car", target: tabBtn("car"), body: ["Click CAR & R&D."], done: (c) => c.tab === "car" },
  { id: "car", chapter: "1 THE FACTORY", phase: 0, title: "The car is five areas", needsTab: "car", body: ["Aero, chassis, power, cooling and tyres, each made of two traits. You are ranked against ten rivals in every one.", "To get faster you brief the design office. About every six weeks the engineers report where you are losing time, you pick one problem, and they pitch three ways to fix it: a quick fix, a proper job, or a risky rethink. Each pitch shows its price, build time and which races it arrives in time for."] },
  { id: "money-open", chapter: "1 THE FACTORY", phase: 0, title: "Now the money", target: tabBtn("money"), body: ["Click MONEY."], done: (c) => c.tab === "money" },
  { id: "money", chapter: "1 THE FACTORY", phase: 0, title: "The cost cap is the real limit", needsTab: "money", body: ["Everything the factory builds counts against the cap. Go over and you are fined and the board loses trust. Sponsors pay the bills, and fans, results and the board's mood decide how generous they are.", "A team with no cash or a hostile board gets sacked, so keep an eye on this tab."] },
  { id: "people", chapter: "1 THE FACTORY", phase: 0, title: "People win championships", target: tabBtn("people"), body: ["PEOPLE has your drivers, designers and engineers. Their contracts run out, rivals try to poach them, and a unhappy designer pitches worse. Re-sign the people you need before the deadline, and use the ACADEMY to find the next ones.", "Have a look around, then press NEXT."] },
  { id: "rules-open", chapter: "1 THE FACTORY", phase: 0, title: "The rulebook", target: tabBtn("rules"), body: ["Click RULES."], done: (c) => c.tab === "rules" },
  { id: "rules", chapter: "1 THE FACTORY", phase: 0, title: "The rules change, and the order changes with them", needsTab: "rules", body: ["Every four to five years the regulations are rewritten. This tab warns you years ahead, lets you vote on the rules, and lets you pick a design route for the new car. Nobody is told which route is best.", "It is the biggest shake-up in the game, so after your first weekend we will play a mock race to show you exactly what it feels like."] },
  { id: "go-today", chapter: "1 THE FACTORY", phase: 0, title: "Back to TODAY, then run the clock", target: (c) => (c.tab === "today" ? { sel: ".c-dock .btn.primary" } : tabBtn("today")), body: ["Time only moves when you press CONTINUE. The days run until something needs a decision, and then the clock stops by itself.", "Press CONTINUE."], done: (c) => c.s.day > c.base.day + 1 || !!c.s.weekend || pending(c.s) },
  { id: "decision", chapter: "1 THE FACTORY", phase: 0, title: "A decision is waiting", skipIf: (c) => !pending(c.s) || !!c.s.weekend, body: ["The clock stopped because something needs you. Your departments report to you like this: the engineers, the design office, the academy, the board. Read it, then choose an option in the scene on screen.", "In a real career more of these arrive every week. Here the team handles the rest for you so we can get to the racing. If you close this one with LATER, the card waits on TODAY under DECISIONS, and the clock will not run until you decide."], done: (c) => !pending(c.s) || !!c.s.weekend },
  { id: "wait-weekend", chapter: "1 THE FACTORY", phase: 0, title: "Keep going until the race weekend", skipIf: (c) => c.inWeekend, target: { sel: ".c-dock .btn.primary" }, body: ["Press CONTINUE again (or SPACE). The first race is about two months away, so use the 4x speed button if you like. Pause at any time with PAUSE or Escape."], done: (c) => !!c.s.weekend && c.s.weekend.stage !== "done" },
  { id: "start-weekend", chapter: "1 THE FACTORY", phase: 0, title: "The weekend is here", target: { sel: ".c-dock .btn.primary" }, body: ["The big button now names the next thing to do. Press it."], done: (c) => c.inWeekend },

  { id: "practice", chapter: "2 THE WEEKEND", phase: 1, title: "Practice: the garage", body: ["A weekend is practice, qualifying, then the race. Practice is your only chance to learn the car. You get a few runs, nobody can tell you the best setup, and everything you learn carries into Sunday.", "The engineers' setup guess comes from a simulator that is never quite right. Your own lap times can prove it wrong."] },
  { id: "alloc", chapter: "2 THE WEEKEND", phase: 1, title: "Tyres are limited", target: { sel: "button", text: /^CONFIRM \d/ }, skipIf: (c) => !!c.s.weekend?.setList, body: ["You only have so many sets of soft, medium and hard for the whole weekend. Choose how to split them, or press USE THEIR SPLIT to take the engineers' advice. Then press the orange CONFIRM button to lock it in. Every set you use in practice is one less on Sunday."], done: (c) => !!c.s.weekend?.setList },
  { id: "run1", chapter: "2 THE WEEKEND", phase: 1, title: "Send a driver out", target: { sel: "button", text: /SEND HIM OUT/ }, body: ["Pick a programme under RUN PLAN (SETUP is a good first one), then press SEND HIM OUT. Each run is measured against your first run, the baseline, so make one change at a time."], done: (c) => (c.s.weekend?.runsLeft ?? 0) < c.base.runsLeft },
  { id: "feedback", chapter: "2 THE WEEKEND", phase: 1, title: "Read what came back", body: ["Look under THE EVIDENCE: the lap time against your baseline (minus is quicker) and what the driver complained about. Each driver has his own taste, so the two will disagree, and you pick the compromise.", "Under the SEND HIM OUT button there is also a line starting \"The factory can use this\". Practice feeds R&D: the data makes matching projects cheaper and quicker for five weeks."] },
  { id: "run2", chapter: "2 THE WEEKEND", phase: 1, title: "Run a tyre wear study", target: { sel: "button", text: /SEND HIM OUT/ }, body: ["Pick TYRE WEAR STUDY in RUN PLAN and send him out. It does not give a lap time, but it teaches the engineers about tyre life, and it makes tyre projects cheaper back at the factory."], done: (c) => (c.s.weekend?.runsLeft ?? 0) < c.base.runsLeft || (planOf(c.s.teams[c.s.teamId]).boosts ?? []).some((b) => b.trait === "wear") },
  { id: "end-practice", chapter: "2 THE WEEKEND", phase: 1, title: "Finish practice", target: { sel: "button", text: /END PRACTICE/ }, body: ["When you are happy, save your setup and press END PRACTICE. Setup locks in once qualifying starts, so this is your last chance to change it."], done: (c) => c.s.weekend?.stage !== "practice" },
  { id: "quali", chapter: "2 THE WEEKEND", phase: 2, title: "Qualifying", passive: true, target: { sel: "button", text: /GO TO THE GARAGE|^START Q\d/ }, body: ["Qualifying decides your grid slot. It is three knock-out segments: the slowest cars are out after each. Press GO TO THE GARAGE, then START Q1, and send your cars out from the panel on the right (GO OUT) on the tyre set you pick in the tyre rack, or let the team run them.", "A set used here carries its wear into the race. This step moves on by itself when qualifying is over."], done: (c) => ["sprint", "race", "done"].includes(c.s.weekend?.stage ?? "") },
  { id: "race", chapter: "2 THE WEEKEND", phase: 3, title: "The race: you are the pit wall", passive: true, body: ["Your two cars are highlighted in the timing tower. Watch each car's TYRE meter and press the PIT button before the tyres fall off a cliff: pick the set you want to bolt on. PUSH and SAVE trade pace for tyres, and the energy mode (HARVEST, BALANCE, ATTACK) trades battery for speed.", "Radio prompts pop up when something happens: a safety car, rain, a team-mate battle. Answer them, or the default happens. This race is only ten laps. The step moves on when it is over."], done: (c) => c.s.round > c.startRound },
  { id: "after", chapter: "2 THE WEEKEND", phase: 4, title: "That was your first weekend", body: ["Points go into the standings (WORLD tab), prize money and sponsor bonuses arrive, and drivers and fans remember how it went. Back at the factory the cycle repeats: brief the office, back a pitch, practise to feed it, race.", "Press BACK TO THE FACTORY when you are ready, then press NEXT."] },
  { id: "rules-demo", chapter: "3 THE RULES CHANGE", phase: 4, title: "The rules change", demo: true, body: ["A drastic rewrite, played out for real."] },
  { id: "era-rules-open", chapter: "3 THE RULES CHANGE", phase: 5, title: "The new rulebook is in", target: tabBtn("rules"), body: ["The rules have just changed, and a second race weekend is coming up under them. Click RULES to see what is different."], done: (c) => c.tab === "rules" },
  { id: "era-rules", chapter: "3 THE RULES CHANGE", phase: 5, title: "Two new modules", needsTab: "rules", body: ["A rulebook is a set of modules. This one has two: DEPLOYMENT MAPS (a much bigger electric share of the power, with a new setting for when to spend the battery) and PUSH TO PASS (boost tokens in the race).", "Real eras mix four or five modules, some add a setting, some take a control away, and you vote on them years ahead. The old figures matter less now, so the order is about to shuffle."] },
  { id: "era-wait", chapter: "3 THE RULES CHANGE", phase: 5, title: "On to the next race", skipIf: (c) => c.inWeekend, target: { sel: ".c-dock .btn.primary" }, body: ["Press CONTINUE until the race weekend arrives, then press the big button again to enter it. This one is only days away."], done: (c) => c.inWeekend },
  { id: "era-practice", chapter: "3 THE RULES CHANGE", phase: 6, title: "A new setting in practice", body: ["Look at the setup panel: there is a new slider, BATTERY DEPLOYMENT. Save the battery for the end of the straight, or spend it early out of corners? Nobody knows the right answer under new rules. Run the SETUP programme and read the engineers' feedback to find out.", "Your old data is worth less, so treat your first runs as exploring. Press END PRACTICE when you are done."], target: { sel: "button", text: /END PRACTICE/ }, done: (c) => !!c.s.weekend && c.s.weekend.stage !== "practice" },
  { id: "era-quali", chapter: "3 THE RULES CHANGE", phase: 7, title: "Qualifying under new rules", passive: true, target: { sel: "button", text: /GO TO THE GARAGE|^START Q\d/ }, body: ["Qualifying works as before, but watch the grid: the teams that suited the old rules may not be on the front rows any more. Run it or skip it."], done: (c) => !!c.s.weekend && (c.s.weekend.stage === "race" || c.s.weekend.stage === "done") },
  { id: "era-race", chapter: "3 THE RULES CHANGE", phase: 8, title: "The race: boost tokens", passive: true, body: ["New in the pit wall panel: the BOOST button. Each driver has a few tokens, and each gives about twelve seconds of extra power. Spend them to attack the car ahead or defend, and do not waste them early.", "Also watch BATT: the electric power is a much bigger part of lap time now. Compare the finishing order with your first weekend. The step moves on when the race is over."], done: (c) => c.s.round > c.startRound + 1 },
  { id: "era-after", chapter: "3 THE RULES CHANGE", phase: 9, title: "Same cars, new order", body: ["That is what a regulation change does: the same teams, the same drivers, a different order. Open the WORLD tab and compare the standings with last week.", "In a real career you see this coming years ahead. Teams that read the rulebook early, picked the right route and prepared their cars lead the new era. Teams that did not fall back."] },
  { id: "finish", chapter: "3 THE RULES CHANGE", phase: 10, last: true, title: "You are ready", body: ["The loop: brief the office every six weeks, back a pitch, practise to feed it, race, and keep an eye on the cap.", "The long game: re-sign your people before their contracts end, grow the academy, and read the RULES tab early. When the rules change, the team that prepared wins.", "You can replay this any time from the main menu. Good luck."] },
];

function findTarget(t: Target | undefined): HTMLElement | null {
  if (!t) return null;
  const els = Array.from(document.querySelectorAll<HTMLElement>(t.sel)).filter((e) => !e.closest(".coach, .coach-demo"));
  const hit = els.find((e) => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4 && (!t.text || t.text.test((e.textContent ?? "").trim())); });
  return hit ?? null;
}

const phaseOf = (c: Pick<Ctx, "s" | "inWeekend" | "startRound">): Phase => {
  const ws = c.s.weekend;
  if (c.s.era.current) {
    // act two: the rules have changed and a second weekend is played under them
    if (c.s.round > c.startRound + 1) return 9;
    if (c.inWeekend && ws) return ws.stage === "practice" ? 6 : ws.stage === "quali" || ws.stage === "sq" ? 7 : 8;
    return 5;
  }
  if (c.s.round > c.startRound) return 4;
  if (c.inWeekend && ws) {
    if (ws.stage === "practice") return 1;
    if (ws.stage === "quali" || ws.stage === "sq") return 2;
    return 3;
  }
  return 0;
};

export function Coach({ s, d, tab, go, inWeekend, running, hidden, onDone }: { s: CareerState; d: (a: Action) => unknown; tab: Tab; go: (t: Tab) => void; inWeekend: boolean; running: boolean; hidden?: boolean; onDone: (finished: boolean) => void }) {
  const [idx, setIdx] = useState(0);
  const [force, setForce] = useState<"bottom" | "top" | null>(null);
  const [okAt, setOkAt] = useState(-1);
  const [box, setBox] = useState<DOMRect | null>(null);
  const [scene, setScene] = useState(false);
  const startRound = useRef(s.round);
  const snap = (): Base => ({ day: s.day, round: s.round, runsLeft: s.weekend?.runsLeft ?? 0 });
  const baseRef = useRef<Base>(snap());
  const ctx: Ctx = { s, tab, inWeekend, running, base: baseRef.current, startRound: startRound.current };
  const ok = okAt === idx;
  const step = STEPS[Math.min(idx, STEPS.length - 1)];
  const doneNow = !!step.done?.(ctx);
  const idxRef = useRef(idx);
  idxRef.current = idx;
  const timer = useRef<number | undefined>(undefined);
  // skipping a weekend step runs that session for you, so the tutorial lands on the next one
  const skipStep = () => {
    if (s.weekend && s.weekend.stage !== "done") {
      if (step.id === "end-practice" || step.id === "era-practice") { d({ type: "simTo", until: "quali" }); return; }
      if (step.id === "quali" || step.id === "era-quali") { d({ type: "simTo", until: "race" }); return; }
      if (step.id === "race" || step.id === "era-race") { d({ type: "simTo", until: "done" }); return; }
    }
    goTo(idx + 1);
  };
  const goTo = (i: number) => { window.clearTimeout(timer.current); baseRef.current = snap(); setIdx(i); };

  // skip what the player has already got past, or never needs
  useEffect(() => {
    const ph = phaseOf(ctx);
    let i = idx;
    while (i < STEPS.length - 1 && (STEPS[i].phase < ph || STEPS[i].skipIf?.(ctx)) && !STEPS[i].demo && !STEPS[i].last) i++;
    if (i !== idx) goTo(i);
  });
  // move on by itself when the player has done the thing. Once it is done it stays done, even if the situation changes again
  useEffect(() => {
    if (!doneNow || ok) return;
    setOkAt(idx);
    sfx.play("confirm");
    const at = idx;
    timer.current = window.setTimeout(() => { if (idxRef.current === at) goTo(at + 1); }, step.passive ? 300 : 900);
  }, [doneNow, idx]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => window.clearTimeout(timer.current), []);
  // the outline around whatever the step is about
  useEffect(() => {
    const t = typeof step.target === "function" ? step.target(ctx) : step.target;
    const tick = () => {
      const el = findTarget(t);
      const r = el?.getBoundingClientRect() ?? null;
      setScene(!!document.querySelector(".dr-back"));
      setBox((p) => (p && r && Math.abs(p.x - r.x) < 1 && Math.abs(p.y - r.y) < 1 && Math.abs(p.width - r.width) < 1 && Math.abs(p.height - r.height) < 1 ? p : r));
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [idx, tab, inWeekend, s.weekend?.stage]); // eslint-disable-line react-hooks/exhaustive-deps

  // the card stays clear of whatever it is pointing at, unless the player has moved it
  const auto: "bottom" | "top" = box && box.y + box.height / 2 > window.innerHeight * 0.45 ? "top" : "bottom";
  const pos = force ?? auto;
  if (hidden) return null;
  if (step.demo) return <NewRules onGo={() => { d({ type: "tutorialEra" }); goTo(idx + 1); }} onSkip={() => goTo(STEPS.length - 1)} />;
  const n = STEPS.length;
  return (
    <>
      {box && !ok && !scene && <div className="coach-ring" style={{ left: box.x - 6, top: box.y - 6, width: box.width + 12, height: box.height + 12 }} />}
      <aside className={`coach ${scene ? "side" : pos} ${ok ? "ok" : ""}`} role="dialog" aria-label="Tutorial" data-step={step.id} data-ok={String(ok)} data-done={String(doneNow)} data-wk={String(!!s.weekend)}>
        <div className="coach-top">
          <span>{step.chapter}</span>
          <button className="tiny" onClick={() => setForce(pos === "bottom" ? "top" : "bottom")} title="Move this box out of the way">{pos === "bottom" ? "MOVE UP" : "MOVE DOWN"}</button>
        </div>
        <div className="coach-bar"><i style={{ width: `${Math.round((idx / (n - 1)) * 100)}%` }} /></div>
        <h4>{step.title}</h4>
        {step.body.map((p, i) => <p key={i}>{p}</p>)}
        {step.needsTab && tab !== step.needsTab && (
          <p className="coach-hint">This is about the {TAB_LABEL[step.needsTab]} tab. <button className="tiny" onClick={() => go(step.needsTab!)}>TAKE ME THERE</button></p>
        )}
        {scene && step.phase === 0 && !step.passive && step.id !== "decision" && <p className="coach-hint">The scene on screen is a decision or report from one of your departments. Read it and pick an option. The clock waits for you.</p>}
        {ok && <p className="coach-ok">DONE</p>}
        <div className="coach-btns">
          {step.last ? (
            <button className="btn primary" onClick={() => onDone(true)}>FINISH THE TUTORIAL</button>
          ) : step.done || step.passive ? (
            <button className="tiny" onClick={skipStep}>SKIP THIS STEP</button>
          ) : (
            <button className="btn primary" onClick={() => goTo(idx + 1)}>NEXT</button>
          )}
          {!step.last && <button className="tiny" onClick={() => ask("You can replay it from the main menu.", () => onDone(false), { title: "LEAVE THE TUTORIAL?", yes: "LEAVE" })}>LEAVE TUTORIAL</button>}
        </div>
      </aside>
    </>
  );
}

function NewRules({ onGo, onSkip }: { onGo: () => void; onSkip: () => void }) {
  return (
    <div className="coach-demo" role="dialog" aria-label="The rules change">
      <div className="coach-demo-card">
        <h3>THE RULES CHANGE: THE ELECTRIC ERA</h3>
        <p>Every four to five years the sport rewrites the rulebook, and the order of the grid is thrown up in the air. Here is a big, simple one, switched on right now:</p>
        <div className="coach-explain">
          <p><b>1. Much more electric power.</b> The battery now supplies a big share of the power. NEW SETTING: BATTERY DEPLOYMENT. Save the battery for the end of the straight, or spend it early out of the corners.</p>
          <p><b>2. Push to pass.</b> Every driver gets boost tokens each race, about twelve seconds of extra power each. NEW BUTTON on the pit wall: BOOST.</p>
          <p><b>3. A shuffled order.</b> What the old rules rewarded is worth less, what they ignored is worth more, and every team's figures are pulled toward the middle. Parts built for the old rules lose value and your engineers are less sure of their numbers.</p>
        </div>
        <p>Press the button, then play a second race weekend under the new rules and see how different it feels.</p>
        <div className="coach-btns">
          <button className="btn primary" onClick={onGo}>CHANGE THE RULES</button>
          <button className="tiny" onClick={onSkip}>SKIP THIS</button>
        </div>
      </div>
    </div>
  );
}
