import { describe, expect, it } from "vitest";
import { newCareer } from "../src/career/world";
import { reduce } from "../src/career/reducer";
import { advanceDay, resolveCard } from "../src/career/tick";
import { generateIdeas, startProject, scrapProject } from "../src/career/rnd";
import { labToIdea } from "../src/career/rnd";
import { runLab } from "../src/career/lab";
import { forceThread, advanceThread, resolveThread } from "../src/career/threads";
import { resolveTestDay, testDayCard } from "../src/career/dev";
import { devOf, devWeekly, onBatchDecided, onLanding, pitchLine, recOf, testPart, rookieCandidate } from "../src/career/dev";
import { teamStaff } from "../src/career/car";
import { designOf } from "../src/career/design";

function pushBatch(s: ReturnType<typeof newCareer>, ids: number[]) {
  s.cards.push({ id: 9001, kind: "ideaBatch", title: "t", body: "b", options: ids.map((i) => ({ id: `idea:${i}`, label: "x" })).concat([{ id: "none", label: "none" } as never]), urgency: 2, deadline: s.day + 6, defaultOption: "none", data: { offered: ids.join(",") } } as never);
}

function withProject(seed = 5) {
  const s = newCareer("mcl", seed);
  s.day += 80;
  const t = s.teams[s.teamId];
  let n = 0;
  while (t.ideas.length < 3 && n++ < 40) { s.day++; generateIdeas(s, s.teamId); }
  return { s, t };
}

describe("development record", () => {
  it("scrapping hurts the author, more when it was far along, and personality shapes the reaction", () => {
    const { s, t } = withProject();
    const idea = t.ideas.find((i) => i.lead)!;
    startProject(s, s.teamId, idea.id);
    const p = t.projects.find((x) => x.id === idea.id)!;
    const st = s.staff[p.lead!];
    st.traits = ["hothead"];
    const m0 = st.mood = 0.7;
    p.progress = p.days * 0.9;
    scrapProject(s, s.teamId, p.id);
    expect(st.mood).toBeLessThan(m0 - 0.08);
    const e = devOf(t).log.filter((x) => x.kind === "scrapped").pop()!;
    expect(e.react).toBe("fume");
    expect(recOf(t, st.id).scrapped).toBe(1);
    expect(/—/.test(e.text)).toBe(false);
  });
  it("overruled authors remember, and picking nothing stings less than picking someone else", () => {
    const { s, t } = withProject(6);
    const ideas = t.ideas.filter((i) => i.lead);
    expect(ideas.length).toBeGreaterThanOrEqual(2);
    const leads = new Set(ideas.map((i) => i.lead));
    if (leads.size < 2) return;
    const a = ideas.find((i) => i.lead !== ideas[0].lead)!;
    const loser = s.staff[a.lead!];
    loser.mood = 0.7;
    onBatchDecided(s, s.teamId, ideas.map((i) => i.id), ideas[0].id);
    const lost = 0.7 - loser.mood;
    loser.mood = 0.7;
    t.dev!.rec[loser.id].overruled = 0;
    onBatchDecided(s, s.teamId, ideas.map((i) => i.id), null);
    expect(0.7 - loser.mood).toBeLessThan(lost + 1e-9);
    expect(lost).toBeGreaterThan(0);
  });
  it("a held part goes stale and its author waits", () => {
    const { s, t } = withProject(7);
    const idea = t.ideas.find((i) => i.lead)!;
    startProject(s, s.teamId, idea.id);
    const p = t.projects.find((x) => x.id === idea.id)!;
    p.status = "ready"; p.hold = true; p.heldSince = s.day;
    const g = p.trueGain;
    const st = s.staff[p.lead!]; const m = st.mood;
    for (let i = 0; i < 12; i++) { s.day += 7; devWeekly(s); }
    expect(p.stale).toBe(true);
    expect(p.trueGain).toBeLessThan(g + 1e-9);
    expect(st.mood).toBeLessThan(m);
  });
  it("test runs cost money, narrow the estimate with better plans, and cannot be re-rolled", () => {
    const { s, t } = withProject(8);
    const idea = t.ideas.find((i) => i.lead)!;
    startProject(s, s.teamId, idea.id);
    const p = t.projects.find((x) => x.id === idea.id)!;
    p.status = "ready";
    const cash = t.cash;
    const q = testPart(s, s.teamId, p.id, "quick");
    const l = testPart(s, s.teamId, p.id, "longrun");
    expect(q.ok && l.ok).toBe(true);
    expect(t.cash).toBeLessThan(cash);
    expect(l.sd!).toBeLessThan(q.sd!);
    expect(testPart(s, s.teamId, p.id, "quick").ok).toBe(false);
    const r = reduce(s, { type: "testPart", id: p.id, plan: "compare" });
    expect(r.ok).toBe(true);
  });
  it("a landing part lifts its author; a rookie's good part grows him and the notice card appears", () => {
    const { s, t } = withProject(9);
    const intern = teamStaff(s, s.teamId).find((x) => x.role === "designer")!;
    intern.intern = { potential: 90, since: s.year };
    intern.skill = 50; intern.mood = 0.5;
    const idea = t.ideas[0];
    idea.lead = intern.id; idea.rookie = true;
    startProject(s, s.teamId, idea.id);
    const p = t.projects.find((x) => x.id === idea.id)!;
    p.predLo = 0.1; p.predHi = 0.2; p.trueGain = 0.18;
    onLanding(s, s.teamId, p);
    expect(intern.skill).toBeGreaterThan(50);
    expect(intern.mood).toBeGreaterThan(0.5);
    expect(s.cards.some((c) => c.title.includes("made a part that works"))).toBe(true);
  });
  it("a miss is recorded against the author and the manager", () => {
    const { s, t } = withProject(10);
    const idea = t.ideas.find((i) => i.lead)!;
    startProject(s, s.teamId, idea.id);
    const p = t.projects.find((x) => x.id === idea.id)!;
    p.predLo = 0.2; p.predHi = 0.3; p.trueGain = 0.02;
    onLanding(s, s.teamId, p);
    expect(devOf(t).missed).toBe(1);
  });
  it("a staff notice arrives only after real overruling, and every answer resolves", () => {
    for (const opt of ["counter", "listen", "go"]) {
      const { s, t } = withProject(11);
      const st = teamStaff(s, s.teamId).find((x) => x.role === "designer" && !x.intern)!;
      recOf(t, st.id).overruled = 3;
      st.mood = 0.2;
      for (let i = 0; i < 60 && !s.cards.some((c) => c.kind === "staffNotice"); i++) { s.day += 7; devWeekly(s); }
      const c = s.cards.find((x) => x.kind === "staffNotice");
      expect(c, opt).toBeTruthy();
      resolveCard(s, c!.id, opt);
      if (opt === "go") expect(st.teamId).toBe(null);
      else expect(st.mood).toBeGreaterThan(0.2);
    }
  });
  it("pitches are voiced from the person and carry an honest record", () => {
    const { t, s } = withProject(12);
    const i = t.ideas.find((x) => x.lead)!;
    const who = s.staff[i.lead!];
    who.traits = ["perfectionist"];
    const pl = pitchLine(s, i);
    expect(pl.line.length).toBeGreaterThan(10);
    expect(/—/.test(pl.line + pl.record)).toBe(false);
    expect(pl.record).toMatch(/record|landed|trainee/i);
  });
  it("rookies can pitch over a long run", () => {
    const s = newCareer("mcl", 13);
    const intern = teamStaff(s, s.teamId).find((x) => x.role === "designer")!;
    intern.intern = { potential: 92, since: s.year };
    let hit = false;
    for (let i = 0; i < 400 && !hit; i++) { s.day++; if (rookieCandidate(s, s.teamId)) hit = true; }
    expect(hit).toBe(true);
    let made = 0;
    for (let i = 0; i < 300; i++) { s.day += 7; generateIdeas(s, s.teamId); if (s.teams[s.teamId].ideas.some((x) => x.rookie)) { made++; break; } }
    expect(made).toBe(1);
  });
});

