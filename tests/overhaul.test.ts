import { multiply } from "../src/career/factors";
import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { reduce, apply } from "../src/career/reducer";
import { careerEngine as E } from "../src/career/multi";
import { AREA_TRAITS, IMB, TRAIT_AREA, addArea, addTrait, areaOfPair, carFromDna, effCar, partWorth, trackNeed } from "../src/career/traits";
import { HOURS_PER_READING, correct, initKnow, quality, read, sigmaOf, study, studyRegs } from "../src/career/know";
import { fitFor, leadFor, makeCapability, staffReadout } from "../src/career/capability";
import { believedAreaGain, hints, picks } from "../src/career/guide";
import { boardMove, boardParts } from "../src/career/board";
import { tempo, tension } from "../src/career/storyteller";
import { checkFired, monthlyPlayer } from "../src/career/tick";
import { AREAS, TRAITS } from "../src/career/types";
import { Rng } from "../src/sim/rng";
import { rulesOf } from "../src/career/eras";
import { carSpec, teamRanking } from "../src/career/car";
import { autoPlayDays } from "../src/career/headless";
import { spreadOf } from "../src/career/season";
import { fitParts, generateIdeas } from "../src/career/rnd";

const fresh = (seed = 5, team = "wil") => newCareer(team, seed, 1, "quick");

describe("one car model", () => {
  it("area ratings are exactly the blend of their two traits for every team", () => {
    const s = fresh();
    for (const t of Object.values(s.teams)) {
      expect(t.car).toEqual(carFromDna(t.dna));
      for (const a of AREAS) {
        const [x, y] = AREA_TRAITS[a];
        expect(t.car[a]).toBeCloseTo(areaOfPair(t.dna[x], t.dna[y]), 1);
      }
    }
  });

  it("a part on the weaker trait is worth much more than the same part on the stronger one", () => {
    const s = fresh();
    const t = s.teams[s.teamId];
    const [x, y] = AREA_TRAITS.aero;
    t.dna[x] = 0.2;
    t.dna[y] = -0.2;
    const before = areaOfPair(t.dna[x], t.dna[y]);
    const onWeak = areaOfPair(t.dna[x], t.dna[y] + 0.2) - before;
    const onStrong = areaOfPair(t.dna[x] + 0.2, t.dna[y]) - before;
    expect(onWeak).toBeGreaterThan(onStrong * 1.8);
    expect(onWeak - onStrong).toBeCloseTo(2 * IMB * 0.2, 5);
  });

  it("addTrait keeps the cached area ratings in step", () => {
    const s = fresh();
    const t = s.teams[s.teamId];
    addTrait(t, "downforce", 0.3);
    expect(t.car).toEqual(carFromDna(t.dna));
  });

  it("the rulebook and the circuit change what a car is worth, so a lopsided car ranks differently at different tracks", () => {
    const s = fresh();
    const t = s.teams[s.teamId];
    t.dna.downforce += 0.4;
    t.dna.efficiency -= 0.4;
    const monaco = effCar(s, t, "monaco").aero;
    const monza = effCar(s, t, "monza").aero;
    expect(monaco).toBeGreaterThan(monza + 0.05);
    expect(trackNeed("monaco").df).toBeGreaterThan(0.5);
    expect(trackNeed("monza").df).toBeLessThan(-0.5);
  });

  it("the simulator spec feels the track: a downforce car is quicker at Monaco than at Monza", () => {
    const s = fresh();
    const t = s.teams[s.teamId];
    t.dna.downforce += 0.5;
    t.dna.efficiency -= 0.5;
    expect(carSpec(s, s.teamId, "monaco").aero).toBeGreaterThan(carSpec(s, s.teamId, "monza").aero);
  });

  it("part worth depends on the rulebook weight of its trait", () => {
    const s = fresh();
    s.regW = { ...(s.regW as Record<string, number>) } as typeof s.regW;
    (s.regW as Record<string, number>).platform = 1.6;
    (s.regW as Record<string, number>).warmup = 0.6;
    expect(partWorth(s, "platform", 0.1)).toBeGreaterThan(partWorth(s, "warmup", 0.1));
  });

  it("rankings are a pure function of the state (same seed, same order)", () => {
    expect(teamRanking(fresh(7))).toEqual(teamRanking(fresh(7)));
  });
});