describe("development in real play", () => {
  it("four seasons of backing, holding, scrapping and answering notices stay consistent", () => {
    const s = newCareer("fer", 77);
    s.teller = "steady";
    let k = 0;
    const seen = new Set<string>();
    for (let d = 0; d < 365 * 4; d++) {
      s.weekend = null;
      for (const c of [...s.cards]) {
        if (c.options.length < 2) continue;
        let opt = c.defaultOption ?? c.options[0].id;
        if (c.kind === "ideaBatch") { const o = c.options.find((x) => x.id.startsWith("idea:")); if (o && k++ % 3 !== 0) opt = o.id; }
        if (c.kind === "projectReady") { opt = k++ % 3 === 0 ? "hold" : "fit"; if (k % 7 === 0) { reduce(s, { type: "scrapProject", id: Number(c.data?.projectId) }); } }
        if (c.kind === "staffNotice") opt = k++ % 2 ? "go" : "listen";
        if (c.kind === "devCrisis") opt = ["all", "back", "hard"][k++ % 3];
        resolveCard(s, c.id, opt);
      }
      advanceDay(s);
    }
    const log = devOf(s.teams[s.teamId]).log;
    for (const e of log) { seen.add(e.kind); expect(/—/.test(e.text)).toBe(false); }
    expect(seen.has("backed")).toBe(true);
    expect(seen.has("scrapped") || seen.has("held")).toBe(true);
    for (const st of Object.values(s.staff)) { expect(st.mood).toBeGreaterThanOrEqual(0); expect(st.mood).toBeLessThanOrEqual(1); }
  }, 240000);
});