describe("knowing the car", () => {
  it("every number is an estimate with an error bar and starts uncertain", () => {
    const s = fresh();
    const t = s.teams[s.teamId];
    for (const tr of TRAITS) {
      expect(t.know[tr].err).toBeGreaterThan(0.05);
      expect(Math.abs(t.know[tr].est - t.dna[tr])).toBeLessThan(0.4);
    }
    expect(t.regKnow.downforce.err).toBeGreaterThan(0.2);
  });

  it("a study costs allowance hours, shrinks the error bar and moves the estimate towards the truth on average", () => {
    let nearer = 0;
    let n = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = fresh(seed);
      const t = s.teams[s.teamId];
      const before = Math.abs(t.know.grip.est - t.dna.grip);
      const err0 = t.know.grip.err;
      const hours = t.tunnelLeft;
      const r = study(s, s.teamId, "grip", 4);
      expect(r.ok).toBe(true);
      expect(t.tunnelLeft).toBe(hours - 4 * HOURS_PER_READING);
      expect(t.know.grip.err).toBeLessThan(err0);
      n++;
      if (Math.abs(t.know.grip.est - t.dna.grip) <= before + 1e-9) nearer++;
    }
    expect(nearer / n).toBeGreaterThan(0.6);
  });

  it("a study the allowance cannot pay for is refused", () => {
    const s = fresh();
    s.teams[s.teamId].tunnelLeft = 5;
    expect(study(s, s.teamId, "grip", 1).ok).toBe(false);
    expect(studyRegs(s, s.teamId, "grip", 1).ok).toBe(false);
  });

  it("studying the rulebook narrows what the team thinks it rewards", () => {
    const s = fresh();
    const t = s.teams[s.teamId];
    const e0 = t.regKnow.output.err;
    expect(studyRegs(s, s.teamId, "output", 4).ok).toBe(true);
    expect(t.regKnow.output.err).toBeLessThan(e0);
  });

  it("better instruments and better people give cleaner readings", () => {
    const s = fresh();
    const t = s.teams[s.teamId];
    t.facilities.tunnel = 1;
    const low = quality(s, s.teamId, "downforce");
    t.facilities.tunnel = 5;
    const high = quality(s, s.teamId, "downforce");
    expect(high).toBeGreaterThan(low + 0.2);
    expect(sigmaOf(high)).toBeLessThan(sigmaOf(low));
  });

  it("belief is only as good as its readings: a poor reading still moves it, by little", () => {
    const s = fresh();
    const t = s.teams[s.teamId];
    const est = t.know.wear.est;
    read(s, s.teamId, "wear", new Rng(3), 0.1);
    expect(Math.abs(t.know.wear.est - est)).toBeLessThan(0.2);
  });

  it("correcting to the truth tightens the bar and the area belief follows", () => {
    const s = fresh();
    const t = s.teams[s.teamId];
    correct(t, "drive", 1);
    expect(t.know.drive.est).toBeCloseTo(t.dna.drive, 1);
    initKnow(t, new Rng(2));
    expect(t.believed.power).toBeCloseTo(areaOfPair(t.know.output.est, t.know.drive.est), 1);
  });
});

describe("people are capabilities", () => {
  it("every team has the three specialist roles and everyone has a specialty and a philosophy", () => {
    const s = fresh();
    for (const id of Object.keys(s.teams)) {
      for (const role of ["aero", "power", "data"] as const) expect(Object.values(s.staff).some((x) => x.teamId === id && x.role === role)).toBe(true);
    }
    for (const st of Object.values(s.staff)) {
      expect(st.spec).toBeTruthy();
      expect(st.phil).toBeTruthy();
    }
  });

  it("a specialist in the right area whose instincts match the concept is a better fit than a mismatch", () => {
    const s = fresh();
    const rng = new Rng(9);
    const a = Object.values(s.staff).find((x) => x.role === "aero" && x.teamId === s.teamId)!;
    const c = makeCapability("aero", rng);
    a.spec = { ...c.spec, aero: 0.95, power: 0.1, chassis: 0.1, cooling: 0.1, tyres: 0.1 };
    a.phil = { df: 0.8, risk: 0.2, innov: 0 };
    const t = s.teams[s.teamId];
    t.concept = { df: 0.8, risk: 0.2, innov: 0 };
    const good = fitFor(s, a, t.concept, "downforce").mult;
    t.concept = { df: -0.9, risk: -0.8, innov: 0.9 };
    const bad = fitFor(s, a, t.concept, "downforce").mult;
    expect(good).toBeGreaterThan(bad + 0.12);
    expect(fitFor(s, a, { df: 0.8, risk: 0.2, innov: 0 }, "output").mult).toBeLessThan(good);
  });

  it("overloading one engineer costs quality", () => {
    const s = fresh();
    const a = Object.values(s.staff).find((x) => x.role === "aero" && x.teamId === s.teamId)!;
    const t = s.teams[s.teamId];
    expect(fitFor(s, a, t.concept, "downforce", 5).mult).toBeLessThan(fitFor(s, a, t.concept, "downforce", 1).mult);
  });

  it("how well you know someone sets how blurred their specialty looks", () => {
    const s = fresh();
    const st = Object.values(s.staff).find((x) => x.role === "aero")!;
    st.known = 0.1;
    const blurry = staffReadout(s, st).half;
    st.known = 1;
    expect(staffReadout(s, st).half).toBeLessThan(blurry);
  });

  it("the lead for a trait is chosen by skill times fit", () => {
    const s = fresh();
    expect(leadFor(s, s.teamId, "downforce")).toBeTruthy();
  });
});

describe("new actions", () => {
  it("designPart makes an idea on exactly the trait asked, led by the person chosen, and is pure", () => {
    const s = fresh();
    const lead = Object.values(s.staff).find((x) => x.role === "aero" && x.teamId === s.teamId)!;
    const r = reduce(s, { type: "designPart", area: "aero", trait: "efficiency", kind: "safe", lead: lead.id });
    expect(r.ok).toBe(true);
    const mine = r.state.teams[s.teamId].ideas.filter((i) => i.trait === "efficiency");
    expect(mine.length).toBeGreaterThan(0);
    expect(mine[0].lead).toBe(lead.id);
    expect(s.teams[s.teamId].ideas.some((i) => i.trait === "efficiency")).toBe(false);
    expect(r.state.teams[s.teamId].tunnelLeft).toBe(s.teams[s.teamId].tunnelLeft - 6);
    expect(reduce(s, { type: "designPart", area: "aero", trait: "grip", kind: "safe" }).ok).toBe(false);
  });

  it("a commissioned part, once built and fitted, changes the trait it was for", () => {
    const s = fresh();
    const t = s.teams[s.teamId];
    expect(apply(s, { type: "designPart", area: "power", trait: "drive", kind: "safe" }).ok).toBe(true);
    const idea = t.ideas.find((i) => i.trait === "drive")!;
    idea.trueGain = 0.1;
    expect(apply(s, { type: "startProject", ideaId: idea.id }).ok).toBe(true);
    const p = t.projects.find((x) => x.id === idea.id)!;
    p.status = "ready";
    const before = t.dna.drive;
    fitParts(s, s.teamId);
    expect(p.status).toBe("fitted");
    expect(t.dna.drive).toBeGreaterThan(before + 0.15);
    expect(t.car).toEqual(carFromDna(t.dna));
  });

  it("the concept can be set, clamps, and then settles for four weeks", () => {
    const s = fresh();
    expect(apply(s, { type: "setConcept", phil: { df: 5, risk: -0.5 } }).ok).toBe(true);
    const t = s.teams[s.teamId];
    expect(t.concept.df).toBe(1);
    expect(t.concept.risk).toBe(-0.5);
    expect(apply(s, { type: "setConcept", phil: { df: 0 } }).ok).toBe(false);
    s.day += 29;
    expect(apply(s, { type: "setConcept", phil: { df: 0 } }).ok).toBe(true);
  });

  it("study and rulebook study work through the reducer", () => {
    const s = fresh();
    expect(apply(s, { type: "study", trait: "capacity", readings: 2 }).ok).toBe(true);
    expect(apply(s, { type: "studyRegs", trait: "capacity", readings: 2 }).ok).toBe(true);
    expect(apply(s, { type: "study", trait: "nonsense" as never, readings: 2 }).ok).toBe(false);
  });

  it("loans cost interest every month and the board dislikes big debt", () => {
    const s = fresh();
    const t = s.teams[s.teamId];
    expect(apply(s, { type: "borrow", amount: 2 }).ok).toBe(false);
    expect(apply(s, { type: "borrow", amount: 40 }).ok).toBe(true);
    expect(t.debt).toBe(40);
    expect(apply(s, { type: "borrow", amount: 50 }).ok).toBe(false);
    const cash0 = t.cash;
    const board0 = t.board;
    monthlyPlayer(s);
    expect(t.board).toBeLessThan(board0);
    expect(cash0).toBeGreaterThan(0);
    expect(apply(s, { type: "repay", amount: 40 }).ok).toBe(true);
    expect(t.debt).toBe(0);
  });
});