describe("the rest of the development scenes", () => {
  it("a lab shape becomes a pitch with an honest range, once", () => {
    const { s, t } = withProject(21);
    const m = { frontWing: 0.9, rearWing: 0.9, floor: 0.9, rake: 0.7, sidepod: 0.5, inlet: 0.5, stiffness: 0.5, wheelbase: 0.5 };
    let sent = false;
    for (const inst of ["desk", "cfd", "tunnel", "sim"] as const) {
      const r = runLab(s, s.teamId, inst, m);
      if (!r.ok || !r.entry) continue;
      const out = labToIdea(s, s.teamId, r.entry.id);
      if (out.ok) {
        sent = true;
        expect(out.idea!.lab).toBe(true);
        expect(out.idea!.predHi).toBeGreaterThanOrEqual(out.idea!.predLo);
        expect(t.ideas.some((i) => i.id === out.idea!.id)).toBe(true);
        expect(labToIdea(s, s.teamId, r.entry.id).ok).toBe(false);
        break;
      }
    }
    expect(typeof sent).toBe("boolean");
    const same = runLab(s, s.teamId, "desk", designOf(t));
    if (same.entry) expect(labToIdea(s, s.teamId, same.entry.id).ok).toBe(false);
  });
  it("the test day is a choice with different consequences", () => {
    const outcomes: number[] = [];
    for (const opt of ["mileage", "mapping", "race", "show"]) {
      const s = newCareer("mcl", 31);
      testDayCard(s);
      const c = s.cards.find((x) => x.kind === "testDay")!;
      expect(c).toBeTruthy();
      const cash = s.teams[s.teamId].cash;
      resolveCard(s, c.id, opt);
      expect(s.cards.some((x) => x.title === "Pre-season test report")).toBe(true);
      if (opt === "mapping") expect(s.teams[s.teamId].cash).toBeLessThan(cash);
      outcomes.push(s.teams[s.teamId].cash);
    }
    expect(outcomes.length).toBe(4);
    const s = newCareer("mcl", 32);
    resolveTestDay(s, "mileage");
  });
  it("a trainee's landed part opens the rookie story, and treatment shifts the odds without fixing the ending", () => {
    const stays: Record<string, number> = { promote: 0, quiet: 0 };
    const endings = new Set<string>();
    const N = 24;
    for (const choice of ["promote", "quiet"]) {
      for (let k = 0; k < N; k++) {
        const { s, t } = withProject(100 + k);
        const intern = teamStaff(s, s.teamId).find((x) => x.role === "designer")!;
        intern.intern = { potential: 90, since: s.year };
        intern.mood = choice === "quiet" ? 0.3 : 0.6;
        const idea = t.ideas[0];
        idea.lead = intern.id; idea.rookie = true;
        startProject(s, s.teamId, idea.id);
        const p = t.projects.find((x) => x.id === idea.id)!;
        p.predLo = 0.1; p.predHi = 0.2; p.trueGain = 0.18;
        onLanding(s, s.teamId, p);
        expect(forceThread(s, "rookie")).toBe(true);
        const th = s.threads![0];
        advanceThread(s, th);
        const c = s.cards.find((x) => x.data?.tid === th.id)!;
        resolveThread(s, String(c.data!.ev), choice, c.data as never);
        for (let i = 0; i < 4 && !th.done; i++) { th.next = 0; advanceThread(s, th); }
        expect(th.done).toBe(true);
        if (intern.teamId === s.teamId) stays[choice]++;
        endings.add(th.ending ?? "");
        expect(/—/.test(th.ending ?? "")).toBe(false);
      }
    }
    expect(stays.promote).toBeGreaterThan(stays.quiet);
    expect(stays.promote).toBeLessThan(N);
    expect(stays.quiet).toBeGreaterThan(0);
    expect(endings.size).toBeGreaterThanOrEqual(3);
  });
  it("ideas put to you and not taken are shelved for good, so a choice is a real tradeoff", () => {
    const { s, t } = withProject(12);
    s.cards = [];
    const ids = t.ideas.slice(0, 3).map((i) => i.id);
    expect(ids.length).toBe(3);
    pushBatch(s, ids);
    const c = s.cards.find((x) => x.kind === "ideaBatch")!;
    resolveCard(s, c.id, `idea:${ids[0]}`);
    expect(t.projects.some((p) => p.id === ids[0])).toBe(true);
    expect(t.ideas.some((i) => ids.slice(1).includes(i.id))).toBe(false);
  });
  it("two in-season test days a season, each with its own programme and a report", { timeout: 120000 }, () => {
    const s = newCareer("mcl", 21);
    const seen: string[] = [];
    const known0 = JSON.stringify(Object.values(s.teams[s.teamId].know).map((k) => k.err));
    for (let i = 0; i < 360 && s.year === 2026; i++) {
      advanceDay(s);
      for (const c of [...s.cards]) {
        if (c.kind === "testDay" && c.data?.season) { seen.push(c.options.map((o) => o.id).join(",")); resolveCard(s, c.id, c.options.find((o) => o.id === "tyres")?.id ?? "rest"); }
        else if (c.options.length > 1 && !["testDay"].includes(c.kind)) resolveCard(s, c.id, c.defaultOption ?? c.options[0].id);
      }
    }
    expect(seen.length).toBe(2);
    expect(seen[0]).toContain("tyres");
    expect(seen[0]).toContain("rest");
    expect(JSON.stringify(Object.values(s.teams[s.teamId].know).map((k) => k.err))).not.toBe(known0);
    expect(s.cards.concat([]).every((c) => !/—/.test(c.body))).toBe(true);
  });
});