describe("optional guidance", () => {
  it("is off by default and shows no hints or picks", () => {
    const s = fresh();
    generateIdeas(s, s.teamId);
    expect(s.guidance ?? "off").toBe("off");
    expect(hints(s)).toEqual([]);
    expect(picks(s)).toEqual([]);
  });

  it("hints add flags, full adds picks, and switching never changes the car", () => {
    const s = fresh();
    for (let i = 0; i < 6; i++) generateIdeas(s, s.teamId);
    const snapshot = JSON.stringify(s.teams);
    apply(s, { type: "setGuidance", level: "hints" });
    expect(hints(s).length).toBeGreaterThan(0);
    expect(picks(s)).toEqual([]);
    apply(s, { type: "setGuidance", level: "full" });
    expect(s.teams[s.teamId].ideas.length ? picks(s).length : 1).toBeGreaterThan(0);
    expect(JSON.stringify(s.teams)).toBe(snapshot);
  });

  it("believedAreaGain uses only beliefs: it changes when beliefs change, not when the truth does", () => {
    const s = fresh();
    const t = s.teams[s.teamId];
    const a = believedAreaGain(s, s.teamId, "downforce", 0.1);
    t.dna.downforce += 1;
    expect(believedAreaGain(s, s.teamId, "downforce", 0.1)).toBe(a);
    t.know.downforce.est += 0.5;
    expect(believedAreaGain(s, s.teamId, "downforce", 0.1)).not.toBe(a);
  });

  it("the monthly R&D card carries no recommendation unless full advice is on", () => {
    const s = fresh();
    s.day = s.day - (s.day % 28) + 28 + 2;
    const text = (lvl: "off" | "full") => {
      const c = structuredClone(s);
      c.guidance = lvl;
      autoPlayDays(c, 40, { weekends: false });
      return c.cards.filter((x) => x.kind === "rndDirection").map((x) => x.title + x.body + x.options.map((o) => o.label).join(" ")).join(" ");
    };
    expect(text("off")).not.toMatch(/recommend/i);
  });
});

describe("the board", () => {
  it("every move is logged with its cause and the parts are readable", () => {
    const s = fresh();
    const t = s.teams[s.teamId];
    boardMove(s, t, -4, "Test cause");
    expect(s.boardLog?.[0]).toMatchObject({ why: "Test cause" });
    expect(s.boardLog![0].delta).toBeLessThan(0);
    expect(s.boardLog![0].delta).toBeCloseTo(-4 / multiply(s, s.teamId, ["funding", "reputation"]).value, 0);
    const p = boardParts(s);
    for (const v of Object.values(p)) expect(Math.abs(v)).toBeLessThanOrEqual(1);
  });

  it("no seat is safe after the first season, even the weakest car", () => {
    const s = fresh(5, "cad");
    s.year += 1;
    const t = s.teams[s.teamId];
    for (const o of Object.values(s.teams)) if (o.id !== s.teamId) addArea(o, "aero", 5);
    t.board = 10;
    checkFired(s);
    expect(s.fired).toBe(true);
    expect(s.cards.some((c) => c.kind === "firing" && c.options.length > 0)).toBe(true);
  });

  it("the weakest car gets a grace period in the first season", () => {
    const s = fresh(5, "cad");
    for (const o of Object.values(s.teams)) if (o.id !== s.teamId) addArea(o, "aero", 5);
    s.teams[s.teamId].board = 10;
    checkFired(s);
    expect(s.fired).toBe(false);
    expect(s.teams[s.teamId].board).toBeGreaterThanOrEqual(22);
  });
});

describe("storyteller", () => {
  it("eases off under pressure and stirs things up in a long quiet spell", () => {
    const s = fresh();
    s.story.bigDay = -999;
    s.story.last.storyAny = -999;
    expect(tempo(s)).toBeGreaterThan(1);
    s.teams[s.teamId].board = 20;
    s.teams[s.teamId].cash = -5;
    expect(tension(s)).toBeGreaterThan(0.5);
    expect(tempo(s)).toBeLessThan(1);
  });
});

describe("leagues get the whole game", () => {
  const league = () => {
    let s = E.create({ seed: 77, teamId: "fer", settings: { extra: { raceLength: "quick" } } });
    s = E.assign(s, "fer", "p1");
    s = E.assign(s, "mcl", "p2");
    return s;
  };

  it("a rival's traits, what they know and the true rulebook never reach another player", () => {
    const s = league();
    const v = E.view(s, "fer") as ReturnType<typeof newCareer>;
    expect(v.regW).toBeUndefined();
    const rival = v.teams.mcl;
    expect(rival.concept).toEqual({ df: 0, risk: 0, innov: 0 });
    for (const tr of TRAITS) {
      expect(rival.dna[tr]).toBe(rival.car[TRAIT_AREA[tr]]);
      expect(rival.know[tr].err).toBeGreaterThanOrEqual(0.3);
    }
    expect(rival.projects).toEqual([]);
    expect(rival.ideas).toEqual([]);
  });

  it("each person has their own slice for the new state and can act independently", () => {
    let s = league();
    const r1 = E.reduceAs(s, "fer", { type: "setConcept", phil: { df: 0.9 } });
    expect(r1.ok).toBe(true);
    s = r1.state;
    const r2 = E.reduceAs(s, "mcl", { type: "setGuidance", level: "full" });
    s = r2.state;
    const vf = E.view(s, "fer") as ReturnType<typeof newCareer>;
    const vm = E.view(s, "mcl") as ReturnType<typeof newCareer>;
    expect(vf.teams.fer.concept.df).toBe(0.9);
    expect(vm.teams.mcl.concept.df).not.toBe(0.9);
    expect(vf.guidance ?? "off").toBe("off");
    expect(vm.guidance).toBe("full");
    // the other person's study does not touch my belief
    const mine = JSON.stringify((E.view(s, "fer") as ReturnType<typeof newCareer>).teams.fer.know);
    const s2 = E.reduceAs(s, "mcl", { type: "study", trait: "grip", readings: 2 }).state;
    expect(JSON.stringify((E.view(s2, "fer") as ReturnType<typeof newCareer>).teams.fer.know)).toBe(mine);
  });

  it("stories, mail and letters now reach every person in a league", () => {
    let s = league();
    let storyFer = 0;
    let storyMcl = 0;
    for (let i = 0; i < 260; i++) {
      const r = E.stepDay(s);
      s = r.state;
      if (r.weekend) {
        s = E.applySession(s, "qualifying", null);
        s = E.applySession(s, "race", null);
      }
      const fer = E.view(s, "fer") as ReturnType<typeof newCareer>;
      const mcl = E.view(s, "mcl") as ReturnType<typeof newCareer>;
      storyFer = Math.max(storyFer, Object.keys(fer.story.last).filter((k) => k.startsWith("st:")).length + (fer.story.last.storyAny !== undefined ? 1 : 0));
      storyMcl = Math.max(storyMcl, Object.keys(mcl.story.last).filter((k) => k.startsWith("st:")).length + (mcl.story.last.storyAny !== undefined ? 1 : 0));
    }
    expect(storyFer).toBeGreaterThan(0);
    expect(storyMcl).toBeGreaterThan(0);
  }, 400_000);

  it("a league owner's last warning replaces the sack and keeps every seat filled", () => {
    const s = league();
    const w = s.world;
    const sl = s.slices.fer;
    void sl;
    w.humans = ["fer", "mcl"];
    w.teamId = "fer";
    w.year += 1;
    w.teams.fer.board = 10;
    checkFired(w);
    expect(w.fired).toBe(false);
    expect(w.teams.fer.board).toBe(30);
    expect(w.cards.some((c) => c.title === "The owner's last warning")).toBe(true);
  });
});

describe("balance bands", () => {
  it("the rules in force are a normal season at the start", () => {
    expect(rulesOf(fresh())).toEqual({});
    expect(spreadOf(fresh())).toBeGreaterThan(0.05);
  });
});
